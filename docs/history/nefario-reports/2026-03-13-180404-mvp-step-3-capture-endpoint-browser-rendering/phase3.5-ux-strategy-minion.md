## UX Strategy Review — mvp-step-3-capture-endpoint

**Verdict: ADVISE**

All prior ux-strategy-minion recommendations from the specialist round have been correctly incorporated into the synthesis: `id` field in every status response, `retryable` boolean on failed, `error` field naming, `note` field in 202, `Retry-After` on 202 and pending. No regression on those points.

One advisory:

- [ux-strategy]: The `captureUrl` field in the complete status response points to `/v1/captures/{id}`, an endpoint that does not exist until Step 5. A developer who polls to completion and then follows `captureUrl` will get a 404.
  SCOPE: `GET /v1/captures/{captureId}/status` response shape — `captureUrl` field, defined in openapi.yaml and implemented in Task 5 (handleCaptureStatus)
  CHANGE: Add a comment in the OpenAPI spec (Task 1) and in the status handler code (Task 5) explicitly noting that `captureUrl` will return 404 until the retrieval endpoint is implemented in Step 5. Alternatively, omit `captureUrl` from the complete response until Step 5 is built, and add it then. The field is not required by the acceptance criteria.
  WHY: A broken URL in a success response violates the Nielsen heuristic of system status visibility and will create confusion for any developer integrating against this API before Step 5 ships. The developer has no way to distinguish "endpoint coming soon" from "something is wrong." The `note` field pattern (informational string in the body) could carry this warning if the field is retained.
  TASK: Task 1 (OpenAPI spec) and Task 5 (route handlers)
