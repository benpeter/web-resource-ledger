# Test Strategy: Capture Metering to Stripe Pipeline

## Assessment

The billing pipeline is a **financially-critical code path**. Bugs here mean either lost revenue (under-reporting) or overcharging tenants (double-billing). The existing test suite establishes strong patterns: unit tests for pure functions (`test/stripe.test.js`), integration tests via `SELF.fetch()` with miniflare D1 (`test/billing.test.js`, `test/account-usage.test.js`), and isolated DB-layer tests (`test/usage-counters.test.js`). The new metering pipeline introduces four testable boundaries that slot cleanly into these patterns.

### Test Infrastructure Observations

The existing setup is well-suited for this work:
- **Vitest + miniflare** provides real D1 (SQLite-backed) and KV, which means DB operations test against actual SQL constraints.
- **Stripe API calls are mocked at `globalThis.fetch`** level in integration tests (`test/billing.test.js:84-96`) and at the function import level in unit tests. Both patterns should continue.
- **`vi.useFakeTimers()` is available** but not currently used in billing tests. It will be essential for hourly reporting tests.
- **`worker.scheduled(controller, env, ctx)` is directly callable** as demonstrated in `test/scheduled-handler.test.js`. The same pattern supports testing the hourly reporting path.
- **`cleanDb(env.DB)` fixture** already clears `usage_counters`, so reporting state tests start clean.
- **`seedUsageCounter()` fixture** injects arbitrary counter values, enabling precise free-tier deduction tests.

## Test Boundaries and Strategy

### Boundary 1: Meter Event Reporting Function (Unit Tests)

**What**: A new function (likely `reportUsageBatch` or similar) that reads D1 counters, deducts free-tier, computes delta from last-reported, and calls `reportMeterEvent()`.

**Test approach**: Pure unit tests with mocked `stripeRequest`. These test the **reporting logic in isolation** from the cron trigger and from D1.

**Test file**: `test/meter-reporting.test.js` (new)

**Tests needed**:

1. **Free-tier deduction** -- tenant with 150 captures reports 0 events to Stripe (all within free 200).
2. **Free-tier boundary** -- tenant with exactly 200 captures reports 0 events.
3. **Free-tier exceeded** -- tenant with 250 captures reports 50 events (250 - 200 = 50 billable).
4. **Free-tier exceeded by large amount** -- tenant with 10,500 captures reports 10,300 events. Verifies the volume tiers aren't applied at the reporting layer (Stripe handles graduated pricing).
5. **Delta calculation** -- if last reported was 100 billable and current is 200 billable, only 100 new events are reported. This is the core idempotency guarantee.
6. **Zero delta** -- if last reported equals current billable count, no Stripe API call is made. Verify `reportMeterEvent` is NOT called (not called with 0).
7. **Idempotency key format** -- verify the key includes tenant ID, period, and a count or timestamp component that makes it deterministic for the same reporting window. Assert the key string structure.
8. **Idempotency key stability** -- calling the function twice with the same inputs produces the same idempotency key. This is critical: if the key changes, Stripe will double-count.
9. **Free tenant (no payment method)** -- tenant without `stripe_customer_id` is skipped entirely. No Stripe call attempted.
10. **Blocked tenant** -- tenant with `billing_status = 'blocked'` is skipped.
11. **Grace period tenant** -- tenant in grace period IS reported (they still consume, and charges may resume).
12. **Multiple tenants** -- batch processes all paid tenants, not just one.
13. **Stripe 400 error (e.g., duplicate idempotency key)** -- function logs but does not throw (the batch must continue for other tenants).
14. **Stripe 429 rate limit** -- function retries with backoff or records for next cycle.
15. **Stripe 500 server error** -- function does NOT update "last reported" marker, so the next cycle retries.
16. **Last-reported marker update** -- on successful Stripe call, the marker is updated to current count. On failure, marker is unchanged.

**Mocking strategy**: Mock `stripeRequest` (or `reportMeterEvent`) at the import level using `vi.mock()`, similar to existing `test/stripe.test.js` patterns. Mock `getUsage`/DB reads to control counter values. This keeps these tests fast (no miniflare needed).

### Boundary 2: Reconciliation Logic (Unit Tests)

**What**: A function that compares D1 usage_counters against the cumulative reported total and flags mismatches exceeding 1% tolerance.

**Test file**: `test/meter-reporting.test.js` (same file, separate `describe` block)

**Tests needed**:

