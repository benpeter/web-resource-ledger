# Domain Plan Contribution: test-minion

## Recommendations

### (a) Renderer Interface: Explicit Partial Signaling

The renderer should return an extended shape for partial captures. The current contract is clean:

- **Success**: returns `{ screenshot, html }`
- **Failure**: throws

The partial capture path introduces a third outcome. The cleanest approach: **the renderer always returns an object, with an optional `partial` flag and `render` metadata for partial captures**. The performCapture orchestrator inspects the return value and routes accordingly.

Proposed renderer return shapes:

```js
// Full capture (unchanged)
{ screenshot, html }

// Partial capture (new)
{ screenshot, html, partial: true, render: { waitUntilReached: 'domcontentloaded', timedOut: true, durationMs: 25000 } }
```

This works cleanly with the existing test infrastructure because:

1. **Stub renderers are plain async functions**. The existing `stubRenderer = async () => ({ screenshot, html })` pattern extends trivially to `partialRenderer = async () => ({ screenshot, html, partial: true, render: { ... } })`.
2. **No mock framework needed**. Stubs are just functions returning objects -- no vitest mocking API, no spy infrastructure.
3. **performCapture already destructures `renderResult.value`** (line 110 of capture.js). Adding a check for `renderResult.value.partial` is a one-line conditional.
4. **The `categorizeError` function is NOT called for partial captures** -- the timeout is caught internally by the renderer, so it returns instead of throwing. This means existing timeout error tests remain valid for the case where DOMContentLoaded has NOT fired (renderer still throws).

**Important design constraint**: The renderer must NOT return `partial: true` with `screenshot` or `html` set to null/undefined. If the partial capture fails to get either artifact, the renderer should throw (same as today). This keeps the "partial" path clean: if you get `partial: true`, both artifacts are guaranteed present. The performCapture orchestrator does not need to handle "partial but screenshot missing".

### (b) Partial Timeout Test Fixture Shape

Three new stub renderers are needed:

```js
// 1. Partial capture -- timeout but DOMContentLoaded passed
const partialRenderer = async () => ({
  screenshot: PNG_BYTES,
  html: TEST_HTML,
  partial: true,
  render: {
    waitUntilReached: 'domcontentloaded',
    timedOut: true,
    durationMs: 25000,
  },
});

// 2. Partial capture -- screenshot fails after timeout
// (renderer catches timeout, checks readyState OK, but screenshot() times out)
// This should still throw -- the renderer only returns partial if BOTH artifacts captured
const partialScreenshotFailRenderer = async () => {
  throw new Error('page.screenshot: Timeout 1500ms exceeded');
};

// 3. Partial capture -- html extraction fails after timeout
const partialHtmlFailRenderer = async () => {
  throw new Error('page.content: Timeout 1500ms exceeded');
};
```

Note: Renderers 2 and 3 are identical in outcome to existing error renderers (they throw), but with *different error messages*. This tests that `categorizeError` correctly handles these sub-timeout errors. They should still be categorized as timeout errors (retryable) since the root cause is the same navigation timeout.

### (c) Essential Test Scenarios

Organized by test concern, with priority:

**P0 -- Core partial capture flow (test/capture.test.js)**:

1. **Timeout + DOMContentLoaded passed -> partial capture success**: `partialRenderer` returns extended shape, KV record has `status: 'complete'` and `renderQuality: 'partial'`.
2. **Partial capture writes R2 artifacts**: screenshot.png and rendered.html are written to R2 (same as full capture).
3. **Partial capture KV record shape**: Record has `renderQuality: 'partial'`, `render.waitUntilReached`, `render.timedOut`, `render.durationMs`.
4. **Partial capture skips WACZ**: No .wacz object written to R2. KV record has no `wacz` field.
5. **Full capture regression**: existing `stubRenderer` still produces `renderQuality: 'full'` (or undefined -- depends on design choice; see risk below).
6. **Timeout + DOMContentLoaded NOT passed -> still fails**: Existing `timeoutRenderer` (throws TimeoutError) still produces `status: 'failed'`. This is a regression test -- the existing test covers this, but should be explicitly kept.

**P0 -- Error path regressions (test/capture.test.js)**:

7. **Partial screenshot timeout -> fails**: Renderer throws during screenshot after nav timeout. Record is `failed`, error message is user-safe.
8. **Partial HTML timeout -> fails**: Renderer throws during content extraction after nav timeout. Record is `failed`.
9. **categorizeError handles partial-path sub-errors**: The `page.screenshot: Timeout` and `page.content: Timeout` messages should map to a user-safe message. These are NEW error patterns not in the current `categorizeError`.

**P1 -- API surface (test files per endpoint)**:

10. **GET /v1/captures/:id with partial capture**: Response includes `renderQuality: 'partial'` and `render` metadata. No `wacz` or `verifyUrl` fields (WACZ skipped).
11. **GET /v1/captures (list) with partial capture**: `CaptureSummary` includes `renderQuality: 'partial'` for partial captures.
12. **GET /v1/verify/:id with partial capture**: Returns 404 (no WACZ to verify). This is a regression test -- existing logic already returns 404 for captures without WACZ.
13. **GET /v1/captures/:id/artifacts with partial capture**: screenshot and html artifacts are accessible. wacz returns 404.

