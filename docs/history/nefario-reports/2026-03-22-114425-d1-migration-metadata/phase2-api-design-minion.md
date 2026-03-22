# Domain Plan Contribution: api-design-minion

## Current State Analysis

The existing `GET /v1/captures` endpoint has a well-defined contract documented in `openapi.yaml`:

- **Response shape**: `{ data: [...CaptureSummary], pagination: { cursor, hasMore, limit } }`
- **Query params**: `limit` (1-100, default 20), `cursor` (opaque base64url string), `status` (pending|complete|failed)
- **Pagination**: Cursor-based, wrapping KV's native cursor in a base64url JSON envelope
- **MCP consumer**: `list_captures` tool in `mcp.js` passes `status`, `limit`, `cursor` directly to `listCaptures()` in `kv.js`
- **Admin keys list**: `GET /v1/admin/keys` returns `{ data: [...] }` with no pagination at all -- fetches all keys via `kv.list()` then filters in memory

The MCP tool (`mcp.js` lines 308-383) is the primary internal consumer of `listCaptures`. It accepts `status`, `limit`, and `cursor` via Zod-validated tool input and passes the `pagination.cursor` value back to callers as text.

---

## Recommendations

### 1. Keep cursor-based pagination, do NOT add offset/limit

**Recommendation**: Keep `cursor` as the sole pagination mechanism. Do not introduce `offset`/`limit` (beyond the existing `limit` param that controls page size).

**Rationale**:

- **Cursor is already shipped and documented** in `openapi.yaml` with examples. The MCP tool passes cursor strings back to callers. Removing or deprecating cursor is a breaking change for zero benefit.
- **Offset pagination degrades at scale**. The task spec targets 10K captures, but offset-based `LIMIT N OFFSET M` forces D1/SQLite to scan and discard M rows. At 10K rows with `OFFSET 9980`, that means reading 9980 rows to return 20. Cursor-based pagination with a WHERE clause (`WHERE created_at < ? ORDER BY created_at DESC LIMIT 20`) performs consistently regardless of depth.
- **Offset pagination produces inconsistent results** when rows are inserted or deleted between page fetches (the classic "shifting window" problem). Captures are append-heavy and status transitions happen asynchronously -- offset pagination would produce duplicate or missed captures.
- **D1 makes cursor pagination better, not obsolete**. The current KV cursor wraps KV's opaque internal cursor. With D1, the cursor becomes a `(created_at, capture_id)` tuple encoded as base64url -- semantically the same contract but with superior filtering and consistent performance.
- **The task spec says "offset/limit" but the actual need is "SQL-based filtering and sorting"**. D1 enables WHERE clauses, ORDER BY, and compound indexes -- those are the real wins. The pagination transport mechanism (cursor) is orthogonal.

**Implementation**: Encode the cursor as `base64url(JSON.stringify({ t: createdAt, id: captureId }))`. The WHERE clause becomes `WHERE created_at < ? OR (created_at = ? AND capture_id < ?) ORDER BY created_at DESC, capture_id DESC LIMIT ?`. This is keyset pagination backed by the `(tenant_id, created_at, capture_id)` index.

**What changes in the pagination response**: Nothing. The response shape `{ cursor: string|null, hasMore: boolean, limit: number }` stays identical. The cursor value changes from a KV-internal cursor to a keyset cursor, but since cursors are documented as opaque, this is not a breaking change.

### 2. New query parameters for filtering and sorting

**Supported filter params** (all optional, combinable):

| Param | Type | SQL mapping | Notes |
|-------|------|-------------|-------|
| `status` | enum: pending, complete, failed | `WHERE status = ?` | **Already exists.** No change needed. |
| `url` | string | `WHERE url LIKE ? || '%'` | **Prefix match only.** Contains/regex is too expensive and too easy to abuse. Prefix match is indexed (SQLite optimizes `LIKE 'prefix%'` with B-tree range scan). Useful for "show me all captures of example.com/*". |
| `created_after` | ISO 8601 datetime | `WHERE created_at >= ?` | Inclusive lower bound. |
| `created_before` | ISO 8601 datetime | `WHERE created_at < ?` | Exclusive upper bound (standard half-open interval). |

**Sorting**:

| Param | Type | Default | Notes |
|-------|------|---------|-------|
| `sort` | enum: created_at, -created_at | `-created_at` | Prefix `-` means descending (newest first). No prefix means ascending (oldest first). |

**Why this specific set**:

