# Process: TSA Error Logging

## TL;DR

A focused two-file fix replacing a silent `catch {}` with structured Coralogix logging
and a three-way `timestampStatus`. Two specialists consulted (observability-minion,
test-minion), five mandatory reviewers, one ADVISE finding incorporated before execution.
All 500 tests pass, zero regressions. Total orchestration time ~5 minutes.

## How the team worked

### Phase 1: Meta-Plan

The orchestrator analyzed the codebase directly -- reading `src/wacz.js`, `src/log.js`,
`src/rfc3161.js`, `src/capture.js`, and `test/wacz.test.js` -- before spawning any
specialists. This was a narrow, well-understood task: the empty `catch {}` was on line 111
of wacz.js, the logging function was documented with a clear INVARIANT, and the existing
patterns in capture.js showed exactly how to structure the log call.

Two specialists selected: **observability-minion** (log event schema, severity, INVARIANT
compliance) and **test-minion** (test strategy for the error path). Security-minion was
excluded because the error messages from rfc3161.js are framework-generated DER parser
output with no user-controlled content -- the log.js INVARIANT is satisfied by inspection.

### Phase 2: Specialist Planning

**observability-minion** recommended:
- Severity 4 (warn), subsystem 'capture', event name `capture.tsa_fail`
- `await` the log call (not fire-and-forget) to ensure delivery
- A `classifyTsaError()` helper mapping raw error messages to a bounded enum
- Passing `captureId`/`tenantId` into `buildWacz()` via an optional `logCtx` parameter

**test-minion** recommended:
- 3 tests in the existing graceful degradation describe block
- Test the return value (`timestampStatus`), not the log call (which is a no-op in test env)
- Don't assert on log() since CORALOGIX_SEND_KEY is absent in tests

### Where they disagreed

**classifyTsaError()**: observability-minion argued that logging raw error messages is
risky because DER parsing errors contain numeric values from the TSA response buffer.
The orchestrator disagreed -- these are integer offsets and lengths, not strings, and
the log.js INVARIANT explicitly permits "truncated framework error messages when the
framework does not echo user-supplied content." TSA responses are binary DER. Adding an
error classification helper for a handful of predictable error patterns violates YAGNI.

**logCtx parameter**: observability-minion wanted `captureId`/`tenantId` in the TSA fail
log. The orchestrator noted that `capture.success` already logs both fields alongside
`timestampStatus`, so correlation is already possible without changing `buildWacz()`'s
function signature.

### How conflicts were resolved

Both disagreements were resolved in favor of simplicity (KISS/YAGNI), deferred to margo
as the YAGNI guardian. The reasoning: this is a 10-line fix for a specific production
issue. Adding a classification helper or parameter change turns a patch into a refactor.
The existing patterns in capture.js:119 (`errorName`, truncated `errorMessage`) are
proven safe and readable.

### Phase 3.5: Architecture Review

Five mandatory reviewers:
- **lucy** (APPROVE): Plan aligns with CLAUDE.md "fail loudly" principle, three-way
  timestampStatus satisfies the "distinct status values" requirement
- **margo** (APPROVE): Change is minimal and proportional, rejected alternatives were
  correctly identified as YAGNI
- **security-minion** (APPROVE): Error messages from rfc3161.js are safe (only static
  strings and integers), TSA URL is operator-configured, JSON.stringify escapes any
  control characters, 256-char truncation is sufficient
- **test-minion** (ADVISE): Caught that `TSA_URL` is set in `vitest.config.js:28`,
  meaning the 'absent' test must construct an explicit env without TSA_URL
- **ux-strategy-minion** (APPROVE): error/absent/present taxonomy is unambiguous and
  operationally meaningful

The test-minion's ADVISE was the most valuable finding. Without it, the 'absent' test
would have failed because the global test env includes `TSA_URL`, which triggers the
TSA fetch path (blocked by fetchMock.disableNetConnect()), resulting in `'error'` instead
of `'absent'`. The fix was trivial -- construct `{ SIGNING_KEY: env.SIGNING_KEY }` like
the existing no-SIGNING_KEY test -- but catching it before execution saved a debug cycle.

### Phase 4: Execution

The orchestrator executed directly (no subagent delegation needed for 2 small edits):

1. **src/wacz.js**: Added `import { log }`, replaced empty catch, added `tsaError` flag,
   updated return expression and JSDoc
2. **test/wacz.test.js**: Added 3 tests to graceful degradation describe block

### What the human chose NOT to intervene on

All gates were auto-approved per the user's directive ("skip all approval gates").
The user trusted the orchestrator and reviewers to make correct decisions for this
focused task. Given the narrow scope (one empty catch block, one status value), this
was appropriate.

## Where to read more

- Specialist contributions: see companion directory in `docs/history/nefario-reports/`
- Evolution log: `docs/evolution/0029-tsa-error-logging/`
- Issue: #72
