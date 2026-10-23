# Decisions

## What was wrong

For a page taller than `MAX_PAGE_HEIGHT` (8000 px) the renderer resized the
viewport to 1280x8000 and then took a `fullPage` screenshot. A full-page
screenshot ignores the viewport height, so the cap never limited it. Chrome
answered `Page.captureScreenshot: Unable to capture screenshot`, the capture
was retried three times and then failed for good.

In the battery that hit BBC (13,864 px), CNN (19,951), GitHub (11,646),
Guardian (21,860), Hurriyet (13,359), Spiegel (32,622) and TradingView
(16,906): every site that crossed the cap. Production showed the same on
2026-10-23 (github.com and theguardian.com failed, bbc.com/news completed).
The cap and the resize date from the first capture module in March.

## Fix

`takeCappedScreenshot(page)` in `src/capture.js`:

- measures the larger of `body.scrollHeight` and `documentElement.scrollHeight`
  (some pages have a short body and a tall root element)
- below the cap: the same full-page screenshot as before
- above it: a full-page screenshot with `clip` set to the top 8000 px. In
  Playwright a clip on a full-page screenshot is measured against the
  document, so this captures beyond the viewport but stops at 8000 px
- never resizes the viewport. A 1280x8000 viewport also stretched every
  `100vh` element to 8000 px

All three screenshot calls (partial capture, before and after consent) use it.
The log event is now `render.default.screenshot_capped`.

## Not done

- GitHub's homepage still fails with the same error even when clipped. It
  needs its own look (issue to follow); a viewport-only fallback screenshot
  is one option.
- The capture record doesn't yet say that its screenshot was cut. The limits
  page says so in general.
