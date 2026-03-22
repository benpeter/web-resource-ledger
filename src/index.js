import { problemResponse, jsonResponse, batchItemSuccess, batchItemError } from './responses.js';
import { verifyApiKey, verifyAdminKey } from './auth.js';
import { validateUrl } from './url-validation.js';
import { createCapture, getCapture, failCapture, listCaptures, listArchivedSigningKeys, TENANT_ID_RE, getTenantConfig, setTenantConfig } from './db.js';
import { rateLimitCounter } from './kv.js';
import { performCapture } from './capture.js';
import { performVerification } from './verify.js';
import { getSigningKeys } from './signing.js';
import { htmlVerifyResponse } from './verify-page.js';
import { FAVICON_SVG } from './favicon.js';
import { log } from './log.js';
import { RATE_LIMITS, getEffectiveLimit } from './rate-limits.js';
import { computeCip } from './ip-hash.js';
import { handleAdminCreateKey, handleAdminListKeys, handleAdminRevokeKey } from './admin.js';
import { handleMcp } from './mcp.js';
import { htmlDashboard } from './ui/ui-shell.js';
import { handleCreateWebhook, handleListWebhooks, handleDeleteWebhook, handlePingWebhook } from './webhooks.js';
import { handleWebhookMessage, handleWebhookDlqMessage, dispatchWebhooks } from './webhook-dispatch.js';

// tva

// Routes: [method, pattern, handler]
// Order matters: most specific pattern first.
// Add new routes as one-line tuples.
const routes = [
  ['GET',    /^\/favicon\.ico$/, handleFavicon],
  ['GET',    /^\/health$/, handleHealth],
  // UI dashboard -- same-origin only; no CORS needed (browser-only, uses credentials via sessionStorage)
  ['GET',    /^\/ui$/, handleDashboard],
  ['POST',   /^\/v1\/captures\/batch$/, handleBatchCapture],
  ['POST',   /^\/v1\/captures$/, handleCreateCapture],
  ['GET',    /^\/v1\/captures$/, handleListCaptures],
  ['GET',    /^\/v1\/captures\/(cap_[a-f0-9]{32})\/status$/, handleCaptureStatus],
  ['GET',    /^\/v1\/captures\/(cap_[a-f0-9]{32})$/, handleGetCapture],
  ['GET',    /^\/v1\/captures\/(cap_[a-f0-9]{32})\/artifacts\/(screenshot-before|screenshot|html|headers|wacz)$/, handleGetCaptureArtifact],
  ['GET',    /^\/v1\/verify\/(cap_[a-f0-9]{32})$/, handleVerifyCapture],
  ['GET',    /^\/\.well-known\/signing-key$/, handleGetSigningKey],
  ['GET',    /^\/\.well-known\/signing-keys$/, handleGetSigningKeys],
  ['POST',   /^\/v1\/admin\/keys$/, handleAdminCreateKey],
  ['GET',    /^\/v1\/admin\/keys$/, handleAdminListKeys],
  ['DELETE', /^\/v1\/admin\/keys\/([a-f0-9]{64})$/, handleAdminRevokeKey],
  ['GET',    /^\/v1\/admin\/tenants\/([a-z0-9_-]{1,64})\/config$/, handleGetTenantConfig],
  ['PUT',    /^\/v1\/admin\/tenants\/([a-z0-9_-]{1,64})\/config$/, handlePutTenantConfig],
  ['POST',   /^\/v1\/webhooks$/, handleCreateWebhook],
  ['GET',    /^\/v1\/webhooks$/, handleListWebhooks],
  ['DELETE', /^\/v1\/webhooks\/(whk_[a-f0-9]{32})$/, handleDeleteWebhook],
  ['POST',   /^\/v1\/webhooks\/(whk_[a-f0-9]{32})\/ping$/, handlePingWebhook],
];

function getAllowedOrigin(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return null;
  const allowed = env.CORS_ORIGINS
    ? env.CORS_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
    : [];
  if (allowed.includes(origin)) return origin;
  return null;
}

function getRateLimitGroup(method, pathname) {
  if (pathname.startsWith('/v1/admin/')) return 'admin';
  if (pathname === '/v1/captures' || pathname === '/v1/captures/batch') return 'capture';
  if (pathname.startsWith('/v1/verify/') || pathname.startsWith('/.well-known/signing-key')) return 'verify';
  return null;
}

// ---------------------------------------------------------------------------
// Queue consumer helpers
// ---------------------------------------------------------------------------

async function handleCaptureMessage(msg, env, ctx) {
  const { url, ip, captureId, tenantId, cip, enqueuedAt } = msg.body ?? {};

  // Defense-in-depth: validate message structure before trusting it
  const valid =
    typeof tenantId === 'string' && TENANT_ID_RE.test(tenantId) &&
    typeof captureId === 'string' && /^cap_[a-f0-9]{32}$/.test(captureId) &&
    typeof url === 'string' && url.length > 0;

  if (!valid) {
    ctx.waitUntil(log(env, 5, 'capture', {
      event: 'capture.invalid_message',
      captureId: captureId ?? null,
      tenantId: tenantId ?? null,
      reason: 'invalid_message_structure',
    }) ?? Promise.resolve());
    msg.ack();
    return;
  }

  // SSRF check on the URL from the queue message
  const urlCheck = await validateUrl(url);
  if (!urlCheck.ok) {
    ctx.waitUntil(log(env, 5, 'capture', {
      event: 'capture.invalid_message',
      captureId,
      tenantId,
      reason: 'url_validation_failed',
      detail: urlCheck.detail,
    }) ?? Promise.resolve());
    msg.ack();
    return;
  }

  // Idempotency guard: skip if already terminal
  const existing = await getCapture(env.DB, captureId);
  if (existing && (existing.status === 'complete' || existing.status === 'failed')) {
    msg.ack();
    return;
  }

  const queueTimeMs = Date.now() - msg.timestamp.getTime();

  ctx.waitUntil(log(env, 3, 'capture', {
    event: 'capture.dequeued',
    captureId,
    tenantId,
    url,
    attempt: msg.attempts,
    queueTimeMs,
  }) ?? Promise.resolve());

  let result;
  try {
    result = await performCapture(env, url, ip, captureId, tenantId, cip, undefined, msg.attempts);
  } catch (err) {
    // Catastrophic error (OOM, binding failure, etc.)
    // max_retries=3 in wrangler.toml → up to 4 deliveries (attempts 1-4)
    if (msg.attempts >= 4) {
      try {
        await failCapture(env.DB, captureId, 'Capture permanently failed after catastrophic error', false);
      } catch {
        // Best-effort -- do not block ack
      }
      msg.ack();
    } else {
      const delay = Math.min(10 * Math.pow(2, msg.attempts - 1), 300);
      msg.retry({ delaySeconds: delay });
    }
    return;
  }

  if (result.ok === true) {
    msg.ack();
    // Dispatch webhooks after ack -- must not block capture completion
    ctx.waitUntil((async () => {
      try {
        const captureRecord = await getCapture(env.DB, captureId);
        if (captureRecord) {
          await dispatchWebhooks(env, tenantId, 'capture.complete', captureRecord);
        }
      } catch {
        // Best-effort: webhook dispatch must never break the capture pipeline
      }
    })());
  } else if (!result.retryable) {
    // Already written to D1 as failed by performCapture
    msg.ack();
    // Dispatch webhooks after ack -- must not block capture completion
    ctx.waitUntil((async () => {
      try {
        const captureRecord = await getCapture(env.DB, captureId);
        if (captureRecord) {
          await dispatchWebhooks(env, tenantId, 'capture.failed', captureRecord);
        }
      } catch {
        // Best-effort: webhook dispatch must never break the capture pipeline
      }
    })());
  } else {
    const delay = Math.min(10 * Math.pow(2, msg.attempts - 1), 300);
    ctx.waitUntil(log(env, 4, 'capture', {
      event: 'capture.retry',
      captureId,
      tenantId,
      attempt: msg.attempts,
      retryDelaySeconds: delay,
      retryReason: result.error,
    }) ?? Promise.resolve());
    msg.retry({ delaySeconds: delay });
  }
}

