// tva
import { env } from 'cloudflare:test';
import { verifyApiKey, requireScope, hashKey, AUTH_FAIL_REASONS } from '../src/auth.js';
import { describe, it, expect, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Constants from vitest.config.js bindings
// ---------------------------------------------------------------------------

const ADMIN_KEY = 'test-admin-key-for-vitest';
const CAPTURE_API_KEY = 'test-api-key-for-vitest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(authHeader, url = 'https://worker.test/v1/captures') {
  const headers = {};
  if (authHeader !== undefined) headers['Authorization'] = authHeader;
  return new Request(url, { method: 'GET', headers });
}

/** Write a valid (non-revoked) KV apikey record for the given raw key. */
async function putKvKey(rawKey, record) {
  const hash = await hashKey(rawKey);
  await env.KV.put(`apikey:${hash}`, JSON.stringify({
    tenantId: 'acme',
    scopes: ['capture'],
    name: 'test-key',
    createdAt: '2025-01-01T00:00:00.000Z',
    createdBy: 'ADMIN_KEY',
    revoked: false,
    ...record,
  }));
  return hash;
}

// Clean up apikey:* KV entries between tests
beforeEach(async () => {
  const { keys } = await env.KV.list({ prefix: 'apikey:' });
  for (const k of keys) await env.KV.delete(k.name);
  const { keys: tenantKeys } = await env.KV.list({ prefix: 'tenant-keys:' });
  for (const k of tenantKeys) await env.KV.delete(k.name);
});

// ---------------------------------------------------------------------------
// hashKey
// ---------------------------------------------------------------------------

describe('hashKey', () => {
  it('returns a 64-character hex string', async () => {
    const h = await hashKey('some-key');
    expect(h).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic -- same input produces same hash', async () => {
    const h1 = await hashKey('my-secret-key');
    const h2 = await hashKey('my-secret-key');
    expect(h1).toBe(h2);
  });

  it('produces different hashes for different inputs', async () => {
    const h1 = await hashKey('key-a');
    const h2 = await hashKey('key-b');
    expect(h1).not.toBe(h2);
  });

  it('is known-value stable: sha256("hello") = correct hex', async () => {
    // SHA-256("hello") is a well-known value
    const h = await hashKey('hello');
    expect(h).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });
});

// ---------------------------------------------------------------------------
// requireScope
// ---------------------------------------------------------------------------