**P1 -- Verification page (test/verify-page.test.js)**:

14. **Verify page "Capture note" for partial**: The HTML page should contain informational text when `renderQuality === 'partial'`. Since the verify endpoint returns 404 for partial captures (no WACZ), this scenario actually does not apply to the verify *endpoint*. HOWEVER, if the verify page fetches both `/v1/verify/:id` (which 404s) and `/v1/captures/:id` (which returns partial), the JS client-side code handles it. This needs clarification -- is the "Capture note" on the verify page or on the capture detail page? If the verify endpoint 404s, the verify page cannot show anything useful for partial captures. The note may only appear on the `GET /v1/captures/:id` response or on the capture detail view.

**P2 -- WACZ enrichment for full captures (test/wacz.test.js)**:

15. **Full capture WACZ includes captureQuality**: `datapackage.json` contains `captureQuality: 'full'`. This is additive metadata, not functional -- test that it round-trips correctly.

### (d) New Test File vs. Extending Existing

**Extend `test/capture.test.js` with a new `describe` block.** Do NOT create a new file. Reasons:

1. **capture.test.js is 575 lines** -- this is moderate, not oversized. Adding ~100 lines for partial capture tests brings it to ~675 lines, which is still manageable.
2. **Shared fixtures**: The new tests reuse `PNG_BYTES`, `TEST_HTML`, `TEST_ID`, `mockHeaderFetch`, KV/R2 cleanup, and fetchMock lifecycle. Duplicating these in a new file adds maintenance cost.
3. **Conceptual cohesion**: Partial capture is a new code path in `performCapture`, the same function tested by capture.test.js. Keeping all `performCapture` tests together makes it easy to see the full behavioral specification.
4. **The existing `describe('performCapture -- renderer failure: timeout')` block is the natural neighbor** for the new `describe('performCapture -- partial capture (timeout with DOMContentLoaded)')` block.

For the API surface tests:
- **test/capture-retrieval.test.js**: Add a section for partial capture GET response shape.
- **test/list-captures.test.js**: Add a test for `renderQuality` in list response.
- **test/wacz.test.js**: Add one test for `captureQuality` in datapackage.json.
- **test/verify-integration.test.js**: Add one test confirming 404 for partial capture verify.

## Proposed Tasks

### Task 1: Define partial renderer stubs and capture.test.js tests

**What**: Add new `describe` blocks to `test/capture.test.js` with partial capture test scenarios (items 1-9 above).

**Deliverables**:
- New stub renderers: `partialRenderer`, `partialScreenshotFailRenderer`, `partialHtmlFailRenderer`
- `describe('performCapture -- partial capture (timeout with DOMContentLoaded)')` block with tests for:
  - KV status is `complete` with `renderQuality: 'partial'`
  - R2 artifacts written (screenshot.png, rendered.html)
  - `render` metadata in KV record
  - No WACZ written
  - Header fetch still runs (headers.json may still exist)
- `describe('performCapture -- partial capture failure paths')` block with tests for:
  - Sub-timeout screenshot failure -> failed
  - Sub-timeout html failure -> failed
  - Error messages are user-safe
- Regression assertion: existing timeout test (throws) still produces `failed`

**Dependencies**: Requires the `performCapture` implementation to accept the new renderer return shape. Implementation and test can be developed together.

### Task 2: KV layer extension for renderQuality and render metadata

**What**: Extend `completeCapture()` in `src/kv.js` to accept optional `renderQuality` and `render` parameters. Add corresponding tests to `test/kv.test.js`.

**Deliverables**:
- Updated `completeCapture()` signature
- New tests in `test/kv.test.js`:
  - `completeCapture` with `renderQuality: 'partial'` stores in record
  - `completeCapture` with `render` metadata stores in record
  - `completeCapture` without renderQuality (backward compat) works unchanged
- The KV layer is pure data -- no business logic about what "partial" means

**Dependencies**: None (KV layer is independent).

### Task 3: API surface tests for partial capture

**What**: Add tests to endpoint test files for the new fields.

**Deliverables**:
- `test/capture-retrieval.test.js`: New test for `GET /v1/captures/:id` with a partial capture seeded via KV. Verify `renderQuality: 'partial'`, `render` metadata present, no `wacz`/`verifyUrl`.
- `test/list-captures.test.js`: New test for `GET /v1/captures` with partial capture. Verify `renderQuality` appears in `CaptureSummary`.
- `test/verify-integration.test.js`: New test confirming `GET /v1/verify/:id` returns 404 for partial capture (no WACZ).
- `test/capture-retrieval.test.js`: Test that partial capture artifacts (screenshot, html) are accessible, wacz returns 404.

**Dependencies**: Requires API handler changes in `src/index.js` to surface `renderQuality` and `render`.

