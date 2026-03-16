// tva
import { env, fetchMock } from 'cloudflare:test';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { performCapture } from '../src/capture.js';
import { createCapture, getCapture } from '../src/kv.js';
import { buildWacz } from '../src/wacz.js';
import { buildWarc } from '../src/warc.js';
import { toSurt } from '../src/cdxj.js';
import { canonicalize } from '../src/canonical-json.js';
import { unzipSync } from 'fflate';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEST_ID = 'cap_wacztest1234567890abcdef1234';
const TEST_URL = 'https://example.com';
const TEST_IP = '93.184.216.34';
const TEST_ORIGIN = 'https://example.com';

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const TEST_HTML = '<html><body>wacz test</body></html>';

const stubRenderer = async () => ({
  screenshot: PNG_BYTES,
  html: TEST_HTML,
});

// ---------------------------------------------------------------------------
// KV / R2 cleanup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await env.KV.delete(`capture:${TEST_ID}`);
  // Clean up per-capture individual artifacts
  const prefix = `captures/${TEST_ID}`;
  await Promise.all([
    env.BUCKET.delete(`${prefix}/screenshot.png`),
    env.BUCKET.delete(`${prefix}/rendered.html`),
    env.BUCKET.delete(`${prefix}/headers.json`),
  ]);
  // Clean up any .wacz objects from prior tests (content-addressed, unpredictable keys)
  const listed = await env.BUCKET.list({ prefix: 'captures/' });
  await Promise.all(
    listed.objects
      .filter(obj => obj.key.endsWith('.wacz'))
      .map(obj => env.BUCKET.delete(obj.key)),
  );
});

// ---------------------------------------------------------------------------
// fetchMock lifecycle
// ---------------------------------------------------------------------------

beforeEach(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});

afterEach(() => {
  fetchMock.deactivate();
});

function mockHeaderFetch(opts = {}) {
  fetchMock
    .get(TEST_ORIGIN)
    .intercept({ path: '/', method: 'GET' })
    .reply(opts.status ?? 200, opts.body ?? 'ok', {
      headers: opts.headers ?? { 'content-type': 'text/html' },
    });
}

// ---------------------------------------------------------------------------
// Integration tests: WACZ written to R2 and KV
// ---------------------------------------------------------------------------

