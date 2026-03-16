# Test-Minion Planning Contribution: Stage-Level Timing Instrumentation

## Summary of Current Test State

### Renderer stub landscape

There are **two distinct populations** of renderer stubs:

1. **Shared stubs in `test/fixtures.js`** (5 stubs):
   - `stubRenderer` -- legacy/minimal shape: `{ screenshot, html }`. No `render`, `consent`, `partial`, or `screenshotBefore` fields.
   - `consentNotDetectedRenderer` -- full shape with `render: { waitUntilReached, timedOut, durationMs }` and `consent: { status, cmp, durationMs }`.
   - `dualScreenshotRenderer` -- full shape with consent dismissed.
   - `consentFailedRenderer` -- full shape with consent timeout.
   - `partialRenderer` -- partial capture shape with `render` and `consent: null`.

2. **Local stubs in `capture.test.js`** (3 stubs, lines 574-605):
   - `partialRenderer` -- partial capture (domcontentloaded, timedOut).
   - `partialLoadRenderer` -- partial capture (load, timedOut).
   - `enrichedStubRenderer` -- full capture with render metadata.

### Which test files import from fixtures.js

| File | Imports from fixtures.js |
|------|--------------------------|
| `capture.test.js` | `PNG_BYTES, TEST_HTML, TEST_URL, TEST_IP, stubRenderer` |
| `wacz.test.js` | `PNG_BYTES, TEST_HTML, TEST_URL, TEST_IP, stubRenderer` |
| `verify-html.test.js` | `PNG_BYTES, TEST_HTML, TEST_URL, TEST_IP, stubRenderer` |
| `verify-integration.test.js` | `PNG_BYTES, TEST_HTML, TEST_URL, TEST_IP, stubRenderer` |
| `key-rotation.test.js` | `PNG_BYTES` only |

**Critical finding**: The consent-aware fixture stubs (`consentNotDetectedRenderer`, `dualScreenshotRenderer`, `consentFailedRenderer`, `partialRenderer`) are **defined but never imported** by any test file. They are dead code in fixtures.js. Only `stubRenderer` is actually consumed across files.

### Tests that assert on the `render` object shape

| File | Lines | What it asserts |
|------|-------|-----------------|
| `capture.test.js` | 636-638 | `record.render.waitUntilReached`, `.timedOut`, `.durationMs` (via local `partialRenderer`) |
| `capture.test.js` | 684 | `record.render.waitUntilReached` (via local `partialLoadRenderer`) |
| `capture.test.js` | 751-752 | `record.render.waitUntilReached`, `.timedOut` (via local `enrichedStubRenderer`) |
| `capture.test.js` | 776 | `record.render` is `undefined` (via `stubRenderer` -- legacy compat) |
| `capture-retrieval.test.js` | 137-141 | `body.render` deep-equals `{ waitUntilReached, timedOut, durationMs }` (via hardcoded `PARTIAL_RENDER` constant) |
| `capture-retrieval.test.js` | 182 | `body.render` is `undefined` (legacy record) |
| `kv.test.js` | 318-322 | `record.render` deep-equals `{ waitUntilReached, timedOut, durationMs }` (via hardcoded literal) |
| `kv.test.js` | 336 | `record.render` is `undefined` |

## Risk Analysis

### Risk 1: `toEqual` assertions on render shape (HIGH)

Three locations use strict deep-equality (`toEqual`) on the render object:
- `capture-retrieval.test.js:137` -- `expect(body.render).toEqual({ waitUntilReached, timedOut, durationMs })`
- `kv.test.js:318` -- `expect(record.render).toEqual({ waitUntilReached, timedOut, durationMs })`

If stage-level timing adds new fields to the `render` object (e.g., `stages: { ... }`), these `toEqual` assertions **will break** because `toEqual` performs exact structural matching -- extra properties cause failure.

