// tva
// Unit tests for src/webhook-signing.js.
// signWebhookPayload is pure async crypto -- no worker bindings required.
// These tests verify determinism, sensitivity to inputs, and output format.

import { describe, it, expect } from 'vitest';
import { signWebhookPayload } from '../src/webhook-signing.js';

// Fixed inputs for deterministic tests.
// Secret is whsec_ + 64 hex chars (32 bytes); body is a minimal JSON string.
const FIXED_SECRET = 'whsec_' + 'ab'.repeat(32);
const FIXED_TIMESTAMP = 1700000000;
const FIXED_BODY = '{"id":"evt_test","type":"ping","data":{}}';

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe('signWebhookPayload -- determinism', () => {
  it('produces the same hex signature for identical inputs', async () => {
    const sig1 = await signWebhookPayload(FIXED_SECRET, FIXED_TIMESTAMP, FIXED_BODY);
    const sig2 = await signWebhookPayload(FIXED_SECRET, FIXED_TIMESTAMP, FIXED_BODY);
    expect(sig1).toBe(sig2);
  });
});

// ---------------------------------------------------------------------------
// Output format
// ---------------------------------------------------------------------------

describe('signWebhookPayload -- output format', () => {
  it('returns a lowercase hex string of 64 characters (SHA-256 digest)', async () => {
    const sig = await signWebhookPayload(FIXED_SECRET, FIXED_TIMESTAMP, FIXED_BODY);
    expect(sig).toMatch(/^[a-f0-9]{64}$/);
  });
});

// ---------------------------------------------------------------------------
// Sensitivity to inputs
// ---------------------------------------------------------------------------

describe('signWebhookPayload -- sensitivity to inputs', () => {
  it('different timestamps produce different signatures', async () => {
    const sig1 = await signWebhookPayload(FIXED_SECRET, FIXED_TIMESTAMP, FIXED_BODY);
    const sig2 = await signWebhookPayload(FIXED_SECRET, FIXED_TIMESTAMP + 1, FIXED_BODY);
    expect(sig1).not.toBe(sig2);
  });

  it('different bodies produce different signatures', async () => {
    const sig1 = await signWebhookPayload(FIXED_SECRET, FIXED_TIMESTAMP, FIXED_BODY);
    const sig2 = await signWebhookPayload(FIXED_SECRET, FIXED_TIMESTAMP, FIXED_BODY + ' ');
    expect(sig1).not.toBe(sig2);
  });

  it('different secrets produce different signatures', async () => {
    const otherSecret = 'whsec_' + 'cd'.repeat(32);
    const sig1 = await signWebhookPayload(FIXED_SECRET, FIXED_TIMESTAMP, FIXED_BODY);
    const sig2 = await signWebhookPayload(otherSecret, FIXED_TIMESTAMP, FIXED_BODY);
    expect(sig1).not.toBe(sig2);
  });
});

// ---------------------------------------------------------------------------
// whsec_ prefix handling
// ---------------------------------------------------------------------------

describe('signWebhookPayload -- whsec_ prefix stripping', () => {
  it('produces the same signature with and without whsec_ prefix when hex key is the same', async () => {
    const hexOnly = 'ab'.repeat(32); // bare 64 hex chars, no prefix
    const withPrefix = 'whsec_' + hexOnly;

    const sigWithPrefix = await signWebhookPayload(withPrefix, FIXED_TIMESTAMP, FIXED_BODY);
    const sigWithoutPrefix = await signWebhookPayload(hexOnly, FIXED_TIMESTAMP, FIXED_BODY);

    expect(sigWithPrefix).toBe(sigWithoutPrefix);
  });
});
