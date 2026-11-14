# Prompt

Same session as phases 0133 to 0168, not from the backlog: a sweep of the
webhook docs against `src/webhook-dispatch.js` found three things.

- The `capture.failed` example sent `retryable: true` with "WRL tried 4 times.",
  and the API reference examples did the same. A capture that used all its
  attempts is stored with `retryable = 0` (`failCaptureAfterRetries`), so the
  webhook carries `false`.
- The `capture.quarantined` example gave `content_policy` as the reason. WRL
  only quarantines in the nightly re-scan, and `quarantineReason` is the list of
  Google Web Risk threat types (`src/rescan.js`).
- A capture still pending 24 hours after it was submitted is failed by
  `failStaleCaptures` (phase 0139) without a webhook or email, though the
  notifications page says the `capture.failed` webhook fires for every failed
  capture. A webhook consumer waiting for complete or failed never heard of it.
