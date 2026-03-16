## Verdict: ADVISE

The plan is structurally sound and the implementation approach is correct. One gap and one risk worth addressing before execution.

---

### 1. Missing test: `stages` shape on full capture path (GAP)

The plan explicitly defers coverage of `defaultRenderer()` stage output to "production" and relies on the existing fixtures (which return no `stages`) to prove backward compat. That's fine for backward compat. But there is no test that asserts the _new_ behavior: that after this change, `render.stages` is populated with the correct 7 fields on a real full-capture path.

The plan's reasoning -- "Phase 6 will run the full suite" -- means Phase 6 will confirm existing tests still pass, not that the new instrumentation is correct. If the implementation mis-names a field (`navigationDurationMs` instead of `navigationMs`, or `screenshotMs: undefined` due to an off-by-one in the variable declarations), the test suite will not catch it.

**Recommendation**: Add one assertion in `capture.test.js` or a new test that uses a controlled stub renderer that returns `stages`, then asserts the KV record and GET response include `render.stages` with the expected shape. Alternatively, directly unit-test `defaultRenderer()` with a mocked browser session to verify all 7 fields are non-null integers on the full path and `settleMs`/`consentMs` are null on the partial path. This is exactly the kind of new behavior regression that a test suite should protect.

---

### 2. `toEqual` -> `toMatchObject`: risk acknowledged but incomplete mitigation (LOW)

The plan correctly identifies this as a risk and correctly concludes `toMatchObject` is the right call. The mitigation ("OpenAPI spec is the source of truth") is valid reasoning.

One note: `kv.test.js:318` passes an explicit `render` object without `stages` to `completeCapture()`. After this change, the real `defaultRenderer()` will always return `stages`, but this test bypasses the renderer. The test will continue to pass and correctly tests that old KV records (without `stages`) round-trip through the API without losing data. No action needed -- just confirming the plan's backward-compat claim holds.

---

### 3. `consentDurationMs` removal: no test coverage of the removal (MINOR)

The plan removes `consentDurationMs` from `capture.success` log events and replaces it with `consentMs` from the stages spread. There is no test in the suite that asserts `consentDurationMs` appears or does not appear in log events. This means the removal is untested in either direction. This is acceptable given the project is pre-production and the field is renamed not deleted semantically, but worth flagging: if someone adds a test for log event shape later, they should expect `consentMs` not `consentDurationMs`.

---

### Summary

The plan can proceed as written. The ADVISE verdict is for the gap in test coverage of the new `stages` shape. Either add a targeted assertion covering the 7-field shape on the full capture path, or explicitly accept that Phase 6 only validates nothing broke (not that the new instrumentation is correct). If the team accepts that tradeoff knowingly, APPROVE.