- **`url` as prefix only**: Contains (`%pattern%`) defeats index usage in SQLite. If full-text URL search is needed later, that is the "full-text search" item explicitly listed as out of scope. Prefix match is sufficient for the common case ("show me captures of this domain") and is index-friendly.
- **No `completed_after`/`completed_before`**: YAGNI. If needed, it can be added later as an additive change. The `created_at` range covers the dominant use case.
- **`sort` limited to `created_at`**: The only indexed temporal column. Sorting by `url` or `status` provides marginal value and would require additional indexes. Keep it simple -- if more sort fields are needed, they can be added as additive changes.
- **No `offset` param**: As argued above, cursor-based keyset pagination with WHERE filters is strictly superior.

**Validation rules** (return 400 Problem Details on failure):
- `url`: minimum 4 characters (scheme minimum: `http`), maximum 200 characters, must not contain `%` (prevents injection of LIKE wildcards)
- `created_after`, `created_before`: must parse as valid ISO 8601 datetime. If both provided, `created_after` must be before `created_before`.
- `sort`: must be exactly `created_at` or `-created_at`. Unknown values return 400.
- Unknown query params: ignore (standard REST tolerance principle). Do not 400 on unexpected params.

### 3. Admin keys list: add pagination only if needed

**Recommendation**: Do NOT add pagination to `GET /v1/admin/keys` in this phase.

**Rationale**:

- The admin keys endpoint is used by operators, not by programmatic consumers like MCP. The total number of API keys per deployment will be in the low tens, not thousands.
- `listApiKeyRecords` in `kv.js` currently fetches all keys and filters in memory. With D1, this becomes `SELECT * FROM api_keys WHERE (tenant_id = ? OR ? IS NULL) AND (revoked = 0 OR ? = 1) ORDER BY created_at` -- a single query that returns all matching rows. At the expected cardinality (<100 keys), this is fine.
- Adding pagination to the admin endpoint increases implementation surface, test surface, and documentation surface for no practical benefit.
- If key counts grow, pagination can be added as a non-breaking additive change (add optional `limit`/`cursor` params, wrap response in pagination envelope). The current `{ data: [...] }` shape is forward-compatible -- adding `pagination` alongside `data` is additive.

### 4. Breaking change analysis

**No breaking changes** are required if the recommendations above are followed. Here is the item-by-item analysis:

| Aspect | Current contract | After D1 migration | Breaking? |
|--------|-----------------|---------------------|-----------|
| Response shape | `{ data, pagination: { cursor, hasMore, limit } }` | Identical | No |
| `cursor` param | Opaque base64url string | Different internal encoding, same opaque contract | No |
| `status` param | enum: pending, complete, failed | Same | No |
| `limit` param | 1-100, default 20 | Same | No |
| New filter params | N/A | `url`, `created_after`, `created_before`, `sort` -- all optional | No (additive) |
| `CaptureSummary` fields | id, status, url, createdAt, completedAt, renderQuality, failedAt, error, retryable | Same | No |
| Admin keys response | `{ data: [...] }` | Same | No |

**One caveat**: existing cursors from the KV implementation will not work with the D1 implementation. Since this is a clean cutover with no external users, this is acceptable. However, the implementation should return a clear 400 error when an old-format cursor is received, not a 500. The cursor decoding logic should detect the old `{ kv: "..." }` format and return `{ error: 'invalid_cursor' }` for graceful handling.

**MCP compatibility**: The MCP `list_captures` tool in `mcp.js` calls `listCaptures()` from `kv.js` (which will become `db.js`). As long as the function signature stays `listCaptures(db, tenantId, { cursor, limit, status })` and the return type stays `{ data, pagination } | { error }`, the MCP tool needs zero changes to its own code. The new filter params (`url`, `created_after`, `created_before`, `sort`) should be added to the MCP tool's Zod schema as optional parameters so MCP callers can use them.

---

## Proposed Tasks

### Task 1: Design keyset cursor encoding for D1

- Define the cursor format: `base64url(JSON({ t: ISO_timestamp, id: capture_id }))`
- Document the keyset WHERE clause pattern for forward and reverse pagination
- Ensure old KV cursors (`{ kv: "..." }` format) are detected and rejected with `{ error: 'invalid_cursor' }`
- **Owner**: Implementation agent (the agent refactoring `kv.js` to `db.js`)
- **Dependency**: D1 schema must be finalized (data-minion Task 1)

### Task 2: Add filter and sort query params to handleListCaptures

- Add `url`, `created_after`, `created_before`, `sort` params with validation
- Wire params through to the D1 query layer
- Maintain existing `status` and `limit` param behavior exactly
- Return 400 Problem Details for invalid values (same pattern as existing `status` validation on line 801-803 of index.js)
- **Owner**: Implementation agent
- **Dependency**: Task 1

