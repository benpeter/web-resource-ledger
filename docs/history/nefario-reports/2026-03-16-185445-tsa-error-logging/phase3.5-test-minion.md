# Test Minion Review: TSA Error Logging

## Verdict: ADVISE

The implementation plan is sound and the 3 proposed tests cover the critical paths. One issue requires attention before execution, and two observations are worth noting.

---

## Issue: Test env has TSA_URL set -- 'absent' test will not work as described

The synthesis describes test 1 as:

> Call buildWacz with env that has SIGNING_KEY but no TSA_URL -- assert timestampStatus === 'absent'

But `vitest.config.js` bindings include `TSA_URL: 'https://timestamp.sectigo.com'`, and the test-global `env` object from `cloudflare:test` carries all configured bindings. The `env` passed to `buildWacz` in test 1 must explicitly omit `TSA_URL` -- it cannot use the global `env` directly.

The existing no-SIGNING_KEY test at line 261 already demonstrates the pattern: it passes a literal `{}`. Test 1 needs similar treatment: pass `{ SIGNING_KEY: env.SIGNING_KEY }` (omitting TSA_URL) rather than `env` or `{ SIGNING_KEY: env.SIGNING_KEY, TSA_URL: undefined }` (undefined is not the same as absent in JS property lookup -- the `if (env.TSA_URL)` guard will correctly skip for `undefined`, but the intent is clearer with omission).

This is not a blocker -- it's easy to get right -- but if the implementer uses `env` directly and forgets to omit `TSA_URL`, the test will call out to the real TSA endpoint (blocked by fetchMock.disableNetConnect) and assert the wrong status value, producing a misleading failure.

**Fix**: In test 1, explicitly construct env as `{ SIGNING_KEY: env.SIGNING_KEY }` (no TSA_URL property).

---

## Edge case: TSA_URL set to empty string

The synthesis asks to check this. The guard in wacz.js is `if (env.TSA_URL)` -- an empty string is falsy, so it correctly produces `'absent'`. No separate test is needed, but it's worth noting this is handled for free.

---

## Existing test compatibility

The existing integration tests in "WACZ integration -- R2 storage" call `performCapture` which internally calls `buildWacz` with the full `env` (including `TSA_URL`). Those tests will now need the TSA endpoint mocked or the fetch to fail gracefully:

- `fetchMock.disableNetConnect()` is active for all tests via `beforeEach`.
- No intercept is registered for `https://timestamp.sectigo.com`.
- Under the current (pre-change) code, the TSA call throws, caught by the empty `catch {}`, and returns `timestampStatus: 'absent'`. This works silently.
- Under the new code, the TSA call throws, caught by the new `catch`, logs (no-op in test env since no CORALOGIX keys), sets `tsaError = true`, returns `timestampStatus: 'error'`.

The existing tests do NOT assert on `timestampStatus`, so they will not break from the value change. However, the existing integration tests will now exercise the `tsaError = true` path on every run (since fetchMock blocks the TSA call). This is acceptable -- it validates the error path under real conditions -- but the implementer should be aware that all 9 integration tests effectively become implicit `timestampStatus: 'error'` tests due to fetchMock blocking the TSA URL.

If you want the integration tests to exercise the `'present'` path, you would need to register a mock TSA response. That is out of scope for this issue.

---

## fetchMock approach

Correct. `fetchMock` from `cloudflare:test` intercepts at the Worker runtime level. For test 2 (HTTP 500), `fetchMock.get(tsaUrl).intercept(...).reply(500, ...)` will cause `requestTimestamp` to throw `"TSA returned HTTP 500"` at line 213 of rfc3161.js. For test 3 (unreachable), the already-active `disableNetConnect()` with no registered intercept will throw a network error. Both will be caught by the new catch block and set `tsaError = true`. The approach is correct.

---

## Summary

Three tests are sufficient. The only actionable fix before implementation: test 1 must construct env manually without TSA_URL rather than using the global `env`. Everything else is either fine or informational.
