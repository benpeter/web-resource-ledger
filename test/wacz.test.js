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
import { PNG_BYTES, TEST_HTML, TEST_URL, TEST_IP, stubRenderer } from './fixtures.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEST_ID = 'cap_wacztest1234567890abcdef1234';
const TEST_ORIGIN = 'https://example.com';

// ---------------------------------------------------------------------------
// KV / R2 cleanup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await env.KV.delete(`capture:${TEST_ID}`);
  // Clean up per-capture individual artifacts
  const prefix = `captures/${TEST_ID}`;
  await Promise.all([
    env.BUCKET.delete(`${prefix}/screenshot.png`),
    env.BUCKET.delete(`${prefix}/screenshot-before.png`),
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
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, stubRenderer);

    const listed = await env.BUCKET.list({ prefix: 'captures/' });
    const waczObjects = listed.objects.filter(obj => obj.key.endsWith('.wacz'));
    expect(waczObjects.length).toBeGreaterThanOrEqual(1);
  });

  it('WACZ contains expected files', async () => {
    mockHeaderFetch();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, stubRenderer);

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
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, stubRenderer);

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
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, stubRenderer);

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

  it('datapackage-digest.json includes keyId in self-signature (v0.2.0)', async () => {
    mockHeaderFetch();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, stubRenderer);

    const listed = await env.BUCKET.list({ prefix: 'captures/' });
    const waczKey = listed.objects.find(obj => obj.key.endsWith('.wacz'))?.key;
    const obj = await env.BUCKET.get(waczKey);
    const waczBytes = new Uint8Array(await obj.arrayBuffer());
    const files = unzipSync(waczBytes);

    const digest = JSON.parse(new TextDecoder().decode(files['datapackage-digest.json']));
    // v0.2.0: keyId lives in the self-signature entry
    expect(digest.signedData.version).toBe('0.2.0');
    const selfSig = digest.signedData.signatures.find(s => s.type === 'self');
    expect(selfSig).toBeDefined();
    expect(selfSig.keyId).toBeDefined();
    expect(typeof selfSig.keyId).toBe('string');
    expect(selfSig.keyId).toMatch(/^[0-9a-f]{8}$/);
  });

  it('KV record includes wacz.keyId after capture', async () => {
    mockHeaderFetch();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, stubRenderer);

    const record = await getCapture(env.KV, TEST_ID);
    expect(record.wacz.keyId).toBeDefined();
    expect(typeof record.wacz.keyId).toBe('string');
    expect(record.wacz.keyId).toMatch(/^[0-9a-f]{8}$/);
  });

  it('datapackage-digest.json has a valid Ed25519 signature (v0.2.0)', async () => {
    mockHeaderFetch();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, stubRenderer);

    const listed = await env.BUCKET.list({ prefix: 'captures/' });
    const waczKey = listed.objects.find(obj => obj.key.endsWith('.wacz'))?.key;
    const obj = await env.BUCKET.get(waczKey);
    const waczBytes = new Uint8Array(await obj.arrayBuffer());
    const files = unzipSync(waczBytes);

    const digest = JSON.parse(new TextDecoder().decode(files['datapackage-digest.json']));
    // v0.2.0: hash is at signedData.hash; signature and publicKey are in the self entry
    const { hash } = digest.signedData;
    const selfSig = digest.signedData.signatures.find(s => s.type === 'self');
    expect(selfSig).toBeDefined();
    const { signature, publicKey } = selfSig;

    // Import the embedded public key (raw 32-byte Ed25519 key)
    const publicKeyBytes = Uint8Array.from(atob(publicKey), c => c.charCodeAt(0));
    const pubKey = await crypto.subtle.importKey('raw', publicKeyBytes, 'Ed25519', true, ['verify']);

    // Signed payload: UTF-8 bytes of the bundleHash string "sha256:{hex}"
    const signatureBytes = Uint8Array.from(atob(signature), c => c.charCodeAt(0));
    const dataBytes = new TextEncoder().encode(hash);

    const valid = await crypto.subtle.verify('Ed25519', pubKey, signatureBytes, dataBytes);
    expect(valid).toBe(true);
  });

  it('signing key is archived in KV after capture', async () => {
    mockHeaderFetch();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, stubRenderer);

    const record = await getCapture(env.KV, TEST_ID);
    const keyId = record.wacz.keyId;
    expect(keyId).toBeDefined();

    // Verify the key is archived
    const archived = await env.KV.get(`signing-key:${keyId}`, 'json');
    expect(archived).not.toBeNull();
    expect(archived.algorithm).toBe('Ed25519');
    expect(typeof archived.publicKey).toBe('string');
    expect(typeof archived.archivedAt).toBe('string');
  });

  it('KV record includes wacz.key, wacz.bundleHash, wacz.size after capture', async () => {
    mockHeaderFetch();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, stubRenderer);

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
      { screenshotBefore: PNG_BYTES, screenshotAfter: null, html: TEST_HTML, headers: null, captureSettings: null },
      {}, // env with no SIGNING_KEY
    );
    expect(result).toBeNull();
  });

  it('timestampStatus is absent when env has no TSA_URL', async () => {
    const result = await buildWacz(
      TEST_URL,
      new Date().toISOString(),
      { screenshotBefore: PNG_BYTES, screenshotAfter: null, html: TEST_HTML, headers: null, captureSettings: null },
      { SIGNING_KEY: env.SIGNING_KEY },
    );
    expect(result).not.toBeNull();
    expect(result.timestampStatus).toBe('absent');
  });

  it('timestampStatus is error when TSA returns HTTP 500', async () => {
    fetchMock
      .get('https://tsa-fail.test')
      .intercept({ method: 'POST', path: '/' })
      .reply(500);

    const result = await buildWacz(
      TEST_URL,
      new Date().toISOString(),
      { screenshotBefore: PNG_BYTES, screenshotAfter: null, html: TEST_HTML, headers: null, captureSettings: null },
      { SIGNING_KEY: env.SIGNING_KEY, TSA_URL: 'https://tsa-fail.test/' },
    );
    expect(result).not.toBeNull();
    expect(result.timestampStatus).toBe('error');
  });

  it('timestampStatus is error when TSA is unreachable', async () => {
    const result = await buildWacz(
      TEST_URL,
      new Date().toISOString(),
      { screenshotBefore: PNG_BYTES, screenshotAfter: null, html: TEST_HTML, headers: null, captureSettings: null },
      { SIGNING_KEY: env.SIGNING_KEY, TSA_URL: 'https://tsa-unreachable.test/' },
    );
    expect(result).not.toBeNull();
    expect(result.timestampStatus).toBe('error');
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
      { screenshotBefore: PNG_BYTES, screenshotAfter: null, html: TEST_HTML, headers: null, captureSettings: null },
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