async function handleDlqMessage(msg, env, ctx) {
  const { captureId, tenantId, url } = msg.body ?? {};

  ctx.waitUntil(log(env, 5, 'capture', {
    event: 'capture.dlq',
    captureId: captureId ?? null,
    tenantId: tenantId ?? null,
    url: url ?? null,
    attempts: msg.attempts,
  }) ?? Promise.resolve());

  if (captureId) {
    try {
      await failCapture(env.DB, captureId, 'Capture permanently failed after all retry attempts', false);
    } catch {
      // Best-effort
    }
    // Dispatch webhooks after failCapture -- must not block DLQ ack
    ctx.waitUntil((async () => {
      try {
        const captureRecord = await getCapture(env.DB, captureId);
        if (captureRecord) {
          await dispatchWebhooks(env, tenantId, 'capture.failed', captureRecord);
        }
      } catch {
        // Best-effort: webhook dispatch must never break the DLQ handler
      }
    })());
  }

  msg.ack();
}

// ---------------------------------------------------------------------------
// Worker default export
// ---------------------------------------------------------------------------

export default {
  async queue(batch, env, ctx) {
    for (const msg of batch.messages) {
      const q = batch.queue;
      if (q.includes('webhooks')) {
        if (q.endsWith('-dlq')) {
          await handleWebhookDlqMessage(msg, env, ctx);
        } else {
          await handleWebhookMessage(msg, env, ctx);
        }
      } else {
        if (q.endsWith('-dlq')) {
          await handleDlqMessage(msg, env, ctx);
        } else {
          await handleCaptureMessage(msg, env, ctx);
        }
      }
    }
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // Normalize trailing slashes: /health/ matches /health
    const pathname = url.pathname.replace(/\/$/, '') || '/';

    let response;

    // MCP endpoint -- handle before regex router
    // MCP transport handles POST internally; OPTIONS for CORS preflight
    if (pathname === '/mcp') {
      if (request.method === 'OPTIONS') {
        response = new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Max-Age': '7200',
          },
        });
      } else {
        response = await handleMcp(request, env, ctx);
      }
    }

    // CORS preflight for POST /v1/captures
    if (!response && request.method === 'OPTIONS' && pathname === '/v1/captures') {
      const allowedOrigin = getAllowedOrigin(request, env);
      const headers = {
        'Access-Control-Max-Age': '7200',
        'Cache-Control': 'no-store',
      };
      if (allowedOrigin) {
        headers['Access-Control-Allow-Origin'] = allowedOrigin;
        headers['Access-Control-Allow-Methods'] = 'POST';
        headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
        headers['Vary'] = 'Origin';
      }
      response = new Response(null, { status: 204, headers });
    }

    if (!response) {
      const isAdminRoute = pathname.startsWith('/v1/admin/');

      // Admin rate limit: check BEFORE auth (per spec)
      if (isAdminRoute) {
        const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
        if (env.ADMIN_RATE_LIMITER) {
          const { success } = await env.ADMIN_RATE_LIMITER.limit({ key: clientIp });
          if (!success) {
            const cip = await computeCip(env, clientIp);
            ctx.waitUntil(log(env, 4, 'security', { event: 'security.rate_limit', limiter: 'admin_per_ip', responseStatus: 429, cip }) ?? Promise.resolve());
            response = problemResponse(429, 'Rate limit exceeded. Try again later.', { 'Retry-After': '60' });
          }
        }

        // Admin auth: only if rate limit passed
        if (!response) {
          const auth = await verifyAdminKey(request, env);
          if (!auth.ok) {
            const cip = await computeCip(env, clientIp);
            ctx.waitUntil(log(env, 5, 'security', { event: 'security.auth_fail', reason: auth.reason, responseStatus: auth.response.status, cip }) ?? Promise.resolve());
            response = auth.response;
          }
        }
      }

      if (!response) {
        let matched = false;
        for (const [method, pattern, handler] of routes) {
          if (request.method !== method) continue;
          const match = pathname.match(pattern);
          if (match) {
            response = await handler(request, env, ctx, match);
            matched = true;
            break;
          }
        }

        if (!matched) {
          // SECURITY: Use static message -- never reflect request.method or url.pathname
          // into error responses (CWE-209 information disclosure)
          response = problemResponse(404, 'The requested resource does not exist.');
        }
      }
    }

    // CORS response headers for POST /v1/captures
    if (request.method === 'POST' && pathname === '/v1/captures') {
      const allowedOrigin = getAllowedOrigin(request, env);
      if (allowedOrigin) {
        response.headers.set('Access-Control-Allow-Origin', allowedOrigin);
        response.headers.set('Vary', 'Origin');
      }
    }

    // CORS response headers for MCP endpoint
    if (pathname === '/mcp' && response && request.method !== 'OPTIONS') {
      response = new Response(response.body, response);
      response.headers.set('Access-Control-Allow-Origin', '*');
    }

    // X-RateLimit headers: authenticated handlers set their own (Limit/Remaining/Reset);
    // fall back to static Limit for unauthenticated endpoints (verify, admin)
    const rateLimitGroup = getRateLimitGroup(request.method, pathname);
    if (rateLimitGroup && response.status !== 503 && !response.headers.has('X-RateLimit-Limit')) {
      response.headers.set('X-RateLimit-Limit', String(RATE_LIMITS[rateLimitGroup].limit));
    }

    response.headers.set('Referrer-Policy', 'no-referrer');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
    // URL is coupled to the GitHub repository path -- update if the repo is renamed.
    response.headers.set('Link', '<https://github.com/benpeter/web-resource-ledger/blob/main/TERMS.md>; rel="terms-of-service"');
    return response;
  },
};

