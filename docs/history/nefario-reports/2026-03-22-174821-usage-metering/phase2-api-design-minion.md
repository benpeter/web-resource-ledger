# Domain Plan Contribution: api-design-minion

## Recommendations

### 1. API Call Counting -- New Dedicated Middleware in index.js, Not Auth or Handlers

**Recommendation**: Add a single `recordApiCall(env, ctx, tenantId)` invocation in the `fetch()` handler of `index.js`, called once per authenticated non-admin request after auth succeeds but before the route handler runs.

**Why not in `verifyApiKey` (auth.js)?**
- `verifyApiKey` is a pure authentication function. Mixing metering into it violates single responsibility and makes testing harder -- you cannot test auth without also testing counter writes.
- `verifyApiKey` is called from multiple contexts (individual handlers, batch handler). Counting inside auth would double-count batch requests (once for the batch call, once per item) unless batch callers explicitly suppress it.
- Auth failures should NOT increment the API call counter. If counting happens inside `verifyApiKey`, you must add conditional logic to skip on failure, which complicates the auth contract.

**Why not in each route handler?**
- Repetitive. Every handler would need the same `recordApiCall` call. One omission means one endpoint is uncounted.
- The existing pattern in `index.js` already centralises cross-cutting concerns (rate limiting, admin auth, CORS) in the `fetch()` dispatch path, not in individual handlers.

**Where exactly**: In the `fetch()` method of `index.js`, in the block at approximately line 260-270 where `matched = true` is set after a route handler match. The counter should fire for authenticated tenant routes only (not `/health`, not `/favicon.ico`, not admin routes). The placement:

```
// After auth succeeds and before/after the handler runs:
// 1. Route match happens
// 2. Handler executes (which calls verifyApiKey internally)
// 3. If response is not 401/403, record the API call
```

However, there is an important subtlety: the current architecture calls `verifyApiKey` *inside* each handler (e.g., `handleCreateCapture` at line 415, `handleBatchCapture` at line 559), not in the central dispatch. This means the central dispatch does not know the tenantId until after the handler returns.

**Practical recommendation**: Since auth is per-handler and the central dispatch does not have tenantId, the cleanest approach is a post-handler pattern. After the route handler returns a response, check if the response carries a tenantId (via a lightweight side-channel). Two options:

- **Option A (preferred)**: Handlers that call `verifyApiKey` stash `tenantId` on a context object passed through. Add a `ctx._usage = { tenantId }` after successful auth in each handler. The central dispatch checks `ctx._usage` after the handler returns and fires `recordApiCall`.
- **Option B**: Accept the repetition -- add `recordApiCall` to each authenticated handler after `verifyApiKey` succeeds. This is 4-5 lines duplicated across ~6 handlers, which is tolerable for a codebase of this size. It has the advantage of being explicit and easy to audit.

**I recommend Option B** for this codebase. The project values KISS and explicitness over DRY abstraction. There are only 6 authenticated endpoints (`handleCreateCapture`, `handleBatchCapture`, `handleListCaptures`, `handleCaptureStatus`, `handleGetCapture`, `handleGetCaptureArtifact`). A single line per handler is clear, auditable, and avoids introducing a hidden side-channel on `ctx`.

**What to count**: Only successful authenticated requests (status 2xx or 4xx with valid auth). Do NOT count:
- Auth failures (401, 403) -- the caller did not consume a metered API call
- Rate limit rejections (429) -- already handled, no additional resource consumed
- Admin endpoints -- admin calls are operational, not tenant-metered
- Unauthenticated endpoints (`/health`, `/.well-known/*`, `/v1/verify/*`)

**How to count**: `ctx.waitUntil(incrementUsage(env.DB, tenantId, 'api_calls', 1))` -- deferred, non-blocking, matching the existing `ctx.waitUntil(log(...))` pattern used everywhere.

### 2. Capture and Storage Counting -- In the Queue Consumer After performCapture Succeeds

**Recommendation**: Increment capture count and storage bytes in `handleCaptureMessage()` in `index.js` (line ~137), immediately after `result.ok === true`, not inside `capture.js`.

