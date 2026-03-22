# Runbook: [WRL] Capture Failures

## What fires this

More than 3 `capture.fail` events in a 5-minute window. These are terminal
failures — the capture pipeline exhausted all retry attempts (max 3 with
exponential backoff) and could not produce a result.

## Check

Query Coralogix:

```
event:"capture.fail" AND applicationName:"wrl"
```

Look at these fields in the matching events:
- `url` — which target URLs are failing
- `error` — the error message from the capture pipeline
- `captureId` — correlate with other events for the same capture
- `attempt` — which retry attempt failed (should be the final one)

## Likely causes

**Single URL concentrated:** Target site is down, blocking headless browsers,
returning CMP/cookie walls, or has DNS issues. This is the most common cause.

**Spread across multiple URLs:**
- Cloudflare Worker hitting CPU or memory limits
- Browser pool exhaustion in the rendering service
- Queue consumer stuck or processing too slowly
- Network issue between Worker and browser service

**After a deployment:** New code introduced a regression in the capture pipeline.

## Fix

1. **Check URL distribution.** If all failures are for one URL, the site is
   likely the problem. Suppress the alert if it's a known-flaky target.
2. **Check for recent deploys.** If failures started after a deploy, rollback:
   `wrangler rollback` (see OPERATIONS.md).
3. **Check queue depth.** If the queue is backing up, the consumer may be stuck.
4. **Check Worker logs** for resource limit warnings (CPU time exceeded, memory).
5. **If widespread and no deploy:** Check Cloudflare status page for platform issues.

## False positive?

A single flaky URL can trigger if 4+ captures of it happen within 5 minutes
(e.g., a user submitting the same URL repeatedly). Check whether failures are
concentrated on one URL before escalating.
