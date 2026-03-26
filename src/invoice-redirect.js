/*
 * invoice-redirect.js -- HMAC-signed invoice redirect token generation,
 *                        verification, and HTTP handler.
 *
 * Token design:
 *   Payload: JSON { u: stripeInvoiceUrl, v: 1 }
 *   HMAC input: "inv.{base64url(payload)}" -- the "inv." prefix domain-separates
 *     these tokens from "unsub." (unsubscribe tokens) and "emailverify." tokens
 *     signed with the same SESSION_SECRET.
 *   Token format: {base64url(payload)}.{base64url(hmac)}
 *   No expiry: invoice URLs are long-lived (matches unsubscribe token design).
 *
 * Key reuse:
 *   Uses the same SESSION_SECRET as session.js, unsubscribe.js, and email-verify.js.
 *   The "inv." prefix domain-separates these tokens from all other token types.
 *
 * Security:
 *   - Verification uses crypto.subtle.verify (timing-safe).
 *   - After HMAC verification, decoded URL hostname is validated against an
 *     allowlist of known Stripe invoice domains (defense-in-depth).
 *   - GET /v1/billing/invoice returns 200 HTML for invalid tokens (no leakage).
 *   - The decoded Stripe URL is never logged (contains Stripe account identifiers).
 *   - URL construction uses new URL() for reliable hostname extraction (never string ops).
 *
 * Endpoint:
 *   GET /v1/billing/invoice?token=...  (unauthenticated)
 *
 * Rate-limited via AUTH_RATE_LIMITER (10 req/min per IP) in the main router.
 *
 * Tests: test/invoice-redirect.test.js
 */ // tva

import { escapeHtml } from './verify-page.js';
import { DESIGN_SYSTEM_CSS } from './design-system.js';
import { FAVICON_SVG } from './favicon.js';
import { log } from './log.js';

const enc = new TextEncoder();

// Allowlist of domains that invoice redirect tokens may contain.
// Only invoice.stripe.com is permitted -- nothing else.
const STRIPE_INVOICE_DOMAINS = new Set(['invoice.stripe.com']);

// ---------------------------------------------------------------------------
// Token helpers (duplicated from unsubscribe.js for simplicity -- all token
// modules are self-contained and the duplication is intentional)
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
 * Generate a signed invoice redirect URL for a given Stripe invoice URL.
 *
 * @param {string} sessionSecret  SESSION_SECRET hex string from env
 * @param {string} stripeInvoiceUrl  The hosted_invoice_url from Stripe
 * @param {string} baseUrl  Worker base URL (e.g. https://api.webresourceledger.com)
 * @returns {Promise<string>}  Full redirect URL: {baseUrl}/v1/billing/invoice?token={token}
 */
export async function generateInvoiceRedirectUrl(sessionSecret, stripeInvoiceUrl, baseUrl) {
  const payload = JSON.stringify({ u: stripeInvoiceUrl, v: 1 });
  const payloadB64 = toBase64url(enc.encode(payload));
  const hmacInput = `inv.${payloadB64}`;

  const key = await importHmacKey(sessionSecret);
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(hmacInput));
  const hmacB64 = toBase64url(new Uint8Array(sigBuf));

  const token = `${payloadB64}.${hmacB64}`;
  return `${baseUrl}/v1/billing/invoice?token=${token}`;
}

/**
 * Verify an invoice redirect token and return the decoded Stripe URL.
 *
 * Returns { ok: true, url: stripeInvoiceUrl } on success.
 * Returns { ok: false, reason } on any failure (malformed, tampered, wrong domain).
 * Never throws -- all errors are returned as { ok: false }.
 *
 * @param {string} sessionSecret  SESSION_SECRET hex string from env
 * @param {string} token  Raw token string from the request
 * @returns {Promise<{ ok: true, url: string } | { ok: false, reason: string }>}
 */
export async function verifyInvoiceRedirectToken(sessionSecret, token) {
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
    const hmacInput = `inv.${payloadB64}`;
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

  const stripeUrl = parsed.u;

  if (typeof stripeUrl !== 'string' || !stripeUrl) {
    return { ok: false, reason: 'invalid_payload_url' };
  }

  // Validate decoded URL hostname against allowlist.
  // Defense-in-depth: HMAC is the primary control, this prevents a key compromise
  // from being used to redirect to arbitrary destinations.
  // Wrap new URL() in try/catch to satisfy the never-throws contract.
  let hostname;
  try {
    hostname = new URL(stripeUrl).hostname;
  } catch {
    return { ok: false, reason: 'invalid_url' };
  }

  if (!STRIPE_INVOICE_DOMAINS.has(hostname)) {
    return { ok: false, reason: 'invalid_domain' };
  }

  return { ok: true, url: stripeUrl };
}

// ---------------------------------------------------------------------------
// HTML error page
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
a { color: var(--color-primary); }
`;

/**
 * Render the invoice redirect error page for invalid/missing tokens.
 *
 * @returns {string}  Full HTML document
 */
function renderErrorPage() {
  const bodyContent = `
      <div class="status-banner">
        <div>
          <p class="status-heading">Invalid or expired link</p>
          <p class="status-detail">This invoice link is not valid. You can view your invoices from your account dashboard.</p>
        </div>
      </div>
      <section>
        <p><a href="/ui#billing">Go to your account dashboard</a></p>
      </section>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Invoice Link - Web Resource Ledger</title>
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

// ---------------------------------------------------------------------------
// GET /v1/billing/invoice
// ---------------------------------------------------------------------------

/**
 * Handle an invoice redirect request.
 *
 * Valid token: 302 redirect to the Stripe invoice URL with no-store and
 *   no-referrer headers to avoid leaking the Stripe URL via the Referer header.
 * Invalid/missing token: 200 HTML error page (no information leakage).
 * Never logs the decoded Stripe URL.
 *
 * @param {Request} request
 * @param {object} env
 * @param {ExecutionContext} ctx
 * @param {RegExpMatchArray} _match  unused
 * @returns {Promise<Response>}
 */
export async function handleBillingInvoiceRedirect(request, env, ctx, _match) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token') || '';

  if (!token || !env.SESSION_SECRET) {
    const html = renderErrorPage();
    ctx.waitUntil(log(env, 3, 'billing', {
      event: 'billing.invoice_redirect_invalid',
      reason: token ? 'no_session_secret' : 'missing_token',
      responseStatus: 200,
    }) ?? Promise.resolve());
    return new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html;charset=UTF-8', 'Cache-Control': 'no-store' },
    });
  }

  const result = await verifyInvoiceRedirectToken(env.SESSION_SECRET, token);

  if (!result.ok) {
    const html = renderErrorPage();
    ctx.waitUntil(log(env, 3, 'billing', {
      event: 'billing.invoice_redirect_invalid',
      reason: result.reason,
      responseStatus: 200,
    }) ?? Promise.resolve());
    return new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html;charset=UTF-8', 'Cache-Control': 'no-store' },
    });
  }

  // Success: redirect to verified Stripe URL.
  // Never log result.url -- it contains Stripe account identifiers.
  ctx.waitUntil(log(env, 3, 'billing', {
    event: 'billing.invoice_redirect',
    responseStatus: 302,
  }) ?? Promise.resolve());

  return new Response(null, {
    status: 302,
    headers: {
      'Location': result.url,
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
