# Outcome

- `src/capture.js`: partial captures build, sign and timestamp a WACZ like full ones;
  `capture.partial` logs `waczStatus` and `timestampStatus`. `src/wacz.js`: the
  datapackage carries `captureQuality`.
- `src/verify-page.js`: "Page load" row for a partial render. `src/mcp.js`:
  `verify_capture` prints the render quality.
- Tests, red first (5da0ca2, 5dca1cd): `test/capture.test.js` unzips the WACZ of a
  partial and a full capture and checks `captureQuality`; `test/verify-integration.test.js`
  verifies a partial capture and keeps the 404 for a capture without a WACZ;
  `test/mcp.test.js` runs `verify_capture` on a partial capture;
  `test/verify-page.test.js` runs the page's own script against a stub DOM and fetch.
- `openapi.yaml`: `renderQuality`, `verifyUrl` and `/v1/verify/{id}` descriptions, and
  the partial example. `site/content/verification.md`: new "Partial captures" section;
  `limits.md` and `mcp.md` point to it. `docs/INTERNALS.md` (`wacz` column),
  `docs/operations/coralogix-events.md` (`capture.partial`), CHANGELOG.

## Backlog changes

- benpeter/wrl-backlog#15 (classify render failures, CQP phase 4): the captureQuality
  field and flagging partial captures are done here. Still open: a finer classification
  of render failures and per-category retry rules.
- `docs/backlog.md`: the `[consider] WACZ captureQuality` item is struck as done.
- Not filed: signing older partial captures. See decisions; a late signature would
  misstate the capture time.