function handleFavicon() {
  // Serve SVG as favicon (modern browsers accept SVG favicons)
  const body = FAVICON_SVG;
  return new Response(body, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=604800',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function handleHealth() {
  return jsonResponse({
    status: 'ok',
    legal: {
      terms: 'https://github.com/benpeter/web-resource-ledger/blob/main/TERMS.md',
      policy: 'https://github.com/benpeter/web-resource-ledger/blob/main/CONTENT-POLICY.md',
    },
  });
}

function handleDashboard() {
  return htmlDashboard();
}

/**
 * Dual-layer rate limit check for authenticated capture endpoints.
 * - Legacy auth: IP-only via CF binding (unchanged behavior)
 * - KV auth: CF ceiling → KV counter → IP guard
 */
async function checkCaptureRateLimit(env, auth, clientIp, group, count = 1) {
  // Legacy auth: IP-only using existing CF binding (unchanged behavior)
  if (auth.authMethod === 'legacy') {
    if (env.CAPTURE_RATE_LIMITER) {
      const { success } = await env.CAPTURE_RATE_LIMITER.limit({ key: clientIp });
      if (!success) {
        return { exceeded: true, type: 'ip' };
      }
    }
    return { exceeded: false };
  }

  // KV auth: three-layer check
  // Layer 1: CF binding ceiling (tenantId key -- hard backstop at 100/60s)
  if (env.CAPTURE_RATE_LIMITER) {
    const { success } = await env.CAPTURE_RATE_LIMITER.limit({ key: auth.tenantId });
    if (!success) {
      return { exceeded: true, type: 'tenant' };
    }
  }

  // Layer 2: KV counter (per-tenant, respects custom overrides)
  const tenantConfig = await getTenantConfig(env.DB, auth.tenantId);
  const effective = getEffectiveLimit(tenantConfig, group);
  const counter = await rateLimitCounter(env.KV, auth.tenantId, group, effective.limit, effective.period, count);

  if (counter.exceeded) {
    return {
      exceeded: true,
      type: 'tenant',
      remaining: 0,
      resetIn: counter.resetIn,
      limit: effective.limit,
      writePromise: counter.writePromise,
    };
  }

  // Layer 3: IP secondary guard (per-IP abuse prevention)
  if (env.CAPTURE_IP_GUARD) {
    const { success } = await env.CAPTURE_IP_GUARD.limit({ key: clientIp });
    if (!success) {
      return {
        exceeded: true,
        type: 'ip_guard',
        remaining: counter.remaining,
        resetIn: counter.resetIn,
        limit: effective.limit,
        writePromise: counter.writePromise,
      };
    }
  }

  return {
    exceeded: false,
    remaining: counter.remaining,
    resetIn: counter.resetIn,
    limit: effective.limit,
    writePromise: counter.writePromise,
  };
}

async function handleCreateCapture(request, env, ctx) {
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
  const cip = await computeCip(env, clientIp);

  // Step 1: Content-Type check
  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.includes('application/json')) {
    return problemResponse(415, 'Content-Type must be application/json');
  }

  // Step 2: Auth check
  const auth = await verifyApiKey(request, env, { requiredScope: 'capture' });
  if (!auth.ok) {
    ctx.waitUntil(log(env, 5, 'security', { event: 'security.auth_fail', reason: auth.reason, keyHashPrefix: auth.keyHashPrefix || null, responseStatus: auth.response.status, cip }) ?? Promise.resolve());
    return auth.response;
  }
  const { tenantId, keyName, keyHashPrefix, authMethod } = auth;

  // Step 3: Per-tenant rate limit (dual-layer for KV auth, IP-only for legacy)
  const rl = await checkCaptureRateLimit(env, auth, clientIp, 'capture');
  if (rl.exceeded) {
    const limiter = rl.type === 'ip_guard' ? 'capture_per_ip_guard' : rl.type === 'ip' ? 'capture_per_ip' : 'capture_per_tenant';
    ctx.waitUntil(log(env, 4, 'security', { event: 'security.rate_limit', limiter, tenantId, keyName, keyHashPrefix, authMethod, responseStatus: 429, cip }) ?? Promise.resolve());
    if (rl.writePromise) ctx.waitUntil(rl.writePromise);
    const retryAfter = String(rl.resetIn || 60);
    const headers = { 'Retry-After': retryAfter };
    if (rl.limit !== undefined) {
      headers['X-RateLimit-Limit'] = String(rl.limit);
      headers['X-RateLimit-Remaining'] = '0';
      headers['X-RateLimit-Reset'] = retryAfter;
    }
    if (rl.type === 'tenant') {
      return problemResponse(429, 'Per-tenant rate limit exceeded.', headers, { limitType: 'tenant' });
    }
    return problemResponse(429, 'Rate limit exceeded. Try again later.', headers);
  }
  if (rl.writePromise) ctx.waitUntil(rl.writePromise);
  const rlHeaders = {};
  if (rl.limit !== undefined) {
    rlHeaders['X-RateLimit-Limit'] = String(rl.limit);
    rlHeaders['X-RateLimit-Remaining'] = String(rl.remaining);
    rlHeaders['X-RateLimit-Reset'] = String(rl.resetIn);
  }

  // Global rate limit check (service capacity protection)
  if (env.GLOBAL_CAPTURE_LIMITER) {
    const { success } = await env.GLOBAL_CAPTURE_LIMITER.limit({ key: 'global' });
    if (!success) {
      ctx.waitUntil(log(env, 4, 'security', { event: 'security.capacity_limit', tenantId, keyName, keyHashPrefix, authMethod, responseStatus: 503, cip }) ?? Promise.resolve());
      return problemResponse(503, 'Service is at capacity. Retry in 10 seconds.', { 'Retry-After': '10' });
    }
  }

  // Step 4: Parse JSON body
  let body;
  try {
    body = await request.json();
  } catch {
    return problemResponse(400, 'Request body must be valid JSON');
  }

  // Step 5: Validate url field
  if (body === null || body === undefined || !Object.prototype.hasOwnProperty.call(body, 'url')) {
    return problemResponse(400, "Field 'url' is required");
  }
  if (typeof body.url !== 'string') {
    return problemResponse(400, "Field 'url' must be a string");
  }

  // Step 6: URL validation (SSRF prevention)
  const result = await validateUrl(body.url);
  if (!result.ok) {
    ctx.waitUntil(log(env, 5, 'security', { event: 'security.ssrf_block', tenantId, keyName, keyHashPrefix, authMethod, responseStatus: result.status, reason: result.detail.startsWith('URL scheme') ? 'url_scheme_not_allowed' : result.detail, cip }) ?? Promise.resolve());
    return problemResponse(result.status, result.detail);
  }

  // Step 7: Generate capture ID
  const captureId = 'cap_' + crypto.randomUUID().replace(/-/g, '');

  // Step 8: Write pending record to KV (synchronously before returning 202)
  try {
    await createCapture(env.DB, captureId, result.url, result.ip, tenantId);
  } catch (err) {
    ctx.waitUntil(log(env, 5, 'capture', {
      event: 'capture.kv_create_fail',
      captureId,
      tenantId,
      keyName,
      keyHashPrefix,
      authMethod,
      responseStatus: 500,
      cip,
      errorMessage: String(err?.message ?? '').slice(0, 256),
    }) ?? Promise.resolve());
    return problemResponse(500, 'Could not create capture record');
  }

  // Step 9: Log capture accepted (bridge event: ties captureId to keyName for correlation)
  ctx.waitUntil(log(env, 3, 'capture', {
    event: 'capture.accepted',
    captureId,
    tenantId,
    keyName,
    keyHashPrefix,
    authMethod,
    responseStatus: 202,
    url: result.url,
    cip,
  }) ?? Promise.resolve());

  // Step 10a: Dispatch to queue
  try {
    await env.CAPTURE_QUEUE.send({
      captureId, url: result.url, ip: result.ip, tenantId, cip,
      enqueuedAt: Date.now(),
    });
  } catch (err) {
    await failCapture(env.DB, captureId, 'Queue dispatch failed', true);
    ctx.waitUntil(log(env, 5, 'capture', {
      event: 'capture.enqueue_fail', captureId, tenantId, cip,
      errorMessage: String(err?.message ?? '').slice(0, 256),
    }) ?? Promise.resolve());
    return problemResponse(500, 'Could not dispatch capture');
  }

  ctx.waitUntil(log(env, 3, 'capture', {
    event: 'capture.enqueued',
    captureId,
    tenantId,
    url: result.url,
    cip,
  }) ?? Promise.resolve());

  // Step 10b: Build absolute status URL
  const statusUrl = new URL(`/v1/captures/${captureId}/status`, request.url).href;

  // Step 11: Return 202
  return jsonResponse({
    id: captureId,
    statusUrl,
    note: 'Use GET /v1/captures to list and search your captures.',
  }, 202, { 'Retry-After': '10', ...rlHeaders });
}

