/*
 * email-verify.js -- Email address verification token generation, verification,
 *                    and HTTP handlers.
 *
 * Token design:
 *   Payload: JSON { t: tenantId, e: pendingEmail, ts: Math.floor(Date.now()/1000), v: 1 }
 *   HMAC input: "emailverify.{base64url(payload)}" -- domain-separated from
 *     "unsub." (unsubscribe tokens) and session cookies signed with the same key.
 *   Token format: {base64url(payload)}.{base64url(hmac)}
 *   Expiry: 24 hours from issuance (enforced in verify function).
 *
 * Key reuse:
 *   Uses the same SESSION_SECRET as session.js and unsubscribe.js.
 *   The "emailverify." prefix domain-separates these tokens from both
 *   session cookies and unsubscribe tokens.
 *
 * Security:
 *   - Verification uses crypto.subtle.verify (timing-safe).
 *   - GET /verify-email renders a confirmation page; it does NOT auto-verify.
 *     Email security scanners pre-fetch GET URLs -- the actual verification
 *     requires a POST (same pattern as unsubscribe.js).
 *   - Both GET and POST return 200 for invalid/expired tokens (no leakage).
 *   - The POST handler cross-checks result.email against the DB pending_email
 *     before swapping -- prevents replaying a stale token after a second change.
 *   - Email addresses are never logged.
 *
 * Endpoints:
 *   GET  /v1/notifications/verify-email?token=...  (unauthenticated)
 *   POST /v1/notifications/verify-email?token=...  (unauthenticated)
 *
 * Rate-limited via AUTH_RATE_LIMITER (same group as /auth/* and /unsubscribe).
 *
 * Tests: test/email-verify.test.js
 */ // tva

import { escapeHtml } from './verify-page.js';
import { DESIGN_SYSTEM_CSS } from './design-system.js';
import { FAVICON_SVG } from './favicon.js';
import { getNotificationPreferences, swapVerifiedEmail } from './db.js';
import { log } from './log.js';

const enc = new TextEncoder();

// ---------------------------------------------------------------------------
// Token helpers (duplicated from unsubscribe.js for simplicity -- both modules
// are self-contained and the duplication is intentional)
// ---------------------------------------------------------------------------

