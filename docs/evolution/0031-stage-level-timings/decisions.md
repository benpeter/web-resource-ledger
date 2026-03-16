# Decisions: Stage-Level Timing Instrumentation

## 1. Nested `render.stages` vs flat fields vs sibling field

**Decision:** Nest stage timings under `render.stages` in KV records and
API responses.

**Considered alternatives:**
- **Flat fields on render** (observability-minion): `render.sessionAcquireMs`,
  etc. Simple but conflates stage timings with render metadata (waitUntilReached,
  timedOut). Makes the part-whole relationship between durationMs and stages
  implicit.
- **Sibling field** (test-minion): `record.stageTimings` alongside `record.render`.
  Avoids breaking `toEqual` assertions on render. But stage timings semantically
  belong inside render, and tests should accommodate additive changes.

**Why `render.stages`:** Structurally explicit part-whole relationship. The stages
are a decomposition of `render.durationMs`, so they belong inside `render`. Clean
OpenAPI representation as a separate `RenderStages` component. The two `toEqual`
assertions that break are a one-line fix each (`toMatchObject`).

## 2. Flat log fields vs nested log structure

**Decision:** Spread stage fields as flat top-level fields on log events.

**Considered alternatives:**
- **Nested `stages` object in logs** (api-design-minion): Consistent with API
  shape. But Coralogix DataPrime queries are simpler with flat fields (`filter
  sessionAcquireMs > 5000`).
- **`stage_` prefix** (api-design-minion): `stage_sessionAcquireMs`. Creates
  inconsistency with existing unprefixed `durationMs`.

**Why flat and unprefixed:** Matches existing convention. Only 7 fields. Coralogix
query ergonomics dominate — operators write queries against logs, not API schemas.

## 3. `null` for skipped stages

**Decision:** Always include all 7 stage fields. Use `null` for stages that did
not execute (e.g., `settleMs: null` and `consentMs: null` on partial captures).

**Alternatives rejected:**
- **Omit** skipped stages: Creates ambiguity between "skipped" and "pre-instrumentation
  capture without stages." Coralogix queries need conditional field existence checks.
- **0** for skipped stages: `0` means "ran instantly." `null` means "did not run."

## 4. `consentDurationMs` retirement

**Decision:** Replace `consentDurationMs` with `consentMs` from the stages spread
on log events.

**Why:** Pre-production project. Naming consistency now (`*Ms` convention) avoids
permanent divergence. The consent module returns `durationMs` as a field name; the
log event field `consentDurationMs` was always inconsistent.

## 5. Timer boundary for consentMs vs screenshotMs

**Decision:** `consentMs` measures only consent dismissal. `screenshotMs` is the
sum of two non-contiguous intervals (before-consent screenshot + after-consent
screenshot).

**Why:** The code flow takes a before-screenshot, then runs consent, then takes an
after-screenshot. If consentMs includes the before-screenshot (which is ~100-500ms),
it misrepresents whether consent itself is slow. The non-contiguous sum for
screenshotMs is semantically honest: "total time spent on screenshot I/O." Stages
still sum exactly to durationMs.

**Flagged by:** lucy during Phase 5 code review. Fixed before merge.

## 6. `toEqual` → `toMatchObject` for existing assertions

**Decision:** Change two assertions from `toEqual` to `toMatchObject` in
`capture-retrieval.test.js` and `kv.test.js`.

**Why:** Adding `stages` to `render` makes the object have 4 fields instead of 3.
`toEqual` does exact structural matching. `toMatchObject` verifies the three
original fields are present and correct without requiring the object to contain
*only* those fields. This is the correct assertion pattern for additive API
evolution.
