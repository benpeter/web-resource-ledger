---
task: "Merge timestamp checks into single hierarchical Time verification row"
date: 2026-03-26
source-issue: 167
status: complete
agents: [ux-strategy-minion, frontend-minion, test-minion, security-minion, lucy, margo, code-review-minion]
task-count: 1
gate-count: 0
mode: execution
---

## Summary

Merged separate "Timestamp imprint" and "Qualified timestamp" check rows into a single "Time verification" row in both the CLI formatter and web verify page. The merged row displays the strongest available timestamp tier (qualified > standard > none), reducing cognitive load for legal/compliance users. JSON output unchanged for backward compatibility. All 33 tests pass with 6 new test cases.

## Original Prompt

GitHub Issue #167: When a capture has a Qualified Timestamp (eIDAS) but no standard RFC3161 timestamp, both the CLI and verify page show contradictory information — a skip/dash for "Timestamp imprint" directly above a pass/check for "Qualified timestamp". Merge into a single "Time verification" row showing the strongest available tier.

## Key Design Decisions

### Pre-process pattern over renderer modification
A `mergeTimestampChecks()` function transforms the checks array before rendering. Keeps renderers as simple iterators. Both CLI and web consume the same merged array shape.

### Inline duplication over shared utility
The ~20-line merge function is duplicated in `format.js` and `verify-page.js`. The browser inline script cannot import from packages/, so duplication is unavoidable. YAGNI wins over a third utility file.

### Generic detail text (no TSA name in merged row)
Merged row shows mechanism type only. TSA identity remains in the metadata section below. Keeps the merge function decoupled from capture metadata shape.

### State-dependent descriptions via .desc property
Merge function sets a `.desc` property on the merged check; `renderChecks()` prefers `c.desc` over static `CHECK_DESCS` lookup. One-line change avoids refactoring the static pattern.

### JSON output unchanged
`formatJson()` continues emitting raw `timestamp` and `qualifiedTimestamp` entries. Presentation-layer only — no breaking API change.

## Phases

### Phase 1: Meta-Plan
4 specialists identified. Lucy (gate reviewer) removed software-docs-minion — JSON API contract unaffected since check names come from the verification engine, not formatter labels. Final team: 3.

### Phase 2: Specialist Planning
Three specialists (ux-strategy, frontend, test) spawned in parallel. All independently converged on: pre-process pattern, JSON untouched, inline duplication acceptable. No conflicts.

### Phase 3: Synthesis
Single-task plan with no approval gates. One comprehensive task prompt for frontend-minion.

### Phase 3.5: Architecture Review
5 mandatory reviewers: 4 APPROVE (security, ux-strategy, lucy, margo), 1 ADVISE (test-minion: fixture shapes, row count assertions, timestampChain exclusion, JSON label assertions — all incorporated).

### Phase 4: Execution
Single frontend-minion agent on sonnet. Implemented merge function in format.js and verify-page.js, added 6 test cases. All 33 tests pass.

### Phase 5: Code Review
3 reviewers: lucy APPROVE, margo APPROVE, code-review-minion ADVISE (3 non-blocking notes: data-check-detail lookup verified as false positive, both-fail edge case acceptable, sync comment with intentional divergence acceptable).

### Phase 6: Tests
All 33 tests pass, 0 failures.

### Phase 7: Deployment
Skipped (not requested).

### Phase 8: Documentation
Updated `site/content/verification.md` (CLI example + check table) and `site/content/index.md` (CLI example) to reflect the new "Time verification" label. No other surfaces needed updating.

## Verification

Verification: code review passed (3 files), all 33 tests pass, docs updated (2 files).

## Agent Contributions

| Agent | Phase | Role | Verdict |
|-------|-------|------|---------|
| ux-strategy-minion | Planning, Review | Label validation, journey coherence | APPROVE |
| frontend-minion | Planning, Execution | Implementation approach, code | — |
| test-minion | Planning, Review | Test scenarios, coverage | ADVISE |
| security-minion | Review | Security assessment | APPROVE |
| lucy | Review, Code Review | Convention adherence | APPROVE |
| margo | Review, Code Review | Complexity check | APPROVE |
| code-review-minion | Code Review | Code quality | ADVISE |

## Working Files

Companion directory: `docs/history/nefario-reports/2026-03-26-001548-merge-timestamp-checks/`

## Session Resources

### Skills Invoked
- `/nefario` — orchestration

### Compaction
0 compaction events (autonomous mode, no interactive compaction).
