# Decisions

- A page past the subresource cap is captured as partial, on both paths. The
  user gets a signed screenshot and HTML of a heavy page instead of a failure,
  and the result no longer depends on whether `load` beat the timeout. The cap
  still does its job: request 501 and later are blocked.
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
- The cap stays at 500. Raising it is a separate question.
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
