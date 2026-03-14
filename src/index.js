import { problemResponse, jsonResponse } from './responses.js';
import { verifyApiKey } from './auth.js';
import { validateUrl } from './url-validation.js';
import { createCapture, getCapture } from './kv.js';
import { performCapture } from './capture.js';
import { verifyWacz } from './verify.js';
import { getSigningKeys } from './signing.js';

// tva

// Routes: [method, pattern, handler]
// Order matters: most specific pattern first.
// Add new routes as one-line tuples.
const routes = [
  ['GET',  /^\/health$/, handleHealth],
  ['POST', /^\/v1\/captures$/, handleCreateCapture],
  ['GET',  /^\/v1\/captures\/(cap_[a-f0-9]{32})\/status$/, handleCaptureStatus],
  ['GET',  /^\/v1\/captures\/(cap_[a-f0-9]{32})$/, handleGetCapture],
  ['GET',  /^\/v1\/captures\/(cap_[a-f0-9]{32})\/artifacts\/(screenshot|html|headers|wacz)$/, handleGetCaptureArtifact],
  ['GET',  /^\/v1\/verify\/(cap_[a-f0-9]{32})$/, handleVerifyCapture],
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
    return response;
  },
};

function handleHealth() {
  return jsonResponse({ status: 'ok' });
}

async function handleCreateCapture(request, env, ctx) {
  // Step 1: Content-Type check
  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.includes('application/json')) {
    return problemResponse(415, 'Content-Type must be application/json');
  }

  // Step 2: Auth check
  const auth = await verifyApiKey(request, env);
  if (!auth.ok) return auth.response;

  // Step 3: Rate limit check
  if (env.CAPTURE_RATE_LIMITER) {
    const { success } = await env.CAPTURE_RATE_LIMITER.limit({
      key: request.headers.get('CF-Connecting-IP') || 'unknown',
    });
    if (!success) return problemResponse(429, 'Rate limit exceeded. Try again later.', { 'Retry-After': '60' });
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
  if (!result.ok) return problemResponse(result.status, result.detail);

  // Step 7: Generate capture ID
  const captureId = 'cap_' + crypto.randomUUID().replace(/-/g, '');

  // Step 8: Write pending record to KV (synchronously before returning 202)
  try {
    await createCapture(env.KV, captureId, result.url, result.ip);
  } catch {
    return problemResponse(500, 'Could not create capture record');
  }

  // Step 9: Trigger background capture
  ctx.waitUntil(performCapture(env, result.url, result.ip, captureId));

  // Step 10: Build absolute status URL
  const statusUrl = new URL(`/v1/captures/${captureId}/status`, request.url).href;

  // Step 11: Return 202
  return jsonResponse({
    id: captureId,
    statusUrl,
    note: 'No list endpoint is available. Store the capture ID -- it is the only way to access this capture.',
  }, 202, { 'Retry-After': '5' });
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
    if (!success) return problemResponse(429, 'Rate limit exceeded. Try again later.', { 'Retry-After': '60' });
  }

  // Step 2: Signing key availability check
  const keys = await getSigningKeys(env);
  if (!keys) return problemResponse(503, 'Verification service is not configured');

  // Step 3: KV lookup (fast-fail before expensive R2 fetch)
  const record = await getCapture(env.KV, captureId);
  if (!record || record.status !== 'complete' || !record.wacz) {
    return problemResponse(404, 'Capture not found', { 'Cache-Control': 'no-store' });
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
  const result = await verifyWacz(waczBytes, keys.publicKeyBytes);

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

  return jsonResponse(body, 200, {
    'Cache-Control': cacheControl,
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
