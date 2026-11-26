# Decisions

- The roadmap asked for five consent outcomes (`noCmpDetected`,
  `noRejectOption`, `success`, `optOutFailed`, `timeout`). Two exist already
  under other names: `notDetected`, and `accepted` from phase 0210 for a wall
  that offers no way to decline. Renaming `result` would break clients and
  signed bundles, so `failed` keeps its name and gets `failureReason`:
  `timeout` (declining didn't finish in 10 s), `optOutFailed` (declining was
  tried and the banner or wall stayed), `error` (the step failed in the
  browser, including not starting within 15 s).
- `render.overlayCoverage`: after the last screenshot, the topmost element at
  a 10 by 10 grid of points in the window; a point counts when that element
  sits in a `position: fixed` element. A grid of `elementFromPoint` calls is
  cheap on pages with tens of thousands of elements, where computing the
  style of every element is not. A fixed element holding `main`, `article` or
  more than 2,000 characters is an app shell, not an overlay, and doesn't
  count. Popups and their backdrops, fixed headers and leftover banners all
  count: the number says how much of the window something sat on top of. The
  verify page and MCP mention it from 0.3, the roadmap's threshold.
- `render.paywallSignals`: schema.org `isAccessibleForFree: false` in JSON-LD
  (publishers mark paywalled articles this way for Google), a visible Piano
  modal or backdrop, a visible element with "paywall" in its id or class. A
  Piano script alone is not a signal: sites use Piano for analytics too.
  Noted only; WRL doesn't get around paywalls.
- Both fields are always written on new browser captures (0 and `[]` when
  there is nothing), so a missing field means an older capture, and both are
  signed into the bundle's `captureQuality`.
- Left out: the roadmap's "safe-shot vs aggressive consent" timeout A/B
  (phase 0210's wall step changed the consent flow since), closing overlays
  (deferred in the roadmap), and `@w-r-l/verify` output (a CLI release for
  two notes; the verify page and MCP have them).
