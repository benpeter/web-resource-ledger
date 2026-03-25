// tva
// Integration tests for notification preferences API and unsubscribe endpoint.
// Uses SELF.fetch() -- requests go through the real worker.
// D1 is real (miniflare-backed). Session auth via createTestSession().

import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanDb, createTestSession } from './fixtures.js';
import { generateUnsubscribeToken, verifyUnsubscribeToken } from '../src/unsubscribe.js';
import { NOTIFICATION_TYPES } from '../src/db.js';

const NOTIF_URL = 'https://worker.test/v1/account/notifications';
const UNSUB_URL = 'https://worker.test/v1/notifications/unsubscribe';

// Distinct IP range to avoid rate-limit cross-contamination
let ipCounter = 400;
function nextIp() {
  return `10.0.4.${ipCounter++}`;
}

// ---------------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------------

/**
 * Create a session with ToS accepted (required for /v1/account/* routes).
 */
async function createTosSession(overrides = {}) {
  const session = await createTestSession(env.DB, env, overrides);
  await env.DB.prepare(
    "UPDATE github_users SET tos_accepted_at = '2026-01-01T00:00:00.000Z', tos_version = '1.0' WHERE github_id = ?",
  ).bind(session.githubId).run();
  return session;
}

function makeGet(cookie, ip) {
  return SELF.fetch(NOTIF_URL, {
    headers: { Cookie: cookie, 'CF-Connecting-IP': ip },
  });
}

function makePut(cookie, ip, body) {
  return SELF.fetch(NOTIF_URL, {
    method: 'PUT',
    headers: {
      Cookie: cookie,
      'CF-Connecting-IP': ip,
      'Content-Type': 'application/json',
      'X-WRL-CSRF': '1',
    },
    body: JSON.stringify(body),
  });
}

beforeEach(async () => {
  await cleanDb(env.DB);
});

// ---------------------------------------------------------------------------
// GET /v1/account/notifications
// ---------------------------------------------------------------------------

describe('GET /v1/account/notifications -- auth', () => {
  const ip = nextIp();

  it('returns 401 without a session cookie', async () => {
    const res = await SELF.fetch(NOTIF_URL, { headers: { 'CF-Connecting-IP': ip } });
    expect(res.status).toBe(401);
  });

  it('returns 200 with a valid session', async () => {
    const { cookie } = await createTosSession();
    const res = await makeGet(cookie, ip);
    expect(res.status).toBe(200);
  });
});

describe('GET /v1/account/notifications -- defaults', () => {
  const ip = nextIp();

  it('returns synthesised defaults when no preferences row exists', async () => {
    const { cookie } = await createTosSession();
    const res = await makeGet(cookie, ip);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.email).toBeNull();
    expect(body.emailVerified).toBe(false);
    expect(body.emailSource).toBe('github');
    expect(body.notifications.capture_failure).toBe(true);
    expect(body.notifications.approaching_limit).toBe(true);
    expect(body.notifications.limit_reached).toBe(true);
    expect(body.notifications.invoice_generated).toBe(true);
    expect(body.notifications.payment_failure).toBe(true);
    expect(body.notifications.weekly_digest).toBe(true);
    expect(body.updatedAt).toBeNull();
  });

  it('returns Cache-Control: private, no-store', async () => {
    const { cookie } = await createTosSession();
    const res = await makeGet(cookie, ip);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  });
});

// ---------------------------------------------------------------------------
// PUT /v1/account/notifications -- creates row on first update
// ---------------------------------------------------------------------------

describe('PUT /v1/account/notifications -- first write', () => {
  it('creates preferences row on first PUT (email goes to pendingEmail)', async () => {
    const ip = nextIp();
    const { cookie } = await createTosSession();
    const res = await makePut(cookie, ip, { email: 'user@example.com' });
    expect(res.status).toBe(200);
    const body = await res.json();
    // Pending-email pattern: email stays null until verified
    expect(body.email).toBeNull();
    expect(body.pendingEmail).toBe('user@example.com');
    expect(body.verificationEmailSent).toBe(true);
    expect(body.updatedAt).toBeTruthy();
  });

  it('GET after PUT returns pendingEmail', async () => {
    const ip = nextIp();
    const { cookie } = await createTosSession();
    await makePut(cookie, ip, { email: 'user@example.com' });
    const res = await makeGet(cookie, nextIp());
    const body = await res.json();
    expect(body.email).toBeNull();
    expect(body.pendingEmail).toBe('user@example.com');
  });
});

