import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { createCapture, completeCapture } from '../src/kv.js';

const SEED_ID = 'cap_' + 'a'.repeat(32);
const SEED_URL = 'https://example.com';
const SEED_ARTIFACTS = {
  screenshot: `captures/${SEED_ID}/screenshot.png`,
  html:       `captures/${SEED_ID}/rendered.html`,
  headers:    `captures/${SEED_ID}/headers.json`,
};
const SEED_WACZ = {
  key:        `captures/${SEED_ID}/bundle.wacz`,
  bundleHash: 'sha256:' + 'a'.repeat(64),
  size:       42000,
};

beforeEach(async () => {
  await env.KV.delete(`capture:${SEED_ID}`);
  await createCapture(env.KV, SEED_ID, SEED_URL, '93.184.216.34');
  await completeCapture(env.KV, SEED_ID, SEED_ARTIFACTS, SEED_WACZ);

  // Seed R2 with test artifact data
  await env.BUCKET.put(SEED_ARTIFACTS.screenshot, new Uint8Array([137, 80, 78, 71])); // PNG magic bytes
  await env.BUCKET.put(SEED_ARTIFACTS.html, '<html>test</html>');
  await env.BUCKET.put(SEED_ARTIFACTS.headers, JSON.stringify({ 'content-type': 'text/html' }));
  await env.BUCKET.put(SEED_WACZ.key, new Uint8Array([80, 75, 3, 4])); // ZIP magic bytes
});

// ---------------------------------------------------------------------------
// GET /v1/captures/{id}
// ---------------------------------------------------------------------------

describe('GET /v1/captures/{id}', () => {
  it('200 with correct shape', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${SEED_ID}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/json');
    const body = await res.json();
    expect(body.id).toBe(SEED_ID);
    expect(body.status).toBe('complete');
    expect(body.url).toBeTruthy();
    expect(body.completedAt).toBeTruthy();
    expect(body.artifacts.screenshot).toBeTruthy();
    expect(body.artifacts.html).toBeTruthy();
    expect(body.wacz.url).toBeTruthy();
    expect(body.wacz.size).toBe(42000);
    expect(body.wacz.bundleHash).toBeTruthy();
  });

  it('artifact URLs are absolute HTTP(S)', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${SEED_ID}`);
    const body = await res.json();
    expect(body.artifacts.screenshot).toMatch(/^https?:\/\//);
    expect(body.artifacts.html).toMatch(/^https?:\/\//);
    expect(body.wacz.url).toMatch(/^https?:\/\//);
  });

  it('no auth required', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${SEED_ID}`);
    expect(res.status).toBe(200);
  });

  it('security headers present on 200', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${SEED_ID}`);
    expect(res.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('Cache-Control: private, no-store on 200', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${SEED_ID}`);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('RFC 9457 404 for valid-format unknown ID', async () => {
    const unknownId = 'cap_' + 'b'.repeat(32);
    const res = await SELF.fetch(`https://worker.test/v1/captures/${unknownId}`);
    expect(res.status).toBe(404);
    expect(res.headers.get('Content-Type')).toContain('application/problem+json');
    const body = await res.json();
    expect(body).toMatchObject({ type: 'about:blank', status: 404 });
    expect(body).toHaveProperty('title');
    expect(body).toHaveProperty('detail');
    // SECURITY: response detail must not echo back the capture ID
    expect(body.detail).not.toContain(unknownId);
  });

  it('RFC 9457 404 for malformed ID', async () => {
    const res = await SELF.fetch('https://worker.test/v1/captures/badid');
    expect(res.status).toBe(404);
  });

  it('security: ip field absent from response', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${SEED_ID}`);
    const body = await res.json();
    expect(body.ip).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// GET /v1/captures/{id}/artifacts/{name}
// ---------------------------------------------------------------------------

describe('GET /v1/captures/{id}/artifacts/{name}', () => {
  it('html artifact served as text/plain', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${SEED_ID}/artifacts/html`);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/plain');
  });

  it('screenshot artifact served as image/png', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${SEED_ID}/artifacts/screenshot`);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('image/png');
  });

  it('Content-Disposition: attachment on all artifacts', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${SEED_ID}/artifacts/html`);
    expect(res.headers.get('Content-Disposition')).toContain('attachment');
  });

  it('wacz-absent returns 404', async () => {
    const noWaczId = 'cap_' + 'c'.repeat(32);
    await env.KV.delete(`capture:${noWaczId}`);
    await createCapture(env.KV, noWaczId, SEED_URL, '93.184.216.34');
    await completeCapture(env.KV, noWaczId, {
      screenshot: `captures/${noWaczId}/screenshot.png`,
      html:       `captures/${noWaczId}/rendered.html`,
      headers:    `captures/${noWaczId}/headers.json`,
    }, null);

    const res = await SELF.fetch(`https://worker.test/v1/captures/${noWaczId}/artifacts/wacz`);
    expect(res.status).toBe(404);
  });

  it('pending capture returns 404 on artifact route', async () => {
    const pendingId = 'cap_' + 'd'.repeat(32);
    await env.KV.delete(`capture:${pendingId}`);
    await createCapture(env.KV, pendingId, SEED_URL, '93.184.216.34');

    const res = await SELF.fetch(`https://worker.test/v1/captures/${pendingId}/artifacts/screenshot`);
    expect(res.status).toBe(404);
  });

  it('absent optional artifact (headers) returns 404', async () => {
    const noHeadersId = 'cap_' + 'e'.repeat(32);
    await env.KV.delete(`capture:${noHeadersId}`);
    await createCapture(env.KV, noHeadersId, SEED_URL, '93.184.216.34');
    await completeCapture(env.KV, noHeadersId, {
      screenshot: `captures/${noHeadersId}/screenshot.png`,
      html:       `captures/${noHeadersId}/rendered.html`,
    }, SEED_WACZ);

    const res = await SELF.fetch(`https://worker.test/v1/captures/${noHeadersId}/artifacts/headers`);
    expect(res.status).toBe(404);
  });
});