**Mitigation options (in order of preference)**:
1. **Do not add new fields to the existing `render` object.** Put stage timings in a sibling field (e.g., `render.stages` or a top-level `timings` object). If the new field is nested *inside* `render`, the `toEqual` assertions break.
2. If new fields must go inside `render`, change `toEqual` to `toMatchObject` in the affected assertions. This is a one-line change per assertion and explicitly allows additional properties. However, this weakens the test slightly -- it would no longer catch accidental extra fields.
3. Update all `toEqual` assertions to include the new fields. This couples every test to the new schema from day one.

**Recommendation**: Option 1 is the safest zero-regression path. The `render` object currently has a clean three-field contract (`waitUntilReached`, `timedOut`, `durationMs`). Stage-level timings should either be nested under a new key within `render` (e.g., `render.stages`) or placed as a sibling. But note: if nested under `render`, the `toEqual` checks in `capture-retrieval.test.js` and `kv.test.js` still break because they match the full render object. The safest approach is **a sibling field at the same level as `render`** -- e.g., `timings` or `stageTimings` at the KV record root.

Wait -- re-reading the `toEqual` in `capture-retrieval.test.js`, that test builds its `PARTIAL_RENDER` constant and passes it directly to `completeCapture()`. It never flows through `defaultRenderer`. If stage timings are only added to `defaultRenderer`'s return value and the `performCapture` path, we need to check whether `completeCapture` persists them and whether the retrieval API exposes them.

### Risk 2: `stubRenderer` backward-compat assertion (MEDIUM)

`capture.test.js:776` asserts `record.render` is `undefined` when using `stubRenderer`. This test verifies that legacy renderers (returning only `{ screenshot, html }`) produce records without render metadata. This test **will continue to pass** as long as `stubRenderer` stays unchanged and `performCapture` continues to use `render || null` (line 208 in capture.js).

