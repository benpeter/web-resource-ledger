## Domain Plan Contribution: api-design-minion

### Recommendations

#### 1. Response Envelope: `{ data, pagination }`

The collection response should use a two-key envelope that becomes the project-wide convention for all future collection endpoints:

```json
{
  "data": [ ... ],
  "pagination": {
    "cursor": "eyJ0cyI6IjIwMjYtMDMtMTVUMTA6MzA6MDAuMDAwWiIsImlkIjoiY2FwX2ExYjIifQ==",
    "hasMore": true,
    "limit": 20
  }
}
```

**Why this shape:**

- `data` is an array, always -- even for zero results (empty array, not null). This means clients never need a null check before iterating.
- `pagination` is a flat object with three fields. No `pageInfo` wrapper, no `edges`/`node` Relay baggage. KISS applies.
- `cursor` is present when `hasMore` is true, absent (or null) otherwise. Clients check `hasMore` first, then use `cursor` for the next request.
- `limit` echoes back the effective page size so the client knows what was applied (especially important when the server clamps a too-large requested value).
- No `totalCount`. KV `list()` does not provide a total count without scanning all keys. Faking it would require a full iteration. Omitting it follows YAGNI and keeps the response honest. If D1 migration happens later, `totalCount` can be added as an optional field without breaking the envelope.

This envelope is reusable for any future collection endpoint (e.g., batch captures, audit logs) via a generic `CollectionResponse` schema wrapper in the OpenAPI spec.

#### 2. Cursor-Based Pagination Mechanics

**Cursor opaqueness:**
The API cursor must be an opaque string. Clients must never parse, construct, or modify cursors. The implementation can use base64url-encoded JSON internally (e.g., `{"ts":"2026-03-15T10:30:00.000Z","id":"cap_a1b2..."}`), but the API contract makes zero guarantees about cursor format. This is critical for the D1 migration path: when the storage backend changes, cursor internals change, but the API contract holds.

Do NOT expose Cloudflare KV's native `cursor` directly to API consumers. Reasons:
1. KV cursors are tied to KV's internal implementation and could change format without notice.
2. The secondary index key format (`tenant:{tenantId}:ts:{ISO}:{captureId}`) is an internal detail that should not leak through the API.
3. When D1 replaces KV, the cursor semantics change entirely (keyset pagination vs. KV list cursor). Wrapping now means zero breaking changes later.

**Cursor construction (internal):**
Encode the last item's sort key (timestamp + captureId) into the cursor. On the next request, use this to construct the KV `list()` call with a `prefix` + `cursor` or `prefix` + start-after semantics. The KV `list()` returns lexicographically sorted keys, and the secondary index `tenant:default:ts:2026-03-15T10:30:00.000Z:cap_abc` sorts naturally by time descending if we use a reverse-timestamp encoding, or ascending if we use ISO directly.

**Recommendation: newest-first (descending) by default.** Users almost always want their most recent captures first. To achieve descending order with KV's lexicographic ascending sort, use a reverse-timestamp technique: store `9999999999999 - epochMs` as the timestamp component of the secondary index key, or use a simpler approach of `list()` ascending and reverse in-memory (only viable for small page sizes). The reverse-timestamp key approach is more robust:

```
tenant:default:ts:7973684399999:cap_a1b2...
```

However, this adds complexity. Given the KISS principle and that the issue explicitly says "browse and recover captures by date", a simpler approach is: store keys with natural ISO timestamps (ascending), and the `list()` call returns oldest-first. For "newest first" behavior without reverse-timestamp keys, the cursor would need to walk backward -- KV does not support reverse iteration natively.

**Pragmatic recommendation:** Use natural ascending ISO timestamps in the secondary index. Accept that the initial implementation returns oldest-first (ascending chronological order). This is the only order KV supports without reverse-timestamp tricks. Document that sort order may change when D1 migration happens. The issue's success criteria does not specify sort order, and ascending is honest about the storage limitation. If descending is strongly desired, use the reverse-timestamp key encoding from day one -- it is a one-time complexity investment that avoids a future migration.

