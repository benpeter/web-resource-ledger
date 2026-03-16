# Domain Plan Contribution: data-minion

## Recommendations

### 1. Index Key Format: `tenant:{tenantId}:ts:{ISO}:{captureId}`

The proposed format is **well-designed for KV `list(prefix)`**. Here is the evaluation:

**Why it works:**

- `list({ prefix: 'tenant:default:ts:' })` returns all captures for a tenant, sorted lexicographically by key -- which means sorted by timestamp, then by captureId as tiebreaker.
- Adding a `status` filter prefix would break this design (you would need `tenant:default:status:complete:ts:...` AND `tenant:default:ts:...` -- two indexes per capture). Instead, filter by status **after** fetching the key list by doing a `kv.get()` on each result. The issue already acknowledges this cost: "each page of 20 results costs 21 KV operations." This is the correct trade-off at current scale.
- The `captureId` suffix guarantees uniqueness even when two captures share the same millisecond timestamp.

**No changes needed to the proposed format.** It is the right design.

### 2. ISO Timestamp Format for Lexicographic Ordering

Use `new Date().toISOString()` -- which produces `2026-03-16T14:23:45.678Z`. This format sorts correctly lexicographically because:

- Year-month-day-hour-minute-second ordering is naturally left-to-right significant.
- The `Z` suffix is constant (always UTC), so it does not break ordering.
- Milliseconds are included, reducing (but not eliminating) collisions -- the captureId suffix handles the rest.

**Critical requirement:** All timestamps MUST be UTC. `toISOString()` always returns UTC, so this is safe. Never use locale-aware formatting for index keys.

**Recommendation:** Use the same `createdAt` timestamp that is already stored in the capture record value. The index key timestamp and the record's `createdAt` should be identical. Generate the ISO string once and pass it to both the primary record write and the index key write:

```js
const now = new Date().toISOString();
// Used in both: primary record value AND index key
```

This prevents drift where the index key has a slightly different timestamp than the record it points to.

### 3. Primary Key: Keep `capture:{captureId}` As-Is

**Do NOT change the primary key to `tenant:{tenantId}:capture:{captureId}`.**

Reasons:

- **The captureId is already globally unique** (`cap_` + UUID with dashes removed). There is zero collision risk across tenants. Tenant-scoping the primary key adds no data integrity value.
- **The capture ID is the public API identifier.** Endpoints like `GET /v1/captures/{captureId}/status` use the captureId directly. If the primary key included tenantId, every `getCapture()` call would need tenantId as a parameter -- but the status and artifact endpoints are currently unauthenticated (capture ID acts as the access secret). Adding a tenant requirement to these read paths would be a breaking API change.
- **Migration burden for zero benefit.** Changing the primary key format means existing captures become unreachable under the new key pattern. The issue explicitly defers migration to R12.
- **The secondary index already provides tenant scoping.** Listing by tenant uses the index; direct capture access uses the primary key. These are independent access patterns and should use independent key designs.

**Conclusion:** Primary keys stay as `capture:{captureId}`. Only the new secondary index keys include tenant scope.

### 4. Dual-Write Consistency

Cloudflare KV has no transactions. Writing two keys (primary + index) is two independent operations. Here is the failure analysis:

**Scenario A: Primary write succeeds, index write fails.**
- The capture exists and works end-to-end (status checks, artifact retrieval, verification).
- The capture does NOT appear in `GET /v1/captures` listings.
- **Impact:** Low. The user still has the captureId from the 202 response. This is the same situation as all pre-R1 captures.
- **Detection:** The capture record exists but has no corresponding index key. A future migration/repair job (R12) can detect and backfill these.

**Scenario B: Index write succeeds, primary write fails.**
- This cannot happen in the current flow. The primary write (`createCapture`) happens BEFORE returning 202 to the user. If it fails, the handler returns 500 and never writes the index.
- If we restructure to write both in parallel, this scenario becomes possible: a dangling index key pointing to a nonexistent capture. The list endpoint would return the captureId, but `getCapture()` would return null. The list handler should treat this as a skip (filter out nulls from the batch get).

**Recommended write order:**

```
1. Write primary record (createCapture) -- fail fast, return 500 if this fails
2. Write index key -- fire-and-forget via ctx.waitUntil() OR write synchronously
```

I recommend **synchronous sequential writes** for both, with the index write happening immediately after the primary write and before returning 202. The reasoning:

- Both writes are fast (KV puts are <10ms).
- Writing the index synchronously ensures that captures appear in listings as soon as the 202 is returned. Users calling `GET /v1/captures` immediately after `POST /v1/captures` will see the new capture.
- Making the index write fire-and-forget via `ctx.waitUntil()` creates a race condition where a list request between the 202 response and the index write misses the capture.

