# Lucy Review: Fix TOCTOU gap in swapVerifiedEmail()

## Verdict: ADVISE

Plan is well-aligned with the user's intent and properly scoped. One minor gap to address.

## Requirements Traceability

| Requirement (from issue #222 / prompt.md) | Plan Element | Status |
|---|---|---|
| Add `AND pending_email = ?` to WHERE clause | Task 1, step 1: SQL change in `src/db.js` | COVERED |
| Pass expected email as parameter | Task 1, step 1: new `expectedEmail` param + bind | COVERED |
| Update caller to pass email | Task 1, step 2: `src/email-verify.js` change | COVERED |
| Return `{ ok: false }` if no rows updated | Already implemented (lines 1414-1416 in `src/db.js`) | COVERED (existing) |
| Evolution log entry | Plan line 115: "handled by orchestrator" | SEE FINDING 1 |

## Findings

### Finding 1 — CONVENTION: Evolution log delegation is implicit

**CHANGE**: The plan states "Evolution log entry (handled by orchestrator)" but does not specify a phase number or directory name.

**WHY**: CLAUDE.md requires every significant development phase to have an evolution log entry in `docs/evolution/`. The latest committed phase is 0094 (`sign-in-button-contrast-fix`). The plan correctly defers this to the orchestrator, but if the orchestrator does not have this convention front-of-mind, it could be missed. The orchestrator should create phase `0095-fix-toctou-swap-verified-email/` with `prompt.md`, `decisions.md`, and `outcome.md`.

**Severity**: CONVENTION (minor -- the plan acknowledges it, just doesn't specify the number)

**Recommendation**: No action needed on the plan itself. This is a reminder to the orchestrator to create the evolution log entry at phase 0095 after execution completes.

## Scope Assessment

No scope creep detected. The plan makes exactly the changes described in issue #222:
- One parameter addition to `swapVerifiedEmail()`
- One WHERE clause change
- One caller update
- One comment update

No new files, no new abstractions, no adjacent features.

## CLAUDE.md Compliance

- Engineering philosophy (YAGNI, KISS, Lean and Mean): Compliant. Minimal change.
- "Fail loudly, degrade intentionally": The existing `{ ok: false, error: '...' }` path handles the new failure mode. No silent swallowing.
- Testing convention: Plan correctly avoids running tests in the agent prompt ("Do NOT run tests -- the orchestrator handles that"). Consistent with CLAUDE.local.md testing discipline.
- Agent assignment: security-minion with `bypassPermissions` is appropriate for a security fix in core DB/auth logic.

## Goal Drift Check

No drift detected. The plan is a 1:1 mapping of the issue description to implementation steps.
