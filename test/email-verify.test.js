// tva
// Integration and unit tests for the email verification flow.
// Covers: token generation/verification, GET/POST verify-email handlers,
//         resend-verification endpoint, and notification continuity.

import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanDb, createTestSession } from './fixtures.js';
import { generateEmailVerifyToken, verifyEmailVerifyToken } from '../src/email-verify.js';
import { generateUnsubscribeToken, verifyUnsubscribeToken } from '../src/unsubscribe.js';

const VERIFY_URL = 'https://worker.test/v1/notifications/verify-email';
const RESEND_URL = 'https://worker.test/v1/account/notifications/resend-verification';
const NOTIF_URL = 'https://worker.test/v1/account/notifications';

// Distinct IP range to avoid rate-limit cross-contamination with other test files
let ipCounter = 500;
function nextIp() {
  return `10.0.5.${ipCounter++}`;
}

// ---------------------------------------------------------------------------
// Session helper (duplicated inline -- not extracted per task instructions)
// ---------------------------------------------------------------------------

async function createTosSession(overrides = {}) {
  const session = await createTestSession(env.DB, env, overrides);
  await env.DB.prepare(
    "UPDATE github_users SET tos_accepted_at = '2026-01-01T00:00:00.000Z', tos_version = '1.0' WHERE github_id = ?",
  ).bind(session.githubId).run();
  return session;
}

// ---------------------------------------------------------------------------
// Inline HMAC helpers for crafting manipulated tokens in unit tests
// ---------------------------------------------------------------------------

const enc = new TextEncoder();

function toB64url(bytes) {
  const b64 = btoa(Array.from(bytes, b => String.fromCharCode(b)).join(''));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function craftEmailVerifyToken(sessionSecret, payload) {
  const payloadStr = JSON.stringify(payload);
  const payloadB64 = toB64url(enc.encode(payloadStr));
  const hmacInput = `emailverify.${payloadB64}`;
  const keyBytes = new Uint8Array(sessionSecret.match(/.{2}/g).map(h => parseInt(h, 16)));
  const key = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(hmacInput));
  const hmacB64 = toB64url(new Uint8Array(sig));
  return `${payloadB64}.${hmacB64}`;
}

beforeEach(async () => {
  await cleanDb(env.DB);
});

// ---------------------------------------------------------------------------
// 1. Token generation and verification (unit tests, no HTTP)
// ---------------------------------------------------------------------------

