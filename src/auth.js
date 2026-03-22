/*
 * auth.js -- API key authentication for the Web Resource Ledger Worker
 *
 * Trust boundary: the Authorization header is untrusted caller input.
 * Successful tenant auth returns { ok: true, tenantId, scopes, keyName, keyHashPrefix, authMethod };
 * successful admin auth returns { ok: true, authMethod: 'admin_key' }.
 * Failed requests return { ok: false, response, reason, ... } with a ready-to-send
 * Response object and a machine-readable reason code.
 *
 * Auth paths:
 *   - verifyApiKey: KV-based lookup for capture/read endpoints, legacy fallback
 *   - verifyAdminKey: infrastructure secret comparison for /v1/admin/* endpoints
 *
 * Attack categories defended against:
 *   - Timing side-channel key comparison (crypto.subtle.timingSafeEqual)
 *   - Key leakage via error responses or logs (raw token never echoed; hash prefix only)
 *   - Scheme confusion (only Bearer scheme accepted)
 *   - Misconfigured deployments (503 when all auth bindings are absent)
 *   - KV I/O failure propagation (fail loudly, not silently degrade to legacy)
 *   - Revoked key fallthrough to legacy (revoked keys are hard-rejected)
 *
 * Tests: test/auth.test.js
 */ // tva

import { problemResponse } from './responses.js';
import { log } from './log.js';
import { TENANT_ID_RE, getApiKeyRecord } from './db.js';

/**
 * Hashes a raw API key with SHA-256, returning lowercase hex.
 * Used for KV lookup and safe logging (prefix only). Compute once per request.
 *
 * @param {string} rawKey
 * @returns {Promise<string>} 64-character lowercase hex string
 */
export async function hashApiKey(rawKey) {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(rawKey));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Returns true if grantedScopes satisfies requiredScope.
 * Special implication: 'capture' implies 'read'.
 * 'admin' does NOT imply 'capture' or 'read'.
 *
 * @param {string[]} grantedScopes
 * @param {string} requiredScope
 * @returns {boolean}
 */
export function hasScope(grantedScopes, requiredScope) {
  if (grantedScopes.includes(requiredScope)) return true;
  // capture implies read
  if (requiredScope === 'read' && grantedScopes.includes('capture')) return true;
  return false;
}

/**
 * Extracts a Bearer token from an Authorization header.
 * Returns { ok: true, token } or { ok: false, reason, response }.
 *
 * @param {Request} request
 * @returns {{ ok: true, token: string } | { ok: false, reason: string, response: Response }}
 */
function extractBearerToken(request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) {
    return {
      ok: false,
      reason: 'missing_header',
      response: problemResponse(401, 'Authorization header is required', { 'WWW-Authenticate': 'Bearer' }),
    };
  }
  if (!authHeader.startsWith('Bearer ')) {
    return {
      ok: false,
      reason: 'invalid_scheme',
      response: problemResponse(401, 'Authorization header must use Bearer scheme', { 'WWW-Authenticate': 'Bearer' }),
    };
  }
  const token = authHeader.slice('Bearer '.length);
  if (!token) {
    return {
      ok: false,
      reason: 'invalid_scheme',
      response: problemResponse(401, 'Authorization header must use Bearer scheme', { 'WWW-Authenticate': 'Bearer' }),
    };
  }
  return { ok: true, token };
}

/**
 * Timing-safe comparison of two strings. Returns true if equal.
 * NOTE: length difference leaks key length via timing, but the key length is an
 * operational constant chosen at deploy time and is not a secret.
 *
 * @param {string} a
 * @param {string} b
 * @returns {Promise<boolean>}
 */
async function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);
  if (aBytes.byteLength !== bBytes.byteLength) return false;
  return crypto.subtle.timingSafeEqual(aBytes, bBytes);
}

/**
 * Verifies the Bearer API key in the Authorization header.
 * Resolution order:
 *   1. KV lookup by SHA-256 hash of the token
 *   2. Legacy CAPTURE_API_KEY timing-safe comparison (only on KV miss)
 *
 * SECURITY: Revoked keys are hard-rejected and do NOT fall through to legacy.
 * KV I/O errors fail loudly (500) and do NOT fall through to legacy.
 *
 * @param {Request} request
 * @param {{ KV?: KVNamespace, CAPTURE_API_KEY?: string }} env
 * @param {{ requiredScope?: string }} [options]
 * @returns {Promise<
 *   { ok: true, tenantId: string, scopes: string[], keyName: string|null, keyHashPrefix: string, authMethod: string }
 *   | { ok: false, response: Response, reason: string, keyName?: string, keyHashPrefix?: string, tenantId?: string }
 * >}
 */
