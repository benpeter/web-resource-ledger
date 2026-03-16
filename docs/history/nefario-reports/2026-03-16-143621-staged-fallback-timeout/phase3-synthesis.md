# Phase 3: Synthesis -- Staged Fallback for Capture Timeout

## Delegation Plan

**Team name**: staged-fallback-timeout
**Description**: Implement partial capture on navigation timeout -- catch TimeoutError, check DOMContentLoaded, capture screenshot + HTML from partially-rendered page, skip WACZ, mark as renderQuality: 'partial'.

---

## Conflict Resolutions

### 1. RenderInfo fields: 6 vs 3

**iac-minion** proposes 6 fields: `waitUntilReached`, `waitUntilTarget`, `timedOut`, `durationMs`, `screenshotMs`, `contentMs`.

**api-spec-minion** proposes 3 fields: `waitUntilReached`, `timedOut`, `durationMs`. Drops `waitUntilTarget` (always `'networkidle'`, YAGNI), `screenshotMs` and `contentMs` (internal operational metrics, not consumer-facing).

**Resolution: 3 fields in the API schema, operational timings in logs only.** api-spec-minion is correct per YAGNI and Helix Manifesto. `waitUntilTarget` carries zero information (always networkidle). `screenshotMs` and `contentMs` are operational telemetry -- they belong in the Coralogix `capture.partial` log event, not in the KV record or API response. Consumers need to know *what happened* (waitUntilReached, timedOut, durationMs); operators need to know *how long each step took* (screenshotMs, contentMs, budgetRemainingMs) -- different audiences, different data stores.

The renderer still computes `screenshotMs` and `contentMs` internally for the log event, but these are NOT returned in the renderer result or stored in KV. The `render` metadata in the renderer return shape is: `{ waitUntilReached, timedOut, durationMs }`.

### 2. renderQuality on full captures: explicit vs implicit

**api-spec-minion** says: make `renderQuality` required on `CaptureRecord`, default absent to `'full'` at the API layer.

**test-minion** says: option B (absence = full) is simpler, no migration.

**Resolution: Follow api-spec-minion -- explicit at the API layer, implicit in KV.** The KV layer stores `renderQuality` only for partial captures (no migration, no backfill). The API handlers default `record.renderQuality ?? 'full'` when building responses. This gives consumers a guaranteed field while keeping KV lean. Full captures from `performCapture` will also explicitly write `renderQuality: 'full'` and `render` metadata going forward, but pre-existing records lack these fields and the API layer handles that gracefully.

### 3. Verify page "Capture note" for partial captures

**test-minion** and **api-spec-minion** both flag: partial captures have no WACZ, so `/v1/verify/:id` returns 404, making any verify-page note unreachable for partials.

**Resolution: Skip the "Capture note" entirely for now.** It is dead code -- partial captures 404 at the verify endpoint, so the verify page never renders for them. Adding dead code violates YAGNI. When R16 (Queues) lands and partial captures gain WACZ, the note can be added at that point. The verify endpoint description update (documenting the 404 behavior for captures without WACZ) is sufficient.

### 4. categorizeError for partial-path sub-errors

**iac-minion** proposes adding cases for `'Deadline exceeded'` and `'Content extraction timeout'`.

**test-minion** suggests the renderer could re-throw the original timeout error message to avoid categorizeError changes.

**Resolution: Add a single new categorizeError case for 'Deadline exceeded'.** The partial capture path has two failure modes: (a) deadline exceeded before operations complete, and (b) individual operation timeout (screenshot/content). For (b), the renderer wraps these in a generic `'Deadline exceeded before partial capture could complete'` throw, which contains the word 'Deadline'. One new pattern in categorizeError catches both. Map to `retryable: true` with the existing timeout message since the root cause is page load timeout. The `'Content extraction timeout'` error from `Promise.race` is caught inside the renderer's catch block and re-thrown as the deadline error -- it never reaches categorizeError directly.

### 5. Renderer deadline computation

**iac-minion** recommends computing deadline inside `defaultRenderer` using `Date.now()` at renderer entry, set to `rendererStart + 27000`.

