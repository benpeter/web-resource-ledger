You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task

Eliminate silent catch blocks — fail loudly on unexpected errors (GitHub Issue #70)

All `catch` blocks in the codebase either log the error or handle a specific, named error type. Silent error swallowing (`catch {}` / `catch { /* continue */ }`) is eliminated. Degraded features report distinct status values so operators can distinguish "service unavailable" from "misconfigured."

Success criteria:
- `wacz.js` TSA catch block logs the error and sets `timestampStatus: 'error'` (distinct from `'skipped'` when TSA_URL is not configured and `'present'` on success)
- Audit all other `catch` blocks in `src/` for the same pattern — fix any that silently swallow
- Verification page and API responses surface the three-way status (`present`/`skipped`/`error`)
- No bare `catch {}` or `catch { }` blocks remain in `src/`

Scope IN: Error handling in existing catch blocks, timestampStatus semantics, log entries for degraded paths
Scope OUT: New retry logic, circuit breakers, alerting rules, changes to capture pipeline flow

Context: Issue #66 (DigiCert TSA HTTPS misconfiguration) shipped invisibly because the catch block in wacz.js silently swallowed ALL errors and set the same `timestampStatus: 'absent'` as when TSA was intentionally not configured.

## Your Planning Question

Audit every `catch` block in `src/` (excluding `src/vendor/`) and classify each into one of three categories:
1. **Already correct** — logs error or handles a specific named error type
2. **Silent swallow — needs fixing** — bare catch that swallows unexpected errors
3. **Intentional degradation — needs status distinction** — catches correctly but doesn't distinguish "unavailable" from "misconfigured"

For each category-2 and category-3 block, recommend the specific fix:
- What should be logged (or not — and why)
- What error information should be captured
- What status value should be returned

Pay special attention to:
- `log.js` which has `.catch(() => {})` and bare `catch { return; }` — these are meta-logging failures with infinite recursion risk
- `consent.js` browser context catches — which are expected browser lifecycle vs. genuinely silent
- `capture.js:660` cleanup `.catch(() => {})` in finally block
- The `timestampStatus` rename: `'absent'` → `'skipped'`

## Context

Working directory: /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario/fail-loudly-2
Source files are in `src/`. Tests are in `test/`.

## Instructions

1. Read all source files in `src/` (excluding `src/vendor/`)
2. Find every catch block pattern: `catch`, `.catch(`
3. Classify each according to the three categories
4. For fixes, be specific about what changes
5. Consider the CLAUDE.md principle: "Fail loudly, degrade intentionally — silent catch blocks are forbidden. Every catch must either log the error or handle a specific, named error type."

Return your contribution in this format:

## Domain Plan Contribution: debugger-minion

### Recommendations
### Proposed Tasks
### Risks and Concerns
### Additional Agents Needed

Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-XVBmSU/fail-loudly-2/phase2-debugger-minion.md
