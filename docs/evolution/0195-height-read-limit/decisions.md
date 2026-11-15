# Decisions

- What was seen (staging, dictionary.com,
  `cap_68552dff52514a6eaabb7b22d109808f`, attempt 4): `lazy_load_complete`
  at 22:34:02 UTC, then nothing until `page.screenshot: Timeout 90000ms
  exceeded` at 22:36:30. Between the two the renderer makes two calls:
  `takeCappedScreenshot()` reads the page's height and then takes the
  screenshot. The height read had no limit.
- What that does not prove: the logs have no line between the two calls, so
  the 58 seconds were either the height read or a screenshot timeout that
  fired late. The read gets its limit either way, because it is a call to a
  page that is known not to answer. The next capture of such a page shows
  which it was: a slow height read now fails after 15 seconds.
- All calls to the page in the renderer were listed for this. Two had no
  limit. The second is the read of `document.readyState` after a navigation
  timeout. It was not seen to hang, but it is slow on this page: on
  each attempt of that capture the navigation timeout was logged 24 to 30
  seconds after the context was ready, where 20 are allowed, and this read
  is the only call in between.
- The first version gave both reads the 15 seconds of the page checks. The
  staging run on that build showed the ready state read taking 8 to 10
  seconds on each attempt, and the `nav_timeout` lines in the log store
  (52 from about 36 hours, all staging; production had none) put its longest answer at 14.9 seconds
  on dictionary.com and under 5 seconds on every other site. A limit of 15
  sits on that maximum.
- 30 seconds for each, `PAGE_READ_MAX_MS`, through `answerWithin()` from
  phase 0194. Without these two reads there is no capture, so giving up
  early costs more than waiting: a longer limit can only cost seconds on a
  page that fails anyway. 30 is still far below the 120 seconds after which
  an idle browser session is closed. For the height read there is no
  measurement of its own; it gets the same number for the same reason.
- The page checks keep their 15 seconds. They were measured in phase 0194
  (about 8 seconds each on attempts that got through).
- The height read fails with the screenshot's reason, "The browser could not
  take a screenshot of this page". It is part of that step, as the two calls
  after the scroll fail with the scroll's reason. No new row in the failure
  table; the screenshot's row names the case.
- The ready state read already turned an error into `unknown`, which ends
  the attempt as a page that did not load (or did not respond, when no byte
  arrived). No answer in 15 seconds does the same. `readReadyState()` is its
  own exported function so the tests can call it with a page that never
  answers, like the checks in phase 0194.
- `page.content()` on a page that did load stays without a limit of its own.
  It is one large read, not a small one, its time depends on the size of the
  page, and no capture was seen to wait in it. The 10 minute limit on the
  whole render covers it.
- The cookie banner step's calls into frames were not touched: its setup has
  the limit from phase 0191 and its waits have their own.
