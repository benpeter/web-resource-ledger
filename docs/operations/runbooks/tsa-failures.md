---
alert: "[WRL] TSA Failures"
events:
  - capture.tsa_fail
priority: P3
---

# Runbook: [WRL] TSA Failures

## What fires this

More than 2 `capture.tsa_fail` events in a 10-minute window. The Sectigo
TSA (RFC 3161 timestamp authority) service is unreachable or returning errors.

This is a P3 alert. Captures still succeed without timestamps — they complete
with `tsaStatus: 'error'` instead of `tsaStatus: 'ok'`. No data is lost.

## Check

Query Coralogix:

```
event:"capture.tsa_fail" AND applicationName:"wrl"
```

Look at:
- `error` — the specific TSA error (timeout, TLS, HTTP status)
- `tsaUrl` — which TSA endpoint was attempted
- Timing — are failures continuous or intermittent?

Also check: [Sectigo status page](https://status.sectigo.com) for known outages.

## Likely causes

**Sectigo TSA service outage.** TSA availability is binary — when it's down,
100% of captures fail TSA. This is the most common cause and is outside WRL's
control.

**Network issue.** Transient connectivity problem between Cloudflare Worker
and timestamp.sectigo.com. Usually self-resolving.

**TLS certificate issue.** The TSA endpoint's certificate expired or changed.
Rare but check if the error mentions TLS/certificate.

## Fix

1. **Wait and monitor.** TSA outages are third-party. There is nothing to fix
   on the WRL side. Most outages resolve within 30-60 minutes.
2. **If persistent (>1 hour):** Check Sectigo's status page. Consider whether
   captures without timestamps are acceptable for the current workload.
3. **If the error is TLS-related:** The TSA endpoint may have rotated its
   certificate. Check if the Worker's fetch is rejecting the new cert.

## False positive?

Unlikely. Two failures in 10 minutes rules out a single network blip. If the
alert fires, the TSA service is genuinely having issues.
