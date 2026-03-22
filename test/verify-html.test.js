// tva
import { env, SELF, fetchMock } from 'cloudflare:test';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { performCapture } from '../src/capture.js';
import { createCapture } from '../src/db.js';
import { PNG_BYTES, TEST_HTML, TEST_URL, TEST_IP, stubRenderer } from './fixtures.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEST_ID     = 'cap_' + 'a'.repeat(32);
const TEST_ORIGIN = 'https://example.com';

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(async () => {
  // Clean D1 capture
  await env.DB.prepare('DELETE FROM captures WHERE id = ?').bind(TEST_ID).run();

  // Clean R2 -- all .wacz objects and anything prefixed with TEST_ID
  const listed = await env.BUCKET.list({ prefix: 'captures/' });
  await Promise.all(
    listed.objects
      .filter(obj => obj.key.endsWith('.wacz') || obj.key.includes(TEST_ID))
      .map(obj => env.BUCKET.delete(obj.key)),
  );

  // Activate fetchMock for header fetch inside performCapture
  fetchMock.activate();
  fetchMock.disableNetConnect();
  fetchMock
    .get(TEST_ORIGIN)
    .intercept({ path: '/', method: 'GET' })
    .reply(200, 'ok', { headers: { 'content-type': 'text/html' } });

  // Create a real capture with a signed WACZ
  await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
  await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, stubRenderer);
});

afterEach(() => {
  fetchMock.deactivate();
});

// ---------------------------------------------------------------------------
// Content negotiation -- Accept header routing
// ---------------------------------------------------------------------------

describe('GET /v1/verify/{id} -- content negotiation', () => {
  it('Accept: text/html returns HTML Content-Type', async () => {
    const res = await SELF.fetch(
      new Request(`https://worker.test/v1/verify/${TEST_ID}`, { headers: { Accept: 'text/html' } }),
    );
    expect(res.headers.get('Content-Type')).toContain('text/html');
  });

  it('Accept: application/json returns JSON Content-Type', async () => {
    const res = await SELF.fetch(
      new Request(`https://worker.test/v1/verify/${TEST_ID}`, { headers: { Accept: 'application/json' } }),
    );
    expect(res.headers.get('Content-Type')).toContain('application/json');
  });

  it('no Accept header returns JSON (backward compatibility)', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/verify/${TEST_ID}`);
    expect(res.headers.get('Content-Type')).toContain('application/json');
  });

  it('Accept: */* returns JSON (curl default)', async () => {
    const res = await SELF.fetch(
      new Request(`https://worker.test/v1/verify/${TEST_ID}`, { headers: { Accept: '*/*' } }),
    );
    expect(res.headers.get('Content-Type')).toContain('application/json');
  });

  it('Accept: text/html, application/json returns HTML (browser default)', async () => {
    const res = await SELF.fetch(
      new Request(`https://worker.test/v1/verify/${TEST_ID}`, { headers: { Accept: 'text/html, application/json' } }),
    );
    expect(res.headers.get('Content-Type')).toContain('text/html');
  });
});

// ---------------------------------------------------------------------------
// HTML response correctness
// ---------------------------------------------------------------------------

describe('GET /v1/verify/{id} -- HTML response headers', () => {
  it('HTML response status is 200', async () => {
    const res = await SELF.fetch(
      new Request(`https://worker.test/v1/verify/${TEST_ID}`, { headers: { Accept: 'text/html' } }),
    );
    expect(res.status).toBe(200);
  });

  it('HTML response has Content-Security-Policy with default-src \'none\'', async () => {
    const res = await SELF.fetch(
      new Request(`https://worker.test/v1/verify/${TEST_ID}`, { headers: { Accept: 'text/html' } }),
    );
    const csp = res.headers.get('Content-Security-Policy');
    expect(csp).toContain("default-src 'none'");
  });

  it('HTML response has Vary: Accept', async () => {
    const res = await SELF.fetch(
      new Request(`https://worker.test/v1/verify/${TEST_ID}`, { headers: { Accept: 'text/html' } }),
    );
    expect(res.headers.get('Vary')).toBe('Accept');
  });
});

// ---------------------------------------------------------------------------
// Vary header on JSON responses
// ---------------------------------------------------------------------------

describe('GET /v1/verify/{id} -- Vary header on JSON', () => {
  it('JSON response (default Accept) has Vary: Accept', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/verify/${TEST_ID}`);
    expect(res.headers.get('Vary')).toBe('Accept');
  });
});

// ---------------------------------------------------------------------------
// Cache-Control parity
// ---------------------------------------------------------------------------

describe('GET /v1/verify/{id} -- Cache-Control parity', () => {
  it('HTML and JSON responses for same capture have same Cache-Control value', async () => {
    const htmlRes = await SELF.fetch(
      new Request(`https://worker.test/v1/verify/${TEST_ID}`, { headers: { Accept: 'text/html' } }),
    );
    const jsonRes = await SELF.fetch(`https://worker.test/v1/verify/${TEST_ID}`);

    const htmlCc = htmlRes.headers.get('Cache-Control');
    const jsonCc = jsonRes.headers.get('Cache-Control');

    expect(htmlCc).toBe(jsonCc);
  });
});

// ---------------------------------------------------------------------------
// JSON API regression guard
// ---------------------------------------------------------------------------

describe('GET /v1/verify/{id} -- JSON API regression guard', () => {
  it('JSON response shape is unchanged (has verified, capture, signing, checks)', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/verify/${TEST_ID}`);
    const body = await res.json();

    expect(body).toHaveProperty('verified');
    expect(body).toHaveProperty('capture');
    expect(body).toHaveProperty('signing');
    expect(body).toHaveProperty('checks');
  });

  it('capture.url is absent from JSON verify response', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/verify/${TEST_ID}`);
    const body = await res.json();
    expect(body.capture?.url).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// HTML template content verification
// ---------------------------------------------------------------------------

describe('GET /v1/verify/{id} -- HTML template content', () => {
  it('HTML body contains Accept: application/json in fetch context (prevents content negotiation loop)', async () => {
    const res = await SELF.fetch(
      new Request(`https://worker.test/v1/verify/${TEST_ID}`, { headers: { Accept: 'text/html' } }),
    );
    const text = await res.text();
    expect(text).toContain("'Accept': 'application/json'");
  });
});

// ---------------------------------------------------------------------------
// Error paths stay JSON
// ---------------------------------------------------------------------------

describe('GET /v1/verify/{id} -- error paths', () => {
  it('404 error path returns application/problem+json even with Accept: text/html', async () => {
    const missingId = `cap_${'0'.repeat(32)}`;
    const res = await SELF.fetch(
      new Request(`https://worker.test/v1/verify/${missingId}`, { headers: { Accept: 'text/html' } }),
    );
    expect(res.status).toBe(404);
    expect(res.headers.get('Content-Type')).toContain('application/problem+json');
  });

  it('unverified capture HTML response Cache-Control is not public long-cache', async () => {
    // Overwrite WACZ with garbage so verification fails -- verified: false -> no-store
    const { getCapture } = await import('../src/db.js');
    const record = await getCapture(env.DB, TEST_ID);
    await env.BUCKET.put(record.wacz.key, new Uint8Array(16).fill(0xab));

    const res = await SELF.fetch(
      new Request(`https://worker.test/v1/verify/${TEST_ID}`, { headers: { Accept: 'text/html' } }),
    );
    expect(res.status).toBe(200);
    const cc = res.headers.get('Cache-Control');
    expect(cc).not.toContain('public');
  });
});
