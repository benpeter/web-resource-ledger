# Outcome

- Red first (c9dbfbf): 6 unit tests and 3 integration tests failed; green in
  83518d9. Dashboard row: red 754b0fd, green 6fc13ef.
- `src/capture.js`: a `response` listener keeps the status of the main
  frame's last navigation response; both render paths return it as
  `render.httpStatus`, `captureQuality` carries it, the blank-page error
  names it, and four `render.default.*` events log it.
- `src/verify-page.js`: "Site answer" row for 400 and above. `src/mcp.js`:
  `HTTP status` line in `get_capture` and `verify_capture`, plus a sentence
  for 400 and above. `src/ui/ui-detail.js`: "HTTP Status" in the capture
  details.
- Docs: "Captures of an error answer" in `verification.md` (also says where
  the headers artifact comes from), failure table in `limits.md`, `mcp.md`,
  `RenderInfo.httpStatus` and the headers description in `openapi.yaml`,
  `coralogix-events.md`, `docs/INTERNALS.md`, CHANGELOG.
- `npm run test:sync` 57/57, `npm run lint:api` exit 0, `npm run build:docs`,
  full suite 86 files, 2025 passed, 2 skipped; integration 20/20.

## Staging battery (02b5446, 13 sites, 2026-11-15)

12 captured, 1 failed; against the same sites on 73c8681 two hours earlier
nothing got worse.

- samsung.com: again the "Access Denied" page, complete and full as before,
  now with `httpStatus` 403, the "Site answer" row on the verification page
  and the sentence in MCP `get_capture` and `verify_capture`.
- etsy.com: failed with "The site answered HTTP 403 and the page showed
  nothing (blank page)". So its blank page is a refusal, not a rendering
  problem.
- nytimes.com: captured in full with 200 this time (1121 requests). Its blank
  pages come and go; the next one will show its status in the log.
- finance.yahoo.com: partial on the navigation timeout, `httpStatus` 200, so
  the partial path records it too.
- The other nine: 200.

## Backlog changes

- #101 closed.
- #100 updated: Etsy's blank page comes with a 403; nytimes.com still open.
