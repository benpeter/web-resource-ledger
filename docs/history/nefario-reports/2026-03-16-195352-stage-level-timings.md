---
task: "feat(capture): add stage-level timing instrumentation to renderer"
source-issue: 75
date: 2026-03-16
status: complete
agents: observability-minion, api-design-minion, test-minion, security-minion, lucy, margo, ux-strategy-minion, code-review-minion
task-count: 1
gate-count: 0
mode: execution
---

## Summary

Instrumented `defaultRenderer()` with `Date.now()` at 7 stage boundaries to
produce per-stage durations (sessionAcquireMs, contextSetupMs, navigationMs,
settleMs, consentMs, screenshotMs, contentMs). Stage timings nest under
`render.stages` in KV records and API responses, and spread as flat fields on
Coralogix `capture.success` and `capture.partial` log events. Replaces
`consentDurationMs` with `consentMs` from the stages spread.

**Changes**: 5 files (src/capture.js, openapi.yaml, test/capture.test.js, test/capture-retrieval.test.js, test/kv.test.js)
**Tests**: 503 pass (3 new, 0 regressions)

## Original Prompt

Add stage-level timing instrumentation to `defaultRenderer()` so that per-stage
durations are visible in Coralogix logs and the capture API, replacing the opaque
single `durationMs` number.

Resolves #75

## Key Design Decisions

1. **Nested `render.stages`**: Stage timings belong inside `render` (part-whole
   relationship with `durationMs`). Rejected sibling field (worse API shape) and
   flat on render (conflates stages with metadata).

2. **Flat log fields, no prefix**: Spread `render.stages` as flat top-level
   fields on Coralogix events. Matches existing `durationMs` pattern. Rejected
   `stage_` prefix (inconsistent) and nested log structure (harder to query).

3. **`null` for skipped stages**: Partial captures set `settleMs: null` and
   `consentMs: null`. Explicit `null` distinguishes "skipped" from "old capture
   without instrumentation" (where `stages` is absent entirely).

4. **`consentMs` measures only consent**: Before-consent screenshot I/O is counted
   in `screenshotMs` (summed from two non-contiguous intervals: before-screenshot +
   after-screenshot). Caught by lucy in code review.

5. **`consentDurationMs` retired**: Replaced by `consentMs` from stages spread.
   Pre-production project; naming consistency now.

## Phases

### Phase 1: Meta-Plan
Selected 3 specialists: observability-minion (log schema), api-design-minion
(API shape), test-minion (backward compat). Excluded security (no new attack
surface), ux (no UI changes).

### Phase 2: Specialist Planning
- **observability-minion**: Flat fields, null semantics, unprefixed naming,
  retire consentDurationMs
- **api-design-minion**: Nested render.stages, new RenderStages OpenAPI component,
  log shape can differ from API shape
- **test-minion**: Two critical toEqual assertions break; stubRenderer is a no-touch
  zone (12+ tests); consent stubs are dead code

Three-way conflict on API shape (nested vs flat vs sibling) resolved in synthesis.

### Phase 3: Synthesis
Single-task plan. Adopted render.stages (api-design) with flat log fields
(observability). The toEqual assertions get toMatchObject (test-minion's concern
addressed with a one-line fix per assertion, not a structural workaround).

### Phase 3.5: Architecture Review
6 reviewers: 4 APPROVE, 2 ADVISE.
- **test-minion ADVISE**: Missing test coverage for the new stages shape.
  Incorporated: added 3 stage-shape tests.
- **lucy ADVISE**: Before-screenshot timing boundary unclear between consent and
  screenshot stages. Incorporated: clarified in implementation.

### Phase 4: Execution
Direct execution. 4 files modified, 2 commits. All gates skipped per user
directive.

### Phases 5-8
Code review: 3 ADVISE, 0 BLOCK. Key finding from lucy: consentMs incorrectly
included before-screenshot I/O. Fixed by adding tPreConsent timer and computing
screenshotMs as sum of both screenshot intervals. Tests: 503/503 pass.
Documentation: evolution log and process.md written.

