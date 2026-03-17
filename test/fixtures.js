// tva
// Shared test fixtures for WRL capture tests.
// Import from here instead of duplicating across test files.

import { hashApiKey } from '../src/auth.js';

export const TEST_ADMIN_KEY = 'test-admin-key-for-vitest';
export const TEST_TENANT_KEY = 'wrl_live_' + 'a'.repeat(43);

/**
 * Seed a KV-backed API key record for use in tests.
 * Returns the keyHash so callers can reference it.
 */
export async function seedApiKey(kv, rawKey, {
  tenantId = 'default',
  scopes = ['capture', 'read'],
  name = 'test-key',
  revoked = false,
  revokedAt = null,
} = {}) {
  const keyHash = await hashApiKey(rawKey);
  await kv.put(`apikey:${keyHash}`, JSON.stringify({
    tenantId, scopes, name,
    createdAt: new Date().toISOString(),
    createdBy: 'test',
    revoked, revokedAt,
  }));
  return keyHash;
}

// ---------------------------------------------------------------------------
// Shared byte and HTML constants
// ---------------------------------------------------------------------------

export const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Alternate PNG bytes -- used as the "after consent" screenshot to distinguish it from before
export const PNG_BYTES_ALT = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0b]);

export const TEST_HTML = '<html><body>test</body></html>';

export const TEST_URL = 'https://example.com';

export const TEST_IP = '93.184.216.34';

// ---------------------------------------------------------------------------
// Renderer stubs
// ---------------------------------------------------------------------------

/**
 * Legacy renderer (pre-consent feature) -- returns minimal shape.
 * Used for backward-compat tests that verify render metadata is absent.
 */
export const stubRenderer = async () => ({
  screenshot: PNG_BYTES,
  html: TEST_HTML,
});

/**
 * Full-capture renderer with no CMP detected.
 * Represents the common case: page loaded cleanly, no consent banner found.
 */
export const consentNotDetectedRenderer = async () => ({
  screenshot: PNG_BYTES,
  screenshotBefore: null,
  html: TEST_HTML,
  partial: false,
  render: { waitUntilReached: 'load', timedOut: false, durationMs: 2800 },
  consent: { status: 'none', cmp: null, durationMs: 2500 },
});

/**
 * Dual-screenshot renderer with successful consent dismissal.
 * screenshotBefore = banner visible, screenshot = after dismissal.
 */
export const dualScreenshotRenderer = async () => ({
  screenshot: PNG_BYTES_ALT,
  screenshotBefore: PNG_BYTES,
  html: TEST_HTML,
  partial: false,
  render: { waitUntilReached: 'load', timedOut: false, durationMs: 3500 },
  consent: { status: 'dismissed', cmp: 'cookiebot', durationMs: 850 },
});

/**
 * Renderer where consent detection timed out (banner detected but not dismissed).
 */
export const consentFailedRenderer = async () => ({
  screenshot: PNG_BYTES,
  screenshotBefore: null,
  html: TEST_HTML,
  partial: false,
  render: { waitUntilReached: 'load', timedOut: false, durationMs: 4200 },
  consent: { status: 'timeout', cmp: null, durationMs: 8000 },
});

/**
 * Partial capture renderer (page timed out but DOMContentLoaded was reached).
 * consent is null for partial captures -- consent is not attempted.
 */
export const partialRenderer = async () => ({
  screenshot: PNG_BYTES,
  screenshotBefore: null,
  html: TEST_HTML,
  partial: true,
  render: { waitUntilReached: 'domcontentloaded', timedOut: true, durationMs: 20100 },
  consent: null,
});
