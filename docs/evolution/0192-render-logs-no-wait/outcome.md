# Outcome

- Red first (bb6a29d): an integration test in a real browser with the test
  server standing in for the log endpoint, 400 ms per line. The render of
  the fast test page took 2.8 seconds longer than without a log endpoint.
  Green in 59f6508: under 1.5 seconds longer.
- `src/capture.js`: `defaultRenderer()` has `logLine(severity, data)`, which
  calls `log()` and keeps the promise. All 22 lines that were waited for and
  the 3 that were not go through it. `await Promise.all(logLines)` is the
  last thing in the renderer's `finally`, after the browser context is
  closed.
- `CLAUDE.md`: the logging rule names `logLine()` for the renderer.
- Docs: `coralogix-events.md` (when the lines are sent, order within one
  millisecond), changelog.

## Staging

On 59f6508, against the same pages on the builds of that evening:

| Page | Capture before | After |
|---|---|---|
| example.com | 6.8 s, 8.6 s | 6.5 s, 4.8 s, 4.9 s |
| en.wikipedia.org/wiki/Ledger | 8.5 s | 7.5 s |
| explodingtopics.com (banner declined) | 21.0 s | 16.5 s |
| heise.de (banner declined) | 21.5 s, 22.8 s, 25.3 s | 19.2 s |
| theguardian.com (banner declined, reloads) | 46.7 to 83.1 s, eight captures | 40.3 s |

- The numbers are `render.durationMs`. Sites vary from capture to capture;
  example.com is the clean comparison.
- All lines of a capture arrive in Coralogix as before (checked for
  `cap_18068571f5714b3fb91eea0237679e2d` and
  `cap_04c08007af0f4dd9a95f7c00f519c82d`, 10 and 11 renderer lines). The last
  three of a capture have the same timestamp now and show in any order.
- Consent results unchanged: none on example.com and Wikipedia, declined on
  the other three.

## Backlog changes

None.
