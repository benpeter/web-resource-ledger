# Phase 2: IAC Minion -- Stripe Meter Reporting Infrastructure

## Domain Perspective

Infrastructure-as-code, Cloudflare Workers platform constraints, cron trigger architecture, idempotency patterns, retry/failure handling, and Stripe API integration mechanics.

## Key Findings

### Current State Assessment

1. **Single cron trigger** fires `*/1 * * * *` (every minute) routed to `handleScheduledTick()` via `index.js:297-298`. The `scheduled()` export is a one-liner that delegates entirely to `scheduler.js`.

2. **`controller.cron`** is the discriminator for multi-cron Workers. Cloudflare supports multiple cron expressions in `wrangler.toml`'s `crons` array, and the handler receives the exact cron string that fired -- you switch on it.

3. **`reportMeterEvent()` exists** in `stripe.js:119-121` -- it wraps `POST /v1/billing/meter_events` via the shared `stripeRequest()` helper. It is never called anywhere.

4. **`usage_counters`** table has `(tenant_id, period)` as composite PK, where `period` is `YYYY-MM`. It tracks `capture_count`, `storage_bytes`, `api_call_count`. There is no "last reported to Stripe" watermark anywhere.

5. **Tenant -> Stripe mapping**: `tenants.stripe_customer_id` (nullable) links a tenant to Stripe. `payment_method_added_at` is non-null only for paid tenants. Free tenants (no payment method) should never have usage reported to Stripe.

6. **Free tier**: `FREE_CAPTURE_LIMIT = 200`. First 200 captures/month are free. Only captures beyond 200 should generate Stripe meter events.

### Stripe Meter Events API Contract

