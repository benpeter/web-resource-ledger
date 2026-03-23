// Unit tests for src/stripe-webhook.js
// Tests signature parsing, verification, and event dedup.

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  parseStripeSignature,
  verifyStripeSignature,
  isEventProcessed,
  markEventProcessed,
} from '../src/stripe-webhook.js';

// ---------------------------------------------------------------------------
// parseStripeSignature
// ---------------------------------------------------------------------------

describe('parseStripeSignature', () => {
  it('parses timestamp and single v1 signature', () => {
    const result = parseStripeSignature('t=1234567890,v1=abcdef');
    expect(result.timestamp).toBe(1234567890);
    expect(result.signatures).toEqual(['abcdef']);
  });

  it('parses multiple v1 signatures (secret rotation)', () => {
    const result = parseStripeSignature('t=1000,v1=sig1,v1=sig2,v1=sig3');
    expect(result.timestamp).toBe(1000);
    expect(result.signatures).toEqual(['sig1', 'sig2', 'sig3']);
  });

  it('handles whitespace around values', () => {
    const result = parseStripeSignature('t= 1234 , v1= abc ');
    expect(result.timestamp).toBe(1234);
    expect(result.signatures).toEqual(['abc']);
  });

  it('ignores unknown scheme keys', () => {
    const result = parseStripeSignature('t=1000,v0=old,v1=current');
    expect(result.timestamp).toBe(1000);
    expect(result.signatures).toEqual(['current']);
  });

  it('returns 0 timestamp and empty signatures for garbage input', () => {
    const result = parseStripeSignature('nonsense');
    expect(result.timestamp).toBe(0);
    expect(result.signatures).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// verifyStripeSignature
// ---------------------------------------------------------------------------

describe('verifyStripeSignature', () => {
  const secret = 'whsec_test_secret_key_for_testing';

  /**
   * Helper: compute a valid Stripe signature for testing.
   */
  async function computeSignature(rawBody, timestamp, signingSecret) {
    const keyBytes = new TextEncoder().encode(signingSecret);
    const cryptoKey = await crypto.subtle.importKey(
      'raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    const signedPayload = `${timestamp}.${rawBody}`;
    const sigBytes = await crypto.subtle.sign(
      'HMAC', cryptoKey, new TextEncoder().encode(signedPayload),
    );
    return Array.from(new Uint8Array(sigBytes), b => b.toString(16).padStart(2, '0')).join('');
  }

  it('verifies a valid signature and returns parsed event', async () => {
    const rawBody = JSON.stringify({ id: 'evt_test', type: 'checkout.session.completed' });
    const timestamp = Math.floor(Date.now() / 1000);
    const sig = await computeSignature(rawBody, timestamp, secret);
    const header = `t=${timestamp},v1=${sig}`;

    const event = await verifyStripeSignature(rawBody, header, secret);
    expect(event.id).toBe('evt_test');
    expect(event.type).toBe('checkout.session.completed');
  });

  it('accepts any matching v1 during secret rotation', async () => {
    const rawBody = JSON.stringify({ id: 'evt_rot', type: 'invoice.paid' });
    const timestamp = Math.floor(Date.now() / 1000);
    const sig = await computeSignature(rawBody, timestamp, secret);
    const header = `t=${timestamp},v1=badbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbad,v1=${sig}`;

    const event = await verifyStripeSignature(rawBody, header, secret);
    expect(event.id).toBe('evt_rot');
  });

  it('rejects missing Stripe-Signature header', async () => {
    await expect(verifyStripeSignature('{}', null, secret))
      .rejects.toThrow('Missing Stripe-Signature header');
  });

  it('rejects empty Stripe-Signature header', async () => {
    await expect(verifyStripeSignature('{}', '', secret))
      .rejects.toThrow('Missing Stripe-Signature header');
  });

  it('rejects malformed header (no t or v1)', async () => {
    await expect(verifyStripeSignature('{}', 'garbage', secret))
      .rejects.toThrow('Invalid Stripe-Signature header');
  });

  it('rejects expired timestamp', async () => {
    const rawBody = '{}';
    const oldTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 min ago
    const sig = await computeSignature(rawBody, oldTimestamp, secret);
    const header = `t=${oldTimestamp},v1=${sig}`;

    await expect(verifyStripeSignature(rawBody, header, secret))
      .rejects.toThrow('timestamp too old');
  });

  it('respects custom tolerance', async () => {
    const rawBody = '{}';
    const timestamp = Math.floor(Date.now() / 1000) - 10; // 10 sec ago
    const sig = await computeSignature(rawBody, timestamp, secret);
    const header = `t=${timestamp},v1=${sig}`;

    // 5-second tolerance should reject a 10-second-old event
    await expect(verifyStripeSignature(rawBody, header, secret, 5))
      .rejects.toThrow('timestamp too old');

    // 20-second tolerance should accept it
    const event = await verifyStripeSignature(rawBody, header, secret, 20);
    expect(event).toBeDefined();
  });

  it('rejects wrong signature', async () => {
    const rawBody = JSON.stringify({ id: 'evt_bad' });
    const timestamp = Math.floor(Date.now() / 1000);
    const header = `t=${timestamp},v1=0000000000000000000000000000000000000000000000000000000000000000`;

    await expect(verifyStripeSignature(rawBody, header, secret))
      .rejects.toThrow('signature verification failed');
  });

  it('rejects when body has been tampered with', async () => {
    const originalBody = JSON.stringify({ id: 'evt_orig', amount: 100 });
    const tamperedBody = JSON.stringify({ id: 'evt_orig', amount: 1 });
    const timestamp = Math.floor(Date.now() / 1000);
    const sig = await computeSignature(originalBody, timestamp, secret);
    const header = `t=${timestamp},v1=${sig}`;

    await expect(verifyStripeSignature(tamperedBody, header, secret))
      .rejects.toThrow('signature verification failed');
  });
});

// ---------------------------------------------------------------------------
// Event dedup (isEventProcessed / markEventProcessed)
// ---------------------------------------------------------------------------

describe('event dedup', () => {
  function createMockKV() {
    const store = new Map();
    return {
      get: vi.fn(async (key) => store.get(key) ?? null),
      put: vi.fn(async (key, value, opts) => { store.set(key, value); }),
      _store: store,
    };
  }

  it('returns false for unprocessed events', async () => {
    const kv = createMockKV();
    expect(await isEventProcessed(kv, 'evt_new')).toBe(false);
    expect(kv.get).toHaveBeenCalledWith('stripe_evt:evt_new');
  });

  it('marks event as processed and subsequent check returns true', async () => {
    const kv = createMockKV();
    await markEventProcessed(kv, 'evt_abc');
    expect(kv.put).toHaveBeenCalledWith('stripe_evt:evt_abc', '1', { expirationTtl: 604800 });
    expect(await isEventProcessed(kv, 'evt_abc')).toBe(true);
  });

  it('uses 7-day TTL for processed events', async () => {
    const kv = createMockKV();
    await markEventProcessed(kv, 'evt_ttl');
    const putCall = kv.put.mock.calls[0];
    expect(putCall[2]).toEqual({ expirationTtl: 604800 });
  });
});
