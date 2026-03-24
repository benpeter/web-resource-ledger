# Coralogix Alert Rules

WRL uses nine Coralogix alert rules to monitor production health.
Most alerts send email notifications to bp@ben-peter.com with a 60-minute
retriggering suppression window. The Email Bounces alert uses a 24-hour
suppression window to match its evaluation period.

Alerts are provisioned via `scripts/provision-alerts.sh` (idempotent, safe to
run multiple times). Use `--dry-run` to preview payloads without changes.

## Alert Definitions

### [WRL] Capture Failures

| Property | Value |
|----------|-------|
| **Query** | `event:"capture.fail"` (app: wrl, subsystem: capture) |
| **Threshold** | > 3 events in 5 minutes |
| **Priority** | P1 (Critical) |

**What it monitors:** Terminal capture failures after all retry attempts are
exhausted. Only counts `capture.fail` events — retryable `capture.stage.fail`
events are excluded since the queue retry system handles those automatically.

**Threshold rationale:** With a per-tenant rate limit of 10 captures/minute,
3+ terminal failures in 5 minutes indicates a systemic issue, not a single
flaky target. The absolute-count threshold avoids false positives: a
percentage-based alert (e.g., >10%) would fire on 1 failure out of 3 captures
(33%), which is noise, not signal.

**Runbook:** [capture-failures.md](runbooks/capture-failures.md)

---

### [WRL] TSA Failures

| Property | Value |
|----------|-------|
| **Query** | `event:"capture.tsa_fail"` (app: wrl, subsystem: capture) |
| **Threshold** | > 2 events in 10 minutes |
| **Priority** | P3 (Low) |

**What it monitors:** RFC 3161 timestamp failures from the Sectigo TSA service.
TSA failure degrades captures (no timestamp attached) but captures still succeed
with `tsaStatus: 'error'`. This is a degraded-but-acceptable outcome.

**Threshold rationale:** TSA availability is binary — when the service is down,
every capture fails TSA. Two failures in 10 minutes rules out a single network
blip. P3 priority because the operator's response is "wait and monitor" — there
is nothing to fix on the WRL side.

**Runbook:** [tsa-failures.md](runbooks/tsa-failures.md)

---

### [WRL] Qualified TSA Failures

| Property | Value |
|----------|-------|
| **Query** | `event:"capture.qtsa_fail"` (app: wrl, subsystem: capture) |
| **Threshold** | > 2 events in 10 minutes |
| **Priority** | P2 (Medium) |

**What it monitors:** Failures from the Sectigo qualified (eIDAS) TSA endpoint.
eIDAS-enabled captures complete but without a qualified timestamp, recording
`qualifiedTimestampStatus: 'error'`. No capture data is lost but the legal
evidentiary value of the timestamp is degraded.

**Threshold rationale:** Mirrors the standard TSA alert — two failures in 10
minutes rules out a transient network blip. P2 (not P3) because qualified
timestamps are a tenant-facing feature commitment; degraded timestamps affect
tenants who have paid for eIDAS-level compliance.

**Runbook:** [qualified-tsa-failures.md](runbooks/qualified-tsa-failures.md)

---

### [WRL] Auth Failure Spike

| Property | Value |
|----------|-------|
| **Query** | `event:"security.auth_fail"` (app: wrl, subsystem: security) |
| **Threshold** | > 3 events in 15 minutes (~12/hour) |
| **Priority** | P1 (Critical) |

**What it monitors:** Authentication failures including missing headers, invalid
API key format, unknown keys, wrong scopes, and revoked keys.

**Threshold rationale:** With one tenant and one API key, legitimate auth failures
should be near zero. The original target of 50/hour is too permissive — a scanner
doing key enumeration at that rate would run undetected. 3 failures in 15 minutes
catches meaningful scanning activity while staying above the 1-2 operational
mistakes expected during key rotation.

**Runbook:** [auth-failure-spike.md](runbooks/auth-failure-spike.md)

---

### [WRL] Worker Errors (5xx)

| Property | Value |
|----------|-------|
| **Query** | `responseStatus:[500 TO *]` (app: wrl) |
| **Threshold** | > 2 events in 5 minutes |
| **Priority** | P1 (Critical) |

**What it monitors:** HTTP 5xx responses from the Cloudflare Worker. 4xx responses
(rate limits, auth failures, not found) are excluded — those are client errors, not
worker bugs. No subsystem filter is applied; this catches 5xx from any subsystem.

**Threshold rationale:** Two 5xx responses in 5 minutes indicates the worker code
itself is broken, not that a target URL is flaky. Queue-consumer failures are
captured separately by the Capture Failures alert.

**Runbook:** [worker-errors.md](runbooks/worker-errors.md)

---

### [WRL] Threat Check Quarantines

| Property | Value |
|----------|-------|
| **Query** | `event:"threatcheck.quarantine"` (app: wrl, subsystem: security) |
| **Threshold** | > 5 events in 24 hours |
| **Priority** | P3 (Low) |