describe('requireScope', () => {
  it('returns null when the required scope is present', () => {
    const auth = { scopes: ['capture', 'read'] };
    expect(requireScope(auth, 'capture')).toBeNull();
    expect(requireScope(auth, 'read')).toBeNull();
  });

  it('returns a 403 Response when the scope is missing', async () => {
    const auth = { scopes: ['read'] };
    const res = requireScope(auth, 'admin');
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(403);
  });

  it('403 response body references the missing scope', async () => {
    const auth = { scopes: ['read'] };
    const res = requireScope(auth, 'admin');
    const body = await res.json();
    expect(body.detail).toContain('admin');
  });

  it('403 response follows RFC 9457 shape', async () => {
    const auth = { scopes: [] };
    const res = requireScope(auth, 'capture');
    const body = await res.json();
    expect(body.type).toBe('about:blank');
    expect(body.status).toBe(403);
    expect(typeof body.title).toBe('string');
    expect(typeof body.detail).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// Misconfiguration guard
// ---------------------------------------------------------------------------

describe('verifyApiKey -- misconfigured environment', () => {
  it('returns 503 when no auth source is bound', async () => {
    const result = await verifyApiKey(makeRequest(`Bearer ${CAPTURE_API_KEY}`), {});
    expect(result.ok).toBe(false);
    expect(result.response.status).toBe(503);
    expect(result.reason).toBe(AUTH_FAIL_REASONS.MISCONFIGURED);
  });

  it('503 response has RFC 9457 shape', async () => {
    const result = await verifyApiKey(makeRequest(`Bearer ${CAPTURE_API_KEY}`), {});
    const body = await result.response.json();
    expect(body.type).toBe('about:blank');
    expect(body.status).toBe(503);
    expect(body.title).toBe('Service Unavailable');
    expect(typeof body.detail).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// Missing / malformed Authorization header
// ---------------------------------------------------------------------------

describe('verifyApiKey -- missing Authorization header', () => {
  it('returns 401 when Authorization header is absent', async () => {
    const result = await verifyApiKey(makeRequest(undefined), env);
    expect(result.ok).toBe(false);
    expect(result.response.status).toBe(401);
    expect(result.reason).toBe(AUTH_FAIL_REASONS.MISSING_HEADER);
    expect(result.response.headers.get('WWW-Authenticate')).toBe('Bearer');
  });
});

describe('verifyApiKey -- wrong or malformed key', () => {
  it('returns 401 for wrong key', async () => {
    const result = await verifyApiKey(makeRequest('Bearer completely-wrong'), env);
    expect(result.ok).toBe(false);
    expect(result.response.status).toBe(401);
    expect(result.response.headers.get('WWW-Authenticate')).toBe('Bearer');
  });

  it('returns 401 for empty token ("Bearer ")', async () => {
    const result = await verifyApiKey(makeRequest('Bearer '), env);
    expect(result.ok).toBe(false);
    expect(result.response.status).toBe(401);
    expect(result.reason).toBe(AUTH_FAIL_REASONS.INVALID_SCHEME);
  });

  it('returns 401 for non-Bearer scheme', async () => {
    const result = await verifyApiKey(makeRequest('Basic abc123'), env);
    expect(result.ok).toBe(false);
    expect(result.response.status).toBe(401);
    expect(result.reason).toBe(AUTH_FAIL_REASONS.INVALID_SCHEME);
  });

  it('error result does not include tenantId', async () => {
    const result = await verifyApiKey(makeRequest('Bearer wrong-key'), env);
    expect(result.ok).toBe(false);
    expect(result.tenantId).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// CAPTURE_API_KEY fallback (env-var)
// ---------------------------------------------------------------------------

describe('verifyApiKey -- CAPTURE_API_KEY fallback', () => {
  it('authenticates with CAPTURE_API_KEY', async () => {
    const result = await verifyApiKey(makeRequest(`Bearer ${CAPTURE_API_KEY}`), env);
    expect(result.ok).toBe(true);
    expect(result.authMethod).toBe('env-capture');
  });

  it('returns tenantId "default"', async () => {
    const result = await verifyApiKey(makeRequest(`Bearer ${CAPTURE_API_KEY}`), env);
    expect(result.ok).toBe(true);
    expect(result.tenantId).toBe('default');
  });

  it('returns scopes [capture, read]', async () => {
    const result = await verifyApiKey(makeRequest(`Bearer ${CAPTURE_API_KEY}`), env);
    expect(result.ok).toBe(true);
    expect(result.scopes).toContain('capture');
    expect(result.scopes).toContain('read');
  });

  it('returns keyName "CAPTURE_API_KEY"', async () => {
    const result = await verifyApiKey(makeRequest(`Bearer ${CAPTURE_API_KEY}`), env);
    expect(result.ok).toBe(true);
    expect(result.keyName).toBe('CAPTURE_API_KEY');
  });

  it('returns keyHash null', async () => {
    const result = await verifyApiKey(makeRequest(`Bearer ${CAPTURE_API_KEY}`), env);
    expect(result.ok).toBe(true);
    expect(result.keyHash).toBeNull();
  });

  it('does not echo the key in the response on success', async () => {
    const result = await verifyApiKey(makeRequest(`Bearer ${CAPTURE_API_KEY}`), env);
    expect(result.ok).toBe(true);
    expect(result.response).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// ADMIN_KEY env-var
// ---------------------------------------------------------------------------

describe('verifyApiKey -- ADMIN_KEY env-var', () => {
  it('authenticates with ADMIN_KEY', async () => {
    const result = await verifyApiKey(makeRequest(`Bearer ${ADMIN_KEY}`), env);
    expect(result.ok).toBe(true);
    expect(result.authMethod).toBe('env-admin');
  });

  it('returns scopes [admin]', async () => {
    const result = await verifyApiKey(makeRequest(`Bearer ${ADMIN_KEY}`), env);
    expect(result.ok).toBe(true);
    expect(result.scopes).toEqual(['admin']);
  });

  it('returns tenantId null', async () => {
    const result = await verifyApiKey(makeRequest(`Bearer ${ADMIN_KEY}`), env);
    expect(result.ok).toBe(true);
    expect(result.tenantId).toBeNull();
  });

  it('returns keyName "ADMIN_KEY"', async () => {
    const result = await verifyApiKey(makeRequest(`Bearer ${ADMIN_KEY}`), env);
    expect(result.ok).toBe(true);
    expect(result.keyName).toBe('ADMIN_KEY');
  });

  it('returns keyHash null', async () => {
    const result = await verifyApiKey(makeRequest(`Bearer ${ADMIN_KEY}`), env);
    expect(result.ok).toBe(true);
    expect(result.keyHash).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// KV-based key auth
// ---------------------------------------------------------------------------

describe('verifyApiKey -- KV key auth', () => {
  it('authenticates with a KV key and returns correct tenantId', async () => {
    const rawKey = 'wrl_live_kvtest001';
    await putKvKey(rawKey, { tenantId: 'acme', scopes: ['capture', 'read'], name: 'acme-key' });

    const result = await verifyApiKey(makeRequest(`Bearer ${rawKey}`), env);
    expect(result.ok).toBe(true);
    expect(result.tenantId).toBe('acme');
    expect(result.authMethod).toBe('kv');
  });

  it('returns correct scopes from KV record', async () => {
    const rawKey = 'wrl_live_kvtest002';
    await putKvKey(rawKey, { tenantId: 'acme', scopes: ['capture', 'read'], name: 'acme-key' });

    const result = await verifyApiKey(makeRequest(`Bearer ${rawKey}`), env);
    expect(result.ok).toBe(true);
    expect(result.scopes).toContain('capture');
    expect(result.scopes).toContain('read');
  });

  it('returns correct keyName from KV record', async () => {
    const rawKey = 'wrl_live_kvtest003';
    await putKvKey(rawKey, { tenantId: 'acme', scopes: ['capture'], name: 'my-named-key' });

    const result = await verifyApiKey(makeRequest(`Bearer ${rawKey}`), env);
    expect(result.ok).toBe(true);
    expect(result.keyName).toBe('my-named-key');
  });

  it('returns keyHash in result', async () => {
    const rawKey = 'wrl_live_kvtest004';
    const hash = await putKvKey(rawKey, { tenantId: 'acme', scopes: ['capture'] });

    const result = await verifyApiKey(makeRequest(`Bearer ${rawKey}`), env);
    expect(result.ok).toBe(true);
    expect(result.keyHash).toBe(hash);
  });

  it('falls back to hash prefix as keyName when record has no name field', async () => {
    const rawKey = 'wrl_live_kvtest_noname';
    const hash = await hashKey(rawKey);
    await env.KV.put(`apikey:${hash}`, JSON.stringify({
      tenantId: 'acme',
      scopes: ['capture'],
      createdAt: '2025-01-01T00:00:00.000Z',
      createdBy: 'ADMIN_KEY',
      revoked: false,
      // name intentionally omitted
    }));

    const result = await verifyApiKey(makeRequest(`Bearer ${rawKey}`), env);
    expect(result.ok).toBe(true);
    expect(result.keyName).toBe(hash.slice(0, 8));
  });
});

// ---------------------------------------------------------------------------
// Scope expansion: capture implies read
// ---------------------------------------------------------------------------

describe('verifyApiKey -- scope expansion', () => {
  it('adds "read" scope when KV key has only ["capture"]', async () => {
    const rawKey = 'wrl_live_scope_expand_test';
    await putKvKey(rawKey, { tenantId: 'acme', scopes: ['capture'], name: 'capture-only' });

    const result = await verifyApiKey(makeRequest(`Bearer ${rawKey}`), env);
    expect(result.ok).toBe(true);
    expect(result.scopes).toContain('capture');
    expect(result.scopes).toContain('read');
  });

  it('does not duplicate "read" if already present', async () => {
    const rawKey = 'wrl_live_scope_no_dup';
    await putKvKey(rawKey, { tenantId: 'acme', scopes: ['capture', 'read'], name: 'both-scopes' });

    const result = await verifyApiKey(makeRequest(`Bearer ${rawKey}`), env);
    expect(result.ok).toBe(true);
    const readCount = result.scopes.filter(s => s === 'read').length;
    expect(readCount).toBe(1);
  });

  it('does not add "read" to a key with only ["admin"]', async () => {
    const rawKey = 'wrl_live_admin_only_scope';
    await putKvKey(rawKey, { tenantId: 'acme', scopes: ['admin'], name: 'admin-only' });

    const result = await verifyApiKey(makeRequest(`Bearer ${rawKey}`), env);
    expect(result.ok).toBe(true);
    expect(result.scopes).not.toContain('read');
  });
});

// ---------------------------------------------------------------------------
// Revoked KV key
// ---------------------------------------------------------------------------

describe('verifyApiKey -- revoked KV key', () => {
  it('returns 401 for a revoked key', async () => {
    const rawKey = 'wrl_live_revoked_test';
    await putKvKey(rawKey, {
      tenantId: 'acme',
      scopes: ['capture'],
      name: 'revoked-key',
      revoked: true,
      revokedAt: '2025-06-01T00:00:00.000Z',
    });

    const result = await verifyApiKey(makeRequest(`Bearer ${rawKey}`), env);
    expect(result.ok).toBe(false);
    expect(result.response.status).toBe(401);
    expect(result.reason).toBe(AUTH_FAIL_REASONS.KEY_REVOKED);
  });

  it('revoked key does NOT fall through to env-var checks', async () => {
    // Use ADMIN_KEY as the raw key so if fallthrough occurs it would succeed
    const rawKey = ADMIN_KEY;
    const hash = await hashKey(rawKey);
    await env.KV.put(`apikey:${hash}`, JSON.stringify({
      tenantId: 'acme',
      scopes: ['capture'],
      name: 'revoked-admin-key',
      createdAt: '2025-01-01T00:00:00.000Z',
      createdBy: 'test',
      revoked: true,
    }));

    const result = await verifyApiKey(makeRequest(`Bearer ${rawKey}`), env);
    // Must be 401 (revoked), not 200 (env-admin fallthrough)
    expect(result.ok).toBe(false);
    expect(result.reason).toBe(AUTH_FAIL_REASONS.KEY_REVOKED);
  });
});

// ---------------------------------------------------------------------------
// KV error -- fail closed
// ---------------------------------------------------------------------------

describe('verifyApiKey -- KV error fail-closed', () => {
  it('returns 500 when KV.get throws, does not fall through to env-var', async () => {
    const brokenKv = {
      get: async () => { throw new Error('KV connection refused'); },
    };
    const envWithBrokenKv = { ...env, KV: brokenKv };

    const result = await verifyApiKey(makeRequest(`Bearer ${CAPTURE_API_KEY}`), envWithBrokenKv);
    expect(result.ok).toBe(false);
    expect(result.response.status).toBe(500);
    expect(result.reason).toBe(AUTH_FAIL_REASONS.MISCONFIGURED);
  });
});

// ---------------------------------------------------------------------------
// RFC 9457 response shape
// ---------------------------------------------------------------------------

describe('verifyApiKey -- RFC 9457 response shape', () => {
  it('error responses have type, status, title, detail fields', async () => {
    const result = await verifyApiKey(makeRequest(undefined), env);
    expect(result.ok).toBe(false);
    const body = await result.response.json();
    expect(body.type).toBe('about:blank');
    expect(body.status).toBe(401);
    expect(typeof body.title).toBe('string');
    expect(typeof body.detail).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// Security: key never echoed in error responses
// ---------------------------------------------------------------------------

describe('verifyApiKey -- key not leaked in responses', () => {
  it('wrong key response does not contain the provided key value', async () => {
    const secretKey = 'super-secret-key-must-not-appear';
    const result = await verifyApiKey(makeRequest(`Bearer ${secretKey}`), env);
    expect(result.ok).toBe(false);
    const body = await result.response.text();
    expect(body).not.toContain(secretKey);
  });
});