**Why not inside `capture.js` after `completeCapture()`?**
- `capture.js` is the rendering pipeline. Its responsibility is "acquire browser, render page, store artifacts, update capture status." Metering is a cross-cutting concern that should not be interleaved with the capture pipeline.
- The queue consumer (`handleCaptureMessage` in `index.js`) is the orchestration layer that already handles retries, DLQ, and status transitions. It is the natural place for "capture completed, now do bookkeeping."
- If metering fails inside `capture.js`, it could interfere with the capture result. Keeping it in the queue consumer means a metering failure does not affect capture success.

**What to record after a successful capture**:
- `captures`: increment by 1
- `storage_bytes`: the total R2 bytes stored for this capture

**Storage byte calculation**: The `waczInfo.size` (WACZ bundle bytes) is available in the `capture.js` return value. However, this only covers the WACZ bundle. Individual R2 artifacts (screenshot, HTML, headers) are also stored. The sizes are:
- `screenshot`: `screenshot.byteLength` (Uint8Array)
- `screenshotBefore`: `screenshotBefore?.byteLength` (may be null)
- `html`: `new TextEncoder().encode(html).byteLength`
- `headers`: `JSON.stringify(headers).length` (UTF-8, so `.length` is a close approximation)
- `waczBytes`: `waczBytes.byteLength`

**Recommendation**: Have `performCapture` return the total stored bytes in its success result. Currently it returns `{ ok: true }`. Extend this to `{ ok: true, storedBytes: <number> }`. This keeps byte calculation inside `capture.js` where the buffer sizes are naturally available, while letting the queue consumer handle the metering write.

**Failed captures**: Do NOT count failed captures toward the capture counter. The success criteria says "capture count" -- a failed capture did not produce a usable result. However, storage bytes for partial/failed captures that wrote R2 artifacts before failing are a legitimate concern. For simplicity, only count fully successful captures. Partial captures (which do store R2 artifacts) could be counted in a future iteration, but the success criteria does not require it.

### 3. Response Shape for GET /v1/admin/usage

**Consistency with existing admin conventions**: Existing admin endpoints return `jsonResponse({ data: [...] }, 200)` for lists and `jsonResponse({ ...fields }, 200|201)` for single-resource responses. The tenant config endpoint returns the config object directly (no `data` wrapper). The keys list endpoint wraps in `{ data: [...] }`.

**Recommendation**: Use a single-object response (not wrapped in `data`) since this is a single-tenant query by default, consistent with `handleGetTenantConfig`:

```json
{
  "tenantId": "acme",
  "period": "2026-03",
  "periodStart": "2026-03-01T00:00:00.000Z",
  "periodEnd": "2026-04-01T00:00:00.000Z",
  "usage": {
    "captures": 142,
    "storageBytes": 734003200,
    "apiCalls": 1847
  },
  "updatedAt": "2026-03-22T14:30:00.000Z"
}
```

**Field rationale**:
- `tenantId`: Echo back the queried tenant (standard practice -- confirms what you asked for).
- `period`: The canonical period string (`YYYY-MM`) for programmatic use.
- `periodStart` / `periodEnd`: ISO 8601 timestamps for unambiguous interpretation. Consumers should not have to re-derive "when does 2026-03 start/end in UTC?" These are derived fields (zero implementation cost) that prevent a class of off-by-one bugs.
- `usage`: Nested object grouping the three counters. Keeps the top level clean and makes it easy to add counters later (e.g., `bandwidth`) without polluting the response root.
- `updatedAt`: Timestamp of the most recent counter update. Communicates freshness. When counters use `waitUntil`, this timestamp tells the consumer how stale the data might be.
- No `consistency` or `lag` field -- the eventual consistency property is documented in the API docs, not encoded in every response. Adding a `"note": "counters are eventually consistent"` to every response is noise.

**Period parameter behavior**:
- `GET /v1/admin/usage?tenant=acme` -- returns current calendar month (UTC). Default to "now" because the common case is checking current usage for quota/billing.
- `GET /v1/admin/usage?tenant=acme&period=2026-03` -- returns the specified month.
- Period format: `YYYY-MM`. Validate strictly: `/^\d{4}-(0[1-9]|1[0-2])$/`. Reject malformed periods with `problemResponse(400, "Parameter 'period' must be in YYYY-MM format")`.
- Future periods: return zeroed counters (not an error). A future period has zero usage -- that is a fact, not an error condition.
- Ancient periods (before service launch): also return zeroed counters. Same reasoning.

