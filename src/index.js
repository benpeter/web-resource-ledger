import { problemResponse, jsonResponse } from './responses.js';
import { verifyApiKey } from './auth.js';
import { validateUrl } from './url-validation.js';
import { createCapture, getCapture, listCaptures, getArchivedSigningKey, listArchivedSigningKeys } from './kv.js';
import { performCapture } from './capture.js';
import { verifyWacz } from './verify.js';
import { getSigningKeys, verifySignature } from './signing.js';
import { htmlVerifyResponse } from './verify-page.js';
import { log } from './log.js';

// tva

// Routes: [method, pattern, handler]
// Order matters: most specific pattern first.
// Add new routes as one-line tuples.
const routes = [
  ['GET',  /^\/health$/, handleHealth],
  ['POST', /^\/v1\/captures$/, handleCreateCapture],
  ['GET',  /^\/v1\/captures$/, handleListCaptures],
  ['GET',  /^\/v1\/captures\/(cap_[a-f0-9]{32})\/status$/, handleCaptureStatus],
  ['GET',  /^\/v1\/captures\/(cap_[a-f0-9]{32})$/, handleGetCapture],
  ['GET',  /^\/v1\/captures\/(cap_[a-f0-9]{32})\/artifacts\/(screenshot|html|headers|wacz)$/, handleGetCaptureArtifact],
  ['GET',  /^\/v1\/verify\/(cap_[a-f0-9]{32})$/, handleVerifyCapture],
  ['GET',  /^\/\.well-known\/signing-key$/, handleGetSigningKey],
  ['GET',  /^\/\.well-known\/signing-keys$/, handleGetSigningKeys],
];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // Normalize trailing slashes: /health/ matches /health
    const pathname = url.pathname.replace(/\/$/, '') || '/';

    let response;
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

    response.headers.set('Referrer-Policy', 'no-referrer');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    // URL is coupled to the GitHub repository path -- update if the repo is renamed.
    response.headers.set('Link', '<https://github.com/benpeter/web-resource-ledger/blob/main/TERMS.md>; rel="terms-of-service"');
    return response;
  },
};

function handleHealth() {
  return jsonResponse({
    status: 'ok',
    legal: {
      terms: 'https://github.com/benpeter/web-resource-ledger/blob/main/TERMS.md',
      policy: 'https://github.com/benpeter/web-resource-ledger/blob/main/CONTENT-POLICY.md',
    },
  });
}

async function handleCreateCapture(request, env, ctx) {
  // Step 1: Content-Type check
  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.includes('application/json')) {
    return problemResponse(415, 'Content-Type must be application/json');
  }

  // Step 2: Auth check
  const auth = await verifyApiKey(request, env);
  if (!auth.ok) {
    ctx.waitUntil(log(env, 5, 'security', { event: 'security.auth_fail', status: auth.response.status }) ?? Promise.resolve());
    return auth.response;
  }
  const { tenantId } = auth;

  // Step 3: Rate limit check
  if (env.CAPTURE_RATE_LIMITER) {
    const { success } = await env.CAPTURE_RATE_LIMITER.limit({
      key: request.headers.get('CF-Connecting-IP') || 'unknown',
    });
    if (!success) {
      ctx.waitUntil(log(env, 4, 'security', { event: 'security.rate_limit', limiter: 'capture_per_ip' }) ?? Promise.resolve());
      return problemResponse(429, 'Rate limit exceeded. Try again later.', { 'Retry-After': '60' });
    }
  }

  // Global rate limit check (service capacity protection)
  if (env.GLOBAL_CAPTURE_LIMITER) {
    const { success } = await env.GLOBAL_CAPTURE_LIMITER.limit({ key: 'global' });
    if (!success) {
      ctx.waitUntil(log(env, 4, 'security', { event: 'security.capacity_limit' }) ?? Promise.resolve());
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
    ctx.waitUntil(log(env, 5, 'security', { event: 'security.ssrf_block', tenantId, reason: result.detail.startsWith('URL scheme') ? 'url_scheme_not_allowed' : result.detail }) ?? Promise.resolve());
    return problemResponse(result.status, result.detail);
  }

  // Step 7: Generate capture ID
  const captureId = 'cap_' + crypto.randomUUID().replace(/-/g, '');

  // Step 8: Write pending record to KV (synchronously before returning 202)
  try {
    await createCapture(env.KV, captureId, result.url, result.ip, tenantId);
  } catch {
    return problemResponse(500, 'Could not create capture record');
  }

  // Step 9: Trigger background capture
  ctx.waitUntil(performCapture(env, result.url, result.ip, captureId, tenantId));

  // Step 10: Build absolute status URL
  const statusUrl = new URL(`/v1/captures/${captureId}/status`, request.url).href;

  // Step 11: Return 202
  return jsonResponse({
    id: captureId,
    statusUrl,
    note: 'Use GET /v1/captures to list and search your captures.',
  }, 202, { 'Retry-After': '5' });
}

