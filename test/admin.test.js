// tva
import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { hashKey } from '../src/auth.js';

// ---------------------------------------------------------------------------
// Constants matching vitest.config.js bindings
// ---------------------------------------------------------------------------

const ADMIN_AUTH = 'Bearer test-admin-key-for-vitest';
const CAPTURE_AUTH = 'Bearer test-api-key-for-vitest';

// ---------------------------------------------------------------------------
// Per-test unique IP to prevent ADMIN_RATE_LIMITER (5 req/60s) from
// tripping across tests that all fall back to 'unknown'.
// Each test call gets a fresh IP drawn from a monotonic counter.
// ---------------------------------------------------------------------------

let _ipCounter = 1;
function nextIp() {
  const n = _ipCounter++;
  return `10.${Math.floor(n / 65536) % 256}.${Math.floor(n / 256) % 256}.${n % 256}`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** POST /v1/admin/keys with ADMIN_KEY auth by default. */
function createKey(body, auth = ADMIN_AUTH, ip = nextIp()) {
  return SELF.fetch('https://worker.test/v1/admin/keys', {
    method: 'POST',
    headers: {
      Authorization: auth,
      'Content-Type': 'application/json',
      'CF-Connecting-IP': ip,
    },
    body: JSON.stringify(body),
  });
}

/** GET /v1/admin/keys with optional ?tenantId=... */
function listKeys(query = {}, auth = ADMIN_AUTH, ip = nextIp()) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined) params.set(k, String(v));
  }
  const qs = params.toString() ? `?${params}` : '';
  return SELF.fetch(`https://worker.test/v1/admin/keys${qs}`, {
    method: 'GET',
    headers: {
      Authorization: auth,
      'CF-Connecting-IP': ip,
    },
  });
}

/** DELETE /v1/admin/keys/:keyHash */
function revokeKey(keyHash, auth = ADMIN_AUTH, ip = nextIp()) {
  return SELF.fetch(`https://worker.test/v1/admin/keys/${keyHash}`, {
    method: 'DELETE',
    headers: {
      Authorization: auth,
      'CF-Connecting-IP': ip,
    },
  });
}

/**
 * Creates a KV-backed admin key for a given tenant and returns both the
 * raw key (for auth) and the keyHash.
 */
async function seedAdminKey(tenantId, name = 'seeded-admin-key') {
  const res = await createKey({ name, scopes: ['admin'], tenantId });
  expect(res.status).toBe(201);
  const body = await res.json();
  return body; // { key, keyHash, tenantId, scopes, name, createdAt }
}

// ---------------------------------------------------------------------------
// KV cleanup between tests
// ---------------------------------------------------------------------------

beforeEach(async () => {
  const { keys: apikeys } = await env.KV.list({ prefix: 'apikey:' });
  for (const k of apikeys) await env.KV.delete(k.name);
  const { keys: tenantKeys } = await env.KV.list({ prefix: 'tenant-keys:' });
  for (const k of tenantKeys) await env.KV.delete(k.name);
});

// ---------------------------------------------------------------------------
// POST /v1/admin/keys -- success cases
// ---------------------------------------------------------------------------