function toBase64url(bytes) {
  const b64 = btoa(Array.from(bytes, b => String.fromCharCode(b)).join(''));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function fromBase64url(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = (4 - (padded.length % 4)) % 4;
  const b64 = padded + '='.repeat(pad);
  const bin = atob(b64);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

async function importHmacKey(secretHex) {
  const bytes = new Uint8Array(secretHex.match(/.{2}/g).map(h => parseInt(h, 16)));
  return crypto.subtle.importKey(
    'raw',
    bytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

// ---------------------------------------------------------------------------
// Token API
// ---------------------------------------------------------------------------

/**
 * Generate an email verification token for a given tenant and pending email.
 *
 * @param {string} sessionSecret  SESSION_SECRET hex string from env
 * @param {string} tenantId
 * @param {string} email  The pending email address to verify
 * @returns {Promise<string>}  Token in "{payload}.{hmac}" base64url format
 */
export async function generateEmailVerifyToken(sessionSecret, tenantId, email) {
  const payload = JSON.stringify({
    t: tenantId,
    e: email,
    ts: Math.floor(Date.now() / 1000),
    v: 1,
  });
  const payloadB64 = toBase64url(enc.encode(payload));
  const hmacInput = `emailverify.${payloadB64}`;

  const key = await importHmacKey(sessionSecret);
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(hmacInput));
  const hmacB64 = toBase64url(new Uint8Array(sigBuf));

  return `${payloadB64}.${hmacB64}`;
}

/**
 * Verify an email verification token and return the decoded payload.
 *
 * Returns { ok: true, tenantId, email } on success.
 * Returns { ok: false, reason } on any failure (malformed, tampered, expired).
 * Never throws -- all errors are returned as { ok: false }.
 *
 * @param {string} sessionSecret  SESSION_SECRET hex string from env
 * @param {string} token  Raw token string from the request
 * @returns {Promise<{ ok: true, tenantId: string, email: string } | { ok: false, reason: string }>}
 */
export async function verifyEmailVerifyToken(sessionSecret, token) {
  if (!token || typeof token !== 'string') {
    return { ok: false, reason: 'missing_token' };
  }

  const dotIndex = token.lastIndexOf('.');
  if (dotIndex === -1) {
    return { ok: false, reason: 'malformed_token' };
  }

  const payloadB64 = token.slice(0, dotIndex);
  const hmacB64 = token.slice(dotIndex + 1);

  if (!payloadB64 || !hmacB64) {
    return { ok: false, reason: 'malformed_token' };
  }

  // Verify HMAC (timing-safe)
  let signatureValid;
  try {
    const hmacInput = `emailverify.${payloadB64}`;
    const key = await importHmacKey(sessionSecret);
    const receivedBytes = fromBase64url(hmacB64);
    signatureValid = await crypto.subtle.verify('HMAC', key, receivedBytes, enc.encode(hmacInput));
  } catch {
    return { ok: false, reason: 'signature_error' };
  }

  if (!signatureValid) {
    return { ok: false, reason: 'invalid_signature' };
  }

  // Decode payload
  let parsed;
  try {
    const payloadBytes = fromBase64url(payloadB64);
    const payloadStr = new TextDecoder().decode(payloadBytes);
    parsed = JSON.parse(payloadStr);
  } catch {
    return { ok: false, reason: 'malformed_payload' };
  }

  if (!parsed || typeof parsed !== 'object' || parsed.v !== 1) {
    return { ok: false, reason: 'invalid_payload_version' };
  }

  const tenantId = parsed.t;
  const email = parsed.e;
  const ts = parsed.ts;

  if (typeof tenantId !== 'string' || !tenantId) {
    return { ok: false, reason: 'invalid_payload_tenant' };
  }

  if (typeof email !== 'string' || !email) {
    return { ok: false, reason: 'invalid_payload_email' };
  }

  if (typeof ts !== 'number' || !isFinite(ts)) {
    return { ok: false, reason: 'invalid_payload_ts' };
  }

  // Check expiry: 24 hours
  if (Math.floor(Date.now() / 1000) - ts > 86400) {
    return { ok: false, reason: 'token_expired' };
  }

  return { ok: true, tenantId, email };
}

// ---------------------------------------------------------------------------
// HTML page helpers
// ---------------------------------------------------------------------------

const PAGE_CSS = `
${DESIGN_SYSTEM_CSS}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: var(--font-sans);
  font-size: var(--text-md);
  line-height: var(--leading-normal);
  color: var(--color-text);
  background: var(--color-bg);
  padding: var(--space-6) var(--space-4);
}
.page-wrap { max-width: 560px; margin: 0 auto; }
header { margin-bottom: var(--space-8); }
.wordmark {
  font-size: var(--text-md);
  font-weight: var(--weight-medium);
  color: var(--color-primary);
  letter-spacing: 0.01em;
}
main { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); overflow: hidden; }
.status-banner { padding: var(--space-6) var(--space-8); background: var(--color-surface-muted); }
.status-heading { font-size: var(--text-xl); font-weight: var(--weight-bold); margin-bottom: var(--space-2); }
.status-detail { color: var(--color-text-muted); }
section { padding: var(--space-6) var(--space-8); border-top: 1px solid var(--color-border-subtle); }
.btn { display: inline-block; padding: var(--space-2) var(--space-6); border: none; border-radius: var(--radius-md); cursor: pointer; font-size: var(--text-md); font-family: inherit; }
.btn-primary { background: var(--color-primary); color: var(--color-primary-text); }
.btn-primary:hover { background: var(--color-primary-hover); }
`;

/**
 * Render the full page shell.
 *
 * @param {string} title  Page title (will be escaped)
 * @param {string} bodyContent  Inner HTML for <main>
 * @returns {string}
 */
function renderPage(title, bodyContent) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} - Web Resource Ledger</title>
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${encodeURIComponent(FAVICON_SVG)}">
<style>${PAGE_CSS}</style>
</head>
<body>
<div class="page-wrap">
  <header>
    <span class="wordmark">Web Resource Ledger</span>
  </header>
  <main>${bodyContent}
  </main>
</div>
</body>
</html>`;
}

/**
 * Render the verify email confirmation page (GET -- no action yet).
 *
 * @param {string} token  Raw token from query string (for the form action)
 * @param {{ valid: boolean, email?: string }} tokenState
 * @returns {string}
 */
function renderConfirmPage(token, tokenState) {
  // encodeURIComponent for URL context, then escapeHtml for HTML attribute safety
  const safeToken = escapeHtml(encodeURIComponent(token || ''));

  if (!tokenState.valid) {
    const bodyContent = `
      <div class="status-banner">
        <div>
          <p class="status-heading">Invalid or expired link</p>
          <p class="status-detail">This verification link is invalid or has expired. Please request a new verification email from your account settings.</p>
        </div>
      </div>`;
    return renderPage('Verify Email', bodyContent);
  }

  const bodyContent = `
      <div class="status-banner">
        <div>
          <p class="status-heading">Confirm email address</p>
          <p class="status-detail">Verify <strong>${escapeHtml(tokenState.email)}</strong> as your notification email address.</p>
        </div>
      </div>
      <section>
        <p>Click the button below to confirm. Your previous email will remain active for notifications until verification is complete.</p>
        <form method="POST" action="/v1/notifications/verify-email?token=${safeToken}" style="margin-top: var(--space-4);">
          <button type="submit" class="btn btn-primary">Verify Email Address</button>
        </form>
      </section>`;
  return renderPage('Verify Email', bodyContent);
}

/**
 * Render the verify email done page (POST response).
 *
 * @param {{ success: boolean }} state
 * @returns {string}
 */
function renderDonePage(state) {
  const bodyContent = state.success
    ? `
      <div class="status-banner">
        <div>
          <p class="status-heading">Email address verified</p>
          <p class="status-detail">Your notification email address has been confirmed.</p>
        </div>
      </div>
      <section>
        <p>You will now receive notifications at your new address. You can manage your notification settings from your account at any time.</p>
      </section>`
    : `
      <div class="status-banner">
        <div>
          <p class="status-heading">Verification failed</p>
          <p class="status-detail">This verification link is invalid or has expired. Please request a new verification email from your account settings.</p>
        </div>
      </div>`;

  return renderPage('Verify Email', bodyContent);
}

// ---------------------------------------------------------------------------
// GET /v1/notifications/verify-email
// ---------------------------------------------------------------------------

/**
 * Render the email verification confirmation page.
 * Does NOT auto-verify: email security scanners pre-fetch GET URLs.
 * Returns 200 for both valid and invalid tokens (no information leakage).
 *
 * @param {Request} request
 * @param {object} env
 * @param {ExecutionContext} _ctx  unused
 * @param {RegExpMatchArray} _match  unused
 * @returns {Promise<Response>}
 */
export async function handleGetVerifyEmail(request, env, _ctx, _match) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token') || '';

  let tokenState = { valid: false };

  if (token && env.SESSION_SECRET) {
    const result = await verifyEmailVerifyToken(env.SESSION_SECRET, token);
    if (result.ok) {
      tokenState = { valid: true, email: result.email };
    }
  }

  const html = renderConfirmPage(token, tokenState);
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html;charset=UTF-8', 'Cache-Control': 'no-store' },
  });
}

// ---------------------------------------------------------------------------
// POST /v1/notifications/verify-email
// ---------------------------------------------------------------------------

/**
 * Process the email verification action.
 * Accepts token from ?token= query parameter (form submission from GET page)
 * or application/x-www-form-urlencoded body.
 * Returns 200 HTML for both valid and invalid tokens (no information leakage).
 *
 * Security: cross-checks token email against DB pending_email before swapping
 * to prevent replaying a stale token after the user changed the address again.
 *
 * @param {Request} request
 * @param {object} env
 * @param {ExecutionContext} ctx
 * @param {RegExpMatchArray} _match  unused
 * @returns {Promise<Response>}
 */
export async function handlePostVerifyEmail(request, env, ctx, _match) {
  const url = new URL(request.url);

  // Token: prefer query parameter (form action includes it), fall back to body
  let token = url.searchParams.get('token') || '';

  if (!token) {
    try {
      const contentType = request.headers.get('Content-Type') || '';
      if (contentType.includes('application/x-www-form-urlencoded')) {
        const text = await request.text();
        const params = new URLSearchParams(text);
        token = params.get('token') || '';
      }
    } catch (err) {
      ctx.waitUntil(log(env, 4, 'email', { event: 'email.verify_fail', reason: 'body_parse_error', error: err?.message }) ?? Promise.resolve());
    }
  }

  if (!token || !env.SESSION_SECRET) {
    const html = renderDonePage({ success: false });
    return new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html;charset=UTF-8', 'Cache-Control': 'no-store' },
    });
  }

  const result = await verifyEmailVerifyToken(env.SESSION_SECRET, token);

  if (!result.ok) {
    ctx.waitUntil(log(env, 4, 'email', {
      event: 'email.verify_fail',
      reason: result.reason,
    }) ?? Promise.resolve());
    const html = renderDonePage({ success: false });
    return new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html;charset=UTF-8', 'Cache-Control': 'no-store' },
    });
  }

  const { tenantId, email } = result;

  // Cross-check: token email must match what is currently pending in the DB.
  // This prevents replaying an old token after the user changed their address again.
  let prefs;
  try {
    prefs = await getNotificationPreferences(env.DB, tenantId);
  } catch (err) {
    ctx.waitUntil(log(env, 4, 'email', {
      event: 'email.verify_fail',
      tenantId,
      reason: 'db_read_error',
    }) ?? Promise.resolve());
    const html = renderDonePage({ success: false });
    return new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html;charset=UTF-8', 'Cache-Control': 'no-store' },
    });
  }

  if (!prefs || prefs.pendingEmail !== email) {
    ctx.waitUntil(log(env, 4, 'email', {
      event: 'email.verify_fail',
      tenantId,
      reason: 'pending_email_mismatch',
    }) ?? Promise.resolve());
    const html = renderDonePage({ success: false });
    return new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html;charset=UTF-8', 'Cache-Control': 'no-store' },
    });
  }

  // Atomically promote pending_email -> email, email_verified = 1
  const swapResult = await swapVerifiedEmail(env.DB, tenantId, email);

  if (!swapResult.ok) {
    ctx.waitUntil(log(env, 4, 'email', {
      event: 'email.verify_fail',
      tenantId,
      reason: 'swap_failed',
    }) ?? Promise.resolve());
    const html = renderDonePage({ success: false });
    return new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html;charset=UTF-8', 'Cache-Control': 'no-store' },
    });
  }

  ctx.waitUntil(log(env, 3, 'email', {
    event: 'email.verify_success',
    tenantId,
  }) ?? Promise.resolve());

  const html = renderDonePage({ success: true });
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html;charset=UTF-8', 'Cache-Control': 'no-store' },
  });
}
