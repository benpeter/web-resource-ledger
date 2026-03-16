# Outcome: Optimize Capture Pipeline (#79)

## What was built

Three optimizations to the capture pipeline, all in a single cohesive change:

1. **Adaptive settle delay** (`src/capture.js`): New `waitForSettle(page)` function
   replaces the fixed 3s `setTimeout`. Monitors in-flight HTTP requests via Playwright
   page events, ignoring websocket/eventsource. Resolves after 500ms of zero in-flight
   requests (quiescence) or 3s hard cap. Returns telemetry: `settleMs`, `settleReason`
   ('idle'|'cap'), `pendingAtCap`.

2. **Consent timeout reduction** (`src/consent.js`): `CONSENT_TIMEOUT_MS` reduced
   from 8000 to 2000. Single constant change.

3. **Graceful consent failure** (`src/capture.js`): Try/catch around
   `dismissCookieConsent(page)` with selective error propagation. Browser death errors
   re-thrown (Target closed, page was closed, etc.). Consent-specific errors degrade
   to `{status:'failed', cmp:null, durationMs:0}` with `_error` metadata for logging.
   `capture.consent_error` event emitted at warning level with errorClass/errorMessage.

## Files changed

| File | Lines | Description |
|------|-------|-------------|
| `src/capture.js` | +103/-8 | Adaptive settle, consent try/catch, settle telemetry in logs |
| `src/consent.js` | +1/-1 | Timeout constant 8000 → 2000 |
| `test/capture.test.js` | +56 | Consent error tests (3), settle telemetry test (1), updated enrichedStubRenderer |
| `openapi.yaml` | +21/-7 | settleMs/settleReason in RenderInfo, updated timing descriptions |

## Budget impact

- **Worst case**: 20s + 3s + 2s + 2s = 27s (down from 33s)
- **Fast path** (CMP-absent static page): ~5s + 0.5s + 2s + 2s ≈ 9.5s
- **Expected improvement**: 5-8s per capture on CMP-absent pages

## Test results

504 tests pass across 23 test files. No regressions. 4 new tests added.

## Backlog changes

- #79 resolved by this phase
- No new backlog items created (scope stayed within bounds)
