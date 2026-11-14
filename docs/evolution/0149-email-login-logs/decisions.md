# Decisions

- The sign-in link counters (10 an hour per IP, 3 per address) are written in the
  background. If KV refuses the write, the counters stay short and both limits stop
  counting, with nothing in the logs. That now logs
  `oauth.email_link_counter_write_fail` at severity 5: a control is off, but the
  request itself is fine, so it still answers 202.
- Each counter write now goes to `ctx.waitUntil` with its catch as soon as it starts.
  The old code collected both writes in one `Promise.all` after the second counter's
  KV read, so a write that failed early sat unhandled across that read (CI reported it
  as an unhandled rejection), and when the address limit answered 429 the IP counter's
  write was never handed to `waitUntil` at all.
- The cleanup of expired login tokens logs `oauth.login_token_cleanup_fail` at
  severity 4. The next link request runs it again.
- The two `computeCip(...).catch(() => null)` calls stay: the pseudonymized IP only
  goes into log lines, and a missing value there is visible in the logs themselves.
- The `.catch(() => {})` calls in `src/consent.js` and `src/capture.js` stay too. They
  wrap best-effort browser calls (injecting the consent script into frames that may
  already be gone, waiting for a load state with a timeout), where a failure is normal
  and the capture goes on.
- No alert: a KV outage shows up in other alerts first, and the event is there for
  investigation.
- `test/log-severity-sync.test.js` started with a stray `// tva` line from phase 0136's
  red commit; removed.