If the index write fails after the primary write succeeds, **log a warning and still return 202.** The capture is functional; it just does not appear in listings. This is an acceptable degradation.

```js
// In createCapture (or a new wrapper function):
try {
  await kv.put(`capture:${captureId}`, JSON.stringify(value), { expirationTtl: PENDING_TTL });
} catch (e) {
  throw e; // Caller returns 500
}

try {
  await kv.put(`tenant:${tenantId}:ts:${createdAt}:${captureId}`, '', { expirationTtl: PENDING_TTL });
} catch (e) {
  // Log warning, do not throw -- primary record exists, capture is functional
}
```

**Index key value:** The index key's value should be **empty string** (`''`). The key itself contains all the information needed (captureId extracted from the key suffix). Storing data in the index value wastes KV storage and creates a synchronization problem if the primary record is updated but the index value is not.

**Index key TTL:** The index key for a pending capture should have the same `expirationTtl: 86400` as the primary record. When the capture completes, the index key must be re-written without TTL (same pattern as the primary record in `completeCapture`). When the capture fails, the index key should also be re-written without TTL to match the primary record's persistence behavior. This means `completeCapture` and `failCapture` must also update the index key.

### 5. Existing Data Migration: Acceptable to Defer

**Yes, it is acceptable** that old captures will not appear in `GET /v1/captures` listings. The reasoning:

- The issue explicitly says migration is out of scope (handled in R12).
- Currently there is no list endpoint at all. The 202 response literally warns: "No list endpoint is available. Store the capture ID -- it is the only way to access this capture." Moving from "no listing at all" to "listings for new captures only" is a strict improvement.
- Old captures remain fully accessible via their direct URLs (`/v1/captures/{captureId}`, `/v1/captures/{captureId}/status`, etc.). No functionality is lost.
- R12 (per-tenant API keys and tenant isolation) is the natural point to backfill index keys, since that is when tenant assignment for existing captures must be decided anyway.

**One guardrail:** The `GET /v1/captures` response should NOT claim to be exhaustive. The API documentation should note that only captures created after this feature was deployed appear in listings. The OpenAPI spec description for the endpoint should mention this.

## Proposed Tasks

### Task 1: Add `tenantId` to `verifyApiKey()` return value
- Change `{ ok: true }` to `{ ok: true, tenantId: 'default' }`.
- No change to the failure path.
- Update JSDoc and type annotations.

### Task 2: Thread `tenantId` through handler call sites
- `handleCreateCapture` destructures `tenantId` from auth result.
- Pass `tenantId` to `createCapture()` and to log calls.

### Task 3: Update `createCapture()` to accept `tenantId` and write index key
- Add `tenantId` parameter (with default `'default'` for backward compatibility during migration).
- Generate `createdAt` timestamp once, use for both record value and index key.
- Write primary record first, then index key. Index write failure logs warning, does not throw.
- Index key: `tenant:{tenantId}:ts:{createdAt}:{captureId}` with value `''` and same TTL.

### Task 4: Update `completeCapture()` and `failCapture()` to update index key TTL
- Both functions already read the existing record to get its fields. Extract `createdAt` and (new) `tenantId` from the existing record.
- Re-write the index key without TTL (matching primary record persistence behavior).
- Store `tenantId` in the primary record value so it is available for index key reconstruction during complete/fail.

### Task 5: Add `tenantId` to log entries
- All log calls that include `captureId` should also include `tenantId`.
- Security log entries (auth failures) should log tenantId as `null` or omit it (auth failed, no tenant identified).

### Task 6: Implement `listCaptures()` in kv.js
- New function: `listCaptures(kv, tenantId, { cursor, limit, status })`.
- Uses `kv.list({ prefix: 'tenant:{tenantId}:ts:', cursor, limit })`.
- For each returned key, extract captureId from key suffix, call `getCapture()` to fetch full record.
- If `status` filter is specified, filter records after fetch. Over-fetch to fill the page (request `limit * 2` keys from KV, filter, return up to `limit` records, adjust cursor).
- Return `{ data: [...records], pagination: { cursor, hasMore } }`.

### Task 7: Implement `GET /v1/captures` route handler
- Add route to the routes array in index.js.
- Require Bearer auth (call `verifyApiKey()`).
- Parse query params: `cursor`, `limit` (default 20, max 100), `status` (optional, validate against known values).
- Call `listCaptures()` with tenantId from auth result.
- Return envelope: `{ data, pagination: { cursor, hasMore } }`.

