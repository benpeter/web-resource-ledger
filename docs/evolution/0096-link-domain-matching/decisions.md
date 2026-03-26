# Decisions -- 0096 Link Domain Matching

## Problem

Resend flagged "Ensure link URLs match sending domain" because the
`invoice_generated` email template included a raw `hosted_invoice_url`
from Stripe (`https://invoice.stripe.com/...`). This domain mismatch
can trigger spam filters and reduce email deliverability.

Only 1 of 7 email templates had this problem -- the rest use only
WRL-domain links.

## Design Decisions

### HMAC-signed redirect vs simple proxy

**Chosen: HMAC-signed redirect token**

The redirect URL contains an HMAC-signed token that encodes the target
Stripe URL. This prevents the endpoint from being used as an open
redirector -- only URLs signed by the server are accepted.

Alternative considered: a simple `/redirect?url=` proxy. Rejected because
open redirectors are a well-known phishing vector (CWE-601). The HMAC
approach matches the existing patterns in `unsubscribe.js` and
`email-verify.js`.

### Domain prefix: "inv." over "redir."

**Chosen: `"inv."` prefix**

security-minion recommended `"redir."` for future generality.
api-design-minion recommended `"inv."` for specificity.

Went with `"inv."` -- YAGNI. This token is exclusively for invoice
redirects. The codebase uses per-purpose prefixes (`"unsub."`,
`"emailverify."`), not generic ones. Tighter domain separation also
means a vulnerability in one redirect path can't be exploited through
another.

### Route: `/v1/billing/invoice?token=` over `/r/:token`

**Chosen: `GET /v1/billing/invoice?token=...`**

Consistency with existing patterns. Every unauthenticated token endpoint
uses `?token=` query parameters under `/v1/`. The URL length difference
(~20 chars) is negligible against the ~300-char token.

### Stripe domain allowlist: `invoice.stripe.com` only

**Chosen: Single-domain allowlist**

security-minion recommended 4 Stripe subdomains. Only
`invoice.stripe.com` is actually used by `hosted_invoice_url`. Adding
unused domains widens the attack surface for no benefit. Single-line
change if Stripe changes the domain.

### Error response: 200 HTML over 302 fallback

**Chosen: 200 HTML error page**

Matches the established pattern from `handleGetUnsubscribe` and
`handleGetVerifyEmail`. Using 200 for both valid and invalid tokens
prevents information leakage and handles email security scanners
gracefully. The error page includes a fallback link to `/ui#billing`.

### Token payload: URL-only, no tenantId

**Chosen: `{ u: stripeUrl, v: 1 }`**

api-design-minion suggested including `t: tenantId` for audit logging.
Rejected for minimalism -- tenantId isn't needed for the redirect
operation, and the Stripe URL contains `acct_` identifiers for
correlation if needed.

### Module: self-contained with duplicated HMAC helpers

**Chosen: New `src/invoice-redirect.js` with duplicated helpers**

security-minion suggested extracting shared HMAC helpers to `src/hmac.js`.
The codebase intentionally duplicates these between `unsubscribe.js` and
`email-verify.js` for module self-containment. Following the same pattern
avoids a refactoring side-quest touching two tested modules.

## Code Review Findings

### SESSION_SECRET null-guard (fixed)

Code review found that `billing.js:handleInvoiceFinalized` would throw
if `SESSION_SECRET` was undefined (e.g., in development or if the secret
isn't deployed), causing Stripe webhook retry storms. Fixed by adding
`&& env.SESSION_SECRET` to the conditional, falling back to `/ui#billing`
when the secret is unavailable. Committed as a separate fix.

### Test assertion style (noted, not changed)

Code review noted `t.assert.ok(url.startsWith(...))` could use
`t.assert.match()` for better failure messages. Kept current style for
consistency with existing test patterns.
