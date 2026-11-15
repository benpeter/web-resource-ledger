# Decisions

- What was seen (staging, dictionary.com,
  `cap_ad47d48b9a3f4ce3befd97114515af18`): in two attempts the two checks
  took about 16 seconds together. In another the renderer sat in them for 91
  seconds, until `page.evaluate: Target page, context or browser has been
  closed`.
- 15 seconds for each check, the same number as the consent setup (phase
  0191). On a page that answers, a check takes milliseconds. 16 seconds for
  both still passes, so no attempt that got through before fails now.
- Its own reason, "The page stopped answering while WRL checked it",
  retryable like the scroll's. "Checked" covers both checks; a reason per
  check would tell a user nothing more.
- `detectRenderFailure()` and `readBotCheckSignals()` are exported so the
  tests can call them with a page that never answers, as
  `triggerLazyLoading()` is tested.
- One helper, `answerWithin(call, maxMs, message)`. The scroll's 30 second
  race was the same code and uses it now. The consent setup keeps its own:
  its limit is for two calls together, counted from a start time.
- The first version left the two small calls after the scroll alone (making
  lazy images eager, the scroll back to the top), because none had been seen
  to hang. The first staging capture of dictionary.com on that build showed
  one: attempt 4 logged nothing for 143 seconds after the settle and ended
  with `page.evaluate: Target page, context or browser has been closed`.
  The browser session is closed 120 seconds after its last command
  (`KEEP_ALIVE_MS`), so the call that got no answer was sent about 23
  seconds after the settle. The checks and the scroll were limited to 60
  seconds together by then and neither failed, so it was a call after the
  scroll. Both have the 15 seconds now and fail with the scroll's reason:
  they are part of the scroll step, and its row in the failure table says
  so.
- That also explains "Browser session was unexpectedly closed" after a long
  silence on such pages: a call without a limit waits until the session is
  closed for being idle.
- Reading the HTML and the screenshots are not touched. The screenshot has
  its 90 seconds (phase 0189); no capture was seen to hang in
  `page.content()`.
- Retries stay at three. dictionary.com got no further on any retry, but
  merriam-webster.com, the other page of this kind, completed on a later
  attempt more than once (it serves a light and a heavy version). One site
  is not enough to take retries away from every page that did not answer.
