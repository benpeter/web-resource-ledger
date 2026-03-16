// tva
import { env, SELF, fetchMock } from 'cloudflare:test';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { performCapture } from '../src/capture.js';
import { createCapture, getCapture, completeCapture } from '../src/kv.js';
import { unzipSync, zipSync } from 'fflate';
import { PNG_BYTES, TEST_HTML, TEST_URL, TEST_IP, stubRenderer } from './fixtures.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEST_ID   = 'cap_' + 'f'.repeat(32);
const TEST_ORIGIN = 'https://example.com';

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(async () => {
  // Clean KV
  await env.KV.delete(`capture:${TEST_ID}`);

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
  await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
  await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, stubRenderer);
});

afterEach(() => {
  fetchMock.deactivate();
});

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe('GET /v1/verify/{id} -- happy path', () => {
  it('returns 200 with verified: true for valid capture', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/verify/${TEST_ID}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.verified).toBe(true);
  });

  it('response has correct shape', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/verify/${TEST_ID}`);
    const body = await res.json();

    // top-level fields
    expect(body).toHaveProperty('verified');
    expect(body).toHaveProperty('capture');
    expect(body).toHaveProperty('signing');
    expect(body).toHaveProperty('checks');

    // capture shape
    expect(body.capture).toHaveProperty('id');
    expect(body.capture).toHaveProperty('createdAt');
    expect(body.capture).toHaveProperty('completedAt');
    // url must NOT appear in verify response
    expect(body.capture.url).toBeUndefined();

    // signing is not named 'wacz'
    expect(body.wacz).toBeUndefined();
    expect(body.signing).not.toBeNull();

    // checks is an array; v0.2.0 produces 4 checks (including timestamp)
    expect(Array.isArray(body.checks)).toBe(true);
    expect(body.checks.length).toBeGreaterThanOrEqual(3);
  });

  it('all three core checks pass (v0.2.0 timestamp is skip when no TSA configured)', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/verify/${TEST_ID}`);
    const body = await res.json();
    // Core checks must pass; timestamp is 'skip' when TSA_URL is absent in test env
    const byName = Object.fromEntries(body.checks.map(c => [c.name, c]));
    expect(byName.artifactHashes.status).toBe('pass');
    expect(byName.bundleHash.status).toBe('pass');
    expect(byName.signature.status).toBe('pass');
    // timestamp check present in v0.2.0 -- 'skip' is acceptable (no TSA configured)
    if (byName.timestamp) {
      expect(['pass', 'skip']).toContain(byName.timestamp.status);
    }
    const names = body.checks.map(c => c.name);
    expect(names).toContain('artifactHashes');
    expect(names).toContain('bundleHash');
    expect(names).toContain('signature');
  });

  it('capture.id matches request', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/verify/${TEST_ID}`);
    const body = await res.json();
    expect(body.capture.id).toBe(TEST_ID);
  });

  it('returns HTML when Accept: text/html is sent', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/verify/${TEST_ID}`, {
      headers: { Accept: 'text/html' },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/html');
    expect(res.headers.get('Vary')).toBe('Accept');
  });
});

// ---------------------------------------------------------------------------
// Tamper detection
// ---------------------------------------------------------------------------

