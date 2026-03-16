# Phase 3: Synthesis -- Stage-Level Timing Instrumentation

## Delegation Plan

**Team name**: stage-timings
**Description**: Add per-stage duration instrumentation to `defaultRenderer()`, flow timings through KV/API, and emit structured Coralogix log events with individual stage durations.

---

### Conflict Resolutions

**Conflict 1: Where to put stage timings in the render/KV/API record**

- **observability-minion**: Flat fields on log events (no opinion on API shape beyond "match names").
- **api-design-minion**: Nested `render.stages` sub-object in the API/KV record.
- **test-minion**: Sibling field to `render` to avoid `toEqual` breakage.

**Resolution**: Adopt api-design-minion's `render.stages` nesting. This is the cleanest API design -- it makes the part-whole relationship between `durationMs` (total) and individual stage durations structurally explicit. The `toEqual` assertions in `capture-retrieval.test.js:137` and `kv.test.js:318` will break because they match the full `render` object. These tests should be updated: change `toEqual` to `toMatchObject` at those two locations. This is a one-line change per assertion and is the correct evolution -- these tests are asserting "the render object contains these three fields" not "the render object contains ONLY these three fields." Adding an optional `stages` property to an existing object is normal API evolution, and the tests should accommodate additive changes. test-minion's Option A (sibling field) would avoid the test change but creates a worse API shape (stage timings semantically belong inside `render`, not as a peer).

**Conflict 2: Log event field naming -- flat `sessionAcquireMs` vs `stage_sessionAcquireMs`**

- **observability-minion**: Flat fields without prefix (`sessionAcquireMs`, `contextSetupMs`, etc.), matching the existing `consentDurationMs` pattern.
- **api-design-minion**: Flat with `stage_` prefix (`stage_sessionAcquireMs`, etc.).

**Resolution**: Adopt observability-minion's unprefixed naming. The existing log events already use unprefixed timing fields (`durationMs`, `consentDurationMs`). Adding a `stage_` prefix creates inconsistency -- why would `sessionAcquireMs` need a prefix but `durationMs` doesn't? The field names are self-documenting (`sessionAcquireMs` is clearly a stage duration). The `stage_` prefix adds syntactic noise to every Coralogix query without adding semantic clarity.

**Conflict 3: `consentDurationMs` retirement**

- **observability-minion**: Replace `consentDurationMs` with `consentMs` on log events.
- No other specialist commented.

**Resolution**: Replace `consentDurationMs` with `consentMs`. The project is pre-production. Naming consistency now avoids permanent divergence. The consent module already returns `durationMs` as a field name; the log event field `consentDurationMs` was always inconsistent with the `*Ms` pattern used by `durationMs`.

**Conflict 4: `null` for skipped stages in logs -- include vs omit**

- **observability-minion**: Include `null` for skipped stages in logs (consistent presence).
- **api-design-minion**: Omit null stages from logs (Coralogix aggregation handles absent fields better).

**Resolution**: Use `null` for skipped stages in both API and logs. Consistency wins. observability-minion's argument is stronger: explicit `null` is intentional and visible in raw log inspection. `consentMs:*` in Coralogix filters to non-null correctly. Omitting fields creates ambiguity between "skipped" and "old capture without instrumentation."

---

