# Process: Stage-Level Timing Instrumentation

## TL;DR

Three specialists planned, six reviewers checked, one task executed. The central
debate was where to put stage timings: nested in `render.stages` (api-design),
flat on the record (observability), or as a sibling field (test-minion to protect
existing assertions). Synthesis chose nesting with flat log fields — clean API
structure with query-friendly logs. Code review caught that consentMs incorrectly
included before-screenshot I/O; fixed before merge. 503 tests pass, 3 new.

## Specialists consulted

### Phase 2: Planning

**observability-minion** — Asked to design the Coralogix log schema for stage
timings. Recommended flat top-level fields matching the existing `durationMs`
pattern, `null` for skipped stages, and retiring `consentDurationMs` in favor of
`consentMs`. Strong preference for unprefixed names (`sessionAcquireMs`, not
`stage_sessionAcquireMs`) based on Coralogix DataPrime query ergonomics.

**api-design-minion** — Asked about the API/KV record shape. Recommended nesting
under `render.stages` with a new `RenderStages` OpenAPI component. Argued that
the part-whole relationship between `durationMs` and individual stages should be
structurally explicit. Suggested `stage_` prefix for log fields (rejected) and
omitting null stages from logs (rejected). Key insight: the log shape and API
shape can legitimately differ.

**test-minion** — Asked about backward compatibility. Discovered the two critical
`toEqual` assertions in `capture-retrieval.test.js:137` and `kv.test.js:318` that
would break if the render object gained a new property. Recommended putting stages
in a sibling field to avoid changing any existing assertions. Also identified that
`stubRenderer` is used by 12+ tests across 4 files — a no-touch zone. Confirmed
that the consent-aware renderer stubs in fixtures.js are dead code (defined but
never imported).

### Where they disagreed

The central conflict was a three-way split on API shape:

1. **api-design-minion**: Nest under `render.stages`. Clean API design.
2. **test-minion**: Sibling field `record.stageTimings`. Zero test changes.
3. **observability-minion**: No strong opinion on API shape, but wanted flat
   fields on log events.

The disagreement was structural vs pragmatic. api-design-minion argued from API
design principles (part-whole relationships should be structurally explicit).
test-minion argued from zero-regression safety (if you don't touch the render
object, you can't break assertions on it). observability-minion stayed out of
the API debate and focused on log query patterns.

### How the conflict was resolved

Synthesis (nefario) chose `render.stages` + flat log fields. Reasoning:

- `render.stages` is the cleaner API design and the two `toEqual` breakages are
  one-line fixes that correctly evolve the assertions from "render has exactly
  these fields" to "render contains these fields."
- Flat log fields match the existing convention and Coralogix query patterns.
- The two shapes (nested API, flat logs) serve different consumers with different
  ergonomic needs.

test-minion's sibling field alternative was explicitly rejected: stage timings are
a decomposition of `render.durationMs` and semantically belong inside `render`.
Creating `stageTimings` as a peer of `render` splits related data for the sake
of test convenience.

## Phase 3.5: Architecture Review

Six reviewers (5 mandatory + 1 discretionary observability-minion):

| Reviewer | Verdict | Key finding |
|----------|---------|-------------|
| security-minion | APPROVE | No attack surface. Timer values are server-side arithmetic. |
| test-minion | ADVISE | Missing test coverage for the new stages shape. |
| ux-strategy-minion | APPROVE | Naming is self-documenting. `null` for skipped stages is operator-friendly. |
| lucy | ADVISE | Stage ordering: before-screenshot happens between settle and consent. Plan doesn't clarify which stage `screenshotMs` wraps. |
| margo | APPROVE | Proportional to the ask. Good "what NOT to do" list prevents scope creep. |
| observability-minion | APPROVE | Log schema correctly translates Phase 2 recommendations. |

Both ADVISE findings were incorporated: test-minion's concern led to adding stages
test cases, lucy's concern led to clarifying timer boundaries during implementation.

## Phase 4: Execution

Direct execution (no subagent delegation). Single implementation task modifying 4
files. No approval gates — the task is pure instrumentation with no behavioral
decisions.

Implementation was straightforward: `Date.now()` calls at 7 stage boundaries in
`defaultRenderer()`, stage object construction, spread on log events, OpenAPI
schema addition, and two test assertion relaxations.

## Phase 5: Code Review

Three reviewers (code-review-minion, lucy, margo), all returned ADVISE:

**code-review-minion** caught:
- `consentDurationMs` silently removed (acceptable: pre-production, naming
  consistency)
- No tests asserting the new stages shape (addressed: added 3 tests)
- `screenshotMs` measurement artifact: ~0ms when no consent dismissed because
  `screenshotBefore` timing is folded into `consentMs`

**lucy** caught the most impactful issue:
- `consentMs = tConsent - tSettle` incorrectly included before-screenshot I/O
  (~100-500ms). The before-screenshot is taken between the settle timer and the
  consent call, so it was being counted as "consent time."
- Fix: added `tPreConsent` timer after before-screenshot. `consentMs` now
  measures only consent. `screenshotMs` now sums both screenshot intervals
  (before-consent + after-consent).

**margo** noted that `capture.partial` logs both the nested `render` object and
the flat stage fields (duplication). Accepted: the nested `render` was pre-existing
and removing it would be scope creep.

## Human interventions

The orchestration ran with gates skipped (per user directive). No human
interventions during planning, review, or execution. Decisions were deferred to
lucy and margo per the user's instructions.

The user's explicit directives:
- Skip all approval gates
- Defer decisions to gru and lucy
- Skip compaction checkpoints
- Auto-create PR at wrap-up
- Write process.md (this file)
- Check evolution log sequence numbers on upstream main (other worktrees may be
  running in parallel)

## Where to read more

- Specialist contributions: `docs/history/nefario-reports/2026-03-16-*-stage-level-timings/`
- Evolution log: `docs/evolution/0031-stage-level-timings/`