describe('POST /v1/admin/keys -- success', () => {
  it('creates a key with ADMIN_KEY auth and returns 201', async () => {
    const res = await createKey({ name: 'my-capture-key', scopes: ['capture'], tenantId: 'acme' });
    expect(res.status).toBe(201);
  });

  it('response body has expected shape', async () => {
    const res = await createKey({ name: 'my-capture-key', scopes: ['capture'], tenantId: 'acme' });
    const body = await res.json();
    expect(typeof body.key).toBe('string');
    expect(body.key).toMatch(/^wrl_live_/);
    expect(typeof body.keyHash).toBe('string');
    expect(body.keyHash).toMatch(/^[a-f0-9]{64}$/);
    expect(body.tenantId).toBe('acme');
    expect(body.scopes).toEqual(['capture']);
    expect(body.name).toBe('my-capture-key');
    expect(typeof body.createdAt).toBe('string');
  });

  it('response has Cache-Control: private, no-store', async () => {
    const res = await createKey({ name: 'test-key', scopes: ['read'], tenantId: 'acme' });
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('created key is stored in KV and can be retrieved', async () => {
    const res = await createKey({ name: 'stored-key', scopes: ['capture'], tenantId: 'acme' });
    const body = await res.json();
    const record = await env.KV.get(`apikey:${body.keyHash}`, 'json');
    expect(record).not.toBeNull();
    expect(record.tenantId).toBe('acme');
    expect(record.name).toBe('stored-key');
    expect(record.revoked).toBe(false);
  });

  it('keyHash in response matches SHA-256 of the returned key', async () => {
    const res = await createKey({ name: 'hash-check', scopes: ['capture'], tenantId: 'acme' });
    const body = await res.json();
    const expectedHash = await hashKey(body.key);
    expect(body.keyHash).toBe(expectedHash);
  });

  it('tenant-scoped admin key can create keys for its own tenant', async () => {
    const adminKey = await seedAdminKey('beta', 'beta-admin');

    const res = await createKey(
      { name: 'beta-capture-key', scopes: ['capture'] },
      `Bearer ${adminKey.key}`,
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.tenantId).toBe('beta');
  });

  it('keyHash is added to tenant-keys index', async () => {
    const res = await createKey({ name: 'indexed-key', scopes: ['capture'], tenantId: 'acme' });
    const body = await res.json();
    const index = await env.KV.get('tenant-keys:acme', 'json');
    expect(Array.isArray(index)).toBe(true);
    expect(index).toContain(body.keyHash);
  });
});

// ---------------------------------------------------------------------------
// POST /v1/admin/keys -- validation errors
// ---------------------------------------------------------------------------

describe('POST /v1/admin/keys -- validation errors', () => {
  it('missing name → 400', async () => {
    const res = await createKey({ scopes: ['capture'], tenantId: 'acme' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toContain('name');
  });

  it('name too long → 400', async () => {
    const res = await createKey({ name: 'x'.repeat(129), scopes: ['capture'], tenantId: 'acme' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toContain('name');
  });

  it('name with invalid characters → 400', async () => {
    const res = await createKey({ name: 'bad<name>', scopes: ['capture'], tenantId: 'acme' });
    expect(res.status).toBe(400);
  });

  it('missing scopes → 400', async () => {
    const res = await createKey({ name: 'no-scopes', tenantId: 'acme' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toContain('scopes');
  });

  it('empty scopes array → 400', async () => {
    const res = await createKey({ name: 'empty-scopes', scopes: [], tenantId: 'acme' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toContain('scopes');
  });

  it('invalid scope name → 400 with valid scopes listed', async () => {
    const res = await createKey({ name: 'bad-scope', scopes: ['superuser'], tenantId: 'acme' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toContain('superuser');
    expect(body.detail).toMatch(/capture|read|admin/);
  });

  it('missing tenantId for ADMIN_KEY auth → 400', async () => {
    const res = await createKey({ name: 'no-tenant', scopes: ['capture'] });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toContain('tenantId');
  });

  it('invalid tenantId format → 400', async () => {
    const res = await createKey({ name: 'bad-tenant', scopes: ['capture'], tenantId: 'Bad Tenant!' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toContain('tenantId');
  });

  it('unknown field in body → 400', async () => {
    const res = await createKey({ name: 'valid', scopes: ['capture'], tenantId: 'acme', extra: 'field' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toContain('extra');
  });

  it('non-JSON body → 400', async () => {
    const res = await SELF.fetch('https://worker.test/v1/admin/keys', {
      method: 'POST',
      headers: {
        Authorization: ADMIN_AUTH,
        'Content-Type': 'application/json',
        'CF-Connecting-IP': nextIp(),
      },
      body: 'not json {{{',
    });
    expect(res.status).toBe(400);
  });

  it('wrong Content-Type → 415', async () => {
    const res = await SELF.fetch('https://worker.test/v1/admin/keys', {
      method: 'POST',
      headers: {
        Authorization: ADMIN_AUTH,
        'Content-Type': 'text/plain',
        'CF-Connecting-IP': nextIp(),
      },
      body: JSON.stringify({ name: 'test', scopes: ['capture'], tenantId: 'acme' }),
    });
    expect(res.status).toBe(415);
  });
});

// ---------------------------------------------------------------------------
// POST /v1/admin/keys -- authorization errors
// ---------------------------------------------------------------------------

describe('POST /v1/admin/keys -- authorization errors', () => {
  it('unauthenticated request → 401', async () => {
    const res = await SELF.fetch('https://worker.test/v1/admin/keys', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CF-Connecting-IP': nextIp(),
      },
      body: JSON.stringify({ name: 'test', scopes: ['capture'], tenantId: 'acme' }),
    });
    expect(res.status).toBe(401);
    expect(res.headers.get('WWW-Authenticate')).toBe('Bearer');
  });

  it('CAPTURE_API_KEY (capture scope only) → 403', async () => {
    const res = await createKey(
      { name: 'test', scopes: ['capture'], tenantId: 'acme' },
      CAPTURE_AUTH,
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.status).toBe(403);
  });

  it('cross-tenant creation attempt → 403 for tenant-scoped admin key', async () => {
    const adminKey = await seedAdminKey('tenant-a', 'tenant-a-admin');

    const res = await createKey(
      { name: 'cross-tenant-key', scopes: ['capture'], tenantId: 'tenant-b' },
      `Bearer ${adminKey.key}`,
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.detail).toContain('tenant');
  });
});

// ---------------------------------------------------------------------------
// GET /v1/admin/keys -- list keys
// ---------------------------------------------------------------------------

describe('GET /v1/admin/keys -- list', () => {
  it('returns 200 with empty data array when no keys exist', async () => {
    const res = await listKeys({ tenantId: 'empty-tenant' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });

  it('lists keys after creating one', async () => {
    await createKey({ name: 'listed-key', scopes: ['capture'], tenantId: 'acme' });
    const res = await listKeys({ tenantId: 'acme' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('listed key entries have expected shape (no raw key)', async () => {
    await createKey({ name: 'listed-key', scopes: ['capture'], tenantId: 'acme' });
    const res = await listKeys({ tenantId: 'acme' });
    const body = await res.json();
    const entry = body.data[0];
    expect(typeof entry.keyHash).toBe('string');
    expect(entry.keyHash).toMatch(/^[a-f0-9]{64}$/);
    expect(entry.name).toBe('listed-key');
    expect(entry.tenantId).toBe('acme');
    expect(Array.isArray(entry.scopes)).toBe(true);
    expect(typeof entry.createdAt).toBe('string');
    // Must NOT include the raw key
    expect(entry.key).toBeUndefined();
  });

  it('response has Cache-Control: private, no-store', async () => {
    const res = await listKeys({ tenantId: 'acme' });
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('missing tenantId query param for ADMIN_KEY auth → 400', async () => {
    const res = await listKeys({});
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toContain('tenantId');
  });

  it('unauthenticated request → 401', async () => {
    const res = await SELF.fetch('https://worker.test/v1/admin/keys?tenantId=acme', {
      headers: { 'CF-Connecting-IP': nextIp() },
    });
    expect(res.status).toBe(401);
  });

  it('CAPTURE_API_KEY (no admin scope) → 403', async () => {
    const res = await listKeys({ tenantId: 'acme' }, CAPTURE_AUTH);
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/admin/keys -- IDOR prevention
// ---------------------------------------------------------------------------

describe('GET /v1/admin/keys -- IDOR prevention', () => {
  it('tenant-scoped admin key ignores tenantId query param (returns own tenant)', async () => {
    const adminKey = await seedAdminKey('alpha', 'alpha-admin');

    // Create a key for beta to ensure there is data there
    await createKey({ name: 'beta-key', scopes: ['capture'], tenantId: 'beta' });

    // alpha admin tries to list beta keys -- query param ignored, gets alpha's instead
    const res = await listKeys({ tenantId: 'beta' }, `Bearer ${adminKey.key}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    for (const entry of body.data) {
      expect(entry.tenantId).toBe('alpha');
    }
  });
});

// ---------------------------------------------------------------------------
// DELETE /v1/admin/keys/:keyHash -- revoke
// ---------------------------------------------------------------------------

describe('DELETE /v1/admin/keys/:keyHash -- revoke', () => {
  it('revokes a key and returns 200 with confirmation body', async () => {
    const created = await (await createKey({
      name: 'to-revoke', scopes: ['capture'], tenantId: 'acme',
    })).json();

    const res = await revokeKey(created.keyHash);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.keyHash).toBe(created.keyHash);
    expect(body.revoked).toBe(true);
    expect(typeof body.revokedAt).toBe('string');
  });

  it('KV record is marked revoked after deletion', async () => {
    const created = await (await createKey({
      name: 'revoke-check', scopes: ['capture'], tenantId: 'acme',
    })).json();

    await revokeKey(created.keyHash);

    const record = await env.KV.get(`apikey:${created.keyHash}`, 'json');
    expect(record.revoked).toBe(true);
    expect(typeof record.revokedAt).toBe('string');
  });

  it('revoking an already-revoked key returns 200 (idempotent)', async () => {
    const created = await (await createKey({
      name: 'idempotent-revoke', scopes: ['capture'], tenantId: 'acme',
    })).json();

    await revokeKey(created.keyHash);
    const res = await revokeKey(created.keyHash);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.revoked).toBe(true);
  });

  it('non-existent keyHash → 404', async () => {
    const fakeHash = 'a'.repeat(64);
    const res = await revokeKey(fakeHash);
    expect(res.status).toBe(404);
  });

  it('unauthenticated request → 401', async () => {
    const created = await (await createKey({
      name: 'unauth-revoke', scopes: ['capture'], tenantId: 'acme',
    })).json();

    const res = await SELF.fetch(`https://worker.test/v1/admin/keys/${created.keyHash}`, {
      method: 'DELETE',
      headers: { 'CF-Connecting-IP': nextIp() },
    });
    expect(res.status).toBe(401);
  });

  it('CAPTURE_API_KEY (no admin scope) → 403', async () => {
    const created = await (await createKey({
      name: 'scope-revoke', scopes: ['capture'], tenantId: 'acme',
    })).json();

    const res = await revokeKey(created.keyHash, CAPTURE_AUTH);
    expect(res.status).toBe(403);
  });

  it('cross-tenant revocation → 404 (not 403, prevents enumeration)', async () => {
    // Create an admin key for tenant-x and a capture key under it
    const tenantXAdmin = await seedAdminKey('tenant-x', 'tenant-x-admin');
    const tenantXCapture = await (await createKey(
      { name: 'tenant-x-capture', scopes: ['capture'], tenantId: 'tenant-x' },
    )).json();

    // Create admin key for tenant-y
    const tenantYAdmin = await seedAdminKey('tenant-y', 'tenant-y-admin');

    // tenant-y admin tries to revoke tenant-x's capture key → 404
    const res = await revokeKey(tenantXCapture.keyHash, `Bearer ${tenantYAdmin.key}`);
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// DELETE /v1/admin/keys/:keyHash -- self-revocation guard
// ---------------------------------------------------------------------------

describe('DELETE /v1/admin/keys/:keyHash -- self-revocation', () => {
  it('returns 409 when attempting to revoke the key used to authenticate', async () => {
    const adminKeyData = await seedAdminKey('tenant-z', 'self-revoke-test');

    // Create a second admin key so the guard won't also fail on last-admin-key check
    await createKey({ name: 'backup-admin', scopes: ['admin'], tenantId: 'tenant-z' });

    const res = await revokeKey(adminKeyData.keyHash, `Bearer ${adminKeyData.key}`);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.detail).toContain('Cannot revoke the key used to authenticate');
  });
});

// ---------------------------------------------------------------------------
// DELETE /v1/admin/keys/:keyHash -- last admin key guard
// ---------------------------------------------------------------------------

describe('DELETE /v1/admin/keys/:keyHash -- last admin key guard', () => {
  it('returns 409 when revoking the last admin key for a tenant', async () => {
    const only = await seedAdminKey('single-admin-tenant', 'only-admin');

    // ADMIN_KEY (env-admin) tries to revoke the only admin key → 409
    const res = await revokeKey(only.keyHash);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.detail).toContain('last admin key');
  });

  it('allows revoking an admin key when another active admin key exists', async () => {
    await seedAdminKey('multi-admin-tenant', 'admin-1');
    const admin2 = await seedAdminKey('multi-admin-tenant', 'admin-2');

    // Revoke admin-2 (admin-1 still exists) → 200
    const res = await revokeKey(admin2.keyHash);
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Integration flow: create → authenticate → list → revoke → verify 401
// ---------------------------------------------------------------------------

describe('admin integration flow', () => {
  it('create key -- authenticate with it -- list captures -- revoke -- 401 on reuse', async () => {
    // Step 1: Create a capture key for tenant "flow-test"
    const createRes = await createKey({
      name: 'flow-key',
      scopes: ['capture'],
      tenantId: 'flow-test',
    });
    expect(createRes.status).toBe(201);
    const { key, keyHash } = await createRes.json();

    // Step 2: Use the new key to list captures (requires 'read' scope, added via expansion)
    const listRes = await SELF.fetch('https://worker.test/v1/captures', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${key}`,
        'CF-Connecting-IP': nextIp(),
      },
    });
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    expect(Array.isArray(listBody.data)).toBe(true);

    // Step 3: Revoke the key via ADMIN_KEY
    const revokeRes = await revokeKey(keyHash);
    expect(revokeRes.status).toBe(200);
    const revokeBody = await revokeRes.json();
    expect(revokeBody.revoked).toBe(true);

    // Step 4: Attempt to use the revoked key → 401
    const afterRevokeRes = await SELF.fetch('https://worker.test/v1/captures', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${key}`,
        'CF-Connecting-IP': nextIp(),
      },
    });
    expect(afterRevokeRes.status).toBe(401);
  });
});
