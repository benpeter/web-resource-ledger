# Phase 0021: Staged Fallback for Capture Timeout

**Source**: GitHub issue #53
**Advisory**: docs/history/nefario-reports/2026-03-16-112535-staged-fallback-capture-timeout.md

## Task

Implement staged fallback for capture timeout (partial captures). Heavy pages
(tagesschau.de, sites with tracking/consent/lazy-load) never reach `networkidle`
within the 25s `NAV_TIMEOUT_MS` and fail entirely. The capture produces zero
evidence. The 30s `ctx.waitUntil` limit is hard and not configurable on
Cloudflare Workers.

Catch the Playwright `TimeoutError`, check if the page passed `DOMContentLoaded`,
and if yes: capture screenshot + rendered HTML from the partially-rendered page.
Mark as `status: 'complete'` with `renderQuality: 'partial'`. Skip WACZ bundling
on the timeout path (time budget too tight).

## Key Decisions (from advisory, 4 specialists unanimous)

- Keep `status: 'complete'`, add `renderQuality: 'full' | 'partial'`
- Skip WACZ on timeout path (~1.5-4.5s headroom after 25s)
- `DOMContentLoaded` is the minimum threshold -- below that, still fail
- Sign `captureQuality` metadata into WACZ `datapackage.json` for full captures
- No `retryable` on partial captures -- they are successes
- Factual language: "Page did not reach network idle" not "degraded"
- Verification page stays green -- render quality is informational, not a finding

## Implementation Scope

1. `src/capture.js`: catch `TimeoutError`, check `document.readyState`, capture with short timeouts, skip WACZ, deadline at 28s
2. `src/kv.js`: extend `completeCapture()` to accept `renderQuality` and `render` metadata
3. `src/index.js`: surface `renderQuality` in `handleGetCapture`, `handleListCaptures`, `handleVerifyCapture`
4. `src/wacz.js`: add `captureQuality` to `datapackage.json` for full captures
5. `openapi.yaml`: add `RenderInfo` schema, extend CaptureRecord, CaptureSummary, VerificationCapture
6. `src/verify-page.js`: add "Capture note" line for partial captures
7. Tests for all new paths
8. Observability: log timeout rate, renderQuality, time budget distribution