async function handleBatchCapture(request, env, ctx) {
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
  const cip = await computeCip(env, clientIp);

  // Step 1: Content-Type check
  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.includes('application/json')) {
    return problemResponse(415, 'Content-Type must be application/json');
  }

  // Step 2: Auth check
  const auth = await verifyApiKey(request, env, { requiredScope: 'capture' });
  if (!auth.ok) {
    ctx.waitUntil(log(env, 5, 'security', { event: 'security.auth_fail', reason: auth.reason, keyHashPrefix: auth.keyHashPrefix || null, responseStatus: auth.response.status, cip }) ?? Promise.resolve());
    return auth.response;
  }
  const { tenantId, keyName, keyHashPrefix, authMethod } = auth;

  // Step 3: Parse JSON body (before rate limit -- need batch size)
  let body;
  try {
    body = await request.json();
  } catch {
    return problemResponse(400, 'Request body must be valid JSON');
  }

  // Step 4: Validate batch structure
  if (!body || !Array.isArray(body.urls)) {
    return problemResponse(400, "Field 'urls' is required and must be an array");
  }
  if (body.urls.length === 0) {
    return problemResponse(400, "Field 'urls' must contain at least one item");
  }
  const ABSOLUTE_MAX_BATCH_SIZE = 100;
  const maxBatchSize = Math.min(parseInt(env.MAX_BATCH_SIZE, 10) || 20, ABSOLUTE_MAX_BATCH_SIZE);
  if (body.urls.length > maxBatchSize) {
    return problemResponse(400, `Batch size exceeds the maximum of ${maxBatchSize} items`);
  }

  // Step 5: Per-tenant rate limit (KV auth: upfront check for entire batch; legacy: single pre-check)
  const rl = await checkCaptureRateLimit(env, auth, clientIp, 'capture', body.urls.length);
  if (rl.exceeded) {
    const limiter = rl.type === 'ip_guard' ? 'capture_per_ip_guard' : rl.type === 'ip' ? 'capture_per_ip' : 'capture_per_tenant';
    ctx.waitUntil(log(env, 4, 'security', { event: 'security.rate_limit', limiter, tenantId, keyName, keyHashPrefix, authMethod, responseStatus: 429, cip }) ?? Promise.resolve());
    if (rl.writePromise) ctx.waitUntil(rl.writePromise);
    const retryAfter = String(rl.resetIn || 60);
    const headers = { 'Retry-After': retryAfter };
    if (rl.limit !== undefined) {
      headers['X-RateLimit-Limit'] = String(rl.limit);
      headers['X-RateLimit-Remaining'] = '0';
      headers['X-RateLimit-Reset'] = retryAfter;
    }
    if (rl.type === 'tenant') {
      return problemResponse(429, 'Per-tenant rate limit exceeded.', headers, { limitType: 'tenant' });
    }
    return problemResponse(429, 'Rate limit exceeded. Try again later.', headers);
  }
  if (rl.writePromise) ctx.waitUntil(rl.writePromise);
  const rlHeaders = {};
  if (rl.limit !== undefined) {
    rlHeaders['X-RateLimit-Limit'] = String(rl.limit);
    rlHeaders['X-RateLimit-Remaining'] = String(rl.remaining);
    rlHeaders['X-RateLimit-Reset'] = String(rl.resetIn);
  }

  // Step 6: Global capacity pre-check
  if (env.GLOBAL_CAPTURE_LIMITER) {
    const { success } = await env.GLOBAL_CAPTURE_LIMITER.limit({ key: 'global' });
    if (!success) {
      ctx.waitUntil(log(env, 4, 'security', { event: 'security.capacity_limit', tenantId, keyName, keyHashPrefix, authMethod, responseStatus: 503, cip }) ?? Promise.resolve());
      return problemResponse(503, 'Service is at capacity. Retry in 10 seconds.', { 'Retry-After': '10' });
    }
  }

  // Step 7: Process each URL sequentially
  const items = [];
  const queueMessages = [];
  let rateLimitedStatus = null; // 429 or 503 if a limiter fires mid-batch (legacy auth only)
  const usePerUrlRateLimits = auth.authMethod === 'legacy';

  for (let i = 0; i < body.urls.length; i++) {
    const item = body.urls[i];

    // If a rate limit fired on a prior iteration, mark all remaining URLs the same way
    if (rateLimitedStatus !== null) {
      const url = (item && typeof item === 'object' && typeof item.url === 'string') ? item.url : '';
      if (rateLimitedStatus === 429) {
        items.push(batchItemError(url, 429, 'Rate limit exceeded. Try again later.'));
      } else {
        items.push(batchItemError(url, 503, 'Service is at capacity. Retry in 10 seconds.'));
      }
      continue;
    }

    // Per-URL rate limits (legacy auth only -- KV auth uses upfront batch check)
    if (usePerUrlRateLimits && i > 0) {
      if (env.CAPTURE_RATE_LIMITER) {
        const { success } = await env.CAPTURE_RATE_LIMITER.limit({ key: clientIp });
        if (!success) {
          ctx.waitUntil(log(env, 4, 'security', { event: 'security.rate_limit', limiter: 'capture_per_ip', tenantId, keyName, keyHashPrefix, authMethod, responseStatus: 429, cip }) ?? Promise.resolve());
          rateLimitedStatus = 429;
          const url = (item && typeof item === 'object' && typeof item.url === 'string') ? item.url : '';
          items.push(batchItemError(url, 429, 'Rate limit exceeded. Try again later.'));
          continue;
        }
      }
      if (env.GLOBAL_CAPTURE_LIMITER) {
        const { success } = await env.GLOBAL_CAPTURE_LIMITER.limit({ key: 'global' });
        if (!success) {
          ctx.waitUntil(log(env, 4, 'security', { event: 'security.capacity_limit', tenantId, keyName, keyHashPrefix, authMethod, responseStatus: 503, cip }) ?? Promise.resolve());
          rateLimitedStatus = 503;
          const url = (item && typeof item === 'object' && typeof item.url === 'string') ? item.url : '';
          items.push(batchItemError(url, 503, 'Service is at capacity. Retry in 10 seconds.'));
          continue;
        }
      }
    }

    // Validate per-item structure
    if (!item || typeof item !== 'object' || typeof item.url !== 'string') {
      items.push(batchItemError('', 400, 'Each item must be an object with a string url field'));
      continue;
    }

    // SSRF validation
    const result = await validateUrl(item.url);
    if (!result.ok) {
      ctx.waitUntil(log(env, 5, 'security', { event: 'security.ssrf_block', tenantId, keyName, keyHashPrefix, authMethod, responseStatus: result.status, reason: result.detail.startsWith('URL scheme') ? 'url_scheme_not_allowed' : result.detail, cip }) ?? Promise.resolve());
      items.push(batchItemError(item.url, result.status, result.detail));
      continue;
    }

    // Generate capture ID
    const captureId = 'cap_' + crypto.randomUUID().replace(/-/g, '');

    // Write KV record
    try {
      await createCapture(env.DB, captureId, result.url, result.ip, tenantId);
    } catch (err) {
      ctx.waitUntil(log(env, 5, 'capture', {
        event: 'capture.kv_create_fail',
        captureId,
        tenantId,
        keyName,
        keyHashPrefix,
        authMethod,
        responseStatus: 500,
        cip,
        errorMessage: String(err?.message ?? '').slice(0, 256),
      }) ?? Promise.resolve());
      items.push(batchItemError(item.url, 500, 'Could not create capture record'));
      continue;
    }

    // Log accepted and stage for queue dispatch
    ctx.waitUntil(log(env, 3, 'capture', {
      event: 'capture.accepted',
      captureId,
      tenantId,
      keyName,
      keyHashPrefix,
      authMethod,
      responseStatus: 202,
      url: result.url,
      cip,
    }) ?? Promise.resolve());

    queueMessages.push({
      body: { captureId, url: result.url, ip: result.ip, tenantId, cip, enqueuedAt: Date.now() },
    });

    const statusUrl = new URL(`/v1/captures/${captureId}/status`, request.url).href;
    items.push(batchItemSuccess(result.url, captureId, statusUrl));
  }

  // Enqueue all accepted captures
  if (queueMessages.length > 0) {
    try {
      await env.CAPTURE_QUEUE.sendBatch(queueMessages);
    } catch (err) {
      for (const qm of queueMessages) {
        await failCapture(env.DB, qm.body.captureId, 'Queue dispatch failed', true);
      }
      ctx.waitUntil(log(env, 5, 'capture', {
        event: 'capture.batch_enqueue_fail', tenantId, cip,
        count: queueMessages.length,
        errorMessage: String(err?.message ?? '').slice(0, 256),
      }) ?? Promise.resolve());
      return problemResponse(500, 'Could not dispatch captures');
    }
  }

  // Step 8: Build summary
  const accepted = items.filter(it => it.status === 202).length;
  const failed = items.length - accepted;

  // Step 9: Log batch event
  ctx.waitUntil(log(env, 3, 'capture', {
    event: 'capture.batch',
    tenantId,
    keyName,
    keyHashPrefix,
    authMethod,
    total: items.length,
    accepted,
    failed,
    cip,
  }) ?? Promise.resolve());

  // Step 10: Return 207
  return jsonResponse({ items, summary: { total: items.length, accepted, failed } }, 207, rlHeaders);
}

