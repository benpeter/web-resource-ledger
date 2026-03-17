# Prompt: Eliminate Silent Catch Blocks (#70)

Source issue: https://github.com/benpeter/web-resource-ledger/issues/70

## Outcome

All `catch` blocks in the codebase either log the error or handle a specific, named error type. Silent error swallowing (`catch {}` / `catch { /* continue */ }`) is eliminated. Degraded features report distinct status values so operators can distinguish "service unavailable" from "misconfigured."

## Success criteria

- `wacz.js` TSA catch block logs the error to Coralogix and sets `timestampStatus: 'error'` (distinct from `'skipped'` when TSA_URL is not configured and `'present'` on success)
- Audit all other `catch` blocks in `src/` for the same pattern — fix any that silently swallow
- Verification page and API responses surface the three-way status (`present`/`skipped`/`error`)
- No bare `catch {}` or `catch { }` blocks remain in `src/`

## Scope

**In:** Error handling in existing catch blocks, timestampStatus semantics, log entries for degraded paths

**Out:** New retry logic, circuit breakers, alerting rules, changes to the capture pipeline flow
