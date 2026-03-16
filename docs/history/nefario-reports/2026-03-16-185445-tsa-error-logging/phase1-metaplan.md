# Meta-Plan: TSA Error Logging (#72)

## Task Summary
Replace the empty `catch {}` block in `src/wacz.js:111-113` (TSA timestamp request)
with structured error logging to Coralogix. Add a `timestampStatus: 'error'` status
to distinguish TSA failures from "not configured" (`'absent'`). This directly implements
the CLAUDE.md "Fail loudly, degrade intentionally" principle.

## Specialists to Consult

### 1. observability-minion
**Planning question**: The TSA timestamp request in `src/wacz.js` currently swallows
errors silently. We need to add a `capture.tsa_fail` Coralogix log event. Review
`src/log.js` (the logging function, especially its INVARIANT about attacker-controlled
input) and `src/wacz.js:107-114` (the TSA catch block). What severity level, subsystem,
and structured payload fields should the log event include? Should we `await` the log
call or fire-and-forget? Also: the `requestTimestamp()` errors come from DER parsing,
HTTP status codes, and validation failures (see `src/rfc3161.js`) -- are these safe to
include in log payloads per the log.js INVARIANT?

### 2. test-minion
**Planning question**: We need test coverage for the new TSA error logging path and the
new `timestampStatus: 'error'` value. The test suite (`test/wacz.test.js`) uses
`cloudflare:test` with `fetchMock`. Currently no tests exercise the `env.TSA_URL` code
path. What's the minimal test strategy? Consider: (a) testing `buildWacz` directly with
a mocked failing TSA endpoint, (b) asserting `timestampStatus` is `'error'` vs
`'absent'`, (c) whether we need to verify the log call itself or just the return value.

## Cross-Cutting Checklist
- [x] Security: error messages from rfc3161.js are framework-generated, not user-controlled
- [x] YAGNI: only add what's needed -- one log call, one status value change
- [x] KISS: follow existing logging patterns in capture.js exactly
- [ ] Tests: need coverage for error path (test-minion)
- [ ] Observability: structured event schema (observability-minion)

## Exclusions
- security-minion: not needed -- no new attack surface, error messages are safe per log.js INVARIANT
- frontend-minion: no UI changes
- data-minion: no schema changes
- All other specialists: task is too narrowly scoped

## External Skills
No external skills detected.
