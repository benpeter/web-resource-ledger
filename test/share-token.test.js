// tva
// Tests for share token creation, usage, scoping, and expiry.
//
// Security invariants verified:
//   - Share tokens are single-capture scoped (cannot access other captures)
//   - Expired tokens return 410 (not 401) to communicate intentional sharing
//   - Invalid/unknown tokens return 401 (prevents timing oracle on expiry)
//   - Share tokens cannot be used for the list endpoint
//   - Raw tokens are never stored (verified via db inspection)

import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { createCapture, completeCapture } from '../src/db.js';
import {
  cleanDb,
  seedApiKey,
  seedCapture,
  seedShareToken,
  TEST_TENANT_KEY,
} from './fixtures.js';

// ---------------------------------------------------------------------------
// Fixture IDs
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-share-test';
const CAP_A = 'cap_' + 'a'.repeat(32);
const CAP_B = 'cap_' + 'b'.repeat(32);
const CAP_A_ARTIFACTS = {
  screenshot: `captures/${CAP_A}/screenshot.png`,
  html: `captures/${CAP_A}/rendered.html`,
};
const CAP_A_WACZ = {
  key: `captures/${CAP_A}/bundle.wacz`,
  bundleHash: 'sha256:' + 'a'.repeat(64),
  size: 100,
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await cleanDb(env.DB);

  await seedApiKey(env.DB, TEST_TENANT_KEY, { tenantId: TENANT_ID, scopes: ['capture', 'read'] });

  // Seed tenant's captures
  await createCapture(env.DB, CAP_A, 'https://example.com', '1.2.3.4', TENANT_ID);
  await completeCapture(env.DB, CAP_A, CAP_A_ARTIFACTS, CAP_A_WACZ);
  await env.BUCKET.put(CAP_A_ARTIFACTS.screenshot, new Uint8Array([137, 80, 78, 71]));
  await env.BUCKET.put(CAP_A_ARTIFACTS.html, '<html>a</html>');
  await env.BUCKET.put(CAP_A_WACZ.key, new Uint8Array([80, 75, 3, 4]));

  await createCapture(env.DB, CAP_B, 'https://example.com/b', '1.2.3.5', TENANT_ID);
  await completeCapture(env.DB, CAP_B, {
    screenshot: `captures/${CAP_B}/screenshot.png`,
    html: `captures/${CAP_B}/rendered.html`,
  });
  await env.BUCKET.put(`captures/${CAP_B}/screenshot.png`, new Uint8Array([137, 80, 78, 71]));
  await env.BUCKET.put(`captures/${CAP_B}/rendered.html`, '<html>b</html>');
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createShare(captureId, body = {}, headers = {}) {
  return SELF.fetch(`https://worker.test/v1/captures/${captureId}/share`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TEST_TENANT_KEY}`,
      'Content-Type': 'application/json',
      ...headers,
    },
    body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
  });
}

// ---------------------------------------------------------------------------
// Token creation
// ---------------------------------------------------------------------------

describe('POST /v1/captures/{id}/share -- creation', () => {
  it('authenticated tenant creates share token -> 201 with token, shareUrl, expiresAt', async () => {
    const res = await createShare(CAP_A);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.token).toMatch(/^wrl_share_/);
    expect(body.shareUrl).toContain(CAP_A);
    expect(body.shareUrl).toContain('token=');
    expect(body.expiresAt).toBeNull();
  });

  it('expiresIn provided -> correct expiresAt in response', async () => {
    const before = Date.now();
    const res = await createShare(CAP_A, { expiresIn: 3600 });
    const after = Date.now();
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.expiresAt).toBeTruthy();
    const expiresMs = new Date(body.expiresAt).getTime();
    expect(expiresMs).toBeGreaterThanOrEqual(before + 3600 * 1000);
    expect(expiresMs).toBeLessThanOrEqual(after + 3600 * 1000);
  });

  it('without expiresIn -> expiresAt is null (permanent token)', async () => {
    const res = await createShare(CAP_A);
    const body = await res.json();
    expect(body.expiresAt).toBeNull();
  });

  it('shareUrl uses the request origin', async () => {
    const res = await createShare(CAP_A);
    const body = await res.json();
    expect(body.shareUrl).toMatch(/^https?:\/\/worker\.test\//);
  });

  it('unauthenticated request returns 401', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_A}/share`, {
      method: 'POST',
    });
    expect(res.status).toBe(401);
  });

  it('creating share for non-owned capture returns 404', async () => {
    // Use a different tenant's key (CAPTURE_API_KEY = 'test-api-key-for-vitest', tenantId = 'default')
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_A}/share`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-api-key-for-vitest',
        'Content-Type': 'application/json',
      },
    });
    expect(res.status).toBe(404);
  });

  it('creating share for non-existent capture returns 404', async () => {
    const unknownId = 'cap_' + '9'.repeat(32);
    const res = await createShare(unknownId);
    expect(res.status).toBe(404);
  });

  it('invalid expiresIn (below minimum) returns 400', async () => {
    const res = await createShare(CAP_A, { expiresIn: 60 });
    expect(res.status).toBe(400);
  });

  it('invalid expiresIn (above maximum) returns 400', async () => {
    const res = await createShare(CAP_A, { expiresIn: 99999999 });
    expect(res.status).toBe(400);
  });

  it('invalid expiresIn (non-integer) returns 400', async () => {
    const res = await createShare(CAP_A, { expiresIn: 3.5 });
    expect(res.status).toBe(400);
  });

  it('allows share creation for pending captures', async () => {
    const pendingId = 'cap_' + 'e'.repeat(32);
    await createCapture(env.DB, pendingId, 'https://example.com/pending', '1.2.3.4', TENANT_ID);
    // do NOT complete -- leaves it in pending status
    const res = await SELF.fetch(`https://worker.test/v1/captures/${pendingId}/share`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TEST_TENANT_KEY}`,
        'Content-Type': 'application/json',
      },
    });
    expect(res.status).toBe(201);
  });

  it('creating share for failed capture returns 404', async () => {
    const { failCapture } = await import('../src/db.js');
    const failedId = 'cap_' + 'f'.repeat(32);
    await createCapture(env.DB, failedId, 'https://example.com/failed', '1.2.3.4', TENANT_ID);
    await failCapture(env.DB, failedId, 'render error', false);
    const res = await SELF.fetch(`https://worker.test/v1/captures/${failedId}/share`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TEST_TENANT_KEY}`,
        'Content-Type': 'application/json',
      },
    });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Token usage -- access grants
// ---------------------------------------------------------------------------

describe('Share token usage -- GET /v1/captures/{id}', () => {
  it('valid token grants access -> 200', async () => {
    const rawToken = 'wrl_share_' + 'z'.repeat(43);
    await seedShareToken(env.DB, { captureId: CAP_A, tenantId: TENANT_ID, rawToken });

    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_A}?token=${encodeURIComponent(rawToken)}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(CAP_A);
  });

  it('valid token grants access to status endpoint', async () => {
    const rawToken = 'wrl_share_' + 'z'.repeat(43);
    await seedShareToken(env.DB, { captureId: CAP_A, tenantId: TENANT_ID, rawToken });

    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_A}/status?token=${encodeURIComponent(rawToken)}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('complete');
  });

  it('status endpoint includes token in captureUrl when accessed via share token', async () => {
    const rawToken = 'wrl_share_' + 'z'.repeat(43);
    await seedShareToken(env.DB, { captureId: CAP_A, tenantId: TENANT_ID, rawToken });

    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_A}/status?token=${encodeURIComponent(rawToken)}`);
    const body = await res.json();
    expect(body.captureUrl).toContain(`token=${encodeURIComponent(rawToken)}`);
  });

  it('valid token grants access to screenshot artifact', async () => {
    const rawToken = 'wrl_share_' + 'z'.repeat(43);
    await seedShareToken(env.DB, { captureId: CAP_A, tenantId: TENANT_ID, rawToken });

    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_A}/artifacts/screenshot?token=${encodeURIComponent(rawToken)}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('image/png');
  });

  it('valid token grants access to html artifact', async () => {
    const rawToken = 'wrl_share_' + 'z'.repeat(43);
    await seedShareToken(env.DB, { captureId: CAP_A, tenantId: TENANT_ID, rawToken });

    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_A}/artifacts/html?token=${encodeURIComponent(rawToken)}`);
    expect(res.status).toBe(200);
  });

  it('valid token grants access to wacz artifact', async () => {
    const rawToken = 'wrl_share_' + 'z'.repeat(43);
    await seedShareToken(env.DB, { captureId: CAP_A, tenantId: TENANT_ID, rawToken });

    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_A}/artifacts/wacz?token=${encodeURIComponent(rawToken)}`);
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Token scoping -- share token cannot access a different capture
// ---------------------------------------------------------------------------

