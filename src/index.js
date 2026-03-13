import { problemResponse, jsonResponse } from './responses.js';
import { verifyApiKey } from './auth.js';
import { validateUrl } from './url-validation.js';
import { createCapture, getCapture } from './kv.js';
import { performCapture } from './capture.js';

// tva

// Routes: [method, pattern, handler]
// Order matters: most specific pattern first.
// Add new routes as one-line tuples.
const routes = [
  ['GET',  /^\/health$/, handleHealth],
  ['POST', /^\/v1\/captures$/, handleCreateCapture],
  ['GET',  /^\/v1\/captures\/(cap_[a-f0-9]{32})\/status$/, handleCaptureStatus],
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
