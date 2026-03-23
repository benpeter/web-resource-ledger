// tva
// Shared test fixtures for WRL capture tests.
// Import from here instead of duplicating across test files.

import { hashApiKey } from '../src/auth.js';

// ---------------------------------------------------------------------------
// GitHub OAuth stubs
// ---------------------------------------------------------------------------

/**
 * Returns a fetch stub that intercepts GitHub OAuth API calls.
 *
 * Stubs two endpoints:
 *   POST github.com/login/oauth/access_token  -> token exchange response
 *   GET  api.github.com/user                  -> user identity response
 *
 * Any other URL throws so tests catch unexpected calls early.
 *
 * @param {object} opts
 * @param {string} [opts.accessToken]  returned access_token (default: 'ghs_test_access_token')
 * @param {number} [opts.userId]       returned user id (default: 12345)
 * @param {string} [opts.login]        returned login (default: 'testuser')
 * @param {string} [opts.email]        returned email (default: 'testuser@example.com')
 */
export function stubGitHubFetch({
  accessToken = 'ghs_test_access_token',
  userId = 12345,
  login = 'testuser',
  email = 'testuser@example.com',
} = {}) {
  return async function stubbedFetch(url, opts) {
    const urlStr = url instanceof URL ? url.toString() : String(url);

    // Token exchange -- POST to github.com/login/oauth/access_token
    if (urlStr.includes('github.com/login/oauth/access_token')) {
      return new Response(
        JSON.stringify({ access_token: accessToken, token_type: 'bearer', scope: 'read:user,user:email' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // User identity -- GET api.github.com/user
    if (urlStr.includes('api.github.com/user')) {
      return new Response(
        JSON.stringify({ id: userId, login, email }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    throw new Error(`stubGitHubFetch: unexpected URL: ${urlStr}`);
  };
}

/**
 * Returns a fetch stub where the GitHub token exchange returns an error
 * (e.g. bad_verification_code).
 */
export function stubGitHubFetchTokenError() {
  return async function stubbedFetch(url, opts) {
    const urlStr = url instanceof URL ? url.toString() : String(url);

    if (urlStr.includes('github.com/login/oauth/access_token')) {
      return new Response(
        JSON.stringify({ error: 'bad_verification_code', error_description: 'The code passed is incorrect or expired.' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (urlStr.includes('api.github.com/user')) {
      return new Response(
        JSON.stringify({ message: 'Bad credentials' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      );
    }

    throw new Error(`stubGitHubFetchTokenError: unexpected URL: ${urlStr}`);
  };
}

/**
 * Returns a fetch stub that simulates a network-level failure on the token
 * exchange request (throws instead of returning a Response).
 */
export function stubGitHubFetchNetworkError() {
  return async function stubbedFetch(url, opts) {
    const urlStr = url instanceof URL ? url.toString() : String(url);

    if (urlStr.includes('github.com/login/oauth/access_token')) {
      throw new TypeError('Failed to fetch');
    }

    throw new Error(`stubGitHubFetchNetworkError: unexpected URL: ${urlStr}`);
  };
}

// ---------------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------------

/**
 * Convert a hex string to a Uint8Array.
 * @param {string} hex
 */
function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Convert a Uint8Array (or ArrayBuffer) to a lowercase hex string.
 * @param {ArrayBuffer|Uint8Array} buf
 */
function bytesToHex(buf) {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Seed a github_users row (and the associated tenant) into D1.
 *
 * @param {D1Database} db
 * @param {object} opts
 * @param {number} [opts.githubId]     numeric GitHub user ID (default: 99001)
 * @param {string} [opts.githubLogin]  GitHub username (default: 'testuser')
 * @param {string} [opts.tenantId]     WRL tenant ID (default: derived from githubId)
 * @param {string} [opts.tosAcceptedAt]
 * @param {string} [opts.tosVersion]
 */
export async function seedGithubUser(db, {
  githubId = 99001,
  githubLogin = 'testuser',
  tenantId = `gh-${99001}`,
  tosAcceptedAt = null,
  tosVersion = null,
} = {}) {
  // Allow callers to derive tenantId from a custom githubId
  const resolvedTenantId = tenantId === `gh-${99001}` && githubId !== 99001
    ? `gh-${githubId}`
    : tenantId;

  await db.batch([
    db.prepare('INSERT OR IGNORE INTO tenants (id) VALUES (?)').bind(resolvedTenantId),
    db.prepare(
      `INSERT OR IGNORE INTO github_users
         (github_id, github_login, tenant_id, tos_accepted_at, tos_version)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind(githubId, githubLogin, resolvedTenantId, tosAcceptedAt, tosVersion),
  ]);

  return { githubId, githubLogin, tenantId: resolvedTenantId };
}

/**
 * Create a fully valid session in D1 and return the signed cookie string.
 *
 * Signs the session using the same HMAC-SHA256 scheme that src/session.js
 * (Task 3) will implement, so cookies produced here pass verifySession().
 *
 * Cookie format: __Host-wrl_session={sessionId}.{hmac_hex}
 *
 * @param {D1Database} db
 * @param {object} env           worker env bindings (needs env.SESSION_SECRET)
 * @param {object} opts
 * @param {number} [opts.githubId]   (default: 99001)
 * @param {string} [opts.tenantId]   derived from githubId if omitted
 * @param {string} [opts.sessionId]  random 32-hex-char ID generated if omitted
 * @param {string} [opts.expiresAt]  ISO timestamp, defaults to +7 days
 *
 * @returns {{ cookie: string, tenantId: string, githubId: number, sessionId: string, idHash: string }}
 */
export async function createTestSession(db, env, {
  githubId = 99001,
  tenantId,
  sessionId,
  expiresAt,
} = {}) {
  const resolvedTenantId = tenantId ?? `gh-${githubId}`;

  // Ensure github_users and tenant rows exist
  await seedGithubUser(db, { githubId, tenantId: resolvedTenantId });

  // Generate a session ID if not provided (16 random bytes -> 32 hex chars)
  const resolvedSessionId = sessionId ?? bytesToHex(crypto.getRandomValues(new Uint8Array(16)));

  // Sign the session ID with HMAC-SHA256 using SESSION_SECRET
  const secretHex = env.SESSION_SECRET;
  const key = await crypto.subtle.importKey(
    'raw',
    hexToBytes(secretHex),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(resolvedSessionId),
  );
  const hmacHex = bytesToHex(signature);

  // Compute the id_hash (SHA-256 of the session ID) for the DB row
  const idHashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(resolvedSessionId));
  const idHash = bytesToHex(idHashBuf);

  // Default expiry: 7 days from now
  const resolvedExpiresAt = expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  // Insert the session row
  await db.prepare(
    `INSERT OR IGNORE INTO sessions (id_hash, github_id, tenant_id, expires_at)
     VALUES (?, ?, ?, ?)`,
  ).bind(idHash, githubId, resolvedTenantId, resolvedExpiresAt).run();

  const cookie = `__Host-wrl_session=${resolvedSessionId}.${hmacHex}`;

  return { cookie, tenantId: resolvedTenantId, githubId, sessionId: resolvedSessionId, idHash };
}

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
    db.prepare('DELETE FROM sessions'),
    db.prepare('DELETE FROM github_users'),
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
