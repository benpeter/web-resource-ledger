# Gru Technology Review -- Phase 3.5

**Verdict: ADVISE**

---

## [Stripe API]: Idempotency key uniqueness window is 24 hours, not indefinite

SCOPE: Task 3 (`src/meter-reporter.js`), idempotency key design (Conflict 3).

CHANGE: The plan treats `{tenantId}:{period}:{captureCount}` as safe for replay across any retry window. Stripe enforces identifier uniqueness within a **rolling 24-hour window only**. If a Stripe outage lasts longer than 24 hours and the capture count has NOT advanced (same key, same count), the retry will be treated as a new event, not a deduplicated one, resulting in double-reporting.

Verified: Stripe docs confirm "we will enforce uniqueness within a rolling period of at least 24 hours" -- this is a window, not a permanent dedup store.

WHY: The plan's idempotency argument ("same D1 snapshot always produces the same key") is correct for short retry windows (hours). For extended outages (>24h), a tenant frozen at the same count will re-report the same delta when the outage clears. This is a low-probability but non-zero billing correctness risk.

TASK: Add a guard in the `meter.report_fail` path: if `last_reported_at` is older than 20 hours and the count has not advanced, log at severity 5 with a `stale_unreported_delta` flag so the operator can investigate before the 24h dedup window expires. No automatic behavior change required -- just observable signal. Document the 24h constraint in a JSDoc comment on the idempotency key construction.

---

## [Stripe API]: 409 response for duplicate identifier is not confirmed behavior

SCOPE: Task 3 (`test/meter-reporting.test.js`), test case 5.

CHANGE: The plan specifies "Stripe 409 (duplicate idempotency key): treat as success, update watermark." Stripe's meter event API documentation does not document a 409 response for duplicate identifiers -- the deduplication is silent (the event is simply ignored). There is no confirmed HTTP status code for this case in the v1 API. Testing against a hardcoded 409 expectation may be asserting behavior that doesn't exist, or that could differ from reality.

WHY: A test asserting 409 treatment is either dead code (Stripe never returns 409) or fragile against undocumented behavior. Either way it gives false confidence.

TASK: Remove the 409 test case or convert it to a generic "non-2xx Stripe error treated as retryable" test. The idempotency mechanism works by Stripe silently accepting the duplicate and returning 200 -- test that scenario (duplicate key, HTTP 200 response, watermark updated) instead.

---

## [Stripe API]: `reportMeterEvent` call signature does not match current `stripe.js`

SCOPE: Task 3 (`src/meter-reporter.js`), the `reportMeterEvent` call in the prompt.

CHANGE: The task prompt calls `reportMeterEvent(env, { event_name, payload, identifier, timestamp })`. The existing `stripe.js:119-121` wraps `stripeRequest(env, 'POST', '/v1/billing/meter_events', params)` -- it passes params directly as the body. The Stripe v1 meter events API expects `payload[stripe_customer_id]` and `payload[value]` as form-encoded nested fields. The `flattenParams()` function in `stripe.js` handles bracket notation, so this should work correctly -- BUT only if the payload is passed as a nested object. The prompt shows `payload: { stripe_customer_id: row.stripe_customer_id, value: String(delta) }` which is correct. This is not a blocking issue but the iac-minion should verify the final form-encoded output against the Stripe API spec during implementation (log the request in tests).

WHY: Mis-encoded meter events are silently rejected or attributed to the wrong customer. Given this is the financial pipeline, confirm encoding before first production run.

TASK: Add an assertion in `test/meter-reporting.test.js` that the stubbed `globalThis.fetch` received a body containing `payload%5Bstripe_customer_id%5D=` (URL-encoded bracket notation) to catch any encoding regression.

---

## [Cron architecture]: Piggybacking on per-minute cron is sound -- no concerns

The plan's choice to use `getUTCMinutes() === 0` detection on the existing `*/1 * * * *` cron is correct. Cloudflare Cron Triggers fire on schedule with potential drift of a few seconds but are reliable enough for hourly watermark-based reporting. The watermark design means a missed :00 tick is harmless -- the next :00 catches up. APPROVE this aspect.

---

## [D1 column approach]: Sound and future-proof -- no concerns

Adding two columns to `usage_counters` is the right call for WRL's scale. The KISS argument wins over the separate table. D1/SQLite's serialized writes eliminate the write contention concern. APPROVE this aspect.

---

## [Free-tier reporting decision]: Report-all-to-Stripe is the correct technology choice

Single source of truth for pricing in Stripe Dashboard is a strong argument. Reconciliation simplicity (`capture_count == aggregated_value`) is real. The graduated tier at EUR 0.00 for 1-200 is already configured in the Stripe sandbox. This is the right call. APPROVE this aspect.

---

## [Stripe API version]: 2025-04-30.basil in stripe.js

The worker is pinned to `STRIPE_API_VERSION = '2025-04-30.basil'`. The meter events API (`/v1/billing/meter_events`) exists in this version. No version compatibility concerns for this feature.

---

**Summary of required actions (non-blocking, ADVISE level):**
1. Add stale-delta logging guard for the >20h unreported case (24h dedup window risk)
2. Fix/remove the 409 test case -- replace with confirmed behavior (200 on silent dedup)
3. Add encoding assertion in tests to catch `flattenParams` regression on meter event payload
