# Margo Review: mvp-step-3-capture-endpoint

## Verdict: ADVISE

The plan is well-scoped to the original request. Task count (7) is proportional
to the work items. No unnecessary technology is introduced -- @cloudflare/puppeteer
is essential for the browser rendering requirement, and everything else uses
platform primitives (KV, R2, rate limiting binding). The serverless-first
posture is correct. Complexity budget is reasonable.

Three advisory items follow.

---

- [over-engineering]: `setRenderer` / `getRenderer` module-scoped global adds hidden mutable state when a function parameter already exists
  SCOPE: `src/capture.js` -- `setRenderer(fn)` / `getRenderer()` exports
  CHANGE: Drop `setRenderer`, `getRenderer`, and the `_renderer` module-scoped variable. `performCapture` already accepts `renderer` as an optional parameter with a default. Tests should call `performCapture(env, url, ip, captureId, stubRenderer)` directly -- this is the injectable dependency pattern already established by `validateUrl`'s `resolvers` parameter.
  WHY: The module-scoped mutable `_renderer` variable creates hidden global state that can leak between tests if `afterEach` cleanup is missed. The explicit parameter already solves the testability requirement without this risk. Two injection mechanisms for the same concern is one too many.
  TASK: 4

- [scope-creep]: OpenAPI spec (Task 1) is not in the original work items or acceptance criteria and adds a mandatory approval gate on the critical path
  SCOPE: `openapi.yaml` -- contract-first OpenAPI spec (Task 1)
  CHANGE: Make Task 1 non-blocking. Move the OpenAPI spec to run in parallel with Tasks 2-4 instead of gating them. The field names, status codes, and response shapes are already fully specified in the task prompts -- implementation tasks do not actually need the YAML file to proceed. Alternatively, remove the approval gate on Task 1; the spec is small and the contract decisions are already resolved in the synthesis.
  WHY: The original issue does not mention an OpenAPI spec. The plan acknowledges this was pulled forward from Step 8. Putting it on the critical path with an approval gate delays all implementation work for a documentation artifact. The contract is already locked in the conflict resolutions and task prompts. An approval gate is justified when downstream tasks would be hard to reverse -- but here the downstream tasks embed the contract directly in their prompts and do not read `openapi.yaml` at runtime.
  TASK: 1

- [YAGNI]: `captureUrl` field in the "complete" status response references an endpoint that does not exist yet
  SCOPE: Status endpoint response shape -- `captureUrl` field on complete status
  CHANGE: Omit `captureUrl` from the complete status response in this step. Add it in Step 5 when the retrieval endpoint actually exists. The response shape for complete can be `{ id, status: "complete" }` for now.
  WHY: Returning a URL to a non-existent endpoint (`/v1/captures/{id}`) creates a broken contract for any caller that tries to follow it. Building the response field before the destination exists is forward-coupling to a future step. If the retrieval URL changes shape in Step 5, this field must be retroactively corrected. Deferring one field addition to the step that creates the target is cheaper than coordinating across steps.
  TASK: 1, 5
