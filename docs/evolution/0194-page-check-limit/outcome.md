# Outcome

- Red first (95b7499): each check called with a page that never answers must
  fail after 15 seconds, and the failure must get its own reason. Green in
  aea61ee. Refactor in a54ddfc: the scroll uses the same helper.
- Second pair after the first staging run: red in ae2b4da (the scroll step
  with a page whose second or third call is never answered), green in
  0412bb2.
- `src/capture.js`: `PAGE_CHECK_MAX_MS`, `answerWithin()`, the two checks
  and the two calls after the scroll wrapped, `categorizeError()` names the
  new reason.
- Docs: the failure table in `site/content/limits.md`, changelog.

## Staging

Two runs, each on the branch deployed to staging, dictionary.com as the page
that does not answer.

- First build (a54ddfc, checks limited):
  `cap_a02ff35ece424fa9a2e3ae98975db449`. Attempt 1 failed in 83 seconds
  with "The page stopped answering while WRL scrolled it", attempts 2 and 3
  in 62 and 63 seconds with "The page stopped answering while WRL checked
  it". Attempt 4 sat for 177 seconds and ended with "Browser session was
  unexpectedly closed": a call after the scroll, which led to the second
  pair.
- Second build (0412bb2): `cap_68552dff52514a6eaabb7b22d109808f`. Attempts
  1 and 3 failed in 53 and 64 seconds ("checked"), attempt 2 in 73 seconds
  ("scrolled"). Attempt 4 got through the checks and the scroll (36
  seconds) and failed after 236 seconds at the screenshot, which was not
  done after 90 seconds. No attempt lost its browser session. The capture
  still failed, 11 minutes after it was submitted, now with a reason that
  names the step.
- Pages that answer are unchanged: example.com 5.2 and 5.9 seconds,
  Wikipedia 8.3, heise.de 30.7 and 30.3 (banner declined), merriam-webster
  115 seconds (complete).

Not checked: production, until the merge is deployed there.

## Backlog changes

- #105: comment with what is done and why retries stay.
