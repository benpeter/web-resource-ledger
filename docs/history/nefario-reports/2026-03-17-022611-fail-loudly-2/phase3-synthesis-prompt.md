MODE: SYNTHESIS

You are synthesizing specialist planning contributions into a final execution plan.

## Original Task

Eliminate silent catch blocks — fail loudly on unexpected errors (GitHub Issue #70)

All `catch` blocks in the codebase either log the error or handle a specific, named error type. Silent error swallowing is eliminated. Degraded features report distinct status values so operators can distinguish "service unavailable" from "misconfigured."

Success criteria:
- `wacz.js` TSA catch block logs the error and sets `timestampStatus: 'error'` (distinct from `'skipped'` when TSA_URL is not configured and `'present'` on success)
- Audit all other `catch` blocks in `src/` for the same pattern — fix any that silently swallow
- Verification page and API responses surface the three-way status (`present`/`skipped`/`error`)
- No bare `catch {}` or `catch { }` blocks remain in `src/`

Scope IN: Error handling in existing catch blocks, timestampStatus semantics, log entries for degraded paths
Scope OUT: New retry logic, circuit breakers, alerting rules, changes to capture pipeline flow

## Specialist Contributions

Read the following scratch files for full specialist contributions:
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-XVBmSU/fail-loudly-2/phase2-debugger-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-XVBmSU/fail-loudly-2/phase2-observability-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-XVBmSU/fail-loudly-2/phase2-test-minion.md

## Key consensus across specialists:

### debugger-minion (planning)
14 silent catches across 7 files; fix with logging/error capture. log.js must use console.warn (recursion risk). Rename 'absent' to 'skipped' in wacz.js. High-priority: log.js, signing.js, index.js:187, consent.js:71. Medium: capture.js:335,563,660. Low/document-only: consent.js frame catches.

### observability-minion (planning)
Add console.error to log.js catches; add structured Coralogix events for signing.js (signing.key_import_fail, sev 5), index.js:187 (capture.kv_create_fail, sev 5); fix index.js:263 severity 3->5; add _error to consent.js catch return. Console.error noise during Coralogix outage is manageable.

### test-minion (planning)
1 test update: 'absent'->'skipped' in wacz.test.js. 4 new tests: getSigningKeys null for malformed key, toSurt fallback, verify API timestamp field, consent error field. Most error paths already covered.

## External Skills Context
No external skills detected.

## Instructions

1. Review all specialist contributions
2. Resolve any conflicts between recommendations -- there is broad consensus here
3. Incorporate risks and concerns into the plan
4. Create the final execution plan in structured format
5. Ensure every task has a complete, self-contained prompt
6. This is a focused task -- keep execution lean (2-3 tasks max)
7. Write your complete delegation plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-XVBmSU/fail-loudly-2/phase3-synthesis.md

KEY CONSTRAINTS:
- Use sonnet for execution agents (this is implementation, not deep reasoning)
- Use bypassPermissions mode for code changes
- All tasks should use the debugger-minion or code-review-minion agent types for the actual code changes
- The working directory is /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario/fail-loudly-2
- Keep it simple -- this is a focused error-handling task, not a redesign
