# API Design Contribution: Stage-Level Timing Instrumentation

## Domain: REST API schema design, backward compatibility, response shape conventions

---

## Recommendation: Nested `stages` sub-object under `render`

### Proposed shape

```json
{
  "render": {
    "waitUntilReached": "load",
    "timedOut": false,
    "durationMs": 8200,
    "stages": {
      "sessionAcquireMs": 120,
      "contextSetupMs": 45,
      "navigationMs": 3200,
      "settleMs": 3000,
      "consentMs": 1635,
      "screenshotMs": 180,
      "contentMs": 20
    }
  }
}
```

### Why nested, not flat

1. **Backward compatibility is preserved mechanically.** The existing `render` object has three required fields: `waitUntilReached`, `timedOut`, `durationMs`. Adding `stages` as an optional fourth property is a purely additive change. No existing client breaks. No schema version bump needed. `durationMs` remains the authoritative total. Clients that don't care about stage breakdown ignore `stages` entirely -- they never see a field they didn't ask for change type or meaning.

2. **Flat siblings create ambiguity.** If `sessionAcquireMs`, `navigationMs`, etc. sit at the same level as `durationMs`, the reader must infer that some of these fields are "the total" and some are "parts of the total." A nested `stages` object makes the part-whole relationship explicit in the structure itself. This is the same pattern used by Stripe's `payment_method_details` (nested breakdown of a top-level `amount`) and GitHub's `check_run.output` (nested detail under a summary-level object).

3. **SDK generation is cleaner.** A `stages` sub-object maps to a single `RenderStages` schema component in OpenAPI. SDK generators produce a dedicated type (`RenderStages` / `render_stages`) rather than polluting the `RenderInfo` type with seven new optional fields. The `RenderInfo` type stays small and stable -- existing generated code doesn't need regeneration for clients who don't use stage data.

4. **Future extensibility.** If new stages are added later (e.g., `waczBundleMs`, `headerFetchMs`), they go into `stages` without touching the top-level `render` contract. The `stages` object is explicitly extensible by convention -- new keys are always additive, never breaking.

### Why `durationMs` must remain as-is

- `durationMs` is a **required** field in the `RenderInfo` schema. Removing or renaming it is a breaking change.
- `durationMs` is the wall-clock total. It will NOT equal the sum of stage durations because stages overlap (e.g., `sessionAcquireMs` includes pool lookup + connect; `contentMs` runs after screenshot). The sum may be close but not exact due to inter-stage glue code. Documenting this explicitly avoids confusion.
- Consumers who only care about "how long did rendering take?" should never need to sum stages. `durationMs` answers that question directly.

---

## Skipped / not-performed stages

### Recommendation: use `null` for stages that were not executed

For partial captures, the pipeline exits early after navigation timeout. Consent, the second screenshot pass, and content extraction after consent are all skipped. The `stages` object should represent this with `null` values:

```json
{
  "render": {
    "waitUntilReached": "domcontentloaded",
    "timedOut": true,
    "durationMs": 20100,
    "stages": {
      "sessionAcquireMs": 95,
      "contextSetupMs": 40,
      "navigationMs": 20000,
      "settleMs": null,
      "consentMs": null,
      "screenshotMs": 35,
      "contentMs": 15
    }
  }
}
```

### Why `null` and not absent keys

1. **Schema consistency.** Every response has the same set of keys in `stages`. Clients can destructure without checking for key existence. This is the "consistent field set, nullable values" pattern -- the same approach this API already uses for `consent` (present as `null` on partial captures, never absent from the renderer return shape).

2. **Distinguishes "didn't run" from "ran in 0ms".** A `0` value would mean "this stage executed instantly." `null` means "this stage was skipped." This distinction matters operationally -- in Coralogix dashboards, filtering `settleMs: null` identifies partial captures without cross-referencing `timedOut`.

3. **Avoids the "is this field missing because skipped, or because old capture?" problem.** If stages were simply omitted when skipped, a client seeing no `consentMs` can't tell whether consent was skipped or whether this is a pre-instrumentation capture that doesn't have stage data at all. With `null`, the `stages` object is either fully present (all keys, some null) or the entire `stages` key is absent (pre-instrumentation capture).

### Why not a dedicated `status` per stage

A more elaborate design would use `{ durationMs: 1635, status: 'completed' }` or `{ status: 'skipped' }` per stage. This is over-engineered for the current need. The project's engineering philosophy (YAGNI, KISS) argues against it. Stage status can be derived mechanically: `null` means skipped, a number means completed. If per-stage error states are needed in the future, the `null | number` values can be evolved to `null | number | { error: string, durationMs: number }` via a discriminated union without breaking clients that only check for `typeof === 'number'`.

---

## OpenAPI schema design

### New `RenderStages` component

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
      description: >
        Time to acquire or reuse a browser session from the pool.
    contextSetupMs:
      type: [integer, 'null']
      minimum: 0
      description: >
        Time to create a new BrowserContext, set up route interception,
        and open a new page.
    navigationMs:
      type: [integer, 'null']
      minimum: 0
      description: >
        Time from page.goto() call to the target milestone firing (load)
        or timeout.
    settleMs:
      type: [integer, 'null']
      minimum: 0
      description: >
        Time spent in the post-navigation settle delay (currently 3000ms
        nominal). Null when navigation timed out (partial captures).
    consentMs:
      type: [integer, 'null']
      minimum: 0
      description: >
        Time spent on cookie consent detection and dismissal. Null when
        consent was not attempted (partial captures).
    screenshotMs:
      type: [integer, 'null']
      minimum: 0
      description: >
        Time to capture screenshot(s). Includes both before and after
        screenshots when consent was dismissed.
    contentMs:
      type: [integer, 'null']
      minimum: 0
      description: >
        Time to extract rendered HTML via page.content().
