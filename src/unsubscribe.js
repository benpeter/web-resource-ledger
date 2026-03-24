/*
 * unsubscribe.js -- One-click email unsubscribe token generation, verification,
 *                   and HTTP handlers.
 *
 * Token design:
 *   Payload: JSON { t: tenantId, c: eventType, v: 1 }
 *   HMAC input: "unsub.{base64url(payload)}" -- the "unsub." prefix prevents
 *     cross-use with session cookies signed with the same SESSION_SECRET.
 *   Token format: {base64url(payload)}.{base64url(hmac)}
 *   No expiry: CAN-SPAM / GDPR require unsubscribe links to work for at least
 *     30 days after sending; we omit expiry entirely for simplicity.
 *
 * Key reuse:
 *   The SESSION_SECRET is imported as an HMAC key, same as session.js.
 *   The "unsub." prefix in the HMAC input domain-separates these tokens from
 *   session cookies so they cannot be cross-used even with the same key.
 *
 * Security:
 *   - Verification uses crypto.subtle.verify (timing-safe).
 *   - eventType from decoded token is validated against NOTIFICATION_TYPES
 *     before any SQL is executed (prevents SQL injection via token forgery).
 *   - GET /unsubscribe renders a confirmation page; it does NOT auto-unsubscribe.
 *     Email security scanners pre-fetch GET URLs, so the actual unsubscribe
 *     requires a POST (RFC 8058 One-Click).
 *   - Both GET and POST return 200 for invalid tokens (no information leakage).
 *
 * Endpoints:
 *   GET  /v1/notifications/unsubscribe?token=...  (unauthenticated)
 *   POST /v1/notifications/unsubscribe?token=...  (unauthenticated)
 *
 * Rate-limited via AUTH_RATE_LIMITER (10 req/min per IP) in the main router.
 *
 * Tests: test/notifications.test.js
 */ // tva

import { escapeHtml } from './verify-page.js';
import { DESIGN_SYSTEM_CSS } from './design-system.js';
import { FAVICON_SVG } from './favicon.js';
import { unsubscribeNotificationType, NOTIFICATION_TYPES } from './db.js';
import { log } from './log.js';

const enc = new TextEncoder();

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

/**
 * Encode a Uint8Array to base64url without padding.
 *
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function toBase64url(bytes) {
  const b64 = btoa(Array.from(bytes, b => String.fromCharCode(b)).join(''));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Decode a base64url string to a Uint8Array.
 * Throws on invalid padding or characters.
 *
 * @param {string} str
 * @returns {Uint8Array}
 */
function fromBase64url(str) {
  // Re-pad the string so atob is happy
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = (4 - (padded.length % 4)) % 4;
  const b64 = padded + '='.repeat(pad);
  const bin = atob(b64);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

/**
 * Import SESSION_SECRET as an HMAC-SHA256 key.
 * Mirrors the importHmacKey function in session.js.
 *
 * @param {string} secretHex  Hex-encoded 32+ byte secret
 * @returns {Promise<CryptoKey>}
 */
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

/**
 * Generate an unsubscribe token for a given tenant and notification type.
 *
 * @param {string} sessionSecret  SESSION_SECRET hex string from env
 * @param {string} tenantId
 * @param {string} eventType  Must be in NOTIFICATION_TYPES
 * @returns {Promise<string>}  Token in "{payload}.{hmac}" base64url format
 */
export async function generateUnsubscribeToken(sessionSecret, tenantId, eventType) {
  const payload = JSON.stringify({ t: tenantId, c: eventType, v: 1 });
  const payloadB64 = toBase64url(enc.encode(payload));
  const hmacInput = `unsub.${payloadB64}`;

  const key = await importHmacKey(sessionSecret);
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(hmacInput));
  const hmacB64 = toBase64url(new Uint8Array(sigBuf));

  return `${payloadB64}.${hmacB64}`;
}

