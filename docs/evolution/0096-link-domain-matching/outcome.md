# Outcome -- 0096 Link Domain Matching

## What was built

HMAC-signed invoice redirect endpoint that replaces raw Stripe URLs in
outbound emails with WRL-domain URLs, eliminating spam filter penalties
from domain mismatches.

### New files

- **`src/invoice-redirect.js`** (~170 lines) -- Three exports:
  `generateInvoiceRedirectUrl`, `verifyInvoiceRedirectToken`,
  `handleBillingInvoiceRedirect`. Self-contained module with duplicated
  HMAC helpers following codebase convention.

- **`test/invoice-redirect.test.js`** (~385 lines) -- 18 tests covering
  token round-trip, HMAC tampering, domain allowlist, cross-domain token
  rejection, HTTP handler behavior, and webhook integration.

### Modified files

- **`src/index.js`** (+11 lines) -- Route registration, rate limit group
  assignment (`'auth'`), and session auth exemption for the billing invoice
  path.

- **`src/billing.js`** (+6 lines) -- `handleInvoiceFinalized` now generates
  HMAC-signed redirect URLs via `generateInvoiceRedirectUrl` instead of
  passing raw Stripe `hosted_invoice_url`. Includes SESSION_SECRET
  null-guard with fallback.

- **`openapi.yaml`** (+55 lines) -- New `billing` tag and
  `GET /v1/billing/invoice` endpoint specification with 200/302/429
  responses.

### How it works

1. Stripe sends `invoice.finalized` webhook with `hosted_invoice_url`
2. `handleInvoiceFinalized` signs the URL into an HMAC token:
   `{base64url({u: stripeUrl, v: 1})}.{base64url(hmac)}`
3. Email template receives `portalUrl` pointing to
   `https://api.webresourceledger.com/v1/billing/invoice?token=...`
4. Recipient clicks the WRL-domain link
5. Endpoint verifies HMAC, checks domain allowlist (`invoice.stripe.com`),
   returns 302 redirect to the original Stripe URL
6. Invalid tokens get a 200 HTML error page with `/ui#billing` fallback

## Test results

All 1654 tests pass (1636 existing + 18 new).

## Surface consistency

| Surface | Action |
|---------|--------|
| OpenAPI spec | Updated: added `billing` tag and `GET /v1/billing/invoice` endpoint |
| Docs site | No update needed -- redirect is internal email plumbing, not user-facing |
| Landing page | No update needed -- no pricing/tier/capability changes |
| MCP server | No update needed -- redirect endpoint is not an API tool |
| Legal pages | No update needed -- no new data collection or third-party integrations |

## Backlog changes

Issue #216 was not in the backlog, so no items to mark done. No new
backlog items were created -- the implementation is complete with no
deferred work.