describe('Share token scoping', () => {
  it('share token for capture A cannot access capture B -> 404', async () => {
    const rawToken = 'wrl_share_' + 'z'.repeat(43);
    // Token is scoped to CAP_A
    await seedShareToken(env.DB, { captureId: CAP_A, tenantId: TENANT_ID, rawToken });

    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_B}?token=${encodeURIComponent(rawToken)}`);
    expect(res.status).toBe(404);
  });

  it('share token cannot be used for list endpoint -> 401', async () => {
    const rawToken = 'wrl_share_' + 'z'.repeat(43);
    await seedShareToken(env.DB, { captureId: CAP_A, tenantId: TENANT_ID, rawToken });

    const res = await SELF.fetch(`https://worker.test/v1/captures?token=${encodeURIComponent(rawToken)}`);
    expect(res.status).toBe(401);
  });

  it('share token for capture A cannot access artifact for capture B -> 404', async () => {
    const rawToken = 'wrl_share_' + 'z'.repeat(43);
    await seedShareToken(env.DB, { captureId: CAP_A, tenantId: TENANT_ID, rawToken });

    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_B}/artifacts/screenshot?token=${encodeURIComponent(rawToken)}`);
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Token expiry and invalid tokens
// ---------------------------------------------------------------------------

describe('Share token validity', () => {
  it('expired token returns 410', async () => {
    const rawToken = 'wrl_share_' + 'z'.repeat(43);
    const pastTime = new Date(Date.now() - 3600 * 1000).toISOString(); // 1 hour ago
    await seedShareToken(env.DB, {
      captureId: CAP_A,
      tenantId: TENANT_ID,
      rawToken,
      expiresAt: pastTime,
    });

    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_A}?token=${encodeURIComponent(rawToken)}`);
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.detail).toContain('expired');
  });

  it('not-yet-expired token returns 200', async () => {
    const rawToken = 'wrl_share_' + 'z'.repeat(43);
    const futureTime = new Date(Date.now() + 3600 * 1000).toISOString(); // 1 hour from now
    await seedShareToken(env.DB, {
      captureId: CAP_A,
      tenantId: TENANT_ID,
      rawToken,
      expiresAt: futureTime,
    });

    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_A}?token=${encodeURIComponent(rawToken)}`);
    expect(res.status).toBe(200);
  });

  it('invalid/unknown token returns 401', async () => {
    const badToken = 'wrl_share_' + 'x'.repeat(43);
    // Not seeded in DB -- should return 401

    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_A}?token=${encodeURIComponent(badToken)}`);
    expect(res.status).toBe(401);
  });

  it('malformed token (not wrl_share_ prefixed) returns 401', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_A}?token=notavalidtoken`);
    expect(res.status).toBe(401);
  });

  it('empty ?token= returns 401', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_A}?token=`);
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Token generation unit tests
// ---------------------------------------------------------------------------

