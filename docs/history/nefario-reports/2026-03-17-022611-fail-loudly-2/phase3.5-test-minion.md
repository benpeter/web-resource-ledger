## Verdict: ADVISE

The plan is mostly sound. The new tests for `getSigningKeys` malformed key and `toSurt` fallback are appropriate additions, and the `wacz.test.js` rename from `'absent'` to `'skipped'` is correctly identified and scoped. One gap needs to be fixed during implementation:

### Issue: `log.test.js` describes old behavior and must be updated

`test/log.test.js` line 159 contains a `describe` block titled **"log -- swallows fetch errors silently"** with a test that asserts `resolves.not.toThrow()`. After the change, `log.js` will call `console.warn` on fetch failure — it no longer swallows silently, which is the entire point of this task. The test will still pass mechanically (it only asserts no throw), but the description actively contradicts the new behavior and will mislead future readers.

The plan does not update this test. The implementation prompt must be amended or the debugger-minion must be instructed to:

1. Rename the describe block to "log -- emits console.warn on fetch failure, does not throw"
2. Add an assertion that `console.warn` was called with the `wrl:log_delivery_fail` prefix — use `vi.spyOn(console, 'warn')` to assert the warn fires

Similarly for the JSON.stringify error path (`test/log.test.js` line 170-180), the describe block says "handles JSON.stringify errors gracefully" with no assertion about `console.warn`. After the change, the `catch` block will emit `console.warn('wrl:log_build_fail', ...)`. The test should verify this fires.

### Minor: `ip-hash.test.js` lacks a test for the catch path itself

`ip-hash.test.js` has good degradation tests (missing seed, null env) but does not test the case where HMAC computation itself throws (a malformed but present seed that causes WebCrypto to fail). This is now the catch path that will emit `console.warn('wrl:cip_hash_fail', ...)`. This is a lower priority than the `log.js` issue — the degradation tests provide reasonable coverage of the return path — but worth noting since the catch block change introduces observable behavior (the warn) that has no assertion.

### Verification grep is correct

The plan's grep command `grep -rn 'catch\s*{' src/` is appropriate and will catch the target patterns. The success criteria are sufficient.

### Summary

The plan will produce passing tests but will leave two test descriptions in `log.test.js` that actively describe the old silent behavior as the intended behavior. This inverts the project's "fail loudly" principle in the test documentation. Fix these during implementation — no structural changes to the plan required.
