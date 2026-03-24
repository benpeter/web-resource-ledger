---
task: "UI fixes batch — URL prepend, verify page text, billing spacing"
date: 2026-03-24
source-issue: 185
status: complete
task-count: 2
gate-count: 0
agents: [frontend-minion]
reviewers: [security-minion, test-minion, ux-strategy-minion, lucy, margo, code-review-minion]
mode: execution
---

## Summary

Three small UI bug fixes shipped as a single phase: (1) `safeUrl()` in the capture form now auto-prepends `https://` to bare hostnames, guarded by a `://` check to avoid mangling partial schemes; (2) "Art. 41" corrected to "Article 41" on the verify page; (3) `display: block` added to billing stat spans so the existing `margin-top` creates visible spacing. 1444 tests pass (14 new). Code review APPROVE with 3 NITs. No regressions.

## Original Prompt

Batch of three small UI fixes shipped as a single phase.

Fix 1 — Auto-prepend https:// (#179): The captures UI URL input field automatically prepends `https://` when a user enters a bare hostname (e.g., `example.com` → `https://example.com`). Entries that already have `http://` or `https://` are left unchanged. Partial schemes like `htt://` are not "fixed".

Fix 2 — Verify page German text (#180): All eIDAS references on the verify page use "Article" instead of the German abbreviation "Art." (e.g., "Article 42" not "Art. 42").

Fix 3 — Billing page spacing (#183): Add visible spacing between numeric count values and their unit labels on the billing page (e.g., "14 Captures" not "14Captures"). CSS or template fix.

Closes #179, closes #180, closes #183

## Key Design Decisions

### D1: Inline safeUrl() modification vs. separate normalizeUrl()
Modify safeUrl() inline. A 7-line function with a single caller doesn't warrant extraction into a separate normalizer.

### D2: display: block vs. flexbox
Add `display: block` to the two child spans. Flexbox on the parent changes more properties than needed for two stacked elements.

### D3: Drop urlInput.value visual feedback
Per ux-strategy-minion: the field clears in the same async cycle, making the update invisible. A false affordance is worse than no affordance.

### D4: :// guard for prepend
Only prepend when input does NOT contain `://`. Prevents mangling partial schemes where the user intended a scheme but got it wrong.

## Phases

### Phase 1-2: Planning
1 specialist consulted: frontend-minion (URL normalization approach, CSS fix strategy, verify page scope).

### Phase 3: Synthesis
2 execution tasks, 0 approval gates. All three code changes in one task, tests in a second blocked task.

### Phase 3.5: Architecture Review
5 mandatory reviewers. 3 APPROVE (security-minion, lucy, margo), 2 ADVISE (ux-strategy-minion, test-minion). Key advisories: drop urlInput.value feedback (ux-strategy), add protocol-relative and port edge case tests (test-minion), add regression assertions for Fix 2/3 (test-minion).

### Phase 4: Execution
2 tasks in 1 sequential batch. Task 1: all three code fixes. Task 2: 11 safeUrl tests + 3 regression assertions. All completed successfully.

### Phase 5: Code Review
APPROVE with 3 NITs (billing test specificity, safeUrl comment clarity, example.com:8080 edge case documentation). No blocking findings.

### Phase 6: Tests
1444 pass, 2 skipped, 0 failures. 14 new tests (11 safeUrl, 1 verify page, 2 billing CSS).

### Phase 7: Deployment
Skipped (not requested).

### Phase 8: Documentation
8a assessment: 0 MUST items. 2 items total (SHOULD: release notes, COULD: scan for stale URL validation docs). No documentation debt requiring immediate action.

## Agent Contributions

| Agent | Phase | Role |
|-------|-------|------|
| frontend-minion | planning, execution | URL normalization design, CSS fix, all code changes, tests |
| security-minion | review | Verified no XSS/SSRF/injection from URL prepend |
| test-minion | review | Protocol-relative URL edge case, port edge case, regression assertions |
| ux-strategy-minion | review | Flagged invisible urlInput.value feedback |
| lucy | review | Convention adherence, scope validation |
| margo | review | Simplicity validation, YAGNI compliance |
| code-review-minion | review | Code quality, test specificity NITs |

## Verification

Code review: APPROVE (3 NITs, non-blocking). Tests: 1444 passed, 2 skipped, 0 failures. No regressions.

## Working Files

Companion directory: `docs/history/nefario-reports/2026-03-24-203932-ui-fixes-url-prepend-verify-text-billing-spacing/`

Files: prompt.md, phase1-metaplan-prompt.md, phase1-metaplan.md, phase2-frontend-minion-prompt.md, phase2-frontend-minion.md, phase3-synthesis-prompt.md, phase3-synthesis.md, phase3.5-security-minion.md, phase3.5-test-minion.md, phase3.5-ux-strategy-minion.md, phase3.5-lucy.md, phase3.5-margo.md, phase4-frontend-minion-task1-prompt.md, phase4-frontend-minion-task2-prompt.md, phase8-checklist.md

## Session Resources

<details>
<summary>Skills Invoked</summary>

- /nefario — orchestration

</details>

Compaction events: 0
