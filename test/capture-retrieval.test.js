// tva
// Tests for capture retrieval auth gate and tenant isolation.
//
// Security invariants verified:
//   - Individual capture endpoints are public (no auth required) (#169)
//   - List endpoint (GET /v1/captures) requires authentication
//   - Authenticated cross-tenant access returns 404 (NOT 403) with identical response body
//   - The verify endpoint (/v1/verify/) must remain unauthenticated (in verify-integration.test.js)

import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { createCapture, completeCapture, failCapture } from '../src/db.js';
import {
  cleanDb,
  seedApiKey,
  seedCapture,
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
// GET /v1/captures/{id} -- public access (#169)
// ---------------------------------------------------------------------------

describe('GET /v1/captures/{id} -- public access', () => {
  it('unauthenticated request returns 200 (public endpoint)', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_A}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(CAP_A);
    expect(body.status).toBe('complete');
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

  it('non-existent capture returns 404 unauthenticated', async () => {
    const unknownId = 'cap_' + '9'.repeat(32);
    const res = await SELF.fetch(`https://worker.test/v1/captures/${unknownId}`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty('detail');
  });
});

// ---------------------------------------------------------------------------
// GET /v1/captures/{id} -- tenant isolation (authenticated requests only)
// ---------------------------------------------------------------------------

describe('GET /v1/captures/{id} -- tenant isolation', () => {
  it('authenticated cross-tenant access returns 404', async () => {
    // Tenant B authenticates and tries to access tenant A's capture -- should be hidden
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_A}`, {
      headers: { Authorization: `Bearer ${TEST_TENANT_KEY_B}` },
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty('detail');
  });

  it('authenticated cross-tenant 404 is identical to non-existent capture 404', async () => {
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

  it('unauthenticated request can access any tenant capture (public)', async () => {
    // Public access -- capture ID is the access key, no tenant check
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_A}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(CAP_A);
  });

  it('response body does not include ip field', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_A}`);
    const body = await res.json();
    expect(body.ip).toBeUndefined();
  });

  it('response includes changeSummary when present', async () => {
    const capId = 'cap_' + 'c'.repeat(32);
    const prevId = 'cap_' + 'd'.repeat(32);
    const cs = { changed: true, previousCaptureId: prevId, html: { changed: true }, screenshot: { changed: false }, headers: { changed: false } };
    await seedCapture(env.DB, capId, {
      tenantId: TENANT_A_ID,
      status: 'complete',
      completedAt: new Date().toISOString(),
      artifacts: { screenshot: `captures/${capId}/screenshot.png`, html: `captures/${capId}/rendered.html` },
      changeSummary: cs,
      scheduleId: 'sched_test123',
    });
    const res = await SELF.fetch(`https://worker.test/v1/captures/${capId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.changeSummary).toEqual(cs);
    expect(body.scheduleId).toBe('sched_test123');
  });

  it('response omits changeSummary and scheduleId when absent', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_A}`);
    const body = await res.json();
    expect(body.changeSummary).toBeUndefined();
    expect(body.scheduleId).toBeUndefined();
  });

  it('security headers present on 200', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_A}`);
    expect(res.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('Cache-Control: no-store on 200 (not private since responses are public)', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_A}`);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });
});

// ---------------------------------------------------------------------------
// GET /v1/captures/{id}/status -- public access and tenant isolation
// ---------------------------------------------------------------------------

