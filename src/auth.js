/*
 * auth.js -- API key authentication for the Web Resource Ledger Worker
 *
 * Trust boundary: the Authorization header is untrusted caller input.
 * Every request that passes returns { ok: true }; failed requests return
 * { ok: false, response } with a ready-to-send Response object.
 *
 * Attack categories defended against:
 *   - Timing side-channel key comparison (crypto.subtle.timingSafeEqual)
 *   - Key leakage via error responses or logs (never echoed)
 *   - Scheme confusion (only Bearer scheme accepted)
 *   - Misconfigured deployments (503 when env var is absent)
 *
 * Tests: test/auth.test.js
 */ // tva

import { problemResponse } from './responses.js';

/**
 * Verifies the Bearer API key in the Authorization header against
 * the CAPTURE_API_KEY environment binding.
 *
 * Returns a discriminated result object; NEVER throws for auth failures.
 *
 * @param {Request} request
 * @param {{ CAPTURE_API_KEY?: string }} env
 * @returns {Promise<{ ok: true } | { ok: false, response: Response }>}
 */
export async function verifyApiKey(request, env) {
  // Step 1: Misconfiguration guard
  if (!env.CAPTURE_API_KEY) {
    return { ok: false, response: problemResponse(503, 'Service is not configured') };
  }

  // Step 2: Authorization header presence
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) {
    return {
      ok: false,
      response: problemResponse(401, 'Authorization header is required', { 'WWW-Authenticate': 'Bearer' }),
    };
  }

  // Step 3: Bearer scheme check
  if (!authHeader.startsWith('Bearer ')) {
    return {
      ok: false,
      response: problemResponse(401, 'Authorization header must use Bearer scheme', { 'WWW-Authenticate': 'Bearer' }),
    };
  }

  // Step 4: Extract token
  const provided = authHeader.slice('Bearer '.length);

  // Step 5: Timing-safe comparison
  // SECURITY: Never log or echo `provided` -- doing so would leak the caller's key.
  const enc = new TextEncoder();
  const a = enc.encode(provided);
  const b = enc.encode(env.CAPTURE_API_KEY);

  if (a.byteLength !== b.byteLength) {
    // NOTE: This early return leaks the key *length* via timing, but CAPTURE_API_KEY
    // length is fixed at deploy time and is not a secret (it is an operational constant
    // chosen by the operator). Constant-time padding to mask length is not warranted here.
    return {
      ok: false,
      response: problemResponse(401, 'Invalid API key', { 'WWW-Authenticate': 'Bearer' }),
    };
  }

  const match = await crypto.subtle.timingSafeEqual(a, b);
  if (!match) {
    return {
      ok: false,
      response: problemResponse(401, 'Invalid API key', { 'WWW-Authenticate': 'Bearer' }),
    };
  }

  // Step 6: Success
  return { ok: true };
}
