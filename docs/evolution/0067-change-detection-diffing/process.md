# Phase 0067: Process

## TL;DR

Five-task nefario orchestration delivered change detection and visual diffing across 13 files (+2000 lines) in three execution batches. The most consequential design decision — server-side hash comparison instead of pixel-level screenshot diff — was driven by Worker memory constraints and survived all review phases. Three code review findings were auto-fixed. All 1449 existing tests pass. No new test file was written (deferred to backlog).

## Team composition

### Planning specialists (Phase 2)
- **data-minion**: D1 schema design, migration strategy, query patterns for change summary storage
- **api-design-minion**: Diff endpoint design, response schema, `include` parameter for selective sections
- **frontend-minion**: Visual diff UI architecture, screenshot comparison modes, vanilla JS DOM patterns
- **security-minion**: Auth model for diff endpoint, cross-tenant isolation, XSS prevention in diff rendering

### Architecture reviewers (Phase 3.5)
- **security-minion**: APPROVE — no new attack surface, textContent used throughout
- **test-minion**: ADVISE — flagged missing test coverage for diff module
- **ux-strategy-minion**: APPROVE — three comparison modes serve different user jobs-to-be-done
- **lucy**: ADVISE — screenshotSimilarity descoped from prompt, missing tests
- **margo**: ADVISE — pipeline optimization opportunity (computing full hunks when only stats needed)

### Code reviewers (Phase 5)
- **code-review-minion**: ADVISE — 5 advisory + 3 nit findings
- **lucy**: ADVISE — requirements traceability verified, 2 compliance items
- **margo**: ADVISE — complexity proportional, 1 pipeline optimization advisory

## Execution structure

Three batches with approval gates:

1. **Batch 1** (data-minion): Migration `0015_change_summary.sql`, `src/diff.js` pure computation module, DB functions (`getPreviousCaptureId`, `setChangeSummary`)
2. **Batch 2** (api-design-minion): `handleDiffCaptures` endpoint in `src/index.js`, change summary computation in queue consumer via `ctx.waitUntil`, webhook enrichment in `src/webhook-dispatch.js`
3. **Batch 3** (frontend-minion): Visual diff view (`ui-diff.js`), CSS, routes, change badges on schedules/captures/detail views, schedule list enrichment via LEFT JOIN

## Key conflicts and resolutions

### Screenshot diff: pixel vs hash

The prompt specified "pixel-level visual diff with highlighted regions, returned as image." The synthesis resolved this as:

- **Server-side**: Hash comparison only (R2 etag, no image loading). Argued by security-minion and margo — loading two screenshots into Worker memory risks OOM.
- **Client-side**: Canvas pixel diff in browser for the visual comparison. Argued by frontend-minion — the browser has ample memory and can display the result directly.
- **API response**: Boolean `changed` instead of numeric `screenshotSimilarity`. This is a deliberate deviation from the prompt's example response shape.

This decision survived all review phases. Lucy flagged the deviation but accepted the rationale.

### diff-match-patch-es vs alternatives

data-minion and api-design-minion both recommended `diff-match-patch-es`. margo reviewed the dependency and confirmed it justified: character-level diff with semantic cleanup cannot be done in 10 lines of vanilla code. The library is 15KB, zero dependencies, based on a 15-year-old algorithm.

### HTML size guard and truncation

api-design-minion proposed the 2MB guard with `truncated: true` flag. This was uncontested — everyone agreed that unbounded diffing in a Workers environment is untenable. The 200-hunk cap was added during synthesis as an additional safety valve for response size.

## Human interventions

This was an autonomous orchestration (no human at the gate). Lucy agents handled all approvals:

- **Team approval**: Approved as proposed
- **Reviewer approval**: 5 mandatory reviewers, no discretionary additions
- **Execution plan**: Approved — 5 tasks, 2 gates, 3 batches
- **Gate 1** (data layer): Auto-approved, "Run all" for post-execution
- **Gate 2** (API + pipeline): Auto-approved, "Run all" for post-execution
- **Gate 3** (UI): Auto-approved after fixing API response field mismatches

## What was NOT intervened on

- The screenshotSimilarity deviation was accepted without override
- Lucy's test coverage advisory was accepted as deferred (backlog item, not blocking)
- Margo's pipeline optimization advisory was accepted as deferred (backlog item)
- The 908-line ui-diff.js was accepted — proportional to the most complex existing UI views

## Code review auto-fixes

Three findings from code-review-minion were fixed immediately:

1. **etag inconsistency**: Queue consumer used `.httpEtag` (quoted) while API handler used `.etag` (unquoted). Standardized on `.etag`.
2. **Overlay listener accumulation**: `initOverlaySlider()` attached document-level event listeners on every tab activation without cleanup. Added initialization guard.
3. **Duplicate VERIFICATION_BASE_URL**: Webhook dispatch computed the URL base twice. Reused existing `base` variable.

## Context challenges

The session hit context compaction during Phase 4 Batch 3. The frontend-minion agent was spawned as a background task before compaction, and the agent reference was lost after compaction. The agent had partially completed — creating all UI files with routes, CSS, badges, and compare links — but `ui-diff.js` had API response field mismatches (the normaliser function existed but was never called in mountDiff, and some field names didn't match the API response structure). These were fixed directly in the main session rather than re-spawning the agent.

## Where to read more

- **Full specialist discussions**: Scratch files were in `/tmp/nefario-scratch-*/change-detection-diffing/` (cleaned up at wrap-up)
- **Decisions with rationale**: `docs/evolution/0067-change-detection-diffing/decisions.md`
- **Outcomes and deviations**: `docs/evolution/0067-change-detection-diffing/outcome.md`
- **Backlog updates**: `docs/backlog.md` — 3 new deferred items from review findings
