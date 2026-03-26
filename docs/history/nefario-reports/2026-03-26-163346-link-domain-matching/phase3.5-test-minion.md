# Test Minion Review

**Verdict: APPROVE**

The test plan is thorough and well-aligned with the existing test patterns in this codebase. Specific observations:

## Strengths

**Unit test coverage is complete.** The seven token unit tests cover the full risk surface: round-trip, tampered payload, tampered HMAC, missing token, malformed token, wrong domain with valid HMAC (the critical defense-in-depth case), and cross-domain token reuse. This mirrors the pattern in `test/email-verify.test.js` precisely.

**HTTP handler tests cover the right behaviors.** The integration tests via `SELF.fetch` cover the 302 success path, the 200 HTML error path for invalid and missing tokens, the unauthenticated access assertion, the security headers (Cache-Control, Referrer-Policy), and the log-sanitization assertion (no decoded URL in logs). These are all non-trivial behaviors worth explicit assertions.

**The billing webhook integration test is correctly scoped.** The plan asks for a test that triggers `invoice.finalized` and verifies the dispatched email contains a `/v1/billing/invoice?token=` URL instead of `invoice.stripe.com`. This is exactly the right integration boundary to test -- it validates the `generateInvoiceRedirectUrl` call was actually wired into `handleInvoiceFinalized`. The existing `test/notification-triggers.test.js` at line 416 currently passes a raw `hosted_invoice_url` directly; the new test needs to verify the rewrite happened upstream of `dispatchNotification`.

**Test file separation is correct.** Keeping `test/invoice-redirect.test.js` separate from `test/billing.test.js` follows the one-module-one-test-file convention established in this codebase.

## One Implementation Note for the Agent

The existing `notification-triggers.test.js` test at line 433 (`dispatches invoice_generated directly via dispatchNotification`) passes `portalUrl: 'https://invoice.stripe.com/i/test123'` directly to `dispatchNotification`. After this change, `handleInvoiceFinalized` will generate a WRL URL before calling `dispatchNotification`, but this lower-level test bypasses the handler entirely -- it will still pass without change. The agent should be aware the existing test does not need modification, but the new billing webhook integration test must go one level higher (via `SELF.fetch` to the Stripe webhook endpoint) to exercise the actual rewrite path, as specified in the plan.

## No Gaps

The plan does not miss any critical test cases. The `SESSION_SECRET` dependency is handled by the existing test environment bindings. Rate limiting is verified via the `getRateLimitGroup` assertion path. The absence of a token-expiry mechanism means there are no expiry edge cases to test (unlike `email-verify.test.js`).
