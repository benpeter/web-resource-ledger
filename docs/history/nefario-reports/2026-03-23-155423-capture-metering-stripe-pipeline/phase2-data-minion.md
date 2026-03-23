# Data Architecture: Stripe Meter Event Reporting

## Key Findings

### Current State

The codebase has a clean separation that makes metering straightforward:

1. **`usage_counters` table** (`tenant_id`, `period`) is the authoritative source of truth for capture counts per tenant per month. Period format is `YYYY-MM`. Incremented via `incrementUsage()` on every successful capture (both API-triggered and cron-scheduled).

2. **`reportMeterEvent()` in `src/stripe.js`** already wraps `POST /v1/billing/meter_events` but is never called. The backlog explicitly states: "Wire Stripe meter event reporting into capture pipeline -- `reportMeterEvent()` exists but is not called from the post-capture success path."

3. **Free tier** is 200 captures/month (`FREE_CAPTURE_LIMIT = 200`). Paid tenants (those with `payment_method_added_at != null`) have `Infinity` quota. Only paid tenants need meter reporting -- free tenants never generate billable events.

4. **Stripe meter configuration** (from `CLAUDE.local.md`): meter name is `captures`, using graduated pricing via lookup key `capture_volume_monthly`. First 200 captures are free in the Stripe pricing tiers (graduated: 1-200 free, 201-10k at 0.05 EUR, etc.). This means the free-tier deduction is handled by Stripe's graduated pricing, not by WRL filtering.

5. **No existing metering state**: there is no column or table tracking what has been reported to Stripe. The `usage_counters.capture_count` is the running total; there is nothing tracking "last reported count."

6. **Stripe meter event constraints**: identifiers are unique within a 24-hour rolling window, timestamps must be within past 35 days, rate limit is 1,000 calls/sec. Event summaries are eventually consistent.

---

## Recommendations

### Decision 1: Storage Location for Metering State

**Recommendation: Add columns to the existing `usage_counters` table.**

Add two columns:

```sql
ALTER TABLE usage_counters ADD COLUMN reported_capture_count INTEGER NOT NULL DEFAULT 0
  CHECK (reported_capture_count >= 0);
ALTER TABLE usage_counters ADD COLUMN last_reported_at TEXT;
```

**Rationale:**

- The data belongs with the usage it tracks. `usage_counters` already has the `(tenant_id, period)` composite PK that metering needs. Adding columns avoids a join and keeps the atomic unit of work (increment count + check reported delta) in one row.
- A separate table would add a JOIN to every reporting query and introduce a consistency boundary (two tables that must agree on the same `(tenant_id, period)` key). This is unnecessary complexity.
- KV is wrong for this: metering state must be durable, queryable (for reconciliation across all tenants), and transactional with the usage counters. KV is eventually consistent, not queryable in aggregate, and not transactional with D1.

**Rejected alternatives:**

- **New `meter_reports` table**: One row per report event would give full audit trail but is overkill. WRL does not need per-report history -- it needs to know the delta between actual and reported. The Stripe event summary API provides the audit trail on Stripe's side.
- **KV-based tracking**: Cannot be queried across tenants, no transactions with D1, eventually consistent. Would create a split-brain risk where D1 says 500 captures but KV says 300 reported.

---

### Decision 2: Idempotency Key Structure

**Recommendation: `{tenantId}:{period}:{captureCount}`**

Example: `acme:2026-03:450`

This means "I am reporting that tenant acme has reached 450 captures in the 2026-03 period." If the same count is reported again (retry, network failure, duplicate cron tick), Stripe deduplicates it automatically via the identifier's 24-hour uniqueness window.

**Why this structure works:**

- **Deterministic**: The same state always produces the same key. No timestamps, no random components. If the system crashes mid-report and retries, it computes the identical key.
- **Monotonically advancing**: As `capture_count` increases, the key naturally changes. Each new delta report gets a new key. There is no risk of a stale key collision blocking a legitimate new report.
- **Human-readable**: When debugging in Stripe's dashboard, `acme:2026-03:450` immediately tells you what was reported.
- **Within Stripe's 100-char limit**: Even with long tenant IDs (max 64 chars) + period (7) + count (up to 10 digits) + separators, this stays well under 100 characters.

