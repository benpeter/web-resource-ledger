# Process: Fix TOCTOU gap in swapVerifiedEmail()

## TL;DR

Single-task orchestration fixing a TOCTOU race condition in one SQL WHERE
clause. 5 mandatory reviewers all approved or advised, zero blocks. One
substantive advisory from test-minion led to adding direct unit tests for
the DB-level guard. All 1636 tests pass. Total: 3 files changed, 2 new
tests added.

## Phase 1: Meta-Plan

Nefario analyzed the task and recommended **zero specialist consultations**.
The fix was fully specified in the issue (#222): add one parameter, one
WHERE clause condition, update one caller, update one test comment. The
meta-plan correctly identified this as a "just do it" fix where planning
would produce obvious answers.

Lucy approved the empty team, noting that the `email` variable is already
in scope at the call site (line 407 of email-verify.js), confirming the
fix is mechanically straightforward.

One external skill discovered (ops-runbook) — not relevant to a code fix.

## Phase 2: Specialist Planning

Skipped — no specialists to consult.

## Phase 3: Synthesis

The execution plan was a single task with no approval gates:
1. Modify `src/db.js`: add `expectedEmail` parameter, update WHERE clause
2. Modify `src/email-verify.js`: pass `email` at call site
3. Modify `test/email-verify.test.js`: update TOCTOU comment

No conflicts to resolve, no dependencies, no gates needed.

## Phase 3.5: Architecture Review

Five mandatory reviewers ran in parallel:

| Reviewer | Verdict | Key Point |
|----------|---------|-----------|
| security-minion | APPROVE | Fix mechanically correct; email sourced from HMAC-verified token, not user input |
| test-minion | ADVISE | DB-level guard never directly tested; existing test catches mismatch at app layer first |
| ux-strategy-minion | APPROVE | No user-facing surface area |
| lucy | ADVISE | Evolution log reminder (already created as 0095) |
| margo | APPROVE | Fix is minimal and proportional |

No discretionary reviewers were selected — pure backend SQL fix with no UI,
no web-facing runtime, no observability changes.

### Key Disagreement: Test Coverage

test-minion's advisory was the only substantive finding. Their argument:

> The existing test at line 343 catches the mismatch via the app-level check
> (prefs.pendingEmail !== email) and returns early. swapVerifiedEmail() is
> never called in that test path. The new AND pending_email = ? WHERE clause
> and its bind are dead code from the test suite's perspective.

This was incorporated into the execution plan — two direct unit tests were
added calling `swapVerifiedEmail()` directly with mismatched and matching
email arguments.

## Phase 4: Execution

The orchestrator executed the fix directly (no subagent needed for 4 edits):

1. `src/db.js`: Added `expectedEmail` parameter, replaced
   `AND pending_email IS NOT NULL` with `AND pending_email = ?`, updated
   bind and JSDoc
2. `src/email-verify.js`: Changed call from
   `swapVerifiedEmail(env.DB, tenantId)` to
   `swapVerifiedEmail(env.DB, tenantId, email)`
3. `test/email-verify.test.js`: Updated TOCTOU comment, added import for
   `swapVerifiedEmail`, added new describe block with 2 direct tests

### Design Decision: IS NOT NULL Removal

Replaced `AND pending_email IS NOT NULL` entirely rather than adding both
conditions. In SQL, `NULL = ?` evaluates to NULL (falsy), so `pending_email = ?`
implicitly excludes NULL. The IS NOT NULL check becomes redundant.

## Phase 5-6: Verification

All 1636 tests pass (2 skipped, pre-existing). The two new TOCTOU guard
tests both pass:
- `rejects swap when expectedEmail does not match pending_email`
- `succeeds when expectedEmail matches pending_email`

## Human Interventions

None — autonomous orchestration. Lucy served as gate proxy at team approval,
reviewer approval, and execution plan approval gates.

## Where to Read More

- Meta-plan: `docs/history/nefario-reports/` (companion directory)
- Issue: #222
- Security review that identified the gap: `docs/evolution/0084-email-verify-tests/decisions.md`
