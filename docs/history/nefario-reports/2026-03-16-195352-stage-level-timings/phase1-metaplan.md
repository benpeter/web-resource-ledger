# Meta-Plan: Stage-Level Timings for defaultRenderer()

## Task Summary

Add per-stage duration instrumentation to `defaultRenderer()` in `src/capture.js`
so that slow stages (session acquisition, navigation, consent, screenshots) are
individually visible in Coralogix logs and the capture API. This replaces the
current opaque single `durationMs` number in the `render` metadata object.

**Scope**: `defaultRenderer()` timing, `render` metadata shape expansion,
structured log event, OpenAPI spec update for the render object, KV record
passthrough.

**Out of scope**: Alerting rules, Coralogix dashboards, performance optimization,
behavior changes to navigation or consent logic.

## Planning Consultations

### Consultation 1: Observability -- Structured Log Event Design

- **Agent**: observability-minion
- **Planning question**: What should the structured log event look like for
  per-stage capture timings? The current `capture.success` and `capture.partial`
  events already include a single `durationMs` and some consent fields
  (`consentStatus`, `consentCmp`, `consentDurationMs`). How should per-stage
  durations be added -- as flat top-level fields on the existing events, or as a
  nested `stages` object? Should the log event carry the full stage breakdown
  even for partial captures (where consent is skipped and some stages are N/A)?
  What field naming convention aligns with Coralogix query patterns? Consider
  that this is a Cloudflare Worker with fire-and-forget logging to the Coralogix
  Singles API (see `src/log.js`).
- **Context to provide**: `src/capture.js` (the `defaultRenderer()` function and
  both `capture.success` / `capture.partial` log calls), `src/log.js` (Coralogix
  integration), `src/consent.js` (already returns `durationMs`).
- **Why this agent**: Observability-minion has the expertise to design log schemas
  that are queryable, aggregatable, and forward-compatible with future alerting
  and dashboards in Coralogix.

### Consultation 2: API Design -- Render Metadata Shape

- **Agent**: api-design-minion
- **Planning question**: The current `render` object returned by `defaultRenderer()`
  has three fields: `{ waitUntilReached, timedOut, durationMs }`. It is stored in
  KV and exposed via `GET /v1/captures/:id`. The task adds per-stage durations:
  `sessionAcquireMs`, `contextSetupMs`, `navigationMs`, `settleMs`, `consentMs`,
  `screenshotMs`, `contentMs`. Should these be top-level siblings of `durationMs`
  in the existing `render` object, or nested under a `stages` sub-object? Should
  `durationMs` remain as the total (sum of stages) for backward compatibility, or
  be computed client-side? How should partial captures represent stages that were
  skipped (consent, settle)? The current API contract is defined in
  `openapi.yaml` under `RenderInfo`.
- **Context to provide**: `openapi.yaml` (the `RenderInfo` schema, lines 257-290),
  `src/capture.js` (`defaultRenderer()` return shape and `performCapture()` which
  passes `render` to `completeCapture()`), existing test fixtures in
  `test/fixtures.js`.
- **Why this agent**: API design expertise is needed to ensure the expanded render
  metadata is backward-compatible, consistent with the existing API patterns, and
  ergonomic for consumers (both the verification page and future Coralogix queries).

### Consultation 3: Test Strategy -- Preserving Existing Tests

- **Agent**: test-minion
- **Planning question**: A key success criterion is "all existing tests pass
  unchanged." The current test suite uses injectable stub renderers (in
  `test/fixtures.js`) that return specific `render` shapes. The `defaultRenderer()`
  internal implementation is NOT directly tested (it requires a real browser). The
  tests that will be affected are those that assert on the `render` object shape
  stored in KV (e.g., `record.render.durationMs`, `record.render.timedOut`).
  What is the safest approach: (a) keep the existing stubs exactly as-is and only
  test the new stage fields via new stub renderers that include them, or
  (b) update all existing stubs to include the new fields? Are there any test
  files beyond `capture.test.js` and `fixtures.js` that assert on the `render`
  object shape?
- **Context to provide**: `test/fixtures.js` (all renderer stubs), `test/capture.test.js`
  (particularly the render metadata assertion sections), `src/capture.js`
  (`performCapture()` which passes `render || null` to `completeCapture()`).
