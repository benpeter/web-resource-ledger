## Domain Plan Contribution: observability-minion

### Recommendations

#### 1. Logging Events: Schema and Severity

All Safe Browsing log events should use `subsystem: 'security'` since this is a content-safety gate analogous to the existing SSRF prevention (`security.ssrf_block`). The `security` subsystem is already established for URL-blocking decisions. Using a new subsystem would fragment the operator's ability to query all URL-blocking events in one Lucene filter.

The proposed event prefix `safebrowsing.*` is fine for the `event` field -- it follows the existing `{domain}.{action}` pattern (e.g., `capture.fail`, `security.ssrf_block`, `webhook.deliver`). However, note the distinction: the **subsystem** stays `security`, while the **event name** uses the `safebrowsing.` prefix.

**Proposed events:**

| Event | Severity | Subsystem | When | Key Fields |
|-------|----------|-----------|------|------------|
| `safebrowsing.check` | 3 (info) | security | Pre-capture URL check passes (URL is clean) | `captureId`, `tenantId`, `url`, `cip`, `durationMs` |
| `safebrowsing.block` | 5 (error) | security | Pre-capture URL check fails (URL flagged as unsafe) | `captureId`, `tenantId`, `url`, `cip`, `threatTypes` (array), `responseStatus` |
| `safebrowsing.quarantine` | 4 (warn) | security | Existing capture quarantined during rescan | `captureId`, `tenantId`, `url`, `threatTypes`, `previousStatus` |
| `safebrowsing.rescan_tick` | 3 (info) | security | Periodic rescan batch completed | `scannedCount`, `flaggedCount`, `durationMs`, `triggerTime` |
| `safebrowsing.api_fail` | 5 (error) | security | Google Safe Browsing API returned an error or timed out | `url` (if single-URL check), `errorMessage` (truncated to 256 chars), `httpStatus` (if available), `context` (`'pre_capture'` or `'rescan'`) |

**Severity rationale aligned with existing conventions:**

- **Severity 3 (info):** Successful operations and routine audit events. `safebrowsing.check` and `safebrowsing.rescan_tick` are normal-path operations, consistent with `capture.start` (sev 3) and `schedule.tick_complete` (sev 3).
- **Severity 4 (warn):** Degraded but acceptable outcomes, or events requiring attention but not immediate action. `safebrowsing.quarantine` is sev 4 because it represents a state change that the operator should be aware of (a capture was retroactively marked unsafe), but it is the system working correctly -- similar to `capture.tsa_fail` (sev 4) where the system degrades gracefully.
- **Severity 5 (error):** Failures that indicate something is broken or a security-relevant block occurred. `safebrowsing.block` is sev 5 because it is a security boundary decision that prevented a capture -- consistent with `security.ssrf_block` (sev 5). `safebrowsing.api_fail` is sev 5 because API failure means the safety check could not be performed, and the system must decide whether to proceed without it or fail closed -- that decision outcome matters.

**Dropped event: `safebrowsing.rescan_tick` as originally proposed**

The original question listed `safebrowsing.rescan_tick` as one of the events. I recommend keeping it but adjusting the semantics: it should fire once per rescan batch (similar to `schedule.tick_complete`), not once per URL scanned. Per-URL scanning at info severity during rescans would generate high log volume proportional to the total capture count. The batch-level summary is sufficient for operational monitoring.

**What NOT to log:**

- Raw Safe Browsing API responses (may contain internal Google metadata)
- Full threat match details beyond `threatTypes` array (keep the log payload small)
- User-supplied URLs in error messages from the API (the `url` field is already post-`validateUrl`, so it is safe per the existing invariant in `log.js`)

#### 2. Alert Design

**New alert: [WRL] Safe Browsing Quarantines**

