# Coralogix Alert Rules

WRL uses four Coralogix alert rules to monitor production health.
All alerts send email notifications to bp@ben-peter.com with a 60-minute
retriggering suppression window (one email per hour maximum during sustained issues).

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