If the implementation changes `performCapture` to inject timing data from its own measurements (i.e., wrapping the renderer call with timing and populating `render` even when the renderer doesn't return it), this assertion breaks.

**Recommendation**: Keep `stubRenderer` exactly as-is. The legacy backward-compat test at line 776 must continue to pass. If `performCapture` needs to inject its own timing data, it should put that data in a different field (not `render`) so the legacy compat contract is preserved.

### Risk 3: Dead fixture stubs (LOW)

`consentNotDetectedRenderer`, `dualScreenshotRenderer`, `consentFailedRenderer`, and `partialRenderer` in `fixtures.js` are unused. They contain `render` objects with the current three-field shape. If the implementation changes the shape that `defaultRenderer` returns, these stubs will be out of date but nobody will notice because they are not consumed.

**Recommendation**: Either delete them (clean up dead code) or start using them in tests. Do not update them "for consistency" -- updating dead code creates false confidence. If the task scope includes consent-aware tests, import them and write assertions. If not, leave them alone or mark them for backlog cleanup.

### Risk 4: `capture-retrieval.test.js` hardcoded PARTIAL_RENDER constant (MEDIUM)

Line 9-13 defines `PARTIAL_RENDER` with three fields and passes it to `completeCapture()`. The `toEqual` at line 137 then verifies the API response matches. This is a KV-layer test that does not flow through `defaultRenderer` at all. It's asserting the retrieval shape, not the capture shape.

If the retrieval API starts enriching the response with stage timings (computed at retrieval time or passed through from KV), this test needs updating. But if stage timings are added at the capture layer and just persisted as-is through KV and retrieval, this test continues to pass.

**Recommendation**: Stage timings should be captured in `defaultRenderer`, passed through `performCapture` to `completeCapture`, persisted in KV, and served in the retrieval response. The `capture-retrieval.test.js` test manually constructs its KV data, so it won't see stage timings unless the test itself adds them. This is fine for backward-compat -- it proves old records without stage timings still render correctly.

### Risk 5: wacz.test.js, verify-html.test.js, verify-integration.test.js (LOW)

These files use `stubRenderer` but never assert on `render` or timing fields. They test WACZ bundling, HTML verification, and integration verification respectively. They will pass unchanged as long as `stubRenderer` remains unchanged and `performCapture`'s happy path continues to work with the legacy renderer shape.

## Backward-Compatibility Strategy

### Safest approach (zero test regressions)

1. **Keep `stubRenderer` exactly as-is.** It is the legacy contract. 12+ tests across 4 files depend on it.

2. **Do not modify the existing `render` shape** (`{ waitUntilReached, timedOut, durationMs }`). This shape is asserted with `toEqual` in two test files.

3. **Add stage-level timings as new fields** in the `render` object or as a sibling. Two sub-options:
   - **Option A (preferred for zero regressions)**: Add a new top-level field alongside `render` in the KV record (e.g., `stageTimings` or `timings`). No existing test touches this field, so no existing assertion can break.
   - **Option B**: Add a nested field inside `render` (e.g., `render.stages`). This requires changing `toEqual` to `toMatchObject` at 2 locations (`capture-retrieval.test.js:137`, `kv.test.js:318`) or updating the expected object. This is a minor but non-zero change to existing tests.

4. **Test new timing fields via new stubs or new assertions**, not by modifying existing stubs or assertions.

5. **`completeCapture` signature**: Currently `completeCapture(kv, captureId, artifacts, wacz, renderQuality, render, captureSettings)`. If a new top-level field is added, the signature needs a new parameter. If stage timings are nested inside `render`, no signature change is needed (the object just has more keys). Consider passing an options object if the parameter list is getting unwieldy (8+ positional params is a code smell).

### Testing plan for new timing data

**New stubs needed** (define in `capture.test.js` locally, or add to `fixtures.js` if multiple files need them):
- A renderer returning `render` with stage timings included (whatever the chosen shape is).
- A renderer returning `render` *without* stage timings (to test backward-compat with renderers that don't provide them).

**New assertions needed**:
- In `capture.test.js`: verify stage timing data flows from renderer return value through to KV record.
- In `capture-retrieval.test.js`: verify stage timing data appears in API response (new test case, not modification of existing).
- In `kv.test.js`: verify `completeCapture` persists stage timing data correctly (new test case).

**Assertions that must NOT change**:
- `capture.test.js:776` -- `record.render` is `undefined` for `stubRenderer`.
- `capture-retrieval.test.js:137` -- `toEqual` on three-field render (unless Option B is chosen and this is updated to `toMatchObject`).
- `capture-retrieval.test.js:182` -- `record.render` is `undefined` for legacy.
- `kv.test.js:318` -- `toEqual` on three-field render (same caveat as above).
- `kv.test.js:336` -- `record.render` is `undefined`.

## Dependencies

- The implementation choice of where to put stage timings (inside `render` vs. sibling field) determines whether existing `toEqual` assertions need to become `toMatchObject`. This is a design decision that should be made before writing tests.
- If `completeCapture` gets a new parameter, `kv.test.js` tests of `completeCapture` may need new test cases but existing calls should continue to work via default parameter values.
- The `capture-retrieval.test.js` tests construct KV data manually (not via `performCapture`), so they are isolated from renderer changes but need updating if the retrieval API shape changes.

## Recommendation Summary

| Decision | Recommendation | Rationale |
|----------|---------------|-----------|
| Modify `stubRenderer`? | **No** | Used by 12+ tests across 4 files; changing it risks cascading failures |
| Modify existing fixture stubs? | **No** | Dead code (unused); modifying them provides no value |
| Where to put stage timings? | **Sibling field to `render`** (Option A) | Zero existing `toEqual` assertions break |
| How to test new fields? | **New test cases + new stubs** | Additive changes only; no existing test modifications |
| Clean up dead fixture stubs? | **Defer to backlog** | Orthogonal to this task; don't mix cleanup with feature work |
| Change `toEqual` to `toMatchObject`? | **Only if Option B is chosen** | Prefer Option A to avoid even this minor change |