| Property | Value |
|----------|-------|
| **Query** | `event:"safebrowsing.quarantine"` (app: wrl, subsystem: security) |
| **Threshold** | > 5 events in 24 hours |
| **Priority** | P3 (Low) |
| **Time Window** | `LOGS_TIME_WINDOW_VALUE_HOURS_24` |
| **Notification** | Email to bp@ben-peter.com, 60-minute suppression |

**Threshold rationale:** Quarantines from rescans indicate URLs that were safe at capture time but have since been flagged. Five in 24 hours is notable because it suggests either: (a) a targeted attack where an attacker captured a URL, then made it malicious after capture, or (b) a broader web safety issue affecting multiple captures. At WRL's current volume, even one quarantine per day would be unusual. The threshold of 5 provides headroom for false positives (Google's Safe Browsing lists have a documented false positive rate). P3 priority because the operator's immediate action is "review and verify" -- the captures are already quarantined, so the system has self-healed.

**Should Safe Browsing API failures get a separate alert?**

**Yes, but only for pre-capture failures.** Here is the reasoning:

- **Pre-capture `safebrowsing.api_fail` events deserve their own alert** because they represent a decision point: if the API is unavailable, the system must choose between failing open (allowing potentially unsafe captures) or failing closed (rejecting all captures). Either way, the operator needs to know the safety gate is non-functional. This is analogous to the TSA Failures alert -- a third-party dependency is down, degrading the service.

- **Rescan `safebrowsing.api_fail` events do NOT need a separate alert.** Rescan failures are retry-safe (the next scheduled rescan will re-attempt). They would be caught by the existing `[WRL] Worker Errors (5xx)` alert if the rescan cron handler returns a 5xx, or by the operator reviewing `safebrowsing.rescan_tick` logs where `flaggedCount` + scan errors don't add up to `scannedCount`.

**Proposed alert: [WRL] Safe Browsing API Failures**

| Property | Value |
|----------|-------|
| **Query** | `event:"safebrowsing.api_fail" AND context:"pre_capture"` (app: wrl, subsystem: security) |
| **Threshold** | > 2 events in 10 minutes |
| **Priority** | P2 (Medium) |
| **Time Window** | `LOGS_TIME_WINDOW_VALUE_MINUTES_10` |
| **Notification** | Email to bp@ben-peter.com, 60-minute suppression |

**Threshold rationale:** Mirrors the TSA Failures pattern (>2 in 10 min) since the failure mode is identical: an external API is down, degrading every capture. P2 (not P1) because unlike capture failures, the captures themselves may still succeed -- they just lack the safety check. The operator's response is to monitor Google's API status and decide whether to temporarily disable the check or halt captures. Two failures in 10 minutes rules out a single network blip.

**Why not rely on the existing Worker Errors (5xx) alert?** The Worker Errors alert catches 5xx HTTP responses from the WRL worker. If the Safe Browsing check fails but the system degrades gracefully (returns a capture with `safeBrowsingStatus: 'error'` similar to `tsaStatus: 'error'`), the HTTP response would be 200/202, not 5xx. The API failure would be invisible to the Worker Errors alert.

#### 3. Fail-Open vs. Fail-Closed Decision (Impacts Logging)

The implementation must decide what happens when the Safe Browsing API is unreachable. This decision affects which events fire and at what severity:

- **Fail closed (recommended for pre-capture):** Return HTTP 503 to the client. Log `safebrowsing.api_fail` at sev 5. The capture does not proceed. This is the safe default -- an unverified URL should not be captured.
- **Fail open (acceptable for rescans):** Log `safebrowsing.api_fail` at sev 4, skip the URL in this rescan cycle, retry on the next tick. Existing captures are not retroactively quarantined just because the API is down.

The severity of `safebrowsing.api_fail` should vary by context: sev 5 for pre-capture (user-facing failure), sev 4 for rescan (retry-safe degradation). The `context` field (`'pre_capture'` vs `'rescan'`) enables differentiated alerting.

#### 4. Audit Log Schema Updates

