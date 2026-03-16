# Outcome: Stage-Level Timing Instrumentation

## What was built

Pure instrumentation change to `defaultRenderer()` that decomposes the opaque
`render.durationMs` into 7 stage-level durations. No behavioral changes to the
capture pipeline.

### Files modified

| File | Change | Lines |
|------|--------|-------|
| `src/capture.js` | `Date.now()` timestamps at 7 stage boundaries in `defaultRenderer()`, flat stage fields on log events, `consentDurationMs` removed | ~50 lines added |
| `openapi.yaml` | New `RenderStages` component (7 nullable integer fields), optional `stages` on `RenderInfo` | ~55 lines added |
| `test/capture-retrieval.test.js` | `toEqual` → `toMatchObject` (1 line) | 1 line changed |
| `test/kv.test.js` | `toEqual` → `toMatchObject` (1 line) | 1 line changed |
| `test/capture.test.js` | 2 new renderer stubs + 3 new tests for stages shape | ~50 lines added |

### Stage mapping

```
renderStart
  --> getOrCreateSession()                  --> sessionAcquireMs
  --> browser.newContext() + routes + page   --> contextSetupMs
  --> page.goto()                           --> navigationMs
  --> settle delay (3s)                     --> settleMs
  --> before-screenshot + consent           --> consentMs (consent only)
  --> after-screenshot                      --> screenshotMs (both screenshots summed)
  --> page.content()                        --> contentMs
```

Partial captures: `settleMs` and `consentMs` are `null` (skipped after navigation
timeout). All other stages are populated.

### Data flow

1. `defaultRenderer()` returns `render.stages` as part of the render object
2. `performCapture()` spreads stages as flat fields on `capture.success` and
   `capture.partial` Coralogix log events
3. `completeCapture()` stores the full render object (including stages) in KV
4. `handleGetCapture()` passes render through to the API response

No intermediate code strips or transforms the stages object. The flow is
passthrough by design.

## Test results

503 tests pass (3 new, 0 regressions). The 3 new tests:
- Full-capture stages: all 7 fields present and are numbers
- Partial-capture stages: settleMs and consentMs are null, others are numbers
- Legacy renderer: stages is undefined (backward compat)

## Surprises and deviations

- **screenshotMs is non-contiguous**: The before-consent screenshot happens between
  settle and consent. Rather than folding it into settleMs or consentMs (both
  misleading), screenshotMs sums two intervals: (before-screenshot) + (after-screenshot).
  The stages still sum exactly to durationMs. This was caught by lucy in code review
  and fixed before merge.

- **`capture.partial` log event duplication**: The partial log event includes both
  the nested `render` object (pre-existing) and the flat stage fields (new).
  Accepted: removing the pre-existing `render` field would be a scope-creep log
  schema change.

## Backlog changes

No backlog changes. The issue scope was narrow (instrumentation only) and everything
in scope was completed.