1. **Exact match** -- D1 says 500, reported says 500, no mismatch logged.
2. **Within tolerance** -- D1 says 1000, reported says 995 (0.5% diff), no mismatch.
3. **At tolerance boundary** -- D1 says 1000, reported says 990 (1.0%), no mismatch (tolerance is inclusive).
4. **Over tolerance** -- D1 says 1000, reported says 980 (2.0%), mismatch detected. Verify the reconciliation output includes expected vs actual, tenant ID, period, and delta.
5. **Under-reporting detected** -- reported < expected. Should flag as `under_reported`.
6. **Over-reporting detected** -- reported > expected (could happen if increment + report race). Should flag as `over_reported`.
7. **Zero usage** -- D1 says 0, reported says 0, no mismatch.
8. **Free-tier-only usage** -- D1 says 150, reported says 0 (correct, all free), no mismatch. This test is **critical** because the reconciliation must apply the same free-tier deduction before comparing.

**Mocking strategy**: Pure function tests. Pass in counter values and reported values directly. No mocking needed if the reconciliation function is pure.

### Boundary 3: Extended Dashboard Endpoint (Integration Tests)

**What**: Enhancement to `GET /v1/account/usage` to include pricing/charges information.

**Test file**: `test/account-usage.test.js` (extend existing file with new describe blocks)

The existing test file already validates auth, response shape, billing status, zero usage, non-zero usage, and `resetsAt`. New tests should follow the same patterns: `createTosSession()`, `seedUsageCounter()`, `SELF.fetch()`.

**Tests needed** (new describe blocks):

1. **Response shape includes new billing fields** -- when the endpoint is enhanced, the response should include new fields (e.g., `charges`, `pricingTier`, `thresholdProgress`). Test the full set of expected top-level keys. **NOTE**: The existing test on line 102 asserts `Object.keys(body).sort()` -- this test MUST be updated to include the new fields, or it will fail. This is the main backward-compatibility risk.
2. **Charges calculation for free-tier tenant** -- 150 captures, charges = 0.00.
3. **Charges at free-tier boundary** -- exactly 200 captures, charges = 0.00.
4. **Charges with first paid tier** -- 250 captures: 50 billable at EUR 0.05 = EUR 2.50.
5. **Charges spanning tier 1 and tier 2** -- 10,500 captures: 9,800 at EUR 0.05 + 500 at EUR 0.035 = EUR 507.50. (Exact calculation depends on whether tiers are graduated or volume -- the prompt says graduated.)
6. **Charges spanning all three tiers** -- 100,500 captures: 9,800 at EUR 0.05 + 90,000 at EUR 0.035 + 500 at EUR 0.015 = EUR 3,647.50.
7. **Pricing tier indicator for free tenant** -- tenant with 50 captures is in "free" tier.
8. **Pricing tier indicator for paid tenant at tier 1** -- tenant with 500 captures shows tier 1 indicator.
9. **Threshold progress** -- if threshold is EUR 5.00 and current charges are EUR 2.50, progress should be 0.50 (or 50%).
10. **Threshold progress at zero** -- no billable usage, progress = 0.
11. **Threshold exceeded** -- charges above EUR 5.00, progress = 1.0 (or capped).
12. **Paid tenant with zero usage** -- has payment method, 0 captures, charges = EUR 0.00, tier = "free" (or no applicable tier).
13. **Backward compatibility** -- existing fields (`captures.used`, `captures.limit`, `captures.remaining`, `storageBytes`, `billingStatus`, etc.) are still present and unchanged. This can be enforced by ensuring the existing tests pass without modification to their assertions.

**Important implementation note**: Keep the graduated tier calculation as a **pure function** exported from quotas.js or a new pricing.js. This enables separate unit testing of tier math without needing integration tests.

### Boundary 4: Cron-Triggered Hourly Batch Reporting (Integration Tests)

**What**: The hourly reporting path that reads all paid tenants' counters and reports to Stripe.

**Test file**: `test/meter-batch.test.js` (new)

**Test approach**: Call `worker.scheduled(controller, env, ctx)` directly, same as `test/scheduled-handler.test.js`. The cron handler will need to detect whether this is a per-minute schedule tick or an hourly meter reporting tick. Two options for this detection:
- **(a) Separate cron expression**: Add a second `[[triggers.crons]]` entry at `0 * * * *` (top of each hour). The handler checks `controller.cron` to dispatch.
- **(b) Modular hour detection**: The existing per-minute handler checks `new Date(controller.scheduledTime).getUTCMinutes() === 0`.

Either way, the test constructs a controller with the appropriate `scheduledTime` and `cron` value.

**Tests needed**:

