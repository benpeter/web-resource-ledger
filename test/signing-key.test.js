// tva
import { env, SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { getSigningKeys } from '../src/signing.js';

const ENDPOINT = 'https://worker.test/.well-known/signing-key';

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
    expect(body.algorithm).toBe('Ed25519');
    expect(typeof body.publicKey).toBe('string');
    expect(body.publicKey.length).toBeGreaterThan(0);
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
});
