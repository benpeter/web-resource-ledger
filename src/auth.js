/*
 * auth.js -- API key authentication for the Web Resource Ledger Worker
 *
 * Trust boundary: the Authorization header is untrusted caller input.
 * Every request that passes returns { ok: true, tenantId: string }; failed
 * requests return { ok: false, response } with a ready-to-send Response object.
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

/** Regex for valid tenant IDs -- callers may use tenantId in key construction without further sanitization. */
const TENANT_ID_RE = /^[a-z0-9_-]{1,64}$/;

/**
 * Verifies the Bearer API key in the Authorization header against
 * the CAPTURE_API_KEY environment binding.
 *
 * Returns a discriminated result object; NEVER throws for auth failures.
 * Error results do NOT include tenantId -- a failed auth reveals nothing
 * about tenant structure.
 *
 * @param {Request} request
 * @param {{ CAPTURE_API_KEY?: string }} env
 * @returns {Promise<{ ok: true, tenantId: string } | { ok: false, response: Response }>}
 *   On success, tenantId matches /^[a-z0-9_-]{1,64}$/ -- callers may use it
 *   in key construction without further sanitization.
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
  // Hardcoded for now; R12 (per-tenant keys) will derive this from the key record.
  const tenantId = 'default';
  // Validate tenantId against the contract even though value is hardcoded today.
  // This ensures the validation path is exercised and R12 can rely on it.
  if (!TENANT_ID_RE.test(tenantId)) {
    return { ok: false, response: problemResponse(500, 'Tenant configuration error') };
  }
  return { ok: true, tenantId };
}
