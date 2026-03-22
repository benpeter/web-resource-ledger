import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { verifyApiKey, verifyAdminKey, hashApiKey } from '../src/auth.js';
import { TEST_ADMIN_KEY, TEST_TENANT_KEY, seedApiKey, cleanDb } from './fixtures.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(authHeader, url = 'https://worker.test/v1/captures') {
  const headers = {};
  if (authHeader !== undefined) headers['Authorization'] = authHeader;
  return new Request(url, { method: 'POST', headers });
}

async function cleanupApiKeys() {
  await cleanDb(env.DB);
}

// ---------------------------------------------------------------------------
// Block 1: verifyApiKey -- KV-based key lookup
// ---------------------------------------------------------------------------

describe('verifyApiKey -- DB-based key lookup', () => {
  beforeEach(cleanupApiKeys);
  afterEach(cleanupApiKeys);

  it('returns { ok: true } for a valid DB key', async () => {
    await seedApiKey(env.DB, TEST_TENANT_KEY, { tenantId: 'acme', scopes: ['capture', 'read'] });
    const result = await verifyApiKey(makeRequest(`Bearer ${TEST_TENANT_KEY}`), env);
    expect(result.ok).toBe(true);
    expect(result.tenantId).toBe('acme');
    expect(result.scopes).toContain('capture');
    expect(result.authMethod).toBe('kv');
  });

  it('success return includes keyHashPrefix as 8-char hex string', async () => {
    await seedApiKey(env.DB, TEST_TENANT_KEY, { tenantId: 'acme', scopes: ['capture'] });
    const result = await verifyApiKey(makeRequest(`Bearer ${TEST_TENANT_KEY}`), env);
    expect(result.ok).toBe(true);
    expect(result.keyHashPrefix).toMatch(/^[a-f0-9]{8}$/);
  });

  it('returns correct tenantId from DB record', async () => {
    await seedApiKey(env.DB, TEST_TENANT_KEY, { tenantId: 'tenant-xyz' });
    const result = await verifyApiKey(makeRequest(`Bearer ${TEST_TENANT_KEY}`), env);
    expect(result.ok).toBe(true);
    expect(result.tenantId).toBe('tenant-xyz');
  });

  it('returns 401 for unknown DB key (no legacy fallback when CAPTURE_API_KEY is not this key)', async () => {
    // Key is seeded under a different raw key; using TEST_TENANT_KEY which is not in DB
    const result = await verifyApiKey(makeRequest(`Bearer wrl_live_${'z'.repeat(43)}`), env);
    expect(result.ok).toBe(false);
    expect(result.response.status).toBe(401);
    expect(result.reason).toBe('key_not_found');
  });

  it('returns 401 for revoked DB key', async () => {
    await seedApiKey(env.DB, TEST_TENANT_KEY, {
      tenantId: 'acme',
      revoked: true,
      revokedAt: new Date().toISOString(),
    });
    const result = await verifyApiKey(makeRequest(`Bearer ${TEST_TENANT_KEY}`), env);
    expect(result.ok).toBe(false);
    expect(result.response.status).toBe(401);
    expect(result.reason).toBe('key_revoked');
  });

  it('returns 403 when key does not grant required scope', async () => {
    await seedApiKey(env.DB, TEST_TENANT_KEY, { tenantId: 'acme', scopes: ['read'] });
    const result = await verifyApiKey(makeRequest(`Bearer ${TEST_TENANT_KEY}`), env, { requiredScope: 'capture' });
    expect(result.ok).toBe(false);
    expect(result.response.status).toBe(403);
    expect(result.reason).toBe('scope_insufficient');
  });

  it('capture scope implies read -- read-only check passes with capture key', async () => {
    await seedApiKey(env.DB, TEST_TENANT_KEY, { tenantId: 'acme', scopes: ['capture'] });
    const result = await verifyApiKey(makeRequest(`Bearer ${TEST_TENANT_KEY}`), env, { requiredScope: 'read' });
    expect(result.ok).toBe(true);
  });

  it('validates tenantId format -- 500 when DB record has invalid tenantId', async () => {
    // Insert a record directly with an invalid tenantId bypassing seedApiKey
    // (must first create a tenant row with valid ID, then update to invalid is not possible via SQLite CHECK)
    // Instead, simulate a DB error path by testing the auth module's error handling.
    // The CHECK constraint on tenants.id prevents inserting invalid tenantIds into D1.
    // This test verifies that auth returns 500 on unexpected DB error by mocking DB.
    const keyHash = await hashApiKey(TEST_TENANT_KEY);
    const faultyDB = {
      prepare: () => ({
        bind: () => ({
          first: async () => ({
            tenant_id: 'INVALID TENANT!',
            scopes: JSON.stringify(['capture']),
            name: 'bad',
            created_at: new Date().toISOString(),
            created_by: 'test',
            revoked: 0,
            revoked_at: null,
          }),
        }),
      }),
    };
    const faultyEnv = { ...env, DB: faultyDB };
    const result = await verifyApiKey(makeRequest(`Bearer ${TEST_TENANT_KEY}`), faultyEnv);
    expect(result.ok).toBe(false);
    expect(result.response.status).toBe(500);
    expect(result.reason).toBe('kv_error');
  });
});

