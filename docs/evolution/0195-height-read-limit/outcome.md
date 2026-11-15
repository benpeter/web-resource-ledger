# Outcome

- Red first (8d31b55): a height read that is never answered must fail after
  15 seconds, the failure must be named as a screenshot failure, and the
  ready state read must come back as `unknown` after 15 seconds. Green in
  a7bdc12.
- Second pair after the staging run: red in 1c3df4e (both reads are still
  waiting after 29 seconds and give up after 30), green in 155208d.
- `src/capture.js`: `takeCappedScreenshot()` and the new `readReadyState()`
  use `answerWithin()`; `categorizeError()` names the height read's failure.
- Docs: the screenshot's row in the failure table of
  `site/content/limits.md`, changelog.

## Staging

- First build (a7bdc12, both reads at 15 seconds), dictionary.com:
  `cap_17458a4dca14411597c6b03d84c418dc` failed after four attempts, 9
  minutes after it was submitted. Attempts 1 and 3 ended with "The page
  stopped answering while WRL scrolled it", attempts 2 and 4 with "The page
  stopped answering while WRL checked it". No attempt reached a screenshot,
  so the height read's limit was not exercised. The ready state read
  answered `interactive` on each attempt, 7.6 to 10.0 seconds after the 20
  second navigation limit. That measurement led to the second pair.
- Pages that answer, same build: example.com 5.1 seconds, heise.de 29.6
  (banner declined).
- Second build (155208d, both reads at 30 seconds), four pages, all
  complete: example.com 5.6 seconds, heise.de 20.2 (banner declined),
  finance.yahoo.com 55.3 through the navigation timeout path (its ready
  state was read in 3.9 seconds), merriam-webster.com 17.4 (its light
  version). dictionary.com was not run again on this build.

Not shown on staging: a height read that takes longer than its limit. The
unit tests cover it. Which of the two calls took the 58 seconds in phase
0194's run is still open; the next attempt that gets as far as the
screenshot on such a page shows it.

## Backlog changes

- #105: comment with the result.
