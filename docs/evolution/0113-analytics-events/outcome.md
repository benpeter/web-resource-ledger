# Outcome

- `src/pirsch.js`: `isPageView()`, `trackServerEvent()`, `trackHit` skips
  requests without a user agent, `pirsch.send_rejected` logs Pirsch's error
  body. `trackEventRaw()` removed.
- `src/analytics.js`: capture source, tenant exclusion, capture events.
- Landing and docs Workers count HTML page views only.
- Producers add `source` and `ua` to capture queue messages; the consumer sends
  `First Capture`, `Capture Completed` and `Capture Failed`.
- `Payment Activated` and `Schedule Created` sent as server events without ids;
  `Signup` meta drops the tenant id.
- Privacy policy and the Coralogix event list updated.
- Red tests first; full unit suite passes.

To verify after deploy: a docs page request shows up in Pirsch, or
`pirsch.send_rejected` now says why not; the next real capture produces a
`Capture Completed` event.
