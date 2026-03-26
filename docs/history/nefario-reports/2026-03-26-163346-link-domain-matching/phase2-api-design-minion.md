# API Design Contribution: Invoice Redirect Endpoint

## Recommendation: `GET /v1/billing/invoice?token=...`

### Route Design Decision

**Chosen approach:** (a) `GET /v1/billing/invoice?token={hmac_token}` with the Stripe invoice URL encoded inside the HMAC-signed token payload.

**Why this route, not the others:**

| Option | Verdict | Rationale |
|--------|---------|-----------|
| `GET /v1/billing/invoice?token=...` | **Selected** | Fits `/v1/billing/` convention. Token-in-query matches existing unsubscribe/verify-email patterns. No KV storage needed. |
| `GET /v1/billing/invoice/:token` | Rejected | Path segments for opaque tokens are unconventional in this codebase. All existing token-based routes use `?token=` query parameter (unsubscribe, verify-email). Consistency matters more than aesthetics. |
| `GET /invoice/:id` as vanity path | Rejected | Breaks the `/v1/` prefix convention every other route follows. The codebase has zero routes outside `/v1/`, `/auth/`, `/.well-known/`, `/ui`, `/admin`, `/health`, and `/favicon.ico`. Adding a new top-level namespace for a single redirect is unjustified. |
| Signed URL with Stripe URL in path | Rejected | Stripe invoice URLs are long (~120+ chars) and contain path segments with slashes. Encoding them in the path creates ugly, fragile URLs. Base64-encoding them inflates length further. Token-in-query is cleaner. |

### Token Design: Self-Contained HMAC (No KV Storage)

**Encode the Stripe invoice URL inside the token payload**, signed with HMAC-SHA256, following the exact same pattern as `unsubscribe.js`.

Payload structure:
```json
{ "u": "https://invoice.stripe.com/i/acct_xxx/xxx", "v": 1 }
```

Fields:
- `u`: The target Stripe `hosted_invoice_url` (full URL)
- `v`: Version number for future schema changes (matches unsubscribe token convention)

Token format: `{base64url(JSON payload)}.{base64url(hmac)}`

HMAC domain prefix: `"inv."` -- prevents cross-use with `"unsub."` tokens and session cookies, all of which share the same `SESSION_SECRET` key.

**Why self-contained over KV-stored:**

1. **Zero operational overhead.** No KV writes at invoice-finalized time, no TTL management, no garbage collection. The token is generated at email-send time and is valid forever (same as unsubscribe tokens).
2. **No storage cost.** Invoice URLs are ~150 chars. Base64 + HMAC adds ~90 chars. Total token is ~300 chars -- well within URL length limits and email-client-safe.
3. **No KV lookup latency on redirect.** The redirect handler just verifies the HMAC and extracts the URL. Sub-millisecond.
4. **Matches existing architecture.** Unsubscribe tokens use the same pattern. No new storage dependencies.
5. **Simplifies the webhook handler.** `handleInvoiceFinalized` already has the `hosted_invoice_url`. It passes it to the template data. The email template generates the signed redirect URL at render time. No async KV writes needed in the webhook path.

**Why not add expiry?** Stripe hosted invoice URLs themselves are long-lived (they remain accessible as long as the invoice exists in Stripe). Adding expiry to the redirect token would create a failure mode where the redirect breaks but the underlying invoice URL still works -- confusing for the user. If Stripe revokes/changes the URL, the redirect simply lands on a Stripe error page, which is the correct behavior.

### Redirect Semantics

**Use 302 Found, not 301.**

