// tva
// Integration tests for /v1/admin/keys endpoints.
// Uses SELF.fetch() -- all requests go through the real worker.
// KV is real (miniflare-backed). ADMIN_KEY is injected via vitest.config.js.
//
// IMPORTANT: Admin rate limiter is 5 req/60s per IP (wrangler.toml).
// Each describe block uses a distinct CF-Connecting-IP to avoid cross-test
// rate limit exhaustion. IP is scoped to the describe block via closure.

import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TEST_ADMIN_KEY, seedApiKey } from './fixtures.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ADMIN_AUTH = `Bearer ${TEST_ADMIN_KEY}`;

// Each describe block gets its own IP to avoid rate limit bleed-over
let ipCounter = 10;
function nextIp() {
  return `192.0.2.${ipCounter++}`;
}

function makeAdminPost(ip) {
  return (body) => SELF.fetch('https://worker.test/v1/admin/keys', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: ADMIN_AUTH,
      'CF-Connecting-IP': ip,
    },
    body: JSON.stringify(body),
  });
}

function makeAdminGet(ip) {
  return (query = '') => SELF.fetch(`https://worker.test/v1/admin/keys${query}`, {
    headers: {
      Authorization: ADMIN_AUTH,
      'CF-Connecting-IP': ip,
    },
  });
}

function makeAdminDelete(ip) {
  return (keyHash) => SELF.fetch(`https://worker.test/v1/admin/keys/${keyHash}`, {
    method: 'DELETE',
    headers: {
      Authorization: ADMIN_AUTH,
      'CF-Connecting-IP': ip,
    },
  });
}

async function cleanupApiKeys() {
  const { keys } = await env.KV.list({ prefix: 'apikey:' });
  for (const k of keys) await env.KV.delete(k.name);
}

const VALID_CREATE_BODY = {
  tenantId: 'acme',
  scopes: ['capture', 'read'],
  name: 'test key',
};

// ---------------------------------------------------------------------------
// POST /v1/admin/keys
// ---------------------------------------------------------------------------