/**
 * Verify an unsubscribe token and return the decoded payload.
 *
 * Returns { ok: true, tenantId, eventType } on success.
 * Returns { ok: false, reason } on any failure (malformed, tampered, unknown type).
 * Never throws -- all errors are returned as { ok: false }.
 *
 * IMPORTANT: eventType is validated against NOTIFICATION_TYPES before being
 * returned, so callers can safely use it in SQL.
 *
 * @param {string} sessionSecret  SESSION_SECRET hex string from env
 * @param {string} token  Raw token string from the request
 * @returns {Promise<{ ok: true, tenantId: string, eventType: string } | { ok: false, reason: string }>}
 */
export async function verifyUnsubscribeToken(sessionSecret, token) {
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
    const hmacInput = `unsub.${payloadB64}`;
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
  const eventType = parsed.c;

  if (typeof tenantId !== 'string' || !tenantId) {
    return { ok: false, reason: 'invalid_payload_tenant' };
  }

  // Validate eventType against allowlist BEFORE it reaches any SQL
  if (!NOTIFICATION_TYPES.includes(eventType)) {
    return { ok: false, reason: 'unknown_event_type' };
  }

  return { ok: true, tenantId, eventType };
}

// ---------------------------------------------------------------------------
// HTML page helpers
// ---------------------------------------------------------------------------

/** Human-readable labels for each notification type. */
const NOTIFICATION_LABELS = {
  capture_failure:   'Capture failure alerts',
  approaching_limit: 'Approaching quota limit warnings',
  limit_reached:     'Quota limit reached alerts',
  invoice_generated: 'Invoice generated notifications',
  payment_failure:   'Payment failure alerts',
  weekly_digest:     'Weekly usage digest',
};

/**
 * Render the unsubscribe confirmation page (GET -- no action yet).
 *
 * @param {string} token  Raw token from query string
 * @param {{ valid: boolean, eventType?: string }} tokenState
 * @returns {string}  Full HTML document
 */
function renderConfirmPage(token, tokenState) {
  const safeToken = escapeHtml(token || '');
  const title = tokenState.valid
    ? `Unsubscribe from ${escapeHtml(NOTIFICATION_LABELS[tokenState.eventType] ?? tokenState.eventType)}`
    : 'Unsubscribe';

  const bodyContent = tokenState.valid
    ? `
      <div class="status-banner">
        <div>
          <p class="status-heading">Confirm unsubscribe</p>
          <p class="status-detail">You are about to unsubscribe from: <strong>${escapeHtml(NOTIFICATION_LABELS[tokenState.eventType] ?? tokenState.eventType)}</strong></p>
        </div>
      </div>
      <section>
        <p>Click the button below to confirm. You can re-subscribe at any time from your account settings.</p>
        <form method="POST" action="/v1/notifications/unsubscribe?token=${safeToken}" style="margin-top: var(--space-4);">
          <input type="hidden" name="List-Unsubscribe" value="One-Click">
          <button type="submit" class="btn btn-primary">Unsubscribe</button>
        </form>
      </section>`
    : `
      <div class="status-banner">
        <div>
          <p class="status-heading">Invalid or expired link</p>
          <p class="status-detail">This unsubscribe link is not valid. Please use the link from your original email.</p>
        </div>
      </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} - Web Resource Ledger</title>
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${encodeURIComponent(FAVICON_SVG)}">
<style>
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
</style>
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
 * Render the unsubscribe done page (POST response).
 *
 * @param {{ success: boolean, eventType?: string }} state
 * @returns {string}  Full HTML document
 */
function renderDonePage(state) {
  const bodyContent = state.success
    ? `
      <div class="status-banner">
        <div>
          <p class="status-heading">You have been unsubscribed</p>
          <p class="status-detail">You will no longer receive <strong>${escapeHtml(NOTIFICATION_LABELS[state.eventType] ?? state.eventType)}</strong> emails.</p>
        </div>
      </div>
      <section>
        <p>You can re-subscribe at any time from your account notification settings.</p>
      </section>`
    : `
      <div class="status-banner">
        <div>
          <p class="status-heading">Invalid or expired link</p>
          <p class="status-detail">This unsubscribe link is not valid. Please use the link from your original email.</p>
        </div>
      </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Unsubscribe - Web Resource Ledger</title>
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${encodeURIComponent(FAVICON_SVG)}">
<style>
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
</style>
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

// ---------------------------------------------------------------------------
// GET /v1/notifications/unsubscribe
// ---------------------------------------------------------------------------

/**
 * Render the unsubscribe confirmation page.
 * Does NOT auto-unsubscribe: email security scanners pre-fetch GET URLs,
 * so we only display a confirmation form that POSTs to complete the action.
 * Returns 200 for both valid and invalid tokens (no information leakage).
 *
 * @param {Request} request
 * @param {object} env
 * @param {ExecutionContext} _ctx  unused
 * @param {RegExpMatchArray} _match  unused
 * @returns {Promise<Response>}
 */
export async function handleGetUnsubscribe(request, env, _ctx, _match) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token') || '';

  let tokenState = { valid: false };

  if (token && env.SESSION_SECRET) {
    const result = await verifyUnsubscribeToken(env.SESSION_SECRET, token);
    if (result.ok) {
      tokenState = { valid: true, eventType: result.eventType };
    }
  }

  const html = renderConfirmPage(token, tokenState);
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html;charset=UTF-8', 'Cache-Control': 'no-store' },
  });
}