async function handleListCaptures(request, env, ctx) {
  // Step 1: Auth check
  const auth = await verifyApiKey(request, env);
  if (!auth.ok) {
    ctx.waitUntil(log(env, 5, 'security', { event: 'security.auth_fail', status: auth.response.status }) ?? Promise.resolve());
    return auth.response;
  }

  // Step 2: Rate limit checks (reuse capture limiters -- list is read-only but
  // fans out to N+1 KV operations, so both per-IP and global limits apply)
  if (env.CAPTURE_RATE_LIMITER) {
    const { success } = await env.CAPTURE_RATE_LIMITER.limit({
      key: request.headers.get('CF-Connecting-IP') || 'unknown',
    });
    if (!success) {
      ctx.waitUntil(log(env, 4, 'security', { event: 'security.rate_limit', limiter: 'capture_per_ip' }) ?? Promise.resolve());
      return problemResponse(429, 'Rate limit exceeded. Try again later.', { 'Retry-After': '60' });
    }
  }
  if (env.GLOBAL_CAPTURE_LIMITER) {
    const { success } = await env.GLOBAL_CAPTURE_LIMITER.limit({ key: 'global' });
    if (!success) {
      ctx.waitUntil(log(env, 4, 'security', { event: 'security.capacity_limit' }) ?? Promise.resolve());
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

  const cursor = params.get('cursor') || undefined;

  const statusParam = params.get('status') || undefined;
  if (statusParam !== undefined && !['pending', 'complete', 'failed'].includes(statusParam)) {
    return problemResponse(400, "Query parameter 'status' must be 'pending', 'complete', or 'failed'.");
  }

  // Step 4: Start timer
  const start = Date.now();

  // Step 5: List captures
  let result;
  try {
    result = await listCaptures(env.KV, auth.tenantId, { cursor, limit, status: statusParam });
  } catch (err) {
    const durationMs = Date.now() - start;
    ctx.waitUntil(log(env, 3, 'list', { event: 'list.error', tenantId: auth.tenantId, errorClass: err.constructor.name, durationMs }) ?? Promise.resolve());
    return problemResponse(500, 'Could not list captures');
  }

  if (result.error === 'invalid_cursor') {
    return problemResponse(400, "Query parameter 'cursor' is invalid.");
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
    } else if (r.status === 'failed') {
      summary.failedAt = r.failedAt;
      summary.error = r.error;
      summary.retryable = r.retryable;
    }
    return summary;
  });

  // Step 7: Log success
  const durationMs = Date.now() - start;
  ctx.waitUntil(log(env, 6, 'list', {
    event: 'list.success',
    tenantId: auth.tenantId,
    resultCount: data.length,
    status: statusParam || 'all',
    cursor: result.pagination.cursor ? 'present' : 'absent',
    durationMs,
  }) ?? Promise.resolve());

  // Step 8: Return response
  return jsonResponse({ data, pagination: result.pagination }, 200, {
    'Cache-Control': 'private, no-store',
  });
}

