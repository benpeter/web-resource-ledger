# Domain Plan Contribution: api-spec-minion

## Recommendations

### (a) `renderQuality` should be a top-level field, not nested under a `render` object

Top-level is correct for `renderQuality`. Looking at the existing `CaptureRecord` schema (line 204-256 of openapi.yaml), all consumer-facing fields are flat: `id`, `status`, `url`, `createdAt`, `completedAt`, `artifacts`, `wacz`, `verifyUrl`. Nesting `renderQuality` under a `render` parent object would break the established pattern and force every consumer to dereference one extra level for the single most-needed field.

The **detail object** (`render`) should also be top-level on `CaptureRecord`, parallel to `wacz` -- same structural pattern. `wacz` is an optional metadata object with sub-fields; `render` follows the same shape. This keeps the schema flat-but-structured: summary fields at the top, detail objects alongside.

### (b) The `RenderInfo` schema should be simpler than proposed

The advisory proposes: `{ waitUntilReached, waitUntilTarget, timedOut, durationMs }`.

I recommend **dropping `waitUntilTarget`**. It is currently always `'networkidle'` and carries zero information -- every capture targets networkidle. If the target becomes configurable in the future, it belongs in a request parameter, not a response metadata field. Adding it now violates YAGNI and adds a field that says the same thing for every record.

Recommended `RenderInfo` schema:

