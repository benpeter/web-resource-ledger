You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task

Eliminate silent catch blocks — fail loudly on unexpected errors (GitHub Issue #70)

All `catch` blocks in the codebase either log the error or handle a specific, named error type. Silent error swallowing is eliminated. Degraded features report distinct status values so operators can distinguish "service unavailable" from "misconfigured."

## Your Planning Question

For each catch block that currently swallows errors silently, what log event should be emitted?

Define for each:
- Event name (following existing convention: `module.event_type`, e.g., `capture.tsa_fail`)
- Severity level (Coralogix: 3=info, 4=warn, 5=error)
- Subsystem (module name)
- Structured fields (what data to include)

Also answer:
- Should the existing `log.js` fire-and-forget pattern (`.catch(() => {})` on the fetch, and bare `catch { return; }` wrapping the whole function) be changed? `log.js` can't use its own `log()` function to report failures (infinite recursion). What's the right fallback — `console.error`? `console.warn`? Nothing?
- What are the tradeoffs of adding `console.error` as a fallback vs. the risk of noise in production Workers?

## Context

Working directory: /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario/fail-loudly-2

Key files to read:
- `src/log.js` — the logging module (fire-and-forget to Coralogix)
- `src/capture.js` — existing log events for reference (e.g., `capture.tsa_fail`, `capture.fail`)
- `src/wacz.js` — TSA catch block (already fixed with logging)
- `src/signing.js` — `console.warn` only, no structured logging
- `src/consent.js` — browser context catches
- `src/index.js` — route handler catches
- `src/cdxj.js` — silent URL parse catch

Existing log event patterns to follow:
- `capture.start`, `capture.success`, `capture.fail`, `capture.partial`
- `capture.tsa_fail`, `capture.wacz_fail`, `capture.key_archive_fail`
- `security.auth_fail`, `security.rate_limit`

## Instructions

1. Read the source files listed above
2. Identify catch blocks that need logging
3. Design log events following existing conventions
4. Address the log.js meta-logging question
5. Return your contribution

## Domain Plan Contribution format:

### Recommendations
### Proposed Tasks
### Risks and Concerns
### Additional Agents Needed

Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-XVBmSU/fail-loudly-2/phase2-observability-minion.md
