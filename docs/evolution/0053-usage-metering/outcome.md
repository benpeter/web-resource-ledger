# Outcome: R25 Usage Metering

## What Was Built

Per-tenant usage metering for WRL. Three counters tracked per tenant per calendar month (UTC): capture count, storage bytes, and API call count. Counters increment via D1 UPSERT on each relevant operation. An admin endpoint (`GET /v1/admin/usage`) exposes usage data for billing and quota enforcement.

### Files Created

| File | Purpose |
|------|---------|
| `migrations/0002_usage_counters.sql` | D1 schema: `usage_counters` table with composite PK, CHECK constraints, FK to tenants |
| `test/usage-counters.test.js` | 20 unit tests for DAL functions (computePeriod, incrementUsage, getUsage, schema constraints) |
| `test/admin-usage.test.js` | 16 integration tests for the admin usage endpoint via SELF.fetch() |

### Files Modified

| File | Changes |
|------|---------|
| `src/db.js` | Added 4 exports: `computePeriod()`, `incrementUsage()`, `getUsage()`, `tenantExists()`. Updated module header. |
| `src/index.js` | Added route for GET /v1/admin/usage. Added deferred usage increments in queue consumer (captures + storageBytes) and 3 authenticated handlers (apiCalls). |
| `src/capture.js` | `performCapture()` now returns `{ ok: true, storedBytes }` with consistent UTF-8 byte counting across all artifacts. |
| `src/admin.js` | Added `handleAdminGetUsage` handler with tenant/period validation, tenant existence check, and usage query. |
| `openapi.yaml` | Added `/v1/admin/usage` GET path with `UsageResponse` schema. |
| `test/fixtures.js` | Added `cleanDb` statement for usage_counters. Added `seedUsageCounter` helper. |
| `test/capture.test.js` | Updated assertion for storedBytes in performCapture return value. |

### Test Results

791 tests pass, 2 skipped (pre-existing). Zero new failures.

## Success Criteria Verification

| Criterion | Status |
|-----------|--------|
| D1 records per-tenant counters | Done: usage_counters table with capture_count, storage_bytes, api_call_count |
| Counters increment on relevant operations | Done: queue consumer (captures + bytes), 3 API handlers (apiCalls) |
| GET /v1/admin/usage?tenant={tenantId} | Done: returns current-period usage with admin auth |
| GET /v1/admin/usage?tenant={tenantId}&period=YYYY-MM | Done: returns specific period usage |
| Billing period is calendar month (UTC) | Done: computePeriod() uses toISOString().slice(0,7) |
| Eventually consistent | Done: all increments via ctx.waitUntil() |
| Persisted in D1 | Done: D1 UPSERT, not in-memory |
| Monotonically increasing within period | Done: UPSERT only adds, CHECK constraints prevent negatives |

## Code Review Findings (3 auto-fixed)

1. Raw `env.DB.prepare()` in admin.js → centralized `tenantExists()` in db.js
2. Inconsistent byte counting (String.length vs TextEncoder) → standardized on TextEncoder
3. Test timezone sensitivity (local Date vs UTC) → use `computePeriod()` import

## Backlog Changes

- **Marked done**: R25 Usage Metering added to Done section
- **No new backlog items**: all scope items completed; no deferred work
- **Existing related item unchanged**: "Billing and quotas" remains in Parking Lot (monetization not yet planned)
