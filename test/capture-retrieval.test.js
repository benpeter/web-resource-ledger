// tva
// Tests for capture retrieval auth gate and tenant isolation.
//
// Security invariants verified:
//   - Non-WACZ retrieval endpoints require authentication (API key or session)
//   - WACZ artifacts are publicly accessible for independent verification (#162)
//   - Cross-tenant access returns 404 (NOT 403) with identical response body
//   - Share token access only granted to the specific capture the token was issued for
//   - The verify endpoint (/v1/verify/) must remain unauthenticated (in verify-integration.test.js)

import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { createCapture, completeCapture, failCapture } from '../src/db.js';
import {
  cleanDb,
  seedApiKey,
  seedCapture,
  seedShareToken,
  createTestSession,
  TEST_TENANT_KEY,
  TEST_TENANT_KEY_B,
} from './fixtures.js';

// ---------------------------------------------------------------------------
// Fixture IDs
// ---------------------------------------------------------------------------

const TENANT_A_ID = 'tenant-a';
const TENANT_B_ID = 'tenant-b';

const CAP_A = 'cap_' + 'a'.repeat(32);
const CAP_B = 'cap_' + 'b'.repeat(32);
const CAP_A_ARTIFACTS = {
  screenshot: `captures/${CAP_A}/screenshot.png`,
  html: `captures/${CAP_A}/rendered.html`,
  headers: `captures/${CAP_A}/headers.json`,
};
const CAP_A_WACZ = {
  key: `captures/${CAP_A}/bundle.wacz`,
  bundleHash: 'sha256:' + 'a'.repeat(64),
  size: 42000,
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await cleanDb(env.DB);

  // Seed API keys for both tenants
  await seedApiKey(env.DB, TEST_TENANT_KEY, { tenantId: TENANT_A_ID, scopes: ['capture', 'read'] });
  await seedApiKey(env.DB, TEST_TENANT_KEY_B, { tenantId: TENANT_B_ID, scopes: ['capture', 'read'] });

  // Seed tenant A's capture (complete with artifacts and wacz)
  await createCapture(env.DB, CAP_A, 'https://example.com', '1.2.3.4', TENANT_A_ID);
  await completeCapture(env.DB, CAP_A, CAP_A_ARTIFACTS, CAP_A_WACZ);

  // Seed R2 artifacts for tenant A's capture
  await env.BUCKET.put(CAP_A_ARTIFACTS.screenshot, new Uint8Array([137, 80, 78, 71]));
  await env.BUCKET.put(CAP_A_ARTIFACTS.html, '<html>test</html>');
  await env.BUCKET.put(CAP_A_ARTIFACTS.headers, JSON.stringify({ 'content-type': 'text/html' }));
  await env.BUCKET.put(CAP_A_WACZ.key, new Uint8Array([80, 75, 3, 4]));

  // Seed tenant B's capture (complete)
  const capBArtifacts = {
    screenshot: `captures/${CAP_B}/screenshot.png`,
    html: `captures/${CAP_B}/rendered.html`,
  };
  await createCapture(env.DB, CAP_B, 'https://example.com/b', '1.2.3.5', TENANT_B_ID);
  await completeCapture(env.DB, CAP_B, capBArtifacts);
  await env.BUCKET.put(capBArtifacts.screenshot, new Uint8Array([137, 80, 78, 71]));
  await env.BUCKET.put(capBArtifacts.html, '<html>b</html>');
});

// ---------------------------------------------------------------------------
// GET /v1/captures/{id} -- authentication
// ---------------------------------------------------------------------------