// SECURITY: No authentication required -- capture ID acts as the access secret.
// Response MUST NOT include: ip, raw R2 keys (artifacts.* values, wacz.key).
// Static 404 message for all non-200 cases -- no enumeration of ID existence.
// Cache-Control: private, no-store prevents caching of access-secret responses.
async function handleGetCapture(request, env, ctx, match) {
  const captureId = match[1];

  const record = await getCapture(env.KV, captureId);

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

  const body = {
    id: record.captureId,
    status: 'complete',
    url: record.url,
    createdAt: record.createdAt,
    completedAt: record.completedAt,
    artifacts,
  };

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

  const record = await getCapture(env.KV, captureId);

  // SECURITY ADVISORY: check status === 'complete' same as metadata endpoint
  if (!record || record.status !== 'complete') {
    return problemResponse(404, 'Capture not found', { 'Cache-Control': 'no-store' });
  }

  const r2Key = artifactName === 'wacz'
    ? record.wacz?.key
    : record.artifacts?.[artifactName];

  if (!r2Key) {
    return problemResponse(404, 'Capture not found', { 'Cache-Control': 'no-store' });
  }

  const obj = await env.BUCKET.get(r2Key);

  if (obj === null) {
    return problemResponse(404, 'Capture not found', { 'Cache-Control': 'no-store' });
  }

  const contentTypes = {
    screenshot: 'image/png',
    html:       'text/plain',       // CRITICAL: never text/html (XSS)
    headers:    'application/json',
    wacz:       'application/wacz+zip',
  };

  const filenames = {
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

  // Step 1: Rate limit check
  // CF-Connecting-IP is always present in production Workers; 'unknown' fallback
  // applies only in local dev, where all requests share one bucket.
  if (env.VERIFY_RATE_LIMITER) {
    const { success } = await env.VERIFY_RATE_LIMITER.limit({
      key: request.headers.get('CF-Connecting-IP') || 'unknown',
    });
    if (!success) {
      ctx.waitUntil(log(env, 4, 'security', { event: 'security.rate_limit', limiter: 'verify' }) ?? Promise.resolve());
      return problemResponse(429, 'Rate limit exceeded. Try again later.', { 'Retry-After': '60' });
    }
  }

  // Step 2: KV lookup (fast-fail before expensive R2 fetch)
  const record = await getCapture(env.KV, captureId);
  if (!record || record.status !== 'complete' || !record.wacz) {
    return problemResponse(404, 'Capture not found', { 'Cache-Control': 'no-store' });
  }

  // Step 3: Resolve public key for verification
  // SECURITY: keyId is read from the KV record (server-controlled), NEVER from the
  // WACZ's signedData. The WACZ-embedded keyId is for offline/third-party verifiers
  // only and must not influence server-side key selection.
  // Priority: KV record keyId → archived key → current key (legacy fallback)
  let publicKeyBytes = null;
  if (record.wacz.keyId) {
    // Server-controlled: keyId stored at signing time
    const archived = await getArchivedSigningKey(env.KV, record.wacz.keyId);
    if (archived) {
      publicKeyBytes = Uint8Array.from(atob(archived.publicKey), c => c.charCodeAt(0));
    }
  }
  if (!publicKeyBytes) {
    // Fallback: current signing key (covers legacy captures before key versioning)
    const keys = await getSigningKeys(env);
    if (keys) publicKeyBytes = keys.publicKeyBytes;
  }
  if (!publicKeyBytes) {
    return problemResponse(503, 'Verification service is not configured');
  }

  // Step 4: R2 fetch
  const obj = await env.BUCKET.get(record.wacz.key);
  if (obj === null) {
    // Data loss: WACZ key recorded in KV but object missing from R2.
    // Return a verification result (not 500) -- this is an observable fact.
    return jsonResponse({
      verified: false,
      capture: { id: record.captureId, createdAt: record.createdAt, completedAt: record.completedAt },
      signing: null,
      checks: [
        { name: 'artifactHashes', status: 'fail', detail: 'WACZ bundle not found in storage' },
        { name: 'bundleHash',     status: 'fail', detail: 'WACZ bundle not found in storage' },
        { name: 'signature',      status: 'fail', detail: 'WACZ bundle not found in storage' },
      ],
    }, 200, { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
  }

  // Step 5: Size guard -- MUST happen before arrayBuffer() to gate memory allocation
  const MAX_WACZ_BYTES = 104857600; // 100 MB
  if (obj.size > MAX_WACZ_BYTES) {
    return problemResponse(422, 'WACZ bundle exceeds maximum verifiable size');
  }

  // Step 6: Verify
  const waczBytes = new Uint8Array(await obj.arrayBuffer());
  const result = await verifyWacz(waczBytes, publicKeyBytes);

  // Step 7: Build response body
  const body = {
    verified: result.verified,
    capture: {
      id: record.captureId,
      createdAt: record.createdAt,
      completedAt: record.completedAt,
    },
    signing: result.capture || null,
    checks: result.checks,
  };

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
  if (env.VERIFY_RATE_LIMITER) {
    const { success } = await env.VERIFY_RATE_LIMITER.limit({
      key: request.headers.get('CF-Connecting-IP') || 'unknown',
    });
    if (!success) {
      ctx.waitUntil(log(env, 4, 'security', { event: 'security.rate_limit', limiter: 'signing_key' }) ?? Promise.resolve());
      return problemResponse(429, 'Rate limit exceeded. Try again later.', { 'Retry-After': '60' });
    }
  }

  const keys = await getSigningKeys(env);
  if (!keys) return problemResponse(503, 'Signing is not configured');

  // Use Array.from to avoid spread operator RangeError on large arrays
  const publicKeyBase64 = btoa(Array.from(keys.publicKeyBytes.slice()).map(b => String.fromCharCode(b)).join(''));

  return jsonResponse({ algorithm: 'Ed25519', publicKey: publicKeyBase64, keyId: keys.keyId }, 200, {
    'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    'Access-Control-Allow-Origin': '*',
  });
}

async function handleGetSigningKeys(request, env, ctx) {
  if (env.VERIFY_RATE_LIMITER) {
    const { success } = await env.VERIFY_RATE_LIMITER.limit({
      key: request.headers.get('CF-Connecting-IP') || 'unknown',
    });
    if (!success) {
      ctx.waitUntil(log(env, 4, 'security', { event: 'security.rate_limit', limiter: 'signing_keys' }) ?? Promise.resolve());
      return problemResponse(429, 'Rate limit exceeded. Try again later.', { 'Retry-After': '60' });
    }
  }

  const archived = await listArchivedSigningKeys(env.KV);

  return jsonResponse({ keys: archived }, 200, {
    'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    'Access-Control-Allow-Origin': '*',
  });
}

async function handleCaptureStatus(request, env, ctx, match) {
  // match[1] is validated by regex: cap_[a-f0-9]{32}
  const captureId = match[1];

  const record = await getCapture(env.KV, captureId);

  // SECURITY: Static string -- do NOT echo captureId back in response body
  if (!record) return problemResponse(404, 'Capture not found');

  const headers = { 'Cache-Control': 'private, no-store' };

  if (record.status === 'pending') {
    return jsonResponse({ id: captureId, status: 'pending' }, 200, {
      ...headers,
      'Retry-After': '5',
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