```yaml
RenderInfo:
  type: object
  description: >
    Rendering process metadata. Reports which browser readiness milestone was
    reached and whether the navigation timed out before reaching the target
    (networkidle). Present on completed captures; absent on pending and
    failed captures.
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

Three fields. Each carries distinct, actionable information. `waitUntilReached` tells consumers *how far the page got*. `timedOut` is the boolean flag. `durationMs` is the observable timing metric. This is the minimal shape that serves the filtering, observability, and consumer-facing use cases identified in the synthesis.

### (c) Keep the version at 0.3.0

The spec already declares `version: 0.3.0` in its `info` block. Looking at the git history, the recent commits (key versioning, auth enrichment, list captures, CORS, staging) appear to have landed under this version without a prior release. This means v0.3.0 is the in-progress version accumulating unreleased features.

Adding `renderQuality` and `RenderInfo` is an additive, backward-compatible change -- new optional fields, a new schema, no removed or retyped fields, no changed URLs. This fits within a minor version bump. Since 0.3.0 has not been published as a release yet, the right move is to include this feature at the existing 0.3.0 version.

Do **not** bump to 0.4.0. Bumping for every additive feature in a pre-1.0 project creates version inflation without signaling meaningful contract changes. Bump the minor version when the accumulated changes since the last release warrant it, or when a breaking change arrives.

### (d) Verification endpoint: add `renderQuality` to the `capture` object inside the response

This is the correct placement. The `VerificationCapture` schema (lines 381-399) currently has `id`, `createdAt`, `completedAt`. Adding `renderQuality` here surfaces the quality signal alongside the capture identity without polluting the top-level verification result structure.

The field must be **optional** (not in the `required` array) on `VerificationCapture` because:

1. The verification endpoint currently gates on `record.wacz` being present (line 428 of index.js). Partial captures skip WACZ, so they will 404 at the verification endpoint. This means `renderQuality` on `VerificationCapture` will only appear for full captures in the current implementation.

2. However, when Queues (R16) land and partial captures gain WACZ bundles, partial captures will become verifiable. At that point, `renderQuality: 'partial'` on the verification response becomes load-bearing. Adding the optional field now prevents a future spec change.

3. Pre-existing KV records lack `renderQuality` entirely. The API layer should default to `'full'` when the field is absent (see (e) below), so existing verified captures will show `renderQuality: 'full'`.

**Important spec nuance**: The verification endpoint returns 404 for captures without WACZ (`!record.wacz` check at line 428). Since partial captures skip WACZ, they are NOT verifiable in the current implementation. The spec description for the verify endpoint should note this explicitly: "Captures without a WACZ bundle (including partial captures from navigation timeouts) return 404."

### (e) Default absent `renderQuality` to `'full'` at the API layer, make the field required in response schemas

This is the cleanest approach for both spec correctness and consumer ergonomics:

1. **In the OpenAPI spec**: `renderQuality` is `required` on `CaptureRecord` and optional on `CaptureSummary` (present only when `status === 'complete'`). The spec describes what consumers receive, and they will always receive the field because the API layer fills it.

2. **In the implementation** (`handleGetCapture`, `handleListCaptures`, `handleVerifyCapture`): when reading a KV record that lacks `renderQuality`, default to `'full'`. This is a one-line fallback: `record.renderQuality ?? 'full'`. The defaulting happens at the HTTP handler level, not in the KV layer -- the KV layer should return records as stored.

3. **Do NOT make the field nullable** in the schema. Nullable adds a third state (`null` meaning "unknown") that consumers must handle. The semantic is clear: pre-existing records were full captures (they would have failed if they timed out), so `'full'` is the truthful default, not an assumption.

4. **In `CaptureSummary`**: `renderQuality` is optional (not in `required`), present only when status is `'complete'`. This follows the existing pattern where `completedAt` is only present on complete captures and `failedAt`/`error`/`retryable` are only present on failed ones. Pending and failed captures have no render quality to report.

5. **In `VerificationCapture`**: `renderQuality` is optional (not in `required`). Present when the KV record has it (or defaults to `'full'`). This future-proofs for R16.

## Proposed Tasks

### Task 1: Add `RenderInfo` schema to `components/schemas`

**What**: Define the `RenderInfo` schema in openapi.yaml under `components/schemas`, between the existing `WaczInfo` and `CaptureRecord` schemas.

**Deliverable**: `RenderInfo` schema with three required properties: `waitUntilReached` (enum), `timedOut` (boolean), `durationMs` (integer with examples).

**Dependencies**: None. Can be done first.

### Task 2: Extend `CaptureRecord` schema

**What**: Add two new properties to `CaptureRecord`:
- `renderQuality`: type string, enum `[full, partial]`, required. Add to the `required` array.
- `render`: `$ref: '#/components/schemas/RenderInfo'`, optional (not required). Description: "Rendering process metadata. Present on all captures created after this feature was deployed."

Add `description` to both fields. Update the `CaptureRecord.description` to mention render quality.

**Deliverable**: Updated `CaptureRecord` schema. Updated examples (both `withWacz` and `withoutWacz`) to include `renderQuality: full` and a `render` object. Add a third example showing a partial capture (no wacz, `renderQuality: partial`, `render.timedOut: true`).

**Dependencies**: Task 1 (RenderInfo must exist).

### Task 3: Extend `CaptureSummary` schema

**What**: Add `renderQuality` as an optional property (not in `required`):
- `renderQuality`: type string, enum `[full, partial]`. Description: "Present when status is 'complete'. Indicates whether the page fully rendered or the capture was taken after a navigation timeout."

Update the `CaptureSummary.description` block to mention `renderQuality` in the "Additional fields when status is 'complete'" line.

**Deliverable**: Updated `CaptureSummary` schema. Updated list endpoint examples to include `renderQuality: full` on complete captures.

**Dependencies**: None (standalone enum, no $ref needed).

### Task 4: Extend `VerificationCapture` schema

**What**: Add `renderQuality` as an optional property (not in `required`):
- `renderQuality`: type string, enum `[full, partial]`. Description: "Render quality of the capture. Absent for captures created before this feature."

**Deliverable**: Updated `VerificationCapture` schema. Updated verification examples to include `renderQuality: full`.

**Dependencies**: None.

### Task 5: Update verify endpoint description

**What**: Add a note to the `verifyCapture` operation description explaining that captures without a WACZ bundle (including partial captures from navigation timeouts) return 404 from this endpoint.

**Deliverable**: Updated operation description in `paths./v1/verify/{captureId}.get.description`.

**Dependencies**: None.

### Task 6: Add partial-capture example to `getCapture` response

**What**: Add a third response example named `partialCapture` to the `getCapture` operation showing a capture with `renderQuality: partial`, `render.timedOut: true`, `render.waitUntilReached: load`, `render.durationMs: 25012`, no `wacz` or `verifyUrl`.

**Deliverable**: New example in `paths./v1/captures/{captureId}.get.responses.200.content.application/json.examples`.

**Dependencies**: Tasks 1, 2.

### Task 7: Update `getCaptureStatus` failed example

**What**: The current failed example (line 871) shows `error: Page did not finish loading within 25 seconds.` with `retryable: true`. After this feature ships, timeouts produce partial captures, not failures. Update the failed example to use a different failure reason (e.g., session pool exhaustion) so the spec examples do not suggest timeout = failure. This avoids confusing consumers reading the spec.

**Deliverable**: Updated failed example in `getCaptureStatus` responses.

**Dependencies**: None. Can be done independently.

### Task 8: Extend `completeCapture()` KV function signature

**What**: Add an optional `renderInfo` parameter to `completeCapture()` in kv.js. When provided, spread `renderQuality` and `render` into the KV record. This is the data-layer change that the implementation needs.

Shape: `completeCapture(kv, captureId, artifacts, wacz = null, renderInfo = null)` where `renderInfo` is `{ renderQuality: string, render: object }` or null.

**Deliverable**: Updated `completeCapture()` function. Updated JSDoc. Unit test additions in test/kv.test.js for the new parameter.

**Dependencies**: None from a spec perspective, but the implementation team owns this task. Listed here because the spec change defines the contract.

### Task 9: Update API handlers to surface `renderQuality` and `render`

**What**: In src/index.js:
- `handleGetCapture`: add `renderQuality: record.renderQuality ?? 'full'` and `render: record.render` (if present) to the response body.
- `handleListCaptures`: add `renderQuality: r.renderQuality ?? 'full'` to the summary projection (only when `r.status === 'complete'`).
- `handleVerifyCapture`: add `renderQuality: record.renderQuality ?? 'full'` to the `capture` object in the response.

**Deliverable**: Updated handler functions. Integration test additions.

**Dependencies**: Task 8 (KV shape must be established first).

### Task 10: Validate spec with Spectral

**What**: Run `spectral lint openapi.yaml` after all schema changes to confirm no regressions. Check for: broken `$ref` links, missing descriptions, example validation, enum consistency.

**Deliverable**: Clean Spectral lint output.

**Dependencies**: Tasks 1-7.

## Risks and Concerns

### 1. Verify endpoint 404 for partial captures may surprise consumers

Partial captures are `status: 'complete'` but have no WACZ, so `/v1/verify/{captureId}` returns 404. A consumer who checks `status === 'complete'` and then calls verify will get a 404. The spec must document this clearly (Task 5), but consumers who do not read the description will hit this. This is an acceptable trade-off -- the alternative (returning a verification result for captures with no WACZ) would be misleading.

### 2. `render` field absent on pre-existing captures

The `render` detail object will be absent on all captures created before this feature. Making `render` optional (not required) on `CaptureRecord` handles this correctly, but it means SDK-generated code will have the field typed as nullable/optional. Consumers must handle the absent case. The `renderQuality` field, by contrast, is always present because the API layer defaults it.

I recommend making `render` explicitly not-required in the schema and noting in its description: "Present on captures created after version 0.3.0. Absent on earlier captures."

### 3. Example drift

The spec currently has two examples for `getCapture` (withWacz, withoutWacz). Adding a third (partialCapture) is correct, but we must ensure the examples in `listCaptures` and `verifyCapture` also reflect the new fields. Example drift (schemas change but examples do not) is the single most common spec defect and causes Prism mock failures.

### 4. Enum forward-compatibility

The `renderQuality` enum is `[full, partial]`. The synthesis discusses potential future values (e.g., `minimal`). The spec should include a description note that consumers should treat unknown `renderQuality` values as equivalent to `partial` (defensive parsing). This is a documentation concern, not a schema concern -- OpenAPI enums are closed by definition, so adding a value is technically a breaking change under strict tooling. The pre-1.0 semver context makes this acceptable, but it should be called out.

### 5. `CaptureStatus` schema is not shown but is referenced

The `getCaptureStatus` operation references `CaptureStatus` schema. This schema describes the status polling response, which currently includes `error` and `retryable` for failed captures. Confirm that `CaptureStatus` does NOT need `renderQuality` -- it should not. The status endpoint is for lifecycle polling (`pending`/`complete`/`failed`), not for metadata retrieval. The synthesis agrees: "handleCaptureStatus needs no change." The spec should remain unchanged here. Verified by examining the handler at lines 553-583 of index.js.

## Additional Agents Needed

None. The current team is sufficient. The spec changes are straightforward additive modifications to an existing OpenAPI 3.1.0 document. The api-spec-minion can author the schema changes, and the implementation team handles the handler and KV modifications. No security review is needed for the spec changes themselves (the security implications were already addressed in the synthesis).
