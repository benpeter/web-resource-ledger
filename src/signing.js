/*
 * signing.js -- Ed25519 signing module
 *
 * Lazily imports and caches the private CryptoKey from env.SIGNING_KEY.
 * Supports key rotation: re-imports if env.SIGNING_KEY changes between calls.
 *
 * Key versioning: each key is identified by a keyId -- the first 8 hex chars
 * of SHA-256(raw 32-byte public key). This fingerprint is embedded in WACZ
 * signedData and stored in KV capture records for historical key lookup.
 *
 * SECURITY: env.SIGNING_KEY is accessed here and nowhere else.
 *
 * Expected SPKI prefix for Ed25519 public key: 302a300506032b6570032100
 * (12-byte header, followed by 32 raw key bytes)
 *
 * Tests: test/signing.test.js
 */ // tva

import { createPrivateKey, createPublicKey } from 'node:crypto';

// ---------------------------------------------------------------------------
// Module-scoped cache
// ---------------------------------------------------------------------------

let _cachedKeyString = null;
let _cachedPrivateKey = null;
let _cachedPublicKeyBytes = null;
let _cachedKeyId = null;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Lazily imports and caches Ed25519 keys from env.SIGNING_KEY.
 * Detects key rotation by comparing the base64 string on each call.
 *
 * @param {{ SIGNING_KEY?: string }} env
 * @returns {Promise<{ privateKey: CryptoKey, publicKeyBytes: Uint8Array, keyId: string } | null>}
 */
export async function getSigningKeys(env) {
  if (!env?.SIGNING_KEY) return null;

  try {
    // Key rotation: re-import if env.SIGNING_KEY differs from cached string
    if (env.SIGNING_KEY === _cachedKeyString && _cachedPrivateKey && _cachedPublicKeyBytes) {
      return { privateKey: _cachedPrivateKey, publicKeyBytes: _cachedPublicKeyBytes, keyId: _cachedKeyId };
    }

    const pkcs8Bytes = Uint8Array.from(atob(env.SIGNING_KEY), c => c.charCodeAt(0));

    const privateKey = await crypto.subtle.importKey(
      'pkcs8',
      pkcs8Bytes,
      'Ed25519',
      true,
      ['sign'],
    );

    // Derive public key bytes via node:crypto (available via nodejs_compat)
    const privKeyObj = createPrivateKey({ key: Buffer.from(pkcs8Bytes), format: 'der', type: 'pkcs8' });
    const pubKeyObj = createPublicKey(privKeyObj);
    const spkiDer = pubKeyObj.export({ type: 'spki', format: 'der' });

    // Ed25519 SPKI DER: 12-byte header (302a300506032b6570032100) + 32-byte raw key
    const publicKeyBytes = new Uint8Array(spkiDer.buffer, spkiDer.byteOffset + 12, 32);

    // Assert derived key is exactly 32 bytes
    if (publicKeyBytes.length !== 32) {
      throw new Error(`Expected 32-byte Ed25519 public key, got ${publicKeyBytes.length}`);
    }

    // Compute keyId: first 8 hex chars of SHA-256(raw public key bytes)
    const keyId = await computeKeyId(publicKeyBytes);

    // Update cache (including key string for rotation detection)
    _cachedKeyString = env.SIGNING_KEY;
    _cachedPrivateKey = privateKey;
    _cachedPublicKeyBytes = publicKeyBytes;
    _cachedKeyId = keyId;

    return { privateKey, publicKeyBytes, keyId };
  } catch (err) {
    console.warn('Signing key validation failed:', err?.message);
    return null;
  }
}

/**
 * Computes a key fingerprint: first 8 hex chars of SHA-256(raw public key bytes).
 * Deterministic -- same key always produces the same keyId.
 *
 * @param {Uint8Array} publicKeyBytes Raw 32-byte Ed25519 public key
 * @returns {Promise<string>} 8-char hex fingerprint
 */
export async function computeKeyId(publicKeyBytes) {
  const hash = await crypto.subtle.digest('SHA-256', publicKeyBytes);
  const hex = [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
  return hex.slice(0, 8);
}

/**
 * Signs a Uint8Array with the private CryptoKey, returns base64 signature string.
 *
 * @param {CryptoKey} privateKey
 * @param {Uint8Array} data
 * @returns {Promise<string>} base64-encoded signature
 */
export async function signBytes(privateKey, data) {
  const sig = await crypto.subtle.sign('Ed25519', privateKey, data);
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

/**
 * Verifies an Ed25519 signature. For testing purposes.
 *
 * @param {Uint8Array} publicKeyBytes Raw 32-byte public key
 * @param {Uint8Array} data
 * @param {string} signatureBase64
 * @returns {Promise<boolean>}
 */
export async function verifySignature(publicKeyBytes, data, signatureBase64) {
  const pubKey = await crypto.subtle.importKey(
    'raw',
    publicKeyBytes,
    'Ed25519',
    true,
    ['verify'],
  );
  const signature = Uint8Array.from(atob(signatureBase64), c => c.charCodeAt(0));
  return crypto.subtle.verify('Ed25519', pubKey, signature, data);
}