### Task 4: WACZ captureQuality test

**What**: Add test to `test/wacz.test.js` verifying that full captures include `captureQuality: 'full'` in datapackage.json.

**Deliverables**:
- One test: after capture with `stubRenderer`, unzip WACZ, parse datapackage.json, assert `captureQuality === 'full'`.

**Dependencies**: Requires `src/wacz.js` to add `captureQuality` field to datapackage.json.

### Task 5: categorizeError extension

**What**: Update `categorizeError` in `src/capture.js` to handle partial-path sub-errors (`page.screenshot: Timeout`, `page.content: Timeout`). Add tests in `test/capture.test.js`.

**Deliverables**:
- Tests for new error message patterns (screenshot sub-timeout, content sub-timeout)
- These errors should map to user-safe messages and be retryable (the root cause is page load timeout)
- Note: This task may not be needed if partial-path sub-errors are caught inside the renderer itself and re-thrown as TimeoutError. Depends on implementation decision in the renderer.

**Dependencies**: Depends on renderer implementation design.

## Risks and Concerns

### Risk 1: renderQuality on full captures -- implicit vs. explicit

The current plan says partial captures get `renderQuality: 'partial'`. But what about full captures? Two options:

- **Option A (explicit)**: Full captures get `renderQuality: 'full'`. Every capture has this field.
- **Option B (implicit)**: Full captures have no `renderQuality` field. Absence means full.

Option A is better for API consumers (no null-check dance) but requires a migration decision: do existing captures (pre-feature) retroactively get `renderQuality: 'full'`? If not, consumers still need to handle absence for old captures.

**Recommendation**: Option B (absence = full) for now. It's backward-compatible, requires no migration, and the field is purely informational. Document in the schema: `renderQuality` is present only for partial captures. Old captures and full captures have no `renderQuality` field.

### Risk 2: Verify page "Capture note" is unreachable

The verify endpoint (`GET /v1/verify/:id`) returns 404 for captures without WACZ. Partial captures skip WACZ. Therefore the verify page never loads for partial captures. The "Capture note" on the verify page is dead code.

If the intent is to show a note somewhere, it should be on the `GET /v1/captures/:id` response (which the verify page's JS also fetches as `retrievalData`). But the verify page itself won't render because the verify API call fails.

**Recommendation**: Clarify whether the "Capture note" belongs on:
(a) The capture retrieval response (as `render.note` field) -- consumers display it however they want
(b) The verify page HTML template -- which only renders for captures WITH WACZ, making it useless for partial captures
(c) Both -- with the verify page showing it only when the retrieval response includes it

Option (a) is sufficient and correctly scoped.

### Risk 3: Partial-path renderer sub-errors vs. categorizeError

When the renderer catches a navigation timeout and tries `page.screenshot()` with a 1.5s timeout, two outcomes:
1. Screenshot succeeds -> partial capture returned
2. Screenshot fails with its own timeout -> renderer throws

If the renderer throws after catching the nav timeout, the error message will be different (`page.screenshot: Timeout 1500ms exceeded` vs. `Navigation timeout of 25000 ms exceeded`). The current `categorizeError` handles the navigation timeout pattern but not the screenshot sub-timeout pattern.

**Recommendation**: The renderer should catch screenshot/content sub-timeouts and throw a fresh error that `categorizeError` already handles. Simplest approach: if screenshot or content extraction fails on the partial path, throw `new Error('Navigation timeout of 25000 ms exceeded')` -- same error as the original timeout. This way `categorizeError` needs no changes for the partial failure case. Alternatively, add a new pattern to `categorizeError`, but this is unnecessary complexity.

### Risk 4: Test timing -- no real waits needed

The planning question asks about testing the 28s deadline without waiting 28s. This is a non-issue with the injectable renderer pattern. The stub renderers return immediately -- they don't actually navigate pages or wait for timeouts. The `durationMs: 25000` in the partial renderer's return value is just test data, not an actual measured duration. The real deadline enforcement happens inside `defaultRenderer()` which is never called in tests (it's the default parameter, overridden by stubs).

No special handling needed. Tests will run in milliseconds.

### Risk 5: KV record shape backward compatibility

Existing code checks `record.status !== 'complete'` in handlers (handleGetCapture, handleGetCaptureArtifact, handleVerifyCapture). Partial captures also have `status: 'complete'`, so they pass through these gates. This is correct and intentional. But:

- `handleGetCapture` needs to surface `renderQuality` and `render` in the response body.
- `handleGetCaptureArtifact` needs no changes (artifacts exist regardless of quality).
- `handleVerifyCapture` already checks `!record.wacz` and returns 404 -- partial captures have no WACZ, so they correctly 404.

No backward-compatibility breaks, but the handler changes must be tested explicitly.

## Additional Agents Needed

None. The current team (iac-minion for capture pipeline, api-spec-minion for schema, test-minion for test strategy) covers all planning concerns. Security, UX, and docs specialists were already consulted in the advisory phase and participate at review gates.