### Task 1: Instrument `defaultRenderer()` with stage timers and update log/API shapes
- **Agent**: iac-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |

    ## Task: Add stage-level timing instrumentation to the WRL capture pipeline

    You are modifying the Web Resource Ledger (WRL), a Cloudflare Worker that captures
    web pages with headless Chromium. Your task is to add `Date.now()` timing
    instrumentation to `defaultRenderer()` so that per-stage durations flow through to
    the KV record, API response, and Coralogix structured logs.

    This is instrumentation only -- no change to capture behavior, flow, or timing.

    ### Files to modify (in order)

    **1. `src/capture.js` -- Add `Date.now()` timestamps between stages in `defaultRenderer()`**

    The current `defaultRenderer()` function (starts at line 344) has clear stage
    boundaries. Insert `Date.now()` calls at each boundary and compute deltas:

    ```
    renderStart (already exists, line 345)
    --> getOrCreateSession()              --> sessionAcquireMs
    --> browser.newContext() + orphan cleanup + route setup + newPage() --> contextSetupMs
    --> page.goto()                       --> navigationMs
    --> settle delay                      --> settleMs
    --> dismissCookieConsent()            --> consentMs
    --> screenshot(s)                     --> screenshotMs
    --> page.content()                    --> contentMs
    ```

    Build a `stages` object:
    ```js
    const stages = {
      sessionAcquireMs: t1 - renderStart,
      contextSetupMs: t2 - t1,
      navigationMs: t3 - t2,
      settleMs: t4 - t3,
      consentMs: t5 - t4,
      screenshotMs: t6 - t5,
      contentMs: t7 - t6,
    };
    ```

    Add `stages` to the `render` object in both the full return (line 486-494) and
    partial return (line 436-447):
    ```js
    render: {
      waitUntilReached: 'load',
      timedOut: false,
      durationMs: Date.now() - renderStart,
      stages,            // <-- ADD THIS
    },
    ```

    For the partial capture path (navigation timeout, line 403-451):
    - `sessionAcquireMs` and `contextSetupMs` can be computed (the session and context
      were set up before navigation).
    - `navigationMs` is measured (navigation ran until timeout).
    - `settleMs`: `null` (skipped -- navigation timed out).
    - `consentMs`: `null` (partial captures skip consent).
    - `screenshotMs` and `contentMs` are measured in the partial capture block.

    IMPORTANT: The partial capture path is inside a try/catch block (line 403-453).
    The timing variables for `sessionAcquireMs` and `contextSetupMs` must be declared
    BEFORE the try block so they're accessible in the partial path. Use `let` declarations
    alongside `renderStart` and assign after each stage completes.

    Timer placement rules:
    - All timers are pure `Date.now()` arithmetic -- they cannot throw.
    - Do NOT modify the try/finally structure (context.close() in finally is MANDATORY).
    - All `Date.now()` calls occur at async I/O boundaries, so Workers time advances correctly.

    **2. `src/capture.js` -- Update log events in `performCapture()` to include stage fields**

    In the `capture.success` log event (line 221-236), add the stage timing fields as
    flat top-level fields, using spread from `render.stages`:

    ```js
    await log(env, 3, 'capture', {
      event: 'capture.success',
      captureId,
      tenantId,
      durationMs: Date.now() - start,
      // ... existing fields ...
      // Stage timings (flat, for Coralogix query ergonomics)
      ...(render?.stages ?? {}),
      // Replace consentDurationMs with consentMs from stages
      consentStatus: consent?.status ?? null,
      consentCmp: consent?.cmp ?? null,
    });
    ```

    Remove `consentDurationMs` from the `capture.success` event. It is replaced by
    `consentMs` in the stages spread.

    In the `capture.partial` log event (line 210-220), add stage fields similarly:
    ```js
    await log(env, 3, 'capture', {
      event: 'capture.partial',
      captureId,
      tenantId,
      cip,
      renderQuality,
      durationMs: Date.now() - start,
      waczStatus: 'skipped',
      ...(render?.stages ?? {}),
      render,
    });
    ```

    **3. `openapi.yaml` -- Add `RenderStages` schema component and update `RenderInfo`**

    Add a new `RenderStages` schema component after the existing `RenderInfo` (around
    line 288):

    ```yaml
    RenderStages:
      type: object
      description: >
        Per-stage wall-clock durations within the rendering pipeline. All
        properties are present on every instrumented capture. Null values
        indicate stages that were not executed (e.g., consent on partial
        captures). The sum of non-null stages approximates but does not
        exactly equal render.durationMs due to inter-stage overhead.
      required:
        - sessionAcquireMs
        - contextSetupMs
        - navigationMs
        - settleMs
        - consentMs
        - screenshotMs
        - contentMs
      properties:
        sessionAcquireMs:
          type: [integer, 'null']
          minimum: 0
          description: Time in ms to acquire a browser session from the pool.
        contextSetupMs:
          type: [integer, 'null']
          minimum: 0
          description: Time in ms to create BrowserContext, set up routes, and open a page.
        navigationMs:
          type: [integer, 'null']
          minimum: 0
          description: Time in ms from page.goto() to the target milestone or timeout.
        settleMs:
          type: [integer, 'null']
          minimum: 0
          description: Time in ms for the post-navigation settle delay. Null on partial captures.
        consentMs:
          type: [integer, 'null']
          minimum: 0
          description: Time in ms for cookie consent detection and dismissal. Null on partial captures.
        screenshotMs:
          type: [integer, 'null']
          minimum: 0
          description: Time in ms to capture screenshot(s).
        contentMs:
          type: [integer, 'null']
          minimum: 0
          description: Time in ms to extract rendered HTML via page.content().
    ```

    Then add an optional `stages` property to the existing `RenderInfo` component:

    ```yaml
    RenderInfo:
      # ... existing properties unchanged ...
      properties:
        # ... waitUntilReached, timedOut, durationMs unchanged ...
        stages:
          $ref: '#/components/schemas/RenderStages'
          description: >
            Per-stage timing breakdown. Present on captures created after
            stage-level instrumentation was deployed. Absent on earlier captures.
    ```

    Do NOT add `stages` to the `required` array of `RenderInfo`. It is optional for
    backward compatibility with existing KV records.

    **4. Test updates -- Minimal changes to accommodate the new `stages` property**

    Two `toEqual` assertions will break because they match the exact `render` object
    shape and the new `stages` property makes `render` have four fields instead of three.
    Change these to `toMatchObject`:

    - `test/capture-retrieval.test.js` line 137:
      Change `expect(body.render).toEqual({` to `expect(body.render).toMatchObject({`

    - `test/kv.test.js` line 318:
      Change `expect(record.render).toEqual({` to `expect(record.render).toMatchObject({`

    These tests still verify the three original fields are present and correct. They
    no longer fail when additional properties (like `stages`) are present.

    Do NOT modify:
    - `test/fixtures.js` -- `stubRenderer` and all existing stubs stay exactly as-is.
    - `test/capture.test.js` local stubs (lines 574-605) -- these stay as-is; they don't
      return `stages` and that's fine (tests `performCapture`, not `defaultRenderer`).
    - `capture.test.js:776` -- `record.render` is `undefined` for legacy `stubRenderer` (still passes).
    - `capture-retrieval.test.js:182` -- `body.render` is `undefined` for legacy (still passes).
    - `kv.test.js:336` -- `record.render` is `undefined` (still passes).

    No new test files or test cases are needed. The existing test stubs do not return
    `stages`, which tests backward compatibility (renderers without stage data). The
    real `defaultRenderer()` will populate `stages` in production; Phase 6 (test
    execution) will run the full suite to verify nothing breaks.

    ### What NOT to do

    - Do NOT change `completeCapture()` signature in `kv.js` -- `render` is already
      `object | null` and the new `stages` sub-object flows through as part of the
      render object. No changes needed.
    - Do NOT change `handleGetCapture()` in `src/index.js` -- it already does
      `body.render = record.render` which passes the full render object (including
      `stages`) through to the API response.
    - Do NOT add `renderDurationMs` to log events -- `durationMs` on the log covers
      total capture time, and `render.durationMs` is available via the API.
    - Do NOT modify any consent-related fields on the `consent` object returned by
      `dismissCookieConsent()`. Only the log event field changes
      (`consentDurationMs` -> `consentMs` via stages spread).
    - Do NOT create new test files or new test stubs. The only test changes are the
      two `toEqual` -> `toMatchObject` adjustments.
    - Do NOT modify behavior or timing of any capture stage. This is instrumentation only.
    - Do NOT change the `partial` field on renderer return values.
    - Do NOT modify `src/log.js` -- the log function is a generic structured logger,
      no changes needed.

    ### Key context

    - The codebase uses vanilla JS (no TypeScript, no frameworks).
    - `Date.now()` on Cloudflare Workers returns wall-clock ms. All stages involve
      async I/O, so time advances at each boundary. Sub-ms stages may show as 0 -- acceptable.
    - The `render` object flows: `defaultRenderer()` return -> `performCapture()` destructure ->
      `completeCapture()` KV write -> `handleGetCapture()` API response. No intermediate
      transformation touches render fields.
    - The existing `consentDurationMs` log field (line 234 in capture.js) is REPLACED by
      `consentMs` from the stages spread. Do not keep both.

    ### Deliverables

    Modified files:
    1. `src/capture.js` -- stage timing instrumentation + log event updates
    2. `openapi.yaml` -- `RenderStages` component + `RenderInfo.stages` property
    3. `test/capture-retrieval.test.js` -- `toEqual` -> `toMatchObject` (line 137)
    4. `test/kv.test.js` -- `toEqual` -> `toMatchObject` (line 318)

    ### Success criteria

    - `defaultRenderer()` returns `render.stages` with all 7 fields populated (full capture)
      or with `settleMs: null, consentMs: null` (partial capture).
    - `capture.success` and `capture.partial` log events include flat stage timing fields.
    - `consentDurationMs` is removed from log events (replaced by `consentMs`).
    - `GET /v1/captures/:id` response includes `render.stages` when present in KV.
    - All existing tests pass (with the two `toEqual` -> `toMatchObject` changes).
    - No changes to capture behavior, timing, or flow.

