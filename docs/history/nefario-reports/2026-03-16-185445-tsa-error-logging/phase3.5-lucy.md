# Lucy Review: TSA Error Logging (#72)

## Verdict: APPROVE

The plan is tightly scoped to the issue's request, follows existing code patterns, and complies with CLAUDE.md directives. Two advisory notes below.

---

## Requirement Traceability

| Requirement (from #72) | Plan Element | Status |
|---|---|---|
| Replace empty `catch {}` with error logging | Task 1, step 3 | Covered |
| Log to Coralogix so TSA errors are diagnosable | Task 1: `capture.tsa_fail` event with `tsaUrl`, `errorName`, `errorMessage` | Covered |
| Distinguish "service unavailable" from "misconfigured" per CLAUDE.md | Task 1, step 4: three-way `timestampStatus` (`present` / `error` / `absent`) | Covered |
| Tests pass | Task 2: three new test cases | Covered |

No orphaned tasks. No unaddressed requirements.

## CLAUDE.md Compliance

- **"Fail loudly, degrade intentionally"**: The empty `catch {}` is replaced with a logged catch that sets `tsaError = true`. The new `'error'` status value distinguishes TSA failure from TSA-not-configured (`'absent'`). Compliant.
- **Distinct status values**: `'present'` / `'error'` / `'absent'` -- three states for three conditions. Compliant.
- **YAGNI / KISS**: No classifyTsaError() helper, no logCtx parameter. Rationale is sound -- rfc3161.js errors are framework-generated, and `capture.success` already provides correlation context. Compliant.
- **Error message truncation**: `.slice(0, 256)` matches the pattern at `capture.js:119`. Compliant.
- **Severity 4 (warn)**: Consistent with `capture.wacz_fail` and `capture.header_fail` for degraded-but-functional paths. Compliant.
- **Subsystem `'capture'`**: Consistent with all other WACZ lifecycle events. Compliant.
- **`await log()`**: Plan correctly awaits to ensure Coralogix POST completes before Worker context terminates. Matches existing pattern in `capture.js`. Compliant.

## Drift Analysis

No scope creep detected. The plan touches exactly two files (`src/wacz.js`, `test/wacz.test.js`), adds one import, modifies one catch block, and adjusts one return expression. Proportional to the problem.

## Advisory Notes

1. **[CONVENTION] `log.js` import**: Task 1 step 1 adds `import { log } from './log.js';` to `wacz.js`. Currently `wacz.js` has no dependency on `log.js`. This is the correct approach (log.js is the project's logging module), but note that `log()` is a no-op when `CORALOGIX_ENDPOINT` is absent (line 24 of log.js). The test plan correctly acknowledges this ("log() is a no-op in test env"). No action needed -- just confirming the pattern is understood.

2. **[CONVENTION] JSDoc update**: Task 1, step 5 mentions updating the JSDoc return type to include `'error'`. The current JSDoc on line 44 of `wacz.js` shows `timestampStatus: 'present'|'absent'`. Ensure the updated type is `'present'|'error'|'absent'` -- the plan states this but doesn't show the exact string. Minor, but JSDoc accuracy matters for a codebase that doesn't use TypeScript.

No BLOCK or DRIFT findings.
