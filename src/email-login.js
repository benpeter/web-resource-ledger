/*
 * email-login.js -- sign in with an emailed link (phase 0131).
 *
 *   POST /auth/email         send a single-use sign-in link
 *   GET  /auth/email/verify  page with a "Sign in" button (does not use the token)
 *   POST /auth/email/verify  use the token, find or create the account, start a session
 *
 * The GET only shows a button because mail scanners open links in emails; a
 * token used on GET would be gone before the person clicks.
 *
 * Accounts: an address that already signed in by email keeps its account. An
 * address that is the verified notification email of exactly one existing
 * account (GitHub or not) signs into that account. Otherwise a new tenant
 * `em-<16 hex>` is created with a first API key, as for GitHub signups.
 *
 * SECURITY: email addresses are never logged. Tokens are stored as SHA-256 hex.
 */

import { jsonResponse, problemResponse } from './responses.js';
import { log } from './log.js';
import { computeCip } from './ip-hash.js';
import { hashApiKey } from './auth.js';
import { generateSessionId, createSessionCookie } from './session.js';
import {
  createLoginToken,
  consumeLoginToken,
  deleteExpiredLoginTokens,
  findEmailUser,
  createEmailUser,
  touchEmailUserLogin,
  findTenantByVerifiedEmail,
  createSession,
  createApiKeyRecord,
  upsertNotificationPreferences,
} from './db.js';
import { rateLimitCounter } from './kv.js';
import { loginLinkEmail } from './email/templates/login-link.js';
import { renderPage } from './email-verify.js';
import { escapeHtml } from './verify-page.js';
import { trackEvent } from './pirsch.js';
import { isAnalyticsExcluded } from './analytics.js';
import { FIRST_KEY_TTL_SECONDS } from './oauth.js';

export const LOGIN_TOKEN_TTL_SECONDS = 15 * 60;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // same as GitHub sign-in

// Link requests per hour. Per address: limits mail sent to someone who didn't
// ask. Per IP: limits account creation and mail volume from one client.
const LINKS_PER_EMAIL_PER_HOUR = 3;
const LINKS_PER_IP_PER_HOUR = 10;

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const FROM_ADDRESS = 'Web Resource Ledger <notifications@webresourceledger.com>';

// One plain address: local part, @, a domain with a dot. No spaces, no line
// breaks, no display names. Deliberately stricter than RFC 5322.
const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

const TOKEN_RE = /^[A-Za-z0-9_-]{40,64}$/;

const ALLOWED_SOURCES = new Set(['landing', 'docs', 'api', 'dashboard', 'direct']);

const HTML_HEADERS = {
  'Content-Type': 'text/html;charset=UTF-8',
  'Cache-Control': 'no-store',
  // The token is in the URL of the confirmation page; don't leak it onward.
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
};

/**
 * Normalize an email address: trimmed, lower-cased, one plain address.
 *
 * @param {unknown} raw
 * @returns {string|null}  null when it is not a usable address
 */
export function normalizeEmail(raw) {
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  if (email.length < 3 || email.length > 254) return null;
  if (!EMAIL_RE.test(email)) return null;
  return email;
}

