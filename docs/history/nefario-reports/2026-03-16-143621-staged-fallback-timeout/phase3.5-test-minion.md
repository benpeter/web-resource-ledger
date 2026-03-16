ADVISE

---

[testing]: `stubRenderer` backward-compat regression is under-specified
SCOPE: test/capture.test.js -- existing stubRenderer shape
CHANGE: The existing `stubRenderer` returns `{ screenshot, html }` (no `partial`, no `render`). After Task 1, `performCapture` will call `const { partial, render } = renderResult.value` on that return value. Both will be `undefined`. The tests that use the old `stubRenderer` verify `status === 'complete'` but do not assert what gets written to `renderQuality` or `render` in the KV record. If `performCapture` writes `renderQuality: undefined` into KV (because `partial` is falsy but `renderQuality = partial ? 'partial' : 'full'` still evaluates to `'full'`) the existing success tests pass accidentally. But if the implementation does `renderQuality = partial ? 'partial' : 'full'` and `partial` is `undefined`, the result is `'full'` -- correct -- but should be verified explicitly, not silently. Add one assertion in the existing "transitions KV status to complete" test or a new test: `expect(record.renderQuality).toBe('full')` with the old `stubRenderer`. This catches any regression where the defaulting logic breaks for legacy renderer shapes.
WHY: The plan explicitly says pre-existing KV records default via `record.renderQuality ?? 'full'` at the API layer, but the path where a legacy renderer (no `partial` field) runs through the new `performCapture` code is untested. These are different code paths and the distinction matters.
TASK: Add to the existing "successful capture" describe block: `it('defaults renderQuality to full when renderer omits partial field')` using the existing `stubRenderer`.

---

[testing]: `categorizeError` ordering conflict with existing `TimeoutError` case
SCOPE: test/capture.test.js -- performCapture Playwright-specific errors
CHANGE: The synthesis adds `'Deadline exceeded'` as the FIRST check in `categorizeError`, before the existing `TimeoutError` check. The existing test "handles Playwright TimeoutError (name-based detection)" throws an error with `name === 'TimeoutError'` AND a message that does NOT contain 'Deadline exceeded'. The new 'Deadline exceeded' check runs first but won't match -- that test should still pass. However, there is no test verifying the ordering doesn't cause a partial-path deadline error to be mis-categorized if someone later adds a message containing both 'Deadline exceeded' and 'Timeout'. More importantly: the existing timeout test uses `err.name = 'TimeoutError'` but NOT the 'Deadline exceeded' message path. The test plan adds a renderer that throws `new Error('Deadline exceeded before partial capture could complete')` -- this is a plain Error, not a TimeoutError by name. Verify the new categorizeError test explicitly checks that the resulting error message is `'Page did not finish loading within 25 seconds'` (not a leak of the internal 'Deadline exceeded' string).
WHY: The 'Deadline exceeded' message is an internal implementation detail. If it leaks into the API response error field, that's an information disclosure. The test plan specifies the right assertion but it should be called out explicitly.
TASK: In the "deadline exceeded in renderer -> KV failed" test, assert `record.error === 'Page did not finish loading within 25 seconds'` (not `record.error.includes('Deadline exceeded')`). This is what the plan already specifies -- just make sure the implementation doesn't accidentally pass the raw message through.

---

[testing]: `verify-integration.test.js` -- existing `stubRenderer` shape conflict
SCOPE: test/verify-integration.test.js -- beforeEach setup
CHANGE: The `beforeEach` in `verify-integration.test.js` calls `performCapture` with the existing `stubRenderer` (returns `{ screenshot, html }`, no `partial` field). After Task 1, `performCapture` will try to build WACZ from the render result. If it reads `partial` as `undefined` (falsy) and proceeds with WACZ bundling, the test should still work. But the new `verify 404 for captures without WACZ` test seeds a record via `completeCapture` directly (not via `performCapture`), bypassing the renderer entirely -- that's fine. The risk is that the existing verify happy-path tests may break if `performCapture` with a legacy renderer shape changes behavior around WACZ. Confirm the existing `stubRenderer` in `verify-integration.test.js` doesn't need updating to the enriched shape after Task 1 ships.
WHY: The verify integration tests run a real `performCapture` in beforeEach. If the WACZ path now behaves differently with the old renderer shape, all existing verify tests break simultaneously.
TASK: Either update `verify-integration.test.js`'s local `stubRenderer` to the enriched shape (add `partial: false, render: { ... }`) OR verify that `performCapture` gracefully handles old renderer shapes. This should be confirmed by the test-minion when reading the Task 1 implementation -- it's a pre-condition for writing valid tests.

---

[testing]: Missing test: `render` field is absent in API response for old KV records
SCOPE: test/capture-retrieval.test.js
CHANGE: The plan tests that `renderQuality` defaults to `'full'` for old records lacking the field. But it does not test that the `render` field is ABSENT from the response for those same old records. The implementation uses `if (record.render) { body.render = record.render; }` -- so absence is the correct behavior. The test plan has `it('GET /v1/captures/:id defaults renderQuality to full for old records')` but doesn't include `expect(body.render).toBeUndefined()` as part of that assertion. Add that assertion, or make it a separate test.
WHY: Omitting the `render` field for old records is a contract guarantee. If it starts appearing as `null` or `{}` due to an implementation bug, consumers will break on `render.waitUntilReached` being undefined. The absence must be explicitly verified.
TASK: In the "defaults renderQuality to full for old records" test, add `expect(body.render).toBeUndefined()`.

---

[testing]: 15 scenarios are sufficient; renderer stub approach is sound
SCOPE: Overall test architecture
CHANGE: No change needed. The stub renderer approach correctly tests all the `performCapture` orchestration logic without requiring a real browser. The partial path is fully exercised via `partialRenderer` and `partialLoadRenderer`. The `enrichedStubRenderer` correctly validates the full-path enrichment. The KV tests are appropriately isolated. The API retrieval tests seed KV directly, which is the right pattern. No E2E browser tests are needed here -- the integration between Playwright and the partial path is a deployment concern, not a unit/integration test concern.
WHY: N/A -- this is the APPROVE signal for the core approach.
TASK: None for the architecture. The 4 ADVISE items above are targeted additions, not architectural concerns.
