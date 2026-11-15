# Outcome

- Red first (6e09984): the over-cap page failed and the size-cap page was
  captured as partial; green in 38559af. Second pair for the cap value: red
  32dc938 (a 1200-request page was partial, the texts named 500), green
  ddc10d5.
- `src/capture.js`: the request handler blocks requests past
  `MAX_SUBRESOURCES` (now 2000) and sets `subresourceLimitReached`; the
  capture goes on and ends as partial on both paths. The size cap fails on
  both paths. `render.default.complete` and `partial_complete` log
  `subresourceCount`, `blockedRequests` and `totalBytes`;
  `session_acquired` logs `browserVersion`.
- `render.subresourceLimitReached` on the capture record, in the WACZ
  `captureQuality` (`src/wacz.js`), on the verification page
  (`src/verify-page.js`) and in MCP `get_capture` (`src/mcp.js`).
- Docs: `limits.md`, `verification.md`, `mcp.md`, `openapi.yaml`
  (`RenderInfo.subresourceLimitReached`), `coralogix-events.md`, CHANGELOG.
- Integration fixtures: `/many-resources.html?n=` and a size-cap page with a
  60 MB script and a stalled one.

## Staging battery (2026-11-15, Cloudflare browser 152.0.7977.64)

| Build | Passed | Failed | Notes |
|---|---|---|---|
| main 8e95571 | 17 | 4 | Merriam-Webster and Yahoo Finance failed on the cap; NYT and Etsy blank pages |
| a0e730f (deployed as 423f1dd before the rebase), cap 500 | 19 | 2 | Guardian, TradingView and Yahoo Finance partial (blocked at request 501); NYT and Etsy blank pages |
| scratch d0b5770, cap 5000, 14 heavy sites | 14 | 0 | Yahoo Finance partial (20 s navigation timeout), all others full |
| 73c8681, cap 2000, 12 sites | 11 | 1 | Guardian (833 requests), TradingView (612) and Merriam-Webster (1668, 119 s) full, none reached the cap; Yahoo Finance partial on the 20 s navigation timeout; NYT blank page |

Requests the heavy pages made with the cap out of the way:

| Page | Requests | Announced bytes | Capture time |
|---|---|---|---|
| Merriam-Webster | 1739 | 29.8 MB | 124 s |
| NYT | 1208 | 55.6 MB | 58.5 s |
| Yahoo Finance | 1193 | 13.8 MB | 45 s |
| Guardian | 865 | 6.2 MB | 57 s |
| TradingView | 608 | 31 MB | 30 s |
| CNN | 278 | 24 MB | 31 s |

Guardian and TradingView were `full` on main only by label: the cap was
checked after load, so requests past 500 were blocked unnoticed while WRL
scrolled the page.

## Backlog changes

- #98 closed: decided for partial, and for a cap of 2000.
- #99 opened: the size cap counts announced response sizes and is only
  checked until the page has loaded.
- #100 opened: nytimes.com and etsy.com often come back as a blank page.
- #101 opened: in the cap-2000 run samsung.com served an "Access Denied" page
  that was stored as a complete, full capture, and the browser's response
  status is recorded nowhere.