async function handleListCaptures(request, env, ctx) {
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
  const cip = await computeCip(env, clientIp);

  // Step 1: Auth check
  const auth = await verifyApiKey(request, env, { requiredScope: 'read' });
  if (!auth.ok) {
    ctx.waitUntil(log(env, 5, 'security', { event: 'security.auth_fail', reason: auth.reason, keyHashPrefix: auth.keyHashPrefix || null, responseStatus: auth.response.status, cip }) ?? Promise.resolve());
    return auth.response;
  }
  const { keyName, keyHashPrefix, authMethod } = auth;

  // Step 2: Per-tenant rate limit (dual-layer for KV auth, IP-only for legacy)
  const rl = await checkCaptureRateLimit(env, auth, clientIp, 'capture');
  if (rl.exceeded) {
    const limiter = rl.type === 'ip_guard' ? 'capture_per_ip_guard' : rl.type === 'ip' ? 'capture_per_ip' : 'capture_per_tenant';
    ctx.waitUntil(log(env, 4, 'security', { event: 'security.rate_limit', limiter, tenantId: auth.tenantId, keyName, keyHashPrefix, authMethod, responseStatus: 429, cip }) ?? Promise.resolve());
    if (rl.writePromise) ctx.waitUntil(rl.writePromise);
    const retryAfter = String(rl.resetIn || 60);
    const headers = { 'Retry-After': retryAfter };
    if (rl.limit !== undefined) {
      headers['X-RateLimit-Limit'] = String(rl.limit);
      headers['X-RateLimit-Remaining'] = '0';
      headers['X-RateLimit-Reset'] = retryAfter;
    }
    if (rl.type === 'tenant') {
      return problemResponse(429, 'Per-tenant rate limit exceeded.', headers, { limitType: 'tenant' });
    }
    return problemResponse(429, 'Rate limit exceeded. Try again later.', headers);
  }
  if (rl.writePromise) ctx.waitUntil(rl.writePromise);
  const rlHeaders = {};
  if (rl.limit !== undefined) {
    rlHeaders['X-RateLimit-Limit'] = String(rl.limit);
    rlHeaders['X-RateLimit-Remaining'] = String(rl.remaining);
    rlHeaders['X-RateLimit-Reset'] = String(rl.resetIn);
  }
  if (env.GLOBAL_CAPTURE_LIMITER) {
    const { success } = await env.GLOBAL_CAPTURE_LIMITER.limit({ key: 'global' });
    if (!success) {
      ctx.waitUntil(log(env, 4, 'security', { event: 'security.capacity_limit', tenantId: auth.tenantId, keyName, keyHashPrefix, authMethod, responseStatus: 503, cip }) ?? Promise.resolve());
      return problemResponse(503, 'Service is at capacity. Retry in 10 seconds.', { 'Retry-After': '10' });
    }
  }

  // Step 3: Parse query params
  const params = new URL(request.url).searchParams;

  // limit: default 20, clamp >100, reject <1 / NaN / non-integer
  let limit = 20;
  const limitParam = params.get('limit');
  if (limitParam !== null) {
    const parsed = Number(limitParam);
    if (!Number.isInteger(parsed) || parsed < 1) {
      return problemResponse(400, "Query parameter 'limit' must be a positive integer.");
    }
    limit = Math.min(parsed, 100);
  }

  // offset: default 0, reject negative / NaN / non-integer
  let offset = 0;
  const offsetParam = params.get('offset');
  if (offsetParam !== null) {
    const parsed = Number(offsetParam);
    if (!Number.isInteger(parsed) || parsed < 0) {
      return problemResponse(400, "Query parameter 'offset' must be a non-negative integer.");
    }
    offset = parsed;
  }

  const statusParam = params.get('status') || undefined;
  if (statusParam !== undefined && !['pending', 'complete', 'failed'].includes(statusParam)) {
    return problemResponse(400, "Query parameter 'status' must be 'pending', 'complete', or 'failed'.");
  }

  // url: optional prefix filter, min 4 chars, max 200, no % or _ wildcards
  let urlParam;
  const urlRaw = params.get('url');
  if (urlRaw !== null) {
    if (urlRaw.length < 4) {
      return problemResponse(400, "Query parameter 'url' must be at least 4 characters.");
    }
    if (urlRaw.length > 200) {
      return problemResponse(400, "Query parameter 'url' must be 200 characters or fewer.");
    }
    if (urlRaw.indexOf('%') !== -1 || urlRaw.indexOf('_') !== -1) {
      return problemResponse(400, "Query parameter 'url' must not contain '%' or '_' characters.");
    }
    urlParam = urlRaw;
  }

  // created_after / created_before: ISO 8601 strings
  const createdAfter = params.get('created_after') || undefined;
  const createdBefore = params.get('created_before') || undefined;
  if (createdAfter && isNaN(Date.parse(createdAfter))) {
    return problemResponse(400, "Query parameter 'created_after' must be a valid ISO 8601 date.");
  }
  if (createdBefore && isNaN(Date.parse(createdBefore))) {
    return problemResponse(400, "Query parameter 'created_before' must be a valid ISO 8601 date.");
  }
  if (createdAfter && createdBefore && createdBefore <= createdAfter) {
    return problemResponse(400, "Query parameter 'created_before' must be after 'created_after'.");
  }

  // sort: enum
  const sortRaw = params.get('sort');
  let sort = '-created_at';
  if (sortRaw !== null) {
    if (sortRaw !== 'created_at' && sortRaw !== '-created_at') {
      return problemResponse(400, "Query parameter 'sort' must be 'created_at' or '-created_at'.");
    }
    sort = sortRaw;
  }

  // Step 4: Start timer
  const start = Date.now();

  // Step 5: List captures
  let result;
  try {
    result = await listCaptures(env.DB, auth.tenantId, {
      offset,
      limit,
      status: statusParam,
      url: urlParam,
      created_after: createdAfter,
      created_before: createdBefore,
      sort,
    });
  } catch (err) {
    const durationMs = Date.now() - start;
    ctx.waitUntil(log(env, 5, 'capture', { event: 'capture.list_fail', tenantId: auth.tenantId, keyName, keyHashPrefix, authMethod, responseStatus: 500, errorClass: err.constructor.name, durationMs, cip }) ?? Promise.resolve());
    return problemResponse(500, 'Could not list captures');
  }

  // Step 6: Build CaptureSummary projection (exclude ip, artifacts.*, wacz.key)
  const data = result.data.map(r => {
    const summary = {
      id: r.captureId,
      status: r.status,
      url: r.url,
      createdAt: r.createdAt,
    };
    if (r.status === 'complete') {
      summary.completedAt = r.completedAt;
      summary.renderQuality = r.renderQuality ?? 'full';
    } else if (r.status === 'failed') {
      summary.failedAt = r.failedAt;
      summary.error = r.error;
      summary.retryable = r.retryable;
    }
    return summary;
  });

  // Step 7: Log success
  const durationMs = Date.now() - start;
  ctx.waitUntil(log(env, 6, 'capture', {
    event: 'capture.list',
    tenantId: auth.tenantId,
    keyName,
    keyHashPrefix,
    authMethod,
    responseStatus: 200,
    resultCount: data.length,
    status: statusParam || 'all',
    offset,
    durationMs,
    cip,
  }) ?? Promise.resolve());

  // Step 8: Return response
  return jsonResponse({ data, pagination: result.pagination }, 200, {
    'Cache-Control': 'private, no-store',
    ...rlHeaders,
  });
}

