ADVISE

- [software-docs]: The OpenAPI spec prompt lists `Cache-Control: private, no-store` under "Security response headers (on all responses)" but the implementation restricts this header to status endpoint responses only — the 202, 415, 401, and health responses do not include it.
  SCOPE: `openapi.yaml` — response headers section for POST /v1/captures, GET /health, and all non-status responses
  CHANGE: Revise the spec prompt wording from "on all responses" to "on GET /v1/captures/{captureId}/status responses only" for `Cache-Control: private, no-store`. `Referrer-Policy` and `X-Content-Type-Options` are global (all responses) and correctly described. Keep those as-is.
  WHY: If the spec says all responses carry `Cache-Control: private, no-store` but the implementation only adds it on the status handler, consumers reading the spec will expect that header on 202 responses and it won't be there. The spec becomes a false contract on day one, undermining the contract-first rationale for Task 1.
  TASK: Task 1

- [software-docs]: The OpenAPI spec prompt instructs the agent to document the `captureUrl` field in the complete status response as an absolute URL pointing to `/v1/captures/{id}` — a retrieval endpoint that will not exist until Step 5.
  SCOPE: `openapi.yaml` — GET /v1/captures/{captureId}/status, 200 complete response, `captureUrl` field description
  CHANGE: Add a description note to the `captureUrl` field in the spec: "URL of the capture retrieval endpoint (available in a future release; this URL will return 404 until the retrieval endpoint is deployed)." This surfaces the known gap in the contract itself rather than leaving consumers to discover it at runtime.
  WHY: Without this note, API consumers who poll to complete and then follow `captureUrl` will hit a 404 with no explanation. The spec is the only place to communicate this proactively. The information is already known (it is documented in the synthesis conflict resolutions), it just needs to be surfaced in the contract.
  TASK: Task 1
