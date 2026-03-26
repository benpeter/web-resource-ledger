## Task: Implement HMAC-signed invoice redirect for WRL email links

### Context

All links in WRL outbound emails must use the WRL sending domain instead of
third-party domains (e.g., `invoice.stripe.com`) so spam filters don't flag
domain mismatches. You are implementing an HMAC-signed redirect endpoint that
proxies Stripe invoice links through the WRL domain.

The codebase has two existing HMAC token patterns you MUST follow exactly:
- `src/unsubscribe.js` -- uses `"unsub."` domain prefix, no expiry
- `src/email-verify.js` -- uses `"emailverify."` domain prefix, 24h expiry

Both duplicate their HMAC helpers (toBase64url, fromBase64url, importHmacKey)
intentionally for module self-containment. Your new module MUST follow this
same pattern -- duplicate the helpers, do not extract a shared module.

### Architecture Review Notes (incorporate these)
- Ensure `new URL(decoded.u)` is wrapped in try/catch for the never-throws contract
- Consider "your account dashboard" wording over "billing portal in your dashboard" for the error page

### What to implement

#### 1. Create `src/invoice-redirect.js`

Three exports: generateInvoiceRedirectUrl, verifyInvoiceRedirectToken, handleBillingInvoiceRedirect

#### 2. Modify `src/index.js` -- import, route, rate limit group, auth exemption

#### 3. Modify `src/billing.js` -- import, replace portalUrl in handleInvoiceFinalized

#### 4. Write tests in `test/invoice-redirect.test.js`

### Full implementation details
Read the complete task specification from:
/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-d2Z9HP/link-domain-matching/phase3-synthesis.md

### Success criteria
- `npm test` passes (all existing tests plus new ones)
- A valid HMAC token redirects to the Stripe URL with 302
- A tampered/missing/malformed token shows a 200 HTML error page
- A token with a non-Stripe domain is rejected even with valid HMAC
- The invoice email contains a WRL domain URL, not a Stripe domain URL
- The redirect endpoint works without session authentication
- The redirect endpoint is rate-limited via AUTH_RATE_LIMITER