export async function verifyApiKey(request, env, { requiredScope = 'capture' } = {}) {
  // Misconfiguration guard: at least one auth mechanism must be present
  if (!env.DB && !env.CAPTURE_API_KEY) {
    return {
      ok: false,
      response: problemResponse(503, 'Service is not configured'),
      reason: 'service_not_configured',
    };
  }

  // Extract Bearer token
  const extracted = extractBearerToken(request);
  if (!extracted.ok) {
    return { ok: false, response: extracted.response, reason: extracted.reason };
  }
  const { token } = extracted;

  // Hash token once -- used for KV lookup and safe logging (prefix only)
  const sha256hex = await hashApiKey(token);

  // D1 lookup
  if (env.DB) {
    let record;
    try {
      record = await getApiKeyRecord(env.DB, sha256hex);
    } catch (err) {
      // D1 I/O failure: fail loudly, do NOT fall through to legacy
      console.error('wrl:auth:kv_error', { errorMessage: String(err?.message ?? '').slice(0, 128) });
      return {
        ok: false,
        response: problemResponse(500, 'Authentication service error'),
        reason: 'kv_error',
        keyHashPrefix: sha256hex.slice(0, 8),
      };
    }

    if (record !== null) {
      // Key found in KV -- check revocation first
      if (record.revoked) {
        // Revoked: hard-reject, same message as not-found to avoid revealing revocation
        return {
          ok: false,
          response: problemResponse(401, 'Invalid API key', { 'WWW-Authenticate': 'Bearer' }),
          reason: 'key_revoked',
          keyName: record.name,
          keyHashPrefix: sha256hex.slice(0, 8),
          tenantId: record.tenantId,
        };
      }

      // Validate tenantId -- callers rely on this contract
      if (!TENANT_ID_RE.test(record.tenantId)) {
        console.error('wrl:auth:invalid_tenant_id', { keyHashPrefix: sha256hex.slice(0, 8) });
        return {
          ok: false,
          response: problemResponse(500, 'Tenant configuration error'),
          reason: 'kv_error',
          keyHashPrefix: sha256hex.slice(0, 8),
        };
      }

      // Scope check
      if (!hasScope(record.scopes ?? [], requiredScope)) {
        return {
          ok: false,
          response: problemResponse(403, `API key does not grant '${requiredScope}' scope`),
          reason: 'scope_insufficient',
          keyName: record.name,
          keyHashPrefix: sha256hex.slice(0, 8),
          tenantId: record.tenantId,
        };
      }

      return {
        ok: true,
        tenantId: record.tenantId,
        scopes: record.scopes,
        keyName: record.name,
        keyHashPrefix: sha256hex.slice(0, 8),
        authMethod: 'kv',
      };
    }
    // record === null: key not found in D1 -- fall through to legacy below
  }

  // Legacy fallback: only reached on KV miss (null) or when env.KV is absent
  if (env.CAPTURE_API_KEY) {
    const match = await timingSafeEqual(token, env.CAPTURE_API_KEY);
    if (match) {
      const legacyScopes = ['capture', 'read'];
      // Scope check: legacy key only grants capture + read, never admin
      if (!hasScope(legacyScopes, requiredScope)) {
        return {
          ok: false,
          response: problemResponse(403, `API key does not grant '${requiredScope}' scope`),
          reason: 'legacy_scope_insufficient',
          keyHashPrefix: sha256hex.slice(0, 8),
        };
      }
      // Fire-and-forget warning: legacy auth is a migration signal
      log(env, 4, 'security', { event: 'security.legacy_auth_used', keyHashPrefix: sha256hex.slice(0, 8) });
      return {
        ok: true,
        tenantId: 'default',
        scopes: legacyScopes,
        keyName: null,
        keyHashPrefix: sha256hex.slice(0, 8),
        authMethod: 'legacy',
      };
    }
  }

  // Neither KV nor legacy matched
  return {
    ok: false,
    response: problemResponse(401, 'Invalid API key', { 'WWW-Authenticate': 'Bearer' }),
    reason: 'key_not_found',
    keyHashPrefix: sha256hex.slice(0, 8),
  };
}

/**
 * Verifies the Bearer token against the ADMIN_KEY infrastructure secret.
 * Used exclusively for /v1/admin/* endpoints. Does NOT check KV.
 * Does NOT fall back to CAPTURE_API_KEY.
 *
 * @param {Request} request
 * @param {{ ADMIN_KEY?: string }} env
 * @returns {Promise<
 *   { ok: true, authMethod: 'admin_key' }
 *   | { ok: false, response: Response, reason: string }
 * >}
 */
export async function verifyAdminKey(request, env) {
  // Misconfiguration guard
  if (!env.ADMIN_KEY) {
    return {
      ok: false,
      response: problemResponse(503, 'Admin API is not configured'),
      reason: 'service_not_configured',
    };
  }

  // Extract Bearer token
  const extracted = extractBearerToken(request);
  if (!extracted.ok) {
    return { ok: false, response: extracted.response, reason: extracted.reason };
  }
  const { token } = extracted;

  // Timing-safe comparison against infrastructure secret
  const match = await timingSafeEqual(token, env.ADMIN_KEY);
  if (!match) {
    return {
      ok: false,
      response: problemResponse(401, 'Invalid admin key', { 'WWW-Authenticate': 'Bearer' }),
      reason: 'invalid_admin_key',
    };
  }

  return { ok: true, authMethod: 'admin_key' };
}
