## Observability Review

**Verdict: ADVISE**

The plan is sound and production-ready with two fixes needed before Task 5 executes.

---

### Issue 1 -- Severity inconsistency on `threatcheck.api_fail` (fix in Task 4 prompt)

The synthesis table in Task 5 lists `threatcheck.api_fail` at severity 5 (error). Task 3 correctly emits it at severity 5 for the pre-capture path. **Task 4 says "Log at severity 4"** for rescan API errors -- this is contradictory. The events land in Coralogix at different severities depending on where they originate.

The API-failures alert uses the query `event:"threatcheck.api_fail" AND context:"pre_capture"` so severity filtering is not the primary issue, but Coralogix alert definitions often include a severity floor. An operator querying `event:"threatcheck.api_fail"` and applying a severity filter will miss one class of events. Pick one severity and apply it consistently -- severity 4 (warn) for rescan (non-critical, retry-safe) and severity 5 (error) for pre-capture (safety gate degraded) is actually the correct split, but the event taxonomy table in Task 5 must reflect this distinction with two rows, not one.

**Fix**: In the Task 5 prompt, split `threatcheck.api_fail` into two rows in the event taxonomy table:
- `threatcheck.api_fail` with `context: 'pre_capture'` at severity 5 (error)
- `threatcheck.api_fail` with `context: 'rescan'` at severity 4 (warn)

---

### Issue 2 -- Task 4 does not instruct setting `context: 'rescan'` on API fail events (fix in Task 4 prompt)

The API-failures alert query relies on `context:"pre_capture"` to exclude rescan errors from paging. Task 3 explicitly sets `context: 'pre_capture'` in the log call. Task 4 tells the implementer to log API errors but **does not say to include `context: 'rescan'`**. Without this, rescan API errors either have no `context` field or include one only if the implementer infers it -- breaking the alert's filter assumption.

**Fix**: Add to the Task 4 error logging example:
```javascript
await log(env, 4, 'security', {
  event: 'threatcheck.api_fail',
  context: 'rescan',   // <-- add this
  url,
  durationMs: ...,
});
```

---

### Issue 3 -- No dead-man alert for the rescan cron (advisory, not blocking)

If the daily cron stops firing entirely (misconfiguration, Cloudflare outage, wrangler.toml regression), there is no detection. `threatcheck.rescan_tick` is the heartbeat but nothing alerts on its absence.

This is a YAGNI tradeoff for a single-operator project -- the cron will eventually produce visible symptoms (threat check timestamps stop advancing) and Coralogix supports time-relative alerts ("no events in X hours"). Recommend adding to the backlog rather than blocking this plan.

---

### Verified correct

- Alert thresholds are well-calibrated: >5 quarantines/24h (P3, self-healed) and >2 API failures/10min (P2, safety gate down) match the severity and urgency of each condition.
- The `rescan_tick` summary event (`scannedCount`, `flaggedCount`, `skippedCount`, `durationMs`) gives sufficient batch health visibility without per-URL logging noise.
- `threatcheck.quarantine` includes `captureId`, `tenantId`, `url`, and `threatTypes` -- enough for Coralogix drill-down without high cardinality explosion.
- The two-alert design (quarantine volume + API degradation) correctly separates "system is protecting" from "protection is broken."
- `context:"pre_capture"` scoping on the API-failures alert is the right call -- rescan errors are retry-safe and should not page.
- Audit schema additions (`threatTypes`, `context`, `scannedCount`, `flaggedCount`, `skippedCount`) are appropriate and complete.
