# Domain Plan Contribution: api-design-minion

## Recommendations

### Minimal API Surface: 4 Endpoints

The MVP needs exactly 4 endpoints across 3 resources. Nothing more.

```
POST   /captures              Submit a URL for capture (async)
GET    /captures/{id}         Retrieve capture metadata + artifact links
GET    /captures/{id}/status  Poll capture progress (async status)
GET    /verify/{id}           Public verification -- no auth required
```

That is the complete API surface. Three endpoints serve authenticated
consumers (the person who captured the URL), one endpoint serves the
public (anyone who wants to verify a capture).

### (a) HTTP Methods and Endpoints in Detail

**POST /captures**

Submit a URL for capture. Returns immediately with a capture ID and
a status URL for polling.

Request:
```json
{
  "url": "https://example.com/page"
}
```

Response (202 Accepted):
```json
{
  "id": "cap_a1b2c3d4e5f6",
  "status": "pending",
  "url": "https://example.com/page",
  "statusUrl": "/captures/cap_a1b2c3d4e5f6/status",
  "createdAt": "2026-03-13T10:00:00Z"
}
```

Headers:
- `Location: /captures/cap_a1b2c3d4e5f6`
- Status: `202 Accepted` (not 201 -- the resource is not yet complete)

Design notes:
- The request body is intentionally minimal. One field: `url`. No options,
  no configuration, no capture profiles. YAGNI.
- The `id` uses a prefixed format (`cap_` prefix) so IDs are
  self-describing in logs, URLs, and support conversations. This is a
  Stripe pattern that costs nothing and helps everyone.
- `statusUrl` is included as a convenience. The client could construct it
  from `id`, but including it means the client doesn't need to know URL
  patterns -- just follow the link.

**GET /captures/{id}/status**

Poll for capture completion. This is the async resolution mechanism.

Response when pending (200 OK):
```json
{
  "id": "cap_a1b2c3d4e5f6",
  "status": "pending",
  "createdAt": "2026-03-13T10:00:00Z"
}
```

Response when complete (200 OK):
```json
{
  "id": "cap_a1b2c3d4e5f6",
  "status": "complete",
  "createdAt": "2026-03-13T10:00:00Z",
  "completedAt": "2026-03-13T10:00:12Z",
  "captureUrl": "/captures/cap_a1b2c3d4e5f6"
}
```

Response when failed (200 OK):
```json
{
  "id": "cap_a1b2c3d4e5f6",
  "status": "failed",
  "createdAt": "2026-03-13T10:00:00Z",
  "failedAt": "2026-03-13T10:00:08Z",
  "error": {
    "code": "capture_failed",
    "message": "Target URL returned HTTP 503"
  }
}
```

Design notes:
- Status is always 200 OK. The resource (the status record) exists and was
  successfully retrieved. The `status` field tells you whether the
  *capture* succeeded, not whether the *request* succeeded. Mixing these
  semantics (e.g., returning 404 while pending) is a common API mistake.
- Three states only: `pending`, `complete`, `failed`. No `queued` vs
  `processing` distinction -- that is internal implementation detail that
  does not help the consumer.
- This endpoint must respond in <300ms (it is a metadata lookup, not a
  capture operation).

**GET /captures/{id}**

Retrieve a completed capture's metadata and links to artifacts.

Response (200 OK):
```json
{
  "id": "cap_a1b2c3d4e5f6",
  "url": "https://example.com/page",
  "status": "complete",
  "createdAt": "2026-03-13T10:00:00Z",
  "completedAt": "2026-03-13T10:00:12Z",
  "artifacts": {
    "screenshot": "/captures/cap_a1b2c3d4e5f6/artifacts/screenshot.png",
    "html": "/captures/cap_a1b2c3d4e5f6/artifacts/snapshot.html",
    "headers": "/captures/cap_a1b2c3d4e5f6/artifacts/headers.json"
  },
  "hash": "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "verifyUrl": "/verify/cap_a1b2c3d4e5f6"
}
```

If the capture is still pending, return the same shape as the status
endpoint (status: "pending"). Do not return 404 for a pending capture --
the resource exists, it is just not ready yet.

