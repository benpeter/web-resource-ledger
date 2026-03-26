# Lucy Review: link-domain-matching

## Verdict: APPROVE

---

## Requirements Traceability

| Original Requirement | Plan Element | Status |
|---|---|---|
| No outbound email contains raw third-party URLs as clickable links | Task 1: Replace `hosted_invoice_url` with HMAC-signed redirect URL in `handleInvoiceFinalized` (billing.js) | Covered |
| Stripe invoice links proxied/redirected through WRL domain | Task 1: New `/v1/billing/invoice?token=` redirect endpoint in `invoice-redirect.js` | Covered |
| Resend deliverability check no longer flags domain mismatch | Addressed by replacing Stripe URLs with WRL domain URLs in email content | Covered |
| Existing email tests pass | Task 1 success criteria: `npm test` exits 0 | Covered |
| Stripe invoice URLs must remain functional for recipients | Task 1: 302 redirect preserves access to Stripe invoice page | Covered |
| Out of scope: Resend configuration, DNS, email content copy, Stripe billing logic | Plan does not touch these | Correct |

No orphaned tasks. No unaddressed requirements.

---

## CLAUDE.md Compliance

**Helix Manifesto adherence**: Strong. Every conflict resolution cites YAGNI (single-domain allowlist, URL-only payload, `inv.` prefix, no shared HMAC extraction). The single-task plan with a single new module is minimal scope.

**Intentional duplication**: The plan explicitly follows the documented convention at `email-verify.js:45-46` -- HMAC helpers are duplicated per module for self-containment. This matches the codebase's stated design decision.

**Fail loudly**: The plan specifies logging on both success and failure paths with distinct event names (`billing.invoice_redirect` vs `billing.invoice_redirect_invalid`) and never silently swallows errors. Compliant.

**Vanilla JS**: No frameworks introduced. Compliant.

**`// tva` signature**: Explicitly included in the prompt. Compliant.

**Test discipline**: Tests are scoped to a new file (`test/invoice-redirect.test.js`), not shoehorned into existing test files. Test cases cover positive path, tampered tokens, cross-domain tokens, and the billing webhook integration. Consistent with existing test organization.

---

## Convention Adherence

**Route naming**: `GET /v1/billing/invoice?token=` follows the `/v1/` prefix convention used by every route in the codebase. Query parameter `?token=` matches the pattern used by `/v1/notifications/unsubscribe?token=` and `/v1/notifications/verify-email?token=`. Consistent.

**Module structure**: New `src/invoice-redirect.js` follows the single-purpose module pattern established by `src/unsubscribe.js` and `src/email-verify.js`. Same exports pattern (generate, verify, handler). Consistent.

**Auth exemption approach**: The plan proposes `pathname === '/v1/billing/invoice'` exact match to exempt from session auth, which prevents accidentally matching other `/v1/billing/` routes. This is the correct approach given the existing `pathname.startsWith('/v1/billing/')` gate at line 575.

**Rate limiting**: Routes the new endpoint into the `'auth'` rate limit group, same as unsubscribe and verify-email. Consistent.

**Logging**: Uses the `log()` function with severity 3, same subsystem convention (`'billing'` namespace). Never logs decoded URLs (containing Stripe account identifiers). Consistent with the codebase's sensitive-data handling.

**Error handling**: Returns 200 HTML for invalid tokens, matching both `handleGetUnsubscribe` and `handleGetVerifyEmail`. No silent catch blocks. Compliant with "fail loudly" principle.

---

## Drift Assessment

No drift detected. The plan does exactly what was asked: replace third-party URLs in outbound emails with WRL domain redirect URLs. No features were added beyond the request. No adjacent features were introduced. The scope is contained to the minimum set of files needed.

The one area where the plan could theoretically be questioned is whether other outbound email templates also contain third-party URLs. The plan verified that `payment-failure.js` uses `/ui#billing` (a WRL URL, not Stripe), and the only Stripe URL in any template data flow is `hosted_invoice_url` in `handleInvoiceFinalized`. This is correct -- I verified it via grep.

---

## Minor Observations (informational, not blocking)

1. **Route placement**: The plan says to place the route "with the unauthenticated notification routes (near line 124-128)" but the route path is `/v1/billing/invoice`, not `/v1/notifications/...`. Placing it near the notification routes makes functional sense (it's unauthenticated), but the executing agent should add a comment clarifying why a billing route lives outside the billing section. The plan's prompt already includes a comment for this (`// Unauthenticated invoice redirect`), which is sufficient.

2. **Rate limit ordering in `getRateLimitGroup`**: The plan correctly identifies that the new check for `/v1/billing/invoice` must come BEFORE the existing `pathname.startsWith('/v1/billing/')` check (which returns `'account'`). This is specified in the prompt. Good.
