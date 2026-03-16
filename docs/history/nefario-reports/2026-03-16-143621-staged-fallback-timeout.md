---
task: "Staged fallback for capture timeout (partial captures)"
date: 2026-03-16
source-issue: 53
status: complete
mode: execution
task-count: 2
gate-count: 0
agents-consulted: [iac-minion, api-spec-minion, test-minion, security-minion, ux-strategy-minion, lucy, margo]
compaction-events: 0
---

## Summary

Implemented staged fallback for capture timeout. Pages that previously failed
entirely when they couldn't reach `networkidle` within 25s now produce usable
partial captures (screenshot + HTML) when DOMContentLoaded has fired. WACZ
bundling is skipped on the timeout path (insufficient budget within 30s
ctx.waitUntil). 10 files changed (+646/-48 lines), 34 new tests, 474 total
passing.

## Original Prompt

Implement staged fallback for capture timeout (partial captures) per issue #53.
Heavy pages (tagesschau.de, sites with tracking/consent/lazy-load) never reach
`networkidle` within the 25s `NAV_TIMEOUT_MS` and fail entirely. Catch the
Playwright `TimeoutError`, check if the page passed `DOMContentLoaded`, and if
yes: capture screenshot + rendered HTML from the partially-rendered page. Mark as
`status: 'complete'` with `renderQuality: 'partial'`. Skip WACZ bundling on the
timeout path.

## Key Design Decisions

1. **Keep status:'complete', add renderQuality:'full'|'partial'** -- lifecycle
   and fidelity are orthogonal dimensions.
2. **3-field RenderInfo** (waitUntilReached, timedOut, durationMs) -- dropped
   waitUntilTarget (YAGNI) and operational timings (logs only).
3. **Skip WACZ on timeout path** -- ~1.5-4.5s headroom is too tight for bundling.
4. **API layer defaults absent renderQuality to 'full'** -- no KV migration.
5. **Single categorizeError case** for partial-path failures ('Deadline exceeded').
6. **No verify page changes** -- partial captures 404 at verify (no WACZ). YAGNI.
7. **WACZ captureQuality deferred** to separate phase. Tracked in backlog.

## Phases

### Phase 1: Meta-Plan
Nefario selected 3 planning specialists based on the task's domain needs:
iac-minion (Cloudflare Workers timing), api-spec-minion (OpenAPI schema design),
test-minion (renderer interface change and test strategy).

### Phase 2: Specialist Planning
Three specialists ran in parallel. iac-minion focused on deadline arithmetic and
timing budgets. api-spec-minion defined the minimal schema additions.
test-minion designed the test matrix and identified the verify-page dead code.

### Phase 3: Synthesis
Consolidated into 2 sequential tasks. Resolved 5 cross-specialist conflicts
(RenderInfo fields, renderQuality handling, verify page note, categorizeError
strategy, deadline computation). All resolutions followed YAGNI/KISS.

### Phase 3.5: Architecture Review
6 reviewers (5 mandatory + api-spec-minion). All ADVISE, no BLOCKs. Key items:
don't change getCaptureStatus example, wrap all partial-path errors in
controlled message, test legacy renderer backward compat, track captureQuality
deferral.

### Phase 4: Execution
Task 1 (iac-minion, sonnet): Core implementation across 4 source files + spec.
Task 2 (test-minion, sonnet): 34 tests across 5 test files. Sequential.

### Phases 5-8
Verification: all tests pass (474/474). Code review and docs handled inline.

## Agent Contributions

### Planning (Phase 2)

| Agent | Key Contribution |
|-------|-----------------|
| iac-minion | 2s deadline budget, 3s/1s operation timeouts, Date.now() checks, skip limitExceeded on partial path |
| api-spec-minion | 3-field RenderInfo (YAGNI on waitUntilTarget), top-level renderQuality, stay at v0.3.0, API-layer defaults |
| test-minion | Renderer return shape design, 15 test scenarios, legacy compat testing, verify-page dead code flag |

### Review (Phase 3.5)

| Agent | Verdict | Key Finding |
|-------|---------|-------------|
| security-minion | ADVISE | Wrap all partial-path sub-errors in controlled message before categorizeError |
| test-minion | ADVISE | Legacy stubRenderer needs explicit renderQuality assertion; assert render absent for old records |
| ux-strategy-minion | ADVISE | Add spec descriptions for verifyUrl omission and render field absence inference |
| lucy | ADVISE | Track WACZ captureQuality deferral in backlog; observability scope narrowing is justified |
| margo | ADVISE | renderQuality on VerificationCapture is technically redundant (kept for R16 future-proofing) |
| api-spec-minion | ADVISE | Don't change getCaptureStatus failed example; verify renderQuality required + default consistency |

## Execution

| Task | Agent | Files | Lines | Status |
|------|-------|-------|-------|--------|
| 1. Core implementation | iac-minion | src/capture.js, src/kv.js, src/index.js, openapi.yaml | +261/-48 | Complete |
| 2. Tests | test-minion | test/capture.test.js, test/kv.test.js, test/capture-retrieval.test.js, test/list-captures.test.js, test/verify-integration.test.js | +385 | Complete |

## Verification

- Spectral lint: 0 errors, 2 pre-existing warnings
- Test suite: 474 pass, 0 fail across 22 files
- No regressions

## Test Plan

- [x] Partial capture success (DOMContentLoaded reached)
- [x] Partial capture success (load event reached)
- [x] Partial capture failure (deadline exceeded)
- [x] Existing timeout regression (no DOMContentLoaded still fails)
- [x] Full capture with render metadata
- [x] Legacy renderer backward compatibility
- [x] KV completeCapture extension (with/without renderQuality)
- [x] GET /v1/captures/:id -- renderQuality and render for partials
- [x] GET /v1/captures/:id -- defaults for old records
- [x] List endpoint -- renderQuality in summary
- [x] Verify endpoint -- 404 for captures without WACZ

## Session Resources

<details>
<summary>Skills Invoked</summary>

- `/nefario` -- staged fallback implementation orchestration

</details>

## Working Files

Companion directory: `docs/history/nefario-reports/2026-03-16-143621-staged-fallback-timeout/`
