# Phase 0035: Eliminate Silent Catch Blocks

## Source

GitHub Issue #70: "Eliminate silent catch blocks — fail loudly on unexpected errors"

## Task Description

All `catch` blocks in the codebase either log the error or handle a specific, named error type. Silent error swallowing (`catch {}` / `catch { /* continue */ }`) is eliminated. Degraded features report distinct status values so operators can distinguish "service unavailable" from "misconfigured."

## Success Criteria

- `wacz.js` TSA catch block logs the error to Coralogix and sets `timestampStatus: 'error'` (distinct from `'skipped'` when TSA_URL is not configured and `'present'` on success)
- Audit all other `catch` blocks in `src/` for the same pattern — fix any that silently swallow
- Verification page and API responses surface the three-way status (`present`/`skipped`/`error`)
- No bare `catch {}` or `catch { }` blocks remain in `src/`

## Scope

**In:** Error handling in existing catch blocks, timestampStatus semantics, log entries for degraded paths

**Out:** New retry logic, circuit breakers, alerting rules, changes to the capture pipeline flow

## Context

Issue #66 (DigiCert TSA HTTPS misconfiguration) shipped and was invisible because the `catch` block in `wacz.js:109-113` silently swallows ALL errors — connection refused, DNS failure, misconfigured URL — and sets the same `timestampStatus: 'absent'` as when TSA is intentionally not configured. Operators had no way to distinguish "working as designed" from "broken."

CLAUDE.md now includes the principle: "Fail loudly, degrade intentionally — silent catch blocks are forbidden."