Design notes:
- `artifacts` is a map of artifact type to URL. The client follows links
  to download individual artifacts. This avoids embedding large binary
  data in the metadata response and keeps the metadata endpoint fast
  (<300ms target).
- `hash` is the content hash of the capture bundle. This is the anchor
  for verification.
- `verifyUrl` is the shareable public verification link. This is the
  thing the capture owner sends to a third party.
- The artifact URLs can serve directly from blob storage (signed URLs
  or proxy).

**GET /verify/{id}**

Public verification endpoint. No authentication required. This is the
core value proposition endpoint -- a third party uses this to confirm
a capture is authentic.

Response (200 OK):
```json
{
  "verified": true,
  "capture": {
    "id": "cap_a1b2c3d4e5f6",
    "url": "https://example.com/page",
    "capturedAt": "2026-03-13T10:00:12Z",
    "hash": "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  },
  "artifacts": {
    "screenshot": "/verify/cap_a1b2c3d4e5f6/artifacts/screenshot.png",
    "html": "/verify/cap_a1b2c3d4e5f6/artifacts/snapshot.html",
    "headers": "/verify/cap_a1b2c3d4e5f6/artifacts/headers.json"
  }
}
```

Response when tampered / invalid (200 OK):
```json
{
  "verified": false,
  "capture": {
    "id": "cap_a1b2c3d4e5f6",
    "url": "https://example.com/page",
    "capturedAt": "2026-03-13T10:00:12Z",
    "hash": "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  },
  "error": {
    "code": "integrity_mismatch",
    "message": "Stored content hash does not match computed hash"
  }
}
```

Response when capture not found (404 Not Found):
```json
{
  "type": "https://wrl.example.com/errors/not-found",
  "title": "Capture Not Found",
  "status": 404,
  "detail": "No capture exists with ID cap_xxxxxx"
}
```

### (b) Async Pattern: Polling (Not Callbacks)

**Recommendation: Asynchronous with polling. No webhooks/callbacks for MVP.**

Rationale:

| Option | Complexity | MVP-appropriate? |
|--------|-----------|-----------------|
| Synchronous (hold connection open 5-30s) | Low | No -- HTTP timeouts, load balancer limits, poor UX |
| Polling via status endpoint | Low | Yes -- stateless, no infrastructure needed |
| Server-Sent Events | Medium | No -- adds connection management |
| Webhooks/callbacks | Medium-High | No -- requires callback URL, retry logic, signature verification |

The polling pattern works like this:

1. Client sends `POST /captures` -- gets back `202 Accepted` with
   `statusUrl`
2. Client polls `GET /captures/{id}/status` every 2-5 seconds
3. When `status` flips to `complete` or `failed`, client stops polling

This is the simplest async pattern that exists. It requires zero
additional infrastructure (no message queues exposed to clients, no
callback registration, no SSE connection management). The server just
writes status to storage; the client reads it.

**Polling guidance for consumers:**
- Recommended poll interval: 2 seconds
- Suggest this in API docs, not enforced in MVP
- The status endpoint is a fast metadata lookup (<300ms) so polling
  is cheap

**Future evolution path:** When webhooks are added later (PRODUCT.md
lists outbound webhooks as a feature), the polling mechanism stays --
webhooks become an *additional* notification channel, not a replacement.
The async model does not need to change.

### (c) Verification Endpoint Design

**Recommendation: Return a verification result with metadata, not just a boolean.**

I evaluated three options:

1. **Boolean only** (`{ "verified": true }`): Too sparse. The verifier
   learns nothing about *what* was verified. Useless as evidence.

2. **Full proof bundle** (signed attestation document, certificate chain,
   all artifacts inline): Over-engineered for MVP. Requires PKI, signing
   infrastructure, a defined attestation format. This is where the product
   goes eventually (legal admissibility), but building it now violates
   YAGNI.

3. **Verification result with metadata** (recommended): Returns whether
   the capture passed integrity checks, plus enough metadata for the
   verifier to understand what they are looking at (URL, timestamp, hash).
   Includes links to artifacts so the verifier can inspect the actual
   capture.

