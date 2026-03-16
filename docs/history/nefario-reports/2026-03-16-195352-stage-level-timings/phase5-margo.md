# Margo Code Review -- Stage-Level Timing Instrumentation

## VERDICT: ADVISE

The implementation is proportional to the problem. Pure `Date.now()` arithmetic, no new dependencies, no new abstractions, no new services. The code does what the prompt asked for and nothing more. One non-blocking concern about log payload duplication.

---

## Findings

### 1. Duplicated stage data in log events (non-blocking)

**File:** `src/capture.js`, lines 219-220 and 234-235

The `capture.partial` and `capture.success` log events include the full `render` object (which contains `render.stages`) AND spread `render.stages` as top-level fields:

```js
render,                        // contains { ..., stages: { sessionAcquireMs, ... } }
...(render?.stages ?? {}),     // spreads sessionAcquireMs, contextSetupMs, etc. at top level
```

This sends every stage timing twice to Coralogix -- once nested inside `render.stages` and once as a top-level field. The payload is roughly 50% larger than necessary for seven integer fields.

**Why it appears accidental:** The spreading exists so Coralogix queries can reference `sessionAcquireMs` directly without nested-field syntax. That is justified. But including the full `render` object alongside the spread duplicates the data. The `render` object also includes `waitUntilReached`, `timedOut`, and `durationMs` which are already present (or derivable from) other log fields -- `durationMs` at the log level covers total capture duration, and `renderQuality` signals the partial/full distinction.

**Simpler alternative:** Drop the `render` property from the log event. The spread already promotes the stage timings. If `waitUntilReached`, `timedOut`, and `durationMs` are needed as log fields, spread them individually or add them as explicit properties. This keeps the log payload flat and non-duplicative:

```js
await log(env, 3, 'capture', {
  event: 'capture.partial',
  captureId,
  tenantId,
  cip,
  renderQuality,
  durationMs: Date.now() - start,
  waczStatus: 'skipped',
  renderDurationMs: render?.durationMs ?? null,
  timedOut: render?.timedOut ?? null,
  ...(render?.stages ?? {}),
});
```

**Why non-blocking:** The duplication is harmless -- it wastes a few bytes per log event but does not cause incorrect behavior, data loss, or debugging confusion. Coralogix ingests both fine. The cost is negligible at current capture volumes. This is a cleanliness issue, not a correctness issue.

---

### 2. Everything else: clean

**Timing instrumentation in `defaultRenderer()`:** Seven `Date.now()` calls placed at natural stage boundaries. No new abstractions, no timing utility class, no wrapper functions. The timestamps are local variables computed in sequence. This is exactly the right level of complexity for the problem.

**Partial capture path:** Correctly sets `settleMs: null` and `consentMs: null` for stages that do not execute. The OpenAPI schema documents nullable fields. The null convention is explicit and unambiguous -- distinguishes "did not run" from "ran in 0ms."

**OpenAPI schema (`RenderStages`):** Seven fields, all `type: [integer, 'null']`, all required. The required-but-nullable pattern is correct for "always present, sometimes null" semantics. Schema is proportional -- no speculative fields, no extensibility hooks.

**`render.stages` nesting:** Correct structural choice. Stages are a sub-aspect of render metadata, not peers of `waitUntilReached` and `timedOut`. The nesting matches the conceptual hierarchy without adding an indirection layer.

**Test changes (`toEqual` -> `toMatchObject`):** The two test files relax assertions on `render` metadata from exact equality to partial matching. This is the correct adjustment -- tests that asserted the exact shape of `render` (three fields) would break now that `stages` is present. The tests still verify the fields they care about. No weakening of actual coverage.

**KV storage:** Stages flow through the existing `render` parameter on `completeCapture()`. No schema migration, no new KV operations, no conditional logic in the KV layer. The `render` object is opaque to KV -- it stores whatever the caller provides.

**Complexity budget:** Zero. No new technologies, services, abstractions, or dependencies. Pure arithmetic.

---

## Summary

| Metric | Value |
|--------|-------|
| New dependencies | 0 |
| New abstractions | 0 |
| New services | 0 |
| Files changed | 4 |
| Complexity budget spend | 0 |
| Non-blocking concerns | 1 (log payload duplication) |
| Blocking concerns | 0 |