describe('GET /v1/captures/{id}/status -- public access and tenant isolation', () => {
  it('unauthenticated returns 200 (public endpoint)', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_A}/status`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('complete');
  });

  it('authenticated owner returns 200', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_A}/status`, {
      headers: { Authorization: `Bearer ${TEST_TENANT_KEY}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('complete');
  });

  it('authenticated cross-tenant access returns 404', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_A}/status`, {
      headers: { Authorization: `Bearer ${TEST_TENANT_KEY_B}` },
    });
    expect(res.status).toBe(404);
  });

  it('captureUrl in complete status does not include ?token=', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_A}/status`);
    const body = await res.json();
    expect(body.captureUrl).toBeDefined();
    expect(body.captureUrl).not.toContain('token=');
    expect(body.captureUrl).toContain(CAP_A);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/captures/{id}/artifacts -- public access and tenant isolation (#169)
// ---------------------------------------------------------------------------

describe('GET /v1/captures/{id}/artifacts -- public access and tenant isolation', () => {
  it('unauthenticated screenshot returns 200 (public endpoint)', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_A}/artifacts/screenshot`);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('image/png');
  });

  it('unauthenticated html returns 200 (public endpoint)', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_A}/artifacts/html`);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/plain');
  });

  it('unauthenticated wacz returns 200 (public endpoint)', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_A}/artifacts/wacz`);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/wacz+zip');
  });

  it('unauthenticated headers returns 200 (public endpoint)', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_A}/artifacts/headers`);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/json');
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

  it('authenticated cross-tenant screenshot access returns 404', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_A}/artifacts/screenshot`, {
      headers: { Authorization: `Bearer ${TEST_TENANT_KEY_B}` },
    });
    expect(res.status).toBe(404);
  });

  it('authenticated cross-tenant html access returns 404', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_A}/artifacts/html`, {
      headers: { Authorization: `Bearer ${TEST_TENANT_KEY_B}` },
    });
    expect(res.status).toBe(404);
  });

  it('authenticated cross-tenant wacz access returns 404', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_A}/artifacts/wacz`, {
      headers: { Authorization: `Bearer ${TEST_TENANT_KEY_B}` },
    });
    expect(res.status).toBe(404);
  });

  it('unauthenticated screenshot for non-existent capture returns 404', async () => {
    const unknownId = 'cap_' + '9'.repeat(32);
    const res = await SELF.fetch(`https://worker.test/v1/captures/${unknownId}/artifacts/screenshot`);
    expect(res.status).toBe(404);
  });

  it('unauthenticated artifact for incomplete capture returns 404', async () => {
    const pendingId = 'cap_' + 'f'.repeat(32);
    await createCapture(env.DB, pendingId, 'https://example.com/pending', '1.2.3.4', TENANT_A_ID);
    const res = await SELF.fetch(`https://worker.test/v1/captures/${pendingId}/artifacts/screenshot`);
    expect(res.status).toBe(404);
  });

  it('authenticated cross-tenant 404 is identical to non-existent capture 404 for artifacts', async () => {
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
// GET /v1/captures/{id} -- artifact URLs are plain (no token suffix)
// ---------------------------------------------------------------------------

describe('GET /v1/captures/{id} -- artifact URLs', () => {
  it('artifact URLs do not include ?token= (public access, no token needed)', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_A}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.artifacts.screenshot).not.toContain('token=');
    expect(body.artifacts.html).not.toContain('token=');
    expect(body.artifacts.headers).not.toContain('token=');
    expect(body.wacz.url).not.toContain('token=');
  });

  it('artifact URLs are clean when accessed via API key', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_A}`, {
      headers: { Authorization: `Bearer ${TEST_TENANT_KEY}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.artifacts.screenshot).not.toContain('token=');
    expect(body.artifacts.html).not.toContain('token=');
  });
});

// ---------------------------------------------------------------------------
// GET /v1/captures/{id}/artifacts -- Content-Disposition filenames (#181)
// ---------------------------------------------------------------------------

describe('GET /v1/captures/{id}/artifacts -- Content-Disposition filenames', () => {
  it('screenshot Content-Disposition includes domain and date', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_A}/artifacts/screenshot`);
    expect(res.status).toBe(200);
    const cd = res.headers.get('Content-Disposition');
    expect(cd).toMatch(/^attachment; filename="capture-example\.com-\d{4}-\d{2}-\d{2}\.png"$/);
  });

  it('wacz Content-Disposition includes domain and date', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_A}/artifacts/wacz`);
    expect(res.status).toBe(200);
    const cd = res.headers.get('Content-Disposition');
    expect(cd).toMatch(/^attachment; filename="capture-example\.com-\d{4}-\d{2}-\d{2}\.wacz"$/);
  });

  it('html Content-Disposition includes domain and date', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_A}/artifacts/html`);
    expect(res.status).toBe(200);
    const cd = res.headers.get('Content-Disposition');
    expect(cd).toMatch(/^attachment; filename="capture-example\.com-\d{4}-\d{2}-\d{2}\.html"$/);
  });

  it('screenshot-before Content-Disposition includes domain, date, and -before suffix', async () => {
    // Seed screenshotBefore artifact (unique code path for -before suffix)
    const beforeKey = `captures/${CAP_A}/screenshot-before.png`;
    await env.BUCKET.put(beforeKey, new Uint8Array([137, 80, 78, 71]));

    // Re-complete the capture with screenshotBefore included
    const artifactsWithBefore = {
      ...CAP_A_ARTIFACTS,
      screenshotBefore: beforeKey,
    };
    await completeCapture(env.DB, CAP_A, artifactsWithBefore, CAP_A_WACZ);

    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_A}/artifacts/screenshot-before`);
    expect(res.status).toBe(200);
    const cd = res.headers.get('Content-Disposition');
    expect(cd).toMatch(/^attachment; filename="capture-example\.com-\d{4}-\d{2}-\d{2}-before\.png"$/);
  });
});