- **Endpoint**: `POST /v1/billing/meter_events`
- **Required params**: `event_name` (string, matches meter's event_name), `payload` (object with `stripe_customer_id` and `value` fields by default)
- **Optional params**: `identifier` (string, max 100 chars -- acts as idempotency key, uniqueness enforced for 24+ hours), `timestamp` (unix seconds, must be within past 35 calendar days)
- **Rate limit**: 1,000 events/second (v1 API). For WRL's scale this is not a concern.
- **No batch endpoint on v1**: Each meter event is a separate HTTP call. The v2 `meter_event_stream` supports 10k/s but requires session tokens with 15-min expiry -- unnecessary complexity for WRL's volume.

## Recommendation: Option (b) -- Piggyback on Existing Cron with Hour-Boundary Detection

### Why Not (a) -- Separate Hourly Cron

Adding a second cron expression (e.g., `0 * * * *`) would work and is clean from a routing perspective (`switch (controller.cron)`). However:

- It doubles the number of cron invocations visible in the platform (separate billing, separate logs).
- The `wrangler.toml` already has environment-specific trigger blocks that must be duplicated (`[triggers]`, `[env.staging.triggers]`).
- The scheduled handler already fires every minute. An hourly cron would fire at :00 alongside the per-minute cron, creating a potential double-invocation at the top of each hour. Not a correctness issue (idempotency handles it), but messy.

A separate cron is defensible but adds no value over detecting the hour boundary inside the existing handler.

### Why Not (c) -- Per-Capture Real-Time Reporting

Per-capture `ctx.waitUntil` reporting to Stripe has appeal (immediate, simple). But:

- **Free tier deduction is stateful**: You must know the tenant's current monthly count to determine whether capture #N is billable. That requires reading `usage_counters` for the period, comparing against `FREE_CAPTURE_LIMIT`, and only reporting the delta. Doing this on every capture adds a D1 read to the hot path, and races between concurrent captures could double-report or skip.
- **Failure isolation is poor**: If Stripe is down, every capture's `ctx.waitUntil` fails independently. You need retry logic per-capture, which means tracking which individual captures have been reported -- far more state than a periodic batch.
- **Volume**: Even modest usage generates many individual Stripe API calls when a single hourly aggregate would do. Stripe's docs explicitly recommend aggregation over per-event reporting.

Real-time reporting is YAGNI at WRL's scale and adds complexity for no benefit.

### Option (b) Design: Hourly Batch via Minute-Cron

**Trigger**: The existing `*/1 * * * *` cron. At the top of each hour (when `scheduledTime` minutes === 0), after processing due schedules, execute the meter reporting step.

**Flow**:

1. `handleScheduledTick()` runs as normal (schedule fan-out).
2. After schedule processing, check: `new Date(controller.scheduledTime).getUTCMinutes() === 0`.
3. If yes, call `handleMeterReporting(env, ctx)`.
4. Query all tenants that are paid (have `stripe_customer_id IS NOT NULL AND payment_method_added_at IS NOT NULL`) and have `usage_counters.capture_count > 0` for the current period.
5. For each tenant, read `capture_count` from `usage_counters` and `last_reported_capture_count` from a new tracking table/column.
6. Compute `billable_delta = max(0, capture_count - max(last_reported_capture_count, FREE_CAPTURE_LIMIT)) - max(0, last_reported_capture_count - FREE_CAPTURE_LIMIT)`. Simplified: only report captures above 200 that have not already been reported.
7. If `billable_delta > 0`, call `reportMeterEvent()` with that aggregate value.
8. On success, update `last_reported_capture_count` to `capture_count`.

**Why `ctx.waitUntil` for meter reporting**: The meter reporting step should run inside `ctx.waitUntil()` to avoid extending the cron handler's wall-clock time. If it fails, the next hourly tick catches up automatically (the watermark was not advanced).

## Detailed Infrastructure Design

### New D1 Table: `meter_reporting_log`

A new migration (0008) should create a table that tracks the last successfully reported watermark per tenant per period:

```sql
CREATE TABLE meter_reporting_log (
  tenant_id              TEXT NOT NULL REFERENCES tenants(id),
  period                 TEXT NOT NULL CHECK (period GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]' AND length(period) = 7),
  last_reported_captures INTEGER NOT NULL DEFAULT 0,
  last_reported_at       TEXT,
  PRIMARY KEY (tenant_id, period)
);
```

**Why a separate table instead of adding a column to `usage_counters`**: The `usage_counters` table is written on every capture (hot write path). The reporting watermark is written once per hour. Mixing concerns risks contention and makes the schema less clear. A separate table also makes it trivial to audit: "what has been reported to Stripe?" is a single-table query.

### Idempotency Key Strategy

The Stripe meter event `identifier` field provides deduplication with a 24+ hour window. The key must be:
- **Deterministic** for the same reporting window (so retries produce the same key)
- **Unique** across tenants and periods

Proposed format: `wrl:{tenantId}:{period}:{hourTimestamp}:{fromCount}-{toCount}`

Example: `wrl:gh_12345:2026-03:2026-03-23T14:00:00Z:200-347`

This encodes exactly what is being reported: tenant, period, the hour it was reported in, and the capture range. If the same hourly tick retries (e.g., Stripe was down, next hour catches up), the `fromCount-toCount` portion changes because `toCount` now reflects the newer `capture_count`, so it correctly produces a new event for the new delta -- not a duplicate.

If the exact same delta is retried within the same hour (e.g., `ctx.waitUntil` failed but a manual retry fires), the identifier is identical and Stripe deduplicates.

### Meter Event Payload

```javascript
{
  event_name: 'captures',           // matches the Stripe meter name
  payload: {
    stripe_customer_id: tenant.stripeCustomerId,
    value: String(billableDelta),    // Stripe expects string values
  },
  timestamp: Math.floor(Date.now() / 1000),  // unix seconds
  identifier: idempotencyKey,
}
```

### Retry and Failure Handling

1. **Transient Stripe failures**: If `reportMeterEvent()` throws, log the error to Coralogix and do NOT update `last_reported_captures`. The next hourly tick will recompute the delta and retry. No explicit retry loop needed -- the hourly cadence is the retry mechanism.

2. **Persistent Stripe failures**: If Stripe is down for multiple hours, the delta accumulates. When Stripe comes back, a single meter event covers the full unreported range. This is correct because Stripe meters aggregate by period, not by event count.

3. **D1 failures**: If the `meter_reporting_log` update fails after a successful Stripe call, the next tick will re-report the same range. The `identifier` deduplicates it on Stripe's side. This is safe.

4. **Partial tenant failures**: Each tenant's reporting is independent. If tenant A fails, tenant B still succeeds. Failures are logged per-tenant.

### Billable Delta Calculation (Precise)

```javascript
function computeBillableDelta(captureCount, lastReportedCaptures, freeTierLimit) {
  // Total billable captures ever this period
  const totalBillable = Math.max(0, captureCount - freeTierLimit);
  // Already reported
  const alreadyReported = Math.max(0, lastReportedCaptures - freeTierLimit);
  // Delta to report now
  return totalBillable - alreadyReported;
}
```

This handles all edge cases:
- Tenant at 150 captures (below free tier): `totalBillable = 0`, delta = 0. Nothing reported.
- Tenant at 250 captures, last reported 0: `totalBillable = 50`, `alreadyReported = 0`, delta = 50.
- Tenant at 350 captures, last reported 250: `totalBillable = 150`, `alreadyReported = 50`, delta = 100.
- Tenant at 200 exactly: `totalBillable = 0`, delta = 0. Free tier boundary, nothing reported.

### Cron Handler Changes

In `scheduler.js` (or a new `meter-reporter.js`):

```
// In handleScheduledTick, after schedule processing:
if (new Date(controller.scheduledTime).getUTCMinutes() === 0) {
  ctx.waitUntil(reportPendingMeterEvents(env));
}
```

**Separation of concerns**: The meter reporting logic should live in a new `meter-reporter.js` module, not inline in `scheduler.js`. The scheduler's responsibility is capture fan-out; meter reporting is billing infrastructure. The cron handler in `index.js` should dispatch to both:

```javascript
async scheduled(controller, env, ctx) {
  await handleScheduledTick(controller, env, ctx);
  if (new Date(controller.scheduledTime).getUTCMinutes() === 0) {
    ctx.waitUntil(reportPendingMeterEvents(env, ctx));
  }
}
```

### wrangler.toml Changes

**None required.** The existing `*/1 * * * *` cron trigger is sufficient. No new bindings, no new queues, no new KV namespaces. The only infrastructure change is the D1 migration.

### Coralogix Logging

Every meter reporting cycle should log:
- `meter.report_cycle_start` -- how many tenants to evaluate
- `meter.report_skip` -- tenant below free tier or no stripe_customer_id (log level 3, debug)
- `meter.report_success` -- tenant, delta reported, identifier used (log level 3, info)
- `meter.report_fail` -- tenant, error message, captures not reported (log level 5, error)
- `meter.report_cycle_complete` -- total reported, total skipped, total failed, duration_ms

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Cron fires late or skips a minute | Meter reporting delayed by up to 1 hour | Acceptable -- hourly is the SLA. If :00 is missed, :00 of the next hour catches up via watermark delta. |
| D1 read contention during reporting | Slow queries at top of hour | Reporting reads are a single indexed query (`payment_method_added_at IS NOT NULL`). At WRL's tenant count this is trivial. |
| Stripe API errors during reporting | Usage not reported | Watermark not advanced; next hour retries. Identifier deduplicates if Stripe accepted but response was lost. |
| Free tier boundary race | Capture count crosses 200 between hourly ticks | No race -- we read the authoritative D1 count at reporting time and compute the exact delta. The watermark ensures no double-reporting. |
| Month boundary | `period` changes at midnight UTC | Each period has its own watermark row. A new period starts at `last_reported_captures = 0`. Previous period's unreported tail gets reported in the first tick of the new month (the query should also check the previous period if its watermark is behind). |

## Dependencies

1. **D1 migration** (data-minion): `0008_meter_reporting_log.sql` -- the table schema above.
2. **Stripe meter configuration** (external): The `captures` meter must exist in both Stripe sandbox and production with `event_payload_key = stripe_customer_id` and `value_settings.event_payload_key = value`. This is a Stripe Dashboard configuration step, not code.
3. **`STRIPE_SECRET_KEY`** (already configured): The worker secret is already set via `wrangler secret put` per CLAUDE.local.md. No new secrets needed.

## Specialist Gaps

- **Observability-minion** should define Coralogix alerting rules for `meter.report_fail` events. A sustained failure (e.g., 3+ consecutive hours with failures for the same tenant) should trigger an alert.
- **Data-minion** should validate the `meter_reporting_log` table design and confirm the query pattern for "all paid tenants with unreported usage" is efficient given D1/SQLite constraints (JOIN on `tenants` + `usage_counters` + `meter_reporting_log`).

## Summary

Use the existing per-minute cron with hour-boundary detection. No new cron triggers, no new queues, no new KV namespaces. One new D1 table (`meter_reporting_log`) tracks the reporting watermark. One new module (`meter-reporter.js`) computes billable deltas, calls `reportMeterEvent()`, and advances watermarks. Idempotency via deterministic `identifier` strings. Retry via natural hourly cadence. Free tier deduction via arithmetic on the watermark, not per-event filtering. Total infrastructure change: one D1 migration.
