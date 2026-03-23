# Margo Review -- Capture Metering & Stripe Pipeline

VERDICT: ADVISE

## Summary

The implementation is proportional to the problem. Three new source files
(pricing.js at 85 lines, meter-reporter.js at 119 lines, migration at 6 lines)
plus a small addition to account.js (~45 lines) and a 4-line integration in
index.js. No new dependencies. No unnecessary abstractions. The code is flat,
readable, and directly maps to the Stripe metering pipeline requirements.

The test suite is thorough but heavy relative to the production code (~580 test
lines for ~210 production lines). That ratio is not a problem per se -- metering
and billing warrant paranoid coverage -- but a few tests are redundant.

## Findings

- [ADVISE] src/pricing.js:82-85 -- `computeBillableDelta` is dead code

  `computeBillableDelta` is exported and tested but never called from any
  production code path. The meter-reporter computes the delta inline
  (line 62: `const delta = captureCount - reportedCaptureCount`). This
  function is a one-liner wrapping `Math.max(0, ...)` with no callers.
  Dead code increases surface area and misleads readers into thinking
  it participates in the billing pipeline.

  FIX: Remove `computeBillableDelta` from pricing.js and its test block
  from pricing.test.js. If meter-reporter.js needs the `Math.max(0, ...)`
  guard (it already has `if (delta <= 0) continue` on line 63), inline it.

- [ADVISE] src/pricing.js:72 -- `tiers` array returned on every `calculateCharges` call

  Every call to `calculateCharges` returns the full `VOLUME_TIERS` array
  (4 objects) in its result. This reference is used in the `/v1/account/usage`
  response (account.js:531) so the client gets the tier table on every usage
  check. The tier table is static -- it never changes between requests. Embedding
  it in every response inflates payload size and couples the API shape to
  internal pricing structure.

  Consider whether the tier table should be a separate endpoint (e.g.,
  `GET /v1/pricing`) or returned only when explicitly requested. For now this
  is acceptable since the usage endpoint is not on the hot path, but flag it
  if response size becomes a concern.

  FIX: No immediate action required. Track as a future simplification if the
  usage endpoint is called frequently or response size matters.

- [NIT] src/meter-reporter.js:61 -- long destructuring line

  Line 61 is a 155-character destructuring with 5 renames. It is within
  cognitive budget but sits at the edge of readability.

  FIX: Break across multiple lines for readability:
  ```js
  const {
    tenant_id: tenantId, period,
    capture_count: captureCount,
    reported_capture_count: reportedCaptureCount,
    stripe_customer_id: stripeCustomerId,
  } = row;
  ```

- [NIT] test/account-usage.test.js -- billing data tests partially duplicate pricing.test.js

  The billing data tests in account-usage.test.js (lines 347-425) re-verify
  graduated pricing arithmetic (150 captures = 0, 250 captures = 2.50, etc.)
  that is already covered by pricing.test.js with the same boundary values.
  These tests add integration value (verifying the endpoint wires pricing
  correctly), but the specific amount assertions are redundant with the unit
  tests. If pricing logic changes, both test files need updating.

  FIX: Keep the integration tests but simplify amount assertions to structural
  checks (e.g., "amount is a number >= 0, currency is EUR") rather than
  re-testing exact graduated arithmetic. The unit tests in pricing.test.js are
  the authority for correct amounts.

## What is done well

- **No new dependencies.** The entire pipeline uses existing Stripe client
  functions, D1, and the existing log infrastructure. Zero dependency additions.

- **Watermark pattern is sound.** The snapshot-then-advance-on-success approach
  with idempotency keys encoding the exact capture count is correct and
  retry-safe. Per-tenant error isolation prevents one failure from blocking
  all tenants.

- **Migration is minimal.** Two ALTER TABLE statements adding columns with safe
  defaults. No schema redesign, no new tables.

- **Scheduled integration is clean.** The hourly guard (`getUTCMinutes() === 0`)
  in index.js is simple and correct. `ctx.waitUntil` ensures reporting does not
  block the cron handler.

- **pricing.js is well-structured.** Tier definitions mirror Stripe config with
  a clear comment about the synchronization requirement. The graduated
  calculation loop is straightforward and correctly handles all bracket
  boundaries.