// ---------------------------------------------------------------------------
// PUT /v1/account/notifications -- partial update semantics
// ---------------------------------------------------------------------------

describe('PUT /v1/account/notifications -- partial updates', () => {
  it('email-only update leaves notifications unchanged', async () => {
    const ip = nextIp();
    const { cookie } = await createTosSession();
    // First, set a notification to false
    await makePut(cookie, ip, { notifications: { weekly_digest: false } });
    // Then update only email -- notifications should still have weekly_digest: false
    await makePut(cookie, ip, { email: 'new@example.com' });
    const res = await makeGet(cookie, ip);
    const body = await res.json();
    // Pending-email: email stays null, new address in pendingEmail
    expect(body.pendingEmail).toBe('new@example.com');
    expect(body.notifications.weekly_digest).toBe(false);
    // Other notifications still default true
    expect(body.notifications.capture_failure).toBe(true);
  });

  it('notifications-only update leaves email unchanged', async () => {
    const ip = nextIp();
    const { cookie } = await createTosSession();
    await makePut(cookie, ip, { email: 'stay@example.com' });
    await makePut(cookie, ip, { notifications: { capture_failure: false } });
    const res = await makeGet(cookie, ip);
    const body = await res.json();
    // Email went to pendingEmail on first PUT, notifications update doesn't move it
    expect(body.pendingEmail).toBe('stay@example.com');
    expect(body.notifications.capture_failure).toBe(false);
  });

  it('can update both email and notifications in one request', async () => {
    const ip = nextIp();
    const { cookie } = await createTosSession();
    const res = await makePut(cookie, ip, {
      email: 'both@example.com',
      notifications: { weekly_digest: false, payment_failure: false },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    // Email goes to pendingEmail, notifications update immediately
    expect(body.pendingEmail).toBe('both@example.com');
    expect(body.notifications.weekly_digest).toBe(false);
    expect(body.notifications.payment_failure).toBe(false);
    expect(body.notifications.capture_failure).toBe(true);
  });

  it('setting email to null clears it', async () => {
    const ip = nextIp();
    const { cookie } = await createTosSession();
    await makePut(cookie, ip, { email: 'clear@example.com' });
    await makePut(cookie, ip, { email: null });
    const res = await makeGet(cookie, ip);
    const body = await res.json();
    expect(body.email).toBeNull();
  });

  it('changing email stores in pendingEmail without touching emailVerified', async () => {
    const ip = nextIp();
    const { cookie, tenantId } = await createTosSession();
    // Force emailVerified = 1 directly in DB (simulates a previously verified email)
    await env.DB.prepare(
      "INSERT INTO notification_preferences (tenant_id, email, email_verified) VALUES (?, 'old@example.com', 1)",
    ).bind(tenantId).run();
    const res = await makePut(cookie, ip, { email: 'changed@example.com' });
    expect(res.status).toBe(200);
    const body = await res.json();
    // Pending-email: old email stays verified, new address goes to pendingEmail
    expect(body.email).toBe('old@example.com');
    expect(body.emailVerified).toBe(true);
    expect(body.pendingEmail).toBe('changed@example.com');
    expect(body.verificationEmailSent).toBe(true);
  });

  it('notifications merge: only specified keys are changed', async () => {
    const ip = nextIp();
    const { cookie } = await createTosSession();
    await makePut(cookie, ip, { notifications: { capture_failure: false, weekly_digest: false } });
    // Sending only one key should not affect the other
    await makePut(cookie, ip, { notifications: { capture_failure: true } });
    const res = await makeGet(cookie, ip);
    const body = await res.json();
    expect(body.notifications.capture_failure).toBe(true);
    expect(body.notifications.weekly_digest).toBe(false); // unchanged
  });
});

// ---------------------------------------------------------------------------
// PUT /v1/account/notifications -- validation
// ---------------------------------------------------------------------------

describe('PUT /v1/account/notifications -- email validation', () => {
  const ip = nextIp();

  it('rejects email containing CR character', async () => {
    const { cookie } = await createTosSession();
    const res = await makePut(cookie, ip, { email: 'bad\remail@example.com' });
    expect(res.status).toBe(400);
  });

  it('rejects email containing LF character', async () => {
    const { cookie } = await createTosSession();
    const res = await makePut(cookie, ip, { email: 'bad\nemail@example.com' });
    expect(res.status).toBe(400);
  });

  it('rejects email over 254 chars', async () => {
    const { cookie } = await createTosSession();
    const long = 'a'.repeat(245) + '@example.com'; // > 254
    const res = await makePut(cookie, ip, { email: long });
    expect(res.status).toBe(400);
  });

  it('rejects email without @', async () => {
    const { cookie } = await createTosSession();
    const res = await makePut(cookie, ip, { email: 'notanemail' });
    expect(res.status).toBe(400);
  });

  it('accepts a valid email', async () => {
    const { cookie } = await createTosSession();
    const res = await makePut(cookie, ip, { email: 'valid+tag@subdomain.example.com' });
    expect(res.status).toBe(200);
  });
});

describe('PUT /v1/account/notifications -- notification type validation', () => {
  const ip = nextIp();

  it('rejects unknown notification type', async () => {
    const { cookie } = await createTosSession();
    const res = await makePut(cookie, ip, { notifications: { unknown_type: false } });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toContain('unknown_type');
  });

  it('rejects non-boolean notification value', async () => {
    const { cookie } = await createTosSession();
    const res = await makePut(cookie, ip, { notifications: { capture_failure: 'yes' } });
    expect(res.status).toBe(400);
  });
});

describe('PUT /v1/account/notifications -- top-level field validation', () => {
  const ip = nextIp();

  it('rejects unknown top-level field', async () => {
    const { cookie } = await createTosSession();
    const res = await makePut(cookie, ip, { email: 'a@b.com', unknown: 'value' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toContain('unknown');
  });

  it('rejects empty body', async () => {
    const { cookie } = await createTosSession();
    const res = await makePut(cookie, ip, {});
    expect(res.status).toBe(400);
  });

  it('requires CSRF header', async () => {
    const { cookie } = await createTosSession();
    const res = await SELF.fetch(NOTIF_URL, {
      method: 'PUT',
      headers: {
        Cookie: cookie,
        'CF-Connecting-IP': ip,
        'Content-Type': 'application/json',
        // X-WRL-CSRF intentionally omitted
      },
      body: JSON.stringify({ email: 'a@b.com' }),
    });
    expect(res.status).toBe(403);
  });

  it('requires Content-Type application/json', async () => {
    const { cookie } = await createTosSession();
    const res = await SELF.fetch(NOTIF_URL, {
      method: 'PUT',
      headers: {
        Cookie: cookie,
        'CF-Connecting-IP': ip,
        'Content-Type': 'text/plain',
        'X-WRL-CSRF': '1',
      },
      body: '{}',
    });
    expect(res.status).toBe(415);
  });
});

// ---------------------------------------------------------------------------
// Unsubscribe token: unit tests (no HTTP)
// ---------------------------------------------------------------------------

describe('unsubscribe token -- generation and verification', () => {
  const sessionSecret = 'deadbeef'.repeat(8); // matches vitest.config.js

  it('round-trips: generate then verify returns tenantId and eventType', async () => {
    const token = await generateUnsubscribeToken(sessionSecret, 'gh-12345', 'capture_failure');
    const result = await verifyUnsubscribeToken(sessionSecret, token);
    expect(result.ok).toBe(true);
    expect(result.tenantId).toBe('gh-12345');
    expect(result.eventType).toBe('capture_failure');
  });

  it('rejects tampered payload', async () => {
    const token = await generateUnsubscribeToken(sessionSecret, 'gh-12345', 'capture_failure');
    const [payloadB64, hmacB64] = token.split('.');
    // Decode, mutate, re-encode
    const padding = (4 - (payloadB64.replace(/-/g, '+').replace(/_/g, '/').length % 4)) % 4;
    const decoded = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(padding));
    const parsed = JSON.parse(decoded);
    parsed.c = 'weekly_digest'; // change the event type
    const tampered = btoa(JSON.stringify(parsed)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    const tamperedToken = `${tampered}.${hmacB64}`;
    const result = await verifyUnsubscribeToken(sessionSecret, tamperedToken);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('invalid_signature');
  });

  it('rejects tampered HMAC', async () => {
    const token = await generateUnsubscribeToken(sessionSecret, 'gh-12345', 'capture_failure');
    const [payloadB64] = token.split('.');
    const tamperedToken = `${payloadB64}.AAAA_invalid_hmac`;
    const result = await verifyUnsubscribeToken(sessionSecret, tamperedToken);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/signature/);
  });

  it('rejects malformed token (no dot separator)', async () => {
    const result = await verifyUnsubscribeToken(sessionSecret, 'nodotintoken');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('malformed_token');
  });

  it('rejects empty token', async () => {
    const result = await verifyUnsubscribeToken(sessionSecret, '');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('missing_token');
  });

  it('rejects session cookie values (unsub. prefix domain-separates them)', async () => {
    // A real session cookie value is "{sessionId}.{hmacHex}" where the HMAC
    // input is just the sessionId -- without the "unsub." prefix.
    // Verifying it as an unsubscribe token must fail.
    const fakeSessionId = 'deadbeef'.repeat(4); // 32 hex chars, looks like a session ID
    // Sign it as session.js would (without "unsub." prefix)
    const keyBytes = new Uint8Array('deadbeef'.repeat(8).match(/.{2}/g).map(h => parseInt(h, 16)));
    const key = await crypto.subtle.importKey(
      'raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(fakeSessionId));
    const hmacHex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
    const sessionCookieValue = `${fakeSessionId}.${hmacHex}`;
    const result = await verifyUnsubscribeToken(sessionSecret, sessionCookieValue);
    expect(result.ok).toBe(false);
    // Should fail signature check (different HMAC input domain) or payload parse
  });

  it('rejects token with unknown eventType', async () => {
    // Craft a token with a valid structure but unknown eventType
    // We do this by generating for a valid type, then substituting
    const enc = new TextEncoder();
    function toB64url(bytes) {
      const b64 = btoa(Array.from(bytes, b => String.fromCharCode(b)).join(''));
      return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    }
    const payload = JSON.stringify({ t: 'gh-test', c: 'sql_injection_attempt', v: 1 });
    const payloadB64 = toB64url(enc.encode(payload));
    const hmacInput = `unsub.${payloadB64}`;
    const keyBytes = new Uint8Array(sessionSecret.match(/.{2}/g).map(h => parseInt(h, 16)));
    const key = await crypto.subtle.importKey(
      'raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(hmacInput));
    const hmacB64 = toB64url(new Uint8Array(sig));
    const token = `${payloadB64}.${hmacB64}`;
    const result = await verifyUnsubscribeToken(sessionSecret, token);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('unknown_event_type');
  });

  it('handles all valid NOTIFICATION_TYPES', async () => {
    for (const type of NOTIFICATION_TYPES) {
      const token = await generateUnsubscribeToken(sessionSecret, 'gh-99', type);
      const result = await verifyUnsubscribeToken(sessionSecret, token);
      expect(result.ok).toBe(true);
      expect(result.eventType).toBe(type);
    }
  });
});

// ---------------------------------------------------------------------------
// GET /v1/notifications/unsubscribe
// ---------------------------------------------------------------------------

describe('GET /v1/notifications/unsubscribe', () => {
  const ip = nextIp();

  it('returns 200 HTML for a valid token (does not modify DB)', async () => {
    const token = await generateUnsubscribeToken(env.SESSION_SECRET, 'gh-12345', 'weekly_digest');
    // Seed the tenant
    await env.DB.prepare('INSERT OR IGNORE INTO tenants (id) VALUES (?)').bind('gh-12345').run();
    const res = await SELF.fetch(`${UNSUB_URL}?token=${encodeURIComponent(token)}`, {
      headers: { 'CF-Connecting-IP': ip },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('Confirm unsubscribe');
    expect(html).toContain('form');
    // DB must NOT be modified by a GET
    const row = await env.DB.prepare(
      'SELECT * FROM notification_preferences WHERE tenant_id = ?',
    ).bind('gh-12345').first();
    expect(row).toBeNull();
  });

  it('returns 200 HTML for an invalid token (no leakage)', async () => {
    const res = await SELF.fetch(`${UNSUB_URL}?token=invalid_token_xyz`, {
      headers: { 'CF-Connecting-IP': ip },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('Invalid or expired link');
  });

  it('returns 200 HTML when no token is present', async () => {
    const res = await SELF.fetch(UNSUB_URL, {
      headers: { 'CF-Connecting-IP': ip },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/html');
  });

  it('requires no session cookie (unauthenticated endpoint)', async () => {
    const token = await generateUnsubscribeToken(env.SESSION_SECRET, 'gh-99', 'capture_failure');
    await env.DB.prepare('INSERT OR IGNORE INTO tenants (id) VALUES (?)').bind('gh-99').run();
    const res = await SELF.fetch(`${UNSUB_URL}?token=${encodeURIComponent(token)}`, {
      headers: { 'CF-Connecting-IP': ip },
      // No Cookie header
    });
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// POST /v1/notifications/unsubscribe
// ---------------------------------------------------------------------------

describe('POST /v1/notifications/unsubscribe -- valid token', () => {
  const ip = nextIp();

  it('sets notify_weekly_digest to 0 for valid token', async () => {
    const token = await generateUnsubscribeToken(env.SESSION_SECRET, 'gh-42', 'weekly_digest');
    await env.DB.prepare('INSERT OR IGNORE INTO tenants (id) VALUES (?)').bind('gh-42').run();

    const res = await SELF.fetch(`${UNSUB_URL}?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'CF-Connecting-IP': ip,
      },
      body: 'List-Unsubscribe=One-Click',
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('You have been unsubscribed');

    // Verify DB was updated
    const row = await env.DB.prepare(
      'SELECT notify_weekly_digest FROM notification_preferences WHERE tenant_id = ?',
    ).bind('gh-42').first();
    expect(row).not.toBeNull();
    expect(row.notify_weekly_digest).toBe(0);
  });

  it('is idempotent: posting twice does not error', async () => {
    const token = await generateUnsubscribeToken(env.SESSION_SECRET, 'gh-43', 'capture_failure');
    await env.DB.prepare('INSERT OR IGNORE INTO tenants (id) VALUES (?)').bind('gh-43').run();
    const url = `${UNSUB_URL}?token=${encodeURIComponent(token)}`;
    const makeReq = (reqIp) => SELF.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'CF-Connecting-IP': reqIp },
      body: 'List-Unsubscribe=One-Click',
    });
    const res1 = await makeReq(nextIp());
    const res2 = await makeReq(nextIp());
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
  });

  it('creates prefs row if it does not exist', async () => {
    const token = await generateUnsubscribeToken(env.SESSION_SECRET, 'gh-44', 'invoice_generated');
    await env.DB.prepare('INSERT OR IGNORE INTO tenants (id) VALUES (?)').bind('gh-44').run();
    await SELF.fetch(`${UNSUB_URL}?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'CF-Connecting-IP': ip },
      body: 'List-Unsubscribe=One-Click',
    });
    const row = await env.DB.prepare(
      'SELECT notify_invoice_generated FROM notification_preferences WHERE tenant_id = ?',
    ).bind('gh-44').first();
    expect(row).not.toBeNull();
    expect(row.notify_invoice_generated).toBe(0);
  });
});

describe('POST /v1/notifications/unsubscribe -- invalid token', () => {
  const ip = nextIp();

  it('returns 200 HTML for invalid token (no leakage, no DB change)', async () => {
    await env.DB.prepare('INSERT OR IGNORE INTO tenants (id) VALUES (?)').bind('gh-55').run();
    const res = await SELF.fetch(`${UNSUB_URL}?token=totally_invalid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'CF-Connecting-IP': ip },
      body: 'List-Unsubscribe=One-Click',
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Invalid or expired link');
    // DB should not have been modified
    const row = await env.DB.prepare(
      'SELECT * FROM notification_preferences WHERE tenant_id = ?',
    ).bind('gh-55').first();
    expect(row).toBeNull();
  });

  it('returns 200 HTML when no token is provided', async () => {
    const res = await SELF.fetch(UNSUB_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'CF-Connecting-IP': ip },
      body: 'List-Unsubscribe=One-Click',
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Invalid or expired link');
  });
});
