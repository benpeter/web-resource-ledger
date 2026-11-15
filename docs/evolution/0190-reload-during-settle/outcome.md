# Outcome

- Red first (d67ce10): an integration test in a real browser. The page of
  phase 0185 keeps making requests after its banner is declined and reloads
  4 seconds after the click, which is inside the wait for open requests. The
  stored HTML was of the reloaded page without its content. Green in
  21a059e.
- `src/capture.js`: `settleAfterConsent()` asks again whether the main frame
  has navigated once the wait for open requests is over, and goes on to the
  reload steps if it has.
- Staging showed a second case, see below. Red in 6caf31c: the same page
  reloading while the log line after the wait is written, with the log
  endpoint taking 1.5 seconds. Green in 0301519: the count of navigations
  for the second pass is taken before that log line.
- The fixture `consent-reload.html` has a lazy image below the fold now, so
  the test also shows that the reloaded page got its scroll: no
  `loading="lazy"` in the stored HTML.
- Docs: verification guide, `coralogix-events.md`, changelog.

## Staging

theguardian.com, banner declined in every capture:

| Build | Captures | Reload noticed in the first pass | Only in the second pass | Captured mid-reload |
|---|---|---|---|---|
| 8bd75a5 (phase 0189) | 1 | 0 | 0 | 1 |
| 21a059e (first fix) | 5 | 2 | 1 | 2 |
| 0301519 (both fixes) | 7 | 5 | 2 | 0 |

- On 0301519 the stored HTML of all seven has no image with
  `loading="lazy"` left (108 to 140 images, 102 to 133 of them switched to
  eager), and the second screenshot is 17 to 19 MB like the first.
  Mid-reload it was 4 to 6 MB and 89 or 90 images were still lazy.
- The two that needed the second pass
  (`cap_3662d324fa984295abca10fb70d3157d`,
  `cap_92809155c8ed469a8d874d4997abb0a7`) are the case the first fix
  missed: `reloaded: false` after 2.5 and 2.7 seconds, then `pass: 2`.
- heise.de, banner declined, no reload: `pass: 1`, 2.5 seconds, as before.
- Such a capture takes 47 to 83 seconds, 11 to 14 of them for the reload.

## Backlog changes

None.
