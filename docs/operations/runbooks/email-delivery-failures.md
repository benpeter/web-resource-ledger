---
alert: "[WRL] Email Delivery Failures"
events:
  - email.send_fail
priority: P2
---

# Runbook: [WRL] Email Delivery Failures

## What fires this

More than 5 `email.send_fail` events in a 30-minute window. These are failures
where the Resend API rejected the request or the network call failed after the
message was dequeued from EMAIL_QUEUE.

## Check

Query Coralogix:

```
event:"email.send_fail" AND applicationName:"wrl"
```

Look at these fields in the matching events:
- `notificationType` — which email type is failing (`capture_failure`,
  `approaching_limit`, `limit_reached`, `invoice_generated`, `payment_failure`,
  `weekly_digest`)
- `httpStatus` — the HTTP status returned by Resend (401, 403, 429, 5xx, or null
  for network errors)
- `errorCategory` — `http_4xx`, `http_5xx`, `timeout`, `dns`, `tls`, or
  `connection`
- `retryDelaySeconds` — null means the message was acked without retry (either
  permanently failed or exhausted the retry schedule)
- `tenantId` — whether failures are concentrated on one tenant or widespread

Also check for DLQ events, which mean retries were exhausted:

```
event:"email.send_dlq" AND applicationName:"wrl"
```

## Likely causes

1. **Resend API outage or elevated error rate.** Resend returns 5xx or the
   connection times out. `errorCategory` will be `http_5xx` or `timeout`.
   Messages retry automatically (60s → 5min → 15min schedule). If the outage
   lasts longer than the retry schedule, messages land in the DLQ.

2. **RESEND_API_KEY expired, revoked, or misconfigured.** Resend returns 401 or
   403. These are treated as non-retryable — the Worker acks immediately to avoid
   pointless retries. `httpStatus` will be 401 or 403 and `errorCategory` will be
   `http_4xx`. If every send attempt is failing with 401/403 this is the cause.

3. **Invalid recipient address (permanent rejection).** Resend returns 400 or
   422 for a malformed or unacceptable `to` address. Also non-retryable.
   `httpStatus` will be 400 or 422. Failures will be concentrated on a specific
   `tenantId`.

4. **Rate limiting by Resend.** Resend returns 429. Messages retry with
   backoff. `httpStatus` will be 429.

5. **Network connectivity failure.** DNS resolution failure or TLS error
   reaching `api.resend.com`. `errorCategory` will be `dns`, `tls`, or
   `connection` with a null `httpStatus`.

## Fix

1. **Resend API outage (5xx / timeout):** Check the
   [Resend status page](https://resend-status.com/). If there is an incident,
   messages will retry automatically for up to 15 minutes total. Monitor
   `email.send_dlq` events to track messages lost to the outage. No action
   required unless DLQ events appear and the notification must be re-sent.

2. **API key issue (401 / 403):** The key is not retried — all pending messages
   for that delivery window are lost. Verify the key is set correctly:
   `wrangler secret list` (check `RESEND_API_KEY` is present). Retrieve the
   current key from 1Password (WRL vault → Production → `RESEND_API_KEY`).
   If the key needs rotation: generate a new key in the Resend dashboard, store
   it in 1Password, then deploy with `wrangler secret put RESEND_API_KEY`.

3. **Invalid recipient (400 / 422):** Look up the affected `tenantId` and check
   their configured email address. The address may be malformed or from a
   rejected domain. Notify the tenant or update their record in D1 directly.
   These failures do not affect other tenants.

4. **Rate limiting (429):** Messages retry automatically. If the alert fires
   during a burst of notifications (e.g., a billing cycle triggering
   `approaching_limit` emails for many tenants simultaneously), the backoff
   schedule handles recovery. No immediate action needed unless `email.send_dlq`
   events appear.

5. **Network / DNS / TLS:** Check Cloudflare Workers status
   (https://www.cloudflarestatus.com/). A DNS or TLS failure reaching
   `api.resend.com` is either a transient Workers networking blip or a change
   in Resend's endpoints. Messages will retry. If failures persist across
   multiple retry cycles, check whether `api.resend.com` resolves correctly.

## False positive?

- **Single known-bad address.** One tenant with a permanently invalid email
  address can generate repeated `email.send_fail` events but is not a delivery
  system failure. Check whether all failures share a single `tenantId` and
  `errorCategory:"http_4xx"` with `httpStatus:400` or `httpStatus:422`.

- **Resend scheduled maintenance.** Resend occasionally posts maintenance
  windows. A maintenance window that raises temporary 5xx rates can trigger
  this alert even though the system is working as expected and retries will
  succeed.