// ---------------------------------------------------------------------------
// Admin: tenant config
// ---------------------------------------------------------------------------

async function handleGetTenantConfig(request, env, ctx, match) {
  const tenantId = match[1];
  const config = await getTenantConfig(env.DB, tenantId);
  if (!config) {
    return problemResponse(404, 'Tenant configuration not found.');
  }
  return jsonResponse(config);
}

async function handlePutTenantConfig(request, env, ctx, match) {
  const tenantId = match[1];

  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.includes('application/json')) {
    return problemResponse(415, 'Content-Type must be application/json');
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return problemResponse(400, 'Request body must be valid JSON');
  }

  if (!body || typeof body !== 'object') {
    return problemResponse(400, 'Request body must be a JSON object');
  }

  let saved;
  try {
    saved = await setTenantConfig(env.DB, tenantId, body, 'admin_key');
  } catch (err) {
    if (err.message && (err.message.startsWith('rateLimit.') || err.message.startsWith('Invalid tenantId'))) {
      return problemResponse(400, err.message);
    }
    throw err;
  }
  ctx.waitUntil(log(env, 3, 'admin', {
    event: 'admin.tenant_config_updated',
    tenantId,
    updatedBy: 'admin_key',
  }) ?? Promise.resolve());
  return jsonResponse(saved);
}