1. **Hourly trigger fires reporting** -- construct controller with `scheduledTime` at HH:00:00 and the hourly cron string. Seed D1 with one paid tenant at 300 captures. Stub `globalThis.fetch` to intercept Stripe meter_events call. Verify fetch was called with correct path (`/v1/billing/meter_events`) and the body includes the correct billable count (100 = 300 - 200 free).
2. **Non-hourly tick does NOT fire reporting** -- construct controller with `scheduledTime` at HH:15:00. Verify no Stripe meter_events call is made (only the existing schedule-check logic runs).
3. **No paid tenants** -- only free tenants exist (no `stripe_customer_id`). Verify no Stripe calls made. Handler completes successfully.
4. **Multiple paid tenants** -- seed 3 tenants with varying usage. Verify each gets a separate meter event call.
5. **Stripe failure for one tenant does not block others** -- stub fetch to fail on the second call. Verify the first and third tenants' events were still submitted.
6. **Last-reported marker persisted after success** -- after reporting, read the D1/KV marker. Verify it matches the reported count. Run the handler again at the next hour with unchanged counters. Verify no new Stripe call is made (delta = 0).
7. **Last-reported marker NOT updated on Stripe failure** -- stub fetch to return 500. Verify the marker is unchanged. On next invocation, the full delta is retried.
8. **Concurrent with scheduled captures** -- seed both a due schedule AND usage counters for a paid tenant. Run the hourly tick. Both the schedule fan-out AND the meter reporting should execute without interference.
9. **Period boundary** -- use `vi.useFakeTimers()` to set clock at 2026-04-01T00:00:00Z. Seed usage for period `2026-03` AND `2026-04`. Verify only the previous period's unreported delta is flushed at the boundary, or that both periods are correctly handled (depends on design choice).

**Mocking strategy**: Stub `globalThis.fetch` to intercept Stripe API calls (pattern from `test/billing.test.js:84-96`). Use `createExecutionContext()` from `cloudflare:test`. D1 is real (miniflare-backed). Use `vi.useFakeTimers()` for time control.

## Edge Cases Critical for Billing

These are the scenarios that, if untested, would cause financial harm:

| Priority | Edge Case | Why Critical | Test Location |
|----------|-----------|-------------|---------------|
| P0 | Double reporting (same captures billed twice) | Direct revenue impact on tenant | Boundary 1 tests 5, 6, 8; Boundary 4 test 6 |
| P0 | Free-tier not deducted before reporting | Tenants charged for free captures | Boundary 1 tests 1-4; Boundary 2 test 8 |
| P0 | Stripe failure silently swallowed, marker updated | Under-billing, lost revenue | Boundary 1 tests 15-16; Boundary 4 test 7 |
| P0 | Idempotency key not deterministic across retries | Stripe accepts duplicate, double-count | Boundary 1 tests 7-8 |
| P1 | Graduated tier calculation off-by-one | Incorrect charges shown to tenant | Boundary 3 tests 3-6 (unit test the calc separately) |
| P1 | Race between capture increment and meter report | Counter read between increment and report misses events | Boundary 2 tests 5-6 (reconciliation catches this) |
| P1 | Period rollover during reporting | Captures attributed to wrong period | Boundary 4 test 9 |
| P1 | Tenant transitions free->paid mid-period | Previous free captures must not be billed | Boundary 1 (add specific test) |
| P2 | Threshold progress calculation division by zero | Dashboard crash on zero threshold | Boundary 3 test 10 |
| P2 | Very large capture count (INTEGER overflow) | SQLite INTEGER is 64-bit, should be fine, but verify | Boundary 1 (add large number test) |

## Implementation Recommendations

### 1. Extract Pricing Calculation as Pure Function

Create a `computeCharges(captureCount, freeTierLimit)` function in `src/quotas.js` (or new `src/pricing.js`) that returns `{ totalCharges, billedCaptures, tier, tiers: [...] }`. This is pure math -- no DB, no Stripe. Test it with a dedicated describe block using parameterized tests (`it.each`):

```js
it.each([
  [0, 0, 'free'],
  [200, 0, 'free'],
  [201, 0.05, 'tier1'],
  [10200, 500.00, 'tier2'],     // 10000 * 0.05
  [110200, 4000.00, 'tier3'],   // 10000 * 0.05 + 90000 * 0.035 + 10000 * 0.015
])('captureCount=%i -> charges=%f, tier=%s', (count, charges, tier) => {
  const result = computeCharges(count, FREE_CAPTURE_LIMIT);
  expect(result.totalCharges).toBeCloseTo(charges, 2);
  expect(result.tier).toBe(tier);
});
```

### 2. Test the Reporting Marker Atomically

Whatever data model tracks "last reported count" (D1 column or KV key), test that:
- Reading the marker and updating it happens without a TOCTOU gap (or that idempotency keys make TOCTOU harmless).
- The marker update is conditional on Stripe success -- never optimistic.

### 3. Fixture for Paid Tenants

