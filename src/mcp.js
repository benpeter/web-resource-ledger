// tva
/*
 * mcp.js -- MCP server adapter for the Web Resource Ledger Worker
 *
 * Exposes eleven tools via the MCP Streamable HTTP transport, stateless mode:
 *   capture_url, get_capture, list_captures, verify_capture,
 *   batch_capture, diff_captures, get_usage,
 *   list_schedules, create_schedule, delete_schedule, get_certificate
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
import {
  createCapture, getCapture, failCapture, listCaptures, getTenantConfig,
  createSchedule, listSchedules, deleteSchedule,
  countSchedules, getEffectiveScheduleLimit,
} from './db.js';
import { rateLimitCounter } from './kv.js';
import { performVerification } from './verify.js';
import { log } from './log.js';
import { getEffectiveLimit } from './rate-limits.js';
import { checkQuota } from './quotas.js';
import { diffHtml, diffHeaders, diffScreenshot, computeChangeSummary } from './diff.js';
import { validateCron, nextRun } from './cron.js';
import { getSigningKeys } from './signing.js';

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
    version: '0.2.0',
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

  // -------------------------------------------------------------------------
  // Tool: batch_capture
  // -------------------------------------------------------------------------

  server.tool(
    'batch_capture',
    'Submit up to 20 URLs for capture in a single call. Returns a per-item status report showing accepted captures and any rejected URLs with reasons. Typically enqueues in under 2 seconds; each capture then completes in 5-15 seconds. Use get_capture with each returned ID to track progress.',
    { urls: z.array(z.string()).min(1).max(20).describe('Array of URLs to capture (http:// or https://, max 20).') },
    async ({ urls }) => {
      // Step 1: Scope check
      if (!hasScope(auth.scopes, 'capture')) {
        return {
          isError: true,
          content: [{ type: 'text', text: "Insufficient scope: API key does not grant 'capture' scope." }],
        };
      }

      const batchSize = urls.length;

      // Step 2: Tenant rate limit -- charge N slots for N URLs (not 1 slot for the batch)
      if (env.CAPTURE_RATE_LIMITER) {
        // CF rate limiter is called once per URL (per the HTTP batch handler pattern)
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
            batchSize,
            via: 'mcp',
          }) ?? Promise.resolve());
          return {
            isError: true,
            content: [{ type: 'text', text: 'Rate limit exceeded. Try again in 60 seconds.' }],
          };
        }
      }
      // Per-tenant KV counter: charge N slots for N URLs
      {
        const tenantConfig = await getTenantConfig(env.DB, auth.tenantId);
        const effective = getEffectiveLimit(tenantConfig, 'capture');
        const counter = await rateLimitCounter(env.KV, auth.tenantId, 'capture', effective.limit, effective.period, batchSize);
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
            batchSize,
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
            batchSize,
            via: 'mcp',
          }) ?? Promise.resolve());
          return {
            isError: true,
            content: [{ type: 'text', text: 'Service is at capacity. Retry in 10 seconds.' }],
          };
        }
      }

      // Step 3: Validate each URL and enqueue accepted ones
      const results = [];
      let accepted = 0;

      for (const rawUrl of urls) {
        // SSRF validation
        const validation = await validateUrl(rawUrl);
        if (!validation.ok) {
          ctx.waitUntil(log(env, 5, 'security', {
            event: 'security.ssrf_block',
            tenantId: auth.tenantId,
            keyName: auth.keyName,
            keyHashPrefix: auth.keyHashPrefix,
            authMethod: auth.authMethod,
            responseStatus: validation.status,
            reason: validation.detail.startsWith('URL scheme') ? 'url_scheme_not_allowed' : validation.detail,
            via: 'mcp',
          }) ?? Promise.resolve());
          results.push({ status: 'rejected', reason: validation.detail });
          continue;
        }

        // Generate capture ID and create pending record
        const captureId = 'cap_' + crypto.randomUUID().replace(/-/g, '');
        try {
          await createCapture(env.DB, captureId, validation.url, validation.ip, auth.tenantId);
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
          results.push({ status: 'rejected', reason: 'Could not create capture record.' });
          continue;
        }

        // Dispatch to queue
        try {
          await env.CAPTURE_QUEUE.send({
            captureId, url: validation.url, ip: validation.ip,
            tenantId: auth.tenantId, cip: 'mcp', enqueuedAt: Date.now(),
          });
        } catch (err) {
          await failCapture(env.DB, captureId, 'Queue dispatch failed', true);
          ctx.waitUntil(log(env, 5, 'capture', {
            event: 'capture.enqueue_fail', captureId, tenantId: auth.tenantId, cip: 'mcp',
            errorMessage: String(err?.message ?? '').slice(0, 256),
          }) ?? Promise.resolve());
          results.push({ status: 'rejected', reason: 'Could not dispatch capture.' });
          continue;
        }

        ctx.waitUntil(log(env, 3, 'capture', {
          event: 'capture.accepted',
          captureId,
          tenantId: auth.tenantId,
          keyName: auth.keyName,
          keyHashPrefix: auth.keyHashPrefix,
          authMethod: auth.authMethod,
          responseStatus: 202,
          url: validation.url,
          via: 'mcp',
        }) ?? Promise.resolve());

        const displayUrl = validation.url.replace(/#.*$/, '').slice(0, 80);
        const urlSuffix = validation.url.replace(/#.*$/, '').length > 80 ? '...' : '';
        results.push({ status: 'accepted', captureId, url: `${displayUrl}${urlSuffix}` });
        accepted++;
      }

      // Format summary
      const lines = [`${accepted}/${batchSize} URL(s) accepted for capture.`, ''];
      for (const item of results) {
        if (item.status === 'accepted') {
          lines.push(`  [accepted] ${item.captureId} -- ${item.url}`);
        } else {
          lines.push(`  [rejected] ${item.reason}`);
        }
      }
      if (accepted > 0) {
        lines.push('');
        lines.push('Use get_capture with each capture ID to check progress.');
      }

      return {
        content: [{ type: 'text', text: lines.join('\n') }],
      };
    },
  );

  // -------------------------------------------------------------------------
  // Tool: diff_captures
  // -------------------------------------------------------------------------

  server.tool(
    'diff_captures',
    'Compare two complete captures owned by this account and return a structured diff of HTML, screenshot, and HTTP headers. Both captures must be in complete status; pending or failed captures are not eligible. Use the summary to quickly see whether the page changed, then inspect the html or headers sections for details.',
    {
      base_id: z.string().describe('Capture ID of the base (earlier) capture (format: cap_ followed by 32 hex characters).'),
      target_id: z.string().describe('Capture ID of the target (later) capture to compare against the base.'),
    },
    async ({ base_id: baseId, target_id: targetId }) => {
      if (baseId === targetId) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'Cannot diff a capture with itself.' }],
        };
      }

      // Fetch both records
      const [base, target] = await Promise.all([
        getCapture(env.DB, baseId),
        getCapture(env.DB, targetId),
      ]);

      // Tenant isolation: identical 404 for nonexistent and cross-tenant (no enumeration)
      if (!base || base.tenantId !== auth.tenantId) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Capture not found: ${baseId}` }],
        };
      }
      if (!target || target.tenantId !== auth.tenantId) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Capture not found: ${targetId}` }],
        };
      }

      if (base.status === 'quarantined' || target.status === 'quarantined') {
        return {
          isError: true,
          content: [{ type: 'text', text: 'Capture artifacts restricted due to content security policy.' }],
        };
      }

      if (base.status !== 'complete') {
        return {
          isError: true,
          content: [{ type: 'text', text: `Base capture is not complete (status: ${base.status}).` }],
        };
      }
      if (target.status !== 'complete') {
        return {
          isError: true,
          content: [{ type: 'text', text: `Target capture is not complete (status: ${target.status}).` }],
        };
      }

      // Fetch HTML artifacts for diffing (with size guard)
      const SIZE_GUARD = 2 * 1024 * 1024;
      let baseHtml = '';
      let targetHtml = '';
      let htmlTruncated = false;

      const baseHtmlKey = base.artifacts?.html;
      const targetHtmlKey = target.artifacts?.html;

      if (baseHtmlKey && targetHtmlKey) {
        const [baseMeta, targetMeta] = await Promise.all([
          env.BUCKET.head(baseHtmlKey),
          env.BUCKET.head(targetHtmlKey),
        ]);
        if ((baseMeta?.size ?? 0) > SIZE_GUARD || (targetMeta?.size ?? 0) > SIZE_GUARD) {
          htmlTruncated = true;
        } else {
          const [baseObj, targetObj] = await Promise.all([
            env.BUCKET.get(baseHtmlKey),
            env.BUCKET.get(targetHtmlKey),
          ]);
          if (baseObj) baseHtml = await baseObj.text();
          if (targetObj) targetHtml = await targetObj.text();
        }
      }

      // Fetch headers artifacts
      let baseHeadersRaw = null;
      let targetHeadersRaw = null;
      const baseHeadersKey = base.artifacts?.headers;
      const targetHeadersKey = target.artifacts?.headers;
      const [baseHeadersObj, targetHeadersObj] = await Promise.all([
        baseHeadersKey ? env.BUCKET.get(baseHeadersKey) : Promise.resolve(null),
        targetHeadersKey ? env.BUCKET.get(targetHeadersKey) : Promise.resolve(null),
      ]);
      if (baseHeadersObj) {
        try { baseHeadersRaw = JSON.parse(await baseHeadersObj.text()); }
        catch { /* parse failure: treat as missing */ }
      }
      if (targetHeadersObj) {
        try { targetHeadersRaw = JSON.parse(await targetHeadersObj.text()); }
        catch { /* parse failure: treat as missing */ }
      }

      // Screenshot comparison via R2 etag (hash-only, never fetch full bodies)
      const baseScreenshotKey = base.artifacts?.screenshot;
      const targetScreenshotKey = target.artifacts?.screenshot;
      const [baseSsMeta, targetSsMeta] = await Promise.all([
        baseScreenshotKey ? env.BUCKET.head(baseScreenshotKey) : Promise.resolve(null),
        targetScreenshotKey ? env.BUCKET.head(targetScreenshotKey) : Promise.resolve(null),
      ]);
      const baseScreenshotHash = baseSsMeta?.etag ?? null;
      const targetScreenshotHash = targetSsMeta?.etag ?? null;

      // Compute diffs
      const htmlDiff = htmlTruncated
        ? { changed: true, truncated: true, stats: { additions: 0, deletions: 0 }, hunks: [] }
        : diffHtml(baseHtml, targetHtml);
      const headersDiff = diffHeaders(baseHeadersRaw, targetHeadersRaw);
      const screenshotDiff = diffScreenshot(baseScreenshotHash, targetScreenshotHash);
      const summary = computeChangeSummary(htmlDiff, headersDiff, screenshotDiff);

      // Format text output
      const lines = [
        `Diff: ${baseId} → ${targetId}`,
        `Base URL:   ${base.url}`,
        `Target URL: ${target.url}`,
        `Overall changed: ${summary.changed ? 'YES' : 'NO'}`,
        '',
        'Summary:',
        `  HTML:       ${summary.html.changed ? `changed (+${summary.html.additions} -${summary.html.deletions}${htmlTruncated ? ', truncated -- files too large' : ''})` : 'unchanged'}`,
        `  Screenshot: ${summary.screenshot.changed ? 'changed' : 'unchanged'}`,
        `  Headers:    ${summary.headers.changed ? `changed (${summary.headers.changes} field(s))` : 'unchanged'}`,
      ];

      if (headersDiff.statusChanged) {
        lines.push(`  Status code changed.`);
      }
      if (headersDiff.added?.length > 0) {
        lines.push('');
        lines.push('Headers added:');
        for (const h of headersDiff.added) lines.push(`  + ${h.name}: ${h.targetValue}`);
      }
      if (headersDiff.removed?.length > 0) {
        lines.push('');
        lines.push('Headers removed:');
        for (const h of headersDiff.removed) lines.push(`  - ${h.name}: ${h.baseValue}`);
      }
      if (headersDiff.modified?.length > 0) {
        lines.push('');
        lines.push('Headers modified:');
        for (const h of headersDiff.modified) {
          lines.push(`  ~ ${h.name}`);
          lines.push(`      was: ${h.baseValue}`);
          lines.push(`      now: ${h.targetValue}`);
        }
      }

      if (htmlDiff.changed && !htmlTruncated && htmlDiff.hunks?.length > 0) {
        lines.push('');
        lines.push(`HTML hunks (${htmlDiff.hunks.length}${htmlDiff.truncated ? ', truncated' : ''}):`);
        for (const hunk of htmlDiff.hunks.slice(0, 10)) {
          lines.push(`  @@ base:${hunk.baseLine} target:${hunk.targetLine} @@`);
          for (const line of hunk.lines.slice(0, 5)) {
            const prefix = line.type === 'addition' ? '+' : line.type === 'deletion' ? '-' : ' ';
            lines.push(`  ${prefix} ${line.content.slice(0, 120).replace(/\n$/, '')}`);
          }
        }
        if (htmlDiff.hunks.length > 10) {
          lines.push(`  ... and ${htmlDiff.hunks.length - 10} more hunk(s).`);
        }
      }

      ctx.waitUntil(log(env, 3, 'diff', {
        event: 'diff.computed',
        tenantId: auth.tenantId,
        captureId1: baseId,
        captureId2: targetId,
        changed: summary.changed,
        via: 'mcp',
      }) ?? Promise.resolve());

      return {
        content: [{ type: 'text', text: lines.join('\n') }],
      };
    },
  );

  // -------------------------------------------------------------------------
  // Tool: get_usage
  // -------------------------------------------------------------------------

  server.tool(
    'get_usage',
    'Return current-period quota usage for this account, including capture count, storage bytes, billing status, and reset date. No additional scope is required beyond the read scope used for MCP access. Use this to check remaining quota before submitting large batches.',
    {},
    async () => {
      const result = await checkQuota(env.DB, auth.tenantId, 0);

      if (!result.allowed && result.reason === 'tenant_not_found') {
        return {
          isError: true,
          content: [{ type: 'text', text: 'Tenant not found.' }],
        };
      }

      const captureCount = result.captureCount ?? 0;
      const storageBytes = result.storageBytes ?? 0;
      const billingStatus = result.billingStatus ?? 'active';
      const hasPaymentMethod = Boolean(result.hasPaymentMethod);
      const captureLimit = result.quota?.capturesPerMonth;
      const storageLimit = result.quota?.storageBytes;
      const period = result.period ?? '(unknown)';

      const publicBillingStatus = (billingStatus === 'active' && !hasPaymentMethod) ? 'free' : billingStatus;

      const capLimitText = (captureLimit === undefined || captureLimit === Infinity || hasPaymentMethod)
        ? 'unlimited'
        : String(captureLimit);
      const storLimitText = (storageLimit === undefined || storageLimit === Infinity || hasPaymentMethod)
        ? 'unlimited'
        : `${Math.round(storageLimit / (1024 * 1024))} MB`;

      const lines = [
        `Usage for: ${auth.tenantId}`,
        `Period: ${period}`,
        `Billing status: ${publicBillingStatus}`,
        `Payment method on file: ${hasPaymentMethod ? 'yes' : 'no'}`,
        '',
        `Captures used:   ${captureCount} / ${capLimitText}`,
        `Storage used:    ${Math.round(storageBytes / 1024)} KB / ${storLimitText}`,
      ];

      if (!result.allowed && result.reason === 'billing_blocked') {
        lines.push('');
        lines.push('Account is blocked. Contact support to restore access.');
      }

      return {
        content: [{ type: 'text', text: lines.join('\n') }],
      };
    },
  );

  // -------------------------------------------------------------------------
  // Tool: list_schedules
  // -------------------------------------------------------------------------

  server.tool(
    'list_schedules',
    'List all scheduled captures registered for this account, including their URL, cron expression, and next scheduled run time. Requires capture scope. Use create_schedule to add a new schedule or delete_schedule to remove one.',
    {},
    async () => {
      if (!hasScope(auth.scopes, 'capture')) {
        return {
          isError: true,
          content: [{ type: 'text', text: "Insufficient scope: API key does not grant 'capture' scope." }],
        };
      }

      let records;
      try {
        records = await listSchedules(env.DB, auth.tenantId);
      } catch (err) {
        ctx.waitUntil(log(env, 5, 'schedule', {
          event: 'schedule.list_fail',
          tenantId: auth.tenantId,
          keyName: auth.keyName,
          keyHashPrefix: auth.keyHashPrefix,
          authMethod: auth.authMethod,
          errorClass: err.constructor.name,
          responseStatus: 500,
          via: 'mcp',
        }) ?? Promise.resolve());
        return {
          isError: true,
          content: [{ type: 'text', text: 'Could not list schedules. Please try again.' }],
        };
      }

      if (records.length === 0) {
        return {
          content: [{ type: 'text', text: 'No schedules found. Use create_schedule to add one.' }],
        };
      }

      const lines = [`${records.length} schedule(s):`];
      for (const r of records) {
        const displayUrl = (r.url ?? '').replace(/#.*$/, '').slice(0, 80);
        lines.push('');
        lines.push(`  ID:       ${r.id}`);
        lines.push(`  Name:     ${r.name}`);
        lines.push(`  URL:      ${displayUrl}`);
        lines.push(`  Cron:     ${r.cron}`);
        lines.push(`  Next run: ${r.nextRunAt ?? 'unknown'}`);
        lines.push(`  Created:  ${r.createdAt}`);
      }

      return {
        content: [{ type: 'text', text: lines.join('\n') }],
      };
    },
  );

  // -------------------------------------------------------------------------
  // Tool: create_schedule
  // -------------------------------------------------------------------------

  server.tool(
    'create_schedule',
    'Register a recurring capture schedule for a URL using a cron expression. Requires capture scope; minimum interval is hourly. Returns the new schedule ID and next scheduled run time. Use list_schedules to see all schedules or delete_schedule to remove one.',
    {
      url: z.string().describe('The URL to capture on each scheduled run (http:// or https://).'),
      name: z.string().min(1).max(128).describe('A human-readable name for this schedule (1-128 characters, letters, digits, spaces, and _ . : - only).'),
      cron: z.string().describe('Cron expression defining the capture frequency (e.g. "0 * * * *" for hourly). Minimum interval: 1 hour.'),
    },
    async ({ url, name, cron }) => {
      // Scope check
      if (!hasScope(auth.scopes, 'capture')) {
        return {
          isError: true,
          content: [{ type: 'text', text: "Insufficient scope: API key does not grant 'capture' scope." }],
        };
      }

      // Validate name
      const NAME_RE = /^[a-zA-Z0-9 _.:-]{1,128}$/;
      if (!NAME_RE.test(name)) {
        return {
          isError: true,
          content: [{ type: 'text', text: "Field 'name' must be 1-128 characters using letters, digits, spaces, and _ . : -" }],
        };
      }

      // Validate URL (SSRF protection)
      const urlCheck = await validateUrl(url);
      if (!urlCheck.ok) {
        ctx.waitUntil(log(env, 5, 'security', {
          event: 'security.ssrf_block',
          tenantId: auth.tenantId,
          keyName: auth.keyName,
          keyHashPrefix: auth.keyHashPrefix,
          authMethod: auth.authMethod,
          responseStatus: urlCheck.status,
          reason: urlCheck.detail.startsWith('URL scheme') ? 'url_scheme_not_allowed' : urlCheck.detail,
          via: 'mcp',
        }) ?? Promise.resolve());
        return {
          isError: true,
          content: [{ type: 'text', text: `Invalid URL: ${urlCheck.detail}` }],
        };
      }

      // Validate cron expression
      const cronCheck = validateCron(cron);
      if (!cronCheck.ok) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Invalid cron expression: ${cronCheck.detail}` }],
        };
      }

      // Per-tenant schedule limit check
      const tenantConfig = await getTenantConfig(env.DB, auth.tenantId);
      const scheduleLimit = getEffectiveScheduleLimit(tenantConfig);
      const count = await countSchedules(env.DB, auth.tenantId);
      if (count >= scheduleLimit) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Schedule limit reached (${scheduleLimit}). Delete an existing schedule to create a new one.` }],
        };
      }

      // Create schedule
      const id = 'sch_' + crypto.randomUUID().replace(/-/g, '');
      const nextRunAt = nextRun(cronCheck.cron);

      let record;
      try {
        record = await createSchedule(env.DB, id, auth.tenantId, urlCheck.url, name, cronCheck.cron, nextRunAt);
      } catch (err) {
        ctx.waitUntil(log(env, 5, 'schedule', {
          event: 'schedule.create_fail',
          scheduleId: id,
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
          content: [{ type: 'text', text: 'Could not create schedule. Please try again.' }],
        };
      }

      ctx.waitUntil(log(env, 3, 'schedule', {
        event: 'schedule.created',
        scheduleId: id,
        tenantId: auth.tenantId,
        url: urlCheck.url,
        cron: cronCheck.cron,
        keyHashPrefix: auth.keyHashPrefix,
        authMethod: auth.authMethod,
        responseStatus: 201,
        via: 'mcp',
      }) ?? Promise.resolve());

      const displayUrl = urlCheck.url.replace(/#.*$/, '').slice(0, 200);

      return {
        content: [{
          type: 'text',
          text: [
            `Schedule created.`,
            `ID:       ${record.id ?? id}`,
            `Name:     ${name}`,
            `URL:      ${displayUrl}`,
            `Cron:     ${cronCheck.cron}`,
            `Next run: ${nextRunAt}`,
            '',
            'Use list_schedules to view all schedules or delete_schedule to remove this one.',
          ].join('\n'),
        }],
      };
    },
  );

  // -------------------------------------------------------------------------
  // Tool: delete_schedule
  // -------------------------------------------------------------------------

  server.tool(
    'delete_schedule',
    'Delete a scheduled capture by ID. Requires capture scope; returns 404 for nonexistent or cross-tenant schedules (no information disclosure). Deletion is immediate and irreversible. Use list_schedules to find schedule IDs.',
    { schedule_id: z.string().describe('The schedule ID to delete (format: sch_ followed by 32 hex characters).') },
    async ({ schedule_id: scheduleId }) => {
      // Scope check: DELETE /v1/schedules/:id requires capture scope (matches HTTP handler)
      if (!hasScope(auth.scopes, 'capture')) {
        return {
          isError: true,
          content: [{ type: 'text', text: "Insufficient scope: API key does not grant 'capture' scope." }],
        };
      }

      // Validate ID format
      if (!/^sch_[a-f0-9]{32}$/.test(scheduleId)) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'Invalid schedule ID format.' }],
        };
      }

      let deleted;
      try {
        deleted = await deleteSchedule(env.DB, scheduleId, auth.tenantId);
      } catch (err) {
        ctx.waitUntil(log(env, 5, 'schedule', {
          event: 'schedule.delete_fail',
          scheduleId,
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
          content: [{ type: 'text', text: 'Could not delete schedule. Please try again.' }],
        };
      }

      if (!deleted) {
        ctx.waitUntil(log(env, 3, 'schedule', {
          event: 'schedule.deleted',
          scheduleId,
          tenantId: auth.tenantId,
          found: false,
          keyHashPrefix: auth.keyHashPrefix,
          authMethod: auth.authMethod,
          responseStatus: 404,
          via: 'mcp',
        }) ?? Promise.resolve());
        return {
          isError: true,
          content: [{ type: 'text', text: 'Schedule not found.' }],
        };
      }

      ctx.waitUntil(log(env, 3, 'schedule', {
        event: 'schedule.deleted',
        scheduleId,
        tenantId: auth.tenantId,
        found: true,
        keyHashPrefix: auth.keyHashPrefix,
        authMethod: auth.authMethod,
        responseStatus: 200,
        via: 'mcp',
      }) ?? Promise.resolve());

      return {
        content: [{ type: 'text', text: `Schedule deleted: ${scheduleId}` }],
      };
    },
  );

  // -------------------------------------------------------------------------
  // Tool: get_certificate
  // -------------------------------------------------------------------------

  server.tool(
    'get_certificate',
    'Retrieve certificate metadata for a complete capture, summarizing the FRE 902(13) attestation details, bundle hash, Ed25519 key ID, and timestamp status. Returns formatted text, not a binary PDF; use the certificate URL to download the actual PDF. Useful for programmatic verification of signing metadata before presenting evidence.',
    { capture_id: z.string().describe('The capture ID (format: cap_ followed by 32 hex characters).') },
    async ({ capture_id: captureId }) => {
      const record = await getCapture(env.DB, captureId);

      if (!record) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Capture not found: ${captureId}` }],
        };
      }

      // Tenant isolation: identical 404 for cross-tenant captures (no enumeration)
      if (record.tenantId !== auth.tenantId) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Capture not found: ${captureId}` }],
        };
      }

      if (record.status === 'quarantined') {
        return {
          isError: true,
          content: [{ type: 'text', text: 'Capture artifacts restricted due to content security policy.' }],
        };
      }

      if (record.status !== 'complete') {
        return {
          isError: true,
          content: [{ type: 'text', text: `Capture is not complete (status: ${record.status}). Certificate is only available for complete captures.` }],
        };
      }

      if (!record.wacz) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'Certificate not available: capture has no WACZ bundle.' }],
        };
      }

      const signingKeys = await getSigningKeys(env);
      if (!signingKeys) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'Certificate generation unavailable: signing key not configured.' }],
        };
      }

      const tsStatus = record.wacz.timestampStatus ?? 'none';
      const qualifiedStatus = record.wacz.qualifiedTimestampStatus ?? 'none';

      const lines = [
        `Certificate for capture ${captureId}`,
        '',
        `Captured URL:   ${record.url}`,
        `Captured at:    ${record.completedAt}`,
        `Render quality: ${record.renderQuality ?? 'full'}`,
        '',
        'Integrity evidence:',
        `  Bundle hash (SHA-256): ${record.wacz.bundleHash ?? '(unavailable)'}`,
        `  Signing algorithm:     Ed25519`,
        `  Key ID:                ${record.wacz.keyId ?? signingKeys.keyId}`,
        `  RFC 3161 timestamp:    ${tsStatus}`,
        `  eIDAS qualified ts:    ${qualifiedStatus}`,
        '',
        'Certificate URL (PDF):',
        `  ${origin}/v1/captures/${captureId}/certificate`,
        '',
        'Verification URL:',
        `  ${origin}/v1/verify/${captureId}`,
        '',
        'Use verify_capture to re-check artifact hashes and signature.',
      ];

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
