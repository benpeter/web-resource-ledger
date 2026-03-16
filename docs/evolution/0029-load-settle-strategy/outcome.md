# Outcome: 0029-load-settle-strategy

## What was built

Switched `defaultRenderer()` in `src/capture.js` from `waitUntil: 'networkidle'`
to `waitUntil: 'load'` with a 3-second post-load settle delay. This eliminates
the 20s wait for network silence on ad-heavy sites whose tracking scripts keep
connections alive indefinitely.

## Files changed

| File | Lines | Description |
|------|-------|-------------|
| `src/capture.js` | +17/-8 | New `SETTLE_DELAY_MS` constant, `waitUntil: 'load'`, 3s settle delay with post-settle `limitExceeded` re-check, `categorizeError()` template literal, updated comments |
| `test/fixtures.js` | +3/-3 | 3 renderers: `waitUntilReached` from `'networkidle'` to `'load'` |
| `test/capture.test.js` | +2/-2 | Inline renderer and assertion: `'networkidle'` to `'load'` |
| `openapi.yaml` | +16/-13 | RenderInfo and CaptureRecord descriptions updated; enum preserved for backward compat |

Total: 4 files, +38/-26 lines.

## Test results

497 tests pass, 0 failures. No test regressions.

## What changed from the issue

- **NAV_TIMEOUT_MS kept at 20s** instead of the issue's default 25s. See
  `decisions.md` D1 for justification. Both planning specialists and the
  synthesis agent agreed 20s is correct.
- **Post-settle `limitExceeded` re-check** added per security-minion advisory
  during Phase 3.5 review. Not in the original issue scope but closes a
  real gap.

## What didn't change

- Staged fallback path (lines 404-452) -- structurally identical
- Consent dismissal logic -- unmodified
- WACZ/signing pipeline -- unmodified
- Partial capture behavior -- unmodified
- `waitUntilReached` enum in OpenAPI -- all three values preserved

## Backlog changes

- **Updated**: `[should] Screenshot timing / wait-for-load` in Capture Fidelity
  parking lot -- this is effectively resolved by this phase. Should be marked
  done with a reference to 0029.
- No items added.
- No items removed.
