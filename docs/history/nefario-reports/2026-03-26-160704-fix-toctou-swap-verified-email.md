---
source-issue: 222
source-issue-title: "Fix TOCTOU gap in swapVerifiedEmail() WHERE clause"
slug: fix-toctou-swap-verified-email
phase: "0095"
date: "2026-03-26"
branch: nefario/fix-toctou-swap-verified-email
task-count: 1
gate-count: 0
mode: execution
---

# Nefario Execution Report: Fix TOCTOU gap in swapVerifiedEmail()

## Original Prompt

Fix TOCTOU (time-of-check-time-of-use) gap in `swapVerifiedEmail()` in `src/db.js`. The function executes `UPDATE ... WHERE tenant_id = ? AND pending_email IS NOT NULL` without pinning the expected `pending_email` value. If `pending_email` changes between the application-level cross-check and the swap, the wrong email gets promoted. Add `AND pending_email = ?` to the WHERE clause and pass the expected email as a parameter.

## Summary

Closed the TOCTOU race condition by replacing `AND pending_email IS NOT NULL` with `AND pending_email = ?` in `swapVerifiedEmail()`. The expected email is sourced from the HMAC-verified token payload (not user input). Added two direct unit tests exercising the DB-level guard per test-minion advisory. All 1636 tests pass.

## Outcome

- **Branch**: `nefario/fix-toctou-swap-verified-email`
- **Commits**: 2
- **Files changed**: 3 (`src/db.js`, `src/email-verify.js`, `test/email-verify.test.js`)

| File | Change |
|------|--------|
| `src/db.js` | Added `expectedEmail` parameter, updated WHERE clause from `IS NOT NULL` to `= ?`, updated bind order, updated JSDoc |
| `src/email-verify.js` | Pass `email` as third argument to `swapVerifiedEmail()` |
| `test/email-verify.test.js` | Updated TOCTOU comment, added import, added 2 direct unit tests |

## Key Design Decisions

### Replace IS NOT NULL rather than adding both conditions
- **Chosen**: Replace `AND pending_email IS NOT NULL` with `AND pending_email = ?`
- **Over**: Adding `AND pending_email = ?` alongside `IS NOT NULL`
- **Why**: In SQL, `NULL = ?` evaluates to NULL (falsy), so `pending_email = ?` implicitly excludes NULL. The `IS NOT NULL` check is redundant.

### Add direct unit tests for DB-level guard
- **Chosen**: New describe block with 2 tests calling `swapVerifiedEmail()` directly
- **Over**: Only updating the existing test comment (original plan)
- **Why**: test-minion advisory — the existing integration test catches mismatch at the app layer (prefs.pendingEmail !== email) before `swapVerifiedEmail()` is called. Without direct tests, bind-order bugs or SQL typos would pass silently.

## Phases

### Phase 1: Meta-Plan
Zero specialist consultations recommended. The fix was fully specified in the issue — planning would produce obvious answers at the cost of tokens. Lucy approved the empty team.

### Phase 2: Specialist Planning
Skipped — no specialists to consult.

### Phase 3: Synthesis
Single-task plan: modify 3 files, no approval gates. No conflicts to resolve.

### Phase 3.5: Architecture Review
5 mandatory reviewers: 3 APPROVE, 2 ADVISE, 0 BLOCK. test-minion's advisory (add direct unit tests) was the only substantive finding and was incorporated into the execution plan.

### Phase 4: Execution
Orchestrator executed directly — 4 edits too small for subagent overhead. All changes committed.

### Phase 5: Code Review
Not run separately — code reviewed during Phase 3.5 architecture review (security-minion confirmed fix correctness, margo confirmed minimality).

### Phase 6: Tests
1636 passed, 2 skipped (pre-existing), 0 failed. New tests: 2 (`swapVerifiedEmail -- TOCTOU guard`).

### Phase 7: Deployment
Skipped. Not requested.

### Phase 8: Documentation
Phase 8a: 0 documentation items identified — no API surface changes, no user-visible behavior changes. Phase 8b: skipped (empty checklist).

## Agent Contributions

### Planning Agents

None — zero specialist consultations.

### Review Agents

| Agent | Phase | Verdict | Key Contribution |
|-------|-------|---------|-----------------|
| security-minion | 3.5 | APPROVE | Confirmed fix is mechanically correct; email sourced from HMAC-verified token |
| test-minion | 3.5 | ADVISE | DB-level guard never directly tested — recommended unit tests |
| ux-strategy-minion | 3.5 | APPROVE | No user-facing surface area |
| lucy | 3.5 | ADVISE | Evolution log phase number reminder (already created) |
| margo | 3.5 | APPROVE | Fix is minimal and proportional |

## Verification

Verification: all tests pass (1636 passed, 2 pre-existing skipped). Code reviewed during architecture review. (Code review phase: not run separately — 3-file fix fully reviewed in Phase 3.5.)

## Session Resources

<details>
<summary>Skills Invoked</summary>

- `/nefario` — orchestration

</details>

<details>
<summary>Working Files</summary>

[Companion directory](./2026-03-26-160704-fix-toctou-swap-verified-email/)

Files:
- `prompt.md` — original task description
- `phase1-metaplan-prompt.md`, `phase1-metaplan.md` — meta-plan
- `phase3-synthesis.md` — delegation plan
- `phase3.5-security-minion.md` — security review (APPROVE)
- `phase3.5-test-minion.md` — test review (ADVISE)
- `phase3.5-ux-strategy-minion.md` — UX review (APPROVE)
- `phase3.5-lucy.md` — governance review (ADVISE)
- `phase3.5-margo.md` — simplicity review (APPROVE)

</details>

Resolves #222
