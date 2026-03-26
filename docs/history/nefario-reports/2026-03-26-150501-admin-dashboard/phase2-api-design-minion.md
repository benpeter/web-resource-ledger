## Domain Plan Contribution: api-design-minion

### Recommendations

#### Endpoint Strategy: Three Focused Endpoints, Not One Mega-Endpoint

After reading the existing admin API surface (`src/admin.js`, `src/index.js` route table, `src/db.js` DAL, and the schema migrations), I recommend **three new GET endpoints** rather than a single enriched `/v1/admin/tenants` with query params. Here is why:

1. **The existing API already uses purpose-specific endpoints.** Usage lives at `/v1/admin/usage`, config at `/v1/admin/tenants/:id/config`, keys at `/v1/admin/keys`. The codebase does not use "fat" endpoints that return everything -- each endpoint returns one well-scoped resource shape. The dashboard API should follow the same grain.

2. **The <2s requirement is best met with parallel client-side fetches, not a single slow query.** A single endpoint that JOINs tenants + usage_counters + api_keys for all tenants executes one large D1 query that cannot be parallelized. Three focused queries can execute in parallel on both the client side (via `Promise.all` of fetch calls) and the D1 side (via `db.batch`). D1 round-trip is the bottleneck -- batching avoids serial latency.

3. **A single enriched endpoint mixes concerns that change at different rates.** Tenant list is near-static (changes on onboarding), usage changes every capture, aggregate stats are derived. Different cache-invalidation needs, different query costs.

#### Proposed Endpoints

**1. `GET /v1/admin/tenants` -- Tenant List with Embedded Usage**

This is the main dashboard endpoint. Returns all tenants with their current-period usage and billing state inlined. Despite the "separate endpoints" principle above, usage-per-tenant is always needed alongside the tenant list, so a single JOIN is justified here to avoid N+1 fetches.

```
GET /v1/admin/tenants
```

Response:
```json
{
  "data": [
    {
      "tenantId": "acme-corp",
      "tier": "free",
      "billingStatus": "active",
      "hasPaymentMethod": false,
      "eidasQualified": false,
      "createdAt": "2025-11-01T12:00:00.000Z",
      "currentPeriod": {
        "period": "2026-03",
        "captureCount": 142,
        "eidasCaptureCount": 0,
        "storageBytes": 524288000,
        "apiCallCount": 890
      },
      "quota": {
        "capturesPerMonth": 200,
        "storageBytes": 1073741824
      },
      "keyCount": 2
    }
  ],
  "meta": {
    "totalTenants": 12,
    "period": "2026-03"
  }
}
```

Design rationale:
- **Inline `currentPeriod` instead of separate usage call**: The tenant list without usage numbers is useless for a dashboard. This avoids N tenant-specific usage fetches.
- **`quota` computed server-side**: Uses the existing `getEffectiveQuota()` from `quotas.js`. The dashboard should not reimplement quota logic.
- **`keyCount` instead of full key list**: Dashboard overview needs "how many keys does this tenant have", not the full key records. Full keys are already available at `GET /v1/admin/keys?tenant=X`.
- **`hasPaymentMethod` boolean**: Derived from `payment_method_added_at IS NOT NULL`. The dashboard cares about the boolean, not the timestamp.
- **No pagination**: The tenant count is small (tens, not thousands). A simple array is appropriate until tenant count grows past ~500. The SQL query (`SELECT ... FROM tenants LEFT JOIN usage_counters`) is indexed and will execute in single-digit milliseconds for this scale.
- **`meta.period`**: Makes the current billing period explicit so the UI does not need to compute it.

SQL implementation sketch (single D1 query):
```sql
SELECT
  t.id, t.tier, t.billing_status, t.grace_period_end,
  t.payment_method_added_at, t.eidas_qualified, t.config, t.created_at,
  uc.capture_count, uc.eidas_capture_count, uc.storage_bytes, uc.api_call_count,
  (SELECT COUNT(*) FROM api_keys ak WHERE ak.tenant_id = t.id AND ak.revoked = 0) AS key_count
FROM tenants t
LEFT JOIN usage_counters uc ON uc.tenant_id = t.id AND uc.period = ?
ORDER BY t.created_at DESC
```

This is a single round-trip. The correlated subquery for `key_count` is fine at this scale (D1 SQLite handles it in microseconds per tenant).

**2. `GET /v1/admin/tenants/:id` -- Tenant Detail with Usage History**

Per-tenant drill-down. Combines tenant metadata, config, and usage history across multiple periods into one response.