describe('GET /v1/captures/{id} -- auth', () => {
  it('unauthenticated request returns 401', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_A}`);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toHaveProperty('detail');
  });

  it('authenticated owner with API key returns 200', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_A}`, {
      headers: { Authorization: `Bearer ${TEST_TENANT_KEY}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(CAP_A);
    expect(body.status).toBe('complete');
  });

  it('authenticated owner with session cookie returns 200', async () => {
    const { cookie } = await createTestSession(env.DB, env, { tenantId: TENANT_A_ID });
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_A}`, {
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);
  });

  it('legacy auth (authMethod: legacy, tenantId: default) accesses default-tenant captures', async () => {
    // Seed a capture owned by 'default' tenant
    const defaultCapId = 'cap_' + 'd'.repeat(32);
    await createCapture(env.DB, defaultCapId, 'https://example.com/default', '1.2.3.4', 'default');
    await completeCapture(env.DB, defaultCapId, {
      screenshot: `captures/${defaultCapId}/screenshot.png`,
      html: `captures/${defaultCapId}/rendered.html`,
    });
    await env.BUCKET.put(`captures/${defaultCapId}/screenshot.png`, new Uint8Array([137, 80, 78, 71]));
    await env.BUCKET.put(`captures/${defaultCapId}/rendered.html`, '<html>default</html>');

    // CAPTURE_API_KEY in env maps to tenantId 'default' (legacy auth)
    const res = await SELF.fetch(`https://worker.test/v1/captures/${defaultCapId}`, {
      headers: { Authorization: 'Bearer test-api-key-for-vitest' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(defaultCapId);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/captures/{id} -- tenant isolation
// ---------------------------------------------------------------------------

describe('GET /v1/captures/{id} -- tenant isolation', () => {
  it('cross-tenant access returns 404', async () => {
    // Tenant B tries to access tenant A's capture
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_A}`, {
      headers: { Authorization: `Bearer ${TEST_TENANT_KEY_B}` },
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty('detail');
  });

  it('cross-tenant 404 is identical to non-existent capture 404', async () => {
    const unknownId = 'cap_' + '9'.repeat(32);

    const crossTenantRes = await SELF.fetch(`https://worker.test/v1/captures/${CAP_A}`, {
      headers: { Authorization: `Bearer ${TEST_TENANT_KEY_B}` },
    });
    const notFoundRes = await SELF.fetch(`https://worker.test/v1/captures/${unknownId}`, {
      headers: { Authorization: `Bearer ${TEST_TENANT_KEY}` },
    });

    expect(crossTenantRes.status).toBe(404);
    expect(notFoundRes.status).toBe(404);

    const crossTenantBody = await crossTenantRes.json();
    const notFoundBody = await notFoundRes.json();
    // Both must have identical detail messages (no enumeration)
    expect(crossTenantBody.detail).toBe(notFoundBody.detail);
  });

  it('response body does not include ip field', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_A}`, {
      headers: { Authorization: `Bearer ${TEST_TENANT_KEY}` },
    });
    const body = await res.json();
    expect(body.ip).toBeUndefined();
  });

  it('security headers present on 200', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_A}`, {
      headers: { Authorization: `Bearer ${TEST_TENANT_KEY}` },
    });
    expect(res.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('Cache-Control: private, no-store on 200', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_A}`, {
      headers: { Authorization: `Bearer ${TEST_TENANT_KEY}` },
    });
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  });
});

// ---------------------------------------------------------------------------
// GET /v1/captures/{id}/status -- auth and tenant isolation
// ---------------------------------------------------------------------------

describe('GET /v1/captures/{id}/status -- auth and tenant isolation', () => {
  it('unauthenticated returns 401', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_A}/status`);
    expect(res.status).toBe(401);
  });

  it('authenticated owner returns 200', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_A}/status`, {
      headers: { Authorization: `Bearer ${TEST_TENANT_KEY}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('complete');
  });

  it('cross-tenant access returns 404', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_A}/status`, {
      headers: { Authorization: `Bearer ${TEST_TENANT_KEY_B}` },
    });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/captures/{id}/artifacts -- auth and tenant isolation
// ---------------------------------------------------------------------------

describe('GET /v1/captures/{id}/artifacts -- auth and tenant isolation', () => {
  it('unauthenticated screenshot returns 401', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_A}/artifacts/screenshot`);
    expect(res.status).toBe(401);
  });

  it('unauthenticated html returns 401', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_A}/artifacts/html`);
    expect(res.status).toBe(401);
  });

  it('unauthenticated wacz returns 200 (public for independent verification)', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_A}/artifacts/wacz`);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/wacz+zip');
  });

  it('authenticated owner can access screenshot', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_A}/artifacts/screenshot`, {
      headers: { Authorization: `Bearer ${TEST_TENANT_KEY}` },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('image/png');
  });

  it('authenticated owner can access html', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_A}/artifacts/html`, {
      headers: { Authorization: `Bearer ${TEST_TENANT_KEY}` },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/plain');
  });

  it('authenticated owner can access wacz', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_A}/artifacts/wacz`, {
      headers: { Authorization: `Bearer ${TEST_TENANT_KEY}` },
    });
    expect(res.status).toBe(200);
  });

  it('cross-tenant screenshot access returns 404', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_A}/artifacts/screenshot`, {
      headers: { Authorization: `Bearer ${TEST_TENANT_KEY_B}` },
    });
    expect(res.status).toBe(404);
  });

  it('cross-tenant html access returns 404', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_A}/artifacts/html`, {
      headers: { Authorization: `Bearer ${TEST_TENANT_KEY_B}` },
    });
    expect(res.status).toBe(404);
  });

  it('cross-tenant wacz access returns 404', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_A}/artifacts/wacz`, {
      headers: { Authorization: `Bearer ${TEST_TENANT_KEY_B}` },
    });
    expect(res.status).toBe(404);
  });

  it('unauthenticated headers returns 401', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_A}/artifacts/headers`);
    expect(res.status).toBe(401);
  });

  it('unauthenticated wacz for non-existent capture returns 404', async () => {
    const unknownId = 'cap_' + '9'.repeat(32);
    const res = await SELF.fetch(`https://worker.test/v1/captures/${unknownId}/artifacts/wacz`);
    expect(res.status).toBe(404);
  });

  it('unauthenticated wacz for incomplete capture returns 404', async () => {
    const pendingId = 'cap_' + 'f'.repeat(32);
    await createCapture(env.DB, pendingId, 'https://example.com/pending', '1.2.3.4', TENANT_A_ID);
    const res = await SELF.fetch(`https://worker.test/v1/captures/${pendingId}/artifacts/wacz`);
    expect(res.status).toBe(404);
  });

  it('cross-tenant 404 is identical to non-existent capture 404 for artifacts', async () => {
    const unknownId = 'cap_' + '9'.repeat(32);

    const crossTenantRes = await SELF.fetch(`https://worker.test/v1/captures/${CAP_A}/artifacts/screenshot`, {
      headers: { Authorization: `Bearer ${TEST_TENANT_KEY_B}` },
    });
    const notFoundRes = await SELF.fetch(`https://worker.test/v1/captures/${unknownId}/artifacts/screenshot`, {
      headers: { Authorization: `Bearer ${TEST_TENANT_KEY}` },
    });

    expect(crossTenantRes.status).toBe(404);
    expect(notFoundRes.status).toBe(404);

    const crossBody = await crossTenantRes.json();
    const notFoundBody = await notFoundRes.json();
    expect(crossBody.detail).toBe(notFoundBody.detail);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/captures/{id} -- artifact URLs include ?token= when share token used
// ---------------------------------------------------------------------------

describe('GET /v1/captures/{id} -- share token propagation to artifact URLs', () => {
  it('artifact URLs include ?token= when accessed via share token', async () => {
    const rawToken = 'wrl_share_' + 'x'.repeat(43);
    await seedShareToken(env.DB, {
      captureId: CAP_A,
      tenantId: TENANT_A_ID,
      rawToken,
    });

    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_A}?token=${encodeURIComponent(rawToken)}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.artifacts.screenshot).toContain(`token=${encodeURIComponent(rawToken)}`);
    expect(body.artifacts.html).toContain(`token=${encodeURIComponent(rawToken)}`);
    expect(body.artifacts.headers).toContain(`token=${encodeURIComponent(rawToken)}`);
    expect(body.wacz.url).toContain(`token=${encodeURIComponent(rawToken)}`);
  });

  it('artifact URLs do NOT include ?token= when accessed via API key', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_A}`, {
      headers: { Authorization: `Bearer ${TEST_TENANT_KEY}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.artifacts.screenshot).not.toContain('token=');
    expect(body.artifacts.html).not.toContain('token=');
  });
});