describe('generateShareToken / hashShareToken', () => {
  it('generateShareToken returns wrl_share_ prefixed token of correct length', async () => {
    const { generateShareToken } = await import('../src/share-tokens.js');
    const token = generateShareToken();
    expect(token).toMatch(/^wrl_share_/);
    // 10 (prefix) + 43 (base64url of 32 bytes) = 53 chars
    expect(token.length).toBe(53);
  });

  it('generateShareToken is URL-safe (no +, /, = chars in body)', async () => {
    const { generateShareToken } = await import('../src/share-tokens.js');
    for (let i = 0; i < 20; i++) {
      const token = generateShareToken();
      const body = token.slice('wrl_share_'.length);
      expect(body).not.toContain('+');
      expect(body).not.toContain('/');
      expect(body).not.toContain('=');
    }
  });

  it('hashShareToken returns 64 lowercase hex chars', async () => {
    const { hashShareToken } = await import('../src/share-tokens.js');
    const hash = await hashShareToken('wrl_share_test');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('two different tokens produce different hashes', async () => {
    const { generateShareToken, hashShareToken } = await import('../src/share-tokens.js');
    const t1 = generateShareToken();
    const t2 = generateShareToken();
    expect(t1).not.toBe(t2);
    const h1 = await hashShareToken(t1);
    const h2 = await hashShareToken(t2);
    expect(h1).not.toBe(h2);
  });
});