function toBase64url(bytes) {
  const b64 = btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function randomHex(bytes) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * POST /auth/email  { email, from? }
 */
export async function handleEmailLoginRequest(request, env, ctx) {
  const cip = await computeCip(env, request.headers.get('CF-Connecting-IP') || 'unknown').catch(() => null);

  let body;
  try {
    body = await request.json();
  } catch {
    return problemResponse(400, 'Request body must be JSON with an "email" field');
  }
  const email = normalizeEmail(body?.email);
  if (!email) {
    return problemResponse(400, 'Enter one valid email address');
  }
  const source = ALLOWED_SOURCES.has(body?.from) ? body.from : 'direct';

  if (!env.RESEND_API_KEY) {
    return problemResponse(503, 'Email sign-in is not available right now');
  }

  // Rate limits, keyed by hashes so neither the IP nor the address is stored.
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const ipKey = (await hashApiKey(`login-ip:${ip}`)).slice(0, 32);
  const emailKey = (await hashApiKey(`login-email:${email}`)).slice(0, 32);
  const byIp = await rateLimitCounter(env.KV, ipKey, 'email-login-ip', LINKS_PER_IP_PER_HOUR, 3600);
  if (byIp.exceeded) {
    ctx.waitUntil(log(env, 4, 'auth', { event: 'auth.email_link_rate_limited', cip, scope: 'ip' }) ?? Promise.resolve());
    return problemResponse(429, 'Too many sign-in links requested. Try again in an hour.');
  }
  const byEmail = await rateLimitCounter(env.KV, emailKey, 'email-login-address', LINKS_PER_EMAIL_PER_HOUR, 3600);
  if (byEmail.exceeded) {
    ctx.waitUntil(log(env, 4, 'auth', { event: 'auth.email_link_rate_limited', cip, scope: 'address' }) ?? Promise.resolve());
    return problemResponse(429, 'Too many sign-in links sent to this address. Try again in an hour.');
  }
  ctx.waitUntil(Promise.all([byIp.writePromise, byEmail.writePromise]).catch(() => {}));

  const token = toBase64url(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await hashApiKey(token);
  const expiresAt = new Date(Date.now() + LOGIN_TOKEN_TTL_SECONDS * 1000).toISOString();
  await createLoginToken(env.DB, { tokenHash, email, source, expiresAt });
  ctx.waitUntil(deleteExpiredLoginTokens(env.DB).catch(() => {}));

  const loginUrl = `${new URL(request.url).origin}/auth/email/verify?token=${token}`;
  const { subject, html, text } = loginLinkEmail({ loginUrl, expiresInMinutes: LOGIN_TOKEN_TTL_SECONDS / 60 });

  let status = 0;
  try {
    const resp = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.RESEND_API_KEY}` },
      body: JSON.stringify({ from: FROM_ADDRESS, to: [email], subject, html, text }),
      signal: AbortSignal.timeout(15000),
    });
    status = resp.status;
  } catch {
    status = 0;
  }

  if (status < 200 || status >= 300) {
    ctx.waitUntil(log(env, 5, 'auth', { event: 'auth.email_link_send_fail', cip, httpStatus: status }) ?? Promise.resolve());
    return problemResponse(502, 'The sign-in email could not be sent. Try again in a minute.');
  }

  ctx.waitUntil(log(env, 3, 'auth', { event: 'auth.email_link_sent', cip, source }) ?? Promise.resolve());
  return jsonResponse({ status: 'sent', expiresInMinutes: LOGIN_TOKEN_TTL_SECONDS / 60 }, 202);
}

/**
 * GET /auth/email/verify?token=...
 */
export async function handleEmailLoginPage(request, env, ctx) {
  const token = new URL(request.url).searchParams.get('token') || '';
  if (!TOKEN_RE.test(token)) {
    const body = `
      <div class="status-banner">
        <div>
          <p class="status-heading">This sign-in link is not valid</p>
          <p class="status-detail">Copy the whole link from the email, or <a href="/ui">request a new one</a>.</p>
        </div>
      </div>`;
    return new Response(renderPage('Sign in', body), { status: 400, headers: HTML_HEADERS });
  }

  const body = `
      <div class="status-banner">
        <div>
          <p class="status-heading">Sign in to Web Resource Ledger</p>
          <p class="status-detail">The link works once. If you don't have an account yet, this creates one.</p>
        </div>
      </div>
      <section>
        <form method="post" action="/auth/email/verify" style="margin-top: var(--space-4);">
          <input type="hidden" name="token" value="${escapeHtml(token)}">
          <button type="submit" class="btn btn-primary">Sign in</button>
        </form>
      </section>`;
  return new Response(renderPage('Sign in', body), { status: 200, headers: HTML_HEADERS });
}

function invalidLink() {
  return new Response(null, { status: 302, headers: { Location: '/ui?error=login_link_invalid', 'Cache-Control': 'no-store' } });
}

/**
 * POST /auth/email/verify  (form: token)
 */
export async function handleEmailLoginConfirm(request, env, ctx) {
  const cip = await computeCip(env, request.headers.get('CF-Connecting-IP') || 'unknown').catch(() => null);
  const ownOrigin = new URL(request.url).origin;

  // Login CSRF: only accept the form from our own page.
  const origin = request.headers.get('Origin');
  const sameOrigin = origin
    ? origin === ownOrigin
    : request.headers.get('Sec-Fetch-Site') === 'same-origin';
  if (!sameOrigin) {
    ctx.waitUntil(log(env, 4, 'auth', { event: 'auth.email_login_origin_rejected', cip }) ?? Promise.resolve());
    return problemResponse(403, 'Sign in from the page the email link opens');
  }

  let token = '';
  try {
    const form = await request.formData();
    token = String(form.get('token') || '');
  } catch {
    token = '';
  }
  if (!TOKEN_RE.test(token)) return invalidLink();

  const used = await consumeLoginToken(env.DB, await hashApiKey(token));
  if (!used) {
    ctx.waitUntil(log(env, 4, 'auth', { event: 'auth.email_login_invalid_token', cip }) ?? Promise.resolve());
    return invalidLink();
  }
  const { email, source } = used;

  let tenantId;
  let isNewUser = false;
  try {
    const existing = await findEmailUser(env.DB, email);
    if (existing) {
      tenantId = existing.tenantId;
      await touchEmailUserLogin(env.DB, email);
    } else {
      const linked = await findTenantByVerifiedEmail(env.DB, email);
      if (linked) {
        tenantId = linked;
        await createEmailUser(env.DB, { email, tenantId });
        ctx.waitUntil(log(env, 3, 'auth', { event: 'auth.email_user_linked', cip, tenantId }) ?? Promise.resolve());
      } else {
        isNewUser = true;
        tenantId = `em-${randomHex(8)}`;
        await createEmailUser(env.DB, { email, tenantId });

        const rawKey = 'wrl_live_' + toBase64url(crypto.getRandomValues(new Uint8Array(32)));
        const result = await createApiKeyRecord(env.DB, await hashApiKey(rawKey), {
          tenantId,
          scopes: ['capture', 'read'],
          name: 'primary',
          createdAt: new Date().toISOString(),
          createdBy: 'email-login',
          revoked: false,
          revokedAt: null,
        });
        if (result.created) {
          await env.KV.put(`first_key:${tenantId}`, rawKey, { expirationTtl: FIRST_KEY_TTL_SECONDS });
        }

        // The link proved the address, so it is the verified notification email.
        await upsertNotificationPreferences(env.DB, tenantId, {
          email,
          emailVerified: true,
          emailSource: 'manual',
        });

        ctx.waitUntil(log(env, 3, 'auth', { event: 'auth.tenant_create', cip, tenantId, provider: 'email' }) ?? Promise.resolve());
        if (!isAnalyticsExcluded(env, tenantId)) {
          ctx.waitUntil(trackEvent(request, env, 'Signup', { provider: 'email', source: source || 'direct' }, { property: 'api' }) ?? Promise.resolve());
        }
      }
    }
  } catch (err) {
    ctx.waitUntil(log(env, 5, 'auth', { event: 'auth.email_login_fail', cip, reason: 'user_setup_error', errorMessage: String(err?.message ?? '').slice(0, 128) }) ?? Promise.resolve());
    return new Response(null, { status: 302, headers: { Location: '/ui?error=login_failed' } });
  }

  let sessionCookie;
  try {
    const sessionId = generateSessionId();
    const idHash = await hashApiKey(sessionId);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    await createSession(env.DB, { idHash, email, tenantId, expiresAt });
    sessionCookie = await createSessionCookie(env, sessionId);
    ctx.waitUntil(log(env, 3, 'auth', { event: 'auth.email_login_success', cip, tenantId, isNewUser, sessionIdPrefix: idHash.slice(0, 8) }) ?? Promise.resolve());
  } catch (err) {
    ctx.waitUntil(log(env, 5, 'auth', { event: 'auth.email_login_fail', cip, reason: 'session_create_error' }) ?? Promise.resolve());
    return new Response(null, { status: 302, headers: { Location: '/ui?error=login_failed' } });
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: isNewUser ? '/ui?flow=welcome' : '/ui',
      'Set-Cookie': sessionCookie,
      'Cache-Control': 'no-store',
    },
  });
}
