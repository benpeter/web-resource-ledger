import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { createCapture, completeCapture } from '../src/db.js';
import { seedSchedule, TEST_SCHEDULE_ID } from './fixtures.js';

// ---------------------------------------------------------------------------
// Partial capture seed IDs (outside main beforeEach to avoid conflicts)
// ---------------------------------------------------------------------------
const PARTIAL_ID = 'cap_' + 'f'.repeat(32);  // must be [a-f0-9]{32} to match route
const PARTIAL_RENDER = {
  waitUntilReached: 'domcontentloaded',
  timedOut: true,
  durationMs: 25000,
};
const PARTIAL_ARTIFACTS = {
  screenshot: `captures/${PARTIAL_ID}/screenshot.png`,
  html:       `captures/${PARTIAL_ID}/rendered.html`,
};

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
  await env.DB.prepare('DELETE FROM captures WHERE id = ?').bind(SEED_ID).run();
  await createCapture(env.DB, SEED_ID, SEED_URL, '93.184.216.34', 'default');
  await completeCapture(env.DB, SEED_ID, SEED_ARTIFACTS, SEED_WACZ);

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
// GET /v1/captures/{id} -- partial capture response shape
// ---------------------------------------------------------------------------

describe('GET /v1/captures/{id} -- partial capture', () => {
  beforeEach(async () => {
    await env.DB.prepare('DELETE FROM captures WHERE id = ?').bind(PARTIAL_ID).run();
    await createCapture(env.DB, PARTIAL_ID, 'https://example.com', '93.184.216.34', 'default');
    await completeCapture(env.DB, PARTIAL_ID, PARTIAL_ARTIFACTS, null, 'partial', PARTIAL_RENDER);
    await env.BUCKET.put(PARTIAL_ARTIFACTS.screenshot, new Uint8Array([137, 80, 78, 71]));
    await env.BUCKET.put(PARTIAL_ARTIFACTS.html, '<html>partial test</html>');
  });

  it('returns renderQuality: partial', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${PARTIAL_ID}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.renderQuality).toBe('partial');
  });

  it('returns render metadata', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${PARTIAL_ID}`);
    const body = await res.json();
    expect(body.render).toMatchObject({
      waitUntilReached: 'domcontentloaded',
      timedOut: true,
      durationMs: 25000,
    });
  });

  it('omits wacz and verifyUrl for partial captures', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${PARTIAL_ID}`);
    const body = await res.json();
    expect(body.wacz).toBeUndefined();
    expect(body.verifyUrl).toBeUndefined();
  });

  it('defaults renderQuality to full for old records without renderQuality field', async () => {
    const legacyId = 'cap_' + '0'.repeat(32);
    await env.DB.prepare('DELETE FROM captures WHERE id = ?').bind(legacyId).run();
    await createCapture(env.DB, legacyId, 'https://example.com', '93.184.216.34', 'default');
    // Write record without renderQuality (legacy shape)
    await completeCapture(env.DB, legacyId, {
      screenshot: `captures/${legacyId}/screenshot.png`,
      html:       `captures/${legacyId}/rendered.html`,
    });
    await env.BUCKET.put(`captures/${legacyId}/screenshot.png`, new Uint8Array([137, 80, 78, 71]));
    await env.BUCKET.put(`captures/${legacyId}/rendered.html`, '<html>legacy</html>');

    const res = await SELF.fetch(`https://worker.test/v1/captures/${legacyId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.renderQuality).toBe('full');
  });

  it('omits render for old records without render field', async () => {
    const legacyId = 'cap_' + '1'.repeat(32);
    await env.DB.prepare('DELETE FROM captures WHERE id = ?').bind(legacyId).run();
    await createCapture(env.DB, legacyId, 'https://example.com', '93.184.216.34', 'default');
    await completeCapture(env.DB, legacyId, {
      screenshot: `captures/${legacyId}/screenshot.png`,
      html:       `captures/${legacyId}/rendered.html`,
    });
    await env.BUCKET.put(`captures/${legacyId}/screenshot.png`, new Uint8Array([137, 80, 78, 71]));
    await env.BUCKET.put(`captures/${legacyId}/rendered.html`, '<html>legacy</html>');

    const res = await SELF.fetch(`https://worker.test/v1/captures/${legacyId}`);
    const body = await res.json();
    expect(body.render).toBeUndefined();
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
    await env.DB.prepare('DELETE FROM captures WHERE id = ?').bind(noWaczId).run();
    await createCapture(env.DB, noWaczId, SEED_URL, '93.184.216.34', 'default');
    await completeCapture(env.DB, noWaczId, {
      screenshot: `captures/${noWaczId}/screenshot.png`,
      html:       `captures/${noWaczId}/rendered.html`,
      headers:    `captures/${noWaczId}/headers.json`,
    }, null);

    const res = await SELF.fetch(`https://worker.test/v1/captures/${noWaczId}/artifacts/wacz`);
    expect(res.status).toBe(404);
  });

  it('pending capture returns 404 on artifact route', async () => {
    const pendingId = 'cap_' + 'd'.repeat(32);
    await env.DB.prepare('DELETE FROM captures WHERE id = ?').bind(pendingId).run();
    await createCapture(env.DB, pendingId, SEED_URL, '93.184.216.34', 'default');

    const res = await SELF.fetch(`https://worker.test/v1/captures/${pendingId}/artifacts/screenshot`);
    expect(res.status).toBe(404);
  });

  it('absent optional artifact (headers) returns 404', async () => {
    const noHeadersId = 'cap_' + 'e'.repeat(32);
    await env.DB.prepare('DELETE FROM captures WHERE id = ?').bind(noHeadersId).run();
    await createCapture(env.DB, noHeadersId, SEED_URL, '93.184.216.34', 'default');
    await completeCapture(env.DB, noHeadersId, {
      screenshot: `captures/${noHeadersId}/screenshot.png`,
      html:       `captures/${noHeadersId}/rendered.html`,
    }, SEED_WACZ);

    const res = await SELF.fetch(`https://worker.test/v1/captures/${noHeadersId}/artifacts/headers`);
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/captures/{id} -- capture linked to a schedule
// ---------------------------------------------------------------------------

describe('GET /v1/captures/{id} -- schedule linkage', () => {
  const SCHED_CAP_ID = 'cap_' + '2'.repeat(32);
  const SCHED_ARTIFACTS = {
    screenshot: `captures/${SCHED_CAP_ID}/screenshot.png`,
    html: `captures/${SCHED_CAP_ID}/rendered.html`,
  };

  beforeEach(async () => {
    await env.DB.prepare('DELETE FROM captures WHERE id = ?').bind(SCHED_CAP_ID).run();
    // Ensure the schedule FK target exists
    await seedSchedule(env.DB, TEST_SCHEDULE_ID, { tenantId: 'default' });
    // Create a capture linked to the schedule
    await createCapture(env.DB, SCHED_CAP_ID, 'https://example.com/sched', '1.2.3.4', 'default', TEST_SCHEDULE_ID);
    await completeCapture(env.DB, SCHED_CAP_ID, SCHED_ARTIFACTS);
    await env.BUCKET.put(SCHED_ARTIFACTS.screenshot, new Uint8Array([137, 80, 78, 71]));
    await env.BUCKET.put(SCHED_ARTIFACTS.html, '<html>scheduled</html>');
  });

  it('returns 200 for a capture with a schedule_id', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${SCHED_CAP_ID}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(SCHED_CAP_ID);
    expect(body.status).toBe('complete');
  });

  it('ip field is absent from response for scheduled capture', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${SCHED_CAP_ID}`);
    const body = await res.json();
    expect(body.ip).toBeUndefined();
  });
});
