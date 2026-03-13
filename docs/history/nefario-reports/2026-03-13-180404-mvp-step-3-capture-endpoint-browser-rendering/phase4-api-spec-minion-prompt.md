You are writing the OpenAPI 3.1 spec for the Web Resource Ledger capture API. This is a contract-first deliverable: implementation tasks will treat this spec as authoritative.

## Context
Working directory: /Users/ben/github/benpeter/web-resource-ledger
The project is a Cloudflare Worker that captures web page screenshots, rendered HTML, and HTTP headers. It currently has one endpoint: GET /health returning `{"status":"ok"}`.

Read these files for existing patterns:
- src/responses.js -- RFC 9457 problem response implementation
- src/index.js -- route table pattern
- src/url-validation.js -- validation error shapes ({ok, status, detail})

## What to produce
Create `openapi.yaml` at the project root. OpenAPI 3.1. Cover exactly three endpoints:

### GET /health
- 200: `{"status":"ok"}`

### POST /v1/captures
- Requires `Authorization: Bearer <key>` header
- Requires `Content-Type: application/json`
- Request body: `{"url": "https://example.com"}`
- 202 Accepted response body:
  ```json
  {
    "id": "cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
    "statusUrl": "https://wrl.example.com/v1/captures/cap_a1b2.../status",
    "note": "No list endpoint is available. Store the capture ID -- it is the only way to access this capture."
  }
  ```
  Headers: `Retry-After: 5`
- Error responses (all RFC 9457 `application/problem+json`):
  - 400: missing/invalid JSON body, missing `url` field, `url` not a string, bad URL scheme
  - 401: missing/malformed/invalid Authorization header (include `WWW-Authenticate: Bearer`)
  - 415: wrong Content-Type (not application/json)
  - 422: private IP, embedded credentials, double-encoding
  - 429: rate limit exceeded (include `Retry-After: 60`)
  - 503: service misconfigured (API key not set in environment)

### GET /v1/captures/{captureId}/status
- No auth required (capture ID is the access secret)
- Path parameter: captureId matching pattern `^cap_[a-f0-9]{32}$`
- 200 responses (state-conditional fields):
  ```json
  {"id": "cap_...", "status": "pending"}
  ```
  Header: `Retry-After: 5` on pending only
  ```json
  {"id": "cap_...", "status": "complete", "captureUrl": "https://wrl.example.com/v1/captures/cap_..."}
  ```
  ```json
  {"id": "cap_...", "status": "failed", "error": "Page did not finish loading within 25 seconds", "retryable": true}
  ```
- 404: unknown or malformed capture ID (RFC 9457)

## Shared schemas to define in components
- `ProblemDetail` -- RFC 9457 shape matching src/responses.js: type (always "about:blank"), status, title, detail. Media type: `application/problem+json`
- `CaptureAccepted` -- 202 body: id, statusUrl, note
- `CaptureStatus` -- status response with discriminated shapes
- `CaptureId` -- string pattern `^cap_[a-f0-9]{32}$`

## Security scheme
- `bearerAuth` of type `http`, scheme `bearer`
- Apply to POST /v1/captures only (status endpoint uses ID-as-secret model)

## Security response headers
- `Referrer-Policy: no-referrer` -- on ALL responses
- `X-Content-Type-Options: nosniff` -- on ALL responses
- `Cache-Control: private, no-store` -- on status endpoint responses ONLY (not on all responses)

ADVISORY (from architecture review): The Cache-Control header applies specifically to status endpoint responses, not globally. Make this clear in the spec by placing it only on the GET status endpoint responses, not on POST /v1/captures or GET /health.

## Constraints
- Include realistic examples for every response (success and each error case)
- Field name decisions are final: `id`, `statusUrl`, `note`, `captureUrl`, `error`, `retryable`, `status`
- Status URL is absolute (construct from request origin)
- The `note` field is required in the 202 response
- Use `415` status code title "Unsupported Media Type"
- Keep the spec under 250 lines if possible

## What NOT to do
- Do not spec endpoints for Steps 5-7 (retrieval, WACZ bundling, verification)
- Do not generate code
- Do not create any files other than openapi.yaml