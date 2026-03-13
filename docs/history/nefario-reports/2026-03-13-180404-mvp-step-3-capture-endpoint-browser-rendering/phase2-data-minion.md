# Domain Plan Contribution: data-minion

## Recommendations

### 1. KV Key Structure: Namespaced with `capture:` Prefix

**Recommendation**: Use `capture:{captureId}` keys (e.g., `capture:cap_abc123def456...`).

**Rationale**: The `wrangler.toml` has a single KV namespace bound as `KV`. The backlog
already lists D1 as a [consider] item "if KV becomes limiting for metadata queries,"
and Step 4 (WACZ bundling) will write additional metadata to the same namespace. A bare
capture ID as the key would collide with any future use of the namespace -- rate limit
counters, config flags, signing key metadata, etc.

Namespacing now is cheap (a string prefix) and avoids a data migration later. The prefix
convention should be:

- `capture:{captureId}` -- capture status and metadata (this step)
- Future namespaces added as needed (e.g., `config:`, `key:`)

**Rejected alternative**: Bare capture ID (`cap_abc123`). Simpler, but paints the KV
namespace into a corner. The capture ID already has the `cap_` prefix which provides
some collision resistance, but this is a type marker for the ID itself, not a storage
namespace. Conflating the two means any future KV use requires a migration or a second
namespace binding.

**Rejected alternative**: Deeply nested keys (`v1:capture:status:cap_abc123`). Over-
engineered. One level of namespacing is sufficient. KV keys are opaque strings, not
hierarchical paths -- adding depth adds bytes without adding queryability.

### 2. Value Shape: Include Metadata for Step 4, Not Just Status

**Recommendation**: Store a JSON object with status plus the metadata that downstream
steps need. The value should be written once at accept time with all known fields, then
updated in place when the capture completes or fails.

```js
// Written at POST /v1/captures accept time (status: "pending")
{
  "status": "pending",
  "url": "https://example.com/page",      // validated URL (from validateUrl().url)
  "ip": "93.184.216.34",                   // resolved IP (from validateUrl().ip)
  "createdAt": "2026-03-13T17:04:00.000Z", // ISO 8601, server clock
  "captureId": "cap_abc123def456..."        // redundant with key, but self-documenting
}

// Updated on completion (status: "complete")
{
  "status": "complete",
  "url": "https://example.com/page",
  "ip": "93.184.216.34",
  "createdAt": "2026-03-13T17:04:00.000Z",
  "captureId": "cap_abc123def456...",
  "completedAt": "2026-03-13T17:04:12.000Z",
  "artifacts": {
    "screenshot": "captures/cap_abc123.../screenshot.png",
    "html": "captures/cap_abc123.../rendered.html",
    "headers": "captures/cap_abc123.../headers.json"
  }
}

// Updated on failure (status: "failed")
{
  "status": "failed",
  "url": "https://example.com/page",
  "ip": "93.184.216.34",
  "createdAt": "2026-03-13T17:04:00.000Z",
  "captureId": "cap_abc123def456...",
  "failedAt": "2026-03-13T17:04:08.000Z",
  "error": "Browser navigation timed out after 30s"
}
```

**Why include metadata now**: Step 4 (WACZ bundling) needs to know _what_ was captured
(URL, timestamp) and _where_ the artifacts live (R2 keys). If we store only `{ status }`
now, Step 4 must either re-derive this information or we must migrate the value shape.
Including it from the start means Step 4 reads the KV value and has everything it needs.

**Why include `captureId` in the value**: Self-documenting. Any code that reads the
value does not need to parse the key to know which capture it belongs to. Small cost
(~40 bytes), avoids a class of bugs where the key and value get separated.

**Why include `ip`**: Informational only (the TOCTOU note in `url-validation.js`
acknowledges this), but useful for debugging, audit, and potential future TOCTOU
mitigation.

**Why NOT use KV metadata**: Cloudflare KV supports a `metadata` field (max 1024 bytes
JSON) separate from the value. This is tempting for status (put status in metadata, put
artifacts in value). However, the metadata field is designed for list operations and
filtering -- capabilities we explicitly do not use in MVP (no list endpoint). Splitting
data across value and metadata adds complexity without benefit. Keep everything in the
value.

**Rejected alternative**: Minimal `{ status: "pending" }` with metadata added later.
Requires a value migration between Step 3 and Step 4, or requires Step 4 to know about
the transition. Including metadata from the start is the simpler path.

**Rejected alternative**: Separate KV entries per field (`capture:cap_abc123:status`,
`capture:cap_abc123:url`, etc.). Violates "data accessed together should be stored
together." Every status check or metadata read becomes multiple KV gets. KV charges per
read operation.

### 3. R2 Key Structure for Intermediate Artifacts (Step 3 Scope)

The issue says R2 storage of final WACZ bundles is Step 4 scope. However, Step 3
captures screenshot, rendered HTML, and headers -- these need to go _somewhere_ before
Step 4 packages them. Two options:

**Option A (recommended): Store intermediate artifacts in R2 immediately.** Use keys
like `captures/{captureId}/screenshot.png`, `captures/{captureId}/rendered.html`,
`captures/{captureId}/headers.json`. Step 4 reads these from R2, bundles into WACZ,
writes the WACZ to `captures/{sha256}.wacz`, and could optionally clean up the
intermediates.

**Option B: Hold artifacts in memory and pass them through.** The capture handler holds
PNG, HTML, and headers in memory until Step 4 code packages them. This means Step 3
cannot write to R2 at all -- it must buffer everything and hand it off. This breaks the
step boundary: Step 3 cannot be "complete" without Step 4 existing to consume the
artifacts.

Option A is recommended because it respects step isolation. Step 3 produces artifacts
and stores them. Step 4 consumes stored artifacts and produces bundles. The KV value's
`artifacts` map records where each artifact lives.

If the team decides artifacts should NOT go to R2 in Step 3 (because the issue says "R2
in Step 4"), then the in-memory approach works but the KV value shape should omit the
`artifacts` field until Step 4, and Step 3's "complete" status means "browser rendering
finished" without artifact persistence guarantees.

### 4. TTL for Stuck Captures

**Recommendation**: Set `expirationTtl: 86400` (24 hours) on the initial `pending`
write. Remove the TTL (re-write without expiration) when the capture completes or fails.

**Rationale**:
- A capture that stays `pending` forever is a data leak and a confusing UX. If
  `ctx.waitUntil()` silently drops (Worker killed, runtime error), the status record
  would persist indefinitely with no resolution.
- 24 hours is generous enough that no legitimate capture will expire, but short enough
  that stuck records clean themselves up.
- The minimum `expirationTtl` in Cloudflare KV is 60 seconds. 24 hours (86400s) is
  well above this.
- When the capture completes or fails, the KV value is re-written with the updated
  status. At that point, omit `expirationTtl` -- completed/failed captures should
  persist until Step 4/5 determines final retention policy.

**Alternative considered**: No TTL, with a background cleanup job. Over-engineered for
MVP. The 24-hour TTL is self-cleaning with zero additional code.

**Alternative considered**: Short TTL (e.g., 5 minutes). Too aggressive. Browser
Rendering can take 30 seconds, and if the Worker is under load or Cloudflare has a
transient delay, 5 minutes could expire a legitimate in-progress capture.

### 5. KV Eventual Consistency vs "Returns Pending Immediately"

**Assessment: No meaningful race condition in the MVP's deployment model.**

The acceptance criterion says: _"`GET /v1/captures/{id}/status` returns
`{ "status": "pending" }` immediately after submission."_

Cloudflare KV has this consistency property: **writes are immediately visible to
requests in the same global network location** (same Cloudflare PoP). They can take up
to 60 seconds to propagate to other locations.

For the MVP scenario (single operator, likely hitting the same PoP for both POST and
GET), this is a non-issue. The POST writes `pending` to KV, returns 202 with the status
URL, and the subsequent GET from the same location reads the value immediately.

**Where it _could_ matter**: If the caller is geographically distributed (e.g., POST
from New York, GET from Tokyo), the `pending` status might not be visible in Tokyo for
up to 60 seconds. For a single-operator MVP, this is an accepted limitation. The
mitigation is architectural:

1. The 202 response already tells the caller "this capture exists and is pending" -- the
   first status check is informational, not load-bearing.
2. A 404 from the status endpoint during the propagation window is distinguishable from
   "unknown ID" only if the caller _just_ received a 202 with that ID. In practice, the
   caller knows the ID is valid because they just created it.

**Recommendation**: Document this eventual consistency window in the OpenAPI spec
(`x-consistency-note` or a description on the status endpoint). Do NOT add application-
level workarounds (like returning status from memory in the POST response). The 202
response body already confirms acceptance -- that is the source of truth for "pending."

**Potential concern for Step 4**: When the background capture completes and the status
is updated to `complete`, a GET from a different PoP might still see `pending` for up
to 60 seconds. This is acceptable for a polling pattern -- the caller simply polls
again. No data is lost, no incorrect state is returned (stale `pending` is conservative,
not wrong).

### 6. Status Endpoint Response Shape

The status endpoint currently specifies `{ "status": "pending"|"complete"|"failed" }`.

**Recommendation**: Return the full KV value (minus internal fields if any), not just
the status string. This means:

- For `pending`: `{ "status": "pending", "captureId": "cap_...", "url": "...", "createdAt": "..." }`
- For `complete`: same plus `completedAt` and `artifacts`
- For `failed`: same plus `failedAt` and `error`

This is a question for api-design-minion to decide, but from a data perspective: the
information is already in KV, returning it costs nothing, and it gives the caller useful
context (especially the error message for failed captures). If the API contract wants a
minimal response, the handler can select fields from the stored value -- the KV value
shape should not be constrained by the response shape.

## Proposed Tasks

### Task 1: Implement KV Helper Module (`src/kv.js`)

**What**: Create a thin abstraction over KV operations for capture status. Functions:
- `createCapture(kv, captureId, url, ip)` -- writes initial `pending` record with
  `expirationTtl: 86400`
- `completeCapture(kv, captureId, artifacts)` -- updates status to `complete`, adds
  `completedAt` and `artifacts`, removes TTL
- `failCapture(kv, captureId, error)` -- updates status to `failed`, adds `failedAt`
  and `error`, removes TTL
- `getCapture(kv, captureId)` -- reads and parses the KV value, returns null for
  missing keys

The module encapsulates the key prefix (`capture:`), JSON serialization, and TTL logic.
All KV access goes through this module -- no raw `env.KV.put()` / `env.KV.get()` calls
in route handlers.

**Deliverables**: `src/kv.js` with the four functions above.

**Dependencies**: None (uses only the KV binding from `env`).

### Task 2: Unit Tests for KV Helper

**What**: Test the KV helper functions using `@cloudflare/vitest-pool-workers` with the
KV binding. Tests should verify:
- `createCapture` writes correct key and value shape
- `getCapture` returns null for missing keys
- `completeCapture` updates status and adds artifacts
- `failCapture` updates status and adds error
- Key prefix is applied correctly
- Serialization round-trips cleanly (write then read)

**Deliverables**: `test/kv.test.js`

**Dependencies**: Task 1.

### Task 3: Wire KV Operations into Route Handlers

**What**: The capture POST handler calls `createCapture()` before returning 202. The
status GET handler calls `getCapture()` and returns the appropriate response (200 with
status data, or RFC 9457 404 for null). The background capture task calls
`completeCapture()` or `failCapture()` on resolution.

**Deliverables**: Updated `src/index.js` (or new `src/capture.js` handler module).

**Dependencies**: Task 1, plus the route handler and auth work from other agents.

### Task 4: Integration Test for Status Lifecycle

**What**: Test the full status lifecycle via `SELF.fetch()`:
1. POST to create a capture, assert 202
2. GET status, assert `pending`
3. After background processing completes, GET status, assert `complete` or `failed`
4. GET status for unknown ID, assert 404 with RFC 9457 shape

**Deliverables**: Test cases in `test/capture.test.js` (or wherever the capture
integration tests live).

**Dependencies**: Tasks 1-3, plus Browser Rendering mocking strategy from test-minion.

## Risks and Concerns

### Risk 1: Artifact Storage Gap Between Step 3 and Step 4

Step 3 captures screenshot, HTML, and headers. Step 4 bundles them into WACZ and writes
to R2. If Step 3 does NOT write artifacts to R2 (holding them in memory only), then:
- The `artifacts` field in the KV value cannot be populated until Step 4
- The "complete" status in Step 3 means "browser finished" not "artifacts persisted"
- If `ctx.waitUntil()` is killed after browser rendering but before Step 4 runs,
  artifacts are lost

**Mitigation**: Write intermediate artifacts to R2 in Step 3 (see Recommendation 3
above). This is the clearest step boundary and prevents data loss.

### Risk 2: KV Write Failure After 202 Response

The POST handler returns 202 _then_ writes `pending` to KV in the background (or does
it write KV _before_ returning 202?). The order matters:

- **Write KV first, then return 202**: If KV write fails, return 500 instead of 202.
  The caller never receives a capture ID for a non-existent record. This is the correct
  order.
- **Return 202 first, write KV in background**: If KV write fails, the caller has a
  capture ID that will never resolve. The status endpoint returns 404 forever.

**Recommendation**: Write `pending` to KV synchronously (before `ctx.waitUntil()` and
before returning 202). KV writes are fast (~10ms). The browser rendering is what goes
into `ctx.waitUntil()`.

### Risk 3: KV Value Size Growth

The current value shape is small (~500 bytes). Step 4 will add WACZ metadata
(manifest hashes, signature data). KV values can be up to 25 MB, so there is no
practical size concern for the MVP. However, if future steps add large fields (e.g.,
full header dumps, error stack traces), the value could grow. The 1024-byte metadata
limit on KV is irrelevant since we are not using the metadata field.

**Mitigation**: None needed for MVP. Monitor value sizes if future steps add fields.

### Risk 4: Capture ID as Access Secret

The capture ID is the only access control for status and retrieval endpoints. The ID
space is `cap_` + 32 hex chars (128 bits of entropy from `crypto.randomUUID()`). This
is sufficient for unguessability (comparable to GitHub personal access tokens). However:
- IDs must never appear in logs (information disclosure)
- IDs must never be reflected in error messages for _other_ captures
- The status endpoint must return the same 404 shape for "does not exist" and "exists
  but wrong ID" (no oracle)

This is primarily a security-minion concern, but it has data implications: KV key
enumeration must not be possible through the API. Since there is no list endpoint and
KV does not support prefix scanning from Workers, this is satisfied by construction.

## Additional Agents Needed

None. The current team (security-minion, api-design-minion, edge-minion, data-minion,
test-minion, ux-strategy-minion, software-docs-minion) covers all domains for this step.

The one area I want to flag for **api-design-minion** coordination: the status endpoint
response shape. My recommendation is to return the full KV value (not just the status
string), but the API contract is api-design-minion's call. The KV value shape should be
designed to support whatever response the API returns, not the other way around -- store
generously, expose selectively.
