# Phase 0023: Process -- How the Agent Team Built Staged Fallback

## TL;DR

A 3-specialist planning team (iac-minion, api-spec-minion, test-minion) plus
5+1 architecture reviewers built the execution plan in ~10 minutes of wall
clock. Two sequential execution agents (iac-minion for implementation,
test-minion for tests) completed the work in ~8 minutes. 646 lines changed
across 10 files, 34 new tests, 474 total passing. The advisory phase (run
earlier with 4 specialists) front-loaded every design decision, making
execution straightforward with zero approval gates needed.

## Advisory Phase (Prior Session)

This implementation was preceded by an advisory orchestration that consulted
4 specialists: iac-minion, security-minion, api-design-minion, and
ux-strategy-minion. The advisory produced unanimous consensus on all key
design decisions. See `docs/history/nefario-reports/2026-03-16-112535-staged-fallback-capture-timeout.md`.

The advisory resolved every contentious point before implementation began:
- `renderQuality` enum values ('full'|'partial' vs cause-specific)
- `retryable` on partial captures (no -- they're successes)
- Language choice (factual, not judgmental)
- Verification page treatment (stays green, no UI changes)
- WACZ skip on timeout path (time budget too tight)

This meant the implementation phase had zero ambiguity to resolve at approval
gates. The human directive to skip all gates was appropriate because the
advisory had already done the decision work.

## Phase 1: Meta-Plan

Nefario analyzed the task and selected 3 specialists for planning:

1. **iac-minion** -- Cloudflare Workers runtime constraints, timing arithmetic
2. **api-spec-minion** -- OpenAPI schema design, field placement, versioning
3. **test-minion** -- Renderer interface change, test scenario coverage

Notably excluded from planning: security-minion and ux-strategy-minion (both
had already contributed in the advisory and reached unanimous consensus). They
were included as mandatory architecture reviewers at Phase 3.5 instead.

## Phase 2: Specialist Planning

All three specialists ran in parallel.

### iac-minion's contribution

Focused on the timing budget arithmetic:
- Recommended 28s absolute deadline (later refined to `Date.now() + 2000` at
  the point of timeout, which is functionally equivalent)
- 3s screenshot timeout, 1s content extraction timeout
- Simple `Date.now()` checks over AbortController (Playwright's CDP API doesn't
  integrate with AbortController)
- Skip `limitExceeded` check on partial path (already enforced via route abort)
- Return `{ screenshot, html, partial: true, render: {...} }` -- same object
  shape with additive fields

### api-spec-minion's contribution

Focused on schema economy:
- Top-level `renderQuality` (not nested -- existing schema is flat)
- 3-field RenderInfo, dropping `waitUntilTarget` (always networkidle, zero info)
- Stay at v0.3.0 (unreleased, additive changes)
- API layer defaults absent `renderQuality` to `'full'` (no KV migration)

### test-minion's contribution

Focused on the renderer interface seam:
- Extend renderer return shape with `partial` flag
- 15 test scenarios prioritized P0/P1/P2
- Extend existing test files, don't split
- Flagged verify page "Capture note" as unreachable (partials 404 at verify)

## Phase 3: Synthesis

Nefario consolidated into 2 sequential tasks (implementation + tests).

### Conflicts resolved

1. **RenderInfo fields (6 vs 3)**: api-spec-minion's 3 fields won. Operational
   timings (screenshotMs, contentMs) go in Coralogix logs, not the API. YAGNI.

2. **Verify page "Capture note"**: Skipped entirely. Dead code since partials
   404 at verify. YAGNI. Both test-minion and api-spec-minion flagged this
   independently.

3. **categorizeError strategy**: Single new case for 'Deadline exceeded'. The
   renderer wraps all partial-path sub-errors in a controlled message before
   they escape. Security-minion later validated this approach.

4. **renderQuality on full captures**: Explicit at API layer (`?? 'full'`),
   implicit in KV (no backfill). api-spec-minion's recommendation.

5. **getCaptureStatus example message**: api-spec-minion (during Phase 3.5
   review) caught that the synthesis originally suggested changing the failed
   example error message to a non-existent categorizeError value. Corrected.

## Phase 3.5: Architecture Review

6 reviewers (5 mandatory + api-spec-minion discretionary). All returned ADVISE,
no BLOCKs.

Key ADVISE items incorporated:
- **api-spec-minion**: Don't change getCaptureStatus failed example (the
  existing timeout message is still correct for timeout-without-DOMContentLoaded)
- **security-minion**: Ensure all partial-path sub-errors wrapped in controlled
  message before reaching categorizeError
- **test-minion**: Add assertion for legacy stubRenderer producing
  `renderQuality: 'full'`; assert `render` absent for old records
- **margo**: Flagged `renderQuality` on VerificationCapture as technically
  redundant (always 'full' since partials 404). Kept for R16 future-proofing.
- **lucy**: Track WACZ captureQuality deferral in backlog

## Phase 4: Execution

Two agents, sequential:

### Task 1: iac-minion (implementation)

Modified 4 source files + 1 spec file:
- `src/capture.js`: Partial renderer path with 2s deadline, enriched return
  shape on both paths, WACZ skip, `capture.partial` log event
- `src/kv.js`: `completeCapture` extended with optional `renderQuality` + `render`
- `src/index.js`: 3 handlers updated to surface `renderQuality` and `render`
- `openapi.yaml`: `RenderInfo` schema, extended records, examples, descriptions

Spectral lint passed clean.

### Task 2: test-minion (tests)

34 new tests across 5 files. One minor adaptation needed during authoring:
test capture IDs must use hex-only characters (`[a-f0-9]`) to match the route
regex. The tester discovered this when non-hex IDs produced 404s before reaching
the handler.

All 474 tests pass, zero regressions.

## Human Interventions

The human set three directives at orchestration start:
1. **Skip all approval gates** -- defer to gru and lucy. This was appropriate
   because the advisory phase had already resolved all design decisions.
2. **Skip compaction checkpoints** -- context was manageable.
3. **Auto-create PR** -- no halting at wrap-up.

The human did NOT intervene on any implementation decisions. The advisory-then-
implementation pattern worked as designed: decisions up front, execution
downstream.

## What the Human Chose NOT to Intervene On

- **margo's ADVISE on VerificationCapture renderQuality**: The field is
  technically redundant today (always 'full') but costs one schema property.
  Left in for R16 future-proofing. Reasonable trade-off.
- **WACZ captureQuality deferral**: The advisory recommended signing quality
  metadata into WACZ datapackage.json. Deferred to a separate phase rather
  than scope-creeping this one.

## Where to Read More

- Advisory report: `docs/history/nefario-reports/2026-03-16-112535-staged-fallback-capture-timeout.md`
- Advisory synthesis: `docs/history/nefario-reports/2026-03-16-112535-staged-fallback-capture-timeout/phase3-synthesis.md`
- Execution plan: nefario report companion directory (working files)
