// tva
/*
 * mcp.js -- MCP server adapter for the Web Resource Ledger Worker
 *
 * Exposes four tools (capture_url, get_capture, list_captures, verify_capture)
 * via the MCP Streamable HTTP transport, stateless mode.
 *
 * Auth: Bearer API key is checked BEFORE the MCP transport is constructed.
 * All tool handlers call existing business logic directly -- no HTTP self-calls.
 *
 * Transport: WebStandardStreamableHTTPServerTransport (Web Standard APIs,
 * works on Cloudflare Workers, Deno, Bun, Node.js 18+).
 *
 * Session model: stateless (sessionIdGenerator: undefined). Each POST is an
 * independent JSON-RPC exchange. enableJsonResponse: true avoids SSE streams
 * for simple request/response interactions.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { verifyApiKey, hasScope } from './auth.js';
import { validateUrl } from './url-validation.js';
import { createCapture, getCapture, failCapture, listCaptures, getTenantConfig } from './db.js';
import { rateLimitCounter } from './kv.js';
import { performVerification } from './verify.js';
import { log } from './log.js';
import { getEffectiveLimit } from './rate-limits.js';

// ---------------------------------------------------------------------------
// MCP server factory
// ---------------------------------------------------------------------------

/**
 * Creates and configures an McpServer instance with all four WRL tools.
 * Called once per request (stateless mode).
 *
 * @param {object} env   - Cloudflare Worker env bindings
 * @param {object} ctx   - ExecutionContext
 * @param {object} auth  - Verified auth result from verifyApiKey
 * @param {string} origin - Request origin (e.g. 'https://api.webresourceledger.com')
 * @returns {McpServer}
 */
