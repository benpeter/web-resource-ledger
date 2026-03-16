# Synthesis: TSA Error Logging (#72)

## Execution Plan

### Task 1: Implement TSA error logging in wacz.js
**Agent**: code implementation (main session)
**Files**: src/wacz.js
**Changes**:
1. Add `import { log } from './log.js';`
2. Add `let tsaError = false;` before the try block (line ~107)
3. Replace the empty `catch {}` block at lines 111-113 with:
   ```js
   } catch (err) {
     tsaError = true;
     await log(env, 4, 'capture', {
       event: 'capture.tsa_fail',
       tsaUrl: env.TSA_URL,
       errorName: err?.name,
       errorMessage: String(err?.message ?? '').slice(0, 256),
     });
   }
   ```
4. Change the return value on line 154:
   `timestampStatus: tsaResult ? 'present' : (tsaError ? 'error' : 'absent')`
5. Update JSDoc return type to include `'error'`

**Rationale**:
- Severity 4 (warn): TSA failure is degraded-but-functional, matching capture.wacz_fail and capture.header_fail
- Subsystem 'capture': consistent with existing WACZ lifecycle events
- await log(): ensures the Coralogix POST completes before Worker context terminates
- No classifyTsaError() helper: YAGNI -- rfc3161.js errors are framework-generated, safe per log.js INVARIANT
- No logCtx parameter: KISS -- capture.success in capture.js already logs captureId/tenantId alongside timestampStatus
- tsaUrl included: helps identify which TSA endpoint is failing
- errorMessage truncated to 256 chars: matches capture.js:119 pattern

### Task 2: Add tests for TSA error paths
**Agent**: code implementation (main session)
**Files**: test/wacz.test.js
**Changes**: Add 3 tests to the "WACZ -- graceful degradation" describe block:

1. `timestampStatus is 'absent' when env has no TSA_URL`:
   - Call buildWacz with env that has SIGNING_KEY but no TSA_URL
   - Assert result.timestampStatus === 'absent'

2. `timestampStatus is 'error' when TSA returns HTTP 500`:
   - Register fetchMock intercept for a fake TSA URL returning 500
   - Call buildWacz with env that includes TSA_URL pointing to fake URL
   - Assert result.timestampStatus === 'error'

3. `timestampStatus is 'error' when TSA is unreachable`:
   - fetchMock.disableNetConnect() is already active (from beforeEach)
   - Call buildWacz with env that includes a TSA_URL with no registered intercept
   - Assert result.timestampStatus === 'error'

**No log() call assertions**: log() is a no-op in test env (no CORALOGIX_ENDPOINT).

### Dependencies
Task 2 depends on Task 1 (tests verify new behavior). Execute sequentially.

### Gates
None (tasks are small and sequential).

### Conflicts Resolved
- observability-minion recommended classifyTsaError() helper for safety -- rejected as YAGNI since rfc3161.js errors don't contain user-controlled input
- observability-minion recommended logCtx parameter -- rejected as KISS since capture.success already provides correlation context