// ---------------------------------------------------------------------------
// Block 2: verifyApiKey -- dual-mode legacy fallback
// ---------------------------------------------------------------------------

describe('verifyApiKey -- dual-mode legacy fallback', () => {
  beforeEach(cleanupApiKeys);
  afterEach(cleanupApiKeys);

  it('legacy key works on DB miss', async () => {
    // CAPTURE_API_KEY is set in env; key is NOT in DB
    const result = await verifyApiKey(makeRequest('Bearer test-api-key-for-vitest'), env);
    expect(result.ok).toBe(true);
    expect(result.authMethod).toBe('legacy');
  });

  it('legacy auth returns tenantId: "default"', async () => {
    const result = await verifyApiKey(makeRequest('Bearer test-api-key-for-vitest'), env);
    expect(result.ok).toBe(true);
    expect(result.tenantId).toBe('default');
  });

  it('legacy auth success includes keyHashPrefix as 8-char hex string', async () => {
    const result = await verifyApiKey(makeRequest('Bearer test-api-key-for-vitest'), env);
    expect(result.ok).toBe(true);
    expect(result.keyHashPrefix).toMatch(/^[a-f0-9]{8}$/);
  });

  it('legacy auth returns scopes: ["capture","read"]', async () => {
    const result = await verifyApiKey(makeRequest('Bearer test-api-key-for-vitest'), env);
    expect(result.ok).toBe(true);
    expect(result.scopes).toEqual(['capture', 'read']);
  });

  it('legacy auth does not include admin in scopes', async () => {
    const result = await verifyApiKey(makeRequest('Bearer test-api-key-for-vitest'), env);
    expect(result.ok).toBe(true);
    expect(result.scopes).not.toContain('admin');
  });

  it('legacy auth returns 403 when requiredScope is admin', async () => {
    const result = await verifyApiKey(
      makeRequest('Bearer test-api-key-for-vitest'),
      env,
      { requiredScope: 'admin' },
    );
    expect(result.ok).toBe(false);
    expect(result.response.status).toBe(403);
    expect(result.reason).toBe('legacy_scope_insufficient');
  });

  it('revoked key does NOT fall through to legacy even if token matches CAPTURE_API_KEY', async () => {
    // Seed the legacy key value as a revoked DB record
    await seedApiKey(env.DB, 'test-api-key-for-vitest', {
      tenantId: 'default',
      revoked: true,
      revokedAt: new Date().toISOString(),
    });
    const result = await verifyApiKey(makeRequest('Bearer test-api-key-for-vitest'), env);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('key_revoked');
    expect(result.response.status).toBe(401);
  });

  it('DB hit returns authMethod: "kv"', async () => {
    await seedApiKey(env.DB, TEST_TENANT_KEY, { tenantId: 'acme' });
    const result = await verifyApiKey(makeRequest(`Bearer ${TEST_TENANT_KEY}`), env);
    expect(result.ok).toBe(true);
    expect(result.authMethod).toBe('kv');
  });
});

// ---------------------------------------------------------------------------
// Block 3: verifyAdminKey -- admin infrastructure credential
// ---------------------------------------------------------------------------