- **Deliverables**: Modified `src/capture.js`, `openapi.yaml`, `test/capture-retrieval.test.js`, `test/kv.test.js`
- **Success criteria**: All 7 stage timings populated in render.stages; flat stage fields in log events; existing tests pass with two assertion adjustments; no behavioral changes to capture pipeline

---

### Cross-Cutting Coverage

- **Testing**: Covered by the two `toEqual` -> `toMatchObject` changes in the task prompt. Phase 6 (test execution) will run the full suite post-implementation. No new test files needed -- the existing stubs without `stages` provide backward-compat coverage, and the real renderer will populate stages in production.
- **Security**: No new attack surface. Stage timers are pure `Date.now()` arithmetic on server-side values. No user input flows into timing fields. The try/finally cleanup structure is explicitly preserved. No security-minion review needed for this task.
- **Usability -- Strategy**: Not applicable. This is backend instrumentation with no user-facing changes. The API change is purely additive (new optional field). Excluding ux-strategy-minion.
- **Usability -- Design**: Not applicable. No UI changes. Excluding ux-design-minion and accessibility-minion.
- **Documentation**: The OpenAPI spec update IS the documentation. The `RenderStages` schema descriptions document each stage's meaning and boundaries. No additional documentation needed beyond what's in the task. Excluding software-docs-minion and user-docs-minion for execution.
- **Observability**: This IS the observability task. The structured log schema was designed by observability-minion in Phase 2 and the implementation follows their recommendations. No additional observability review needed.

