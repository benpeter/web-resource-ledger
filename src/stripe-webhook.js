/*
 * stripe-webhook.js -- Stripe webhook signature verification and event dedup
 *
 * Stripe signs webhooks using HMAC-SHA256 with a whsec_* secret.
 * The signed payload is "${timestamp}.${rawBody}".
 * The signature header format is: t=<timestamp>,v1=<hex>,v1=<hex>,...
 * Multiple v1 values appear during secret rotation.
 *
 * Key handling note: the full whsec_* string (prefix included) is used as
 * the raw UTF-8 HMAC key. Do NOT strip the prefix or decode the value.
 * This differs from WRL's outbound webhook-signing.js which strips wrlsec_
 * and hex-decodes the remainder.
 *
 * Tests: test/stripe-webhook.test.js
 */

/**
 * Parse a Stripe-Signature header into timestamp and signatures.
 *
 * Header format: t=1234567890,v1=abcdef...,v1=123456...
 *
 * @param {string} header
 * @returns {{ timestamp: number, signatures: string[] }}
 */
export function parseStripeSignature(header) {
  const parts = header.split(',');
  let timestamp = 0;
  const signatures = [];

  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k === 't') {
      timestamp = parseInt(v, 10);
    } else if (k === 'v1') {
      signatures.push(v);
    }
  }

  return { timestamp, signatures };
}

/**
 * Timing-safe comparison of two hex strings.
 *
 * @param {string} a
 * @param {string} b
 * @returns {Promise<boolean>}
 */
async function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);
  if (aBytes.byteLength !== bBytes.byteLength) return false;
  return crypto.subtle.timingSafeEqual(aBytes, bBytes);
}

/**
 * Verify a Stripe webhook signature and return the parsed event.
 *
 * The raw body MUST be passed as a string, before any JSON parsing.
 * The signing secret is the full whsec_* string from the Stripe dashboard.
 *
 * Throws on:
 *   - Missing or malformed signature header
 *   - Expired timestamp (outside toleranceSec window)
 *   - No v1 signature matches
 *
 * @param {string} rawBody         Raw request body as text
 * @param {string} signatureHeader Value of the Stripe-Signature header
 * @param {string} secret          Stripe webhook signing secret (whsec_*)
 * @param {number} [toleranceSec]  Max age of the timestamp in seconds (default 300)
 * @returns {Promise<object>}      Parsed event object
 */
export async function verifyStripeSignature(rawBody, signatureHeader, secret, toleranceSec = 300) {
  if (!signatureHeader) {
    throw new Error('Missing Stripe-Signature header');
  }

  const { timestamp, signatures } = parseStripeSignature(signatureHeader);

  if (!timestamp || signatures.length === 0) {
    throw new Error('Invalid Stripe-Signature header: missing t or v1');
  }

  const age = Math.abs(Date.now() / 1000 - timestamp);
  if (age > toleranceSec) {
    throw new Error(`Stripe webhook timestamp too old: ${Math.round(age)}s (tolerance ${toleranceSec}s)`);
  }

  // Import the full whsec_* string as raw UTF-8 bytes -- do NOT strip or decode
  const keyBytes = new TextEncoder().encode(secret);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signedPayload = `${timestamp}.${rawBody}`;
  const sigBytes = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(signedPayload));
  const computed = Array.from(new Uint8Array(sigBytes), b => b.toString(16).padStart(2, '0')).join('');

  // Check all v1 values -- at least one must match (secret rotation support)
  for (const sig of signatures) {
    if (await timingSafeEqual(computed, sig)) {
      return JSON.parse(rawBody);
    }
  }

  throw new Error('Stripe webhook signature verification failed');
}

/**
 * Check whether a Stripe event has already been processed.
 * Prevents duplicate processing on at-least-once delivery.
 *
 * @param {KVNamespace} kv
 * @param {string} eventId  Stripe event ID (e.g. "evt_xxx")
 * @returns {Promise<boolean>}
 */
export async function isEventProcessed(kv, eventId) {
  const val = await kv.get(`stripe_evt:${eventId}`);
  return val !== null;
}

/**
 * Mark a Stripe event as processed. TTL is 7 days (604800 seconds).
 *
 * @param {KVNamespace} kv
 * @param {string} eventId  Stripe event ID (e.g. "evt_xxx")
 * @returns {Promise<void>}
 */
export async function markEventProcessed(kv, eventId) {
  await kv.put(`stripe_evt:${eventId}`, '1', { expirationTtl: 604800 });
}
