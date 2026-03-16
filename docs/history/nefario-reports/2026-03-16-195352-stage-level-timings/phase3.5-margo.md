# Margo Review -- Stage-Level Timing Instrumentation

## Verdict: APPROVE

This plan is well-proportioned to the problem. The request is clear (instrument `defaultRenderer()` with per-stage timings), and the plan delivers exactly that with minimal accidental complexity.

---

## What I checked

### Scope alignment

The request asks for per-stage durations in a single function. The plan modifies four files: the source file with the instrumentation, the OpenAPI spec, and two test assertions. No new files, no new dependencies, no new services, no new abstractions. Task count: 1. This is disciplined scoping.

### Complexity budget

| Item | Column | Cost |
|------|--------|------|
| New technology | -- | 0 |
| New service | -- | 0 |
| New abstraction layer | -- | 0 |
| New dependency | -- | 0 |
| **Total** | | **0** |

Pure `Date.now()` arithmetic. Zero budget spend. This is the kind of change that should cost nothing.

### YAGNI check

Every stage in the `stages` object corresponds to an actual code block in `defaultRenderer()`. No speculative stages, no "future" fields, no configuration for hypothetical stage types. The seven fields map 1:1 to seven code sections. Clean.

### Abstraction layers

None added. Stage timings are computed locally and attached to the existing `render` object. They flow through the existing `render` -> KV -> API pipeline without any intermediate transformation or new plumbing. The plan explicitly calls out that `completeCapture()`, `handleGetCapture()`, and `log()` require zero changes. Good.

### Dependency audit

No new dependencies. The instrumentation uses `Date.now()`, which is a built-in. The plan does not introduce any imports, packages, or external tooling.

### Test approach

The `toEqual` -> `toMatchObject` change is the right call. The current assertions are over-constrained -- they assert the exact shape of `render` when they only care about three specific fields. This is a correctness improvement, not a weakening. The plan correctly notes that existing stubs without `stages` provide backward-compat coverage.

### OpenAPI schema

The `RenderStages` schema is proportional. Seven fields, all nullable integers, with clear descriptions. It uses `type: [integer, 'null']` which is clean OpenAPI 3.1 syntax. The schema is added as an optional property on `RenderInfo`, preserving backward compatibility with existing KV records. No over-engineering here.

### `consentDurationMs` rename

Renaming `consentDurationMs` to `consentMs` during pre-production is the right time to fix naming inconsistency. Doing this later would be a breaking change. Doing it now costs nothing.

### Conflict resolutions

All four conflict resolutions favor simplicity:
1. `render.stages` nesting -- structurally correct, avoids a sibling field that would need its own lifecycle.
2. Unprefixed field names -- matches existing convention, less query noise.
3. `consentDurationMs` retirement -- fix naming now while cost is zero.
4. `null` for skipped stages -- explicit over implicit, avoids ambiguity with pre-instrumentation records.

No concerns with any of these.

---

## One observation (non-blocking)

The plan places `screenshotBefore` timing inside `screenshotMs`. On the full capture path, `screenshotMs` will include both the before-screenshot and the after-screenshot (when consent is dismissed). This is fine for the stated goal (identifying slow stages), but if the team later needs to distinguish "screenshot time" from "consent screenshot time," this boundary may need revisiting. Not worth changing now -- just noting the measurement boundary.

---

## Summary

Single-task plan. Zero new dependencies, zero new abstractions, zero new services. Pure instrumentation with `Date.now()`. Proportional to the problem. The plan is unusually well-scoped -- it explicitly lists what NOT to change, which prevents scope creep during implementation.
