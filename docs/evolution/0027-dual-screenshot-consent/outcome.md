# Outcome: Phase 0025 -- Dual-Screenshot Cookie Consent

## What was built

Dual-screenshot cookie consent dismissal for all WRL captures. Every full
capture now:

1. Takes a "before" screenshot (first-visit state, cookie banner visible)
2. Attempts server-controlled consent dismissal via `@duckduckgo/autoconsent`
3. If a CMP is detected and dismissed, takes an "after" screenshot
4. Stores both screenshots in R2, WACZ bundle, and KV metadata
5. Records `captureSettings` (consent library, action, result, CMP name)
   in `datapackage.json` -- automatically covered by the Ed25519 signature

## Files changed

### New files
- `src/consent.js` -- autoconsent integration module (dismissCookieConsent, AUTOCONSENT_VERSION)
- `src/vendor/autoconsent.playwright.js` -- vendored autoconsent script (168KB)
- `src/vendor/autoconsent-script.js` -- JS wrapper for text import
- `test/fixtures.js` -- shared test constants and consent-aware renderer stubs

### Modified files
- `src/capture.js` -- dual-screenshot pipeline, NAV_TIMEOUT_MS 25s->20s, captureSettings
- `src/warc.js` -- dual screenshot WARC records with before/after URIs
- `src/wacz.js` -- captureSettings in datapackage.json
- `src/kv.js` -- completeCapture() accepts captureSettings
- `src/index.js` -- screenshot-before artifact route, captureSettings in responses
- `src/verify-page.js` -- consent check, dual screenshot display, capture details
- `openapi.yaml` -- v0.4.0: ConsentHandling, CaptureSettings, screenshotBefore schemas
- `package.json` -- @duckduckgo/autoconsent dependency
- `test/capture.test.js`, `test/wacz.test.js`, `test/key-rotation.test.js` -- updated for new shapes
- `test/verify-html.test.js`, `test/verify-integration.test.js` -- shared fixture imports

## Test results

474 tests pass across 22 test files. OpenAPI spec validates (1 pre-existing warning).

## Surprises and deviations

- The issue specified `screenshot-before.png` / `screenshot-after.png` as R2 key
  names. We kept `screenshot.png` for the primary (best-available) and only added
  `screenshot-before.png` as new. This preserves backward compatibility.
- The `autoconsent.playwright.js` vendored file couldn't use Wrangler's
  `with { type: 'text' }` import assertion -- Miniflare test environment doesn't
  support it. Solved with a JS wrapper module (`autoconsent-script.js`).

## Backlog changes

- **Resolved**: `[should] Dual-screenshot cookie consent dismissal (#58)` --
  moved from Parking Lot / Capture Fidelity to Done
- **Resolved**: `[consider] Capture options metadata schema (captureSettings)` --
  the `captureSettings` schema shipped as part of this feature
- No new items added. No tier changes.
