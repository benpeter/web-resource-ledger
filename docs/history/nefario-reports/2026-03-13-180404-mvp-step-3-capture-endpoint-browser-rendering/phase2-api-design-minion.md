# Domain Plan Contribution: api-design-minion

## Recommendations

### 1. POST /v1/captures -- 202 Response Body Shape

Use an **absolute status URL** and keep the body minimal but actionable.

```json
{
  "id": "cap_a1b2c3d4e5f6...",
  "statusUrl": "https://wrl.example.com/v1/captures/cap_a1b2c3d4e5f6.../status"
}
```

**Absolute URL over relative.** The 202 response is consumed by automated
clients (curl scripts, SDKs, CI pipelines). An absolute URL is immediately
usable with zero interpretation -- the caller can follow it as-is without
knowing the base URL, protocol, or host. This matters for edge-deployed
Workers where the origin may not be obvious to the caller. The HTTP `Location`
header in 201 Created responses uses absolute URIs for the same reason
(RFC 9110 Section 10.2.2); we should follow the same convention on the status
link even though 202 does not mandate a Location header.

**No additional metadata in the 202 body.** The issue spec says "caller is
responsible for preserving the capture ID." The 202 body's job is to hand off
exactly what the caller needs for the next step: the ID and the polling URL.
Adding the submitted URL, a timestamp, or the initial status adds no
actionable information -- the caller already knows the URL they submitted, the
timestamp is "now", and the status is always `pending` at this point. Every
extra field is a field that needs to be documented, tested, and maintained
across versions. If a field doesn't change the caller's next action, omit it.

**No Location header on 202.** RFC 9110 defines `Location` for 201 (the
created resource) and 3xx (redirects). For 202, it is not prescribed, and
using it to point at the status endpoint (which is not the resource itself)
would be semantically misleading. Include the status URL in the body only.

**Rationale for excluding `status` from 202 body.** Some APIs include
`"status": "pending"` in the 202 response for completeness. I recommend
against it here. The 202 status code already communicates "accepted, not yet
processed." Repeating it in the body adds a field the caller must decide
whether to trust (the HTTP status code) or parse (the JSON field). If we later
add more states (e.g., `rendering`, `signing`), we'd need to version the 202
body to add them, whereas the status endpoint can evolve independently.

### 2. GET /v1/captures/{id}/status -- Response Shape

Start minimal but include enough for callers to make decisions:

```json
{
  "status": "pending"
}
```

```json
{
  "status": "complete",
  "captureUrl": "https://wrl.example.com/v1/captures/cap_a1b2c3d4..."
}
```

```json
{
  "status": "failed",
  "detail": "Browser navigation timed out after 30 seconds"
}
```

**Status is the only required field across all states.** Callers polling this
endpoint need exactly one thing: is it done yet? The `status` field answers
that. Any additional fields should be conditional on the state.

**Add `captureUrl` on `complete`.** When status transitions to `complete`, the
caller's next action is to retrieve the capture. Including the retrieval URL
saves a round-trip of URL construction. This follows the same principle as the
202 response: give the caller exactly what they need for the next step.

**Add `detail` on `failed`.** Failed captures should include a human-readable
reason. This is not the full RFC 9457 problem shape (the response is 200 --
the status request succeeded, the *capture* failed). The `detail` field
explains what went wrong with the capture process.

**No timestamps in MVP.** The issue spec does not mention timestamps on the
status response, and the MVP does not need them. The capture metadata endpoint
(`GET /v1/captures/{id}`) will eventually carry the authoritative timestamp.
Adding `createdAt` or `completedAt` to the status endpoint creates a second
source of truth. If polling frequency analytics are needed later, that's a
logging concern, not an API concern.