**Query parameters:**
- `limit` -- integer, min 1, max 100, default 20. See section 4 below for the rationale.
- `cursor` -- opaque string. If provided, resume from this position. If absent or omitted, start from the beginning.
- `status` -- enum: `pending`, `complete`, `failed`. Optional filter. See section 3.

Example: `GET /v1/captures?limit=20&cursor=eyJ0cyI6Ij...&status=complete`

#### 3. Status Filter

The `status` query parameter accepts one of the three lifecycle states: `pending`, `complete`, `failed`. When omitted, all statuses are returned.

**Implementation concern with KV:** The secondary index (`tenant:default:ts:{ISO}:{captureId}`) does not encode status. To filter by status, the handler must:
1. List keys from the secondary index (getting `captureId` references).
2. Fetch each capture record via `getCapture()`.
3. Filter in-memory by status.

This means that when filtering (e.g., `?status=pending`), a page request for 20 items might need to fetch more than 20 records to fill the page -- because some records will be filtered out. The implementation should over-fetch from the KV list (e.g., request `limit * 3` keys from KV) and keep fetching pages until it has enough matching records or exhausts the index.

**Do NOT create per-status secondary indexes.** That would mean maintaining three separate index key sets (per status per tenant), with consistency challenges when status changes. The read-time filtering approach is acceptable at current scale and avoids write amplification.

**Validation:** Invalid `status` values should return 400 with a clear message: `"Query parameter 'status' must be one of: pending, complete, failed."`. This follows the existing RFC 9457 pattern.

**Multi-value status filter:** Only support a single status value for now (YAGNI). If multi-status filtering is needed later (e.g., `?status=pending,failed`), it can be added as a backward-compatible extension. Document this constraint.

#### 4. Page Size: Defaults and Maximums

**KV cost model:** Each page of N results costs N+1 KV operations (1 `list()` + N `get()` calls). KV operations are billed and subject to rate limits.

- **Default: 20.** This is 21 KV ops -- fast, cheap, and returns enough results for most use cases (table view, recent captures scan, ID recovery).
- **Maximum: 100.** This is 101 KV ops -- still well within a single Worker invocation's budget and the <300ms latency target. KV `get()` calls should be parallelized with `Promise.all()` for all keys in a page.
- **Minimum: 1.** Valid but unusual. No reason to reject it.

**Clamping behavior:** If a client requests `limit=500`, the server silently clamps to 100 and echoes `"limit": 100` in the pagination object. Do NOT return an error for over-limit values -- clamping is friendlier and matches Stripe/GitHub API behavior. The echoed `limit` field tells the client what was actually applied.

**Latency budget:** At 20 items default, with `Promise.all()` for the N gets, the KV round-trip should be ~50-100ms (1 list + 20 parallel gets). At 100 items, ~100-200ms. Both are within the 300ms target from the success criteria.

**Why not larger than 100:** Beyond 100, the risk of cold KV reads causing occasional latency spikes increases. 100 is also the conventional maximum for well-designed APIs (Stripe uses 100, GitHub uses 100). It signals to SDK authors that pagination is expected.

#### 5. Response Item Shape: Summary Projection

The list endpoint should return a **summary projection**, not the full `CaptureRecord`. Reasons:

1. **Performance:** Full records include artifact URLs that require URL construction per item. Minor cost, but unnecessary when browsing.
2. **Convention:** List endpoints conventionally return summaries; detail endpoints return full records. This follows the collection/item pattern.
3. **Storage-agnostic:** The summary fields come from the KV record metadata, not from artifact computation. This keeps the list endpoint's data requirements simple.

**Proposed `CaptureSummary` schema:**

```json
{
  "id": "cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
  "status": "complete",
  "url": "https://example.com",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "completedAt": "2024-01-15T10:30:45.123Z"
}
```

Fields:
- `id` -- always present. The capture ID.
- `status` -- always present. One of `pending`, `complete`, `failed`.
- `url` -- always present. The captured URL.
- `createdAt` -- always present. ISO 8601 timestamp.
- `completedAt` -- present only when status is `complete`. ISO 8601 timestamp.
- `failedAt` -- present only when status is `failed`. ISO 8601 timestamp.
- `error` -- present only when status is `failed`. Human-readable failure reason.