// SECURITY: No authentication required -- capture ID acts as the access secret.
// Response MUST NOT include: ip, raw R2 keys (artifacts.* values, wacz.key).
// Static 404 message for all non-200 cases -- no enumeration of ID existence.
// Cache-Control: private, no-store prevents caching of access-secret responses.
async function handleGetCapture(request, env, ctx, match) {
  const captureId = match[1];

  const record = await getCapture(env.DB, captureId);

  if (!record || record.status !== 'complete') {
    return problemResponse(404, 'Capture not found', { 'Cache-Control': 'no-store' });
  }

  const base = new URL(request.url).origin;
  const artifactBase = `${base}/v1/captures/${captureId}/artifacts`;

  const artifacts = {
    screenshot: `${artifactBase}/screenshot`,
    html: `${artifactBase}/html`,
  };
  if (record.artifacts?.headers) {
    artifacts.headers = `${artifactBase}/headers`;
  }
  if (record.artifacts?.screenshotBefore) {
    artifacts.screenshotBefore = `${artifactBase}/screenshot-before`;
  }

  const body = {
    id: record.captureId,
    status: 'complete',
    url: record.url,
    createdAt: record.createdAt,
    completedAt: record.completedAt,
    renderQuality: record.renderQuality ?? 'full',
    artifacts,
  };

  if (record.render) {
    body.render = record.render;
  }

  if (record.captureSettings) {
    body.captureSettings = record.captureSettings;
  }

  if (record.wacz) {
    body.wacz = {
      url: `${artifactBase}/wacz`,
      size: record.wacz.size,
      bundleHash: record.wacz.bundleHash,
    };
    body.verifyUrl = `${base}/v1/verify/${captureId}`;
  }

  return jsonResponse(body, 200, {
    'Cache-Control': 'private, no-store',
    'Access-Control-Allow-Origin': '*',
  });
}

