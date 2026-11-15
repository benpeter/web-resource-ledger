# Outcome

- Red first (7d3b158): two integration tests in a real browser. A page whose
  script answers after 22 seconds had null stage timings and no consent
  record, and a blank page of that kind completed as a partial capture.
  Green in 9e52a2a.
- `src/capture.js`: the navigation timeout branch sets `timedOut` and falls
  through into the steps of a loaded page. 41 lines added, 77 removed.
- `render.default.nav_timeout` logs `openRequestCount` and `openRequests`
  (red eb7cfbc, green 7d0be7a): up to eight "resource type host" pairs the
  page was still waiting on.
- Docs: verification guide (partial captures), `RenderInfo`, `RenderStages`
  and `renderQuality` in `openapi.yaml`, `coralogix-events.md`, changelog.

## What the production data showed

All 76 partial captures since 1 October are the hourly apache.org check (300
runs). The load event came after 1 to 3 seconds on 224 runs and not within
20 seconds on the others; nothing in between. No other tenant had a partial
capture in that time.

## Staging

Test pages on a temporary Worker (`wrl-stall-test`, removed afterwards): a
page with a script that answers after 28 seconds, and a blank page with the
same script.

| | main (e059856) | this branch (7d0be7a) |
|---|---|---|
| slow page | partial, `settleMs` and `consentMs` null, no `captureSettings`, 25.0 s | partial, settle 0.5 s, scroll 3.1 s, consent 2.9 s, `consent.result` notDetected, 32.3 s |
| blank slow page | complete, partial | failed, "The page loaded but showed nothing (blank page)" |

- finance.yahoo.com timed out on the branch as it does on main: partial, with
  settle 3.0 s, scroll 22.6 s, consent 2.5 s, 64.0 s in all (30 to 44 s on
  main, without those steps). Its `nav_timeout` log lists 91 open requests,
  among them `image sync.1rx.io`, `image usersync.gumgum.com` and
  `script eus.rubiconproject.com`: ad sync requests keep the load event back.
- theguardian.com timed out twice on main an hour earlier
  (`cap_a55c83dc179f4967b89b7e38de3238c8`): the screenshot has the "Your
  privacy" banner over the top story. On the branch it loaded in time, so
  there is no timed-out capture of it with the banner dismissed.
- The slow test page's screenshot is the same on both versions: Chrome loads
  an `<img loading="lazy">` for a full-page screenshot anyway. The scroll
  matters for images that load on an IntersectionObserver.
- Battery, 9 sites that load in time, against the run on 02b5446 the same
  afternoon: 8 unchanged (example.com, GitHub, Spiegel, BBC, CNN, NYT,
  Wikipedia, TradingView), samsung.com answered 403 on both runs.

## Backlog changes

- New #102: on merriam-webster.com the scroll step takes about a minute and
  lost the browser session in two of four attempts (seen in the battery of
  the autoconsent update, on main).
