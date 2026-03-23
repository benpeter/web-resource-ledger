# Test Minion Review: capture-metering-stripe-pipeline

## Verdict: ADVISE

---

### [testing]: `reportMeterEvent` call signature mismatch in Task 3 prompt

**SCOPE**: Task 3, `src/meter-reporter.js` and `test/meter-reporting.test.js`

**CHANGE**: The Task 3 prompt instructs the implementer to call `reportMeterEvent` with this signature:

```js
reportMeterEvent(env, {
  event_name: 'captures',
  payload: { stripe_customer_id: row.stripe_customer_id, value: String(delta) },
  identifier: idempotencyKey,
  timestamp: Math.floor(Date.now() / 1000),
})
```

But `reportMeterEvent` in `src/stripe.js` is a thin wrapper:

```js
export function reportMeterEvent(env, params) {
  return stripeRequest(env, 'POST', '/v1/billing/meter_events', params);
}
```

`stripeRequest` form-encodes `params` using `flattenParams`. The Stripe Billing Meter Events API (`POST /v1/billing/meter_events`) expects the idempotency key as an HTTP header (`Idempotency-Key`), NOT as a body field. Body fields are `event_name`, `payload[stripe_customer_id]`, `payload[value]`, and `timestamp`. The `identifier` field is not a recognized Stripe field and will be silently dropped or cause a validation error.

**WHY**: If the implementation passes `identifier` as a body parameter it will either be ignored or rejected by Stripe. The idempotency key must be sent via the `Idempotency-Key` header. `stripeRequest` currently has no mechanism to pass custom request headers. The test suite for `meter-reporting.test.js` will stub `globalThis.fetch`, so tests will pass regardless -- but production will not send the idempotency key, making every retry a potential double-charge.

**TASK**: Before execution of Task 3, either: (a) extend `stripeRequest` (or `reportMeterEvent`) to accept an optional `idempotencyKey` parameter and inject it as the `Idempotency-Key` header, OR (b) call `stripeRequest` directly from `meter-reporter.js` with the header set inline. The Task 3 test for idempotency key format (test 7) must assert that `Idempotency-Key` appears as a request header in the stubbed `fetch` call, not as a body field.

---

### [testing]: Month boundary query logic is untested

**SCOPE**: Task 3, `test/meter-reporting.test.js`

**CHANGE**: The prompt specifies that the reporter runs a second query for the previous period when `getUTCDate() <= 1 && getUTCHours() < 12`. There are no tests specified for this path -- neither for the trigger condition nor for the data it reports.

**WHY**: Month-boundary bugs in billing code are high-impact. An off-by-one in the date check (e.g., `<` vs `<=`, or a timezone edge case) silently drops unreported tail usage from the prior month. The existing `vi.useFakeTimers()` / `vi.setSystemTime()` tooling makes this testable at zero additional infrastructure cost.

**TASK**: Add two tests to `test/meter-reporting.test.js`:
- `scheduledTime` set to the first of a month at 06:00 UTC, prior-period usage_counter row present: assert Stripe called for prior period.
- `scheduledTime` set to the second of a month at 00:01 UTC: assert prior period NOT queried (only current period processed).

---

### [testing]: Stripe 409 idempotency success path needs assertion precision

**SCOPE**: Task 3, `test/meter-reporting.test.js`, test case 5

**CHANGE**: The prompt says "Stripe 409 (duplicate idempotency key): treat as success, update watermark." This is correct behavior but the HTTP status 409 is the wrong Stripe status for idempotency collisions. Stripe returns `200` with a replayed response object when the same idempotency key is reused with identical parameters. Stripe returns `422` (`idempotency_key_in_use`) when the same key is used concurrently with a request in flight.

**WHY**: If the implementation special-cases HTTP 409, the test will pass but the code will never fire in practice (Stripe never returns 409 for meter events). The real idempotency behavior to test is: calling `reportMeterEvent` a second time with the same idempotency key and same payload returns a successful 200 response, and the watermark update is idempotent. The test should verify the `422` concurrent-use case is handled as a transient error (watermark NOT updated, retry next hour).

**TASK**: Update test case 5 to stub Stripe returning 200 with a replayed response (simulating duplicate idempotency key replay) and assert watermark is updated. Add a separate test for 422 `idempotency_key_in_use` asserting it is treated as a transient failure (watermark not updated, same as 500 case).

---

### [testing]: Task 2 test -- field presence assertion will break existing tests if `billing` key is not added

**SCOPE**: Task 2, `test/account-usage.test.js` line 102

**CHANGE**: The existing assertion at line 102 uses `Object.keys(body).sort()` with an exact equality match. Task 2 is instructed to add `'billing'` to this array. This is correct. However, if Task 2 is not merged before Task 2 tests run (or if there is any execution ordering issue), the existing test on line 102 will fail because the `billing` key will appear in the response but not in the expected array.

**WHY**: This is a sequencing risk, not a logic risk. The plan handles it via the approval gate on Task 1 before Task 2 starts. This is noted as already covered -- but the agent executing Task 2 must treat the existing line 102 assertion as a single atomic update, not leave a partially updated state where the response includes `billing` but the assertion doesn't.

**TASK**: No action required beyond ensuring Task 2 makes the line 102 update in the same commit as the `handleAccountGetUsage` change. Call this out explicitly in the Task 2 prompt or as a gate check.

---

### [testing]: `seedUsageCounter` fixture is safe but Task 3 tests need a `reported_capture_count` override

**SCOPE**: Task 3, `test/meter-reporting.test.js`

**CHANGE**: `seedUsageCounter` in `test/fixtures.js` uses named columns (`tenant_id, period, capture_count, storage_bytes, api_call_count`) so the migration adding `reported_capture_count DEFAULT 0` and `last_reported_at` will not break existing tests. However, the Task 3 meter-reporting tests need to seed rows where `reported_capture_count` differs from `capture_count` to exercise the delta path. The current `seedUsageCounter` signature has no parameter for `reported_capture_count`.

**WHY**: Without the ability to seed a custom `reported_capture_count`, the Task 3 tests will have to use raw DB prepares for every test setup, leading to repetitive boilerplate and risking inconsistency. More critically, test case 8 (watermark set to snapshot value) requires careful setup of `reported_capture_count` to a specific starting value.

**TASK**: Task 1 should add `reportedCaptureCount = 0` as an optional parameter to `seedUsageCounter` and include it in the INSERT. This is a small additive change with zero risk of breaking existing callers (default keeps existing behavior).
