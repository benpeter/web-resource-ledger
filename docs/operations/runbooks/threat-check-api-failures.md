# Runbook: [WRL] Threat Check API Failures

## What fires this

More than 2 `threatcheck.api_fail` events with `context:"pre_capture"` in a
10-minute window. The Google Web Risk API is failing or timing out during
pre-capture URL safety checks, causing capture requests to be rejected with
an error response.

This is a P2 alert. Captures are failing cleanly — the system is not
producing corrupt data — but tenants cannot complete captures until the
Web Risk API recovers.

## Check

Query Coralogix:

```
event:"threatcheck.api_fail" AND context:"pre_capture" AND applicationName:"wrl"
```

Look at:
- `error` — the specific failure (timeout, HTTP status, DNS, TLS)
- `url` — whether failures are correlated with specific URLs or affect all URLs
- `tenantId` — whether one tenant or all tenants are affected
- Timing — are failures continuous or spiking?

For the current failure rate:

```
event:"threatcheck.api_fail" AND applicationName:"wrl"
```

(Omit the `context` filter to also see rescan failures, which gives a fuller
picture of Web Risk API health.)

## Likely causes

**Google Web Risk API outage.** The Web Risk service is unavailable or
returning 5xx responses. Check the
[Google Cloud Status Dashboard](https://status.cloud.google.com) for
active incidents in the Web Risk API or Cloud Endpoints.

**API key quota exhaustion.** The Web Risk API key has hit its request quota.
The `error` field will typically contain a 429 or quota-exceeded message.
Check Google Cloud Console for quota usage.

**Network connectivity issue.** Transient DNS or TCP connectivity problem
between the Cloudflare Worker and the Web Risk API endpoint. Usually
self-resolving within minutes.

**Invalid API key or permissions.** The Web Risk API key was rotated, revoked,
or the project's billing was suspended. The `error` field will contain a 401
or 403.

## Fix

1. **Check the error field** in the Coralogix logs. The failure type determines
   the response:

   - Timeout / 503 / 502: Web Risk API outage — wait and monitor
   - 429 / quota: Check quota in Google Cloud Console, consider requesting
     an increase
   - 401 / 403: Key or billing issue — check Google Cloud Console, re-provision
     the key if needed
   - DNS resolution failure: Cloudflare network issue — monitor for resolution

2. **Check the Google Cloud Status Dashboard** for active Web Risk incidents.
   If there is a reported incident, this is out of WRL's control — wait for
   Google to resolve it.

3. **If quota exhaustion:** In Google Cloud Console, navigate to
   APIs & Services > Quotas for the Web Risk API. If quota is legitimately
   exhausted, request an increase or review whether re-scan batch sizing
   needs throttling.

4. **If the API key is invalid:** Provision a new Web Risk API key in Google
   Cloud Console, store it in 1Password (WRL vault, Production item), and
   push it to the Worker via `wrangler secret put`.

5. **If the outage is extended (>30 minutes):** Consider whether to notify
   tenants that captures are temporarily unavailable.

## False positive?

Unlikely. Two pre-capture failures in 10 minutes rules out a single transient
timeout. If the alert fires, the Web Risk API is genuinely having issues for
that window.

Note: rescan-context `threatcheck.api_fail` events do NOT fire this alert by
design. If only rescan failures appear in logs (check `context` field), the
system is degraded but user-facing captures are unaffected — no action is
required beyond monitoring the next rescan batch for recovery.
