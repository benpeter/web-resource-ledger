/*
 * auth.js -- API key authentication for the Web Resource Ledger Worker
 *
 * Trust boundary: the Authorization header is untrusted caller input.
 * Success returns { ok: true, tenantId, scopes, keyName, authMethod, keyHash };
 * failure returns { ok: false, response, reason } with a ready-to-send Response.
 *
 * Authentication paths (in order):
 *   1. KV-based key lookup (per-tenant keys, R12)
 *   2. ADMIN_KEY env-var (infrastructure credential, admin scope only)
 *   3. CAPTURE_API_KEY env-var (legacy fallback, deprecated)
 *
 * Attack categories defended against:
 *   - Timing side-channel key comparison (crypto.subtle.timingSafeEqual)
 *   - Key leakage via error responses or logs (never echoed)
 *   - Scheme confusion (only Bearer scheme accepted)
 *   - Misconfigured deployments (503 when no auth source is bound)
 *   - Revoked key fallthrough (revoked KV keys NEVER reach env-var checks)
 *
 * Tests: test/auth.test.js
 */ // tva

import { problemResponse } from './responses.js';

/** Regex for valid tenant IDs -- callers may use tenantId in key construction without further sanitization. */
export const TENANT_ID_RE = /^[a-z0-9_-]{1,64}$/;

/** Controlled vocabulary for auth failure reasons. */
export const AUTH_FAIL_REASONS = {
  MISSING_HEADER: 'missing_header',
  INVALID_SCHEME: 'invalid_scheme',
  KEY_NOT_FOUND: 'key_not_found',
  KEY_REVOKED: 'key_revoked',
  MISCONFIGURED: 'misconfigured',
};

/**
 * Timing-safe string comparison. Returns false if lengths differ (no padding).
 */
async function timingSafeMatch(provided, expected) {
  const enc = new TextEncoder();
  const a = enc.encode(provided);
  const b = enc.encode(expected);
  if (a.byteLength !== b.byteLength) return false;
  return crypto.subtle.timingSafeEqual(a, b);
}

/**
 * SHA-256 hex digest of a raw key string.
 * Exported so admin.js can hash keys before writing to KV.
 */
export async function hashKey(rawKey) {
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(rawKey));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Checks that auth carries a required scope. Returns a 403 Response on failure, null on success.
 *
 * @param {{ scopes: string[] }} auth
 * @param {string} scope
 * @returns {Response | null}
 */
export function requireScope(auth, scope) {
  if (!auth.scopes.includes(scope)) {
    return problemResponse(403, `This API key does not have the '${scope}' scope required for this operation`);
  }
  return null;
}

/**
 * Verifies the Bearer API key in the Authorization header.
 *
 * Tries three auth paths in order: KV record, ADMIN_KEY, CAPTURE_API_KEY.
 * Returns a discriminated result object; NEVER throws for auth failures.
 * Error results reveal nothing about tenant structure.
 *
 * @param {Request} request
 * @param {{ KV?: KVNamespace, ADMIN_KEY?: string, CAPTURE_API_KEY?: string }} env
 * @returns {Promise<
 *   { ok: true, tenantId: string|null, scopes: string[], keyName: string, authMethod: string, keyHash: string|null }
 *   | { ok: false, response: Response, reason: string, keyName?: string }
 * >}
 */
export async function verifyApiKey(request, env) {
  // Step 0: Misconfiguration guard -- at least one auth source must be configured.
  if (!env.KV && !env.ADMIN_KEY && !env.CAPTURE_API_KEY) {
    return {
      ok: false,
      response: problemResponse(503, 'Authentication service is not configured'),
      reason: AUTH_FAIL_REASONS.MISCONFIGURED,
    };
  }

  // Step 1: Extract Bearer token from Authorization header.
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) {
    return {
      ok: false,
      response: problemResponse(401, 'Authorization header is required', { 'WWW-Authenticate': 'Bearer' }),
      reason: AUTH_FAIL_REASONS.MISSING_HEADER,
    };
  }

  if (!authHeader.startsWith('Bearer ')) {
    return {
      ok: false,
      response: problemResponse(401, 'Authorization header must use Bearer scheme', { 'WWW-Authenticate': 'Bearer' }),
      reason: AUTH_FAIL_REASONS.INVALID_SCHEME,
    };
  }

  const token = authHeader.slice('Bearer '.length);
  if (!token) {
    return {
      ok: false,
      response: problemResponse(401, 'Authorization header must use Bearer scheme', { 'WWW-Authenticate': 'Bearer' }),
      reason: AUTH_FAIL_REASONS.INVALID_SCHEME,
    };
  }

  // Step 2: SHA-256 the token for KV lookup.
  // SECURITY: Never log or echo `token` -- doing so would leak the caller's key.
  const enc = new TextEncoder();
  const keyHash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(token)))]
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  // Step 3: KV lookup (only if KV is bound).
  if (env.KV) {
    let record;
    try {
      record = await env.KV.get(`apikey:${keyHash}`, 'json');
    } catch (err) {
      // KV error -- FAIL CLOSED. Do not fall through to env-var checks.
      return {
        ok: false,
        response: problemResponse(500, 'Authentication service error'),
        reason: AUTH_FAIL_REASONS.MISCONFIGURED,
      };
    }

    if (record !== null) {
      // SECURITY INVARIANT: A revoked key MUST NOT fall through to env-var checks.
      if (record.revoked === true) {
        return {
          ok: false,
          response: problemResponse(401, 'Invalid API key', { 'WWW-Authenticate': 'Bearer' }),
          reason: AUTH_FAIL_REASONS.KEY_REVOKED,
        };
      }

      // Valid KV record found -- validate tenantId and expand scopes.
      if (!TENANT_ID_RE.test(record.tenantId)) {
        return { ok: false, response: problemResponse(500, 'Tenant configuration error'), reason: AUTH_FAIL_REASONS.MISCONFIGURED };
      }

      const scopes = [...record.scopes];
      if (scopes.includes('capture') && !scopes.includes('read')) scopes.push('read');

      return {
        ok: true,
        tenantId: record.tenantId,
        scopes,
        keyName: record.keyName ?? keyHash.slice(0, 8),
        authMethod: 'kv',
        keyHash,
      };
    }
    // record === null: key not in KV, continue to env-var checks.
  }

  // Step 4: ADMIN_KEY env-var check.
  if (env.ADMIN_KEY) {
    const match = await timingSafeMatch(token, env.ADMIN_KEY);
    if (match) {
      return {
        ok: true,
        tenantId: null,
        scopes: ['admin'],
        keyName: 'ADMIN_KEY',
        authMethod: 'env-admin',
        keyHash: null,
      };
    }
  }

  // Step 5: CAPTURE_API_KEY env-var fallback (deprecated).
  if (env.CAPTURE_API_KEY) {
    const match = await timingSafeMatch(token, env.CAPTURE_API_KEY);
    if (match) {
      console.warn('CAPTURE_API_KEY env-var fallback used -- provision KV-based keys via the admin API');
      return {
        ok: true,
        tenantId: 'default',
        scopes: ['capture', 'read'],
        keyName: 'CAPTURE_API_KEY',
        authMethod: 'env-capture',
        keyHash: null,
      };
    }
  }

  // Step 6: No match across any auth path.
  return {
    ok: false,
    response: problemResponse(401, 'Invalid API key', { 'WWW-Authenticate': 'Bearer' }),
    reason: AUTH_FAIL_REASONS.KEY_NOT_FOUND,
  };
}
