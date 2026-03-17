// Vendored from src/signing.js -- verifySignature only
// Origin: https://github.com/benpeter/web-resource-ledger/blob/main/src/signing.js

/**
 * Verifies an Ed25519 signature.
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
  const signature = Buffer.from(signatureBase64, 'base64');
  return crypto.subtle.verify('Ed25519', pubKey, signature, data);
}
