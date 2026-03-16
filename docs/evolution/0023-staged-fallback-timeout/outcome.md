# Phase 0023: Outcome

## Summary

Implemented staged fallback for capture timeout. Pages that previously failed
entirely when they couldn't reach `networkidle` within 25s now produce usable
partial captures (screenshot + HTML) when DOMContentLoaded has fired. WACZ
bundling is skipped on the timeout path. The feature is fully backward compatible.

## What Was Built

### Source changes (4 files, +170/-48 lines)

- **src/capture.js**: `defaultRenderer()` catches `TimeoutError`, checks
  `document.readyState`, captures with 2s deadline budget, returns enriched
  shape `{ screenshot, html, partial, render }`. `performCapture()` skips WACZ
  for partial captures, logs `capture.partial` event. `categorizeError()` handles
  `'Deadline exceeded'` errors.

- **src/kv.js**: `completeCapture()` accepts optional `renderQuality` and
  `render` metadata parameters.

- **src/index.js**: `handleGetCapture`, `handleListCaptures`, and
  `handleVerifyCapture` surface `renderQuality` (defaulting absent to `'full'`)
  and `render` metadata.

- **openapi.yaml**: New `RenderInfo` schema. `CaptureRecord`, `CaptureSummary`,
  `VerificationCapture` extended. New `partialCapture` example. Verify endpoint
  description updated re: 404 for WACZ-less captures. Version stays at 0.3.0.

### Test changes (5 files, +385 lines)

34 new tests covering: partial capture success (DOMContentLoaded and load event),
partial failure (deadline exceeded), full capture with render metadata, legacy
renderer backward compatibility, KV extension, API response shapes, list
endpoint, verify 404 for partials.

### Spec validation

`npx spectral lint openapi.yaml` passes with 0 errors (2 pre-existing warnings).

### Test results

474 tests pass across 22 test files. Zero regressions.

## What Deviated from Plan

Nothing significant. The plan was well-specified from a unanimous advisory phase
with 4 specialists. Minor adaptation: test IDs needed hex-only characters to
match the route regex pattern.

## Backlog Changes

- **Add**: WACZ `captureQuality` in datapackage.json (deferred from this phase;
  sign quality metadata into WACZ for full captures). Activation: when partial
  captures become common enough to warrant evidence chain enrichment.
- **Update**: R16 (Queues) backlog item should note that the staged fallback is
  now implemented and that R16 activation remains data-driven (timeouts >5%).