describe('GET /v1/verify/{id} -- tamper detection', () => {
  it('detects tampered WACZ content -- artifactHashes fails, verified: false', async () => {
    // Fetch the real WACZ from R2 and tamper with archive/data.warc
    const record = await getCapture(env.KV, TEST_ID);
    expect(record?.wacz?.key).toBeTruthy();

    const obj = await env.BUCKET.get(record.wacz.key);
    const waczBytes = new Uint8Array(await obj.arrayBuffer());

    const files = unzipSync(waczBytes);
    const original = files['archive/data.warc'];
    const corrupted = new Uint8Array(original.length + 1);
    corrupted.set(original);
    corrupted[original.length] = 0xff; // append one byte -- hash changes

    const repackaged = zipSync({
      'datapackage.json':        [files['datapackage.json'],        { level: 0 }],
      'datapackage-digest.json': [files['datapackage-digest.json'], { level: 0 }],
      'archive/data.warc':       [corrupted,                        { level: 0 }],
      'indexes/index.cdxj':      [files['indexes/index.cdxj'],      { level: 0 }],
      'pages/pages.jsonl':       [files['pages/pages.jsonl'],       { level: 0 }],
    });

    // Overwrite the WACZ in R2 with the tampered version
    await env.BUCKET.put(record.wacz.key, repackaged);

    const res = await SELF.fetch(`https://worker.test/v1/verify/${TEST_ID}`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.verified).toBe(false);

    const byName = Object.fromEntries(body.checks.map(c => [c.name, c]));
    expect(byName.artifactHashes.status).toBe('fail');
  });

  it('returns 200 (not 4xx) for failed verification', async () => {
    // Overwrite WACZ with garbage bytes -- all checks will fail
    const record = await getCapture(env.KV, TEST_ID);
    const garbage = new Uint8Array(16).fill(0xab);
    await env.BUCKET.put(record.wacz.key, garbage);

    const res = await SELF.fetch(`https://worker.test/v1/verify/${TEST_ID}`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.verified).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Error cases
// ---------------------------------------------------------------------------

describe('GET /v1/verify/{id} -- partial capture (no WACZ)', () => {
  it('verify endpoint returns 404 for captures without WACZ', async () => {
    const partialId = 'cap_' + 'a'.repeat(32);
    await env.KV.delete(`capture:${partialId}`);
    await createCapture(env.KV, partialId, TEST_URL, TEST_IP, 'default');
    await completeCapture(
      env.KV,
      partialId,
      {
        screenshot: `captures/${partialId}/screenshot.png`,
        html:       `captures/${partialId}/rendered.html`,
      },
      null, // no wacz -- partial capture
      'partial',
      { waitUntilReached: 'domcontentloaded', timedOut: true, durationMs: 25000 },
    );

    const res = await SELF.fetch(`https://worker.test/v1/verify/${partialId}`);
    expect(res.status).toBe(404);
  });
});

describe('GET /v1/verify/{id} -- error cases', () => {
  it('404 for unknown capture ID', async () => {
    const unknownId = 'cap_' + '0'.repeat(32);
    const res = await SELF.fetch(`https://worker.test/v1/verify/${unknownId}`);
    expect(res.status).toBe(404);
  });

  it('404 for pending capture (no performCapture called)', async () => {
    const pendingId = 'cap_' + '1'.repeat(32);
    await env.KV.delete(`capture:${pendingId}`);
    await createCapture(env.KV, pendingId, TEST_URL, TEST_IP, 'default');

    const res = await SELF.fetch(`https://worker.test/v1/verify/${pendingId}`);
    expect(res.status).toBe(404);
  });

  it('404 for capture without WACZ (completeCapture with null wacz)', async () => {
    const noWaczId = 'cap_' + '2'.repeat(32);
    await env.KV.delete(`capture:${noWaczId}`);
    await createCapture(env.KV, noWaczId, TEST_URL, TEST_IP, 'default');
    await completeCapture(
      env.KV,
      noWaczId,
      {
        screenshot: `captures/${noWaczId}/screenshot.png`,
        html:       `captures/${noWaczId}/rendered.html`,
      },
      null, // no wacz
    );

    const res = await SELF.fetch(`https://worker.test/v1/verify/${noWaczId}`);
    expect(res.status).toBe(404);
  });

  it('404 for malformed capture ID', async () => {
    const res = await SELF.fetch('https://worker.test/v1/verify/badid');
    expect(res.status).toBe(404);
  });

  it('404 for failed capture', async () => {
    const failedId = 'cap_' + '3'.repeat(32);
    await env.KV.delete(`capture:${failedId}`);
    await createCapture(env.KV, failedId, TEST_URL, TEST_IP, 'default');

    // Read it back, mutate status to 'failed', write back
    const record = await env.KV.get(`capture:${failedId}`, 'json');
    record.status = 'failed';
    record.failedAt = new Date().toISOString();
    record.error = 'Synthetic failure for test';
    record.retryable = false;
    await env.KV.put(`capture:${failedId}`, JSON.stringify(record));

    const res = await SELF.fetch(`https://worker.test/v1/verify/${failedId}`);
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Headers
// ---------------------------------------------------------------------------

describe('GET /v1/verify/{id} -- headers', () => {
  it('Cache-Control: public with max-age on verified: true', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/verify/${TEST_ID}`);
    const body = await res.json();
    expect(body.verified).toBe(true);
    const cc = res.headers.get('Cache-Control');
    expect(cc).toContain('public');
    expect(cc).toMatch(/max-age=\d+/);
  });

  it('Cache-Control: no-store on verified: false', async () => {
    // Put garbage in R2 so verification fails
    const record = await getCapture(env.KV, TEST_ID);
    await env.BUCKET.put(record.wacz.key, new Uint8Array(16).fill(0xcc));

    const res = await SELF.fetch(`https://worker.test/v1/verify/${TEST_ID}`);
    const body = await res.json();
    expect(body.verified).toBe(false);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('Cache-Control: no-store on 404', async () => {
    const unknownId = 'cap_' + '4'.repeat(32);
    const res = await SELF.fetch(`https://worker.test/v1/verify/${unknownId}`);
    expect(res.status).toBe(404);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('CORS header present -- Access-Control-Allow-Origin: *', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/verify/${TEST_ID}`);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('security headers present -- Referrer-Policy, X-Content-Type-Options', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/verify/${TEST_ID}`);
    expect(res.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('returns X-RateLimit-Limit: 60', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/verify/${TEST_ID}`);
    expect(res.headers.get('X-RateLimit-Limit')).toBe('60');
  });
});

// ---------------------------------------------------------------------------
// Security: no sensitive field leaks
// ---------------------------------------------------------------------------

describe('GET /v1/verify/{id} -- security', () => {
  it('ip field absent from response', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/verify/${TEST_ID}`);
    const body = await res.json();
    expect(body.ip).toBeUndefined();
    expect(body.capture?.ip).toBeUndefined();
  });

  it('R2 keys absent from response', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/verify/${TEST_ID}`);
    const text = await res.text();
    // R2 keys look like "captures/..."
    expect(text).not.toMatch(/captures\/.+\.wacz/);
    expect(text).not.toMatch(/"key"\s*:/);
  });

  it('capture.url absent from verify response', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/verify/${TEST_ID}`);
    const body = await res.json();
    expect(body.capture?.url).toBeUndefined();
    expect(body.url).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// GET /v1/captures/{id} -- verifyUrl field coherence
// ---------------------------------------------------------------------------

describe('GET /v1/captures/{id} -- verifyUrl', () => {
  it('retrieval response includes verifyUrl when WACZ present', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${TEST_ID}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.verifyUrl).toBeTruthy();
    expect(body.verifyUrl).toMatch(/\/v1\/verify\//);
    expect(body.verifyUrl).toContain(TEST_ID);
  });

  it('retrieval response omits verifyUrl when no WACZ', async () => {
    const noWaczId = 'cap_' + '5'.repeat(32);
    await env.KV.delete(`capture:${noWaczId}`);
    await createCapture(env.KV, noWaczId, TEST_URL, TEST_IP, 'default');
    await completeCapture(
      env.KV,
      noWaczId,
      {
        screenshot: `captures/${noWaczId}/screenshot.png`,
        html:       `captures/${noWaczId}/rendered.html`,
      },
      null, // no wacz
    );

    const res = await SELF.fetch(`https://worker.test/v1/captures/${noWaczId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.verifyUrl).toBeUndefined();
  });
});
