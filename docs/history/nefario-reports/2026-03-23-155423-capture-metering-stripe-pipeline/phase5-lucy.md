# Lucy Review: R31 Capture Metering to Stripe Pipeline (Issue #108)

## VERDICT: ADVISE

Two minor issues and one dead-code nit. No drift, no CLAUDE.md violations, no missing requirements. The implementation is well-scoped and proportional to the problem.

---

## Requirements Traceability

| Requirement (from prompt.md) | Plan Element | Status |
|---|---|---|
| Usage records reported to Stripe for captures meter at least hourly | `reportPendingMeterEvents` called from `scheduled()` on `UTCMinutes === 0` | COVERED |
| Volume discount tiers: 0.05/0.035/0.015 | `VOLUME_TIERS` in `pricing.js` matches Stripe config | COVERED |
| First 200 captures/month free | `tier_0` at unitPrice 0 for 1-200; Decision #2 documents deviation from literal "not reported" in favor of Stripe-side graduated pricing | COVERED (with documented rationale) |
| Dashboard endpoint shows captures, charges, tier, threshold | `handleAccountGetUsage` returns `billing` sub-object with all four | COVERED |
| EUR 5 invoice threshold | `INVOICE_THRESHOLD_EUR = 5.00`, surfaced in `billing.invoiceThreshold` | COVERED (enforcement is Stripe-side config, documented in decisions.md) |
| Idempotent usage reporting | `identifier = wrl-meter:{tenantId}:{period}:{captureCount}` | COVERED |
| Failed submissions retried and logged | catch block logs at severity 5 with error details; Cron re-runs hourly so unadvanced watermarks are retried | COVERED |
| Watermark only advances on success | UPDATE runs only after Stripe 200 | COVERED |
| Not on capture hot path | `ctx.waitUntil` in scheduled handler | COVERED |
| Out of scope: storage/API call metering | Not present in code | CORRECTLY EXCLUDED |

No orphaned tasks. No unaddressed requirements.

---

## Findings

### [ADVISE] src/pricing.js:83-85 -- `computeBillableDelta` is exported but never imported outside tests

CHANGE: `computeBillableDelta(captureCount, reportedCaptureCount)` is exported from `pricing.js`. It computes `Math.max(0, captureCount - reportedCaptureCount)`.

WHY: `meter-reporter.js` computes the delta inline (`const delta = captureCount - reportedCaptureCount`) at line 62 rather than calling `computeBillableDelta`. The function exists only in `pricing.js` and `pricing.test.js` -- no production code imports it. This is dead code by YAGNI standards. If it exists for documentation value, an inline comment in `meter-reporter.js` achieves the same with less surface area.

FIX: Either (a) import and use `computeBillableDelta` in `meter-reporter.js` line 62, or (b) remove the function from `pricing.js` and its tests from `pricing.test.js`. Option (a) is cleaner -- it centralizes the "never negative" guard.

---

### [ADVISE] src/meter-reporter.js:97-109 -- catch block does not re-throw; failure count logged but not surfaced to caller

CHANGE: Per-tenant Stripe failures are caught, logged at severity 5, and counted in `failedCount`. The function returns `void` regardless of how many tenants failed.

WHY: This is correct isolation behavior -- one tenant's failure must not block others. However, the `failedCount` is only emitted in the cycle-complete log line. The caller (`scheduled()` in `index.js:301`) uses `ctx.waitUntil` and has no way to observe whether 100% of tenants failed. If the Stripe secret key is wrong or Stripe is fully down, every cycle silently fails until someone checks Coralogix. This is consistent with the "fail loudly" principle only if Coralogix alerting is configured for `meter.report_fail` events. The catch block itself is properly loud (severity 5 with error details), so this is not a violation -- it is an operational gap to be aware of.

FIX: No code change required. Document in the phase's `outcome.md` that a Coralogix alert on `meter.report_fail` (or on `meter.report_cycle_complete` where `failedCount > 0`) should be configured as a follow-up operational task.

---

### [NIT] test/fixtures.js:384 -- `seedUsageCounter` INSERT does not include `reported_capture_count` column

CHANGE: Migration 0008 adds `reported_capture_count INTEGER NOT NULL DEFAULT 0` to `usage_counters`. The `seedUsageCounter` fixture uses a plain INSERT with explicit columns `(tenant_id, period, capture_count, storage_bytes, api_call_count)`, relying on the DEFAULT 0 for the new column.

WHY: This works correctly because DEFAULT 0 applies. The `meter-reporting.test.js` file has its own `seedUsage` helper that explicitly sets `reported_capture_count`. No bug here -- just noting that `seedUsageCounter` in fixtures will always seed with `reported_capture_count = 0`, which is the expected default for account-usage tests. If a future test needs a non-zero watermark via `seedUsageCounter`, the helper would need updating. Acceptable as-is.

FIX: None required. The implicit default is correct for all current callers.

---

## Scope Assessment

No scope creep detected. The implementation adds exactly:
- 1 new module (`pricing.js`) -- graduated pricing logic
- 1 new module (`meter-reporter.js`) -- Stripe meter event submission
- 1 migration (0008) -- two columns on existing table
- 1 new handler added to existing module (`handleAccountGetUsage` in `account.js`)
- 1 route registration and 1 scheduled-handler line in `index.js`
- 4 test files covering the new functionality

All traceable to stated requirements. No unnecessary abstractions. Proportional complexity.

## CLAUDE.md Compliance

- **Fail loudly**: All catch blocks log errors with specifics (severity, error message, HTTP status, Stripe error type). No silent swallows. The `catch {}` at `account.js:148` and `account.js:416` are for JSON parse validation -- they return a 400 problem response, which is an existing pattern in the codebase, not a silent catch.
- **YAGNI/KISS**: Implementation is lean. Pure functions, no unnecessary abstractions. The `computeBillableDelta` dead code noted above is the only minor deviation.
- **Latency**: Meter reporting is off the hot path (scheduled handler, `ctx.waitUntil`). Usage endpoint does D1 reads only -- no Stripe round-trips (documented in decisions.md).
- **Test the real boundaries**: Tests use `SELF.fetch()` with real miniflare D1. Stripe API is mocked (appropriate for unit/integration -- real Stripe testing would be end-to-end).
- **Code signature**: `// tva` present in `pricing.js:1`, `meter-reporter.js:1`, `account-usage.test.js:1`.
