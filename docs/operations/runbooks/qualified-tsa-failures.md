# Runbook: [WRL] Qualified TSA Failures

## What fires this

More than 2 `capture.qtsa_fail` events in a 10-minute window. The Sectigo
qualified TSA service (`timestamp.sectigo.com/qualified`) is unreachable,
returning errors, or rejecting the auth credential.

This is a P2 alert. eIDAS-enabled captures complete but without a qualified
timestamp — they record `qualifiedTimestampStatus: 'error'`. The capture
artifact is still created; its legal evidentiary value as an eIDAS-compliant
timestamp is degraded until the service recovers.

## Check

Query Coralogix:

```
event:"capture.qtsa_fail" AND applicationName:"wrl"
```

Look at:
- `errorName` — error class (e.g., `TypeError`, `FetchError`)
- `errorMessage` — specific failure detail (timeout, HTTP status, auth rejection)
- `tsaUrl` — which qualified TSA endpoint was attempted
- `tenantId` — whether failures are limited to one tenant (auth issue) or all tenants (service outage)
- Timing — are failures continuous or intermittent?

Also check: [Sectigo status page](https://status.sectigo.com) for known qualified TSA outages.

## Likely causes

**Sectigo qualified TSA service outage.** The qualified endpoint has lower
availability SLAs than the standard Sectigo TSA. This is the most common cause
and is outside WRL's control.

**Auth credential rejected.** The `QUALIFIED_TSA_AUTH` secret (base64 Basic
auth credential) may have expired or been rotated by Sectigo. Failures limited
to eIDAS tenants with auth required, while the standard TSA continues working,
suggest this cause. Check `errorMessage` for HTTP 401 or 403.

**Network issue.** Transient connectivity problem between the Cloudflare Worker
and `timestamp.sectigo.com`. Usually self-resolving within minutes.

**Endpoint URL wrong or changed.** The qualified TSA endpoint may have been
updated. If `errorMessage` indicates HTTP 404 or redirect, verify the current
endpoint with Sectigo documentation.

## Fix

1. **Check the pattern.** If `tenantId` varies across failures, the issue is
   the shared service or credentials. If only one tenant is affected, check
   that tenant's configuration.

2. **Service outage:** Wait and monitor. Qualified TSA outages are third-party.
   Most resolve within 30-60 minutes. Check Sectigo status page. If the outage
   is extended (>2 hours), consider temporarily routing eIDAS captures to
   `qtsa.eu` (EU qualified TSA) as a fallback — this requires a config change
   to `QUALIFIED_TSA_URL`.

3. **Auth credential failure (HTTP 401/403):**
   - Retrieve the current credential from 1Password (WRL vault, Production item,
     `QUALIFIED_TSA_AUTH` field).
   - Verify the credential is still valid with Sectigo support.
   - If rotation is needed: generate the new base64-encoded `user:pass` string,
     store in 1Password, then push via `wrangler secret put QUALIFIED_TSA_AUTH`.

4. **Wait for outage resolution.** No captures are lost — they succeed without
   qualified timestamps. Notify affected tenants that eIDAS timestamp quality is
   degraded if the outage persists beyond 1 hour.

## Tenant notification guidance

If the outage persists beyond 1 hour, notify tenants who have `eidas_qualified`
enabled. The message should communicate:

- Captures are completing successfully
- Qualified (eIDAS) timestamps are temporarily unavailable
- `qualifiedTimestampStatus: 'error'` will appear on captures during this window
- No action required from tenants; the issue is being monitored

Captures taken during the outage do not receive retroactive qualified timestamps
after the service recovers.

## False positive?

Unlikely. Two qualified TSA failures in 10 minutes rules out a single network
blip. If the alert fires, the qualified TSA service is genuinely degraded.

Note: standard TSA (`capture.tsa_fail`) and qualified TSA (`capture.qtsa_fail`)
failures are independent. One firing does not imply the other. Check both if
the alert fires.