**Error cases**:
- Missing `tenant` parameter: `problemResponse(400, "Query parameter 'tenant' is required")`
- Invalid tenant format: `problemResponse(400, "Query parameter 'tenant' must match /^[a-z0-9_-]{1,64}$/")`
- Tenant not found: return zeroed counters with the queried tenantId and period. A tenant with no usage has zero counters -- this is not an error. This avoids leaking tenant existence information and follows the same philosophy as future/ancient periods.

**Headers**: `Cache-Control: private, no-store` (consistent with all admin endpoints via `ADMIN_CACHE`).

### 4. Single-Tenant Queries Only -- No Multi-Tenant Listing

**Recommendation**: Support only `GET /v1/admin/usage?tenant={tenantId}` (single-tenant). Do NOT add a "list all tenants' usage" endpoint.

**Rationale**:
- The success criteria explicitly says "returns current-period usage for a tenant." No multi-tenant listing is required.
- YAGNI. A billing dashboard that needs all tenants' usage will be built in R26 (UI phase). When that happens, the endpoint can be extended with an optional `tenant` parameter (omit = list all). Adding the list variant now means designing pagination, sort order, and aggregation before there is a consumer.
- Single-tenant queries are cheaper to implement and cheaper at runtime. D1 query plans are simpler, no pagination needed, no result set size concerns.
- The admin keys endpoint (`GET /v1/admin/keys`) supports an optional `?tenant=` filter that makes it a list or filtered-list. The usage endpoint can follow the same pattern later -- add `?tenant=` as optional, return `{ data: [...] }` when listing, single object when filtered. But not yet.

**Future extensibility**: When a multi-tenant listing is needed, the endpoint evolves naturally:
- `GET /v1/admin/usage` (no tenant param) → `{ data: [{ tenantId, period, usage }, ...] }`
- `GET /v1/admin/usage?tenant=acme` → single object (current behavior)

This is a non-breaking additive change. The response shape difference (object vs array-in-data) is standard in REST APIs and matches how `GET /v1/admin/keys` already works (returns `{ data: [...] }` with optional tenant filter).

### 5. operationId and Route Convention

**Route**: `GET /v1/admin/usage` -- follows existing admin sub-resource pattern (`/v1/admin/keys`, `/v1/admin/tenants/:id/config`).

