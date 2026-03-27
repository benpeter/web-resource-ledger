---
alert: "[WRL] Worker Errors (5xx)"
events:
  - http.5xx
priority: P1
---

# Runbook: [WRL] Worker Errors (5xx)

## What fires this

More than 2 HTTP 5xx responses in a 5-minute window. This counts only server
errors (status 500+). Client errors (4xx: rate limits, auth failures, not found)
are excluded.

## Check

Query Coralogix:

```
responseStatus:[500 TO *] AND applicationName:"wrl"
```

Look at:
- `responseStatus` — the specific HTTP status code (500, 502, 503, etc.)
- `path` — which endpoint returned the error
- `error` — error message or stack trace
- `method` — which HTTP method (GET, POST, etc.)
- Timing — did errors start after a deployment?

## Likely causes

**Code bug.** Unhandled exception in a request handler. Check `error` for
stack traces. Most common after a deployment.

**Cloudflare Worker resource limits.** CPU time exceeded (50ms for free tier,
30s for paid) or memory limit hit. Look for "CPU time exceeded" or
"Memory limit exceeded" in error messages.

**KV/R2 storage errors.** Cloudflare storage service returning errors.
Check [Cloudflare status page](https://www.cloudflarestatus.com/).

**Upstream service failure.** A dependency (browser service, TSA, etc.)
failing in a way that causes a 500 instead of a graceful degradation.

## Fix

1. **Check for recent deployments.** If errors correlate with a deploy,
   rollback immediately: `wrangler rollback` (see OPERATIONS.md).
2. **Check error messages.** Stack traces point to the specific code path.
3. **Check resource limits.** If CPU/memory exceeded, the request may be
   too expensive — review the failing endpoint's logic.
4. **Check Cloudflare status.** KV/R2 outages are platform-level.
5. **If upstream failure:** Check whether the error handler properly
   degrades instead of propagating a 500.

## False positive?

Very unlikely at a threshold of 2. A single transient 500 will not trigger
this alert. If it fires, something is genuinely broken.
