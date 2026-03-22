/*
 * webhook-signing.js -- HMAC-SHA256 signing for WRL outbound webhooks
 *
 * Implements the Stripe-model timestamp-prefixed signing scheme:
 *   signed_payload = "${unix_timestamp}.${raw_json_body}"
 *   signature = HMAC-SHA256(key_bytes, signed_payload)
 *
 * The webhook secret stored in D1 is prefixed with "wrlsec_" followed by
 * 64 lowercase hex characters (32 raw bytes). The prefix is stripped and
 * the hex is decoded to raw bytes before use as the HMAC key.
 *
 * Signature header value format: t=${timestamp},v1=${hex_signature}
 * This format follows Stripe convention and allows future algorithm agility
 * (add v2=... for a new algorithm without breaking v1 verifiers).
 *
 * Tests: test/webhook-signing.test.js
 */ // tva

export const SIGNATURE_HEADER = 'X-WRL-Signature-256';
export const TIMESTAMP_HEADER = 'X-WRL-Timestamp';

/**
 * Sign a webhook payload with HMAC-SHA256.
 *
 * The secret must be in "wrlsec_<64 hex chars>" format. The hex portion is
 * decoded to raw bytes before use as the HMAC key -- do NOT pass the hex
 * string directly as a UTF-8 key (that would be different bytes).
 *
 * @param {string} secret     The stored webhook secret ("wrlsec_" + 64 hex chars)
 * @param {number} timestamp  Unix timestamp in seconds
 * @param {string} body       The exact JSON string to sign -- do NOT re-serialize
 * @returns {Promise<string>} Lowercase hex signature
 */
export async function signWebhookPayload(secret, timestamp, body) {
  // Strip the prefix and decode hex to raw bytes for the HMAC key.
  // Using raw bytes (not the hex string) ensures the key space is 2^256.
  const hexKey = secret.startsWith('wrlsec_') ? secret.slice(7) : secret;
  const keyBytes = hexToBytes(hexKey);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  // Stripe-model: sign "${timestamp}.${body}" as a single string
  const signedPayload = `${timestamp}.${body}`;
  const enc = new TextEncoder();
  const sigBytes = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(signedPayload));

  return bytesToHex(new Uint8Array(sigBytes));
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Decode a lowercase hex string to a Uint8Array.
 * @param {string} hex
 * @returns {Uint8Array}
 */
function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Encode a Uint8Array to a lowercase hex string.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function bytesToHex(bytes) {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
