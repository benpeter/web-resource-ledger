# UX Strategy Review: Stage-Level Timings

**Verdict: APPROVE**

## Scope Assessment

The synthesis plan correctly identifies this as backend instrumentation with no UI changes. My review covers operator experience -- the job of diagnosing slow or failed captures using the Coralogix logs and API responses this change produces.

## Why This Approves

**The change solves a real operator job.** The motivating examples (tagesschau.de at 19.4s, adobe.com failing entirely) are exactly the situation where an operator asks "where is the time going?" The current opaque `durationMs` forces them to guess. The seven stage fields answer the question directly. This is the right level of granularity -- not so coarse that it leaves the question open, not so fine-grained that it floods the log.

**The naming is correct.** The conflict resolution on flat unprefixed names (`sessionAcquireMs`, `consentMs`, etc.) is the right call. Field names should match the thing, not announce their category. `stage_sessionAcquireMs` is bureaucratic noise. Operators scanning Coralogix for slow session acquisition don't want to remember the prefix convention.

**Null semantics serve recognition over recall.** Explicit `null` for skipped stages (`settleMs: null`, `consentMs: null` on partial captures) is better than field omission. When an operator sees the log entry, all seven fields are present and the intent is legible: "this stage was skipped" rather than "this field may not exist on older records or skipped stages or misconfigured renderers." Distinguishing "skipped" from "absent because old capture" is exactly the kind of ambiguity that slows incident diagnosis. The plan chose correctly.

**`consentDurationMs` -> `consentMs` is worth doing now.** Pre-production is the right time. The inconsistency would have created permanent cognitive friction for anyone writing Coralogix queries across timing fields.

**The API shape is right.** `render.stages` nesting makes the part-whole relationship explicit -- a full render has a duration and a breakdown of that duration. An operator calling `GET /v1/captures/:id` gets a coherent object, not seven sibling fields scattered beside `waitUntilReached` and `timedOut`.

## One Minor Observation (No Action Required)

The OpenAPI description notes "The sum of non-null stages approximates but does not exactly equal `render.durationMs` due to inter-stage overhead." This is honest and correct. A future operator might momentarily wonder why they don't add up. The description in the schema handles it. No action needed -- just flagging that this is a known conceptual mismatch to communicate clearly if operators raise it.

## Summary

This change reduces cognitive load for operators by replacing one opaque number with seven named durations, with clear null semantics and consistent naming. It is well-scoped, the conflict resolutions are sound from an operator-experience perspective, and nothing in the plan introduces new complexity for the people consuming this data.
