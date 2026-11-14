# Decisions

- Phase 0139 left out the webhook and the email on purpose: its first run failed
  8 captures from July to September, and messages for those would have been
  noise. That run is done, and the reason went with it. A capture WRL lost track
  of now sends `capture.failed` and the failure email like one that used all its
  attempts, with the same payload builder and the same monthly dedup for the
  email.
- The payload says `retryable: true` for such a capture, as the record already
  did since phase 0139: the loss was WRL's, so submitting again may well work.
  The docs now say `retryable` is true only when the failure was on WRL's side.
- The catastrophic path in the queue consumer (an exception escapes
  `performCapture`, fourth attempt) still sends nothing. `performCapture` catches
  render and storage errors itself, so that path means D1 failed, and the
  webhook lookup is a D1 query too. If D1 is down the whole time, the capture
  stays pending and the 24-hour sweep reports it.
- Each stale capture is reported one after the other inside the sweep's
  `waitUntil`. The sweep found 8 captures in its first run and none since, so
  there is no batching.
- Examples show what the code sends: `Page did not finish loading within 20
  seconds. WRL tried 4 times.` with `retryable: false`, and `MALWARE` as the
  quarantine reason. The quarantine description says what follows: every
  complete capture of the URL is quarantined for every account, artifacts answer
  `451`, and the capture is deleted after 90 days.
