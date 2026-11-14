# Outcome

- Red first (ac7e95e), then green (4d19fd1).
- `src/analytics.js`: `trackCaptureEvent` sends no ip.
- Tests: `test/analytics.test.js`.
- Docs: CHANGELOG.

## Backlog changes

- #91: comment on two DPA sentences (lines 90 and 94) that say WRL doesn't
  receive or transmit raw ips; the Worker passes them, unstored, to Cloudflare's
  rate limiters and to Pirsch for sign-up events.
