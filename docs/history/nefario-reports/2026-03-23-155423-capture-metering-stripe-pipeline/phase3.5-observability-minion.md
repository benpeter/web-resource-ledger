# Observability Review: capture-metering-stripe-pipeline

**Verdict: ADVISE**

---

## Concerns

### [observability-1]: No subsystem name in Task 3 log calls — `meter` vs `billing` inconsistency

**SCOPE**: Task 3 prompt, `src/meter-reporter.js` log calls

**CHANGE**: The Task 3 prompt specifies log call signature as `log(env, severity, subsystem, data)` with subsystem implied as `'meter'` (event names use `meter.` prefix). However, all existing Stripe-related logs use subsystem `'billing'` (see `src/billing.js`). The prompt does not explicitly state what subsystem string to pass.

**WHY**: Coralogix filters and alert rules are written against the `subsystemName` field. If meter events land under a new `'meter'` subsystem, any existing Coralogix saved searches, dashboards, or alert rules scoped to `'billing'` will silently miss them. Conversely, if the agent uses `'billing'`, the event names (`meter.report_fail`) feel out of place and may conflict with future billing subsystem queries.

**TASK**: The Task 3 prompt must explicitly specify `subsystem: 'meter'` for all `log()` calls in `src/meter-reporter.js`, AND document that this is a new subsystem distinct from `'billing'`. If Coralogix alert rules already exist scoped to `'billing'`, this needs a note that meter failures require a separate alert targeting subsystem `'meter'`.

---

### [observability-2]: No alerting strategy for sustained Stripe API failures — the "silent drain" gap

**SCOPE**: Task 3 design, Risks table, Cross-Cutting Coverage

**CHANGE**: The plan acknowledges Stripe API outages as a medium-severity risk and notes that `meter.report_fail` is logged at severity 5. But there is no alert defined for this condition. A single Stripe error that fires at :00 will log severity 5 and... nothing happens. The next hour retries. If Stripe is degraded for 6 hours, the operator receives no page — only 6 severity-5 log entries that nobody will see unless they are actively watching logs.

This is the alerting gap the synthesis itself flagged as the reason for selecting observability-minion. The plan does not close it.

**WHY**: This is a billing-critical pipeline. Missed meter events directly translate to lost revenue — unlike application errors that surface via user complaints, a silent meter reporting failure can go unnoticed for days. The error budget for a "charges get correctly submitted" SLO burns silently. Severity 5 in Coralogix is a log level, not a page.

**TASK**: Add an explicit alert specification to the plan (or as a note in `meter-reporter.js`):
- Alert name: `meter_reporting_sustained_failure`
- Trigger: `meter.report_fail` events in Coralogix with count >= 3 within a 3-hour window for any single `tenant_id`
- OR: `meter.report_cycle_complete` where `failed > 0` for 3 consecutive cycles (3 hours)
- Severity: critical (page on-call)
- Runbook note: check Stripe status page, check `usage_counters.reported_capture_count` vs `capture_count` gap

This alert does not need to be implemented as an infrastructure change (delegate to iac-minion), but it must be specified so that when the feature ships, the operator knows the gap exists and what to create.

---

### [observability-3]: `meter.report_fail` is missing the Stripe HTTP status code and error type

**SCOPE**: Task 3 prompt, `meter.report_fail` log event specification

**CHANGE**: The prompt specifies:
```
meter.report_fail (severity 5): tenant_id, error message, capture_count, reported_capture_count
```

The `stripeRequest` function in `src/stripe.js` throws errors with `.status` (HTTP status code) and `.stripeErrorType` attached. These are not included in the `meter.report_fail` payload.

**WHY**: Without the HTTP status code, an operator seeing `meter.report_fail` in Coralogix cannot distinguish:
- Stripe API is down (503) — infrastructure incident, wait it out
- Rate limited (429) — reduce cadence or batch
- Authentication failure (401) — secret rotation broke the key
- Invalid request (400) — code bug in meter event format
- Idempotency conflict (409) — this is treated as success per spec but if mishandled, shows as fail

All of these require different responses. "error message" alone is insufficient for triage without reading the Stripe error body. The HTTP status narrows the space immediately.

**TASK**: Update the `meter.report_fail` log specification to include `stripeStatus: err.status ?? null` and `stripeErrorType: err.stripeErrorType ?? null`. Both fields are already on the thrown Error object from `stripeRequest`.

---

### [observability-4]: `meter.report_cycle_start` logs tenant count but not the query period

**SCOPE**: Task 3 prompt, `meter.report_cycle_start` log event specification

**CHANGE**: The prompt specifies:
```
meter.report_cycle_start (severity 3): tenant count to evaluate
```

The reporting query runs against a specific `period` (YYYY-MM). This period is not included in the cycle_start event.

**WHY**: During month boundaries (the first 12 hours of a new month), the reporter runs two queries: one for the current period and one for the prior period. If both queries run and both produce `cycle_start` events, an operator looking at logs cannot tell whether the "15 tenants to evaluate" refers to the current period, the prior period, or a combined view. This makes debugging month-boundary behavior impossible without reading code.

**TASK**: Update `meter.report_cycle_start` to include `period` (the YYYY-MM string being queried). If two queries run (month boundary), each should emit its own `cycle_start` / `cycle_complete` pair tagged with its period, not a single combined event. This also applies to `meter.report_cycle_complete`.

---

### [observability-5]: Watermark snapshot value not logged on success

**SCOPE**: Task 3 prompt, `meter.report_success` log event specification

**CHANGE**: The prompt specifies:
```
meter.report_success (severity 3): tenant_id, delta, identifier
```

On success, the watermark is advanced to the snapshot `capture_count` value. This value is not logged.

**WHY**: The identifier (`{tenantId}:{period}:{captureCount}`) encodes the capture count, so a reader *can* derive it. But the `reported_capture_count` before the update (i.e., the previous watermark) is not visible anywhere in the success log. For reconciliation purposes — comparing WRL's reported totals against Stripe's `aggregated_value` — an operator needs to know: "what was the previous watermark before this report?"

Without the `from` value, reconstructing the reporting history from logs requires chaining `meter.report_success` events and computing deltas backward, which is error-prone.

**TASK**: Add `captureCountSnapshot` (the value the watermark was advanced to) and `previousReportedCount` (the value before this report) to `meter.report_success`. The data is already in scope when logging — no additional DB queries needed.