The recommended response shape (shown above in the endpoint detail) gives
the verifier:
- A clear `verified: true/false` signal
- The captured URL and timestamp (what was captured, and when)
- The content hash (cryptographic anchor)
- Links to artifacts (they can look at the screenshot, HTML)

This is enough to be useful without requiring signing infrastructure. The
verification in MVP is: "WRL confirms this capture exists, was made at
this time, and its stored content has not been modified since capture."

**What "verified" means in MVP:**
- The server recomputes the hash of the stored artifacts
- It compares against the hash recorded at capture time
- If they match, `verified: true` -- the content has not been tampered
  with since WRL captured it

This is integrity verification, not third-party attestation. It proves
the content has not changed since WRL stored it. It does not yet prove
*when* the capture happened (that requires a timestamping authority) or
that WRL itself is trustworthy (that requires third-party auditing). Both
are clearly post-MVP but the API shape accommodates them -- the response
can grow to include a `signature` field, a `timestamp` proof, or a full
attestation document without breaking the existing contract.

**The verify endpoint MUST be on a separate path (`/verify/{id}`)**, not
nested under `/captures/{id}/verify`, because:
- It is a public, unauthenticated endpoint
- The `/captures` namespace will be authenticated
- Separate routing makes auth boundaries obvious
- The shareable URL (`https://wrl.example.com/verify/cap_abc123`) is
  clean and communicates its purpose

### (d) Error Model

**Recommendation: Structured error responses from day one, using a
simplified RFC 9457 Problem Details format.**

The temptation is to say "just use HTTP status codes for MVP." But error
handling is the first thing developers encounter when integrating, and
unstructured errors cause support load immediately. The cost of structured
errors is near-zero (it is a JSON shape, not infrastructure), and the
benefit is immediate.

**MVP error shape** (simplified RFC 9457):

```json
{
  "type": "https://wrl.example.com/errors/invalid-url",
  "title": "Invalid URL",
  "status": 400,
  "detail": "The provided URL 'not-a-url' is not a valid HTTP or HTTPS URL"
}
```

Four fields. That is the entire error model.

**MVP error codes:**

| Status | type suffix | When |
|--------|------------|------|
| 400 | `invalid-url` | URL field missing, malformed, or non-HTTP(S) scheme |
| 400 | `invalid-request` | Malformed JSON, missing required fields |
| 404 | `not-found` | Capture ID does not exist |
| 429 | `rate-limited` | Too many requests (if rate limiting is in MVP) |
| 500 | `internal-error` | Server-side failure |

That is 5 error types. For MVP, this is sufficient. Each maps to a
single HTTP status code, so there is no ambiguity.

**Why not just HTTP status codes?** Because `400 Bad Request` with no body
tells the developer nothing. `400` with `"The provided URL 'ftp://x' is
not a valid HTTP or HTTPS URL"` tells them exactly what to fix. This is
the difference between a 5-minute integration and a support ticket.

**Why not a full RFC 9457 implementation?** The full spec includes
`instance` (URI for this specific occurrence) and extension fields. These
are useful for production debugging but are unnecessary for MVP. The four
core fields (`type`, `title`, `status`, `detail`) are the complete MVP
error model. The shape is forward-compatible -- adding `instance` or
extension fields later is additive and non-breaking.

### API Conventions Summary

| Convention | Decision | Rationale |
|-----------|----------|-----------|
| Base path | `/` (no `/api/v1` prefix) | YAGNI -- add versioning when there is a second version |
| ID format | `cap_` prefixed, random | Self-describing, avoids collision, Stripe pattern |
| Timestamps | ISO 8601, always UTC | No ambiguity |
| Content type | `application/json` only | No XML, no form-encoded |
| Auth | TBD (API key likely) | Deferred to security-minion recommendation |
| Verify auth | None (public) | Core value prop requires unauthenticated access |
| Naming | camelCase for JSON fields | JS ecosystem convention |

### What Is Explicitly NOT In the MVP API

