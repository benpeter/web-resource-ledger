# Outcome

## What changed

- `src/capture.js`: `parseCloudflareTrace` and `readBrowserLocation`. The
  default renderer reads the session's location once per session after the
  orphan cleanup, logs it on `render.default.session_acquired` (and `colo` on
  `render.default.consent_result`) and returns it as `browserLocation`.
  `performCapture` puts it into `captureSettings.browserLocation`.
- `src/browser-location.js`: the text "LAX, US (Cloudflare data center)" for
  the certificate and MCP.
- Verification page, dashboard, MCP `get_capture` and `verify_capture`,
  certification PDF: "Captured from".
- Docs: verification ("Where the capture was made from"), MCP examples, SWGDE
  compliance, openapi `BrowserLocation`, INTERNALS, coralogix events, CHANGELOG.

## Verified

- Red first (84e1b2f): trace parsing, storage and signing into the WACZ,
  verify page (and that other values are not shown), dashboard, MCP
  `get_capture` and `verify_capture`, certificate. Green in f89ef68: the five
  test files 295 passed, 3 failed (the DNS-only MCP tests).
- `npm run test:sync` 59 passed, `npm run lint:api` exit 0, `npm run build:docs`
  exit 0.
- Staging, 1ea9825, battery for Guardian, Slashdot and Samsung: 3 passed, each
  capture has `captureSettings.browserLocation` (Guardian LAX, Slashdot LAX,
  Samsung DFW). `GET /v1/verify/{id}` returns it, the certification PDF has the
  line, and the verification page shows "Captured from: LAX, US (Cloudflare
  data center)" under Capture details.
- Logs: reading the location took 216 to 605 ms on a new session and 0 ms on
  a known one (`locationCached: true`); no read failed.