### Task 8: Tests
- Unit tests for `createCapture` with tenantId (verify both primary and index keys written).
- Unit tests for `completeCapture`/`failCapture` updating index key TTL.
- Unit tests for `listCaptures` (empty list, pagination, status filter, cursor).
- Integration tests for `GET /v1/captures` (auth required, pagination, filtering).
- Edge case: index key exists but primary record missing (should be filtered from results).

## Risks and Concerns

### Risk 1: Status filtering with over-fetch is O(n) worst case
If a tenant has 1000 captures but only 5 are `complete`, filtering by `status=complete` with a page size of 20 could require scanning all 1000 index keys. At current scale (single operator, likely <100 captures), this is not a problem. The issue acknowledges D1 as the future path for rich filtering. **Mitigation:** Document the limitation. Set a maximum scan depth (e.g., 200 keys) and return a partial page if the depth is exceeded, with a `hasMore: true` cursor for the client to continue.

### Risk 2: Index key orphaning on `completeCapture`/`failCapture` failure
If the primary record is updated to `complete` (TTL removed) but the index key re-write fails, the index key retains its 24h TTL and will expire. The capture disappears from listings after 24 hours even though it exists. **Mitigation:** The index key re-write in complete/fail is best-effort. Log failures. R12 migration can detect and repair orphaned records. The probability is low (two sequential KV writes in a Worker that is already running).

### Risk 3: KV eventual consistency
Cloudflare KV is eventually consistent globally (writes propagate to edge within ~60 seconds). A capture created in one region may not appear in `GET /v1/captures` from another region for up to 60 seconds. This is inherent to KV and cannot be mitigated without changing storage backends. At single-operator scale, this is irrelevant. **Document it in the API response or OpenAPI spec.**

### Risk 4: `list()` returns keys sorted lexicographically, which is newest-last
KV `list()` returns keys in ascending lexicographic order. Since ISO timestamps sort chronologically ascending, the first results are the oldest captures. Users typically want newest-first. KV does not support reverse ordering.

**Options:**
- **(A) Accept oldest-first ordering.** Simplest. Unusual UX but functional.
- **(B) Reverse the timestamp in the key.** Use `9999-12-31T23:59:59.999Z` minus the actual timestamp to create a descending sort key. This is a well-known trick but makes keys harder to read and debug.
- **(C) Fetch all keys and reverse in memory.** Not feasible at scale.

**Recommendation:** Use **(B) reversed timestamps** for the index key. The key format becomes `tenant:{tenantId}:ts:{reversedISO}:{captureId}` where `reversedISO` is computed as `new Date('9999-12-31T23:59:59.999Z').getTime() - new Date(createdAt).getTime()`, zero-padded to a fixed width. This gives newest-first ordering which is the expected behavior for a chronological listing.

However, this adds complexity. If the team prefers simplicity (per the KISS principle in the manifesto), option **(A)** is acceptable for MVP -- the client can reverse the array, and the cursor still works correctly. The API contract does not promise a specific sort order; it can be documented as "chronological ascending" and changed later if D1 migration happens.

**My final recommendation: go with (A) oldest-first for now.** YAGNI. The ISO timestamp sorts correctly ascending. Document the sort order. If newest-first becomes a requirement, it is a straightforward change in R12 when the index is rebuilt anyway.

### Risk 5: captureId extraction from key suffix
The `listCaptures` function must parse the captureId from the index key. The key format `tenant:default:ts:2026-03-16T14:23:45.678Z:cap_abc123` contains colons in both the fixed prefix and the ISO timestamp. Use a known prefix length or split from the right.

**Recommendation:** Use `key.split(':').pop()` to extract the captureId -- it is always the last colon-delimited segment and contains no colons itself (it is `cap_` + 32 hex characters). Alternatively, since the captureId format is fixed (`cap_[a-f0-9]{32}`), use a regex: `key.match(/cap_[a-f0-9]{32}$/)?.[0]`.

## Additional Agents Needed

- **api-design-minion**: Needs to define the exact response envelope for `GET /v1/captures`, query parameter validation rules, error responses for invalid cursors/limits, and OpenAPI spec updates. The pagination contract (cursor opaqueness, page size limits, sort order documentation) should be designed by API specialists.
- **security-minion**: Should review whether `GET /v1/captures` introduces any information disclosure risks. Currently, capture IDs act as access secrets -- listing all captures for a tenant behind Bearer auth is a different access model. Confirm that listing does not weaken the security posture for individual capture access (which remains unauthenticated by design).
- **observability-minion**: Should define what operational metrics to add for the list endpoint (latency, KV operations per request, over-fetch ratio for filtered queries).