**Rejected alternatives:**

- `{tenantId}:{period}:{timestamp}`: Timestamp-based keys are not idempotent across retries. If the cron fires at :00 and the report fails, the retry at :01 generates a different key, causing a duplicate charge in Stripe. This defeats the purpose of idempotency.
- `{tenantId}:{period}:{batchNumber}`: Requires tracking batch numbers -- additional state for no benefit over using the count itself.

---

### Decision 3: Free-Tier Deduction Strategy

**Recommendation: Do NOT deduct free-tier captures at reporting time. Report all captures to Stripe. Let Stripe's graduated pricing handle the free tier.**

The Stripe meter `captures` is configured with graduated pricing where the first 200 units are EUR 0.00. This means:

- If a tenant has 250 captures, report `value: 250` to Stripe. Stripe's graduated tier prices captures 1-200 at EUR 0.00 and captures 201-250 at EUR 0.05 each.
- WRL does not subtract 200 before reporting.

**Why this is correct:**

1. **Single source of truth for pricing**: Stripe owns the pricing tiers. If the free tier changes from 200 to 500, you change it in Stripe's price configuration, not in WRL code. No deploy needed.
2. **Reconciliation simplicity**: D1's `capture_count` should equal Stripe's `aggregated_value`. If WRL reports `capture_count - 200`, reconciliation must account for the offset, making the 1% tolerance check more error-prone.
3. **No edge cases**: What if a tenant is on a custom plan with 0 free captures? Or 500 free? Filtering at report time means WRL must know every plan's free tier. Reporting raw counts and letting Stripe handle pricing avoids this entirely.

**Important nuance:** WRL still needs `FREE_CAPTURE_LIMIT` for quota enforcement (blocking free-tier tenants at 200). But that is a gate, not a billing adjustment. The gate and the meter are independent concerns.

---

### Decision 4: Reporting Approach -- Incremental Delta vs. Cumulative

**Recommendation: Report incremental deltas (billable captures since last report), not cumulative totals.**

Stripe meters use `sum` aggregation by default. Each meter event's `value` field is added to the running total. To report that a tenant went from 300 to 350 captures:

```
event_name: "captures"
payload: { stripe_customer_id: "cus_xxx", value: "50" }
identifier: "acme:2026-03:350"
```

The `value` is the delta (50), not the cumulative total (350). The identifier encodes the cumulative count for idempotency.

**Why deltas:**

- Stripe's meter aggregation sums all events. If you report the cumulative total each time, Stripe would sum 300 + 350 = 650 instead of the correct 350.
- The formula is: `delta = capture_count - reported_capture_count`. After successful report, set `reported_capture_count = capture_count`.

**Atomicity concern:** The read-compute-report-update cycle must not race with `incrementUsage()`. Since D1 is SQLite-based and serializes writes, a transaction around "read capture_count, compute delta, update reported_capture_count" is safe. The Stripe API call happens between read and update, which means:

- Read `capture_count` (e.g., 350) and `reported_capture_count` (e.g., 300)
- Compute delta: 50
- Call Stripe `reportMeterEvent` with value=50, identifier=`acme:2026-03:350`
- On success: UPDATE `reported_capture_count = 350`, `last_reported_at = now()`
- If Stripe call fails: do nothing. Next cron tick retries with the same (or larger) delta
- If captures arrive between read and update: `reported_capture_count` is set to the snapshot value (350), not the current value. The additional captures are picked up on the next tick. No data is lost.

---

### Decision 5: Reconciliation Query Design

**Recommendation: D1 query for local state, Stripe meter event summary API for Stripe state, compare in application code.**

#### Local side (D1):

```sql
SELECT
  uc.tenant_id,
  uc.period,
  uc.capture_count,
  uc.reported_capture_count,
  uc.last_reported_at,
  t.stripe_customer_id
FROM usage_counters uc
JOIN tenants t ON t.id = uc.tenant_id
WHERE uc.period = ?
  AND t.stripe_customer_id IS NOT NULL
  AND t.payment_method_added_at IS NOT NULL
```