**Resolution: Accepted.** This avoids changing the renderer signature, keeps the API clean for testing, and the ~500ms difference between performCapture start and renderer start is well within the 2s margin. The renderer computes its own deadline internally.

---

## Risks and Mitigations

1. **Tall-page screenshot budget (Medium)** -- Screenshots at MAX_PAGE_HEIGHT (8000px) can take 2-3s. Mitigated by 3s screenshot timeout + deadline check after screenshot. If exceeded, capture fails to existing error path. No regression from current behavior. *Not* reducing MAX_PAGE_HEIGHT on partial path (YAGNI -- optimize if telemetry shows need).

2. **Context cleanup racing 30s wall clock (Medium)** -- If partial capture consumes nearly all budget, `context.close()` may race the isolate kill. Mitigated by existing orphan cleanup at renderer start + 2s deadline margin (28s, not 30s).

3. **Verify endpoint 404 for partial captures (Low)** -- Consumers checking `status === 'complete'` then calling verify get 404. Documented in spec. Acceptable trade-off; alternative (fake verification) would be misleading.

4. **Pre-existing KV records lack renderQuality (Low)** -- Handled by `record.renderQuality ?? 'full'` defaulting in API handlers. No migration needed.

5. **page.evaluate() hanging after TimeoutError (Low-Medium)** -- readyState check after navigation timeout may hang on blocked main thread. Mitigated by `.catch(() => 'unknown')` fallback; if readyState can't be determined, partial capture doesn't proceed.

---

