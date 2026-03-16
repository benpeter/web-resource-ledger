// tva
import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { getSigningKeys, computeKeyId } from '../src/signing.js';
import { archiveSigningKey } from '../src/kv.js';

const ENDPOINT = 'https://worker.test/.well-known/signing-key';
const KEYS_ENDPOINT = 'https://worker.test/.well-known/signing-keys';

describe('GET /.well-known/signing-key -- happy path', () => {
  it('returns 200 with JSON body', async () => {
    const res = await SELF.fetch(ENDPOINT);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/json');
  });

  it('response body has correct shape', async () => {
    const res = await SELF.fetch(ENDPOINT);
    const body = await res.json();
    expect(body).toHaveProperty('algorithm');
    expect(body).toHaveProperty('publicKey');
    expect(body).toHaveProperty('keyId');
    expect(body.algorithm).toBe('Ed25519');
    expect(typeof body.publicKey).toBe('string');
    expect(body.publicKey.length).toBeGreaterThan(0);
    expect(body.keyId).toMatch(/^[0-9a-f]{8}$/);
  });

  it('publicKey decodes to exactly 32 bytes', async () => {
    const res = await SELF.fetch(ENDPOINT);
    const { publicKey } = await res.json();
    const decoded = atob(publicKey);
    expect(decoded.length).toBe(32);
  });
});

describe('GET /.well-known/signing-key -- headers', () => {
  it('Content-Type is application/json', async () => {
    const res = await SELF.fetch(ENDPOINT);
    expect(res.headers.get('Content-Type')).toContain('application/json');
  });

  it('Cache-Control is public with max-age and stale-while-revalidate', async () => {
    const res = await SELF.fetch(ENDPOINT);
    const cc = res.headers.get('Cache-Control');
    expect(cc).toContain('public');
    expect(cc).toContain('max-age=3600');
    expect(cc).toContain('stale-while-revalidate=86400');
  });

  it('CORS header present -- Access-Control-Allow-Origin: *', async () => {
    const res = await SELF.fetch(ENDPOINT);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('security headers present', async () => {
    const res = await SELF.fetch(ENDPOINT);
    expect(res.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    const hsts = res.headers.get('Strict-Transport-Security');
    expect(hsts).toBeTruthy();
    expect(hsts).toContain('max-age=');
    expect(hsts).toContain('includeSubDomains');
  });
});

describe('GET /.well-known/signing-key -- method routing', () => {
  it('POST returns 404 -- method not matched by route table', async () => {
    const res = await SELF.fetch(ENDPOINT, { method: 'POST' });
    expect(res.status).toBe(404);
  });
});

describe('GET /.well-known/signing-key -- round-trip verification', () => {
  it('endpoint returns the correct public key -- sign with private, verify with endpoint key', async () => {
    // Obtain the private key via getSigningKeys using the test env binding
    const keys = await getSigningKeys(env);
    expect(keys).not.toBeNull();

    const data = new TextEncoder().encode('web-resource-ledger round-trip');

    // Sign using the private key from getSigningKeys
    const signature = await crypto.subtle.sign('Ed25519', keys.privateKey, data);

    // Fetch the public key exclusively from the endpoint response
    const res = await SELF.fetch(ENDPOINT);
    expect(res.status).toBe(200);
    const { publicKey: publicKeyBase64 } = await res.json();

    // Reconstruct the key only from what the endpoint returned
    const rawKeyBytes = Uint8Array.from(atob(publicKeyBase64), c => c.charCodeAt(0));
    const importedPublicKey = await crypto.subtle.importKey(
      'raw',
      rawKeyBytes,
      'Ed25519',
      true,
      ['verify'],
    );

    // Verify: if the endpoint returned the wrong bytes, this will be false
    const valid = await crypto.subtle.verify('Ed25519', importedPublicKey, signature, data);
    expect(valid).toBe(true);
  });

  it('keyId matches computeKeyId of the public key', async () => {
    const keys = await getSigningKeys(env);
    const expectedKeyId = await computeKeyId(keys.publicKeyBytes);

    const res = await SELF.fetch(ENDPOINT);
    const { keyId } = await res.json();
    expect(keyId).toBe(expectedKeyId);
  });
});

// ---------------------------------------------------------------------------
// GET /.well-known/signing-keys (plural) -- key archive endpoint
// ---------------------------------------------------------------------------

describe('GET /.well-known/signing-keys -- happy path', () => {
  beforeEach(async () => {
    // Clean up any archived keys from prior tests
    const list = await env.KV.list({ prefix: 'signing-key:' });
    await Promise.all(list.keys.map(k => env.KV.delete(k.name)));
  });

  it('returns 200 with JSON body', async () => {
    const res = await SELF.fetch(KEYS_ENDPOINT);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/json');
  });

  it('returns empty keys array when no keys are archived', async () => {
    const res = await SELF.fetch(KEYS_ENDPOINT);
    const body = await res.json();
    expect(body).toHaveProperty('keys');
    expect(Array.isArray(body.keys)).toBe(true);
    expect(body.keys.length).toBe(0);
  });

  it('returns archived keys after archiveSigningKey()', async () => {
    const keys = await getSigningKeys(env);
    const publicKeyBase64 = btoa(String.fromCharCode(...keys.publicKeyBytes));
    await archiveSigningKey(env.KV, keys.keyId, publicKeyBase64);

    const res = await SELF.fetch(KEYS_ENDPOINT);
    const body = await res.json();
    expect(body.keys.length).toBe(1);
    expect(body.keys[0].keyId).toBe(keys.keyId);
    expect(body.keys[0].algorithm).toBe('Ed25519');
    expect(body.keys[0].publicKey).toBe(publicKeyBase64);
  });

  it('returns multiple archived keys', async () => {
    // Archive the current key
    const keys = await getSigningKeys(env);
    const publicKeyBase64 = btoa(String.fromCharCode(...keys.publicKeyBytes));
    await archiveSigningKey(env.KV, keys.keyId, publicKeyBase64);

    // Archive the "old" key
    const oldKeys = await getSigningKeys({ SIGNING_KEY: env.TEST_ARCHIVED_KEY });
    const oldPublicKeyBase64 = btoa(String.fromCharCode(...oldKeys.publicKeyBytes));
    await archiveSigningKey(env.KV, oldKeys.keyId, oldPublicKeyBase64);

    const res = await SELF.fetch(KEYS_ENDPOINT);
    const body = await res.json();
    expect(body.keys.length).toBe(2);

    const keyIds = body.keys.map(k => k.keyId);
    expect(keyIds).toContain(keys.keyId);
    expect(keyIds).toContain(oldKeys.keyId);
  });
});

describe('GET /.well-known/signing-keys -- headers', () => {
  it('Cache-Control is public with max-age', async () => {
    const res = await SELF.fetch(KEYS_ENDPOINT);
    const cc = res.headers.get('Cache-Control');
    expect(cc).toContain('public');
    expect(cc).toContain('max-age=3600');
  });

  it('CORS header present', async () => {
    const res = await SELF.fetch(KEYS_ENDPOINT);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('security headers present', async () => {
    const res = await SELF.fetch(KEYS_ENDPOINT);
    expect(res.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });
});

describe('GET /.well-known/signing-keys -- method routing', () => {
  it('POST returns 404', async () => {
    const res = await SELF.fetch(KEYS_ENDPOINT, { method: 'POST' });
    expect(res.status).toBe(404);
  });
});