describe('POST /v1/admin/keys', () => {
  let adminPost;
  beforeEach(() => { adminPost = makeAdminPost(nextIp()); });
  afterEach(cleanupApiKeys);

  it('returns 201 with wrl_live_ prefixed key', async () => {
    const res = await adminPost(VALID_CREATE_BODY);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.key).toMatch(/^wrl_live_/);
  });

  it('response includes keyHash (64 hex chars)', async () => {
    const res = await adminPost(VALID_CREATE_BODY);
    const body = await res.json();
    expect(body.keyHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('response includes warning field', async () => {
    const res = await adminPost(VALID_CREATE_BODY);
    const body = await res.json();
    expect(typeof body.warning).toBe('string');
    expect(body.warning.length).toBeGreaterThan(0);
  });

  it('response includes tenantId, scopes, name, createdAt', async () => {
    const res = await adminPost(VALID_CREATE_BODY);
    const body = await res.json();
    expect(body.tenantId).toBe('acme');
    expect(body.scopes).toEqual(['capture', 'read']);
    expect(body.name).toBe('test key');
    expect(body.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('requires ADMIN_KEY auth -- returns 401 without auth', async () => {
    const ip = nextIp();
    const res = await SELF.fetch('https://worker.test/v1/admin/keys', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CF-Connecting-IP': ip,
      },
      body: JSON.stringify(VALID_CREATE_BODY),
    });
    expect(res.status).toBe(401);
  });

  it('returns 415 when Content-Type is not application/json', async () => {
    const ip = nextIp();
    const res = await SELF.fetch('https://worker.test/v1/admin/keys', {
      method: 'POST',
      headers: {
        Authorization: ADMIN_AUTH,
        'Content-Type': 'text/plain',
        'CF-Connecting-IP': ip,
      },
      body: JSON.stringify(VALID_CREATE_BODY),
    });
    expect(res.status).toBe(415);
  });

  it('returns 400 when tenantId is missing', async () => {
    const res = await adminPost({ scopes: ['capture'], name: 'x' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toContain('tenantId');
  });

  it('returns 400 when tenantId has invalid characters', async () => {
    const res = await adminPost({ tenantId: 'UPPER CASE', scopes: ['capture'], name: 'x' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when scopes is missing', async () => {
    const res = await adminPost({ tenantId: 'acme', name: 'x' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toContain('scopes');
  });

  it('returns 400 when scopes is empty array', async () => {
    const res = await adminPost({ tenantId: 'acme', scopes: [], name: 'x' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when scopes contains invalid value', async () => {
    const res = await adminPost({ tenantId: 'acme', scopes: ['invalid-scope'], name: 'x' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when name is missing', async () => {
    const res = await adminPost({ tenantId: 'acme', scopes: ['capture'] });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toContain('name');
  });

  it('sets Cache-Control: private, no-store on success response', async () => {
    const res = await adminPost(VALID_CREATE_BODY);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  });
});

// ---------------------------------------------------------------------------
// GET /v1/admin/keys
// ---------------------------------------------------------------------------

describe('GET /v1/admin/keys', () => {
  let adminPost, adminGet, adminDelete;
  beforeEach(() => {
    const ip = nextIp();
    adminPost = makeAdminPost(ip);
    adminGet = makeAdminGet(ip);
    adminDelete = makeAdminDelete(ip);
    return cleanupApiKeys();
  });
  afterEach(cleanupApiKeys);

  it('returns 200 with data array', async () => {
    const res = await adminGet();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('returns non-revoked keys in data', async () => {
    await adminPost(VALID_CREATE_BODY);
    const res = await adminGet();
    const body = await res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.data.every(k => !k.revoked)).toBe(true);
  });

  it('does not include revoked keys by default', async () => {
    const createRes = await adminPost(VALID_CREATE_BODY);
    const { keyHash } = await createRes.json();
    await adminDelete(keyHash);

    const listRes = await adminGet();
    const body = await listRes.json();
    const found = body.data.find(k => k.keyHash === keyHash);
    expect(found).toBeUndefined();
  });

  it('includes revoked keys when ?include=revoked', async () => {
    const createRes = await adminPost(VALID_CREATE_BODY);
    const { keyHash } = await createRes.json();
    await adminDelete(keyHash);

    const listRes = await adminGet('?include=revoked');
    const body = await listRes.json();
    const found = body.data.find(k => k.keyHash === keyHash);
    expect(found).toBeDefined();
    expect(found.revoked).toBe(true);
  });

  it('filters by ?tenant= query param', async () => {
    const ipA = nextIp();
    const ipB = nextIp();
    const postA = makeAdminPost(ipA);
    const postB = makeAdminPost(ipB);
    await postA({ tenantId: 'tenant-alpha', scopes: ['read'], name: 'alpha key' });
    await postB({ tenantId: 'tenant-beta', scopes: ['read'], name: 'beta key' });

    const getA = makeAdminGet(nextIp());
    const getB = makeAdminGet(nextIp());
    const resAlpha = await getA('?tenant=tenant-alpha');
    const bodyAlpha = await resAlpha.json();
    expect(bodyAlpha.data.every(k => k.tenantId === 'tenant-alpha')).toBe(true);

    const resBeta = await getB('?tenant=tenant-beta');
    const bodyBeta = await resBeta.json();
    expect(bodyBeta.data.every(k => k.tenantId === 'tenant-beta')).toBe(true);
  });

  it('requires ADMIN_KEY auth -- returns 401 without auth', async () => {
    const ip = nextIp();
    const res = await SELF.fetch('https://worker.test/v1/admin/keys', {
      headers: { 'CF-Connecting-IP': ip },
    });
    expect(res.status).toBe(401);
  });

  it('sets Cache-Control: private, no-store', async () => {
    const res = await adminGet();
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  });
});

// ---------------------------------------------------------------------------
// DELETE /v1/admin/keys/{keyHash}
// ---------------------------------------------------------------------------

describe('DELETE /v1/admin/keys/{keyHash}', () => {
  let adminPost, adminDelete;
  beforeEach(() => {
    const ip = nextIp();
    adminPost = makeAdminPost(ip);
    adminDelete = makeAdminDelete(ip);
    return cleanupApiKeys();
  });
  afterEach(cleanupApiKeys);

  it('returns 200 with revoked record on success', async () => {
    const createRes = await adminPost(VALID_CREATE_BODY);
    const { keyHash } = await createRes.json();

    const deleteRes = await adminDelete(keyHash);
    expect(deleteRes.status).toBe(200);
    const body = await deleteRes.json();
    expect(body.keyHash).toBe(keyHash);
    expect(body.revoked).toBe(true);
    expect(body.revokedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('is idempotent -- second DELETE returns 200', async () => {
    const createRes = await adminPost(VALID_CREATE_BODY);
    const { keyHash } = await createRes.json();
    await adminDelete(keyHash);
    const res2 = await adminDelete(keyHash);
    expect(res2.status).toBe(200);
  });

  it('returns 404 for unknown keyHash', async () => {
    const unknownHash = 'a'.repeat(64);
    const res = await adminDelete(unknownHash);
    expect(res.status).toBe(404);
  });

  it('requires ADMIN_KEY auth -- returns 401 without auth', async () => {
    const ip = nextIp();
    const createRes = await adminPost(VALID_CREATE_BODY);
    const { keyHash } = await createRes.json();

    const res = await SELF.fetch(`https://worker.test/v1/admin/keys/${keyHash}`, {
      method: 'DELETE',
      headers: { 'CF-Connecting-IP': ip },
    });
    expect(res.status).toBe(401);
  });

  it('returns 404 for malformed keyHash (route does not match)', async () => {
    const ip = nextIp();
    const res = await SELF.fetch('https://worker.test/v1/admin/keys/not-a-hash', {
      method: 'DELETE',
      headers: {
        Authorization: ADMIN_AUTH,
        'CF-Connecting-IP': ip,
      },
    });
    expect(res.status).toBe(404);
  });

  it('sets Cache-Control: private, no-store', async () => {
    const createRes = await adminPost(VALID_CREATE_BODY);
    const { keyHash } = await createRes.json();
    const res = await adminDelete(keyHash);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  });

  // -------------------------------------------------------------------------
  // Last-admin-key guard
  // -------------------------------------------------------------------------

  describe('Last-admin-key guard', () => {
    let guardPost, guardDelete;
    beforeEach(() => {
      const ip = nextIp();
      guardPost = makeAdminPost(ip);
      guardDelete = makeAdminDelete(ip);
      return cleanupApiKeys();
    });
    afterEach(cleanupApiKeys);

    it('409 when revoking the only admin-scoped key', async () => {
      const createRes = await guardPost({ tenantId: 'tenant-guard', scopes: ['admin'], name: 'sole admin' });
      expect(createRes.status).toBe(201);
      const { keyHash } = await createRes.json();

      const deleteRes = await guardDelete(keyHash);
      expect(deleteRes.status).toBe(409);

      // Key must still be active
      const getIp = nextIp();
      const listRes = await SELF.fetch('https://worker.test/v1/admin/keys?tenant=tenant-guard&include=revoked', {
        headers: { Authorization: ADMIN_AUTH, 'CF-Connecting-IP': getIp },
      });
      const body = await listRes.json();
      const key = body.data.find(k => k.keyHash === keyHash);
      expect(key).toBeDefined();
      expect(key.revoked).toBeFalsy();
    });

    it('200 when another admin key exists', async () => {
      const r1 = await guardPost({ tenantId: 'tenant-guard2', scopes: ['admin'], name: 'admin-1' });
      const r2 = await guardPost({ tenantId: 'tenant-guard2', scopes: ['admin'], name: 'admin-2' });
      expect(r1.status).toBe(201);
      expect(r2.status).toBe(201);
      const { keyHash: kh1 } = await r1.json();

      const deleteRes = await guardDelete(kh1);
      expect(deleteRes.status).toBe(200);
    });

    it('200 for non-admin key even if only key', async () => {
      const createRes = await guardPost({ tenantId: 'tenant-guard3', scopes: ['capture'], name: 'capture-only' });
      expect(createRes.status).toBe(201);
      const { keyHash } = await createRes.json();

      const deleteRes = await guardDelete(keyHash);
      expect(deleteRes.status).toBe(200);
    });

    it('idempotent re-delete of revoked admin key returns 200', async () => {
      const r1 = await guardPost({ tenantId: 'tenant-guard4', scopes: ['admin'], name: 'admin-a' });
      const r2 = await guardPost({ tenantId: 'tenant-guard4', scopes: ['admin'], name: 'admin-b' });
      expect(r1.status).toBe(201);
      expect(r2.status).toBe(201);
      const { keyHash: kh1 } = await r1.json();

      // First delete succeeds
      const del1 = await guardDelete(kh1);
      expect(del1.status).toBe(200);

      // Second delete on already-revoked key -- guard must be skipped, return 200
      const del2 = await guardDelete(kh1);
      expect(del2.status).toBe(200);
    });

    it('409 is tenant-scoped -- another tenant admin key does not count', async () => {
      // tenant-a has one admin key
      const ipA = nextIp();
      const postA = makeAdminPost(ipA);
      const deleteA = makeAdminDelete(ipA);
      const rA = await postA({ tenantId: 'tenant-a-guard', scopes: ['admin'], name: 'a-admin' });
      expect(rA.status).toBe(201);
      const { keyHash: khA } = await rA.json();

      // tenant-b also has an admin key (should NOT save tenant-a)
      const ipB = nextIp();
      const postB = makeAdminPost(ipB);
      await postB({ tenantId: 'tenant-b-guard', scopes: ['admin'], name: 'b-admin' });

      // Deleting tenant-a's sole admin key must still 409
      const deleteRes = await deleteA(khA);
      expect(deleteRes.status).toBe(409);
    });

    it('409 response follows RFC 9457', async () => {
      const createRes = await guardPost({ tenantId: 'tenant-guard5', scopes: ['admin'], name: 'only-admin' });
      expect(createRes.status).toBe(201);
      const { keyHash } = await createRes.json();

      const deleteRes = await guardDelete(keyHash);
      expect(deleteRes.status).toBe(409);
      expect(deleteRes.headers.get('Content-Type')).toContain('application/problem+json');

      const body = await deleteRes.json();
      expect(body.type).toBe('about:blank');
      expect(body.status).toBe(409);
      expect(typeof body.title).toBe('string');
      expect(body.title.length).toBeGreaterThan(0);
      expect(typeof body.detail).toBe('string');
      expect(body.detail).toContain('tenant-guard5');
    });
  });
});

// ---------------------------------------------------------------------------
// Round-trip lifecycle: create -> use for capture auth -> revoke -> verify 401
// ---------------------------------------------------------------------------

describe('Round-trip lifecycle', () => {
  afterEach(cleanupApiKeys);

  it('created key can authenticate to capture endpoint, revoked key returns 401', async () => {
    const ip = nextIp();
    const adminPost = makeAdminPost(ip);
    const adminDelete = makeAdminDelete(nextIp());

    // Step 1: create key
    const createRes = await adminPost({ tenantId: 'lifecycle', scopes: ['capture', 'read'], name: 'lifecycle key' });
    expect(createRes.status).toBe(201);
    const { key, keyHash } = await createRes.json();

    // Step 2: use key on capture endpoint -- 202/400/415 means auth passed
    const captureIp = nextIp();
    const captureRes = await SELF.fetch('https://worker.test/v1/captures', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'CF-Connecting-IP': captureIp,
      },
      body: JSON.stringify({ url: 'https://93.184.216.34/' }),
    });
    expect([202, 400, 415]).toContain(captureRes.status);

    // Step 3: revoke the key
    const revokeRes = await adminDelete(keyHash);
    expect(revokeRes.status).toBe(200);

    // Step 4: revoked key should get 401
    const captureAfterRevoke = await SELF.fetch('https://worker.test/v1/captures', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'CF-Connecting-IP': captureIp,
      },
      body: JSON.stringify({ url: 'https://93.184.216.34/' }),
    });
    expect(captureAfterRevoke.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Cross-tenant isolation
// ---------------------------------------------------------------------------

describe('Cross-tenant isolation', () => {
  afterEach(cleanupApiKeys);

  it('tenant key can only list its own captures via GET /v1/captures', async () => {
    const postA = makeAdminPost(nextIp());
    const postB = makeAdminPost(nextIp());

    const resA = await postA({ tenantId: 'tenant-a', scopes: ['capture', 'read'], name: 'a' });
    const resB = await postB({ tenantId: 'tenant-b', scopes: ['capture', 'read'], name: 'b' });
    const { key: keyA } = await resA.json();
    const { key: keyB } = await resB.json();

    const ipA = nextIp();
    const listA = await SELF.fetch('https://worker.test/v1/captures', {
      headers: { Authorization: `Bearer ${keyA}`, 'CF-Connecting-IP': ipA },
    });
    expect(listA.status).toBe(200);
    const bodyA = await listA.json();
    expect(Array.isArray(bodyA.data)).toBe(true);

    const ipB = nextIp();
    const listB = await SELF.fetch('https://worker.test/v1/captures', {
      headers: { Authorization: `Bearer ${keyB}`, 'CF-Connecting-IP': ipB },
    });
    expect(listB.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Scope enforcement
// ---------------------------------------------------------------------------

describe('Scope enforcement', () => {
  afterEach(cleanupApiKeys);

  it('read-only key cannot POST captures (403)', async () => {
    const adminPost = makeAdminPost(nextIp());
    const createRes = await adminPost({ tenantId: 'scope-test', scopes: ['read'], name: 'read-only' });
    const { key } = await createRes.json();

    const res = await SELF.fetch('https://worker.test/v1/captures', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'CF-Connecting-IP': nextIp(),
      },
      body: JSON.stringify({ url: 'https://93.184.216.34/' }),
    });
    expect(res.status).toBe(403);
  });

  it('capture-scoped key can GET /v1/captures (capture implies read)', async () => {
    const adminPost = makeAdminPost(nextIp());
    const createRes = await adminPost({ tenantId: 'scope-test', scopes: ['capture'], name: 'capture-only' });
    const { key } = await createRes.json();

    const res = await SELF.fetch('https://worker.test/v1/captures', {
      headers: {
        Authorization: `Bearer ${key}`,
        'CF-Connecting-IP': nextIp(),
      },
    });
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Security: legacy CAPTURE_API_KEY must not work on admin endpoints
// ---------------------------------------------------------------------------

describe('Security: legacy key rejected on admin routes', () => {
  afterEach(cleanupApiKeys);

  it('CAPTURE_API_KEY on POST /v1/admin/keys returns 401', async () => {
    const ip = nextIp();
    const res = await SELF.fetch('https://worker.test/v1/admin/keys', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-api-key-for-vitest',
        'Content-Type': 'application/json',
        'CF-Connecting-IP': ip,
      },
      body: JSON.stringify(VALID_CREATE_BODY),
    });
    expect(res.status).toBe(401);
  });

  it('CAPTURE_API_KEY on GET /v1/admin/keys returns 401', async () => {
    const ip = nextIp();
    const res = await SELF.fetch('https://worker.test/v1/admin/keys', {
      headers: {
        Authorization: 'Bearer test-api-key-for-vitest',
        'CF-Connecting-IP': ip,
      },
    });
    expect(res.status).toBe(401);
  });

  it('KV tenant key on admin endpoints returns 401', async () => {
    const rawKey = 'wrl_live_' + 'c'.repeat(43);
    await seedApiKey(env.KV, rawKey, { tenantId: 'acme' });

    const ip = nextIp();
    const res = await SELF.fetch('https://worker.test/v1/admin/keys', {
      headers: {
        Authorization: `Bearer ${rawKey}`,
        'CF-Connecting-IP': ip,
      },
    });
    expect(res.status).toBe(401);
  });
});
