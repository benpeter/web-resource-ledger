# Decisions

- A page past the subresource cap is captured as partial, on both paths. The
  user gets a signed screenshot and HTML of a heavy page instead of a failure,
  and the result no longer depends on whether `load` beat the timeout. The cap
  still does its job: requests past it are blocked.
- The size cap stays a failure, and now on both paths too. The rendered HTML
  is held in Worker memory to build the WACZ, so a page past 50 MB must not
  reach `page.content()`. Before, the timeout path skipped the check.
- The capture says why it is partial: `render.subresourceLimitReached`
  (`true` or `false` on every new capture, like `screenshotClipped`), signed
  into the WACZ `captureQuality`. The verification page's "Page load" row and
  MCP `get_capture` say it in words. No new `renderQuality` value: clients
  already handle `partial`.
- User-facing text says "requests", not "files" or "subresources": the cap
  counts every request, the page itself and API calls included.
- `categorizeError()` lost its subresource branch, since nothing throws that
  message any more. Old failed captures keep their stored text, and
  `limits.md` says what it meant.
- The cap goes from 500 to 2000. Making the cap honest showed what it had
  been doing: on main the Guardian and TradingView front pages were labelled
  `full` although requests past 500 had been blocked while WRL scrolled the
  page, because the cap was only checked after load. With partial captures
  they turned `partial`, which is true but a worse result for the pages people
  most want as evidence. A scratch build with the cap at 5000 measured what
  those pages need (table in `outcome.md`): 608 to 1739 requests. 2000 covers
  all of them. The price is time, not money or memory: the request handler
  costs one round trip to the browser per request, so Merriam-Webster took
  124 s instead of 22 s. That is far inside the 10-minute render deadline.
- The texts on the verification page and in MCP `get_capture` name no number
  ("more requests than WRL allows for one capture"). They describe one
  capture, and a number there would become false for older captures the next
  time the cap changes. `limits.md` has the number and its history.
- The size cap is untouched and still only checked after load and after the
  settle wait, so a page that passes 50 MB while WRL scrolls is captured
  (nytimes.com, 55.6 MB). Whether the sum of announced response sizes is the
  right thing to cap at all is backlog #99.
- Size-cap fixture: the browser reports a response only once it has finished
  (or enough of it arrived to sniff its type), so a stalled 60 MB response
  never counts. The fixture therefore has one script that delivers 60 MB and
  one that stalls.
- Not a bug, though it looked like one: locally a page with a request that
  never finishes isn't captured as partial. `page.screenshot()` waits for
  `document.fonts.ready`, which the local test browser (Chrome 126, pinned by
  miniflare) leaves pending while the document is loading, so the screenshot
  times out after 90 s. Cloudflare's browser doesn't do that: the same kind
  of page, served from a throwaway Worker, came out as partial on staging
  with a 1.4 s screenshot. A fallback screenshot over CDP was written and
  dropped again, since production doesn't need it. The partial path therefore
  still has no integration test.
- `render.default.session_acquired` logs `browserVersion`, because nothing
  recorded which Chrome a capture ran on, and the question above needed it.