---

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - observability-minion: The plan implements their log schema design; they should verify the final plan correctly translates their recommendations (flat fields, null semantics, consentDurationMs retirement). References Task 1 log event changes.
- **Not selected**: ux-design-minion, accessibility-minion, sitespeed-minion, user-docs-minion

---

### Risks and Mitigations

1. **`toEqual` -> `toMatchObject` weakens two assertions (MEDIUM)**: These two assertions will no longer catch accidental extra fields on the `render` object. Mitigation: This is acceptable because `render` is a well-defined object with a clear schema. The OpenAPI spec is the source of truth for the render shape, not test assertions. If stricter assertion is desired later, write a dedicated schema-validation test.

2. **Timer placement in partial capture path (LOW)**: The partial path is inside a try/catch. Timer variables must be declared before the try block. Mitigation: The task prompt explicitly calls this out and specifies `let` declarations alongside `renderStart`.

3. **`consentDurationMs` removal is a minor log schema break (LOW)**: Existing Coralogix saved queries using `consentDurationMs` will need updating. Mitigation: Project is pre-production. The rename is documented. The new field `consentMs` carries the same data.

4. **`stages` sum != `durationMs` (LOW)**: Inter-stage overhead means stage durations won't sum to `durationMs`. Mitigation: Documented in the OpenAPI schema description. This is expected and correct.

---

### Execution Order

```
Batch 1 (single task):
  Task 1: Instrument defaultRenderer(), update logs, update OpenAPI, adjust tests
    |
    v
Phase 3.5: Architecture review (6 reviewers: 5 mandatory + observability-minion)
    |
    v
Phase 4: Execute Task 1
    |
    v
Phase 5: Code review (code-review-minion, lucy, margo)
    |
    v
Phase 6: Test execution (run full test suite)
```

---

### Verification Steps

1. Run `npx vitest run` -- all tests pass (including the two adjusted assertions).
2. Inspect `src/capture.js` `defaultRenderer()` -- verify 7 `Date.now()` boundaries produce the stages object.
3. Inspect `src/capture.js` `performCapture()` -- verify `capture.success` and `capture.partial` log events include flat stage fields and `consentDurationMs` is removed.
4. Inspect `openapi.yaml` -- verify `RenderStages` component exists with 7 required nullable integer fields and `RenderInfo` references it as optional `stages`.
5. Verify `render.stages` flows through KV to GET API by tracing: `defaultRenderer()` return -> `performCapture()` destructure at line 125 -> `completeCapture()` at line 208 -> `handleGetCapture()` at line 345-347. No intermediate code strips properties from the `render` object.