**Excluded from summary (available in full record via GET /v1/captures/{captureId}):**
- `artifacts` -- URL construction overhead, not needed for browsing
- `wacz` -- detail-level information
- `verifyUrl` -- detail-level information

This mirrors the existing `CaptureRecord` but drops the artifact-related fields. The `CaptureSummary` schema should be defined as a separate component in the OpenAPI spec, not as a subset of `CaptureRecord` -- this keeps the schemas independently evolvable.

**Failed captures in list:** Include `error` and `failedAt` in the summary for failed captures. This lets users identify failures without drilling into each one. The `retryable` field should also be included for failed captures, matching the status endpoint's response shape.

Revised failed-capture summary:
```json
{
  "id": "cap_...",
  "status": "failed",
  "url": "https://example.com",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "failedAt": "2024-01-15T10:30:45.123Z",
  "error": "Page did not finish loading within 25 seconds.",
  "retryable": true
}
```

#### 6. Authentication Model

The list endpoint MUST require Bearer auth. This is a departure from the individual capture endpoints (which use capture-ID-as-secret). The list endpoint returns multiple capture IDs and summaries -- it cannot rely on "knowing the ID" as proof of authorization.

This means the `verifyApiKey()` result (with the new `tenantId` from R8) directly controls which tenant's captures are returned. The handler must:
1. Verify auth, extract `tenantId`.
2. Use `tenantId` to scope the KV `list()` prefix to `tenant:{tenantId}:ts:`.
3. Return only that tenant's captures.

This is the first endpoint where `tenantId` from R8 has a functional effect (not just logging). It makes R8 a hard prerequisite for R1.

#### 7. operationId Convention

Following the existing pattern (`createCapture`, `getCapture`, `getCaptureStatus`), the list endpoint should use:

- **operationId:** `listCaptures`

This follows the `list*` / `get*` / `create*` / `update*` / `delete*` convention and maps cleanly to future SDK method names: `client.captures.list({ status: 'complete', limit: 20 })`.

#### 8. Error Responses

The endpoint uses the existing RFC 9457 `ProblemDetail` schema for all errors:

| Scenario | Status | Detail |
|----------|--------|--------|
| Missing/invalid auth | 401 | (existing auth module responses) |
| Invalid `status` value | 400 | `"Query parameter 'status' must be one of: pending, complete, failed."` |
| Invalid `cursor` (malformed) | 400 | `"Query parameter 'cursor' is invalid."` |
| Invalid `limit` (non-integer, < 1) | 400 | `"Query parameter 'limit' must be an integer between 1 and 100."` |
| Rate limited | 429 | (existing rate limit response) |
| Service misconfigured | 503 | (existing 503 response) |

**Expired/invalid cursor:** If a cursor points to a position that no longer exists (e.g., the referenced key was deleted), the server should treat it as a fresh start from the beginning rather than returning an error. This is more resilient -- cursors are not promises of consistency. However, if the cursor is structurally malformed (fails base64 decode or JSON parse), return 400.

#### 9. Cache-Control and Security Headers

