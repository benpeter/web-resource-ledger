/**
 * hmac.js -- Independent webhook signature verification for e2e tests
 *
 * Intentionally NOT imported from src/webhook-signing.js. The e2e tests
 * must verify the signature as an external consumer would, using only
 * the public contract (header format + algorithm description). Sharing
 * implementation with the signing code would mask bugs where the server
 * signs and the test verifies with identical broken logic.
 *
 * Signature header format: t={unix_timestamp},v1={lowercase_hex_signature}
 * Signed payload:          "{timestamp}.{raw_body}"
 * HMAC key:                raw bytes decoded from the hex portion of the
 *                          webhook secret (strip "wrlsec_" prefix first)
 */

import { createHmac } from 'node:crypto';

/**
 * Verify a WRL webhook signature.
 *
 * @param {string} payload         Raw request body string (do NOT re-serialize)
 * @param {string} signatureHeader Value of the X-WRL-Signature-256 header
 * @param {string} secret          Webhook secret in "wrlsec_<64 hex chars>" format
 * @returns {{ valid: boolean, expectedSignature: string, receivedSignature: string }}
 */
export function verifyWebhookSignature(payload, signatureHeader, secret) {
  // Parse "t={ts},v1={hex}" format
  const parts = Object.fromEntries(
    signatureHeader.split(',').map(part => {
      const eqIdx = part.indexOf('=');
      if (eqIdx === -1) return [part, ''];
      return [part.slice(0, eqIdx), part.slice(eqIdx + 1)];
    })
  );

  const timestamp = parts['t'];
  const receivedSignature = parts['v1'] ?? '';

  if (!timestamp) {
    return {
      valid: false,
      expectedSignature: '',
      receivedSignature,
    };
  }

  // Derive the HMAC key: strip "wrlsec_" prefix, decode hex to raw bytes
  const hexKey = secret.startsWith('wrlsec_') ? secret.slice(7) : secret;
  const keyBytes = Buffer.from(hexKey, 'hex');

  // Compute HMAC-SHA256 over "{timestamp}.{body}"
  const signedPayload = `${timestamp}.${payload}`;
  const expectedSignature = createHmac('sha256', keyBytes)
    .update(signedPayload, 'utf8')
    .digest('hex');

  return {
    valid: expectedSignature === receivedSignature,
    expectedSignature,
    receivedSignature,
  };
}
