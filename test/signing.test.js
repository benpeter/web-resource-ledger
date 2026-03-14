// tva
import { describe, it, expect } from 'vitest';

// Ed25519 spike: confirms which algorithm name works in the workerd runtime.
// Result: standard 'Ed25519' string works directly -- no NODE-ED25519 fallback needed.
// All six tests below pass with the standard Web Crypto API algorithm name.

const TEXT = new TextEncoder().encode('hello web-resource-ledger');

async function generatePair() {
  return crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
}

describe('Ed25519 in workerd -- key generation', () => {
  it('generates a key pair without throwing', async () => {
    const pair = await generatePair();
    expect(pair.privateKey).toBeDefined();
    expect(pair.publicKey).toBeDefined();
  });
});

describe('Ed25519 in workerd -- sign and verify', () => {
  it('signs arbitrary data without throwing', async () => {
    const { privateKey } = await generatePair();
    const sig = await crypto.subtle.sign('Ed25519', privateKey, TEXT);
    expect(sig.byteLength).toBe(64); // Ed25519 signatures are always 64 bytes
  });

  it('verifies a valid signature as true', async () => {
    const { privateKey, publicKey } = await generatePair();
    const sig = await crypto.subtle.sign('Ed25519', privateKey, TEXT);
    const ok = await crypto.subtle.verify('Ed25519', publicKey, sig, TEXT);
    expect(ok).toBe(true);
  });

  it('rejects a tampered payload as false', async () => {
    const { privateKey, publicKey } = await generatePair();
    const sig = await crypto.subtle.sign('Ed25519', privateKey, TEXT);
    const tampered = new TextEncoder().encode('hello web-resource-ledger!');
    const ok = await crypto.subtle.verify('Ed25519', publicKey, sig, tampered);
    expect(ok).toBe(false);
  });
});

describe('Ed25519 in workerd -- PKCS8 import round-trip', () => {
  it('exports private key as PKCS8, re-imports, signs, and verifies', async () => {
    const { privateKey, publicKey } = await generatePair();

    const pkcs8 = await crypto.subtle.exportKey('pkcs8', privateKey);
    const imported = await crypto.subtle.importKey(
      'pkcs8',
      pkcs8,
      'Ed25519',
      false,
      ['sign'],
    );

    const sig = await crypto.subtle.sign('Ed25519', imported, TEXT);
    const ok = await crypto.subtle.verify('Ed25519', publicKey, sig, TEXT);
    expect(ok).toBe(true);
  });
});

describe('Ed25519 in workerd -- raw public key import round-trip', () => {
  it('exports public key as raw 32 bytes, re-imports, and verifies', async () => {
    const { privateKey, publicKey } = await generatePair();

    const raw = await crypto.subtle.exportKey('raw', publicKey);
    expect(raw.byteLength).toBe(32); // Ed25519 public keys are always 32 bytes

    const imported = await crypto.subtle.importKey(
      'raw',
      raw,
      'Ed25519',
      true,
      ['verify'],
    );

    const sig = await crypto.subtle.sign('Ed25519', privateKey, TEXT);
    const ok = await crypto.subtle.verify('Ed25519', imported, sig, TEXT);
    expect(ok).toBe(true);
  });
});
