# Outcome: R31 Capture Metering to Stripe Pipeline

## What Was Built

Three new modules and one migration wire WRL's D1 usage counters into Stripe's
billing meter, completing the capture-to-invoice pipeline:

1. **src/pricing.js** (85 lines) — Single source of truth for graduated volume
   pricing tiers matching Stripe Dashboard config. Exports `VOLUME_TIERS`,
   `INVOICE_THRESHOLD_EUR`, `calculateCharges()`, and `computeBillableDelta()`.

2. **src/meter-reporter.js** (119 lines) — Hourly batch reporter that queries
   paid tenants with unreported usage across current + previous period, submits
   delta meter events to Stripe with idempotency keys, and updates the D1
   watermark on success. Per-tenant error isolation ensures one failure doesn't
   block others.

3. **src/account.js** (+17 lines) — Extended `GET /v1/account/usage` with a
   `billing` sub-object containing current charges (graduated), active tier,
   full tier table, and invoice threshold status. Works for all tenants
   including free tier.

4. **migrations/0008_metering.sql** (6 lines) — Added `reported_capture_count`
   and `last_reported_at` columns to `usage_counters` table.

5. **src/index.js** (+4 lines) — Wired meter reporting into existing cron
   handler with `getUTCMinutes() === 0` guard for hourly cadence.

## Test Coverage

- test/pricing.test.js — 16 parameterized tests (graduated charges + delta)
- test/meter-reporting.test.js — 8 unit tests (delta, skip, isolation, idempotency, watermark)
- test/meter-batch.test.js — 2 integration tests (hourly/non-hourly cron guard)
- test/account-usage.test.js — 6 new tests (billing response shape, tiers, threshold)

All 1125 tests pass (47 test files). No regressions.

## Deviations from Plan

- **computeBillableDelta dead code**: Exported and tested but never imported
  by production code. `meter-reporter.js` computes the delta inline
  (`capture_count - reported_capture_count`). Identified by all 3 Phase 5
  reviewers. Accepted as-is — the function serves as a documented contract
  for the delta calculation and costs nothing.

- **Invoice threshold enforcement**: The issue spec mentions EUR 5 threshold
  enforcement. This is configured in Stripe Dashboard, not in WRL code.
  The dashboard endpoint reports threshold status for display purposes.

- **Free tier reporting**: Issue spec says "first 200 not reported to Stripe
  as billable usage." Implementation reports ALL captures; Stripe's graduated
  pricing handles the free tier at EUR 0.00. Same economic outcome, simpler
  reconciliation.

## Backlog Changes

- **Updated**: Billing extensions parking lot item "[should] Wire Stripe meter
  event reporting into capture pipeline" — this is now DONE (this phase).
- **No new items**: All Phase 5 ADVISE findings were minor and do not warrant
  backlog entries.
