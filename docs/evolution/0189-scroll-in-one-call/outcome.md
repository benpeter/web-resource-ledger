# Outcome

- Red first (c1a37e0): `test/lazy-scroll.test.js`, with a stand-in page that
  counts calls. The scroll made 37 calls to the browser for a 12,000 px page
  where 3 were expected, and had neither a time limit nor a limit on how
  long the page may take to answer. Green in 765c681.
- `src/capture.js`: `scrollStepwise()` is the loop as it runs in the page,
  `triggerLazyLoading()` sends it with `page.evaluate()`, waits 30 seconds at
  most for the answer and returns `{ scrollMs, steps, budgetUsedUp }`. The
  part after the scroll (lazy images set to load, up to 3 seconds for their
  requests, back to the top) is unchanged.
- Failure reasons, each red first: a page that doesn't answer the scroll
  call (2487b64, green 8bd75a5) and a screenshot that runs into its 90 second
  limit (87010f3, green fd029db).
- `render.default.lazy_load_complete` has `scrollSteps` and `scrollCutShort`.
- Docs: `scrollMs` in `openapi.yaml`, the failure table in the limits page,
  the SWGDE page, `coralogix-events.md`, changelog.

## Staging

On 8bd75a5, against main (dedf42c) an hour before:

| Page | scrollMs before | scrollMs after | capture before | capture after |
|---|---|---|---|---|
| merriam-webster.com/dictionary/ledger | 73,716 | 13,677 | 109.1 s | 47.6 s |
| merriam-webster.com/ | 58,047 | 9,677 | 97.0 s | 43.1 s |
| merriam-webster.com/?a=1 | 38,682 | 11,554 / 17,706 / 10,947 | 67.3 s | completed on the third attempt |

- The scroll itself was 10 steps each time and never ran out of its 10
  seconds. What is left of `scrollMs` on that page is three calls to the
  browser at two to three seconds each and the 3 second wait for images.
- merriam-webster.com/?a=1: the first attempt failed on the screenshot
  (over 90 seconds), the second was ended by Cloudflare for memory, the third
  completed (`cap_4a241265f4164f45a68834de9a0b89e1`). See decisions.
- Other pages: en.wikipedia.org/wiki/Ledger 1.9 seconds, example.com 1.7,
  theguardian.com 8.6 with 17 steps.
- The stored HTML of the merriam-webster capture has no lazy image, and its
  screenshot shows the page to its end with the images at the bottom, both
  as on main.

## Backlog changes

- #102 closed: the scroll no longer takes a minute.
- #105 filed: the screenshot of an ad-heavy page takes 18 to 90 seconds, and
  a Worker went over its memory limit with three such captures at once.
