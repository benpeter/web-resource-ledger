# Phase 3: Synthesis -- Capture Metering to Stripe Pipeline

## Conflict Resolutions

### Conflict 1: Storage for Reporting State

**Chosen**: Add `reported_capture_count` and `last_reported_at` columns to the existing `usage_counters` table (data-minion's approach).

**Over**: New `meter_reporting_log` table with its own `(tenant_id, period)` PK (iac-minion's approach).

**Why**: The reporting watermark is logically tied to the usage counter it tracks. Both share the same `(tenant_id, period)` composite PK. Adding two columns to the existing table avoids a JOIN on every reporting query and eliminates a consistency boundary between two tables that must agree on the same key. The iac-minion's argument about write contention is not substantive at WRL's scale -- the hot-path write (`incrementUsage`) touches `capture_count`; the hourly reporting write touches `reported_capture_count`. These are separate columns on the same row, and D1/SQLite serializes writes anyway. A separate table would add complexity for audit purposes, but Stripe's own event summary API provides the audit trail. The simpler schema wins per project philosophy (KISS, lean and mean).

### Conflict 2: Free-Tier Handling

**Chosen**: Report ALL captures to Stripe and let Stripe's graduated pricing handle the free tier (data-minion's approach).

**Over**: Deduct first 200 in WRL code before reporting to Stripe (iac-minion's approach).

**Why**: The Stripe sandbox already has `capture_volume_monthly` configured with graduated pricing where tier 1 (1-200) is EUR 0.00. Reporting raw counts means:
1. **Single source of truth**: If the free tier changes from 200 to 500, update Stripe Dashboard only -- no WRL code deploy.
2. **Reconciliation simplicity**: D1 `capture_count` should equal Stripe's `aggregated_value` exactly. No offset math needed for the 1% tolerance check.
3. **No edge cases**: Custom plans with different free tiers don't require code changes.

WRL still uses `FREE_CAPTURE_LIMIT` for quota enforcement (blocking free-tier tenants at 200). The gate and the meter are independent concerns.

**Important implication**: Since we report all captures, the delta formula simplifies to `delta = capture_count - reported_capture_count`. No free-tier arithmetic in the reporting path at all.

### Conflict 3: Idempotency Key Format

**Chosen**: `{tenantId}:{period}:{captureCount}` (data-minion's approach).

**Over**: `wrl:{tenantId}:{period}:{hourTimestamp}:{fromCount}-{toCount}` (iac-minion's approach).

**Why**: The key must be deterministic for retries. The data-minion's format is purely state-derived -- the same D1 snapshot always produces the same key. The iac-minion's format includes `hourTimestamp`, which changes if the same delta is retried in a different hour (e.g., Stripe was down at 14:00, retry at 15:00). While iac-minion argues this is correct (the delta changes because more captures arrived), the simpler key is more robust: it encodes exactly "I reported that this tenant reached count N", and Stripe deduplicates if the same count is reported twice. The `fromCount-toCount` range encoding is unnecessary because we only need to prevent double-counting the same high-water mark, not track ranges. Human readability also favors the shorter format when debugging in Stripe Dashboard.

---

## Delegation Plan

**Team name**: capture-metering-stripe-pipeline
**Description**: Wire WRL D1 usage counters into Stripe meter events, add billing data to the dashboard endpoint, enforce EUR 5 invoice threshold.

### Task 1: Pricing module and D1 migration

- **Agent**: data-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: none
- **Approval gate**: yes
- **Gate reason**: The pricing module defines tier constants that the dashboard and future billing code depend on. The D1 migration alters a production table schema. Both are hard to reverse and have 2+ downstream dependents (Tasks 2, 3 both depend on this).
- **Gate rationale**: |
    Chosen: Add two columns (`reported_capture_count`, `last_reported_at`) to existing `usage_counters` table; create a pure `src/pricing.js` module with `VOLUME_TIERS` constant and `calculateCharges()` function.
    Over: (a) New `meter_reporting_log` table -- rejected because it adds a JOIN and consistency boundary for no benefit at WRL's scale. (b) Putting tier constants in `quotas.js` -- rejected because pricing is a distinct concern from quota enforcement; separate module keeps responsibilities clean.
    Why: Collocating reporting state with the counter it tracks eliminates a JOIN and keeps the schema simple. A separate pricing module enables pure-function testing and reuse across the dashboard endpoint and future reconciliation.
- **Prompt**: |
    ## Task: Create pricing module and D1 migration for metering state

    You are working on the WRL Cloudflare Worker project. Your task has two deliverables:

    ### Deliverable 1: `src/pricing.js`

    Create a new module `src/pricing.js` that exports:

    1. `VOLUME_TIERS` -- a constant array matching the Stripe sandbox graduated pricing:
       ```js
       export const VOLUME_TIERS = [
         { id: 'tier_0', name: 'free',            unitPrice: 0,     from: 1,      to: 200    },
         { id: 'tier_1', name: '201-10,000',      unitPrice: 0.05,  from: 201,    to: 10000  },
         { id: 'tier_2', name: '10,001-100,000',  unitPrice: 0.035, from: 10001,  to: 100000 },
         { id: 'tier_3', name: '100,001+',        unitPrice: 0.015, from: 100001, to: null   },
       ];
       ```

    2. `INVOICE_THRESHOLD_EUR` -- `5.00`

    3. `calculateCharges(captureCount)` -- a pure function that computes graduated charges:
       - Walk each tier bracket, compute units in that bracket, multiply by `unitPrice`, sum.
       - Return `{ amount, currency: 'EUR', currentTier, tiers: VOLUME_TIERS }` where `currentTier` is the tier object the `captureCount` falls into.
       - `amount` must be rounded to 2 decimal places (`Math.round(amount * 100) / 100`).
       - Handle edge cases: 0 captures (amount 0, tier_0), exactly 200 (amount 0, tier_0), 201 (amount 0.05, tier_1).
       - This is graduated pricing (NOT volume pricing): each unit is priced at its bracket rate, not the highest bracket rate.

    4. `computeBillableDelta(captureCount, reportedCaptureCount)` -- computes the incremental delta to report to Stripe:
       - `return Math.max(0, captureCount - reportedCaptureCount)`
       - This is simple because we report ALL captures to Stripe (Stripe's graduated pricing handles the free tier at EUR 0.00).

    Add a JSDoc comment at the top of the file noting that these tier definitions mirror the Stripe Dashboard configuration for `capture_volume_monthly` and must be updated if Stripe pricing changes.

    ### Deliverable 2: Migration `migrations/0008_metering.sql`

    Add two columns to the existing `usage_counters` table:

    ```sql
    -- Track Stripe meter event reporting state.
    -- reported_capture_count: capture_count value at last successful Stripe report.
    -- last_reported_at: ISO 8601 timestamp of last successful report.
    -- Existing rows get reported_capture_count=0 (never reported) and last_reported_at=NULL.
    ALTER TABLE usage_counters ADD COLUMN reported_capture_count INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE usage_counters ADD COLUMN last_reported_at TEXT;
    ```

    Note: SQLite ALTER TABLE ADD COLUMN does not support CHECK constraints (same pattern as `migrations/0006_billing.sql`). Enforce `reported_capture_count >= 0` in application code.

    ### Deliverable 3: Unit tests for `pricing.js`

    Create `test/pricing.test.js` with parameterized tests (`it.each`) for `calculateCharges`:

    Test cases (captureCount -> expected amount, expected tier):
    - 0 -> 0.00, tier_0
    - 1 -> 0.00, tier_0
    - 200 -> 0.00, tier_0
    - 201 -> 0.05, tier_1
    - 250 -> 2.50, tier_1 (50 billable at 0.05)
    - 10000 -> 490.00, tier_1 (9800 at 0.05)
    - 10001 -> 490.035 rounded to 490.04, tier_2
    - 10500 -> 507.50, tier_2 (9800*0.05 + 500*0.035)
    - 100000 -> 3640.00, tier_2 (9800*0.05 + 90000*0.035)
    - 100001 -> 3640.015 rounded to 3640.02, tier_3
    - 100500 -> 3647.50, tier_3 (9800*0.05 + 90000*0.035 + 500*0.015)

    Also test `computeBillableDelta`:
    - (300, 0) -> 300
    - (300, 300) -> 0
    - (300, 250) -> 50
    - (0, 0) -> 0

    ### What NOT to do
    - Do NOT modify `src/quotas.js` -- `FREE_CAPTURE_LIMIT` stays there for quota enforcement.
    - Do NOT add any Stripe API calls -- this task is pure data and math.
    - Do NOT create a separate `meter_reporting_log` table -- columns go on `usage_counters`.
    - Do NOT add `STRIPE_CAPTURE_METER_ID` to `wrangler.toml` yet -- that's a separate task.

    ### Context
    - Existing migration pattern: see `migrations/0006_billing.sql` for ALTER TABLE column additions.
    - Existing quotas module: `src/quotas.js` has `FREE_CAPTURE_LIMIT = 200`.
    - Test pattern: see `test/quotas.test.js` for vitest patterns in this project.
    - The `VOLUME_TIERS` constant will be consumed by Task 2 (dashboard endpoint) and Task 3 (meter reporter).

- **Deliverables**: `src/pricing.js`, `migrations/0008_metering.sql`, `test/pricing.test.js`
- **Success criteria**: All pricing unit tests pass. Migration applies cleanly. `calculateCharges(10500)` returns `{ amount: 507.50, currency: 'EUR', currentTier: { id: 'tier_2', ... }, tiers: [...] }`.

---

### Task 2: Dashboard billing endpoint extension

- **Agent**: api-design-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |
    ## Task: Extend GET /v1/account/usage with billing data

    You are working on the WRL Cloudflare Worker. The pricing module (`src/pricing.js`) has been created by a prior task. It exports `calculateCharges(captureCount)`, `VOLUME_TIERS`, and `INVOICE_THRESHOLD_EUR`.

    ### What to do

    **1. Modify `src/account.js` `handleAccountGetUsage` function** (lines ~467-551):

    Import `calculateCharges`, `VOLUME_TIERS`, `INVOICE_THRESHOLD_EUR` from `../pricing.js` (adjust path as appropriate).

    After computing `captureCount` and `hasPaymentMethod`, add a `billing` sub-object to the response. The billing object is included for ALL tenants (free and paid):

    ```js
    const charges = calculateCharges(captureCount);
    const billing = {
      currentCharges: {
        amount: charges.amount,
        currency: charges.currency,
      },
      tier: charges.currentTier,
      tiers: charges.tiers,
      invoiceThreshold: {
        amount: INVOICE_THRESHOLD_EUR,
        currency: 'EUR',
        currentProgress: charges.amount,
        met: charges.amount >= INVOICE_THRESHOLD_EUR,
      },
      projectedCharges: {
        amount: null,
        currency: 'EUR',
        note: 'Projected charges require usage history (available after first full billing period)',
      },
    };
    ```

    Add `billing` to the `jsonResponse` object at the end (line ~531).

    **2. Update `test/account-usage.test.js`**:

    - Update the field-presence assertion on line 102 to include `'billing'` in the expected keys array.
    - Add new test cases in a new `describe('billing data')` block:
      - Free tenant with 0 captures: `billing.currentCharges.amount === 0`, `billing.tier.id === 'tier_0'`, `billing.invoiceThreshold.met === false`
      - Free tenant with 150 captures: `billing.currentCharges.amount === 0`, `billing.tier.id === 'tier_0'`
      - Paid tenant with 250 captures: `billing.currentCharges.amount === 2.50`, `billing.tier.id === 'tier_1'`, `billing.invoiceThreshold.met === false`
      - Paid tenant with 10500 captures: `billing.currentCharges.amount === 507.50`, `billing.tier.id === 'tier_2'`, `billing.invoiceThreshold.met === true`
      - `billing.tiers` is always an array of 4 tiers
      - `billing.projectedCharges.amount === null`
      - `billing.invoiceThreshold.amount === 5.00`

    Use the existing test patterns: `createTosSession()`, `seedUsageCounter()`, `SELF.fetch()`. For paid tenant tests, you'll need to set `payment_method_added_at` and `stripe_customer_id` on the tenant -- use a direct DB update in the test setup (pattern from `test/billing.test.js`).

    ### What NOT to do
    - Do NOT call the Stripe API. The dashboard reads from D1 only. No external dependencies.
    - Do NOT modify the existing response fields (tenantId, period, billingStatus, captures, storageBytes, resetsAt, hasPaymentMethod, gracePeriodEnd). Only ADD the new `billing` field.
    - Do NOT add `projectedCharges` calculation logic -- it stays null for now.
    - Do NOT touch `src/pricing.js` -- it was created in Task 1 and is read-only for you.

    ### Context
    - Current handler: `src/account.js` lines 467-551 (`handleAccountGetUsage`).
    - Current test: `test/account-usage.test.js` -- the key-presence assertion on line 102 must be updated.
    - Pricing module: `src/pricing.js` exports `calculateCharges`, `VOLUME_TIERS`, `INVOICE_THRESHOLD_EUR`.
    - The response must include `billing` for ALL tenants. Free tenants see `tier_0` with `amount: 0`. This is intentional -- it supports conversion UX showing what paid plans cost.

- **Deliverables**: Modified `src/account.js`, updated `test/account-usage.test.js`
- **Success criteria**: Existing account-usage tests pass (with updated key assertion). New billing tests pass. Response includes `billing` sub-object with correct tier calculations. No Stripe API calls in the endpoint.

---

### Task 3: Meter reporter module and cron integration

- **Agent**: iac-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: Task 1
- **Approval gate**: yes
- **Gate reason**: This is the core financial pipeline -- meter events sent to Stripe result in real charges. The cron integration modifies the production scheduled handler. Hard to reverse (Stripe meter events cannot be retracted once submitted), high blast radius (billing correctness for all paid tenants).
- **Gate rationale**: |
    Chosen: Piggyback on existing per-minute cron with hour-boundary detection (`getUTCMinutes() === 0`); report ALL captures (let Stripe's graduated pricing handle free tier); idempotency key `{tenantId}:{period}:{captureCount}`.
    Over: (a) Separate hourly cron -- rejected to avoid double-invocation at :00 and duplicated wrangler.toml trigger blocks. (b) Per-capture real-time reporting -- rejected because it adds latency to the hot path and requires per-event retry logic. (c) Deduct free tier before reporting -- rejected to keep Stripe as single source of truth for pricing.
    Why: Hourly batching via the existing cron is the simplest architecture (zero new infrastructure). Reporting all captures ensures D1 counts match Stripe aggregated values exactly, making reconciliation trivial. State-derived idempotency keys are deterministic across retries.
- **Prompt**: |
    ## Task: Implement meter reporter module and wire into cron handler

    You are working on the WRL Cloudflare Worker. The D1 migration (0008) added `reported_capture_count` and `last_reported_at` columns to `usage_counters`. The pricing module (`src/pricing.js`) exports `computeBillableDelta(captureCount, reportedCaptureCount)`.

    ### Deliverable 1: `src/meter-reporter.js`

    Create a new module with one exported function:

    ```js
    /**
     * Report pending meter events to Stripe for all paid tenants.
     * Called once per hour from the cron handler.
     *
     * @param {object} env  Worker env bindings
     * @param {ExecutionContext} ctx
     */
    export async function reportPendingMeterEvents(env, ctx) { ... }
    ```

    **Implementation requirements:**

    1. **Query paid tenants with unreported usage:**
       ```sql
       SELECT uc.tenant_id, uc.period, uc.capture_count, uc.reported_capture_count,
              t.stripe_customer_id
       FROM usage_counters uc
       JOIN tenants t ON t.id = uc.tenant_id
       WHERE t.stripe_customer_id IS NOT NULL
         AND t.payment_method_added_at IS NOT NULL
         AND uc.capture_count > uc.reported_capture_count
         AND uc.period = ?
       ```
       Pass the current period (YYYY-MM format) as parameter. Import `computePeriod` from `./db.js`.

    2. **For each tenant with a delta > 0:**
       - Compute delta: `capture_count - reported_capture_count`
       - Build idempotency key: `${tenantId}:${period}:${captureCount}` (deterministic, state-derived)
       - Call `reportMeterEvent(env, { event_name: 'captures', payload: { stripe_customer_id: row.stripe_customer_id, value: String(delta) }, identifier: idempotencyKey, timestamp: Math.floor(Date.now() / 1000) })`
       - Import `reportMeterEvent` from `./stripe.js`
       - On success: UPDATE `usage_counters SET reported_capture_count = ?, last_reported_at = ? WHERE tenant_id = ? AND period = ?` using the snapshot `capture_count` value (NOT the current value -- captures may have arrived during the Stripe call).
       - On failure: log the error and do NOT update the watermark. The next hourly tick retries with the same or larger delta. The idempotency key changes if the count advanced (new events), stays the same if the count is identical (Stripe deduplicates).

    3. **Error handling per tenant:**
       Each tenant's reporting is independent. If tenant A fails, continue with tenant B. Catch errors per-tenant, not globally.

    4. **Coralogix logging** (use `log` from `./log.js`):
       - `meter.report_cycle_start` (severity 3): tenant count to evaluate
       - `meter.report_success` (severity 3): tenant_id, delta, identifier
       - `meter.report_fail` (severity 5): tenant_id, error message, capture_count, reported_capture_count
       - `meter.report_cycle_complete` (severity 3): total reported, total skipped (delta=0 after query), total failed, duration_ms

    5. **Month boundary handling**: Query only the current period. Previous-period unreported deltas are caught by querying the previous period as well. Add a second query for the previous period if `new Date().getUTCDate() <= 1 && new Date().getUTCHours() < 12` (first 12 hours of the month -- covers overnight unreported tail from prior month).

    ### Deliverable 2: Wire into cron handler

    Modify `src/index.js` in the `scheduled()` export (line ~297-299):

    ```js
    async scheduled(controller, env, ctx) {
      await handleScheduledTick(controller, env, ctx);
      if (new Date(controller.scheduledTime).getUTCMinutes() === 0) {
        ctx.waitUntil(reportPendingMeterEvents(env, ctx));
      }
    },
    ```

    Import `reportPendingMeterEvents` from `./meter-reporter.js` at the top of `index.js`.

    Do NOT modify `scheduler.js`. The meter reporter is a separate concern invoked from the cron entry point, not from the schedule fan-out logic.

    ### Deliverable 3: Tests in `test/meter-reporting.test.js`

    Create unit tests for `reportPendingMeterEvents`:

    **Test setup:**
    - Stub `globalThis.fetch` to intercept Stripe API calls (pattern from `test/billing.test.js`).
    - Use miniflare D1 for real database operations.
    - Seed tenants with `stripe_customer_id` and `payment_method_added_at` set.
    - Seed `usage_counters` with known `capture_count` and `reported_capture_count`.

    **Required tests:**
    1. Paid tenant with delta: reports correct value to Stripe, updates watermark
    2. Paid tenant with no delta (capture_count == reported_capture_count): no Stripe call
    3. Free tenant (no stripe_customer_id): skipped, no Stripe call
    4. Stripe 500 error: watermark NOT updated, error logged
    5. Stripe 409 (duplicate idempotency key): treat as success, update watermark
    6. Multiple tenants: each gets independent Stripe call; one failure doesn't block others
    7. Idempotency key format: assert key is `{tenantId}:{period}:{captureCount}`
    8. Watermark set to snapshot value: if capture_count=500 at read time, watermark set to 500 even if captures arrived during Stripe call

    **Integration test in `test/meter-batch.test.js`:**
    1. Hourly tick fires reporting: construct controller with `scheduledTime` at HH:00:00, verify Stripe call made
    2. Non-hourly tick skips reporting: construct controller with `scheduledTime` at HH:15:00, verify no Stripe call
    3. Concurrent with scheduled captures: both schedule fan-out AND meter reporting execute without interference

    Use `vi.useFakeTimers()` and `vi.setSystemTime()` for time control. Use `worker.scheduled(controller, env, ctx)` for integration tests (pattern from `test/scheduled-handler.test.js`).

    ### What NOT to do
    - Do NOT add a separate cron trigger to `wrangler.toml` -- piggyback on the existing `*/1 * * * *`.
    - Do NOT deduct the free tier (200) before reporting -- report ALL captures. Stripe's graduated pricing handles the free tier at EUR 0.00.
    - Do NOT modify `src/scheduler.js` -- keep schedule fan-out and meter reporting separate.
    - Do NOT add `STRIPE_CAPTURE_METER_ID` to wrangler.toml -- the meter event API uses `event_name` (string), not meter ID.
    - Do NOT add a reconciliation endpoint -- that's a future task.
    - Do NOT add retry logic beyond the natural hourly cadence -- if Stripe is down, next hour catches up.

    ### Context
    - `reportMeterEvent()` already exists in `src/stripe.js:119-121` and wraps `POST /v1/billing/meter_events`.
    - The Stripe meter event_name is `captures` (from CLAUDE.local.md).
    - `computePeriod()` from `src/db.js` returns the current `YYYY-MM` period string.
    - `log()` from `src/log.js` is the Coralogix logging function.
    - The worker's `STRIPE_SECRET_KEY` is already configured as a secret.
    - Existing cron entry point: `src/index.js` line 297-299.
    - Existing scheduled test pattern: `test/scheduled-handler.test.js`.

- **Deliverables**: `src/meter-reporter.js`, modified `src/index.js` (cron hook), `test/meter-reporting.test.js`, `test/meter-batch.test.js`
- **Success criteria**: Hourly tick reports correct deltas to Stripe. Non-hourly ticks skip reporting. Failed Stripe calls leave watermark unchanged. Idempotency keys are deterministic. All new tests pass. Existing scheduled-handler tests still pass.

---

### Cross-Cutting Coverage

- **Testing**: Covered. Each task includes its own test suite. Phase 6 (post-execution) will run the full test suite.
- **Security**: Not needed as a separate task. No new attack surface -- meter events use the existing `STRIPE_SECRET_KEY`. The dashboard endpoint already requires session auth. No user input handling changes.
- **Usability -- Strategy**: Addressed within Task 2's design. The billing sub-object serves the "understand my usage and costs" user job. Free tenants see tier information for conversion. `invoiceThreshold.met` is a convenience boolean for dashboard UX. Projected charges are explicitly deferred with an explanatory note.
- **Usability -- Design**: Not applicable. No UI components are produced -- only API endpoints. The dashboard UI is a future task.
- **Documentation**: Deferred to Phase 8 (post-execution). The pricing module and API response shape changes need API documentation updates. Phase 8 will assess and execute.
- **Observability**: Covered within Task 3. Coralogix logging for the full meter reporting lifecycle (start, success, fail, complete with metrics). No separate observability task needed -- the logging is integral to the reporter module.

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - observability-minion: Task 3 introduces a new hourly reporting cycle with Coralogix logging. Review that log levels, event names, and failure alerting thresholds are appropriate for a billing-critical pipeline.
    Review focus: Log event coverage for meter reporting, alerting gap for sustained Stripe failures.
- **Not selected**:
  - ux-design-minion: No UI components produced; only API JSON responses.
  - accessibility-minion: No web-facing HTML or UI produced.
  - sitespeed-minion: No web-facing pages; the dashboard endpoint adds <1ms of compute (pure arithmetic).
  - user-docs-minion: No user-facing documentation changes needed at plan stage; Phase 8 handles assessment.

### Decisions

- **Report all captures vs. deduct free tier**
  Chosen: Report all captures to Stripe, let graduated pricing handle free tier at EUR 0.00.
  Over: Deduct 200 in WRL code before reporting (iac-minion).
  Why: Single source of truth for pricing lives in Stripe. Reconciliation becomes `capture_count == aggregated_value` with no offset math. If free tier changes, only Stripe Dashboard config changes.

- **Columns on existing table vs. new table**
  Chosen: Add `reported_capture_count` and `last_reported_at` to `usage_counters`.
  Over: New `meter_reporting_log` table (iac-minion).
  Why: Same composite PK, avoids JOIN, no consistency boundary. KISS principle.

- **Idempotency key format**
  Chosen: `{tenantId}:{period}:{captureCount}` -- purely state-derived.
  Over: `wrl:{tenantId}:{period}:{hourTimestamp}:{fromCount}-{toCount}` (iac-minion).
  Why: Simpler, deterministic across retry windows, human-readable in Stripe Dashboard.

- **Billing data for all tenants vs. paid only**
  Chosen: Return `billing` sub-object for ALL tenants including free tier (api-design-minion, revised position).
  Over: `billing: null` for free tenants (api-design-minion, initial position).
  Why: Free tenants seeing tier information supports conversion UX. Amount is 0, tier is tier_0 -- semantically correct and useful.

### Risks and Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Tier definitions in `pricing.js` drift from Stripe Dashboard | High | Reconciliation endpoint (future task) will catch divergence. JSDoc comment in `pricing.js` flags the dependency. |
| Cron fires late or skips the :00 minute | Low | Next :00 catches up via watermark delta. Hourly SLA is acceptable. |
| Stripe API outage during reporting | Medium | Watermark not advanced; next hour retries. Idempotency key prevents double-counting if Stripe accepted but response was lost. Coralogix `meter.report_fail` logged at severity 5. |
| First report for existing tenants sends large cumulative count | Low | Stripe handles large single events fine. Idempotency key ensures retry safety. |
| D1 migration fails on production | Low | Standard `wrangler d1 migrations apply` with rollback. ALTER TABLE ADD COLUMN is non-destructive in SQLite. |
| Floating-point arithmetic in charges | Medium | Explicit rounding to 2 decimal places. Unit tests cover boundary values. Stripe handles actual billing math -- this is display only. |
| Race between `incrementUsage` and meter read | Low | D1/SQLite serializes writes. Meter read gets consistent snapshot. Captures during Stripe call caught next tick. |

### Execution Order

```
Task 1: Pricing module + migration  [NO DEPENDENCIES -- start immediately]
         |
         +-- APPROVAL GATE 1 --
         |
    +----+----+
    |         |
Task 2      Task 3
Dashboard   Meter reporter
(parallel)  (parallel)
    |         |
    +----+----+
         |
         +-- APPROVAL GATE 2 (Task 3 only) --
         |
    [Phase 3.5: Architecture Review]
         |
    [Phase 4: Execution]
         |
    [Phase 5: Code Review]
    [Phase 6: Test Execution]
    [Phase 8: Documentation Assessment]
```

**Batch 1**: Task 1 (blocking -- migration + pricing module)
**Gate 1**: Approve pricing tiers, migration schema, `calculateCharges` test results
**Batch 2**: Task 2 + Task 3 (parallel -- independent file ownership)
**Gate 2**: Approve meter reporter before execution (billing-critical path)

### External Skills

No external skills detected in project.

### Verification Steps

After all tasks complete:
1. Run full test suite: `npx vitest run` -- all existing and new tests pass.
2. Verify migration applies: `npx wrangler d1 migrations apply wrl-metadata --local` succeeds.
3. Verify no file ownership conflicts: Task 2 modifies only `src/account.js` and `test/account-usage.test.js`; Task 3 modifies only `src/index.js` and creates new files. No overlap.
4. Manual verification: `calculateCharges(10500)` returns `507.50` (9800*0.05 + 500*0.035).
5. Check that `reported_capture_count` column exists on `usage_counters` after migration.
6. Verify the existing `test/scheduled-handler.test.js` still passes (cron entry point was modified).