- **Why this agent**: Test-minion can identify which tests are brittle to shape
  changes and recommend a strategy that satisfies "existing tests pass unchanged"
  while covering the new instrumentation.

## Cross-Cutting Checklist

- **Testing**: INCLUDE -- test-minion is Consultation 3 above. Planning question
  focuses on backward-compat strategy for existing test assertions against the
  `render` object shape.
- **Security**: EXCLUDE -- this is pure instrumentation (timing metadata). No new
  attack surface, no user input handling, no auth changes, no new dependencies.
  The new fields are all `Date.now()` deltas, which are safe integers. No secrets
  or PII are involved.
- **Usability -- Strategy**: INCLUDE (mandatory). The planning question is narrow:
  the `render` metadata is consumed by API callers and visible in
  `GET /v1/captures/:id`. ux-strategy-minion should review whether the stage
  names are intuitive to operators and whether the API response is becoming
  cluttered with timing metadata. However, since this is a backend observability
  feature with no UI, the consultation can be lightweight -- folded into
  api-design-minion's consultation rather than a separate one.
- **Usability -- Design**: EXCLUDE -- no user-facing interface changes. The
  `render` object is JSON metadata consumed programmatically.
- **Documentation**: INCLUDE (mandatory). The OpenAPI spec (`openapi.yaml`) is
  the primary documentation for the `RenderInfo` schema and must be updated.
  api-spec-minion should review the OpenAPI changes for correctness, but since
  the spec update is mechanical (adding properties to an existing schema), this
  can be handled during execution rather than planning. software-docs-minion
  should confirm whether any architecture docs need updating.
- **Observability**: INCLUDE -- observability-minion is Consultation 1 above.
  This task IS an observability enhancement. sitespeed-minion is not relevant
  (no web-facing frontend changes).

## Anticipated Approval Gates

1. **Render metadata shape** (MUST gate) -- The expanded `RenderInfo` schema is
   an API contract change with downstream dependents: KV record shape, OpenAPI
   spec, log event structure, and all test fixtures. Hard to reverse once deployed
   because existing KV records will have the old shape and new records will have
   the new shape. Multiple valid approaches exist (flat vs. nested, whether to
   keep `durationMs` as total). This decision should be approved before any
   execution task writes code.

   This is likely the only gate. The implementation itself (adding `Date.now()`
   calls to `defaultRenderer()`) is straightforward and reversible.

## Rationale

This task touches three domains that need coordination:

1. **Observability** (log event structure) -- the primary motivation. Getting the
   Coralogix log schema right is essential because changing log field names after
   deployment breaks existing queries and alerts.

2. **API design** (render metadata shape) -- the `render` object is part of the
   public API contract. The shape must be backward-compatible and ergonomic.

3. **Testing** (backward compatibility) -- the success criterion "all existing
   tests pass unchanged" requires understanding which tests assert on the current
   `render` shape and how to extend it without breaking them.

The actual code change is small (wrapping stages in `Date.now()` calls), but the
decisions about the data shape have downstream consequences. The three consultations
ensure the shape is right before implementation.

Agents NOT included in planning and why:
- **security-minion**: No new attack surface. Timing integers carry no security risk.
- **ux-design-minion**: No UI changes.
- **frontend-minion**: No frontend code.
- **iac-minion**: No infrastructure changes.
- **api-spec-minion**: OpenAPI spec update is mechanical; can be done in execution.
- **software-docs-minion**: No architecture doc changes; OpenAPI is the doc.
- **user-docs-minion**: No user-facing doc changes.

## Scope

**In scope**:
- Add `Date.now()` instrumentation to each stage in `defaultRenderer()`
- Expand the `render` return object with per-stage duration fields
- Pass expanded `render` through `performCapture()` -> `completeCapture()` -> KV
- Emit a structured log event with stage durations to Coralogix
- Update `openapi.yaml` `RenderInfo` schema with new fields
- Ensure all existing tests pass unchanged

**Out of scope**:
- Alerting rules or Coralogix dashboard configuration
- Performance optimization of any capture stage
- Behavior changes to navigation, consent, or screenshot logic
- Changes to partial capture behavior beyond representing skipped stages
- Changes to the `captureHeaders()` function (runs in parallel, not part of renderer stages)

## External Skill Integration

No external skills detected in project (`.claude/skills/` and `.skills/` both empty).
Global user skills scanned; none relevant to this task domain.