Add the following rows to `docs/audit-log-schema.md`:

**New events for the Event Taxonomy table:**

| Event | Subsystem | Severity | Description |
|-------|-----------|----------|-------------|
| `safebrowsing.check` | security | 3 (info) | URL passed Safe Browsing check |
| `safebrowsing.block` | security | 5 (error) | URL blocked by Safe Browsing (pre-capture) |
| `safebrowsing.quarantine` | security | 4 (warn) | Existing capture quarantined (rescan) |
| `safebrowsing.rescan_tick` | security | 3 (info) | Periodic rescan batch completed |
| `safebrowsing.api_fail` | security | 5 (error) | Safe Browsing API error/timeout |

**New audit fields:**

| Field | Type | Description |
|-------|------|-------------|
| `threatTypes` | string[] | Google Safe Browsing threat type identifiers |
| `safeBrowsingStatus` | string | `'clean'`, `'flagged'`, `'error'`, `'skipped'` |
| `previousStatus` | string | Capture status before quarantine |
| `scannedCount` | number | URLs scanned in rescan batch |
| `flaggedCount` | number | URLs flagged in rescan batch |
| `context` | string | `'pre_capture'` or `'rescan'` |

#### 5. Runbook for Quarantine Alert

Create `docs/operations/runbooks/safe-browsing-quarantines.md` following the existing runbook pattern. Key sections:

- **Check:** Coralogix query `event:"safebrowsing.quarantine" AND applicationName:"wrl"` -- look at `url`, `captureId`, `tenantId`, `threatTypes`
- **Likely causes:** (a) URL was legitimate at capture time but subsequently compromised, (b) Google Safe Browsing false positive, (c) Attacker deliberately captured a URL then made it malicious
- **Fix:** (1) Review the flagged URLs against Google's Transparency Report (transparencyreport.google.com/safe-browsing), (2) If false positive, un-quarantine via admin API, (3) If confirmed malicious, verify quarantine is working (artifacts are inaccessible), (4) If pattern suggests abuse, investigate the tenant

Create `docs/operations/runbooks/safe-browsing-api-failures.md`:

- **Check:** Coralogix query `event:"safebrowsing.api_fail" AND applicationName:"wrl"`
- **Likely causes:** (a) Google Safe Browsing API key invalid or quota exhausted, (b) Google API service degradation, (c) Network issue between Cloudflare Worker and Google APIs
- **Fix:** (1) Check Google Cloud Console for API key status and quota, (2) Check Google Cloud Status Dashboard, (3) If sustained outage, decide whether to temporarily bypass the check (risk: unsafe URLs captured) or halt captures (risk: service downtime)

#### 6. Provisioning Script Update

Add two new `*_payload()` functions to `scripts/provision-alerts.sh`:

- `safebrowsing_quarantines_payload()` -- the quarantine count alert
- `safebrowsing_api_failures_payload()` -- the API failure alert

Add two new `upsert_alert` calls in the `main()` function. Update the final success message count from "All 4 alerts" to "All 6 alerts".

Update `docs/operations/alerts.md` with the two new alert definitions following the existing format (table + rationale + runbook link).

#### 7. Dashboard Considerations

No new Grafana dashboard is needed at this stage (WRL uses Coralogix for log-based monitoring, not Grafana). However, consider adding a Coralogix saved query or custom dashboard widget:

- **Safe Browsing block rate over time:** `event:"safebrowsing.block" OR event:"safebrowsing.quarantine"` grouped by hour. Useful to spot trends without waiting for the threshold alert.
- **API health check:** `event:"safebrowsing.api_fail"` count over time. Useful during incident response to see whether API failures are ongoing.

These are not blocking for the implementation but would be valuable for the operator post-launch.

### Proposed Tasks

