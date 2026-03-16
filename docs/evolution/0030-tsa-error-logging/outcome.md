# Outcome: TSA Error Logging

## What was built

Replaced the empty `catch {}` block in `src/wacz.js` (the TSA timestamp request) with
structured error logging to Coralogix and a three-way `timestampStatus` return value.

### Files changed

| File | Change |
|------|--------|
| `src/wacz.js` | Added `import { log }`, replaced empty catch with error logging, added `tsaError` flag, changed return to three-way timestampStatus |
| `test/wacz.test.js` | Added 3 tests for TSA error paths (absent, HTTP 500, unreachable) |

### Behavior change

- **Before**: TSA errors silently swallowed. `timestampStatus` always 'absent' when TSA call failed (indistinguishable from "not configured").
- **After**: TSA errors logged to Coralogix as `capture.tsa_fail` (severity warn). `timestampStatus` is 'error' when TSA call fails, 'absent' when TSA not configured.

### Test results

- 500 tests pass (23 test files)
- 3 new tests added, 0 regressions
- New tests: `timestampStatus` absent/error distinction, HTTP 500 error path, network unreachable error path

## Surprises

The test-minion's Phase 3.5 review caught that `TSA_URL` is set in vitest.config.js,
which would have caused the 'absent' test to fail if it used the global `env` object
directly. This was incorporated before execution.

## Backlog changes

No backlog changes. This phase resolves a known issue (#72) without deferring any work.
The test plan's post-deploy verification item (check Coralogix for `capture.tsa_fail`
after deploy) is operational, not a backlog item.
