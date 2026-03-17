import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { verifyApiKey, verifyAdminKey, hashApiKey } from '../src/auth.js';
import { TEST_ADMIN_KEY, TEST_TENANT_KEY, seedApiKey } from './fixtures.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(authHeader, url = 'https://worker.test/v1/captures') {
  const headers = {};
  if (authHeader !== undefined) headers['Authorization'] = authHeader;
  return new Request(url, { method: 'POST', headers });
}

async function cleanupApiKeys() {
  const { keys } = await env.KV.list({ prefix: 'apikey:' });
  for (const k of keys) await env.KV.delete(k.name);
}

// ---------------------------------------------------------------------------
// Block 1: verifyApiKey -- KV-based key lookup
// ---------------------------------------------------------------------------

describe('verifyApiKey -- KV-based key lookup', () => {
  beforeEach(cleanupApiKeys);
  afterEach(cleanupApiKeys);

  it('returns { ok: true } for a valid KV key', async () => {
    await seedApiKey(env.KV, TEST_TENANT_KEY, { tenantId: 'acme', scopes: ['capture', 'read'] });
    const result = await verifyApiKey(makeRequest(`Bearer ${TEST_TENANT_KEY}`), env);
    expect(result.ok).toBe(true);
    expect(result.tenantId).toBe('acme');
    expect(result.scopes).toContain('capture');
    expect(result.authMethod).toBe('kv');
  });

  it('returns correct tenantId from KV record', async () => {
    await seedApiKey(env.KV, TEST_TENANT_KEY, { tenantId: 'tenant-xyz' });
    const result = await verifyApiKey(makeRequest(`Bearer ${TEST_TENANT_KEY}`), env);
    expect(result.ok).toBe(true);
    expect(result.tenantId).toBe('tenant-xyz');
  });

  it('returns 401 for unknown KV key (no legacy fallback when CAPTURE_API_KEY is not this key)', async () => {
    // Key is seeded under a different raw key; using TEST_TENANT_KEY which is not in KV
    const result = await verifyApiKey(makeRequest(`Bearer wrl_live_${'z'.repeat(43)}`), env);
    expect(result.ok).toBe(false);
    expect(result.response.status).toBe(401);
    expect(result.reason).toBe('key_not_found');
  });

  it('returns 401 for revoked KV key', async () => {
    await seedApiKey(env.KV, TEST_TENANT_KEY, {
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
    await seedApiKey(env.KV, TEST_TENANT_KEY, { tenantId: 'acme', scopes: ['read'] });
    const result = await verifyApiKey(makeRequest(`Bearer ${TEST_TENANT_KEY}`), env, { requiredScope: 'capture' });
    expect(result.ok).toBe(false);
    expect(result.response.status).toBe(403);
    expect(result.reason).toBe('scope_insufficient');
  });

  it('capture scope implies read -- read-only check passes with capture key', async () => {
    await seedApiKey(env.KV, TEST_TENANT_KEY, { tenantId: 'acme', scopes: ['capture'] });
    const result = await verifyApiKey(makeRequest(`Bearer ${TEST_TENANT_KEY}`), env, { requiredScope: 'read' });
    expect(result.ok).toBe(true);
  });

  it('validates tenantId format -- 500 when KV record has invalid tenantId', async () => {
    const keyHash = await hashApiKey(TEST_TENANT_KEY);
    // Manually write a record with an invalid tenantId bypassing seedApiKey
    await env.KV.put(`apikey:${keyHash}`, JSON.stringify({
      tenantId: 'INVALID TENANT!',
      scopes: ['capture'],
      name: 'bad-record',
      createdAt: new Date().toISOString(),
      createdBy: 'test',
      revoked: false,
      revokedAt: null,
    }));
    const result = await verifyApiKey(makeRequest(`Bearer ${TEST_TENANT_KEY}`), env);
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

  it('legacy key works on KV miss', async () => {
    // CAPTURE_API_KEY is set in env; key is NOT in KV
    const result = await verifyApiKey(makeRequest('Bearer test-api-key-for-vitest'), env);
    expect(result.ok).toBe(true);
    expect(result.authMethod).toBe('legacy');
  });

  it('legacy auth returns tenantId: "default"', async () => {
    const result = await verifyApiKey(makeRequest('Bearer test-api-key-for-vitest'), env);
    expect(result.ok).toBe(true);
    expect(result.tenantId).toBe('default');
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
    // Seed the legacy key value as a revoked KV record
    await seedApiKey(env.KV, 'test-api-key-for-vitest', {
      tenantId: 'default',
      revoked: true,
      revokedAt: new Date().toISOString(),
    });
    const result = await verifyApiKey(makeRequest('Bearer test-api-key-for-vitest'), env);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('key_revoked');
    expect(result.response.status).toBe(401);
  });

  it('KV hit returns authMethod: "kv"', async () => {
    await seedApiKey(env.KV, TEST_TENANT_KEY, { tenantId: 'acme' });
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

  it('KV tenant key does not work for admin endpoints', async () => {
    await seedApiKey(env.KV, TEST_TENANT_KEY, { tenantId: 'acme' });
    const result = await verifyAdminKey(makeRequest(`Bearer ${TEST_TENANT_KEY}`), env);
    expect(result.ok).toBe(false);
    expect(result.response.status).toBe(401);
    const { keys } = await env.KV.list({ prefix: 'apikey:' });
    for (const k of keys) await env.KV.delete(k.name);
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
    const result = await verifyApiKey(makeRequest('Bearer some-key'), { CAPTURE_API_KEY: undefined, KV: undefined });
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

  it('returns 503 when neither KV nor CAPTURE_API_KEY is present', async () => {
    const result = await verifyApiKey(makeRequest('Bearer some-key'), {});
    expect(result.ok).toBe(false);
    expect(result.response.status).toBe(503);
    expect(result.reason).toBe('service_not_configured');
  });
});

// ---------------------------------------------------------------------------
// Security: KV error must NOT fall through to legacy
// ---------------------------------------------------------------------------

describe('verifyApiKey -- KV error path (security)', () => {
  it('KV I/O error returns 500 and does not fall through to legacy', async () => {
    // Use a spy to simulate KV failure
    const faultyKV = {
      get: vi.fn().mockRejectedValue(new Error('simulated KV outage')),
    };
    const faultyEnv = { KV: faultyKV, CAPTURE_API_KEY: 'test-api-key-for-vitest' };
    const result = await verifyApiKey(makeRequest('Bearer test-api-key-for-vitest'), faultyEnv);
    expect(result.ok).toBe(false);
    expect(result.response.status).toBe(500);
    expect(result.reason).toBe('kv_error');
  });
});
