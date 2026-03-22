# Decisions: Coralogix Alerting Rules

## Absolute-count thresholds over ratio-based alerts

**Chosen:** Absolute-count thresholds (e.g., >3 failures in 5 minutes)
**Over:** Percentage-based ratios (e.g., >10% failure rate) — recommended by issue spec
**Why:** At WRL's traffic volume (max 10 captures/minute per tenant), ratio alerts
produce false positives on single-digit event samples. One failure out of two
requests is 50% — mathematically a firing alert but operationally meaningless.
ux-strategy-minion argued this is "mathematical certainty, not theoretical concern."
observability-minion initially proposed ratio alerts with `ignoreInfinity: true`
(standard Coralogix pattern), but the UX argument won: absolute counts are immune
to the small-sample problem entirely.

## Auth threshold: ~12/hour over 50/hour

**Chosen:** >3 events in 15 minutes (~12/hour)
**Over:** >50 failures/hour (issue spec), >10/hour (ux-strategy-minion)
**Why:** With one tenant and one API key, legitimate auth failures should be near
zero. 50/hour is too permissive — a scanner doing key enumeration at that rate
runs undetected. The 15-minute window provides faster detection than hourly
aggregation. 3 events (not 10) because the base rate is effectively zero.

## Shell script over Terraform

**Chosen:** Bash script against Coralogix Alerts API v3
**Over:** Terraform with Coralogix provider
**Why:** observability-minion recommended this approach. The Coralogix Terraform
provider's alert resource documentation is sparse, and the API v3 schema has
undocumented quirks (e.g., `evaluationWindow` field rejected, `alertDefs` vs
`alerts` response key). A shell script allows rapid iteration against the real
API. For 4 alerts managed by one operator, Terraform's state management adds
complexity without benefit.

## Inline email over connector/webhook

**Chosen:** `webhooks[].integration.recipients.emails` inline in alert definition
**Over:** Separate Coralogix connector/webhook endpoint
**Why:** API exploration revealed that the connector/webhook management endpoints
return 404 (not available on this plan or API version). Inline email works
and has no external dependency.

## TSA alert at P3, not P1

**Chosen:** P3 (Low) priority for TSA failures
**Over:** P1 (Critical) like the other alerts
**Why:** TSA failure degrades captures (no timestamp) but captures still succeed.
The operator's response is "wait and monitor" — there is nothing to fix on the
WRL side. A P1 priority would create urgency for an unactionable situation.

## `capture.fail` only, excluding `capture.stage.fail`

**Chosen:** Count only terminal `capture.fail` events
**Over:** Including `capture.stage.fail` (retryable) events
**Why:** `capture.stage.fail` fires on the first attempt but leads to a retry.
A stage failure that gets retried and succeeds is not a failure from the
operator's perspective. Including it would double-count failures that the
queue system handles automatically. ux-strategy-minion identified this
distinction; observability-minion confirmed the event semantics.

## Lucene range syntax for responseStatus

**Chosen:** `responseStatus:[500 TO *]`
**Over:** `responseStatus:>=500`
**Why:** Coralogix's Lucene query validator rejected the `>=` comparison syntax.
Standard Lucene range query `[500 TO *]` works. Discovered during live
provisioning — the first attempt returned HTTP 400 with "Lucene query
validation failed."