- `GET /captures` (list captures) -- not needed for core value prop
- `DELETE /captures/{id}` -- immutable by definition
- `PATCH /captures/{id}` -- nothing to update
- Pagination -- no list endpoint
- Filtering/sorting -- no list endpoint
- Webhooks/callbacks -- polling is sufficient
- Batch capture -- one URL at a time
- API versioning -- one version exists
- Rate limit headers -- add when rate limiting is implemented
- CORS headers -- add when a browser client exists

Each of these is a natural extension that can be added without changing
the existing 4 endpoints.

## Proposed Tasks

These are the API-related tasks that should appear in the implementation
plan, in recommended sequence:

### Task 1: Define API contract (route signatures, request/response shapes)

Write the endpoint definitions (method, path, request body, response
body, status codes, error responses) as a reference document or directly
as an OpenAPI spec. This is the contract that implementation codes
against.

Acceptance criteria:
- All 4 endpoints documented with request/response examples
- Error responses documented for each endpoint
- ID generation strategy documented (prefix + random)
- Document is reviewable by other agents before implementation begins

### Task 2: Implement capture submission endpoint

`POST /captures` -- accept a URL, validate it, generate an ID, persist
the capture request, trigger async capture processing, return 202.

Acceptance criteria:
- Validates URL (HTTP/HTTPS only, well-formed)
- Returns 202 with capture ID and status URL
- Persists capture request to storage
- Returns structured error for invalid input

### Task 3: Implement status and retrieval endpoints

`GET /captures/{id}/status` and `GET /captures/{id}` -- read capture
metadata from storage, return appropriate response based on state.

Acceptance criteria:
- Status endpoint returns pending/complete/failed
- Retrieval endpoint returns full metadata with artifact links when
  complete
- Both return 404 (structured) for unknown IDs
- Both respond in <300ms

### Task 4: Implement verification endpoint

`GET /verify/{id}` -- public, unauthenticated. Recompute hash, compare
against stored hash, return verification result.

Acceptance criteria:
- No authentication required
- Recomputes content hash from stored artifacts
- Returns verified: true/false with capture metadata
- Returns 404 for unknown IDs
- Responds in <300ms

### Task 5: Error handling middleware

Implement consistent error response formatting across all endpoints.
Catch unhandled errors and format as RFC 9457 responses.

Acceptance criteria:
- All error responses follow the 4-field RFC 9457 shape
- Unhandled exceptions return 500 with `internal-error` type
- No stack traces or internal details leak in error responses

## Risks and Concerns

### Risk 1: Verification without signing is weak

In MVP, "verification" means "WRL checks its own storage integrity."
This is a self-referential proof -- if WRL itself is compromised, the
verification is meaningless. This is acceptable for MVP (the product
needs to exist before it can have third-party trust), but the
verification endpoint response should be designed so that adding a
`signature` or `attestation` field later is non-breaking. The
recommended response shape accommodates this.

### Risk 2: Polling is adequate but not elegant

Polling works but creates unnecessary load if many captures are in
flight. For MVP with low volume this is fine. If the product gains
traction before webhooks are added, polling load could become an issue.
Mitigation: the status endpoint is a pure metadata read and should be
trivially cheap to serve.

### Risk 3: No list endpoint makes debugging harder

Without `GET /captures`, the capture owner must remember or store their
capture IDs externally. This is a known gap for MVP. The mitigation is
that the `POST /captures` response contains the ID, and the shareable
verify URL contains it too. A list endpoint is the most obvious first
addition post-MVP.

### Risk 4: Artifact URL design needs alignment with storage

The artifact URLs in the response (`/captures/{id}/artifacts/screenshot.png`)
imply either a proxy layer or signed redirect URLs to blob storage. The
choice affects latency and implementation complexity. This needs to be
resolved with iac-minion's storage recommendation.

## Additional Agents Needed

None. The current team (gru for tech choices, lucy for scope guard, margo
for YAGNI enforcement, iac-minion for deployment, security-minion for
auth and SSRF) covers all the dependencies this API design has. The API
contract document (Task 1) can be authored as a plain reference doc
initially; api-spec-minion can formalize it as OpenAPI once the API is
implemented and stable (per margo's likely recommendation to defer formal
specs).