describe('WACZ integration -- R2 storage', () => {
  it('writes at least one .wacz object to R2 after capture', async () => {
    mockHeaderFetch();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', stubRenderer);

    const listed = await env.BUCKET.list({ prefix: 'captures/' });
    const waczObjects = listed.objects.filter(obj => obj.key.endsWith('.wacz'));
    expect(waczObjects.length).toBeGreaterThanOrEqual(1);
  });

  it('WACZ contains expected files', async () => {
    mockHeaderFetch();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', stubRenderer);

    const listed = await env.BUCKET.list({ prefix: 'captures/' });
    const waczKey = listed.objects.find(obj => obj.key.endsWith('.wacz'))?.key;
    expect(waczKey).toBeDefined();

    const obj = await env.BUCKET.get(waczKey);
    const waczBytes = new Uint8Array(await obj.arrayBuffer());
    const files = unzipSync(waczBytes);

    expect(files['datapackage.json']).toBeDefined();
    expect(files['datapackage-digest.json']).toBeDefined();
    expect(files['archive/data.warc']).toBeDefined();
    expect(files['indexes/index.cdxj']).toBeDefined();
    expect(files['pages/pages.jsonl']).toBeDefined();
  });

  it('datapackage.json has correct structure', async () => {
    mockHeaderFetch();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', stubRenderer);

    const listed = await env.BUCKET.list({ prefix: 'captures/' });
    const waczKey = listed.objects.find(obj => obj.key.endsWith('.wacz'))?.key;
    const obj = await env.BUCKET.get(waczKey);
    const waczBytes = new Uint8Array(await obj.arrayBuffer());
    const files = unzipSync(waczBytes);

    const dp = JSON.parse(new TextDecoder().decode(files['datapackage.json']));
    expect(dp.profile).toBe('data-package');
    expect(dp.wacz_version).toBe('1.1.1');
    expect(Array.isArray(dp.resources)).toBe(true);
    expect(dp.resources.length).toBe(3);

    const names = dp.resources.map(r => r.name);
    expect(names).toContain('data.warc');
    expect(names).toContain('index.cdxj');
    expect(names).toContain('pages.jsonl');

    for (const resource of dp.resources) {
      expect(typeof resource.name).toBe('string');
      expect(typeof resource.path).toBe('string');
      expect(typeof resource.hash).toBe('string');
      expect(typeof resource.bytes).toBe('number');
    }
  });

  it('resource hashes in datapackage.json match actual file bytes', async () => {
    mockHeaderFetch();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', stubRenderer);

    const listed = await env.BUCKET.list({ prefix: 'captures/' });
    const waczKey = listed.objects.find(obj => obj.key.endsWith('.wacz'))?.key;
    const obj = await env.BUCKET.get(waczKey);
    const waczBytes = new Uint8Array(await obj.arrayBuffer());
    const files = unzipSync(waczBytes);

    const dp = JSON.parse(new TextDecoder().decode(files['datapackage.json']));

    // path-to-zip-key mapping
    const pathToKey = {
      'archive/data.warc': 'archive/data.warc',
      'indexes/index.cdxj': 'indexes/index.cdxj',
      'pages/pages.jsonl': 'pages/pages.jsonl',
    };

    for (const resource of dp.resources) {
      const fileBytes = files[pathToKey[resource.path]];
      expect(fileBytes).toBeDefined();
      const hashBuf = await crypto.subtle.digest('SHA-256', fileBytes);
      const computed = 'sha256:' + [...new Uint8Array(hashBuf)]
        .map(b => b.toString(16).padStart(2, '0')).join('');
      expect(computed).toBe(resource.hash);
    }
  });

  it('datapackage-digest.json has a valid Ed25519 signature', async () => {
    mockHeaderFetch();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', stubRenderer);

    const listed = await env.BUCKET.list({ prefix: 'captures/' });
    const waczKey = listed.objects.find(obj => obj.key.endsWith('.wacz'))?.key;
    const obj = await env.BUCKET.get(waczKey);
    const waczBytes = new Uint8Array(await obj.arrayBuffer());
    const files = unzipSync(waczBytes);

    const digest = JSON.parse(new TextDecoder().decode(files['datapackage-digest.json']));
    const { hash, signature, publicKey } = digest.signedData;

    // Import the embedded public key (raw 32-byte Ed25519 key)
    const publicKeyBytes = Uint8Array.from(atob(publicKey), c => c.charCodeAt(0));
    const pubKey = await crypto.subtle.importKey('raw', publicKeyBytes, 'Ed25519', true, ['verify']);

    // Signed payload: UTF-8 bytes of the bundleHash string "sha256:{hex}"
    const signatureBytes = Uint8Array.from(atob(signature), c => c.charCodeAt(0));
    const dataBytes = new TextEncoder().encode(hash);

    const valid = await crypto.subtle.verify('Ed25519', pubKey, signatureBytes, dataBytes);
    expect(valid).toBe(true);
  });

  it('KV record includes wacz.key, wacz.bundleHash, wacz.size after capture', async () => {
    mockHeaderFetch();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', stubRenderer);

    const record = await getCapture(env.KV, TEST_ID);
    expect(record.wacz).toBeDefined();
    expect(typeof record.wacz.key).toBe('string');
    expect(record.wacz.key).toMatch(/^captures\/.+\.wacz$/);
    expect(typeof record.wacz.bundleHash).toBe('string');
    expect(record.wacz.bundleHash).toMatch(/^sha256:/);
    expect(typeof record.wacz.size).toBe('number');
    expect(record.wacz.size).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Graceful degradation
// ---------------------------------------------------------------------------

describe('WACZ -- graceful degradation', () => {
  it('buildWacz returns null when env has no SIGNING_KEY', async () => {
    const result = await buildWacz(
      TEST_URL,
      new Date().toISOString(),
      { screenshot: PNG_BYTES, html: TEST_HTML, headers: null },
      {}, // env with no SIGNING_KEY
    );
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Signing round-trip (acceptance criteria)
// ---------------------------------------------------------------------------

describe('Signing round-trip', () => {
  it('sign -> verify returns true; tampered byte returns false', async () => {
    const { privateKey, publicKey } = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);

    const manifest = { url: TEST_URL, ts: '20260101000000', hash: 'sha256:abc123' };
    const data = new TextEncoder().encode(canonicalize(manifest));

    const sig = await crypto.subtle.sign('Ed25519', privateKey, data);

    const valid = await crypto.subtle.verify('Ed25519', publicKey, sig, data);
    expect(valid).toBe(true);

    // Tamper: flip one byte
    const tampered = new Uint8Array(data);
    tampered[0] ^= 0x01;
    const invalid = await crypto.subtle.verify('Ed25519', publicKey, sig, tampered);
    expect(invalid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Canonical JSON stability (acceptance criteria)
// ---------------------------------------------------------------------------

describe('Canonical JSON stability', () => {
  it('produces byte-identical output regardless of key insertion order', () => {
    const a = { z: 3, wacz_version: '1.1.1', profile: 'data-package', resources: [] };
    const b = { profile: 'data-package', resources: [], wacz_version: '1.1.1', z: 3 };
    const ca = new TextEncoder().encode(canonicalize(a));
    const cb = new TextEncoder().encode(canonicalize(b));
    expect(ca).toEqual(cb);
  });
});

// ---------------------------------------------------------------------------
// WARC structure unit assertions
// ---------------------------------------------------------------------------

describe('WARC structure', () => {
  it('produces records with WARC/1.1 header and CRLF line endings', async () => {
    const { warcBytes } = await buildWarc(
      TEST_URL,
      new Date().toISOString(),
      { screenshot: PNG_BYTES, html: TEST_HTML, headers: null },
    );
    const text = new TextDecoder().decode(warcBytes);
    expect(text.startsWith('WARC/1.1\r\n')).toBe(true);
    // All header lines use CRLF
    expect(text).toContain('\r\n');
  });
});

// ---------------------------------------------------------------------------
// CDXJ SURT transform unit assertions
// ---------------------------------------------------------------------------

describe('CDXJ SURT transform', () => {
  it('toSurt transforms https://example.com/path to com,example)/path', () => {
    expect(toSurt('https://example.com/path')).toBe('com,example)/path');
  });

  it('toSurt passes through urn: URIs unchanged', () => {
    expect(toSurt('urn:wrl:screenshot:https://example.com')).toBe('urn:wrl:screenshot:https://example.com');
  });
});
