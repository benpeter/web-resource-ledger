# UX Strategy Review: staged-fallback-timeout

**Verdict: ADVISE**

---

## Finding 1: Verify endpoint 404 for partial captures creates a broken consumer journey

[usability]: Partial captures return `status: 'complete'` and `renderQuality: 'partial'`, but calling `/v1/verify/:id` returns 404. A consumer who inspects `renderQuality` and wants to verify the capture has no signal that verification is unavailable -- they hit an error wall.

**SCOPE**: `openapi.yaml` -- `verifyCapture` operation description and the `VerificationCapture` response shape

**CHANGE**: The planned update adds a prose note to the verify endpoint description. That is necessary but not sufficient. The `CaptureRecord` response (from `GET /v1/captures/:id`) should include a machine-readable signal when verify is unavailable -- either omit `verifyUrl` entirely for partial captures (which the spec already does) or add an explicit absence reason. Confirm that the `getCapture` response example for `partialCapture` explicitly shows `verifyUrl` absent, and that the OpenAPI description for `verifyUrl` documents when it is omitted. Consumers navigating the API spec need to find this without reading prose.

**WHY**: Without a machine-readable absence signal, consumers must parse prose documentation to understand why a `complete` capture has no verify URL. This violates Nielsen heuristic 1 (system status must be visible) and heuristic 6 (don't make users remember -- recognition over recall). The current plan documents it in prose only.

**TASK**: Task 1 (iac-minion) -- in the OpenAPI spec, add `verifyUrl` absence documentation to the `CaptureRecord` property description (e.g., "Omitted when `renderQuality` is `partial` or when no WACZ is available"). This is a one-line spec change, not a code change.

---

## Finding 2: Conditional `render` field creates an uneven mental model for API consumers

[usability]: `renderQuality` is always present (required, defaults to `'full'`). `render` is conditionally present (absent on pre-feature records). This asymmetry means consumers must write two different code paths: one for records with `render`, one without. For a consumer whose job is "check how well this page was captured," the asymmetry adds cognitive load without providing additional safety.

**SCOPE**: `openapi.yaml` -- `CaptureRecord` schema, `RenderInfo` presence rules

**CHANGE**: This is an acceptable trade-off given no-migration policy, but the spec description for `render` must make the condition explicit and machine-navigable. The current plan says "absent on earlier captures" in prose. Ensure the spec description states clearly: "Present on captures created after feature version X. When absent, the page reached networkidle (consistent with `renderQuality: full`)." This gives consumers a fallback inference rule rather than leaving them to guess.

**WHY**: Progressive disclosure works only when the primary path is unambiguous. Consumers who see `render` absent on some records but not others will wonder if it is a bug. An explicit fallback inference rule eliminates that question mark -- Krug's Law applied to API design.

**TASK**: Task 1 (iac-minion) -- strengthen the `render` property description in `CaptureRecord` to include the fallback inference rule, not just the absence condition.

---

No blocking issues. Both findings are spec-level description changes within Task 1's scope. Implementation logic and language choices ("partial" not "degraded", no retry on partials, DOMContentLoaded as minimum threshold) are correct and need no changes.