### Task 3: Add filter and sort params to MCP list_captures tool

- Add optional Zod schema fields for `url`, `created_after`, `created_before`, `sort`
- Pass through to the refactored `listCaptures()` function
- **Owner**: Implementation agent
- **Dependency**: Task 2

### Task 4: Update openapi.yaml for new query params

- Add `url`, `created_after`, `created_before`, `sort` parameter definitions to `listCaptures` operation
- Update the `Pagination` schema description to note keyset-based cursors (still opaque)
- Add examples showing filtered queries
- **Owner**: software-docs-minion or implementation agent
- **Dependency**: Task 2

---

## Risks and Concerns

### Risk 1: Cursor invalidation on deployment

**Severity**: Low (no external users)
**Description**: When the D1-based code deploys, any in-flight pagination cursors from the KV era will become invalid. The base64url decode will succeed but the payload format differs (`{ kv: ... }` vs `{ t: ..., id: ... }`).
**Mitigation**: The cursor decode logic must check for the expected fields (`t` and `id`) and return `{ error: 'invalid_cursor' }` for anything else. This is a 400, not a 500. Since there are no external users, this is cosmetic -- but clean error handling prevents confusion during testing.

### Risk 2: URL prefix filter performance

**Severity**: Low
**Description**: `LIKE 'prefix%'` is efficient in SQLite when the column is indexed, but only if the prefix is non-trivial. A 1-character prefix like `url=h` would match nearly everything.
**Mitigation**: Enforce minimum 4 characters for the `url` filter param. This ensures at least the scheme (`http`) is provided, making the prefix meaningful.

### Risk 3: Sort direction interaction with cursor pagination

**Severity**: Medium -- tricky to implement correctly
**Description**: Keyset pagination cursors encode a position. If a user changes the `sort` direction between page requests, the cursor becomes meaningless (it points to a position in a different ordering). This is a known footgun with keyset pagination + user-controlled sort.
**Mitigation**: Encode the sort direction in the cursor itself. When the cursor's sort direction does not match the requested sort direction, return `{ error: 'invalid_cursor' }`. Document that changing sort/filter params invalidates the current cursor. This is standard cursor pagination behavior.

### Risk 4: Filter params ignored when cursor is present

**Severity**: Medium -- API contract clarity
**Description**: When paginating with a cursor, should filter params be re-validated against the cursor's original query? For example: page 1 uses `?status=complete&limit=20`, page 2 uses `?cursor=xxx&status=failed` -- should this be an error or should the cursor "win"?
**Mitigation**: **Cursor wins, filters are ignored when cursor is present** (except `limit`, which can change between pages). This is the simplest and most common pattern (used by Stripe, GitHub). Document this behavior. Alternatively, encode the filter set in the cursor and reject mismatches -- but this adds complexity for no practical benefit since the primary consumers (MCP, future UI) will not change filters mid-pagination.

**Revised recommendation after further thought**: Actually, the cleaner approach is to NOT encode filters in the cursor at all. The cursor is purely positional (`created_at`, `capture_id`). Filters are re-applied from query params on every request. This means you CAN change filters between pages (though results may be surprising). This is simpler to implement and test. The cursor just says "start after this row" and the WHERE clause independently says "only show rows matching these filters." This is how offset-based pagination naturally works and users find it intuitive.

---

## Additional Agents Needed

No additional agents are needed for the API design questions. However:

- **security-minion** should review the `url` filter param during Phase 3.5 to ensure the LIKE pattern cannot be exploited for information disclosure across tenants (the tenant_id WHERE clause should prevent this, but it is worth confirming).
- **software-docs-minion** should update the openapi.yaml with the new parameters (Task 4 above).

---

## Summary of Answers to Planning Questions

1. **Cursor vs offset/limit**: Keep cursor-based pagination. Do not add offset. The cursor encoding changes internally (KV cursor to keyset cursor) but the API contract is unchanged. D1 enables better filtering via WHERE clauses, which is the actual win.

2. **New query params**: Add `url` (prefix match, min 4 chars), `created_after` (inclusive ISO datetime), `created_before` (exclusive ISO datetime), `sort` (`created_at` or `-created_at`, default `-created_at`). Keep existing `status` and `limit` unchanged.

3. **Admin keys pagination**: Do not add. Cardinality is too low to justify. The `{ data }` shape is forward-compatible for adding pagination later.

4. **Breaking changes**: None, provided the cursor format change is handled gracefully (old cursors return 400, not 500) and the response envelope stays `{ data, pagination }`. All new params are additive.