```
GET /v1/admin/tenants/:id
GET /v1/admin/tenants/:id?periods=6
```

Query parameters:
- `periods` (optional, default `6`, max `24`): Number of recent monthly periods to include in `usageHistory`.

Response:
```json
{
  "tenantId": "acme-corp",
  "tier": "free",
  "billingStatus": "active",
  "gracePeriodEnd": null,
  "hasPaymentMethod": false,
  "paymentMethodAddedAt": null,
  "stripeCustomerId": null,
  "eidasQualified": false,
  "config": { "rateLimit": { "rpm": 30 } },
  "createdAt": "2025-11-01T12:00:00.000Z",
  "updatedAt": "2026-03-15T09:30:00.000Z",
  "quota": {
    "capturesPerMonth": 200,
    "storageBytes": 1073741824
  },
  "keys": [
    {
      "keyHash": "a1b2c3...",
      "name": "production",
      "scopes": ["capture", "read"],
      "createdAt": "2025-11-01T12:00:00.000Z",
      "createdBy": "admin"
    }
  ],
  "usageHistory": [
    { "period": "2026-03", "captureCount": 142, "eidasCaptureCount": 0, "storageBytes": 524288000, "apiCallCount": 890 },
    { "period": "2026-02", "captureCount": 200, "eidasCaptureCount": 5, "storageBytes": 480000000, "apiCallCount": 1200 },
    { "period": "2026-01", "captureCount": 180, "eidasCaptureCount": 0, "storageBytes": 450000000, "apiCallCount": 1050 }
  ]
}
```

Design rationale:
- **Full key list here, not on the list endpoint**: Detail view is where the operator manages keys. Reuses the same shape as `GET /v1/admin/keys?tenant=X` but embedded (saves a round-trip).
- **`usageHistory` is ordered newest-first**: Matches the dashboard display order.
- **`periods` query param**: Defaults to 6 months, enough for a trend chart. Capped at 24 to prevent unbounded queries. The SQL is a simple `ORDER BY period DESC LIMIT ?` on the indexed composite PK.
- **Config included**: Saves the UI from a separate `GET /v1/admin/tenants/:id/config` call.

SQL implementation (two-statement batch):
```sql
-- Statement 1: tenant + current-period
SELECT t.*, uc.capture_count, uc.storage_bytes, uc.api_call_count, uc.eidas_capture_count
FROM tenants t
LEFT JOIN usage_counters uc ON uc.tenant_id = t.id AND uc.period = ?
WHERE t.id = ?

-- Statement 2: usage history
SELECT period, capture_count, eidas_capture_count, storage_bytes, api_call_count
FROM usage_counters
WHERE tenant_id = ?
ORDER BY period DESC
LIMIT ?

-- Statement 3: keys (active only)
SELECT key_hash, name, scopes, created_at, created_by
FROM api_keys
WHERE tenant_id = ? AND revoked = 0
ORDER BY created_at DESC
```

Three statements in one `db.batch()` -- single D1 round-trip.

**3. `GET /v1/admin/overview` -- Aggregate Platform Stats**

Top-of-dashboard summary numbers. The dashboard renders these as hero cards before the tenant list.

```
GET /v1/admin/overview
```

Response:
```json
{
  "totalTenants": 12,
  "totalCapturesCurrentPeriod": 4520,
  "totalCapturesAllTime": 45000,
  "totalStorageBytes": 21474836480,
  "tenantsByTier": {
    "free": 8,
    "pro": 4
  },
  "tenantsByBillingStatus": {
    "active": 10,
    "grace_period": 1,
    "blocked": 1
  },
  "period": "2026-03"
}
```

Design rationale:
- **Separate from tenant list**: Aggregate queries are cheap and static enough to be worth isolating. The dashboard loads this in parallel with the tenant list.
- **No per-tenant detail**: This is a single-row aggregate, not a collection.
- **`tenantsByTier` and `tenantsByBillingStatus`**: These are `GROUP BY` aggregates that tell the operator whether the platform is healthy at a glance.
- **`totalCapturesAllTime`**: `SUM(capture_count)` across all periods. Useful for growth tracking.

