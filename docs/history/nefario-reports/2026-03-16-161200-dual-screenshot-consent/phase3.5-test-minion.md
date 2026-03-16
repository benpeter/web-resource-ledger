# Test-Minion Review: dual-screenshot-consent

## Verdict: ADVISE

The plan is well-structured and the fixture extraction approach (Task 4) is sound. One specific concern and two minor observations.

---

## Concern: `consentFailedRenderer` stub does not match the spec

In Task 4's fixture definitions, `consentFailedRenderer` returns:

```js
consent: { status: 'timeout', cmp: null, durationMs: 8000 }
```

But the Task 1 spec says a `timeout` result with `popupFound: false` means no second screenshot should be taken, and the `captureSettings` should map `timeout` to result `'failed'` (not `'notDetected'`). The ambiguity is that a bare `timeout` status without `popupFound` context is underspecified. The stub for "consent detected but dismissal failed" should probably be `status: 'timeout'` with sufficient metadata to drive the `performCapture` branching -- but the `dismissCookieConsent()` return shape in Task 1 uses `{ status: 'timeout', cmpDetected: true, popupFound: false }`, which differs from the fixture's `{ status: 'timeout', cmp: null }`.

Phase 6 tests will be written against these stubs. If the stubs don't match what `dismissCookieConsent()` actually returns, the tests will be testing behavior that never exists in production. **Task 4 should align `consentFailedRenderer` with the actual return shape from Task 1 before Phase 6 tests are written.** This is a coordination risk between Task 1 and Task 4, not a blocker for execution -- but the agent running Task 4 should read Task 1's consent return shape carefully before defining the stub.

---

## Observation: WARC URI change breaks one existing test assertion

`test/wacz.test.js` line 337 has:

```js
expect(toSurt('urn:wrl:screenshot:https://example.com')).toBe('urn:wrl:screenshot:https://example.com');
```

After Task 2, the WARC records will use `urn:wrl:screenshot:before:{url}` and `urn:wrl:screenshot:after:{url}`. The CDXJ SURT transform test itself is not broken (it tests a different URI), but it is testing the old URI scheme. Phase 6 should add a corresponding SURT passthrough test for `urn:wrl:screenshot:before:` and `urn:wrl:screenshot:after:` URIs. Minor -- existing test is not broken, but the coverage gap should be noted.

---

## Observation: `buildWacz` graceful degradation test will need updating

`test/wacz.test.js` line 261:

```js
const result = await buildWacz(
  TEST_URL,
  new Date().toISOString(),
  { screenshot: PNG_BYTES, html: TEST_HTML, headers: null },
  {},
);
```

After Task 2 changes `buildWacz` to accept `{ screenshotBefore, screenshotAfter, html, headers, captureSettings }`, this call will pass the old shape. The test may still pass if the function is permissive, but it is testing with a malformed artifact argument. Task 4 does not include this file in its update scope for shape changes (only for fixture import refactoring), and Task 2 says "do not modify test files." This creates a gap: neither Task 2 nor Task 4 is explicitly responsible for fixing the `buildWacz` direct call in `wacz.test.js` that passes the old artifact shape. Phase 6 should own this fix.

---

## Summary

The plan is executable. The fixture design is the right approach -- four clearly differentiated stubs covering all branches. The `consentFailedRenderer` shape mismatch is the main risk to Phase 6 test quality and should be resolved by having the Task 4 agent explicitly reference the `dismissCookieConsent()` return shape from Task 1 before finalizing the stub. Everything else is Phase 6 cleanup.
