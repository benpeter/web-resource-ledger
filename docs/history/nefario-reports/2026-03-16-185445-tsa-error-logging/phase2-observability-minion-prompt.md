# Observability-Minion Planning Prompt

You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise
to help build a comprehensive plan.

## Project Task
Replace the empty `catch {}` block in `src/wacz.js:111-113` (TSA timestamp request)
with structured error logging to Coralogix. Add `timestampStatus: 'error'` to distinguish
TSA failures from "not configured" (`'absent'`).

## Your Planning Question
The TSA timestamp request in `src/wacz.js` currently swallows errors silently. We need
to add a `capture.tsa_fail` Coralogix log event. Review `src/log.js` (the logging
function, especially its INVARIANT about attacker-controlled input) and `src/wacz.js:107-114`
(the TSA catch block). What severity level, subsystem, and structured payload fields should
the log event include? Should we `await` the log call or fire-and-forget? Also: the
`requestTimestamp()` errors come from DER parsing, HTTP status codes, and validation
failures (see `src/rfc3161.js`) -- are these safe to include in log payloads per the
log.js INVARIANT?

## Context
- Working directory: /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario/tsa-error-logging
- Key files: src/wacz.js, src/log.js, src/rfc3161.js, src/capture.js
- The project uses Coralogix for structured logging via a simple `log()` function
- The `log()` function has an INVARIANT that `data` must not contain attacker-controlled input
- Existing similar logging pattern in capture.js:203 for wacz_fail events

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. Return your contribution in the structured format.
5. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-TZGb0y/tsa-error-logging/phase2-observability-minion.md
