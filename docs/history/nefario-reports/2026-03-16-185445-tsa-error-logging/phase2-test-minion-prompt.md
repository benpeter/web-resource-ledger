# Test-Minion Planning Prompt

You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise
to help build a comprehensive plan.

## Project Task
Replace the empty `catch {}` block in `src/wacz.js:111-113` (TSA timestamp request)
with structured error logging to Coralogix. Add `timestampStatus: 'error'` to distinguish
TSA failures from "not configured" (`'absent'`).

## Your Planning Question
We need test coverage for the new TSA error logging path and the new
`timestampStatus: 'error'` value. The test suite (`test/wacz.test.js`) uses
`cloudflare:test` with `fetchMock`. Currently no tests exercise the `env.TSA_URL`
code path. What's the minimal test strategy? Consider: (a) testing `buildWacz`
directly with a mocked failing TSA endpoint, (b) asserting `timestampStatus` is
`'error'` vs `'absent'`, (c) whether we need to verify the log call itself or just
the return value.

## Context
- Working directory: /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario/tsa-error-logging
- Key files: test/wacz.test.js, src/wacz.js, src/log.js, src/rfc3161.js
- Tests use vitest + cloudflare:test + fetchMock
- Existing test structure: describe blocks for WACZ integration, graceful degradation, signing round-trip
- CLAUDE.md principle: "Test the real boundaries" -- but mocking TSA for the error path is appropriate since we're testing error handling, not TSA integration

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. Return your contribution in the structured format.
5. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-TZGb0y/tsa-error-logging/phase2-test-minion.md
