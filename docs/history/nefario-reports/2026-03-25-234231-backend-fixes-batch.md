---
task: "Backend fixes batch: notification skip, Content-Disposition filenames"
date: 2026-03-25
source-issue: 214
status: complete
agents: [api-design-minion, security-minion, test-minion, ux-strategy-minion, lucy, margo, code-review-minion, iac-minion]
task-count: 2
gate-count: 0
mode: execution
---

## Summary

Two backend fixes shipped in a single PR: (1) short-circuit `dispatchNotification('approaching_limit')` at the call site when the notification was already sent this billing period, eliminating ~2 wasted D1 round-trips per capture for free-tier tenants at counts 161-200; (2) add descriptive `Content-Disposition` filenames to artifact downloads using captured domain and date instead of generic names. All 1530 tests pass with 6 new tests covering both changes.

## Original Prompt

Backend fixes batch (#214): Skip approaching_limit dispatch when already sent (#187) and set descriptive Content-Disposition filenames for capture downloads (#181). All existing tests must pass, new behavior must have test coverage.

## Key Design Decisions

### Call-site pre-check vs modified dispatch
Chose to add `checkNotificationSent()` at the call site rather than modifying `dispatchNotification()`. Keeps the dispatch function self-contained with its internal dedup as a race-condition safety net.

### Inline period computation
Kept the `YYYY-MM` period computation inline (1 line) rather than extracting a shared utility. The format is trivially obvious and used in only two places.

### ASCII-only filename sanitization
Used `[a-z0-9.-]` allowlist for hostname sanitization rather than RFC 5987 `filename*` UTF-8 encoding. Covers all practical domains after punycode conversion with zero added complexity.

### Date sanitization advisory
Incorporated security-minion's advisory to sanitize `createdAt` date values before inserting into HTTP headers, even though the values are expected to be well-formed ISO dates.

## Phases

### Phase 1: Meta-Plan
Identified api-design-minion as the sole planning specialist needed. Task scope was small and well-defined — only the architectural choice of short-circuit placement and filename format conventions warranted external expertise.

### Phase 2: Specialist Planning
api-design-minion recommended call-site pre-check using existing `checkNotificationSent()` and ASCII-safe filename pattern `capture-{domain}-{date}.{ext}` with www-stripping and 100-char truncation.

### Phase 3: Synthesis
Consolidated 4 proposed tasks into 2 (one per issue). No approval gates needed — both fixes are low-risk and easily reversible.

### Phase 3.5: Architecture Review
5 mandatory reviewers: 3 APPROVE (ux-strategy, lucy, margo), 2 ADVISE (security-minion: sanitize date values; test-minion: spy wiring guidance and screenshot-before coverage).

### Phase 4: Execution
2 tasks executed in parallel by iac-minion agents. Both modified `src/index.js` in non-overlapping sections. All 1530 tests passed.

### Phase 5: Code Review
2 APPROVE (lucy, margo), 1 ADVISE (code-review-minion flagged pre-existing vacuous test at notification-triggers.test.js:233-248 — not introduced by this PR).

### Phase 6: Tests
All 1530 tests pass, 0 failures.

### Phase 7: Deployment
Skipped (not requested).

### Phase 8: Documentation
Assessment: 0 actionable items. No API surface changes, no user-facing behavior changes requiring documentation.

## Agent Contributions

### Planning
- **api-design-minion**: Recommended call-site dedup pre-check over dispatch modification; designed filename format with sanitization rules and fallback strategy.

### Review
- **security-minion** (ADVISE): Flagged unsanitized date value in Content-Disposition header.
- **test-minion** (ADVISE): Warned about test spy wiring in queue consumer tests; requested screenshot-before coverage.
- **ux-strategy-minion** (APPROVE): Confirmed both changes serve clear user needs with no journey impact.
- **lucy** (APPROVE): Verified convention adherence and no intent drift.
- **margo** (APPROVE): Confirmed proportional implementation with no over-engineering.
- **code-review-minion** (ADVISE): Flagged pre-existing vacuous test (not from this PR).

## Verification

Code review: 2 APPROVE, 1 ADVISE (pre-existing issue). Tests: 1530 passed, 0 failed. Docs: not applicable.

## Documentation Debt

None.

## Test Plan

- [x] `checkNotificationSent` short-circuit prevents `dispatchNotification` when already sent
- [x] Normal dispatch still works on first threshold crossing
- [x] Screenshot filename includes domain and date
- [x] WACZ filename includes domain and date
- [x] HTML filename includes domain and date
- [x] Screenshot-before filename includes `-before` suffix
- [x] All 1530 existing tests pass

## Session Resources

<details>
<summary>Skills Invoked</summary>

- `/nefario` — orchestration workflow

</details>

<details>
<summary>Working Files</summary>

Companion directory: `docs/history/nefario-reports/2026-03-25-234231-backend-fixes-batch/`

Files:
- prompt.md — original task description
- phase1-metaplan-prompt.md, phase1-metaplan.md — meta-plan
- phase2-api-design-minion-prompt.md, phase2-api-design-minion.md — specialist planning
- phase3-synthesis-prompt.md, phase3-synthesis.md — delegation plan
- phase3.5-*.md — architecture review verdicts
- phase4-*.md — execution task prompts
- phase5-*.md — code review verdicts

</details>

Compaction events: 0
