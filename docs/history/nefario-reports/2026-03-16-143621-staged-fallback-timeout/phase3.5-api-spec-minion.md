---
verdict: ADVISE
---

# API Spec Review: staged-fallback-timeout

## Concern 1 -- `renderQuality` in `CaptureRecord.required` contradicts runtime defaulting

[api-spec]: `renderQuality` must NOT be added to `CaptureRecord.required`

**SCOPE**: `openapi.yaml` -- `CaptureRecord` schema `required` array

**CHANGE**: The synthesis plan instructs adding `renderQuality` to `CaptureRecord.required`, but also states that pre-existing KV records lack this field and handlers must default via `record.renderQuality ?? 'full'`. These two instructions are in direct conflict: a `required` field in the schema means consumers can rely on it always being present, but that guarantee requires the server to synthesize it for every response -- including old records. The runtime defaulting (`?? 'full'`) in `handleGetCapture` and `handleListCaptures` is the mechanism that makes it safe to declare as required. This is NOT a problem if iac-minion implements the `?? 'full'` default in ALL handlers before serialising the response. If any handler path omits the default and returns a response without `renderQuality`, the response will violate the schema and break SDK-generated clients that treat required fields as non-nullable.

**WHY**: OpenAPI `required` declares a contract to consumers. The spec and the implementation must agree. The plan's runtime default IS sufficient to honor the `required` contract -- but only if every code path in `handleGetCapture`, `handleListCaptures`, and `handleVerifyCapture` applies `?? 'full'` before building the response body. The task prompt for iac-minion shows this correctly for `handleGetCapture` and `handleListCaptures` but `handleVerifyCapture` uses `record.renderQuality ?? 'full'` only inside the `capture:` sub-object. That is fine. Confirm all three handlers apply the default before this is marked safe to declare as `required`.

**TASK**: iac-minion must verify that every response serialization path applies `renderQuality: record.renderQuality ?? 'full'` before returning. If any path can omit this field, remove `renderQuality` from `required` and mark it optional (consistent with `render`).

---

## Concern 2 -- `getCaptureStatus` failed example message replacement is incorrect

[api-spec]: Do not replace the `failed` example error message with "Could not navigate to the target URL"

**SCOPE**: `openapi.yaml` -- `getCaptureStatus` operation, `failed` inline example

**CHANGE**: The synthesis plan instructs changing the `failed` status example error from `"Page did not finish loading within 25 seconds."` to `"Could not navigate to the target URL"`. This is wrong. The `failed` status for a timeout now fires only when DOMContentLoaded was NOT reached -- that is still a navigation timeout, and `categorizeError` still returns `"Page did not finish loading within 25 seconds"` for `TimeoutError`. The proposed replacement message does not correspond to any value `categorizeError` can return; it is not a valid example of actual API output.

**WHY**: Spec examples are consumed by mock servers (Prism) and test suites. A fabricated error message in an example that does not match any real code path misleads tooling and developers. The current message is accurate for the remaining failure case (timeout without DOMContentLoaded). It should stay.

**TASK**: iac-minion must NOT update the `getCaptureStatus` failed example message. Keep it as `"Page did not finish loading within 25 seconds."`. If desired, update the example `summary` to clarify it represents the DOMContentLoaded-not-reached path: `"Capture timed out before DOMContentLoaded (not retried as partial)"`.

---

## Advisory (non-blocking)

**`durationMs` maximum constraint**: Given the Cloudflare 30s hard wall clock, adding `maximum: 30000` to `RenderInfo.durationMs` would be accurate and provide useful schema validation. The plan omits this. Not required for correctness but worth considering.

**`CaptureSummary` description prose drift**: After adding `renderQuality` to `CaptureSummary`, the schema description says "Additional fields when status is 'complete': completedAt." This should be updated to mention `renderQuality` as well. Currently tracked as inline documentation only -- not a spec validity issue, but will confuse consumers reading the schema description.