SQL implementation (single batch):
```sql
-- Statement 1: tenant counts by tier and billing status
SELECT
  COUNT(*) AS total_tenants,
  SUM(CASE WHEN tier = 'free' THEN 1 ELSE 0 END) AS free_count,
  SUM(CASE WHEN tier = 'pro' THEN 1 ELSE 0 END) AS pro_count,
  SUM(CASE WHEN billing_status = 'active' THEN 1 ELSE 0 END) AS active_count,
  SUM(CASE WHEN billing_status = 'grace_period' THEN 1 ELSE 0 END) AS grace_count,
  SUM(CASE WHEN billing_status = 'blocked' THEN 1 ELSE 0 END) AS blocked_count
FROM tenants

-- Statement 2: current period captures + all-time + total storage
SELECT
  SUM(CASE WHEN period = ? THEN capture_count ELSE 0 END) AS current_period_captures,
  SUM(capture_count) AS all_time_captures,
  SUM(CASE WHEN period = ? THEN storage_bytes ELSE 0 END) AS current_period_storage
FROM usage_counters
```

Two statements, one `db.batch()`, one D1 round-trip.

#### Dashboard Load Pattern

The UI should fire three requests in parallel on page load:

```
Promise.all([
  fetch('/v1/admin/overview'),
  fetch('/v1/admin/tenants'),
  // Per-tenant detail loaded on drill-down click, NOT on initial load
])
```

This keeps initial load to two parallel D1 round-trips (one for overview, one for tenants). Each should complete well under 1 second. The per-tenant detail endpoint is only hit when the operator clicks into a specific tenant.

#### Consistency with Existing API Patterns

Every recommendation below matches a pattern already established in the codebase:

| Pattern | Existing Precedent | Dashboard Endpoints |
|---|---|---|
| `Cache-Control: private, no-store` | `ADMIN_CACHE` constant in `admin.js` line 28 | All three endpoints use `ADMIN_CACHE` |
| Error responses via `problemResponse()` | All admin handlers | Same |
| `{ data: [...] }` wrapper for collections | `handleAdminListKeys` line 197 | `GET /v1/admin/tenants` uses `{ data, meta }` |
| Direct object for single resources | `handleAdminGetUsage` line 366 | `GET /v1/admin/tenants/:id` and `/overview` |
| Query param validation with `problemResponse(400, ...)` | `handleAdminGetUsage` lines 322-338 | `periods` param on detail endpoint |
| Admin auth via `verifyAdminKey` | `index.js` line 543 | All three endpoints behind same gate |
| Admin rate limit via `ADMIN_RATE_LIMITER` | `index.js` line 527+ | Same limiter applies |
| Logging via `ctx.waitUntil(log(...))` | All admin handlers | Same pattern |
| camelCase response fields | All existing responses | Same |
| `TENANT_ID_RE` validation on path params | `handleAdminGetUsage` line 326 | Route regex already validates `[a-z0-9_-]{1,64}` |

#### What NOT to Build

- **No WebSocket/SSE for live updates.** The dashboard is an operator tool, not a real-time monitoring console. A browser refresh (or a 30-second polling interval if desired later) is perfectly adequate. Adding WebSocket support would be overengineering.
- **No pagination on the tenant list.** Tenant count is small. Adding cursor/offset pagination now would be YAGNI. When tenant count grows past ~500, add `?limit=50&cursor=X` as an additive change (backward compatible).
- **No caching layer.** `Cache-Control: private, no-store` is correct for admin data. Caching admin data in Workers KV or CF Cache would add complexity for negligible latency gain (D1 queries on small tables are already sub-50ms).
- **No separate `/v1/admin/stats` or `/v1/admin/metrics` endpoint.** The overview endpoint covers this. If Prometheus-style metrics are needed later, that is a different concern (Coralogix handles it).

#### Relationship to Existing Endpoints

The new endpoints complement but do not replace existing ones:

| Existing Endpoint | Still Needed? | Why |
|---|---|---|
| `GET /v1/admin/usage?tenant=X&period=Y` | Yes | Specific single-tenant, single-period queries for scripting/automation. Dashboard detail endpoint serves a different use case (multi-period history). |
| `GET /v1/admin/tenants/:id/config` | Yes | Used by automation scripts to read/write config. Dashboard detail endpoint includes config read-only but does not replace the dedicated config endpoint. |
| `GET /v1/admin/keys` | Yes | Full key management with revoked key visibility. Dashboard embeds a subset. |

No existing endpoints need modification.

### Proposed Tasks

1. **Add DAL functions to `db.js`**
   - `listTenantsWithUsage(db, period)` -- executes the tenant list + current usage JOIN query
   - `getTenantDetail(db, tenantId, periodCount)` -- batches tenant row, usage history, and active keys
   - `getOverviewStats(db, period)` -- batches aggregate counts
   - All functions use `db.batch()` for single round-trip execution