describe('email verify token -- generation and verification', () => {
  const sessionSecret = 'deadbeef'.repeat(8);

  it('round-trip: generate then verify returns ok=true with tenantId and email', async () => {
    const token = await generateEmailVerifyToken(sessionSecret, 'gh-1001', 'user@example.com');
    const result = await verifyEmailVerifyToken(sessionSecret, token);
    expect(result.ok).toBe(true);
    expect(result.tenantId).toBe('gh-1001');
    expect(result.email).toBe('user@example.com');
  });

  it('rejects token with ts backdated by 25 hours (token_expired)', async () => {
    const ts = Math.floor(Date.now() / 1000) - 90000; // 25 hours ago
    const token = await craftEmailVerifyToken(sessionSecret, {
      t: 'gh-1001', e: 'user@example.com', ts, v: 1,
    });
    const result = await verifyEmailVerifyToken(sessionSecret, token);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('token_expired');
  });

  it('accepts token at exactly 24h boundary (>86400 check, not >=)', async () => {
    // Code uses > 86400, so ts = now - 86400 should still be valid
    const ts = Math.floor(Date.now() / 1000) - 86400;
    const token = await craftEmailVerifyToken(sessionSecret, {
      t: 'gh-1001', e: 'user@example.com', ts, v: 1,
    });
    const result = await verifyEmailVerifyToken(sessionSecret, token);
    expect(result.ok).toBe(true);
  });

  it('rejects tampered payload (invalid_signature)', async () => {
    const token = await generateEmailVerifyToken(sessionSecret, 'gh-1001', 'user@example.com');
    const dotIndex = token.lastIndexOf('.');
    const payloadB64 = token.slice(0, dotIndex);
    const hmacB64 = token.slice(dotIndex + 1);
    // Corrupt one character in the payload
    const tampered = payloadB64.slice(0, -1) + (payloadB64.slice(-1) === 'A' ? 'B' : 'A');
    const tamperedToken = `${tampered}.${hmacB64}`;
    const result = await verifyEmailVerifyToken(sessionSecret, tamperedToken);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('invalid_signature');
  });

  it('rejects tampered HMAC (invalid_signature)', async () => {
    const token = await generateEmailVerifyToken(sessionSecret, 'gh-1001', 'user@example.com');
    const dotIndex = token.lastIndexOf('.');
    const payloadB64 = token.slice(0, dotIndex);
    const tamperedToken = `${payloadB64}.AAAA_invalid_hmac_bytes`;
    const result = await verifyEmailVerifyToken(sessionSecret, tamperedToken);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('invalid_signature');
  });

  it('domain separation: unsubscribe token rejected by verifyEmailVerifyToken', async () => {
    const token = await generateUnsubscribeToken(sessionSecret, 'gh-1001', 'capture_failure');
    const result = await verifyEmailVerifyToken(sessionSecret, token);
    expect(result.ok).toBe(false);
  });

  it('domain separation: email verify token rejected by verifyUnsubscribeToken', async () => {
    const token = await generateEmailVerifyToken(sessionSecret, 'gh-1001', 'user@example.com');
    const result = await verifyUnsubscribeToken(sessionSecret, token);
    expect(result.ok).toBe(false);
  });

  it('domain separation: session cookie value rejected by verifyEmailVerifyToken', async () => {
    // Session cookies are signed without any prefix: HMAC(sessionId), not HMAC("emailverify." + ...)
    const fakeSessionId = 'deadbeef'.repeat(4);
    const keyBytes = new Uint8Array(sessionSecret.match(/.{2}/g).map(h => parseInt(h, 16)));
    const key = await crypto.subtle.importKey(
      'raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(fakeSessionId));
    const hmacHex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
    const sessionCookieValue = `${fakeSessionId}.${hmacHex}`;
    const result = await verifyEmailVerifyToken(sessionSecret, sessionCookieValue);
    expect(result.ok).toBe(false);
  });

  it('rejects token with v=2 (invalid_payload_version)', async () => {
    const token = await craftEmailVerifyToken(sessionSecret, {
      t: 'gh-1001', e: 'user@example.com', ts: Math.floor(Date.now() / 1000), v: 2,
    });
    const result = await verifyEmailVerifyToken(sessionSecret, token);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('invalid_payload_version');
  });

  it('rejects token missing e field (invalid_payload_email)', async () => {
    const token = await craftEmailVerifyToken(sessionSecret, {
      t: 'gh-1001', ts: Math.floor(Date.now() / 1000), v: 1,
    });
    const result = await verifyEmailVerifyToken(sessionSecret, token);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('invalid_payload_email');
  });

  it('rejects dot-only token (malformed_token)', async () => {
    const result = await verifyEmailVerifyToken(sessionSecret, '.');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('malformed_token');
  });

  it('rejects token with no dot separator (malformed_token)', async () => {
    const result = await verifyEmailVerifyToken(sessionSecret, 'nodotintoken');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('malformed_token');
  });

  it('rejects empty string (missing_token)', async () => {
    const result = await verifyEmailVerifyToken(sessionSecret, '');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('missing_token');
  });

  it('rejects null (missing_token)', async () => {
    const result = await verifyEmailVerifyToken(sessionSecret, null);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('missing_token');
  });
});

// ---------------------------------------------------------------------------
// 2. GET /v1/notifications/verify-email
// ---------------------------------------------------------------------------

describe('GET /v1/notifications/verify-email', () => {
  it('returns 200 HTML with confirm page for a valid token', async () => {
    // Set pending email via the notifications PUT endpoint
    const { cookie } = await createTosSession({ githubId: 20001 });
    const putRes = await SELF.fetch(NOTIF_URL, {
      method: 'PUT',
      headers: {
        Cookie: cookie,
        'CF-Connecting-IP': nextIp(),
        'Content-Type': 'application/json',
        'X-WRL-CSRF': '1',
      },
      body: JSON.stringify({ email: 'verify-me@example.com' }),
    });
    expect(putRes.status).toBe(200);

    const token = await generateEmailVerifyToken(env.SESSION_SECRET, 'gh-20001', 'verify-me@example.com');
    const res = await SELF.fetch(`${VERIFY_URL}?token=${encodeURIComponent(token)}`, {
      headers: { 'CF-Connecting-IP': nextIp() },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/html');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const html = await res.text();
    expect(html).toContain('Confirm email address');
  });

  it('returns 200 HTML with invalid-link page for garbage token', async () => {
    const res = await SELF.fetch(`${VERIFY_URL}?token=garbage_token_xyz`, {
      headers: { 'CF-Connecting-IP': nextIp() },
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Invalid or expired link');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('returns 200 HTML with invalid-link page for expired token', async () => {
    const ts = Math.floor(Date.now() / 1000) - 90000;
    const token = await craftEmailVerifyToken(env.SESSION_SECRET, {
      t: 'gh-20001', e: 'verify-me@example.com', ts, v: 1,
    });
    const res = await SELF.fetch(`${VERIFY_URL}?token=${encodeURIComponent(token)}`, {
      headers: { 'CF-Connecting-IP': nextIp() },
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Invalid or expired link');
  });

  it('returns 200 HTML with invalid-link page when token is absent', async () => {
    const res = await SELF.fetch(VERIFY_URL, {
      headers: { 'CF-Connecting-IP': nextIp() },
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Invalid or expired link');
  });

  it('GET does not modify DB state', async () => {
    // Seed a tenant with a pending email
    const tenantId = 'gh-20010';
    await env.DB.prepare('INSERT OR IGNORE INTO tenants (id) VALUES (?)').bind(tenantId).run();
    await env.DB.prepare(
      `INSERT OR IGNORE INTO notification_preferences (tenant_id, pending_email, verification_sent_at)
       VALUES (?, 'get-test@example.com', '2026-01-01T00:00:00.000Z')`,
    ).bind(tenantId).run();

    const before = await env.DB.prepare(
      'SELECT * FROM notification_preferences WHERE tenant_id = ?',
    ).bind(tenantId).first();

    const token = await generateEmailVerifyToken(env.SESSION_SECRET, tenantId, 'get-test@example.com');
    await SELF.fetch(`${VERIFY_URL}?token=${encodeURIComponent(token)}`, {
      headers: { 'CF-Connecting-IP': nextIp() },
    });

    const after = await env.DB.prepare(
      'SELECT * FROM notification_preferences WHERE tenant_id = ?',
    ).bind(tenantId).first();

    expect(after).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// 3. POST /v1/notifications/verify-email
// ---------------------------------------------------------------------------

describe('POST /v1/notifications/verify-email', () => {
  it('happy path: valid token verifies pending email and swaps it into email column', async () => {
    const { cookie } = await createTosSession({ githubId: 30001 });
    const tenantId = 'gh-30001';
    // PUT to set pending_email
    await SELF.fetch(NOTIF_URL, {
      method: 'PUT',
      headers: {
        Cookie: cookie,
        'CF-Connecting-IP': nextIp(),
        'Content-Type': 'application/json',
        'X-WRL-CSRF': '1',
      },
      body: JSON.stringify({ email: 'confirmed@example.com' }),
    });

    const token = await generateEmailVerifyToken(env.SESSION_SECRET, tenantId, 'confirmed@example.com');
    const res = await SELF.fetch(`${VERIFY_URL}?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'CF-Connecting-IP': nextIp() },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const html = await res.text();
    expect(html).toContain('Email address verified');

    // Verify DB state
    const row = await env.DB.prepare(
      'SELECT email, pending_email, email_verified FROM notification_preferences WHERE tenant_id = ?',
    ).bind(tenantId).first();
    expect(row).not.toBeNull();
    expect(row.email).toBe('confirmed@example.com');
    expect(row.pending_email).toBeNull();
    expect(row.email_verified).toBe(1);
  });

  it('returns 200 failure page for invalid token', async () => {
    const res = await SELF.fetch(`${VERIFY_URL}?token=bad_token`, {
      method: 'POST',
      headers: { 'CF-Connecting-IP': nextIp() },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const html = await res.text();
    expect(html).toContain('Verification failed');
  });

  it('returns 200 failure page for expired token', async () => {
    const ts = Math.floor(Date.now() / 1000) - 90000;
    const token = await craftEmailVerifyToken(env.SESSION_SECRET, {
      t: 'gh-30002', e: 'any@example.com', ts, v: 1,
    });
    const res = await SELF.fetch(`${VERIFY_URL}?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'CF-Connecting-IP': nextIp() },
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Verification failed');
  });

  it('stale token: fails when pending_email was changed after token was issued', async () => {
    // NOTE: The existing pending_email cross-check (prefs.pendingEmail !== email)
    // catches the common case, but swapVerifiedEmail() does not include
    // AND pending_email = ? in its WHERE clause. A concurrent request could
    // change pending_email between the check and the swap. See security review
    // notes in docs/evolution/ for details. The fix is tracked separately.
    const { cookie } = await createTosSession({ githubId: 30003 });
    const tenantId = 'gh-30003';

    // Set pending_email to address A
    await SELF.fetch(NOTIF_URL, {
      method: 'PUT',
      headers: {
        Cookie: cookie,
        'CF-Connecting-IP': nextIp(),
        'Content-Type': 'application/json',
        'X-WRL-CSRF': '1',
      },
      body: JSON.stringify({ email: 'address-a@example.com' }),
    });

    // Generate token for address A
    const tokenForA = await generateEmailVerifyToken(env.SESSION_SECRET, tenantId, 'address-a@example.com');

    // Backdate verification_sent_at so the second PUT is not rate-limited
    await env.DB.prepare(
      "UPDATE notification_preferences SET verification_sent_at = '2020-01-01T00:00:00.000Z' WHERE tenant_id = ?",
    ).bind(tenantId).run();

    // Change pending_email to address B
    await SELF.fetch(NOTIF_URL, {
      method: 'PUT',
      headers: {
        Cookie: cookie,
        'CF-Connecting-IP': nextIp(),
        'Content-Type': 'application/json',
        'X-WRL-CSRF': '1',
      },
      body: JSON.stringify({ email: 'address-b@example.com' }),
    });

    // POST with the stale token for A -- should fail (pending_email_mismatch)
    const res = await SELF.fetch(`${VERIFY_URL}?token=${encodeURIComponent(tokenForA)}`, {
      method: 'POST',
      headers: { 'CF-Connecting-IP': nextIp() },
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Verification failed');

    // pending_email should still be address B (not swapped)
    const row = await env.DB.prepare(
      'SELECT pending_email, email FROM notification_preferences WHERE tenant_id = ?',
    ).bind(tenantId).first();
    expect(row.pending_email).toBe('address-b@example.com');
    expect(row.email).toBeNull();
  });

  it('double verification: second POST with same token fails (no pending_email left)', async () => {
    const { cookie } = await createTosSession({ githubId: 30004 });
    const tenantId = 'gh-30004';

    await SELF.fetch(NOTIF_URL, {
      method: 'PUT',
      headers: {
        Cookie: cookie,
        'CF-Connecting-IP': nextIp(),
        'Content-Type': 'application/json',
        'X-WRL-CSRF': '1',
      },
      body: JSON.stringify({ email: 'double@example.com' }),
    });

    const token = await generateEmailVerifyToken(env.SESSION_SECRET, tenantId, 'double@example.com');
    const url = `${VERIFY_URL}?token=${encodeURIComponent(token)}`;

    const res1 = await SELF.fetch(url, {
      method: 'POST',
      headers: { 'CF-Connecting-IP': nextIp() },
    });
    expect(res1.status).toBe(200);
    const html1 = await res1.text();
    expect(html1).toContain('Email address verified');

    const res2 = await SELF.fetch(url, {
      method: 'POST',
      headers: { 'CF-Connecting-IP': nextIp() },
    });
    expect(res2.status).toBe(200);
    const html2 = await res2.text();
    expect(html2).toContain('Verification failed');
  });

  it('accepts token in form body (application/x-www-form-urlencoded)', async () => {
    const { cookie } = await createTosSession({ githubId: 30005 });
    const tenantId = 'gh-30005';

    await SELF.fetch(NOTIF_URL, {
      method: 'PUT',
      headers: {
        Cookie: cookie,
        'CF-Connecting-IP': nextIp(),
        'Content-Type': 'application/json',
        'X-WRL-CSRF': '1',
      },
      body: JSON.stringify({ email: 'form-body@example.com' }),
    });

    const token = await generateEmailVerifyToken(env.SESSION_SECRET, tenantId, 'form-body@example.com');

    // POST with token in form body, no query param
    const res = await SELF.fetch(VERIFY_URL, {
      method: 'POST',
      headers: {
        'CF-Connecting-IP': nextIp(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `token=${encodeURIComponent(token)}`,
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Email address verified');
  });

  it('returns 200 failure page for empty token query param', async () => {
    const res = await SELF.fetch(`${VERIFY_URL}?token=`, {
      method: 'POST',
      headers: { 'CF-Connecting-IP': nextIp() },
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Verification failed');
  });
});

// ---------------------------------------------------------------------------
// 4. POST /v1/account/notifications/resend-verification
// ---------------------------------------------------------------------------

describe('POST /v1/account/notifications/resend-verification', () => {
  it('happy path: returns 200 { sent: true } when pending_email is set', async () => {
    const { cookie } = await createTosSession({ githubId: 40001 });
    const ip = nextIp();

    // Set pending_email
    await SELF.fetch(NOTIF_URL, {
      method: 'PUT',
      headers: {
        Cookie: cookie,
        'CF-Connecting-IP': nextIp(),
        'Content-Type': 'application/json',
        'X-WRL-CSRF': '1',
      },
      body: JSON.stringify({ email: 'resend-test@example.com' }),
    });

    // Backdate verification_sent_at so rate limit is clear
    await env.DB.prepare(
      "UPDATE notification_preferences SET verification_sent_at = '2020-01-01T00:00:00.000Z' WHERE tenant_id = ?",
    ).bind('gh-40001').run();

    const res = await SELF.fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        Cookie: cookie,
        'CF-Connecting-IP': ip,
        'X-WRL-CSRF': '1',
      },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sent).toBe(true);
  });

  it('returns 400 when no pending email exists', async () => {
    const { cookie } = await createTosSession({ githubId: 40002 });
    const ip = nextIp();

    // No PUT -- no pending email
    const res = await SELF.fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        Cookie: cookie,
        'CF-Connecting-IP': ip,
        'X-WRL-CSRF': '1',
      },
    });
    expect(res.status).toBe(400);
  });

  it('returns 429 with Retry-After: 60 on second call within 60 seconds', async () => {
    const { cookie } = await createTosSession({ githubId: 40003 });

    // Set pending_email
    await SELF.fetch(NOTIF_URL, {
      method: 'PUT',
      headers: {
        Cookie: cookie,
        'CF-Connecting-IP': nextIp(),
        'Content-Type': 'application/json',
        'X-WRL-CSRF': '1',
      },
      body: JSON.stringify({ email: 'rate-limit@example.com' }),
    });

    // First resend -- should succeed (verification_sent_at was just set by PUT)
    // Backdate it first so the PUT's own timestamp doesn't interfere
    await env.DB.prepare(
      "UPDATE notification_preferences SET verification_sent_at = '2020-01-01T00:00:00.000Z' WHERE tenant_id = ?",
    ).bind('gh-40003').run();

    const res1 = await SELF.fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        Cookie: cookie,
        'CF-Connecting-IP': nextIp(),
        'X-WRL-CSRF': '1',
      },
    });
    expect(res1.status).toBe(200);

    // Second resend immediately -- should hit rate limit
    const res2 = await SELF.fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        Cookie: cookie,
        'CF-Connecting-IP': nextIp(),
        'X-WRL-CSRF': '1',
      },
    });
    expect(res2.status).toBe(429);
    expect(res2.headers.get('Retry-After')).toBe('60');
  });

  it('returns 403 when X-WRL-CSRF header is missing', async () => {
    const { cookie } = await createTosSession({ githubId: 40004 });
    const ip = nextIp();

    const res = await SELF.fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        Cookie: cookie,
        'CF-Connecting-IP': ip,
        // X-WRL-CSRF intentionally omitted
      },
    });
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// 5. Notification continuity
// ---------------------------------------------------------------------------

describe('notification continuity', () => {
  it('notifications go to old email while pending; switch to new email after verification', async () => {
    const { cookie } = await createTosSession({ githubId: 50001 });
    const tenantId = 'gh-50001';

    // Seed with a verified old email directly in DB
    await env.DB.prepare(
      `INSERT OR REPLACE INTO notification_preferences
         (tenant_id, email, email_verified, email_source)
       VALUES (?, 'old@example.com', 1, 'manual')`,
    ).bind(tenantId).run();

    // PUT a new pending email
    await SELF.fetch(NOTIF_URL, {
      method: 'PUT',
      headers: {
        Cookie: cookie,
        'CF-Connecting-IP': nextIp(),
        'Content-Type': 'application/json',
        'X-WRL-CSRF': '1',
      },
      body: JSON.stringify({ email: 'new@example.com' }),
    });

    // During pending period, email should still be old@example.com
    const getRes = await SELF.fetch(NOTIF_URL, {
      headers: {
        Cookie: cookie,
        'CF-Connecting-IP': nextIp(),
      },
    });
    const prefs = await getRes.json();
    expect(prefs.email).toBe('old@example.com');
    expect(prefs.pendingEmail).toBe('new@example.com');

    // Verify the new email via POST
    const token = await generateEmailVerifyToken(env.SESSION_SECRET, tenantId, 'new@example.com');
    const postRes = await SELF.fetch(`${VERIFY_URL}?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'CF-Connecting-IP': nextIp() },
    });
    expect(postRes.status).toBe(200);
    const postHtml = await postRes.text();
    expect(postHtml).toContain('Email address verified');

    // After verification, email should be new@example.com
    const afterRes = await SELF.fetch(NOTIF_URL, {
      headers: {
        Cookie: cookie,
        'CF-Connecting-IP': nextIp(),
      },
    });
    const afterPrefs = await afterRes.json();
    expect(afterPrefs.email).toBe('new@example.com');
    expect(afterPrefs.pendingEmail).toBeNull();
    expect(afterPrefs.emailVerified).toBe(true);
  });
});
