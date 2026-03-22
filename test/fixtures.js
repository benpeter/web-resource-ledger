// tva
// Shared test fixtures for WRL capture tests.
// Import from here instead of duplicating across test files.

import { hashApiKey } from '../src/auth.js';

export const TEST_ADMIN_KEY = 'test-admin-key-for-vitest';
export const TEST_TENANT_KEY = 'wrl_live_' + 'a'.repeat(43);
export const TEST_WEBHOOK_URL = 'https://hooks.example.com/webhook';
export const TEST_WEBHOOK_SECRET = 'wrlsec_' + 'b'.repeat(64);

/**
 * Seed a D1-backed API key record for use in tests.
 * Also ensures the tenant row exists.
 * Returns the keyHash so callers can reference it.
 */
export async function seedApiKey(db, rawKey, {
  tenantId = 'default',
  scopes = ['capture', 'read'],
  name = 'test-key',
  revoked = false,
  revokedAt = null,
} = {}) {
  const keyHash = await hashApiKey(rawKey);
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO tenants (id) VALUES (?)').bind(tenantId),
    db.prepare(
      `INSERT OR IGNORE INTO api_keys
         (key_hash, tenant_id, scopes, name, created_at, created_by, revoked, revoked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      keyHash,
      tenantId,
      JSON.stringify(scopes),
      name,
      new Date().toISOString(),
      'test',
      revoked ? 1 : 0,
      revokedAt,
    ),
  ]);
  return keyHash;
}

/**
 * Seed a webhook registration directly into D1 for use in tests.
 * Also ensures the tenant row exists.
 *
 * @param {D1Database} db
 * @param {string} id  webhook ID (must match whk_[a-f0-9]{32})
 * @param {object} overrides  column overrides
 */
export async function seedWebhook(db, id, {
  tenantId = 'default',
  url = TEST_WEBHOOK_URL,
  name = 'test-webhook',
  secret = TEST_WEBHOOK_SECRET,
  events = ['capture.complete', 'capture.failed'],
  active = true,
  createdAt = new Date().toISOString(),
  updatedAt = null,
} = {}) {
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO tenants (id) VALUES (?)').bind(tenantId),
    db.prepare(
      `INSERT OR IGNORE INTO webhooks
         (id, tenant_id, url, name, secret, events, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      tenantId,
      url,
      name,
      secret,
      JSON.stringify(events),
      active ? 1 : 0,
      createdAt,
      updatedAt,
    ),
  ]);
}

/**
 * Truncate all metadata tables in FK-safe order (children first, then parents).
 */
export async function cleanDb(db) {
  await db.batch([
    db.prepare('DELETE FROM webhooks'),
    db.prepare('DELETE FROM usage_counters'),
    db.prepare('DELETE FROM captures'),
    db.prepare('DELETE FROM api_keys'),
    db.prepare('DELETE FROM signing_keys'),
    db.prepare('DELETE FROM tenants'),
  ]);
}

/**
 * Seed a usage_counters row directly into D1 with sensible defaults.
 * Uses plain INSERT (not UPSERT) to catch duplicate seeds as test errors.
 * Also ensures the tenant row exists first.
 *
 * @param {D1Database} db
 * @param {object} overrides  column overrides
 */
export async function seedUsageCounter(db, {
  tenantId = 'default',
  period = '2026-03',
  captureCount = 0,
  storageBytes = 0,
  apiCallCount = 0,
} = {}) {
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO tenants (id) VALUES (?)').bind(tenantId),
    db.prepare(
      `INSERT INTO usage_counters (tenant_id, period, capture_count, storage_bytes, api_call_count)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind(tenantId, period, captureCount, storageBytes, apiCallCount),
  ]);
}

/**
 * Seed a capture row directly into D1 with sensible defaults.
 * Ensures the tenant row exists first.
 *
 * @param {D1Database} db
 * @param {string} id  capture ID (must match cap_[a-f0-9]{32})
 * @param {object} overrides  column overrides
 */
export async function seedCapture(db, id, {
  tenantId = 'default',
  url = 'https://example.com',
  ip = '1.2.3.4',
  status = 'pending',
  createdAt = new Date().toISOString(),
  completedAt = null,
  failedAt = null,
  error = null,
  retryable = null,
  renderQuality = null,
  artifacts = null,
  wacz = null,
  render = null,
  captureSettings = null,
} = {}) {
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO tenants (id) VALUES (?)').bind(tenantId),
    db.prepare(
      `INSERT OR IGNORE INTO captures
         (id, tenant_id, url, ip, status, created_at, completed_at, failed_at,
          error, retryable, render_quality, artifacts, wacz, render, capture_settings)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id, tenantId, url, ip, status, createdAt, completedAt, failedAt,
      error,
      retryable != null ? (retryable ? 1 : 0) : null,
      renderQuality,
      artifacts ? JSON.stringify(artifacts) : null,
      wacz ? JSON.stringify(wacz) : null,
      render ? JSON.stringify(render) : null,
      captureSettings ? JSON.stringify(captureSettings) : null,
    ),
  ]);
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
