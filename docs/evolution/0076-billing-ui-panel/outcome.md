# Phase 0076: Billing UI Panel -- Outcome

## What was built

A "Billing" tab in the WRL web UI at `#/billing` showing:

- **Status banner** -- conditional warning (grace_period) or error (blocked) with "Update payment method" CTA
- **Current period summary** -- capture count, current charges in EUR, pricing tier with sr-only tier description
- **Invoice threshold progress** -- progressbar showing EUR X.XX of EUR 5.00 with anxiety-reducing copy
- **Graduated pricing tiers** -- collapsed by default, expandable table with active tier highlight
- **eIDAS add-on usage** -- conditional section when qualified timestamps enabled, with graceful fallback for missing API data
- **Payment and portal** -- payment method status with Stripe Customer Portal redirect (checkout for new users, portal for existing)

## Files changed

| File | Action | Lines |
|------|--------|-------|
| `src/ui/ui-billing.js` | Created | 930 |
| `src/ui/ui-css.js` | Modified | +70 |
| `src/ui/ui-shell.js` | Modified | +15 |
| `src/ui/ui-auth.js` | Modified | +6 |
| `test/ui-billing.test.js` | Created | 234 |

Total: 2 new files, 3 modified files, ~1,255 lines added.

## Test coverage

35 tests across 8 partitions:
- A: Billing status labels (4 tests)
- B: Payment CTA logic (2 tests)
- C: eIDAS section visibility (2 tests)
- D: Pure helper logic -- formatCurrency, thresholdPercent, thresholdClass (11 tests)
- E: Structural smoke checks (10 tests)
- F: Security scan -- no innerHTML (1 test)
- G: CSS class presence (4 tests)
- H: Module separation guard (1 test)

Full test suite: 1215 passed, 0 failed, 50 test files.

## Security measures

- Stripe URL prefix validation before `window.location.href` assignment (both checkout and portal flows)
- Zero `innerHTML` with variable data -- all dynamic content via `textContent` and DOM construction
- Button disabled on click with "Redirecting..." text to prevent double-submission
- `aria-describedby` warning on all portal/checkout buttons: "Opens Stripe's secure billing portal. You will leave this site."

## Accessibility

- `role="status"` for grace_period banner, `role="alert"` for blocked banner
- `role="progressbar"` with `aria-valuetext` for invoice threshold (prevents raw cents announcement)
- Short `aria-label="Invoice threshold"` separate from valuetext to avoid double-announcement
- `data-label` attributes on tier table cells for mobile CSS `::before` content
- Proper heading hierarchy: h1 > h2 for all sections
- `aria-live="polite"` region for billing status announcements

## Code review findings

2 issues found and auto-fixed:
1. DOM leak in eIDAS portal link click handler (temporary button appended without cleanup)
2. Dead CSS class -- tier table using wrong className, making mobile responsive styles unreachable

## Known limitations

- eIDAS capture count not in API response yet -- billing tab shows "View in Stripe" fallback
- `formatPeriod` is an implicit cross-module dependency (defined in settings, used in billing via shared IIFE scope)
- No E2E browser tests for the billing tab (existing pattern -- other tabs also lack E2E tests)

## Backlog changes

- #170 resolved by this phase
- Updated parking lot: `[consider] Stripe Checkout returnUrl from client config` -- now partially addressed (returnUrl uses `window.location.origin + '/ui#/billing'`)
- Deferred: billing tab user documentation (SHOULD priority, no user docs exist for any UI tab)
