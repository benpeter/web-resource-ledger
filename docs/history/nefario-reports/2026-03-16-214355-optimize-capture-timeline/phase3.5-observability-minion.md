# Observability Review -- optimize-capture-timeline

**Verdict: ADVISE**

The plan is directionally sound but has three gaps worth fixing before execution.

---

## Gap 1: `capture.success` log event does not include settle telemetry

**Severity: Medium**

The plan adds `settleMs` and `settleReason` to the `render` object returned by the renderer, and that `render` object does get passed through to `completeCapture()` (and appears in the KV record). However, it is not included in the `capture.success` log event (lines 222-235 of capture.js).

The existing `capture.success` event already logs `consentDurationMs`, `consentStatus`, and `consentCmp` as top-level fields -- following this pattern, `settleMs` and `settleReason` belong there too.

**Why this matters**: Coralogix queries for "how often are pages hitting the 3s cap vs settling early" must target the `capture.success` event to avoid a full-text scan over stored KV records. If settle fields are only in KV, an operator cannot answer "what fraction of pages hit the cap today?" from logs alone.

**Fix**: In the `capture.success` log event, add:
```js
settleMs: render?.settleMs ?? null,
settleReason: render?.settleReason ?? null,
```

---

## Gap 2: Consent error log event does not include enough context to distinguish error cause

**Severity: Medium**

The planned `capture.consent_error` log event is:
```js
{ event: 'capture.consent_error', captureId, tenantId, cip }
```

This is a warning-level log (level 4) that tells operators a consent error occurred, but contains no error details. When an operator sees this in Coralogix, they cannot answer:
- Was it a TypeError (e.g., the adobe.com scenario)?
- Was it a network error during autoconsent script injection?
- Was it something else entirely?

The plan's selective propagation already classifies browser-death errors separately (they get re-thrown and land in `capture.stage.fail`), so anything reaching the catch block is specifically consent-library-level. That's useful -- but the operator still needs the error class and a truncated message to diagnose patterns.

**Why this matters**: The prompt explicitly calls out the adobe.com TypeError as the known failure case. Without the error class in the log, there is no way to confirm from Coralogix that the fix resolved the specific TypeError pattern -- or to discover if a different error class starts appearing.

**Fix**: Pass `errorClass` and `errorMessage` into the log event:
```js
await log(env, 4, 'capture', {
  event: 'capture.consent_error',
  captureId,
  tenantId,
  cip,
  errorClass: err?.constructor?.name ?? 'Unknown',
  errorMessage: String(err?.message ?? '').slice(0, 256),
});
```

This matches the pattern used in `capture.stage.fail` and `capture.fail`.

---

## Gap 3: No log signal when the 2s consent timeout fires

**Severity: Low -- but worth explicit acknowledgment**

The plan relies on "existing `consentDurationMs` telemetry" to detect if 2s is too aggressive (noted in the risks table). This is accurate: the `capture.success` log event already includes `consentDurationMs` and `consentStatus`. If `consentStatus === 'timeout'` and `consentDurationMs` clusters near 2000ms in Coralogix, that is a clear signal.

This is sufficient for monitoring -- no code change needed. Operators should set a Coralogix query like:
```
event:"capture.success" AND consentStatus:"timeout"
```
and watch for a cluster of `consentDurationMs` values near 2000. If that count rises post-deploy, the timeout is too aggressive.

Document this query somewhere (PR description is fine) so it is not rediscovered after an incident.

---

## What looks correct

- `settleMs` / `settleReason` field names are consistent. The plan uses `settledMs` / `settledBy` inside `waitForSettle()` but maps them to `settleMs` / `settleReason` in the render object -- those are the right names for the schema (shorter, consistent with `durationMs`).
- `pendingAtCap` is not in the plan. The reference implementation resolves with `{ settledMs, settledBy }` and does not surface the inflight count at cap time. This is acceptable: `settleReason: 'cap'` is the operator signal. A high `settleMs` + `reason: 'cap'` is the actionable combination. The inflight count would be nice-to-have but is not a gap.
- Consent `'error'` vs `'failed'` distinction in the API response is handled correctly by the ternary. Coralogix queries on `consentStatus` will see distinct values. The gap is only in the log event (Gap 2 above).
- The `capture.consent_error` event being placed in `performCapture()` rather than the renderer is correct -- this is where `env`, `captureId`, `tenantId`, and `cip` are available.

---

## Summary of required changes

The two medium-severity gaps should be addressed in the Task 1 prompt before execution:

1. Add `settleMs` and `settleReason` to the `capture.success` log event.
2. Add `errorClass` and `errorMessage` to the `capture.consent_error` log event.

The low-severity gap (Gap 3) requires no code change -- just a note in the PR description pointing operators to the Coralogix query for monitoring consent timeout behavior post-deploy.