- `Cache-Control: private, no-store` -- the list contains tenant-scoped data behind auth. Same as `getCapture`.
- All standard security headers apply (set by the router's post-handler logic).
- No `Access-Control-Allow-Origin: *` for this endpoint -- it requires auth, so CORS should not be permissive by default. (This is different from the public capture retrieval endpoints.) When R3 (CORS for capture POST) ships, it can extend CORS to this endpoint as needed.

#### 10. OpenAPI Spec Schemas

New components to add to `openapi.yaml`:

- `CaptureSummary` -- the item schema described in section 5
- `Pagination` -- reusable pagination metadata: `{ cursor, hasMore, limit }`
- `CaptureListResponse` -- `{ data: CaptureSummary[], pagination: Pagination }`

These should be defined under `components/schemas` for reuse. The `Pagination` schema in particular should be generic enough to reuse for any future collection endpoint.

#### 11. Existing Response Note Update

The `createCapture` 202 response currently includes:
```
"note": "No list endpoint is available. Store the capture ID -- it is the only way to access this capture."
```

After R1 ships, this note should be updated to remove the "no list endpoint" warning. The note can be shortened to:
```
"note": "Store the capture ID for direct access to this capture."
```

Or removed entirely. The issue mentions "README lost-ID warnings removed" -- the 202 response body is the other place this warning lives.


### Proposed Tasks

#### Task 1: Define `CaptureSummary`, `Pagination`, and `CaptureListResponse` schemas

**What:** Add three new component schemas to `openapi.yaml`:
- `CaptureSummary` with conditional fields based on status
- `Pagination` with `cursor` (nullable string), `hasMore` (boolean), `limit` (integer, min 1, max 100)
- `CaptureListResponse` composing `data: CaptureSummary[]` + `pagination: Pagination`

**Deliverables:** Updated `openapi.yaml` with schemas under `components/schemas`.

**Dependencies:** None -- can be done before implementation.

#### Task 2: Add `GET /v1/captures` path to OpenAPI spec

**What:** Define the path with:
- operationId `listCaptures`
- Query parameters: `limit` (integer, default 20, min 1, max 100), `cursor` (string, opaque), `status` (enum: pending/complete/failed)
- Security: `bearerAuth`
- 200 response using `CaptureListResponse`
- Error responses: 400, 401, 429, 503

**Deliverables:** Updated `openapi.yaml` with the path definition.

**Dependencies:** Task 1 (schemas must exist for `$ref`).

#### Task 3: Design secondary KV index key format

**What:** Finalize the secondary index key format for tenant-scoped time-ordered listing. Recommended format:

```
tenant:{tenantId}:ts:{ISO8601}:{captureId}
```

Example: `tenant:default:ts:2026-03-15T10:30:00.000Z:cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6`

The value can be empty (or a small metadata JSON) -- the key itself encodes the ordering. The full capture record is fetched via the existing `capture:{captureId}` key.

Decide: ascending (natural ISO) or descending (reverse-timestamp) sort order. My recommendation is ascending ISO for simplicity, with a documented note that order may change with D1 migration.

**Deliverables:** Documented key format decision in the evolution log. Updated `kv.js` with index write functions.

**Dependencies:** R8 (tenantId must be available from auth).

#### Task 4: Implement cursor encoding/decoding

**What:** Create a cursor module that:
- Encodes: takes `{ timestamp, captureId }` and returns a base64url-encoded opaque string
- Decodes: takes an opaque string and returns `{ timestamp, captureId }` or throws on malformed input
- Uses base64url (not base64) to avoid URL-encoding issues in query parameters

**Deliverables:** New module (e.g., `src/cursor.js`) with encode/decode functions and tests.

**Dependencies:** Task 3 (must know what goes into the cursor).

#### Task 5: Implement `listCaptures` KV function

**What:** Add to `kv.js`:
- `listCaptures(kv, tenantId, { limit, cursor, status })` function
- Uses `kv.list({ prefix: 'tenant:{tenantId}:ts:', limit, cursor })` for the index scan
- Parallelizes `getCapture()` calls with `Promise.all()`
- Applies in-memory status filter
- Handles over-fetching when status filter is active (fetch more keys than `limit` to compensate for filtered-out items)
- Returns `{ items, cursor, hasMore }`

**Deliverables:** Updated `kv.js` with the listing function and unit tests.

**Dependencies:** Task 3, Task 4.

#### Task 6: Implement `handleListCaptures` route handler

**What:** Add the handler to `src/index.js`:
- Route: `['GET', /^\/v1\/captures$/, handleListCaptures]` (must be ordered before the `captureId` routes to avoid regex conflicts -- but `/v1/captures` without a trailing segment won't match the captureId regex, so ordering is actually safe)
- Auth check using `verifyApiKey()` with tenantId extraction
- Query parameter validation (limit, cursor, status)
- Calls `listCaptures()` from kv.js
- Builds `CaptureSummary` objects from raw KV records
- Returns `{ data, pagination }` envelope

**Deliverables:** Updated `src/index.js` with new route and handler. Integration tests.

**Dependencies:** Task 4, Task 5, R8 (auth identity enrichment).

#### Task 7: Update `createCapture` to write secondary index

**What:** When `createCapture()` in `kv.js` writes the pending record, also write the secondary index key `tenant:{tenantId}:ts:{ISO}:{captureId}`. The `createCapture` function signature must accept `tenantId` as a parameter (from R8's auth enrichment).

**Deliverables:** Updated `createCapture()` in `kv.js`, updated call sites in `handleCreateCapture`, updated tests.

**Dependencies:** R8 (tenantId available), Task 3 (key format).

#### Task 8: Update 202 response note

**What:** Remove the "No list endpoint is available" warning from the `createCapture` 202 response body and the OpenAPI spec example. Replace with a shorter note or remove the `note` field.

**Deliverables:** Updated `src/index.js` and `openapi.yaml`.

**Dependencies:** Task 6 (list endpoint must be implemented).

#### Task 9: Rate limiting for list endpoint

**What:** Decide whether the list endpoint uses the existing `CAPTURE_RATE_LIMITER` or gets its own limiter. The list endpoint is read-only and cheaper than capture creation, so sharing the capture rate limiter is reasonable for now. If a separate limiter is needed, it can be added later without API changes. Use the existing `VERIFY_RATE_LIMITER` pattern as a model if a separate limiter is created.

**Deliverables:** Rate limiting wired into the handler. Documented decision on limiter reuse.

**Dependencies:** Task 6.


### Risks and Concerns

#### Risk 1: KV list latency with status filtering
When filtering by status, the handler must over-fetch keys and filter in-memory. If a tenant has 1000 captures and only 5 are `pending`, fetching a page of 20 pending captures could require scanning hundreds of index keys. Mitigation: set a scan limit (e.g., max 500 keys scanned per request) and return whatever matches within that budget, with `hasMore: true` indicating more might exist. Document that filtered results are best-effort scans, not exhaustive queries.

#### Risk 2: Cursor invalidation across deployments
If the cursor encoding format changes between deployments, in-flight cursors from clients will fail. Mitigation: version the cursor format (include a version byte in the encoded payload). On decode, handle both old and new formats during a transition period.

#### Risk 3: Secondary index consistency
The secondary index key is written alongside the primary record, but KV does not support atomic multi-key writes. If the primary write succeeds but the index write fails (or vice versa), the data is inconsistent. Mitigation: write the index key first (a dangling index key is harmless -- the `getCapture()` call will return null and the item is skipped), then the primary record. This makes the failure mode "capture exists but is not listed" rather than "listed capture does not exist."

#### Risk 4: Sort order commitment
Choosing ascending (oldest-first) is simpler but may frustrate users who expect newest-first. Choosing descending (reverse-timestamp) adds complexity to the key format. This is a one-way door for KV -- changing sort order later means re-indexing all existing captures. The API contract should not promise a sort order in v1. Document that results are returned in chronological order (ascending) and that sort order may change.

#### Risk 5: Existing captures not indexed
Captures created before R1 ships will not have secondary index keys. They will be invisible to the list endpoint. The issue scope says "Out: migration of existing KV keys (handled in R12)" -- but this means R1 ships with a list endpoint that only shows captures created after R1 deploys. This should be called out in the endpoint documentation: "Only captures created after [date] appear in list results."

#### Risk 6: Route regex ordering
Adding `GET /v1/captures` (without `{captureId}`) alongside `GET /v1/captures/{captureId}` requires careful regex ordering. The `captureId` regex `/^\/v1\/captures\/(cap_[a-f0-9]{32})$/` will NOT match `/v1/captures` (no trailing segment), so the plain `/^\/v1\/captures$/` route can be placed anywhere relative to it without conflict. Still, placing the collection route before the item route in the routes array is conventional.


### Additional Agents Needed

**None required beyond what is likely already planned.** The tasks above are within the scope of api-design-minion (contract), the implementation agent, and the spec authoring role. If the team has a separate **iac-minion** or **edge-minion** who manages Cloudflare Worker configuration (e.g., adding a new rate limiter binding in `wrangler.toml`), they should be consulted for Task 9. Otherwise, the implementation agent handles that as part of the Worker config.