2. **Add handler functions in `src/admin.js`** (or a new `src/admin-dashboard.js` if the file is getting long)
   - `handleAdminListTenants` -- calls `listTenantsWithUsage`, computes `quota` per tenant using `getEffectiveQuota()`
   - `handleAdminGetTenant` -- calls `getTenantDetail`, validates `periods` query param
   - `handleAdminGetOverview` -- calls `getOverviewStats`
   - All handlers follow existing patterns: `ADMIN_CACHE`, `ctx.waitUntil(log(...))`, `problemResponse` for errors

3. **Register routes in `src/index.js` route table**
   - `['GET', /^\/v1\/admin\/tenants$/, handleAdminListTenants]`
   - `['GET', /^\/v1\/admin\/tenants\/([a-z0-9_-]{1,64})$/, handleAdminGetTenant]`
   - `['GET', /^\/v1\/admin\/overview$/, handleAdminGetOverview]`
   - Note: `GET /v1/admin/tenants/:id` must be registered AFTER `GET /v1/admin/tenants/:id/config` to avoid shadowing (regex specificity -- the `/config` suffix is more specific, so order does not actually matter with regex matching, but document the intent)

4. **Write tests**
   - Test each DAL function with D1 fixture data
   - Test each handler for correct response shape, `Cache-Control` header, error cases (invalid period, unknown tenant 404)
   - Test that overview aggregates are correct after inserting known usage data

### Risks and Concerns

1. **Route collision: `GET /v1/admin/tenants/:id` vs `GET /v1/admin/tenants/:id/config`**
   The existing `GET /v1/admin/tenants/:id/config` route uses regex `^\/v1\/admin\/tenants\/([a-z0-9_-]{1,64})\/config$`. The new `GET /v1/admin/tenants/:id` would use `^\/v1\/admin\/tenants\/([a-z0-9_-]{1,64})$`. These do not conflict because the `$` anchor prevents the shorter regex from matching paths with `/config` suffix. However, the route order in the `routes` array matters if both regexes could match (they cannot in this case). Add a comment noting the relationship.

2. **D1 query performance at scale**
   The LEFT JOIN query for tenant list with usage is fine at tens of tenants. At hundreds, the correlated `key_count` subquery could slow down. Mitigation: the subquery operates on the `idx_api_keys_tenant` index (already exists, see migration 0001). No new indexes needed now. If performance degrades later, denormalize `key_count` into the tenants table.

3. **`admin.js` is already 496 lines**
   Adding three more handlers (each ~40-60 lines) pushes it toward 650+ lines. Consider whether the dashboard handlers belong in a new file (`src/admin-dashboard.js`) to keep modules focused. The existing file is scoped to "API key management" per its header comment. Dashboard endpoints are a different concern.

4. **`getEffectiveQuota()` requires parsing tenant config JSON per row**
   For the tenant list endpoint, quota computation happens per tenant. With the config stored as a JSON string in D1, each row requires `JSON.parse()`. At tens of tenants this is negligible. At hundreds, it is still negligible (JSON.parse of small objects is sub-microsecond). Not a real risk, but worth noting.

5. **No tenant list endpoint existed before**
   The `tenants` table has no `SELECT * FROM tenants` query anywhere in the codebase today. Every query filters by `id`. The new list query is a new access pattern. Ensure it uses an efficient scan (the table is small, so a full table scan is fine; no new index needed).

6. **ADMIN_RATE_LIMITER (5 req/60s per IP)**
   The dashboard UI makes 2 parallel requests on load, plus 1 per drill-down. At 5 req/60s, an operator who drills into 3 tenants in a minute will hit the limit. The rate limiter should either be raised for dashboard endpoints or the dashboard should batch requests. Recommendation: **raise the admin rate limit to 20 req/60s** or exempt GET-only dashboard endpoints from the stricter limit. This is a functional risk that will frustrate operators if not addressed.

### Additional Agents Needed

- **Frontend/UI agent**: To build the dashboard HTML/JS that consumes these endpoints. The UI should use vanilla JS (per project philosophy), fire parallel fetches, and render a table with drill-down. The agent needs the endpoint contracts defined here.
- **Testing agent**: To write the Vitest tests for the new DAL functions and handlers, following the existing pattern in `test/` (using `@cloudflare/vitest-pool-workers` with real D1).
- **No spec agent needed at this stage**: These are internal admin endpoints, not public API. OpenAPI spec authoring can wait until the admin API is stabilized. The response shapes documented above serve as the contract for now.