**operationId**: `getUsage` -- consistent with `listAdminKeys`, `createAdminKey`, `revokeAdminKey`. The `get` prefix (not `list`) because it returns a single resource (one tenant's usage for one period), not a collection.

**Route regex**: `/^\/v1\/admin\/usage$/` -- no path parameters. Tenant and period are query parameters because they are filters on a single resource type, not hierarchical resource identifiers.

**Why query params not path params?** The resource being queried is "usage" -- tenant and period are attributes that narrow the query. Compare: `/v1/admin/tenants/:id/usage` would make usage a sub-resource of tenants, which implies a collection of usage records under a tenant. That is not wrong, but it adds URL depth without benefit. The flat `/v1/admin/usage?tenant=X&period=Y` is simpler and matches the existing pattern where `GET /v1/admin/keys?tenant=X` uses a query param for tenant filtering.


## Proposed Tasks

### Task 1: Extend performCapture Return Value
- **Deliverable**: `performCapture` returns `{ ok: true, storedBytes: <number> }` on success (currently returns `{ ok: true }`).
- **Why**: Queue consumer needs stored byte count for the storage counter without reaching into capture internals.
- **Dependencies**: None (foundational change).
- **Files**: `src/capture.js`

### Task 2: Add Usage Counter Increment Function in db.js
- **Deliverable**: `incrementUsage(db, tenantId, metric, amount)` function in `db.js` that performs an atomic `INSERT ... ON CONFLICT DO UPDATE SET value = value + ?` on the usage table.
- **Dependencies**: D1 migration (from data-minion) must define the table schema first.
- **Files**: `src/db.js`

### Task 3: Wire Capture + Storage Counting in Queue Consumer
- **Deliverable**: After `result.ok === true` in `handleCaptureMessage()`, fire `ctx.waitUntil(incrementUsage(env.DB, tenantId, 'captures', 1))` and `ctx.waitUntil(incrementUsage(env.DB, tenantId, 'storage_bytes', result.storedBytes))`.
- **Dependencies**: Task 1, Task 2.
- **Files**: `src/index.js`

### Task 4: Wire API Call Counting in Authenticated Handlers
- **Deliverable**: Add `ctx.waitUntil(incrementUsage(env.DB, tenantId, 'api_calls', 1))` to each authenticated endpoint handler (`handleCreateCapture`, `handleBatchCapture`, `handleListCaptures`, `handleCaptureStatus`, `handleGetCapture`, `handleGetCaptureArtifact`) after successful auth.
- **Dependencies**: Task 2.
- **Files**: `src/index.js`

### Task 5: Add getUsage Query Function in db.js
- **Deliverable**: `getUsage(db, tenantId, period)` function that queries the usage table and returns `{ captures, storageBytes, apiCalls, updatedAt }`. Returns zeroed counters if no rows exist.
- **Dependencies**: D1 migration (from data-minion).
- **Files**: `src/db.js`

### Task 6: Implement GET /v1/admin/usage Endpoint
- **Deliverable**: Route handler `handleAdminGetUsage(request, env, ctx)` in `src/admin.js`. Validates `tenant` (required) and `period` (optional, defaults to current month) query params. Returns the response shape defined above. Route entry in `index.js` routes array.
- **Dependencies**: Task 5.
- **Files**: `src/admin.js`, `src/index.js`

### Task 7: Tests
- **Deliverable**: Unit tests for `incrementUsage` and `getUsage` in `test/db.test.js`. Integration test for `GET /v1/admin/usage` in `test/admin-keys.test.js` (or new `test/admin-usage.test.js`). Verify: correct counting, period defaulting, tenant validation, zeroed response for unknown tenants, auth requirement.
- **Dependencies**: Tasks 2, 5, 6.
- **Files**: `test/db.test.js`, `test/admin-usage.test.js`


## Risks and Concerns

### Risk 1: Batch Capture Double-Counting API Calls
`handleBatchCapture` processes N URLs in a single HTTP request. Should it count as 1 API call or N? Recommendation: count as 1 API call (one HTTP request = one API call). The batch endpoint is a convenience for callers; metering it as N calls would penalise efficient API usage. Capture count will naturally be N (one per successful capture). This should be an explicit decision documented in `decisions.md`.

### Risk 2: waitUntil D1 Write Reliability
Counter increments via `ctx.waitUntil` are fire-and-forget. If a D1 write fails (transient error, connection timeout), the counter is permanently under-counted. This is acceptable for "eventually consistent" counters but means usage data is a lower bound, not exact. The iac-minion consultation should confirm whether `waitUntil` D1 writes have any known failure modes beyond standard network errors. If the drop rate is non-trivial, consider a fallback (write to KV, reconcile later).

### Risk 3: Period Boundary Race in Queue Consumer
A capture starts processing at 2026-03-31T23:59:58Z and completes at 2026-04-01T00:00:02Z. Which month gets the capture count? The counter increment happens at completion time. If `incrementUsage` derives the period from `new Date()` at call time, the capture counts toward April. This is correct behavior (the resources were consumed at completion time), but should be documented so billing consumers are not surprised.

### Risk 4: Storage Byte Accuracy
R2 object sizes are known before upload (they are in-memory buffers). However, R2 stores objects with metadata overhead that is not reflected in `byteLength`. The counter tracks logical bytes (what the tenant uploaded), not physical R2 consumption. This is the right choice for billing transparency, but should be documented as "logical content bytes, excluding R2 metadata overhead."

### Risk 5: Admin Endpoint on Existing Admin Auth
The usage endpoint reuses `verifyAdminKey`, which uses a single shared `ADMIN_KEY`. This means any admin key holder can see any tenant's usage. This is the current admin auth model and is acceptable for now, but per-tenant admin scoping (so tenant admins can only see their own usage) is a natural follow-up when admin auth evolves to per-tenant keys (noted in existing TODO at admin.js line 211).


## Additional Agents Needed

None beyond those already identified in the meta-plan. The four consultations (data-minion, api-design-minion, iac-minion, test-minion) plus the cross-cutting UX strategy and documentation consultations cover all dimensions of this task.