function createMcpServer(env, ctx, auth, origin) {
  const server = new McpServer({
    name: 'web-resource-ledger',
    version: '0.1.0',
  });

  // -------------------------------------------------------------------------
  // Tool: capture_url
  // -------------------------------------------------------------------------

  server.tool(
    'capture_url',
    'Capture a web page as tamper-evident evidence. Takes a screenshot, saves rendered HTML and HTTP headers, and creates a cryptographically signed WACZ bundle with Ed25519 signature and RFC 3161 timestamp. Returns a capture ID — use get_capture to check progress. Typically completes in 5-15 seconds. If still pending after 30 seconds, the capture may have failed.',
    { url: z.string().describe('The URL to capture (http:// or https://).') },
    async ({ url }) => {
      // Step 1: Scope check
      if (!hasScope(auth.scopes, 'capture')) {
        return {
          isError: true,
          content: [{ type: 'text', text: "Insufficient scope: API key does not grant 'capture' scope." }],
        };
      }

      // Step 2: Rate limit check (CF ceiling + KV counter) -- before DNS resolution
      // MCP requests don't carry CF-Connecting-IP; skip IP guard
      if (env.CAPTURE_RATE_LIMITER) {
        const { success } = await env.CAPTURE_RATE_LIMITER.limit({ key: auth.tenantId });
        if (!success) {
          ctx.waitUntil(log(env, 4, 'security', {
            event: 'security.rate_limit',
            limiter: 'capture_per_tenant',
            tenantId: auth.tenantId,
            keyName: auth.keyName,
            keyHashPrefix: auth.keyHashPrefix,
            authMethod: auth.authMethod,
            responseStatus: 429,
            via: 'mcp',
          }) ?? Promise.resolve());
          return {
            isError: true,
            content: [{ type: 'text', text: 'Rate limit exceeded. Try again in 60 seconds.' }],
          };
        }
      }
      // Per-tenant KV counter (respects custom overrides)
      {
        const tenantConfig = await getTenantConfig(env.DB, auth.tenantId);
        const effective = getEffectiveLimit(tenantConfig, 'capture');
        const counter = await rateLimitCounter(env.KV, auth.tenantId, 'capture', effective.limit, effective.period);
        ctx.waitUntil(counter.writePromise);
        if (counter.exceeded) {
          ctx.waitUntil(log(env, 4, 'security', {
            event: 'security.rate_limit',
            limiter: 'capture_per_tenant',
            tenantId: auth.tenantId,
            keyName: auth.keyName,
            keyHashPrefix: auth.keyHashPrefix,
            authMethod: auth.authMethod,
            responseStatus: 429,
            via: 'mcp',
          }) ?? Promise.resolve());
          return {
            isError: true,
            content: [{ type: 'text', text: `Rate limit exceeded. Try again in ${counter.resetIn} seconds.` }],
          };
        }
      }
      if (env.GLOBAL_CAPTURE_LIMITER) {
        const { success } = await env.GLOBAL_CAPTURE_LIMITER.limit({ key: 'global' });
        if (!success) {
          ctx.waitUntil(log(env, 4, 'security', {
            event: 'security.capacity_limit',
            tenantId: auth.tenantId,
            keyName: auth.keyName,
            keyHashPrefix: auth.keyHashPrefix,
            authMethod: auth.authMethod,
            responseStatus: 503,
            via: 'mcp',
          }) ?? Promise.resolve());
          return {
            isError: true,
            content: [{ type: 'text', text: 'Service is at capacity. Retry in 10 seconds.' }],
          };
        }
      }

      // Step 3: URL validation (SSRF prevention)
      const result = await validateUrl(url);
      if (!result.ok) {
        ctx.waitUntil(log(env, 5, 'security', {
          event: 'security.ssrf_block',
          tenantId: auth.tenantId,
          keyName: auth.keyName,
          keyHashPrefix: auth.keyHashPrefix,
          authMethod: auth.authMethod,
          responseStatus: result.status,
          reason: result.detail.startsWith('URL scheme') ? 'url_scheme_not_allowed' : result.detail,
          via: 'mcp',
        }) ?? Promise.resolve());
        return {
          isError: true,
          content: [{ type: 'text', text: `Invalid URL: ${result.detail}` }],
        };
      }

      // Step 4: Generate capture ID
      const captureId = 'cap_' + crypto.randomUUID().replace(/-/g, '');

      // Step 5: Write pending record to KV
      try {
        await createCapture(env.DB, captureId, result.url, result.ip, auth.tenantId);
      } catch (err) {
        ctx.waitUntil(log(env, 5, 'capture', {
          event: 'capture.kv_create_fail',
          captureId,
          tenantId: auth.tenantId,
          keyName: auth.keyName,
          keyHashPrefix: auth.keyHashPrefix,
          authMethod: auth.authMethod,
          responseStatus: 500,
          errorMessage: String(err?.message ?? '').slice(0, 256),
          via: 'mcp',
        }) ?? Promise.resolve());
        return {
          isError: true,
          content: [{ type: 'text', text: 'Could not create capture record. Please try again.' }],
        };
      }

      // Step 6: Dispatch to queue
      try {
        await env.CAPTURE_QUEUE.send({
          captureId, url: result.url, ip: result.ip, tenantId: auth.tenantId, cip: 'mcp',
          enqueuedAt: Date.now(),
        });
      } catch (err) {
        await failCapture(env.DB, captureId, 'Queue dispatch failed', true);
        ctx.waitUntil(log(env, 5, 'capture', {
          event: 'capture.enqueue_fail', captureId, tenantId: auth.tenantId, cip: 'mcp',
          errorMessage: String(err?.message ?? '').slice(0, 256),
        }) ?? Promise.resolve());
        return {
          isError: true,
          content: [{ type: 'text', text: 'Could not dispatch capture. Please try again.' }],
        };
      }

      // Step 7: Log capture.accepted
      ctx.waitUntil(log(env, 3, 'capture', {
        event: 'capture.accepted',
        captureId,
        tenantId: auth.tenantId,
        keyName: auth.keyName,
        keyHashPrefix: auth.keyHashPrefix,
        authMethod: auth.authMethod,
        responseStatus: 202,
        url: result.url,
        via: 'mcp',
      }) ?? Promise.resolve());

      // URL sanitization: strip fragment, truncate to 200 chars
      const displayUrl = result.url.replace(/#.*$/, '').slice(0, 200);

      return {
        content: [{
          type: 'text',
          text: [
            `Capture submitted for: ${displayUrl}`,
            `Capture ID: ${captureId}`,
            '',
            'Use get_capture to check status. Captures typically complete in 5-15 seconds.',
            `Status URL: ${origin}/v1/captures/${captureId}/status`,
          ].join('\n'),
        }],
      };
    },
  );

  // -------------------------------------------------------------------------
  // Tool: get_capture
  // -------------------------------------------------------------------------

  server.tool(
    'get_capture',
    'Get the status and details of a capture by ID. Returns status (pending, complete, failed) and when complete includes artifact URLs for screenshot, HTML, WACZ bundle, and a verification link. No additional auth scope needed beyond the route-level read scope.',
    { capture_id: z.string().describe('The capture ID (format: cap_ followed by 32 hex characters).') },
    async ({ capture_id: captureId }) => {
      const record = await getCapture(env.DB, captureId);

      if (!record) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Capture not found: ${captureId}` }],
        };
      }

      if (record.status === 'pending') {
        return {
          content: [{
            type: 'text',
            text: [
              `Capture ${captureId} is pending.`,
              `URL: ${record.url}`,
              `Created: ${record.createdAt}`,
              '',
              'Check again in a few seconds.',
            ].join('\n'),
          }],
        };
      }

      if (record.status === 'failed') {
        return {
          content: [{
            type: 'text',
            text: [
              `Capture ${captureId} failed.`,
              `URL: ${record.url}`,
              `Created: ${record.createdAt}`,
              `Failed: ${record.failedAt}`,
              `Error: ${record.error}`,
              `Retryable: ${record.retryable}`,
            ].join('\n'),
          }],
        };
      }

      // complete
      const artifactBase = `${origin}/v1/captures/${captureId}/artifacts`;
      const lines = [
        `Capture ${captureId} is complete.`,
        `URL: ${record.url}`,
        `Created: ${record.createdAt}`,
        `Completed: ${record.completedAt}`,
        `Render quality: ${record.renderQuality ?? 'full'}`,
        '',
        'Artifacts:',
        `  Screenshot: ${artifactBase}/screenshot`,
        `  HTML: ${artifactBase}/html`,
      ];

      if (record.artifacts?.headers) {
        lines.push(`  Headers: ${artifactBase}/headers`);
      }
      if (record.artifacts?.screenshotBefore) {
        lines.push(`  Screenshot (before consent): ${artifactBase}/screenshot-before`);
      }

      if (record.wacz) {
        lines.push(`  WACZ bundle: ${artifactBase}/wacz (${record.wacz.size} bytes)`);
        lines.push('');
        lines.push(`Verify integrity: ${origin}/v1/verify/${captureId}`);
        lines.push('  Or use the verify_capture tool with this capture ID.');
      }

      return {
        content: [{ type: 'text', text: lines.join('\n') }],
      };
    },
  );

  // -------------------------------------------------------------------------
  // Tool: list_captures
  // -------------------------------------------------------------------------

  server.tool(
    'list_captures',
    'List your recent captures with optional filters. Returns summaries in reverse chronological order (newest first by default). Supports filtering by status, URL prefix, date range, and custom sort. Use offset for pagination. Use get_capture with a specific ID for full details.',
    {
      status: z.enum(['pending', 'complete', 'failed']).optional().describe('Filter by capture status.'),
      limit: z.number().int().min(1).max(100).optional().default(20).describe('Maximum number of captures to return (1-100, default 20).'),
      offset: z.number().int().min(0).optional().describe('Number of captures to skip for pagination (default 0).'),
      url: z.string().optional().describe('Filter captures whose URL starts with this prefix (min 4 characters).'),
      created_after: z.string().optional().describe('Filter captures created after this ISO 8601 timestamp.'),
      created_before: z.string().optional().describe('Filter captures created before this ISO 8601 timestamp.'),
      sort: z.enum(['created_at', '-created_at']).optional().describe('Sort order: -created_at (newest first, default) or created_at (oldest first).'),
    },
    async ({ status, limit = 20, offset = 0, url, created_after, created_before, sort = '-created_at' }) => {
      let result;
      try {
        result = await listCaptures(env.DB, auth.tenantId, { offset, limit, status, url, created_after, created_before, sort });
      } catch (err) {
        ctx.waitUntil(log(env, 5, 'capture', {
          event: 'capture.list_fail',
          tenantId: auth.tenantId,
          keyName: auth.keyName,
          keyHashPrefix: auth.keyHashPrefix,
          authMethod: auth.authMethod,
          responseStatus: 500,
          errorClass: err.constructor.name,
          via: 'mcp',
        }) ?? Promise.resolve());
        return {
          isError: true,
          content: [{ type: 'text', text: 'Could not list captures. Please try again.' }],
        };
      }

      const { data, pagination } = result;

      if (data.length === 0) {
        const filterDesc = status ? ` with status '${status}'` : '';
        return {
          content: [{ type: 'text', text: `No captures found${filterDesc}.` }],
        };
      }

      const lines = [`Found ${data.length} capture(s)${status ? ` (status: ${status})` : ''} (${pagination.total} total):`];

      for (const r of data) {
        // Strip fragment, truncate to 80 chars for list output
        const displayUrl = r.url.replace(/#.*$/, '').slice(0, 80);
        const urlSuffix = r.url.replace(/#.*$/, '').length > 80 ? '...' : '';
        lines.push('');
        lines.push(`  ID: ${r.captureId}`);
        lines.push(`  URL: ${displayUrl}${urlSuffix}`);
        lines.push(`  Status: ${r.status}`);
        lines.push(`  Created: ${r.createdAt}`);

        if (r.status === 'complete') {
          lines.push(`  Completed: ${r.completedAt}`);
          lines.push(`  Render quality: ${r.renderQuality ?? 'full'}`);
        } else if (r.status === 'failed') {
          lines.push(`  Failed: ${r.failedAt}`);
          lines.push(`  Error: ${r.error}`);
        }
      }

      if (pagination.hasMore) {
        lines.push('');
        lines.push(`Next page: pass offset=${offset + data.length} to list_captures for the next page.`);
      }

      return {
        content: [{ type: 'text', text: lines.join('\n') }],
      };
    },
  );

  // -------------------------------------------------------------------------
  // Tool: verify_capture
  // -------------------------------------------------------------------------

  server.tool(
    'verify_capture',
    'Verify the cryptographic integrity of a captured web page. Checks artifact hashes, WACZ bundle hash, Ed25519 signature, and RFC 3161 timestamp. Confirms the evidence has not been tampered with since capture.',
    { capture_id: z.string().describe('The capture ID to verify.') },
    async ({ capture_id: captureId }) => {
      // Rate limit (verify has its own limiter)
      if (env.VERIFY_RATE_LIMITER) {
        const { success } = await env.VERIFY_RATE_LIMITER.limit({ key: auth.tenantId });
        if (!success) {
          ctx.waitUntil(log(env, 4, 'security', {
            event: 'security.rate_limit',
            limiter: 'verify',
            tenantId: auth.tenantId,
            via: 'mcp',
          }) ?? Promise.resolve());
          return {
            isError: true,
            content: [{ type: 'text', text: 'Rate limit exceeded. Try again in 60 seconds.' }],
          };
        }
      }

      const verification = await performVerification(
        { DB: env.DB, BUCKET: env.BUCKET, SIGNING_KEY: env.SIGNING_KEY },
        captureId,
      );

      if (!verification.ok) {
        if (verification.reason === 'not_found') {
          return {
            isError: true,
            content: [{ type: 'text', text: `Capture not found or not yet complete: ${captureId}` }],
          };
        }
        if (verification.reason === 'key_unavailable') {
          ctx.waitUntil(log(env, 5, 'security', {
            event: 'signing.key_unavailable',
            reason: verification.detail,
            captureId,
            via: 'mcp',
          }) ?? Promise.resolve());
          return {
            isError: true,
            content: [{ type: 'text', text: 'Verification service is not configured.' }],
          };
        }
        if (verification.reason === 'r2_missing') {
          const { record } = verification;
          return {
            content: [{
              type: 'text',
              text: [
                `Verification FAILED for capture ${captureId}.`,
                `Captured: ${record.createdAt}`,
                '',
                'Checks:',
                '  artifactHashes: FAIL — WACZ bundle not found in storage',
                '  bundleHash: FAIL — WACZ bundle not found in storage',
                '  signature: FAIL — WACZ bundle not found in storage',
                '',
                'The WACZ bundle was recorded but is missing from storage. This indicates data loss.',
              ].join('\n'),
            }],
          };
        }
        if (verification.reason === 'too_large') {
          return {
            isError: true,
            content: [{ type: 'text', text: 'WACZ bundle exceeds maximum verifiable size (100 MB).' }],
          };
        }
        return {
          isError: true,
          content: [{ type: 'text', text: 'Verification error. Please try again.' }],
        };
      }

      const { record, result } = verification;
      const verdict = result.verified ? 'PASSED' : 'FAILED';

      const lines = [
        `Verification ${verdict} for capture ${captureId}.`,
        `Captured URL: ${record.url}`,
        `Captured: ${record.createdAt}`,
        `Completed: ${record.completedAt}`,
        '',
        'Checks:',
      ];

      for (const check of result.checks) {
        const status = check.status.toUpperCase();
        const detail = check.detail ? ` — ${check.detail}` : '';
        lines.push(`  ${check.name}: ${status}${detail}`);
      }

      if (result.capture) {
        lines.push('');
        lines.push('Signing metadata:');
        if (result.capture.signedAt) lines.push(`  Signed at: ${result.capture.signedAt}`);
        if (result.capture.timestamp) {
          lines.push(`  Timestamp: ${result.capture.timestamp.genTime}`);
          lines.push(`  TSA: ${result.capture.timestamp.tsa}`);
        }
      }

      return {
        content: [{ type: 'text', text: lines.join('\n') }],
      };
    },
  );

  return server;
}

// ---------------------------------------------------------------------------
// Request handler
// ---------------------------------------------------------------------------

/**
 * Handles POST /mcp requests.
 * Auth is checked before the MCP transport is constructed (stateless mode).
 *
 * @param {Request} request
 * @param {object} env
 * @param {object} ctx
 * @returns {Promise<Response>}
 */
export async function handleMcp(request, env, ctx) {
  // Only accept POST for stateless JSON-RPC
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed. Use POST.' },
      id: null,
    }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        Allow: 'POST',
      },
    });
  }

  // Auth check (minimum 'read' scope for any MCP access)
  const auth = await verifyApiKey(request, env, { requiredScope: 'read' });
  if (!auth.ok) {
    ctx.waitUntil(log(env, 5, 'security', {
      event: 'security.auth_fail',
      reason: auth.reason,
      keyHashPrefix: auth.keyHashPrefix || null,
      responseStatus: auth.response.status,
      via: 'mcp',
    }) ?? Promise.resolve());
    return auth.response;
  }

  // Create MCP server and transport per request (stateless mode)
  const origin = new URL(request.url).origin;
  const server = createMcpServer(env, ctx, auth, origin);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless: no session management
    enableJsonResponse: true,      // JSON responses instead of SSE streams
  });

  await server.connect(transport);
  return transport.handleRequest(request);
}