**No `url` field in status response.** The caller already knows what URL they
submitted. Echoing it back adds no value and increases the payload stored in
KV. If a caller needs to correlate capture IDs with URLs, they maintain that
mapping client-side (consistent with the "caller is responsible for preserving
the capture ID" contract).

### 3. validateUrl() Failure Mapping to HTTP Responses

The existing `validateUrl()` returns `{ ok: false, status: 400|422, detail: string }`.
This maps directly to `problemResponse()` with zero transformation:

```javascript
const result = await validateUrl(url);
if (!result.ok) {
  return problemResponse(result.status, result.detail);
}
```

**Do not remap or wrap the status codes.** The validation module already uses
the correct HTTP semantics:

- **400** for malformed input (unparseable URL, bad scheme, too long) --
  the request is syntactically invalid.
- **422** for semantically invalid input (private IP, embedded credentials,
  double-encoding) -- the request is well-formed but cannot be processed.

These are the right codes. Remapping them to a generic 400 would lose the
semantic distinction that helps callers fix their requests. The `detail`
messages are already written to the `problemResponse` convention (specific,
actionable, no reflected input).

**One addition: wrap the capture endpoint's URL validation errors to clarify
context.** Consider prefixing the detail with "URL validation failed: " only
if there are other validation steps in the capture handler (e.g., missing
request body, missing `url` field). If URL validation is the only validation,
the existing detail messages are clear enough on their own. I recommend
against prefixing for MVP -- the messages like "URL scheme 'ftp' is not
allowed; use http or https" are already self-explanatory.

### 4. Rate Limit Headers

**Include basic rate limit headers from the start. Promote from [should] to done.**

The Cloudflare platform rate limiting configured in `wrangler.toml` or the
dashboard will return 429 responses automatically, but those responses will
not include rate limit headers unless the Worker adds them. For the MVP:

**On 429 responses (rate limit exceeded):**
- `Retry-After: <seconds>` -- mandatory. Without this, clients retry
  immediately, creating a thundering herd. The `Retry-After` header is the
  single most impactful rate-limit-related header.

**On normal (non-429) responses:**
- Skip `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` for
  now. These require reading rate limit state from the platform on every
  request, which adds latency and complexity. They are informational --
  callers can function without them.

**Rationale for partial implementation:** Full rate limit headers are a
[should] in the backlog. The `Retry-After` header on 429s is the
minimum viable rate limit communication -- it prevents retry storms and costs
almost nothing to implement (it's a static header on the 429 response). The
remaining headers can be added when there's a real client that needs
proactive rate awareness.

**Implementation note:** If Cloudflare's platform rate limiting returns its
own 429 before the Worker executes, the Worker cannot add headers. In that
case, document the platform behavior and add a note to the API docs. If the
rate limiting is implemented in the Worker (checking a counter in KV or using
the Rate Limiting API binding), the Worker controls the full response.

### 5. Additional Recommendations

#### Authentication error responses

The `Authorization: Bearer <key>` check should produce clear, distinct errors:

- **Missing header entirely:** 401 with `detail: "Authorization header is required"`
  and `WWW-Authenticate: Bearer` header (RFC 9110 Section 11.6.1 requires this
  on 401).
- **Malformed header** (not `Bearer <token>`): 401 with
  `detail: "Authorization header must use Bearer scheme"`
  and `WWW-Authenticate: Bearer`.
- **Invalid key:** 401 with `detail: "Invalid API key"` and
  `WWW-Authenticate: Bearer`.

Use 401 for all three, not 403. The caller is not authenticated -- the
distinction is "who are you?" (401) vs "you're authenticated but not
allowed" (403). With a single static API key, there is no authorization
layer, so 403 never applies.

**Timing-safe comparison.** The API key comparison must use constant-time
comparison (`crypto.subtle.timingAttack`-resistant approach) to prevent timing
side-channel attacks. In Cloudflare Workers, use
`crypto.subtle.timingAttack` is not available, but you can compare via
`crypto.subtle.digest` of both values and then comparing the digests, or
use a simple constant-time byte comparison loop. This is a security
implementation detail but affects the API contract (consistent 401 response
time regardless of which byte differs).

#### Request body validation

Before calling `validateUrl()`, validate the request body itself:

- **Missing or empty body:** 400 with `detail: "Request body is required"`
- **Invalid JSON:** 400 with `detail: "Request body must be valid JSON"`
- **Missing `url` field:** 400 with `detail: "Field 'url' is required"`
- **`url` field is not a string:** 400 with
  `detail: "Field 'url' must be a string"`

This ordering matters: body parsing errors are 400, field validation errors
are 400, URL validation errors use the status from `validateUrl()` (400 or
422). The cascade is: transport -> structure -> semantics.

#### Method not allowed

The route table currently returns 404 for method mismatches (e.g., GET on
`/v1/captures`). For the capture endpoint specifically, consider returning
**405 Method Not Allowed** with an `Allow: POST` header when a GET/PUT/DELETE
hits `/v1/captures`. This is a small polish that helps developers debug
integration issues. The existing router pattern (match path first, then
method) would need a minor adjustment -- or this can be handled as a
catch-all at the end of the route table.

This is a [consider], not a must. The current 404 behavior is acceptable for
MVP -- it does not leak information and is technically correct (the resource
at that method does not exist). But 405 is more helpful.

#### Capture ID format

The spec calls for `cap_` + `crypto.randomUUID()` with hyphens stripped. This
produces `cap_` + 32 hex characters = 36 characters total. Confirm this is
stored as the KV key prefix (e.g., `capture:cap_a1b2c3d4...`).

Validate the capture ID format on the status endpoint before hitting KV:
`/^cap_[0-9a-f]{32}$/`. If the ID does not match, return 404 immediately
without a KV lookup. This prevents unnecessary KV reads on garbage input
and avoids leaking whether the ID format is valid vs the ID does not exist
(both return 404).

#### Content-Type on POST

Require `Content-Type: application/json` on the POST request. If missing or
wrong, return 415 Unsupported Media Type with
`detail: "Content-Type must be application/json"`. This catches common
integration mistakes early. Add `415` to the titles map in `responses.js`.

## Proposed Tasks

### Task 1: Define response schemas and extend responses.js

**What:** Codify the exact JSON shapes for 202, status (all three states),
and all error responses. Add 415 to the titles map in `responses.js`.

**Deliverables:**
- Response schema documentation (can be inline JSDoc or a shared
  constants/types file)
- Updated `responses.js` with 415 title
- Schemas for: 202 accepted, status-pending, status-complete, status-failed

**Dependencies:** None. Can start immediately.

### Task 2: Implement authentication middleware

**What:** Bearer token extraction, constant-time comparison against
`CAPTURE_API_KEY` env var, RFC 9457 error responses with `WWW-Authenticate`
header.

**Deliverables:**
- Auth check function (not middleware -- just a function the handler calls)
- Returns `null` if authenticated, or a `Response` (401 problem) if not
- Tests: missing header, malformed header, wrong key, correct key

**Dependencies:** Task 1 (needs 401 error shape defined).

### Task 3: Implement request body validation

**What:** JSON parsing, `url` field extraction and type checking, then
`validateUrl()` call. Cascade of 400/415/422 errors.

**Deliverables:**
- Validation function that returns either `{ ok: true, url: string }` or a
  `Response` (error)
- Tests: empty body, invalid JSON, missing url field, wrong type, valid input

**Dependencies:** Task 1.

### Task 4: Implement POST /v1/captures handler

**What:** Wire auth check, body validation, capture ID generation, KV write
(`pending`), 202 response with absolute status URL.

**Deliverables:**
- Handler function registered in route table
- Capture ID generation (`cap_` + UUID sans hyphens)
- KV write for initial `pending` status
- 202 response body: `{ id, statusUrl }`
- Tests: happy path 202, auth failures, validation failures, KV write verification

**Dependencies:** Tasks 2, 3.

### Task 5: Implement GET /v1/captures/{id}/status handler

**What:** Capture ID format validation, KV read, response shaping per state.

**Deliverables:**
- Handler function registered in route table
- ID format regex validation (fail fast before KV)
- Response shapes: pending, complete (with captureUrl), failed (with detail)
- RFC 9457 404 for unknown IDs
- Tests: each status state, unknown ID, malformed ID

**Dependencies:** Task 1.

### Task 6: Implement Browser Rendering capture logic

**What:** Browser session management, screenshot + HTML capture, KV status
updates. This is the core async work triggered by the POST handler.

**Deliverables:**
- Browser rendering function: open context, navigate, capture PNG + HTML,
  close context
- Status updates: pending -> complete or pending -> failed
- Error handling: timeouts, navigation failures, resource limits
- Failed captures write error detail to KV for status endpoint consumption

**Dependencies:** Task 4 (needs POST handler to trigger it).

### Task 7: Rate limiting with Retry-After

**What:** Configure platform rate limiting (~10/min, ~3 concurrent per IP).
Ensure 429 responses include `Retry-After` header.

**Deliverables:**
- Rate limiting configuration (wrangler.toml or dashboard config)
- If Worker-level: rate check function, 429 response with `Retry-After`
- Documentation of rate limits in the evolution log

**Dependencies:** None (parallel with other tasks).

## Risks and Concerns

### Risk 1: Absolute URL construction on Cloudflare Workers

Building the absolute `statusUrl` requires knowing the request's origin. On
Cloudflare Workers, `new URL(request.url)` gives the correct origin including
custom domains. However, in local development (`wrangler dev`), the origin
will be `http://localhost:8787`. This is correct behavior but may surprise
developers testing against a deployed Worker behind a different domain. No
action needed -- just document this.

### Risk 2: KV eventual consistency on status reads

Workers KV is eventually consistent. A status poll immediately after a 202
response might return a KV miss (the `pending` write hasn't propagated).
Mitigation: the POST handler should `await` the KV put before returning 202.
KV puts are strongly consistent for subsequent reads from the same location
in the same colo, but cross-colo reads may lag. For MVP (single-operator),
this is acceptable. Document the behavior.

### Risk 3: Capture ID as the only access control for status

The issue spec says "ID is the secret" for the status endpoint (no auth).
This means capture IDs must have sufficient entropy. `crypto.randomUUID()`
provides 122 bits of randomness, which is adequate -- the probability of
guessing a valid ID is negligible. But document this threat model explicitly:
the ID is an unguessable bearer token, and the security of status/retrieval
endpoints depends on ID entropy.

### Risk 4: Platform rate limiting vs Worker-level rate limiting

If rate limiting is handled entirely by the Cloudflare platform (dashboard
rules), the Worker never sees rate-limited requests and cannot add
`Retry-After` headers. If the rate limiting binding (`rate_limiter` in
`wrangler.toml`) is used, the Worker controls the response. Clarify which
approach is being used before implementation, as it affects whether Task 7
is configuration-only or requires code.

### Risk 5: Browser Rendering timeout vs Worker timeout

Cloudflare Workers have a CPU time limit (varies by plan). Browser Rendering
operations can take 5-30 seconds. Ensure the Worker is using
`ctx.waitUntil()` for the browser rendering work after returning the 202,
so the rendering continues after the response is sent. If the Worker
terminates before rendering completes, the capture stays in `pending` forever.
Document the maximum expected capture duration and ensure KV TTL or a cleanup
mechanism handles orphaned `pending` records.

## Additional Agents Needed

**security-minion** -- Should review the authentication implementation
(constant-time comparison, `WWW-Authenticate` header correctness) and confirm
the capture ID entropy threat model. The security implications of "ID is the
secret" need explicit sign-off.

Beyond that, the current team is sufficient for the API design aspects. The
iac-minion or equivalent should handle the platform rate limiting
configuration (wrangler.toml settings), but that's an infrastructure concern,
not an API design one.