```

### Updated `RenderInfo` component

Add one optional property:

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

**Do not** add `stages` to the `required` array of `RenderInfo`. It's optional for backward compatibility with existing KV records.

---

## Coralogix log shape

For the structured log events (`capture.success`, `capture.partial`), flatten stage timings as top-level fields in the log payload rather than nesting them. Coralogix query syntax works best with flat fields:

```json
{
  "event": "capture.success",
  "captureId": "cap_...",
  "durationMs": 8200,
  "stage_sessionAcquireMs": 120,
  "stage_contextSetupMs": 45,
  "stage_navigationMs": 3200,
  "stage_settleMs": 3000,
  "stage_consentMs": 1635,
  "stage_screenshotMs": 180,
  "stage_contentMs": 20
}
```

The `stage_` prefix groups them visually and avoids collision with existing top-level fields like `durationMs`. Null values for skipped stages should be omitted from logs entirely (Coralogix handles absent fields better than null values for aggregation queries like `avg(stage_consentMs)`).

**Important:** The API response shape (nested `stages` object) and the log shape (flat `stage_*` prefixed fields) are deliberately different. The API optimizes for client ergonomics and schema clarity. The log optimizes for query ergonomics and aggregation. These are different consumers with different needs.

---

## Risks and dependencies

### Risks

1. **KV record size growth.** Seven new integer fields add ~150 bytes to the JSON payload. Current records are well under KV's 25 MiB limit. No concern here.

2. **Clock accuracy.** `Date.now()` has millisecond resolution on Cloudflare Workers. Stage durations measured via `Date.now()` deltas will have ~1ms jitter. This is acceptable for operational observability but should be documented: these are wall-clock approximations, not high-resolution timings.

3. **`stages` sum != `durationMs`.** Inter-stage overhead (variable assignments, conditionals, async scheduling) means the sum of stages will be slightly less than `durationMs`. This must be documented in the OpenAPI description to prevent consumer confusion. The delta is typically 5-20ms -- operationally irrelevant but technically noticeable.

### Dependencies

- **OpenAPI spec update:** The `RenderStages` schema must be added to `openapi.yaml` and referenced from `RenderInfo`. This is a purely additive change.
- **Test fixtures:** All renderer stubs in `test/fixtures.js` need updated `render` objects with `stages` populated. The existing `render` shape must still be accepted (backward compat for pre-instrumentation captures stored in KV).
- **GET endpoint handler:** The `if (record.render)` block in `src/index.js:345` passes `render` through verbatim from KV. No changes needed here -- `stages` will flow through automatically as part of the `render` object.
- **`completeCapture` in `kv.js`:** No signature change needed. `render` is already `object | null`. The new `stages` sub-object is just a property of the render object.

### Requirements from this perspective

1. **`durationMs` remains required and unchanged** in both the code return shape and the OpenAPI schema.
2. **`stages` is optional** on `RenderInfo` -- absent means pre-instrumentation capture.
3. **All seven stage keys are always present** when `stages` exists. Null for skipped, integer for measured.
4. **Partial captures** set `settleMs: null` and `consentMs: null`. `screenshotMs` and `contentMs` are still measured (the partial path does take a screenshot and extract content).
5. **OpenAPI schema uses `type: [integer, 'null']`** (OAS 3.1 nullable syntax) for stage fields.
6. **Log events flatten stages** with `stage_` prefix; null stages are omitted from logs.

---

## Rejected alternatives

### Alternative A: Flat siblings of `durationMs`

```json
{
  "render": {
    "waitUntilReached": "load",
    "timedOut": false,
    "durationMs": 8200,
    "sessionAcquireMs": 120,
    "navigationMs": 3200
  }
}
```

**Rejected because:** Pollutes the existing `RenderInfo` schema with seven new fields. Breaks the semantic grouping (summary vs. breakdown). Makes SDK types unnecessarily wide. Forces documentation to explain which fields are "the total" vs "parts" without structural help.

### Alternative B: Replace `durationMs` with sum of stages

**Rejected because:** Breaking change to a required field. Consumers computing totals client-side is error-prone and wastes their time for the common case ("how long did this take?").

### Alternative C: Separate `timings` top-level object on CaptureRecord

```json
{
  "render": { "waitUntilReached": "load", "timedOut": false, "durationMs": 8200 },
  "timings": { "sessionAcquireMs": 120, ... }
}
```

**Rejected because:** Stage timings are semantically part of the render process. Splitting them to a separate top-level key creates an artificial separation. The `render` object is already the home for render metadata. Also requires changing the `completeCapture` signature or the KV record shape to carry a separate `timings` object through the pipeline.

### Alternative D: `0` for skipped stages instead of `null`

**Rejected because:** Ambiguous. A `0ms` settle delay would be indistinguishable from "settle was skipped." This matters for dashboards filtering on partial vs. full captures.
