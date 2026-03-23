# Outcome: eIDAS Qualified Timestamps

## What was built

Tenants can now opt in to eIDAS-qualified RFC 3161 timestamps on their account. When enabled, every capture receives a second timestamp from a qualified TSA (configurable, starting with Sectigo), in addition to the standard DigiCert timestamp. The feature is billed as a per-capture add-on via a separate Stripe meter.

## Files changed (24 files, +935/-98 lines)

### New files
- `migrations/0011_eidas.sql` -- D1 migration: `eidas_qualified` on tenants, `eidas_capture_count` + `reported_eidas_count` on usage_counters
- `docs/operations/runbooks/qualified-tsa-failures.md` -- Runbook for the new Coralogix alert

### Modified source files
- `src/rfc3161.js` -- Added `options.auth` parameter for HTTP Basic auth on TSA requests
- `src/wacz.js` -- Added sequential qualified TSA call after standard, new `rfc3161_qualified` signature type
- `src/verify.js` -- Added Check 5: qualifiedTimestamp verification
- `src/db.js` -- Added `setEidasQualified`, `getEidasQualified`, extended `incrementUsage` with eidasCaptures
- `src/quotas.js` -- Threads `eidasQualified` through `checkQuota` result
- `src/meter-reporter.js` -- Dual-meter reporting with independent watermarks for captures and eidas_timestamps
- `src/pricing.js` -- Added `EIDAS_UNIT_PRICE_EUR` and `EIDAS_FREE_LIMIT` constants
- `src/account.js` -- Added `handleGetSettings` and `handleUpdateSettings` with field allowlist, payment method check, CSRF
- `src/index.js` -- New routes, CSRF for PATCH, queue message enrichment, pipeline threading, meter-only-on-success billing
- `src/capture.js` -- Threads `qualifiedTimestamps` through to `buildWacz`, enriches logs
- `src/responses.js` -- Added 402 status title

### Modified UI files
- `src/ui/ui-settings.js` -- Add-ons section with eIDAS toggle, inline confirmation, 402 handling
- `src/ui/ui-css.js` -- Toggle switch styles
- `src/ui/ui-detail.js` -- Timestamp status row in capture detail
- `src/verify-page.js` -- Qualified timestamp labels

### Modified config/ops files
- `wrangler.toml` -- QUALIFIED_TSA_URL in production and staging vars
- `wrangler.test.toml` -- Mirrored QUALIFIED_TSA_URL
- `vitest.config.js` -- Test binding for QUALIFIED_TSA_URL
- `scripts/provision-alerts.sh` -- New qualified TSA failures alert
- `docs/operations/alerts.md` -- Alert documentation
- `docs/audit-log-schema.md` -- New events: capture.qtsa_fail, tenant.settings_change

### Modified test files
- `test/meter-reporting.test.js` -- Updated idempotency key format for dual-meter

## Test results

All 1174 tests pass (2 skipped, pre-existing). Zero new test failures introduced.

## What deviated from the plan

1. **5s timeout instead of 3s**: The issue specified a 3s timeout for the qualified TSA. The plan chose 5s based on specialist input that qualified TSA responses include larger certificate chains. Documented in decisions.md.

2. **PATCH /v1/account/settings instead of PUT /v1/tenant/settings**: Two deviations from the issue -- PATCH (safer for growing surface) and `/v1/account/` (matches existing session-gated namespace). Both documented in decisions.md.

3. **Free tier: 50 (not 100)**: The issue says "first 100/month include qualified timestamps at no extra charge" but the Stripe graduated pricing has first 50 free. We followed the Stripe configuration as source of truth -- the meter reporter reports all eIDAS captures and Stripe handles free tier via graduated pricing.

4. **No calculateEidasCharges function**: Margo ADVISE noted this was dead code since Stripe handles billing. Dropped per YAGNI.

5. **No buildToggleRow helper**: Margo ADVISE said to build inline since there's only one add-on. Adopted.

6. **src/responses.js modified**: Not in the plan, but the 402 status code needed a title mapping for RFC 9457 problem responses to work correctly.

## What was NOT built (deferred)

- Dedicated eIDAS test suite (deferred to Phase 6 / future PR)
- End-to-end test against real qualified TSA endpoint
- Provisioning of QUALIFIED_TSA_AUTH secret (manual ops step)
- Verification of actual Sectigo qualified endpoint URL before production deployment

## Backlog changes

- R40 (eIDAS qualified timestamps) should be marked as done
- Deferred: dedicated eIDAS test coverage (integration tests with mock qualified TSA)
- Deferred: verify Sectigo qualified endpoint URL is correct before production launch
- Deferred: provision QUALIFIED_TSA_AUTH secret for production/staging