**What it monitors:** URLs in existing captures that were flagged as threats
during the daily re-scan. A `threatcheck.quarantine` event fires when a
previously-accepted capture is marked for quarantine after its URL was later
listed by the Google Web Risk API.

**Threshold rationale:** A small number of quarantines per day is expected
operational noise — threat feeds update constantly and minor churn is normal.
Five quarantines in 24 hours is the threshold for a pattern that warrants
investigation: it may indicate a tenant capturing URLs from a known-bad domain,
a threat feed false-positive cluster, or systematic abuse. P3 because quarantined
captures are already isolated; this is an audit signal, not an outage.

**Policy note:** `threatcheck.block` events (severity 5 / error) indicate the
system correctly rejected a pre-capture URL. That severity reflects the security
significance of the event, not a system failure. No alert is defined for
`threatcheck.block` because individual blocks are expected and correct behaviour.

**Runbook:** [threat-check-quarantines.md](runbooks/threat-check-quarantines.md)

---

### [WRL] Threat Check API Failures

| Property | Value |
|----------|-------|
| **Query** | `event:"threatcheck.api_fail" AND context:"pre_capture"` (app: wrl, subsystem: security) |
| **Threshold** | > 2 events in 10 minutes |
| **Priority** | P2 (Medium) |

**What it monitors:** Google Web Risk API errors or timeouts during pre-capture
URL checks. When this alert fires, captures are proceeding without URL screening
(fail-open design), recording `threatCheck: "unavailable"` in metadata.

**Threshold rationale:** Two failures in 10 minutes rules out a single transient
timeout. At that rate, a meaningful fraction of captures are unscreened.
P2 (not P1) because captures continue to work — the safety gate is non-functional
but the daily re-scan cron provides a safety net for the degraded window.

**Scope:** The query filters to `context:"pre_capture"` only. Rescan-context
`threatcheck.api_fail` events (severity 4 / warn) do not block user-facing
requests and are not covered by this alert. Rescan failures appear in
`threatcheck.rescan_tick` log entries as skipped URLs.

**Runbook:** [threat-check-api-failures.md](runbooks/threat-check-api-failures.md)

---

### [WRL] Email Delivery Failures

| Property | Value |
|----------|-------|
| **Query** | `event:"email.send_fail"` (app: wrl, subsystem: email) |
| **Threshold** | > 5 events in 30 minutes |
| **Priority** | P2 (Medium) |
| **Retriggering** | 60-minute suppression |

**What it monitors:** Failures from the email dispatch system where the
provider rejected or failed to deliver an outbound notification email.
These are `email.send_fail` events logged after the send attempt returns
an error.

**Threshold rationale:** A single send failure may be a transient provider
issue. Five failures in 30 minutes indicates a sustained delivery problem —
credential failure, provider outage, or rate limiting — that warrants
investigation. P2 (not P1) because captures continue to succeed; email is
a notification channel, not a data-integrity path.

---

### [WRL] Email Bounces

| Property | Value |
|----------|-------|
| **Query** | `event:"email.bounce" AND bounceType:"hard"` (app: wrl, subsystem: email) |
| **Threshold** | > 3 events in 24 hours |
| **Priority** | P3 (Low) |
| **Retriggering** | 24-hour suppression |

**What it monitors:** Hard bounces reported by the email provider for
outbound notification emails. A hard bounce means the destination address
is permanently undeliverable (invalid domain, non-existent mailbox).

**Threshold rationale:** Soft bounces (temporary delivery failures) are
excluded — only `bounceType:"hard"` counts. Three hard bounces in 24 hours
is the threshold for a pattern that may affect sender reputation with the
email provider. At WRL's notification volume, even a few hard bounces in a
day indicates a data quality issue in recipient addresses that should be
reviewed. P3 because no data is lost; this is a housekeeping signal.

---

## Design Decisions

**Absolute counts, not ratios.** All alerts use absolute-count thresholds instead
of percentage-based ratios. At WRL's traffic volume (max 10 captures/minute per
tenant), ratio alerts produce false positives on single-digit event samples. One
failure out of two requests is a 50% failure rate but is not an incident.

**60-minute retriggering suppression.** After an alert fires, repeated
notifications are suppressed for 60 minutes. This prevents inbox flooding during
sustained outages (e.g., a 2-hour TSA outage would send 2 emails instead of 12).

**Inline email notifications.** Email recipients are configured directly in the
alert definition — no separate Coralogix connector or webhook endpoint required.

## Provisioning

```bash
# Preview what would be created/updated
./scripts/provision-alerts.sh --dry-run

# Provision all alerts (idempotent)
./scripts/provision-alerts.sh
```

The script uses list-then-upsert idempotency: it fetches all existing alerts,
matches by `[WRL]` name prefix, and creates, updates, or skips each alert
as needed. Running the script twice produces no changes.

**Prerequisites:**
- `WRL_CORALOGIX_API_KEY` set in `~/.secrets`
- `jq` and `curl` installed

## Related Documentation

- [Audit log schema](../audit-log-schema.md) — event names, fields, Coralogix queries
- [OPERATIONS.md](../../OPERATIONS.md) — deployment, rollback, monitoring overview