Add a `seedPaidTenant()` helper to `test/fixtures.js` that creates a tenant with `stripe_customer_id` set and `payment_method_added_at` non-null. Multiple existing tests need this (billing.test.js already does it manually), and meter reporting tests will need it heavily.

```js
export async function seedPaidTenant(db, {
  tenantId = 'paid-tenant',
  stripeCustomerId = 'cus_test_paid',
} = {}) {
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO tenants (id, stripe_customer_id, payment_method_added_at) VALUES (?, ?, ?)')
      .bind(tenantId, stripeCustomerId, new Date().toISOString()),
  ]);
  return { tenantId, stripeCustomerId };
}
```

### 4. cleanDb Must Clear Reporting State

Whatever table or KV namespace stores reporting markers, add cleanup to `cleanDb()` in `test/fixtures.js`. If it is a D1 table, add `db.prepare('DELETE FROM meter_reports')` (or similar) to the batch. If it is KV, the miniflare KV already resets between test runs due to `isolatedStorage: false` combined with `cleanDb`.

### 5. Stripe Fetch Interceptor Pattern

The existing billing tests use `vi.stubGlobal('fetch', ...)` which is effective but coarse-grained. For meter reporting tests where both the scheduled-capture path and the Stripe-reporting path may fire in the same handler invocation, the interceptor needs to handle multiple URL patterns:

```js
vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url) => {
  const urlStr = String(url);
  if (urlStr.includes('/v1/billing/meter_events')) {
    return new Response(JSON.stringify({ event_name: 'captures', ... }), { status: 200 });
  }
  // Let other calls through or throw
  throw new Error(`Unexpected fetch: ${urlStr}`);
}));
```

Use `fetch.mock.calls.filter(...)` to assert which Stripe endpoints were called and with what parameters.

### 6. Fake Timers for Hourly Detection

```js
import { vi, beforeEach, afterEach } from 'vitest';

beforeEach(() => {
  // Set to top of hour for hourly reporting tests
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-03-23T14:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});
```

This controls `Date.now()` and `new Date()` throughout the handler, ensuring the "is this an hourly tick?" check behaves deterministically.

## New Test Files Summary

| File | Type | Estimated Tests | Boundary |
|------|------|----------------|----------|
| `test/meter-reporting.test.js` | Unit | ~20 | Reporting function + reconciliation |
| `test/meter-batch.test.js` | Integration | ~10 | Cron-triggered batch with miniflare |
| `test/account-usage.test.js` (extend) | Integration | ~12 new | Dashboard pricing/charges |
| `test/quotas.test.js` or `test/pricing.test.js` | Unit | ~10 | Pure tier calculation |

**Estimated total new tests**: ~52

## Dependencies on Other Specialists

- **data-minion**: The reporting marker schema (D1 table vs column vs KV) directly affects how tests seed and assert state. Need the schema decision before writing Boundary 1 tests 5-8, 15-16 and Boundary 4 tests 6-7.
- **api-design-minion**: The exact response shape for the enhanced `GET /v1/account/usage` determines the assertions in Boundary 3. Need the field names and types before writing those tests. The existing field-set assertion (`Object.keys(body).sort()`) will break on any addition -- this is intentional (it is a contract test) but requires coordination.
- **iac-minion**: Whether the cron trigger is separate or piggybacked on the existing per-minute trigger affects how `controller.cron` is constructed in Boundary 4 tests. Need the trigger architecture before writing test setup.

## Risks

1. **Miniflare D1 divergence from production D1**: The new migration for reporting markers will run in miniflare's SQLite, which may handle edge cases (e.g., concurrent writes, integer overflow) differently than Cloudflare's production D1. Mitigate by keeping the schema simple (no exotic SQL features) and relying on idempotency keys rather than DB-level locking.

2. **Time-dependent tests**: Hourly detection and period boundary tests rely on fake timers. If any code path uses `performance.now()` or `Date` from a different V8 context (miniflare isolation), fake timers will not control it. Mitigate by verifying timer control works before adding time-sensitive assertions. The existing `test/quotas.test.js` already uses `vi.useFakeTimers()` for grace period tests, confirming this works in the miniflare environment.

3. **Stripe meter events API shape**: The test mocks will encode assumptions about what `POST /v1/billing/meter_events` expects and returns. If the Stripe API version pinned in `src/stripe.js` (`2025-04-30.basil`) changes this endpoint's contract, mocks will silently pass while production fails. Mitigate by including one integration test that validates the request body shape against the Stripe API docs (assert specific field names in the `fetch` call arguments).

4. **Test execution time**: Adding ~52 tests (mostly unit) should add <2 seconds to the suite. The integration tests in `test/meter-batch.test.js` use `worker.scheduled()` which involves D1 queries but no real network calls. The main cost is miniflare D1 setup per test file, not per test.