### Task 1: Core implementation -- renderer partial path, performCapture orchestration, KV extension, API handlers, OpenAPI spec
- **Agent**: iac-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |
    Implement staged fallback for capture timeout (partial captures) in the WRL
    worker. This is a well-scoped feature: catch navigation TimeoutError, check
    DOMContentLoaded, capture what we can, mark as partial. You will modify 4 source
    files and 1 spec file.

    ## Working Directory

    `/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario/staged-fallback-timeout`

    ## Context

    GitHub issue #53. Heavy pages never reach `networkidle` within the 25s
    NAV_TIMEOUT_MS and fail entirely. The 30s ctx.waitUntil hard limit means we
    have ~5s of budget after timeout fires.

    ## What to Do

    ### 1. `src/capture.js` -- defaultRenderer partial capture path

    Add two new constants at the top with the existing constants:
    ```js
    const PARTIAL_SCREENSHOT_TIMEOUT_MS = 3000;
    const PARTIAL_CONTENT_TIMEOUT_MS = 1000;
    ```

    In `defaultRenderer()`, wrap the `page.goto()` call in try/catch. On
    `TimeoutError` (check `navError.name === 'TimeoutError'`):

    a. Check readyState: `const readyState = await page.evaluate(() => document.readyState).catch(() => 'unknown');`
       If readyState is NOT `'interactive'` and NOT `'complete'`, re-throw `navError`.

    b. Compute deadline: `const deadline = Date.now() + 2000;` (the renderer has been running ~25.5s already; 2000ms leaves margin for post-renderer KV/R2 work).

    c. Define helper: `const remainingMs = () => Math.max(0, deadline - Date.now());`

    d. Cap viewport for tall pages (same logic as the full path -- check scrollHeight > MAX_PAGE_HEIGHT).

    e. Check `if (remainingMs() < 500) throw new Error('Deadline exceeded before partial capture could complete');`

    f. Take screenshot with timeout: `page.screenshot({ fullPage: true, type: 'png', timeout: PARTIAL_SCREENSHOT_TIMEOUT_MS })`
       Record `screenshotMs` timing for the log (but do NOT include it in the return value).

    g. Check deadline again.

    h. Extract HTML with Promise.race timeout:
    ```js
    const html = await Promise.race([
      page.content(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Deadline exceeded before partial capture could complete')), PARTIAL_CONTENT_TIMEOUT_MS)),
    ]);
    ```
       Record `contentMs` timing for the log.

    i. Compute `navDurationMs = Date.now() - renderStart` where `renderStart` is
       a `Date.now()` call at the beginning of `defaultRenderer`.

    j. Return:
    ```js
    {
      screenshot,
      html,
      partial: true,
      render: {
        waitUntilReached: readyState === 'complete' ? 'load' : 'domcontentloaded',
        timedOut: true,
        durationMs: navDurationMs,
      },
    }
    ```

    k. For the FULL capture path (existing happy path, after `page.goto` succeeds):
       Add a `renderStart` timing at the top of the function. Return the enriched shape:
    ```js
    {
      screenshot,
      html,
      partial: false,
      render: {
        waitUntilReached: 'networkidle',
        timedOut: false,
        durationMs: Date.now() - renderStart,
      },
    }
    ```

    IMPORTANT: Any error thrown on the partial path (deadline exceeded, screenshot timeout,
    content timeout) should use the message `'Deadline exceeded before partial capture could complete'`.
    This keeps categorizeError simple.

    ### 2. `src/capture.js` -- performCapture orchestration changes

    After the existing destructure at line 110 (`const { screenshot, html } = renderResult.value;`):

    a. Extract partial info: `const { partial, render } = renderResult.value;`

    b. Determine renderQuality: `const renderQuality = partial ? 'partial' : 'full';`

    c. After R2 artifact storage (the `Promise.all` block), conditionally skip WACZ:
       - If `partial` is truthy, skip the entire WACZ bundling block. Jump straight to completeCapture.
       - If not partial, run WACZ bundling as before.
       Use a simple `if (!partial) { ... existing WACZ block ... }`.

    d. Pass renderQuality and render metadata to completeCapture:
       `await completeCapture(env.KV, captureId, artifacts, waczInfo, renderQuality, render || null);`

    e. Update the success log event:
       - For partial captures: log `event: 'capture.partial'` at severity 3 with these fields:
         `captureId, tenantId, cip, renderQuality, durationMs: Date.now() - start, waczStatus: 'skipped'`
       - For full captures: keep existing `capture.success` log, add `renderQuality: 'full'` to payload.

    f. Do NOT check `limitExceeded` on the partial path (it is unreachable -- the timeout
       catch fires before line 347). Just document this with a comment.

    ### 3. `src/capture.js` -- categorizeError

    Add one new case BEFORE the existing timeout check:
    ```js
    if (msg.includes('Deadline exceeded')) {
      return { message: 'Page did not finish loading within 25 seconds', retryable: true };
    }
    ```
    This handles partial-path failures (deadline exceeded, content extraction timeout).
    Place it as the FIRST check in categorizeError, before the TimeoutError check.

    ### 4. `src/kv.js` -- completeCapture extension

    Extend the signature to accept optional renderQuality and render:
    ```js
    export async function completeCapture(kv, captureId, artifacts, wacz = null, renderQuality = null, render = null) {
    ```

    In the value object construction, spread the new fields:
    ```js
    const value = {
      ...existing,
      status: 'complete',
      completedAt: new Date().toISOString(),
      artifacts,
      ...(wacz ? { wacz } : {}),
      ...(renderQuality ? { renderQuality } : {}),
      ...(render ? { render } : {}),
    };
    ```

    Update the JSDoc to document the new parameters.

    ### 5. `src/index.js` -- API handler updates

    **handleGetCapture**: Add `renderQuality` and `render` to the response body:
    ```js
    const body = {
      id: record.captureId,
      status: 'complete',
      url: record.url,
      createdAt: record.createdAt,
      completedAt: record.completedAt,
      renderQuality: record.renderQuality ?? 'full',
      artifacts,
    };
    if (record.render) {
      body.render = record.render;
    }
    ```
    Place `renderQuality` after `completedAt` and before `artifacts`.

    **handleListCaptures**: In the CaptureSummary projection, add `renderQuality`
    for complete captures:
    ```js
    if (r.status === 'complete') {
      summary.completedAt = r.completedAt;
      summary.renderQuality = r.renderQuality ?? 'full';
    }
    ```

    **handleVerifyCapture**: Add `renderQuality` to the capture object in the response:
    ```js
    capture: {
      id: record.captureId,
      createdAt: record.createdAt,
      completedAt: record.completedAt,
      renderQuality: record.renderQuality ?? 'full',
    },
    ```

    ### 6. `openapi.yaml` -- Schema updates

    **Add RenderInfo schema** in `components/schemas` (after WaczInfo, before CaptureRecord):
    ```yaml
    RenderInfo:
      type: object
      description: >
        Rendering process metadata. Reports which browser readiness milestone was
        reached and whether the navigation timed out before reaching the target
        (networkidle). Present on completed captures created after this feature;
        absent on earlier captures.
      required: [waitUntilReached, timedOut, durationMs]
      properties:
        waitUntilReached:
          type: string
          enum: [domcontentloaded, load, networkidle]
          description: >
            Highest browser readiness milestone confirmed before the page was
            captured. "networkidle" means fewer than two open network connections
            for 500ms. "load" means the load event fired. "domcontentloaded"
            means the DOM was parsed but some resources may still be loading.
        timedOut:
          type: boolean
          description: >
            True when the navigation did not reach the target milestone
            (networkidle) within the timeout window. When true, renderQuality
            is "partial".
        durationMs:
          type: integer
          minimum: 0
          description: >
            Wall-clock milliseconds from navigation start to the point the page
            was captured (either at networkidle or at timeout).
          examples:
            - 25012
    ```

    **Extend CaptureRecord**: Add two new properties (after `completedAt`, before `artifacts`):
    - `renderQuality`: type string, enum [full, partial], required (add to `required` array).
      Description: "Render quality of the capture. 'full' when the page reached networkidle before capture. 'partial' when the capture was taken after a navigation timeout but DOMContentLoaded had fired. Defaults to 'full' for captures created before this feature."
    - `render`: `$ref: '#/components/schemas/RenderInfo'` -- NOT required.
      Description: "Rendering process metadata. Present on captures created after this feature."

    **Extend CaptureSummary**: Add `renderQuality` as optional property (not in required):
    - type string, enum [full, partial]. Description: "Present when status is 'complete'. Indicates whether the page fully rendered or was captured after a navigation timeout."

    **Extend VerificationCapture**: Add `renderQuality` as optional property (not in required):
    - type string, enum [full, partial]. Description: "Render quality of the verified capture."

    **Update verifyCapture operation description**: Add a note: "Captures without a WACZ bundle (including partial captures from navigation timeouts) return 404 from this endpoint."

    **Update examples**:
    - Add `renderQuality: full` to existing getCapture examples (withWacz, withoutWacz).
    - Add a third getCapture example `partialCapture` showing: renderQuality: partial, render with timedOut: true, waitUntilReached: load, durationMs: 25012, no wacz/verifyUrl.
    - Add `renderQuality: full` to existing listCaptures example for complete captures.
    - Add `renderQuality: full` to existing verifyCapture examples.
    - Update the getCaptureStatus failed example: change the error message from "Page did not finish loading within 25 seconds." to "Could not navigate to the target URL" since timeouts now produce partial captures, not failures (unless DOMContentLoaded wasn't reached).

    **Keep version at 0.3.0** -- this is additive, backward-compatible, and 0.3.0 has not been released.

    ## What NOT to Do

    - Do NOT add `waitUntilTarget` to RenderInfo (YAGNI -- always networkidle)
    - Do NOT add `screenshotMs` or `contentMs` to the render metadata in KV or API responses (they go in logs only)
    - Do NOT check `limitExceeded` on the partial path
    - Do NOT touch the verify page HTML (`src/verify-page.js`) -- partial captures 404 at verify, so any verify-page change is dead code
    - Do NOT add a `retryable` field to partial captures -- they are successes
    - Do NOT bump the OpenAPI version past 0.3.0
    - Do NOT create new files -- all changes go in existing files
    - Do NOT change the `buildWacz` function in `src/wacz.js` -- captureQuality in WACZ datapackage is deferred (separate concern, not blocking)
    - Do NOT modify test files -- tests are in a separate task
    - Run `npx spectral lint openapi.yaml` after spec changes to verify no regressions

    ## Key Files

    - `src/capture.js` -- defaultRenderer (line 287), performCapture (line 95), categorizeError (line 374)
    - `src/kv.js` -- completeCapture (line 96)
    - `src/index.js` -- handleGetCapture (line 311), handleListCaptures (line 205), handleVerifyCapture (line 410)
    - `openapi.yaml` -- CaptureRecord (line 204), CaptureSummary (line 258), VerificationCapture (line 381)

    ## Success Criteria

    - `npx spectral lint openapi.yaml` passes clean
    - `defaultRenderer` catches TimeoutError, checks readyState, and returns partial result
    - `performCapture` skips WACZ for partial captures, passes renderQuality to KV
    - API handlers surface `renderQuality` and `render` in responses
    - All existing code paths (full capture, failure) continue to work unchanged
    - No new files created
- **Deliverables**:
    - Modified `src/capture.js` (partial renderer path, performCapture orchestration, categorizeError)
    - Modified `src/kv.js` (completeCapture extension)
    - Modified `src/index.js` (handler updates for renderQuality + render)
    - Modified `openapi.yaml` (RenderInfo schema, CaptureRecord/CaptureSummary/VerificationCapture extensions, examples)
- **Success criteria**: Spectral lint passes, partial path implemented, full path enriched, API handlers surface new fields

### Task 2: Tests -- capture pipeline, KV layer, API endpoints
- **Agent**: test-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |
    Write tests for the staged fallback timeout feature (partial captures). The
    implementation is already complete in Task 1. You are adding tests to verify
    it works correctly.

    ## Working Directory

    `/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario/staged-fallback-timeout`

    ## Context

    The partial capture feature catches navigation TimeoutError in the renderer,
    checks if DOMContentLoaded has passed, and if yes: captures screenshot + HTML
    from the partially-rendered page. The renderer returns an enriched shape:
    `{ screenshot, html, partial: true, render: { waitUntilReached, timedOut, durationMs } }`.
    performCapture skips WACZ for partial captures and passes `renderQuality: 'partial'`
    to completeCapture. API handlers surface `renderQuality` and optionally `render`
    in responses.

    ## What to Do

    ### 1. `test/capture.test.js` -- New describe blocks

    Add new stub renderers alongside the existing `stubRenderer`:

    ```js
    // Partial capture: timeout but DOMContentLoaded passed
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

    // Partial capture with load event reached (higher quality partial)
    const partialLoadRenderer = async () => ({
      screenshot: PNG_BYTES,
      html: TEST_HTML,
      partial: true,
      render: {
        waitUntilReached: 'load',
        timedOut: true,
        durationMs: 25000,
      },
    });

    // Full capture with enriched return shape (new format)
    const enrichedStubRenderer = async () => ({
      screenshot: PNG_BYTES,
      html: TEST_HTML,
      partial: false,
      render: {
        waitUntilReached: 'networkidle',
        timedOut: false,
        durationMs: 3500,
      },
    });
    ```

    **Add `describe('performCapture -- partial capture (timeout with DOMContentLoaded)')` block:**

    Tests:
    - `it('transitions KV status to complete')` -- use `partialRenderer`, verify `record.status === 'complete'`
    - `it('sets renderQuality to partial')` -- verify `record.renderQuality === 'partial'`
    - `it('stores render metadata in KV record')` -- verify `record.render.waitUntilReached === 'domcontentloaded'`, `record.render.timedOut === true`, `record.render.durationMs === 25000`
    - `it('writes R2 artifacts: screenshot.png and rendered.html')` -- same pattern as existing success test
    - `it('does not write WACZ to R2')` -- after capture, list R2 objects under `captures/${TEST_ID}/`, verify no `.wacz` file. Or check that `record.wacz` is undefined/null.
    - `it('KV record has no wacz field')` -- verify `record.wacz` is undefined
    - `it('header fetch still runs (headers.json written when available)')` -- use `mockHeaderFetch()`, verify `record.artifacts.headers` exists

    **Add `describe('performCapture -- partial capture with load event')` block:**

    Tests:
    - `it('stores waitUntilReached as load')` -- use `partialLoadRenderer`, verify `record.render.waitUntilReached === 'load'`
    - `it('still sets renderQuality to partial')` -- even though load fired, it's partial because networkidle wasn't reached

    **Add `describe('performCapture -- partial capture failure paths')` block:**

    Tests:
    - `it('deadline exceeded in renderer -> KV failed')` -- stub renderer that throws `new Error('Deadline exceeded before partial capture could complete')`, verify `record.status === 'failed'`, `record.retryable === true`, `record.error === 'Page did not finish loading within 25 seconds'`
    - `it('existing timeout (no DOMContentLoaded) still fails')` -- the existing `timeoutRenderer` still produces `status: 'failed'`. This is a regression test -- just verify it still works.

    **Add `describe('performCapture -- full capture with render metadata')` block:**

    Tests:
    - `it('sets renderQuality to full')` -- use `enrichedStubRenderer`, verify `record.renderQuality === 'full'`
    - `it('stores render metadata for full captures')` -- verify `record.render.waitUntilReached === 'networkidle'`, `record.render.timedOut === false`
    - `it('continues to write WACZ when signing key available')` -- this may depend on env having a signing key. If not configured in test env, just verify the capture completes. If WACZ is expected to be skipped (no signing key), verify that too.

    ### 2. `test/kv.test.js` -- completeCapture extension tests

    Add a new `describe('completeCapture -- renderQuality and render metadata')` block:

    Tests:
    - `it('stores renderQuality when provided')` -- call `completeCapture(kv, id, artifacts, null, 'partial', { waitUntilReached: 'domcontentloaded', timedOut: true, durationMs: 25000 })`, read record, verify `renderQuality === 'partial'`
    - `it('stores render metadata when provided')` -- verify `record.render` has the expected shape
    - `it('omits renderQuality when not provided (backward compat)')` -- call `completeCapture(kv, id, artifacts)`, verify record has no `renderQuality` field
    - `it('omits render when not provided')` -- same call, verify no `render` field

    ### 3. `test/capture-retrieval.test.js` -- API response shape

    Add tests for the partial capture response:
    - Seed a KV record with `status: 'complete'`, `renderQuality: 'partial'`, `render: { waitUntilReached: 'domcontentloaded', timedOut: true, durationMs: 25000 }`, no `wacz` field. Seed R2 with screenshot and html artifacts.
    - `it('GET /v1/captures/:id returns renderQuality: partial')` -- verify response body has `renderQuality: 'partial'`
    - `it('GET /v1/captures/:id returns render metadata')` -- verify `render` object in response
    - `it('GET /v1/captures/:id omits wacz and verifyUrl for partial captures')` -- verify `wacz` and `verifyUrl` are absent
    - `it('GET /v1/captures/:id defaults renderQuality to full for old records')` -- seed a record WITHOUT `renderQuality`, verify response has `renderQuality: 'full'`
    - `it('partial capture artifacts are accessible')` -- GET screenshot and html artifacts, verify 200
    - `it('partial capture wacz artifact returns 404')` -- GET wacz artifact, verify 404

    ### 4. `test/list-captures.test.js` -- List response

    Add a test:
    - Seed a partial capture record
    - `it('list response includes renderQuality for partial captures')` -- verify CaptureSummary has `renderQuality: 'partial'`

    ### 5. `test/verify-integration.test.js` -- Verify 404 for partial

    Add a test:
    - Seed a complete capture record with no `wacz` field (simulating partial capture)
    - `it('verify endpoint returns 404 for captures without WACZ')` -- GET /v1/verify/:id, verify 404
    (This may already be implicitly tested but make it explicit for partial captures.)

    ## What NOT to Do

    - Do NOT create new test files -- extend existing ones
    - Do NOT modify source files -- only test files
    - Do NOT test the internal defaultRenderer implementation (it's not injectable in tests) -- test through performCapture with stub renderers
    - Do NOT add slow tests or real waits -- stub renderers return immediately
    - Do NOT test WACZ captureQuality enrichment (deferred, not part of this feature)

    ## Key Files to Read

    - `test/capture.test.js` -- existing patterns, fixtures, helpers (mockHeaderFetch, etc.)
    - `test/kv.test.js` -- existing KV test patterns
    - `test/capture-retrieval.test.js` -- existing GET capture tests
    - `test/list-captures.test.js` -- existing list tests
    - `test/verify-integration.test.js` -- existing verify tests
    - `src/capture.js` -- the implementation you're testing (read to understand the partial path)
    - `src/kv.js` -- completeCapture signature
    - `src/index.js` -- handler implementations

    ## Success Criteria

    - All new tests pass (`npx vitest run`)
    - All existing tests still pass (no regressions)
    - Test coverage for: partial success, partial with load event, partial failure (deadline), full capture regression, KV extension, API response shapes for partial captures, verify 404 for partials
- **Deliverables**:
    - Modified `test/capture.test.js` (partial capture test blocks)
    - Modified `test/kv.test.js` (completeCapture extension tests)
    - Modified `test/capture-retrieval.test.js` (partial capture API response tests)
    - Modified `test/list-captures.test.js` (renderQuality in list response)
    - Modified `test/verify-integration.test.js` (verify 404 for partial captures)
- **Success criteria**: `npx vitest run` passes all tests, no regressions

---

## Cross-Cutting Coverage

- **Testing**: Task 2 (test-minion) covers all test scenarios. Phase 6 post-execution will run the full test suite.
- **Security**: No new attack surface. Partial captures use the same BrowserContext isolation, the same context.close() cleanup, the same Set-Cookie redaction. The `renderQuality` field is server-controlled (not user-input). categorizeError still prevents stack trace leakage. No security-minion task needed for this additive change within existing security boundaries.
- **Usability -- Strategy**: The advisory phase (4 specialists, unanimous) already addressed the UX strategy: partial captures are successes (green verification page when WACZ exists), factual language ("partial" not "degraded"), no retry prompting. This is baked into the implementation spec.
- **Usability -- Design**: No UI changes. The verify page is untouched (partial captures 404 at verify). The API surface changes are additive optional fields. No ux-design-minion task needed.
- **Documentation**: Phase 8 post-execution handles documentation. The OpenAPI spec updates (in Task 1) are the primary documentation artifact -- they describe the new fields, their semantics, and include examples. ARCHITECTURE.md update is not warranted (no new components or data flows, just an enriched code path within the existing capture pipeline).
- **Observability**: The `capture.partial` log event and enriched success log are implemented in Task 1. These feed into the existing Coralogix pipeline. No new runtime services or tracing needs. The observability-minion's domain is covered by the iac-minion's log design in the specialist contribution.

## Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - api-spec-minion: The OpenAPI schema changes (RenderInfo, CaptureRecord extension, examples) need spec-level review to catch example drift and $ref issues. Task 1 modifies the spec significantly.
- **Not selected**: ux-design-minion (no UI changes), accessibility-minion (no HTML changes), sitespeed-minion (no web-facing runtime changes), observability-minion (logging is straightforward, covered in implementation), user-docs-minion (no user-facing docs changes beyond spec)

## Execution Order

```
Task 1 (iac-minion): Core implementation
  |
  v
Task 2 (test-minion): Tests [blocked by Task 1]
```

Two tasks, sequential. No gates -- the implementation is well-understood from the advisory (4 specialists, unanimous consensus) and the task prompts are fully specified.

## External Skills

No external skills detected in project.

## Verification Steps

1. `npx spectral lint openapi.yaml` -- spec validation
2. `npx vitest run` -- all tests pass (existing + new)
3. Manual verification: read the KV record for a partial capture, confirm `renderQuality: 'partial'` and `render` metadata present, `wacz` absent
4. Manual verification: GET /v1/captures/:id for a partial capture returns `renderQuality` and `render` in JSON response
5. Manual verification: GET /v1/verify/:id for a partial capture returns 404