// ---------------------------------------------------------------------------
// POST /v1/notifications/unsubscribe
// ---------------------------------------------------------------------------

/**
 * Process the unsubscribe action.
 * Accepts application/x-www-form-urlencoded (RFC 8058 One-Click) or
 * token from the ?token= query parameter (form submission from GET page).
 * Returns 200 HTML for both valid and invalid tokens (no information leakage).
 * Idempotent: unsubscribing twice is a no-op.
 *
 * @param {Request} request
 * @param {object} env
 * @param {ExecutionContext} ctx
 * @param {RegExpMatchArray} _match  unused
 * @returns {Promise<Response>}
 */
export async function handlePostUnsubscribe(request, env, ctx, _match) {
  const url = new URL(request.url);

  // Token: prefer query parameter (form action includes it), fall back to body
  let token = url.searchParams.get('token') || '';

  if (!token) {
    // Try to read from body (RFC 8058 List-Unsubscribe=One-Click)
    try {
      const contentType = request.headers.get('Content-Type') || '';
      if (contentType.includes('application/x-www-form-urlencoded')) {
        const text = await request.text();
        const params = new URLSearchParams(text);
        token = params.get('token') || '';
      }
    } catch (err) {
      // Body parse failure: treat as invalid token (no leakage)
      ctx.waitUntil(log(env, 4, 'email', { event: 'email.unsubscribe_parse_error', error: err?.message }) ?? Promise.resolve());
    }
  }

  if (!token || !env.SESSION_SECRET) {
    const html = renderDonePage({ success: false });
    return new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html;charset=UTF-8', 'Cache-Control': 'no-store' },
    });
  }

  const result = await verifyUnsubscribeToken(env.SESSION_SECRET, token);

  if (!result.ok) {
    const html = renderDonePage({ success: false });
    return new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html;charset=UTF-8', 'Cache-Control': 'no-store' },
    });
  }

  const { tenantId, eventType } = result;

  // Update notification_preferences (idempotent)
  const dbResult = await unsubscribeNotificationType(env.DB, tenantId, eventType);

  if (!dbResult.ok) {
    // eventType was already validated in verifyUnsubscribeToken -- this path
    // should not be reached, but log it defensively rather than silently failing
    console.error('wrl:unsubscribe:db_error', { tenantId, eventType, error: dbResult.error });
    const html = renderDonePage({ success: false });
    return new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html;charset=UTF-8', 'Cache-Control': 'no-store' },
    });
  }

  // Log the unsubscribe event. Never log the email address.
  ctx.waitUntil(log(env, 3, 'email', {
    event: 'email.unsubscribe',
    tenantId,
    notificationType: eventType,
  }) ?? Promise.resolve());

  const html = renderDonePage({ success: true, eventType });
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html;charset=UTF-8', 'Cache-Control': 'no-store' },
  });
}