async function handleGetCaptureArtifact(request, env, ctx, match) {
  const captureId = match[1];
  const artifactName = match[2];

  const record = await getCapture(env.DB, captureId);

  // SECURITY ADVISORY: check status === 'complete' same as metadata endpoint
  if (!record || record.status !== 'complete') {
    return problemResponse(404, 'Capture not found', { 'Cache-Control': 'no-store' });
  }

  // Map kebab artifact names to camelCase KV keys
  const artifactKey = artifactName === 'screenshot-before' ? 'screenshotBefore' : artifactName;

  const r2Key = artifactName === 'wacz'
    ? record.wacz?.key
    : record.artifacts?.[artifactKey];

  if (!r2Key) {
    return problemResponse(404, 'Capture not found', { 'Cache-Control': 'no-store' });
  }

  const obj = await env.BUCKET.get(r2Key);

  if (obj === null) {
    return problemResponse(404, 'Capture not found', { 'Cache-Control': 'no-store' });
  }

  const contentTypes = {
    'screenshot-before': 'image/png',
    screenshot: 'image/png',
    html:       'text/plain',       // CRITICAL: never text/html (XSS)
    headers:    'application/json',
    wacz:       'application/wacz+zip',
  };

  const filenames = {
    'screenshot-before': 'screenshot-before.png',
    screenshot: 'screenshot.png',
    html:       'rendered.html',
    headers:    'headers.json',
    wacz:       'bundle.wacz',
  };

  const buffer = await obj.arrayBuffer();

  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Type': contentTypes[artifactName],
      'Content-Disposition': `attachment; filename="${filenames[artifactName]}"`,
      'Content-Length': String(obj.size),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

// Public endpoint -- no authentication. Rate-limited per IP.
// Caches verified results publicly; non-verified results are not cached.
async function handleVerifyCapture(request, env, ctx, match) {
  const captureId = match[1];
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
  const cip = await computeCip(env, clientIp);

  // Step 1: Rate limit check
  // CF-Connecting-IP is always present in production Workers; 'unknown' fallback
  // applies only in local dev, where all requests share one bucket.
  if (env.VERIFY_RATE_LIMITER) {
    const { success } = await env.VERIFY_RATE_LIMITER.limit({ key: clientIp });
    if (!success) {
      ctx.waitUntil(log(env, 4, 'security', { event: 'security.rate_limit', limiter: 'verify', cip }) ?? Promise.resolve());
      return problemResponse(429, 'Rate limit exceeded. Try again later.', { 'Retry-After': '60' });
    }
  }

  // Steps 2-6: Delegate to shared orchestrator (KV lookup, key resolution, R2, verify)
  const verification = await performVerification({ DB: env.DB, BUCKET: env.BUCKET, SIGNING_KEY: env.SIGNING_KEY }, captureId);

  if (!verification.ok) {
    if (verification.reason === 'not_found') {
      return problemResponse(404, 'Capture not found', { 'Cache-Control': 'no-store' });
    }
    if (verification.reason === 'key_unavailable') {
      ctx.waitUntil(log(env, 5, 'security', {
        event: 'signing.key_unavailable',
        reason: verification.detail,
        captureId,
        cip,
      }) ?? Promise.resolve());
      return problemResponse(503, 'Verification service is not configured');
    }
    if (verification.reason === 'r2_missing') {
      // Data loss: WACZ key recorded in KV but object missing from R2.
      // Return a verification result (not 500) -- this is an observable fact.
      const { record } = verification;
      return jsonResponse({
        verified: false,
        capture: { id: record.captureId, createdAt: record.createdAt, completedAt: record.completedAt, renderQuality: record.renderQuality ?? 'full' },
        signing: null,
        checks: [
          { name: 'artifactHashes', status: 'fail', detail: 'WACZ bundle not found in storage' },
          { name: 'bundleHash',     status: 'fail', detail: 'WACZ bundle not found in storage' },
          { name: 'signature',      status: 'fail', detail: 'WACZ bundle not found in storage' },
        ],
      }, 200, { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
    }
    if (verification.reason === 'too_large') {
      return problemResponse(422, 'WACZ bundle exceeds maximum verifiable size');
    }
    return problemResponse(500, 'Verification error');
  }

  const { record, result } = verification;

  // Step 7: Build response body
  const body = {
    verified: result.verified,
    capture: {
      id: record.captureId,
      createdAt: record.createdAt,
      completedAt: record.completedAt,
      renderQuality: record.renderQuality ?? 'full',
    },
    signing: result.capture || null,
    checks: result.checks,
  };

  if (record.captureSettings) {
    body.captureSettings = record.captureSettings;
  }

  // Step 8: Cache-Control -- only cache verified results
  const cacheControl = result.verified
    ? 'public, max-age=86400, stale-while-revalidate=604800'
    : 'no-store';

  // Step 9: Content negotiation -- serve HTML to browsers
  const accept = request.headers.get('Accept') || '';
  if (accept.includes('text/html')) {
    return htmlVerifyResponse(captureId, new URL(request.url).origin, cacheControl);
  }

  return jsonResponse(body, 200, {
    'Cache-Control': cacheControl,
    'Access-Control-Allow-Origin': '*',
    'Vary': 'Accept',
  });
}

async function handleGetSigningKey(request, env, ctx) {
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
  const cip = await computeCip(env, clientIp);
  if (env.VERIFY_RATE_LIMITER) {
    const { success } = await env.VERIFY_RATE_LIMITER.limit({ key: clientIp });
    if (!success) {
      ctx.waitUntil(log(env, 4, 'security', { event: 'security.rate_limit', limiter: 'signing_key', cip }) ?? Promise.resolve());
      return problemResponse(429, 'Rate limit exceeded. Try again later.', { 'Retry-After': '60' });
    }
  }

  const keys = await getSigningKeys(env);
  if (!keys) {
    ctx.waitUntil(log(env, 5, 'security', {
      event: 'signing.key_unavailable',
      reason: env.SIGNING_KEY ? 'key_invalid' : 'key_absent',
      cip,
    }) ?? Promise.resolve());
    return problemResponse(503, 'Signing is not configured');
  }

  // Use Array.from to avoid spread operator RangeError on large arrays
  const publicKeyBase64 = btoa(Array.from(keys.publicKeyBytes.slice()).map(b => String.fromCharCode(b)).join(''));

  return jsonResponse({ algorithm: 'Ed25519', publicKey: publicKeyBase64, keyId: keys.keyId }, 200, {
    'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    'Access-Control-Allow-Origin': '*',
  });
}

async function handleGetSigningKeys(request, env, ctx) {
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
  const cip = await computeCip(env, clientIp);
  if (env.VERIFY_RATE_LIMITER) {
    const { success } = await env.VERIFY_RATE_LIMITER.limit({ key: clientIp });
    if (!success) {
      ctx.waitUntil(log(env, 4, 'security', { event: 'security.rate_limit', limiter: 'signing_keys', cip }) ?? Promise.resolve());
      return problemResponse(429, 'Rate limit exceeded. Try again later.', { 'Retry-After': '60' });
    }
  }

  const archived = await listArchivedSigningKeys(env.DB);

  return jsonResponse({ keys: archived }, 200, {
    'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    'Access-Control-Allow-Origin': '*',
  });
}

async function handleCaptureStatus(request, env, ctx, match) {
  // match[1] is validated by regex: cap_[a-f0-9]{32}
  const captureId = match[1];

  const record = await getCapture(env.DB, captureId);

  // SECURITY: Static string -- do NOT echo captureId back in response body
  if (!record) return problemResponse(404, 'Capture not found');

  const headers = { 'Cache-Control': 'private, no-store' };

  if (record.status === 'pending') {
    return jsonResponse({ id: captureId, status: 'pending' }, 200, {
      ...headers,
      'Retry-After': '10',
    });
  }

  if (record.status === 'complete') {
    const captureUrl = new URL(`/v1/captures/${captureId}`, request.url).href;
    return jsonResponse({ id: captureId, status: 'complete', captureUrl }, 200, headers);
  }

  // failed
  return jsonResponse({
    id: captureId,
    status: 'failed',
    error: record.error,
    retryable: record.retryable,
  }, 200, headers);
}