## Agent Contributions

### Planning Agents
| Agent | Recommendation |
|-------|---------------|
| observability-minion | Flat log fields, null for skipped, unprefixed names, retire consentDurationMs |
| api-design-minion | Nested render.stages, separate RenderStages OpenAPI component, log/API shapes differ |
| test-minion | toEqual assertions break; use toMatchObject; leave stubs unchanged |

### Review Agents
| Agent | Verdict | Key Finding |
|-------|---------|-------------|
| security-minion | APPROVE | No attack surface (server-side arithmetic) |
| test-minion | ADVISE | Missing stages shape assertions |
| ux-strategy-minion | APPROVE | Naming is self-documenting; null is operator-friendly |
| lucy | ADVISE | Before-screenshot boundary unclear in stage decomposition |
| margo | APPROVE | Proportional to the ask, no over-engineering |
| observability-minion | APPROVE | Log schema matches Phase 2 recommendations |

### Code Review
| Agent | Verdict | Key Finding |
|-------|---------|-------------|
| code-review-minion | ADVISE | consentDurationMs silently removed; no stages tests |
| lucy | ADVISE | consentMs includes before-screenshot duration (fixed) |
| margo | ADVISE | capture.partial logs render object AND flat stages (accepted: pre-existing) |

## Verification

All tests pass: 503/503 (23 test files, 3 new tests added).
Code review findings addressed: consentMs/screenshotMs timer boundary fixed,
stages shape tests added.
No documentation debt.

## Test Plan

- [x] `test/capture.test.js` passes (54 tests, 3 new)
- [x] Full test suite passes (503 tests, 0 regressions)
- [ ] After deploy: capture a page, check Coralogix for stage timing fields
- [ ] After deploy: GET /v1/captures/:id, verify render.stages is present

## Session Resources

<details>
<summary>Working Files</summary>

Companion directory: `docs/history/nefario-reports/2026-03-16-195352-stage-level-timings/`

| File | Description |
|------|-------------|
| prompt.md | Original task description |
| phase1-metaplan-prompt.md | Meta-plan prompt |
| phase1-metaplan.md | Meta-plan output |
| phase2-observability-minion-prompt.md | Observability specialist prompt |
| phase2-observability-minion.md | Observability specialist contribution |
| phase2-api-design-minion-prompt.md | API design specialist prompt |
| phase2-api-design-minion.md | API design specialist contribution |
| phase2-test-minion-prompt.md | Test specialist prompt |
| phase2-test-minion.md | Test specialist contribution |
| phase3-synthesis-prompt.md | Synthesis prompt |
| phase3-synthesis.md | Synthesized execution plan |
| phase3.5-security-minion-prompt.md | Security review prompt |
| phase3.5-security-minion.md | Security review verdict |
| phase3.5-test-minion-prompt.md | Test review prompt |
| phase3.5-test-minion.md | Test review verdict |
| phase3.5-ux-strategy-minion-prompt.md | UX strategy review prompt |
| phase3.5-ux-strategy-minion.md | UX strategy review verdict |
| phase3.5-lucy-prompt.md | Lucy governance review prompt |
| phase3.5-lucy.md | Lucy governance review verdict |
| phase3.5-margo-prompt.md | Margo YAGNI review prompt |
| phase3.5-margo.md | Margo YAGNI review verdict |
| phase3.5-observability-minion-prompt.md | Observability review prompt |
| phase3.5-observability-minion.md | Observability review verdict |
| phase5-code-review-minion.md | Code review findings |
| phase5-lucy.md | Lucy code review findings |
| phase5-margo.md | Margo code review findings |

</details>

<details>
<summary>Skills Invoked</summary>

- `/nefario` (this orchestration)

</details>

Compaction events: 0