This gives all paid tenants' actual vs. reported counts for a period.

#### Stripe side:

```
GET /v1/billing/meters/{meter_id}/event_summaries
  ?customer={stripe_customer_id}
  &start_time={period_start_unix}
  &end_time={period_end_unix}
```

Returns `aggregated_value` -- the total Stripe has accumulated for that customer in the period.

#### Reconciliation logic:

```
local_count = capture_count           -- from D1
stripe_count = aggregated_value       -- from Stripe summary
tolerance = max(local_count * 0.01, 1)  -- 1% or at least 1 capture

if abs(local_count - stripe_count) > tolerance:
  flag as drift
```

**Implementation notes:**

- Stripe summaries are eventually consistent. Run reconciliation with a lag (e.g., reconcile yesterday's period, not today's). For within-month reconciliation, wait at least 5-10 minutes after the last report before comparing.
- The reconciliation should be an admin endpoint (`GET /v1/admin/billing/reconciliation?period=2026-03`) or a periodic cron job, not inline on every report.
- Log drift as severity 4 (warning). Severity 5 (error) only if drift exceeds 5% or the absolute difference exceeds 50 captures.
- Reconciliation requires the Stripe meter ID. Add `STRIPE_CAPTURE_METER_ID` as a wrangler.toml var (not a secret -- meter IDs are not sensitive).

---

### Decision 6: When to Report -- Trigger Mechanism

**Recommendation: Report from the existing cron trigger (fires every minute), NOT inline on every capture.**

The scheduler cron already fires every minute. Add a metering pass after the schedule fan-out:

1. Query all paid tenants where `capture_count > reported_capture_count` for the current period.
2. For each, compute delta, call `reportMeterEvent`, update `reported_capture_count`.

**Why cron, not inline:**

- **Batching**: At scale, reporting per-capture means one Stripe API call per capture. The cron batches all captures in the last minute into one report per tenant. At 1,000 captures/min across 50 tenants, that is 50 API calls/min instead of 1,000.
- **Failure isolation**: If Stripe is down, captures still succeed. The delta accumulates and is reported when Stripe recovers. Inline reporting would either fail the capture (unacceptable) or require async error handling that is effectively a deferred retry (i.e., what cron already does).
- **Latency**: Capture pipeline latency is critical (<300ms for the API response per the Helix Manifesto). Adding a Stripe API call in the hot path violates this.
- **Existing precedent**: The cron trigger already does tenant-grouped work (schedule evaluation). Adding metering to the same tick is architecturally consistent.

**Reporting cadence nuance:** The cron fires every minute, but metering does not need to run every tick. A simple check (`capture_count > reported_capture_count`) naturally throttles: if no new captures happened, no Stripe call is made. Consider adding a minimum delta threshold (e.g., only report if delta >= 1) to avoid trivial reports.

---

## Migration

### Migration 0008: Add metering columns

```sql
-- Track Stripe meter event reporting state alongside usage counters.
-- reported_capture_count: the capture_count value at last successful Stripe report.
-- last_reported_at: ISO 8601 timestamp of last successful report.
-- Both start at 0/NULL: existing rows have never been reported.

ALTER TABLE usage_counters ADD COLUMN reported_capture_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE usage_counters ADD COLUMN last_reported_at TEXT;
```

No CHECK constraint on `reported_capture_count >= 0` via ALTER TABLE (SQLite limitation, same as 0006_billing.sql). Enforce in application code.

No backfill needed: existing `usage_counters` rows get `reported_capture_count = 0` and `last_reported_at = NULL`, which means the first cron tick will report the full cumulative count for any paid tenant with existing usage. This is correct because Stripe has never received any events for these tenants.

### Environment variable addition

Add to `wrangler.toml` [vars] and [env.staging.vars]:

```toml
STRIPE_CAPTURE_METER_ID = "mtr_xxx"  # from Stripe Dashboard
```

---