describe('verifyAdminKey -- admin infrastructure credential', () => {
  it('returns { ok: true, authMethod: "admin_key" } for valid ADMIN_KEY', async () => {
    const result = await verifyAdminKey(makeRequest(`Bearer ${TEST_ADMIN_KEY}`), env);
    expect(result.ok).toBe(true);
    expect(result.authMethod).toBe('admin_key');
  });

  it('returns 401 for invalid admin key', async () => {
    const result = await verifyAdminKey(makeRequest('Bearer wrong-admin-key'), env);
    expect(result.ok).toBe(false);
    expect(result.response.status).toBe(401);
    expect(result.reason).toBe('invalid_admin_key');
  });

  it('returns 503 when ADMIN_KEY is not configured', async () => {
    const noAdminEnv = { ...env, ADMIN_KEY: undefined };
    const result = await verifyAdminKey(makeRequest(`Bearer ${TEST_ADMIN_KEY}`), noAdminEnv);
    expect(result.ok).toBe(false);
    expect(result.response.status).toBe(503);
    expect(result.reason).toBe('service_not_configured');
  });

  it('CAPTURE_API_KEY does not work for admin endpoints', async () => {
    const result = await verifyAdminKey(makeRequest('Bearer test-api-key-for-vitest'), env);
    expect(result.ok).toBe(false);
    expect(result.response.status).toBe(401);
  });

  it('DB tenant key does not work for admin endpoints', async () => {
    await seedApiKey(env.DB, TEST_TENANT_KEY, { tenantId: 'acme' });
    const result = await verifyAdminKey(makeRequest(`Bearer ${TEST_TENANT_KEY}`), env);
    expect(result.ok).toBe(false);
    expect(result.response.status).toBe(401);
    await cleanDb(env.DB);
  });
});

// ---------------------------------------------------------------------------
// Block 4: verifyApiKey -- existing behavior (preserved)
// ---------------------------------------------------------------------------

describe('verifyApiKey -- existing behavior (preserved)', () => {
  it('returns 401 when Authorization header is absent', async () => {
    const result = await verifyApiKey(makeRequest(undefined), env);
    expect(result.ok).toBe(false);
    expect(result.response.status).toBe(401);
    expect(result.response.headers.get('WWW-Authenticate')).toBe('Bearer');
    expect(result.reason).toBe('missing_header');
  });

  it('returns 401 for non-Bearer scheme ("Basic abc")', async () => {
    const result = await verifyApiKey(makeRequest('Basic abc'), env);
    expect(result.ok).toBe(false);
    expect(result.response.status).toBe(401);
    expect(result.response.headers.get('WWW-Authenticate')).toBe('Bearer');
    expect(result.reason).toBe('invalid_scheme');
  });

  it('returns 401 for empty Bearer token ("Bearer ")', async () => {
    const result = await verifyApiKey(makeRequest('Bearer '), env);
    expect(result.ok).toBe(false);
    expect(result.response.status).toBe(401);
    expect(result.response.headers.get('WWW-Authenticate')).toBe('Bearer');
  });

  it('error responses have RFC 9457 shape', async () => {
    const result = await verifyApiKey(makeRequest(undefined), env);
    expect(result.ok).toBe(false);
    const body = await result.response.json();
    expect(body.type).toBe('about:blank');
    expect(body.status).toBe(401);
    expect(typeof body.title).toBe('string');
    expect(typeof body.detail).toBe('string');
  });

  it('503 response has RFC 9457 shape when misconfigured', async () => {
    const result = await verifyApiKey(makeRequest('Bearer some-key'), { CAPTURE_API_KEY: undefined, DB: undefined });
    expect(result.ok).toBe(false);
    const body = await result.response.json();
    expect(body.type).toBe('about:blank');
    expect(body.status).toBe(503);
    expect(body.title).toBe('Service Unavailable');
    expect(typeof body.detail).toBe('string');
  });

  it('raw key is not echoed in error response body', async () => {
    const sentKey = 'my-secret-key-do-not-echo';
    const result = await verifyApiKey(makeRequest(`Bearer ${sentKey}`), env);
    expect(result.ok).toBe(false);
    const body = await result.response.text();
    expect(body).not.toContain(sentKey);
  });

  it('returns 503 when neither DB nor CAPTURE_API_KEY is present', async () => {
    const result = await verifyApiKey(makeRequest('Bearer some-key'), {});
    expect(result.ok).toBe(false);
    expect(result.response.status).toBe(503);
    expect(result.reason).toBe('service_not_configured');
  });
});

// ---------------------------------------------------------------------------
// Security: KV error must NOT fall through to legacy
// ---------------------------------------------------------------------------

describe('verifyApiKey -- DB error path (security)', () => {
  it('DB I/O error returns 500 and does not fall through to legacy', async () => {
    // Use a mock to simulate DB failure
    const faultyDB = {
      prepare: () => ({
        bind: () => ({
          first: vi.fn().mockRejectedValue(new Error('simulated DB outage')),
        }),
      }),
    };
    const faultyEnv = { DB: faultyDB, CAPTURE_API_KEY: 'test-api-key-for-vitest' };
    const result = await verifyApiKey(makeRequest('Bearer test-api-key-for-vitest'), faultyEnv);
    expect(result.ok).toBe(false);
    expect(result.response.status).toBe(500);
    expect(result.reason).toBe('kv_error');
  });
});