1. **Add Safe Browsing log events to capture pipeline.** Instrument the pre-capture check with `safebrowsing.check` (pass) and `safebrowsing.block` (fail) events. Add `safebrowsing.api_fail` with `context: 'pre_capture'`. Use `log(env, severity, 'security', { event, ... })` following the existing pattern in `src/index.js` where SSRF blocks are logged.

2. **Add Safe Browsing log events to rescan logic.** Instrument the rescan batch handler with `safebrowsing.rescan_tick` (batch summary) and `safebrowsing.quarantine` (per-quarantine). Add `safebrowsing.api_fail` with `context: 'rescan'` for API errors during rescan.

3. **Update `docs/audit-log-schema.md`.** Add the five new events to the Event Taxonomy table. Add the six new audit fields to the Audit Fields table.

4. **Add alert payloads to `scripts/provision-alerts.sh`.** Two new payload functions (`safebrowsing_quarantines_payload`, `safebrowsing_api_failures_payload`), two new `upsert_alert` calls, updated success message.

5. **Update `docs/operations/alerts.md`.** Add the two new alert definitions with threshold rationale and runbook links.

6. **Write runbooks.** Create `docs/operations/runbooks/safe-browsing-quarantines.md` and `docs/operations/runbooks/safe-browsing-api-failures.md` following the existing format in the runbooks directory.

7. **Add Coralogix example queries to `docs/audit-log-schema.md`.** Add Safe Browsing-specific query examples at the bottom of the existing examples section.

### Risks and Concerns

1. **Log volume from `safebrowsing.check` events.** Every successful capture will produce a `safebrowsing.check` log entry in addition to the existing `capture.start`. At scale this doubles the security-subsystem log volume per capture. Consider whether this event should be sev 6 (verbose) instead of sev 3 (info) -- that would let Coralogix TCO Optimizer route it to lower-priority storage. However, sev 6 would remove it from the audit trail, which may be important for compliance ("we verified this URL was safe before capture"). Recommendation: start at sev 3 and downgrade to sev 6 if log costs become a concern.

2. **Safe Browsing API key as a secret.** The Google Safe Browsing API key must be provisioned as a Cloudflare Worker secret. It needs to be added to the 1Password WRL vault field mapping in `CLAUDE.local.md` and to the `~/.secrets` variable list. This is an operational task, not a code task, but it must happen before any of this works.

3. **Quarantine alert window (24h) is long for Coralogix.** The Coralogix alerts API supports `LOGS_TIME_WINDOW_VALUE_HOURS_24` but verify this is available in the current plan tier. All existing alerts use 5-15 minute windows. If 24h is not available, fall back to a shorter window with a proportionally lower threshold (e.g., >2 in 6 hours).

4. **`threatTypes` field cardinality.** Google Safe Browsing returns threat types like `MALWARE`, `SOCIAL_ENGINEERING`, `UNWANTED_SOFTWARE`, `POTENTIALLY_HARMFUL_APPLICATION`. This is a bounded set (fewer than 10 values) so it is safe to log as a field. Do NOT log the `threatEntryType` or `platformType` -- those add cardinality with minimal operator value.

5. **Fail-open vs. fail-closed is a product decision, not just an observability decision.** The implementation team needs to decide this before the logging can be finalized. The logging design above supports both modes, but the severity of `safebrowsing.api_fail` and whether the Worker Errors alert catches anything depends on this choice. Recommendation: fail closed for pre-capture (return 503), fail open for rescans (retry on next tick).

### Additional Agents Needed

- **security-minion**: Should review the Safe Browsing integration from a threat-modeling perspective. Specifically: (a) whether the Google Safe Browsing API key needs additional access controls, (b) whether the `threatTypes` field in logs could be used by an attacker to determine what Google has flagged (information disclosure), (c) whether quarantine should be reversible via admin API or permanent.
- **iac-minion**: Will need to provision the Google Safe Browsing API key as a Cloudflare Worker secret (`wrangler secret put SAFE_BROWSING_API_KEY`) and add it to the 1Password WRL vault.