- **301 Moved Permanently** tells browsers and proxies to cache the redirect permanently and never check the original URL again. This is wrong for several reasons:
  - If a token is ever compromised, you cannot invalidate it -- browsers will follow the cached redirect forever.
  - Stripe `hosted_invoice_url` values could theoretically change (Stripe doesn't guarantee URL stability).
  - Search engines index 301 targets -- you don't want Stripe invoice URLs appearing in search results associated with your domain.
  - Each token maps to a different invoice; caching the redirect for one request serves the wrong invoice for subsequent requests with different tokens (browsers cache by full URL including query string, so this is theoretical, but 301 signals the wrong intent).

- **302 Found** is correct because:
  - The redirect is temporary by nature -- the resource (the invoice) lives at Stripe, not at WRL.
  - Browsers will always re-check the WRL URL, allowing future changes to redirect behavior.
  - Matches the semantic: "the invoice can be found at this other URL right now."

### Cache Headers

```
Cache-Control: private, no-store
```

- `private`: Prevents CDN/proxy caching of the redirect response. Cloudflare should not cache this.
- `no-store`: Prevents browser caching entirely. Each click should hit the Worker.

This matches the `BILLING_CACHE` constant already used by `handleBillingCheckout` and `handleBillingPortal`.

Additionally, set `Location: {stripe_invoice_url}` as the redirect target header.

### Error Responses for Invalid/Expired Tokens

**For a redirect endpoint clicked from emails, the error response should be HTML, not JSON.**

Users clicking email links expect a web page, not a `application/problem+json` response. Follow the unsubscribe pattern: return a 200 HTML page with a human-readable error message.

**Return 200 for all token states** (valid or invalid). Rationale:
- Matches the unsubscribe/verify-email pattern in this codebase (both return 200 for invalid tokens).
- Prevents information leakage (a 404 vs 200 distinction reveals whether a token format is valid).
- Email security scanners may flag non-2xx responses.

**Error page content:**

For invalid/tampered/malformed tokens, render an HTML page with:
- WRL branding (same header/wordmark as unsubscribe pages)
- Heading: "Invalid or expired link"
- Body: "This invoice link is not valid. You can view your invoices from the billing portal in your dashboard."
- Link to `/ui#billing` as a fallback action

This reuses the same HTML shell pattern from `unsubscribe.js` (`renderConfirmPage` / `renderDonePage`).

### Redirect Target Validation

**Critical: validate the extracted URL before redirecting to prevent open redirect.**

Even though the HMAC prevents token tampering, defense-in-depth requires validating the redirect target:

```javascript
const targetUrl = new URL(decoded.u);
if (targetUrl.hostname !== 'invoice.stripe.com') {
  // Return error page -- do not redirect
}
```

Allowlist: `invoice.stripe.com` only. If Stripe changes their invoice URL domain in the future, this is a single-line change.

This prevents a theoretical attack where a valid token is constructed (e.g., if SESSION_SECRET leaks) pointing to a phishing URL.

### Rate Limiting

Add the new route to the `'auth'` rate limit group in `getRateLimitGroup()`:

```javascript
if (pathname.startsWith('/v1/billing/invoice')) return 'auth';
```

This applies the AUTH_RATE_LIMITER (20 req/60s per IP), consistent with other unauthenticated token-based endpoints (unsubscribe, verify-email).

**Why `'auth'` group, not `'account'`?** The `'account'` group gates session-authenticated routes. This endpoint is unauthenticated (clicked from email). It matches the same trust model as unsubscribe and verify-email, which both use `'auth'`.

### Authentication

**None.** This endpoint is unauthenticated -- it is clicked from an email by a user who may not be logged in. The HMAC token is the sole authorization mechanism.

The route must be placed in the route table BEFORE the session auth gate for `/v1/billing/` routes. Currently, the `isAccountRoute` check at line 575 of `index.js` matches `pathname.startsWith('/v1/billing/')`, which would require session auth. Two approaches:

**Option A (recommended):** Add the route to the existing unauthenticated route exemptions, alongside unsubscribe/verify-email. Add an explicit check:
```javascript
const isInvoiceRedirect = pathname.startsWith('/v1/billing/invoice');
```
And exempt it from the session gate:
```javascript
const isAccountRoute = (pathname.startsWith('/v1/account/') || pathname.startsWith('/v1/billing/'))
  && !isInvoiceRedirect;
```

**Option B:** Move the route outside `/v1/billing/` (e.g., `/v1/invoices/redirect`). This avoids the auth gate conflict but breaks the resource grouping convention. Not recommended.

### Route Registration

Add to the routes array in `src/index.js`, positioned with the other billing routes:

```javascript
// Unauthenticated invoice redirect (rate-limited via AUTH_RATE_LIMITER in fetch handler)
['GET', /^\/v1\/billing\/invoice$/, handleBillingInvoiceRedirect],
```

Place it BEFORE the existing billing routes (lines 130-131) so the comment grouping is clear. Add it to the "Unauthenticated" section comment.

### Token Generation Integration

In `handleInvoiceFinalized` (billing.js, line 376), the `portalUrl` passed to the template currently is:
```javascript
portalUrl: invoice?.hosted_invoice_url || `${baseUrl}/ui#billing`,
```

This should change to generate a signed redirect URL instead:
```javascript
const invoiceRedirectUrl = invoice?.hosted_invoice_url
  ? await generateInvoiceRedirectToken(env.SESSION_SECRET, invoice.hosted_invoice_url, baseUrl)
  : `${baseUrl}/ui#billing`;
```

Where `generateInvoiceRedirectToken` returns the full redirect URL:
```
https://api.webresourceledger.com/v1/billing/invoice?token={signed_token}
```

The template itself (`invoice-generated.js`) does not need to change -- it already receives a URL and renders it as a link. The variable name `portalUrl` becomes slightly misleading but renaming it is optional and a separate concern.

### Payment Failure Template

The `payment-failure.js` template also receives a `portalUrl`. However, looking at `handleInvoicePaymentFailed` (billing.js, line 423):
```javascript
portalUrl: `${paymentBaseUrl}/ui#billing`,
```

This points to the WRL dashboard, not to a Stripe invoice. This is correct -- the payment failure CTA should take the user to their billing settings to update their payment method, not to a specific invoice. **No change needed for payment-failure emails.**

### operationId Convention

For SDK generation / spec consistency, the operationId should be:

```
redirectBillingInvoice
```

Following the pattern: `{action}{Resource}` where action is `redirect`, resource is `BillingInvoice`. This is a non-standard action (not list/get/create/update/delete) but `redirect` accurately describes the endpoint's purpose.

### Handler Module Location

Implement `handleBillingInvoiceRedirect` in `src/billing.js` alongside the other billing handlers. The token generation function (`generateInvoiceRedirectUrl`) should live in `src/unsubscribe.js` or a new `src/email/invoice-redirect.js`. Given that the token pattern is identical to unsubscribe tokens (same crypto, same key, different domain prefix), co-locating the token functions in `src/unsubscribe.js` is pragmatic but muddies the module name.

**Recommendation:** Create a small `src/invoice-redirect.js` module with:
- `generateInvoiceRedirectUrl(sessionSecret, stripeInvoiceUrl, baseUrl)` -- generates the full redirect URL
- `verifyInvoiceRedirectToken(sessionSecret, token)` -- verifies and extracts the Stripe URL
- `handleBillingInvoiceRedirect(request, env, ctx, match)` -- the HTTP handler

This keeps billing redirect logic self-contained and follows the same module pattern as `unsubscribe.js`.

### Logging

Log redirect events for observability:

```javascript
// Success
{ event: 'billing.invoice_redirect', tenantId: null, responseStatus: 302 }

// Invalid token
{ event: 'billing.invoice_redirect_invalid', reason: result.reason, responseStatus: 200 }
```

Note: `tenantId` is not available from the token payload (the payload contains only the URL, not the tenant). If tenant attribution is needed for analytics, add `t: tenantId` to the token payload. This is optional -- the redirect is a pass-through; Stripe tracks invoice views on their side.

**Revised recommendation:** Include tenantId in the token payload for audit logging:
```json
{ "u": "https://invoice.stripe.com/i/acct_xxx/xxx", "t": "tenant_abc", "v": 1 }
```

### Security Summary

| Concern | Mitigation |
|---------|-----------|
| Open redirect | Allowlist: `invoice.stripe.com` hostname only |
| Token forgery | HMAC-SHA256 with SESSION_SECRET, domain-prefixed `"inv."` |
| Token cross-use | Domain prefix `"inv."` prevents using unsubscribe or session tokens |
| Information leakage | 200 response for all token states |
| Brute force | AUTH_RATE_LIMITER: 20 req/60s per IP |
| SSRF | Not applicable -- redirect is client-side (302), not server-side fetch |
| Timing attacks | `crypto.subtle.verify` is timing-safe |

### Risks and Dependencies

1. **Token length in emails.** The base64url-encoded payload for a ~150-char Stripe URL will produce a token of ~300 chars. The full redirect URL will be ~360 chars. This is well within email client URL limits (most support 2000+ chars) but should be verified in the email template rendering tests.

2. **SESSION_SECRET rotation.** If `SESSION_SECRET` is rotated, all outstanding invoice redirect tokens become invalid. This is the same risk as unsubscribe tokens and is accepted (the user can still access invoices via the dashboard). Document this in the key rotation runbook.

3. **Stripe URL format changes.** The hostname allowlist (`invoice.stripe.com`) is a single point of brittleness. If Stripe changes their invoice URL format, the redirect will start returning error pages. Monitor for this by logging redirect failures at severity 4.

4. **Email template variable name.** The `portalUrl` variable name in the invoice-generated template becomes misleading when it points to a redirect URL rather than the Stripe portal. Consider renaming to `invoiceUrl` for clarity, but this is a cosmetic change that can be deferred.

### Implementation Checklist

1. Create `src/invoice-redirect.js` with token generation, verification, and handler
2. Add route to `src/index.js` route table
3. Add rate limit group mapping in `getRateLimitGroup()`
4. Exempt `/v1/billing/invoice` from session auth gate
5. Update `handleInvoiceFinalized` in `src/billing.js` to generate redirect URL
6. Add tests for: valid token redirect, invalid token error page, tampered token, wrong domain in payload, rate limiting
7. Verify token length in email rendering tests