## Risks and Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Cron tick fails mid-reporting** (partial tenants reported) | Low | Each tenant's report is independent. `reported_capture_count` is only updated on success. Failed tenants retry next tick. No global transaction needed. |
| **Stripe API outage** | Medium | Deltas accumulate in D1. When Stripe recovers, the next tick reports the full accumulated delta. Identifier changes (different count), so no dedup collision. Log Stripe errors at severity 4. |
| **Clock skew between D1 writes and cron ticks** | Low | `capture_count` is monotonically increasing. A slightly stale read means a slightly smaller delta; the remainder is caught next tick. No data loss. |
| **First report for existing tenants is large** | Low | If a tenant has 5,000 captures and `reported_capture_count = 0`, the first report sends value=5,000. Stripe handles this fine. The identifier `tenant:2026-03:5000` ensures idempotency if retried. |
| **Stripe summary eventual consistency breaks reconciliation** | Medium | Add lag to reconciliation (reconcile with 10+ minute delay). Document that real-time reconciliation is not possible. The 1% tolerance absorbs minor timing differences. |
| **Tenant reaches capture 200 in free tier, then adds payment** | Low | No issue: `reported_capture_count` starts at 0. First report after payment method added sends all captures (e.g., 200). Stripe's graduated pricing charges 0 for 1-200. Correct behavior. |
| **Race between `incrementUsage` and metering read** | Low | D1 is SQLite -- writes are serialized. The metering read gets a consistent snapshot. Captures arriving during the Stripe API call are counted on the next tick. |

---

## Dependencies and Requirements

1. **Stripe meter ID** must be provisioned in both sandbox and production Stripe accounts. The meter event_name is `captures` (per CLAUDE.local.md). The meter ID (`mtr_xxx`) needs to be added as `STRIPE_CAPTURE_METER_ID` env var.

2. **Only report for paid tenants**: The reporting query must filter on `payment_method_added_at IS NOT NULL` AND `stripe_customer_id IS NOT NULL`. Free-tier tenants must never generate Stripe meter events.

3. **Stripe API version**: The existing `STRIPE_API_VERSION = '2025-04-30.basil'` supports meter events. No version change needed.

4. **The cron handler** (`src/scheduler.js` / `handleScheduledTick`) needs to be extended or a parallel handler needs to be added. Recommendation: add a separate function `reportMeterEvents(env, ctx)` called from the same scheduled handler, after schedule processing completes. This keeps concerns separated.

5. **Reconciliation endpoint** should be admin-only (`/v1/admin/billing/reconciliation`), behind `verifyAdminKey`.

---

## Additional Specialist Input

No additional specialists beyond those already in the planning are needed. However, I want to flag for **iac-minion**: the `STRIPE_CAPTURE_METER_ID` env var needs to be added to both production and staging wrangler.toml configs, and stored in the WRL 1Password vault for reference.

For **test-minion**: the key testing scenarios are:
- Delta computation: `capture_count=350, reported_capture_count=300` -> reports value=50
- Idempotency: same count produces same identifier, Stripe dedup prevents double-charge
- Skip free tenants: no Stripe call when `payment_method_added_at` is null
- Cron failure recovery: failed report leaves `reported_capture_count` unchanged, next tick retries
- Reconciliation within 1% tolerance

---

## Schema Summary

```
usage_counters (existing + new columns)
+-------------------------+----------+--------------------------------------+
| Column                  | Type     | Notes                                |
+-------------------------+----------+--------------------------------------+
| tenant_id               | TEXT PK  | existing                             |
| period                  | TEXT PK  | existing, YYYY-MM                    |
| capture_count           | INTEGER  | existing, actual captures            |
| storage_bytes           | INTEGER  | existing                             |
| api_call_count          | INTEGER  | existing                             |
| reported_capture_count  | INTEGER  | NEW, default 0, last reported total  |
| last_reported_at        | TEXT     | NEW, ISO 8601, null until reported   |
| created_at              | TEXT     | existing                             |
| updated_at              | TEXT     | existing                             |
+-------------------------+----------+--------------------------------------+
```

The delta to report is always: `capture_count - reported_capture_count`.
The idempotency identifier is always: `{tenant_id}:{period}:{capture_count}`.
After successful report: `SET reported_capture_count = {capture_count at read time}`.
