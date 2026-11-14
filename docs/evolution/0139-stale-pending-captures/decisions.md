# Decisions

- A capture still `pending` 24 hours after it was created is marked failed. Its four
  attempts run 10, 20 and 40 seconds apart with up to 15 minutes each, so the queue is
  done with it within about an hour; 24 hours leaves room for a queue backlog or a
  consumer outage without failing a capture that would still finish. If a consumer
  outage lasted longer, the idempotency guard acks the late message for the failed
  capture, so nothing runs twice.
- The sweep runs in the per-minute cron on the hour, next to the meter flush, instead of
  the weekly cron: a lost capture shows as failed within 25 hours, not up to a week.
  The production captures table has 928 rows, so a scan without an index is cheap.
- The error keeps the reason of the last failed attempt when one was recorded, like
  `failCaptureAfterRetries`: "<reason>. WRL then lost track of the capture." Without one
  it reads "WRL lost track of this capture before it finished." `retryable` is true:
  the loss was WRL's, so submitting again may well work. Failed captures don't count
  toward the quota, and pending ones never did.
- The schedule's `lastCaptureStatus` is synced with the same statement the other
  failure paths use, so the dashboard badge leaves "pending".
- No `capture.failed` webhook or email. The first run fails 8 captures from July to
  September; mails and webhooks for those would be noise, and no capture has been lost
  this way since 2026-09-05. The capture record says what happened, and
  `capture.stale_fail` (severity 4) tells the operator.
- MCP `capture_url` told agents a capture still pending after 30 seconds "may have
  failed", which invites resubmitting while retries are still running; that creates a
  second capture and can use quota twice. It and the MCP guide now say retries can take
  a few minutes, and when WRL gives up.
- Coralogix event list: correct legend, `capture.list` at 2, and the events from phases
  0136 and 0139 plus the sitemap events, which no list had. The "128 unique events"
  count is gone, since it went stale with every new event.
- `email.dispatch_skipped` logs at 1 (debug) and is awaited inside its `waitUntil`.
  `test/log-severity-sync.test.js` scans the three Workers for `log(env, N,` and fails
  on anything outside 1 to 5, so the 0136 mistake can't come back unnoticed. It reads
  source files, so it runs in the Node config with `test/mcp-sync.test.js`.
