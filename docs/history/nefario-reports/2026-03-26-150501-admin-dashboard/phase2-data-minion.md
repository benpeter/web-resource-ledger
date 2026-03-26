## Domain Plan Contribution: data-minion

### Recommendations

#### 1. Three new DAL functions, not raw queries in admin handlers

The existing `getUsage()` queries one tenant+period. The dashboard needs three
distinct access patterns that should be proper DAL functions in `db.js`, not
ad-hoc `env.DB.prepare()` calls in route handlers. The project rule is:
"No raw env.DB.prepare() calls should exist outside this module" (db.js header,
line 16).

**Function A: `listTenantsWithUsage(db, period)`** -- All tenants with current-period
usage in a single query.

```sql
SELECT
  t.id,
  t.tier,
  t.billing_status,
  t.payment_method_added_at,
  t.stripe_customer_id,
  t.eidas_qualified,
  t.created_at,
  COALESCE(u.capture_count, 0)       AS capture_count,
  COALESCE(u.storage_bytes, 0)       AS storage_bytes,
  COALESCE(u.api_call_count, 0)      AS api_call_count,
  COALESCE(u.eidas_capture_count, 0) AS eidas_capture_count
FROM tenants t
LEFT JOIN usage_counters u
  ON u.tenant_id = t.id AND u.period = ?
ORDER BY t.created_at DESC
```

This is a single D1 round-trip. The `LEFT JOIN` ensures tenants with zero
usage in the period still appear (with zeroed counters). Binding the period
parameter lets the frontend pass `computePeriod()` or any historical period.

At current scale (tens of tenants), this is a full scan of a tiny table --
no index needed. The tenants PK covers the join. The usage_counters composite
PK `(tenant_id, period)` covers the lookup side.

**Function B: `getUsageHistory(db, tenantId, periods)`** -- Historical usage
across multiple periods for a single tenant.

```sql
SELECT period, capture_count, storage_bytes, api_call_count, eidas_capture_count, updated_at
FROM usage_counters
WHERE tenant_id = ?
ORDER BY period DESC
LIMIT ?
```

The `periods` parameter caps the result set (default 12 for trailing 12 months).
No WHERE on specific period values -- just grab the most recent N. The composite
PK `(tenant_id, period)` already serves this query perfectly: D1/SQLite will
do an index range scan on `tenant_id = ?` and walk `period` in order. The
`DESC` direction reverses the scan but requires no additional index because
SQLite B-trees can be traversed in either direction.

Return shape: array of `{ period, captureCount, storageBytes, apiCallCount, eidasCaptureCount, updatedAt }`.

**Function C: `getAggregateStats(db, period)`** -- Overview stats for the
dashboard header.

```sql
SELECT
  (SELECT COUNT(*) FROM tenants) AS total_tenants,
  (SELECT COUNT(*) FROM tenants WHERE payment_method_added_at IS NOT NULL) AS paid_tenants,
  (SELECT COUNT(*) FROM tenants WHERE billing_status != 'active') AS tenants_nonactive_billing,
  (SELECT COALESCE(SUM(u.capture_count), 0) FROM usage_counters u WHERE u.period = ?) AS total_captures,
  (SELECT COALESCE(SUM(u.storage_bytes), 0) FROM usage_counters u WHERE u.period = ?) AS total_storage_bytes,
  (SELECT COALESCE(SUM(u.eidas_capture_count), 0) FROM usage_counters u WHERE u.period = ?) AS total_eidas_captures,
  (SELECT COUNT(*) FROM api_keys WHERE revoked = 0) AS active_api_keys
```

This is a single statement with scalar subqueries. Each subquery hits a
different index (tenants PK, billing_status partial index, usage_counters
composite PK, api_keys PK). At current data volume this is fast. SQLite
executes scalar subqueries efficiently.

#### 2. "Tenants approaching limits" requires computation, not a query

The quota system is not purely in SQL. Free tenants get `FREE_CAPTURE_LIMIT`
(200) unless they have `payment_method_added_at` (then unlimited). Per-tenant
overrides live in the `config` JSON column (`config.quotas.capturesPerMonth`).
Paid tenants with a payment method have `Infinity` quota.

This means "approaching limits" must be computed in JS:
1. `listTenantsWithUsage()` returns all tenants with their current capture count
   and `payment_method_added_at`/`config` columns.
2. For each tenant, call `getEffectiveQuota(hasPaymentMethod, config)` from
   `quotas.js`.
3. Compare `captureCount` to `quota.capturesPerMonth`.
4. Flag tenants where `captureCount / quota.capturesPerMonth >= 0.8` (or
   whatever threshold the dashboard wants).

This is application-layer logic and should live in the admin handler or a
thin helper, not in the DAL. Do NOT try to push this into SQL -- the quota
rules live in JS and must stay there as the single source of truth.

#### 3. No new indexes needed

Current indexes that serve the dashboard queries:

| Query | Index used |
|-------|-----------|
| `listTenantsWithUsage` | `tenants` PK (full scan, tiny table) + `usage_counters` PK `(tenant_id, period)` for join |
| `getUsageHistory` | `usage_counters` PK `(tenant_id, period)` -- range scan |
| `getAggregateStats` | `tenants` PK, `idx_tenants_billing_status` (partial), `usage_counters` PK |
| Paid tenant count | Sequential scan on `tenants` checking `payment_method_added_at IS NOT NULL` -- fast at current scale |

At tens of tenants and months of usage data, all of these are sub-millisecond
on D1. Adding indexes would increase write overhead on every capture without
measurable read benefit. Revisit if tenant count exceeds ~1000.

**One exception to monitor**: if the dashboard queries run frequently and
`tenants` grows, the `payment_method_added_at IS NOT NULL` scan in
`getAggregateStats` could benefit from a partial index. But that is premature
optimization today.

#### 4. Compose existing functions where possible, add new ones for bulk patterns

The existing DAL has the right single-tenant functions (`getUsage`,
`getTenantConfig`, `getTenantBilling`, `tenantExists`). The dashboard should
NOT call these in a loop (N+1 query pattern). Instead:

- `listTenantsWithUsage` replaces N calls to `getUsage` + N calls to
  `getTenantBilling` with one JOIN query.
- `getUsageHistory` replaces N calls to `getUsage(db, tenantId, period)` with
  one range query.
- `getAggregateStats` replaces manual aggregation across multiple queries.

The existing single-tenant functions remain untouched -- they serve their
current callers (capture flow, quota checks, billing webhooks).

#### 5. Include `config` in the tenant list query if needed for quota calculation

If the dashboard needs to show "usage vs. limits" inline (not just raw counts),
the `listTenantsWithUsage` query should also SELECT `t.config`. The handler
then parses each tenant's config JSON and calls `getEffectiveQuota()` to
compute the limit. This avoids a second round-trip per tenant.

Updated query adds `t.config` to the SELECT list. The `config` column is
nullable TEXT containing JSON -- small per row.

#### 6. API shape for the three endpoints

Based on the access patterns, the admin dashboard API should expose:

```
GET /v1/admin/dashboard/tenants?period=YYYY-MM
  -> { data: [{ id, tier, billingStatus, paymentMethodAddedAt, eidasQualified,
                createdAt, captureCount, storageBytes, apiCallCount,
                eidasCaptureCount, effectiveLimit, usagePercent }] }

GET /v1/admin/dashboard/tenants/:tenantId/history?periods=12
  -> { data: [{ period, captureCount, storageBytes, apiCallCount,
                eidasCaptureCount }] }

GET /v1/admin/dashboard/stats?period=YYYY-MM
  -> { totalTenants, paidTenants, tenantsNonactiveBilling, totalCaptures,
       totalStorageBytes, totalEidasCaptures, activeApiKeys }
```

All three use existing `verifyAdminKey` auth and the `admin` rate limiter.
Cache-Control: `private, no-store` (consistent with other admin endpoints).

#### 7. D1 batch for dashboard page load

When the dashboard first loads, the frontend needs both the tenant list AND
aggregate stats. These two queries are independent and can run via
`db.batch()` in a single D1 round-trip:

```js
const [tenantsResult, statsResult] = await db.batch([
  tenantListStatement,
  aggregateStatsStatement,
]);
```

This keeps the initial page load to one D1 call. The history endpoint is
on-demand (user clicks a tenant), so it runs separately.

Alternatively, the frontend can fetch `/dashboard/tenants` and
`/dashboard/stats` in parallel as two HTTP requests. The D1 batch approach
is only relevant if there is a single API endpoint that returns both. Given
the success criterion of "<2 seconds load time", either approach works -- D1
latency for these queries will be <50ms each.

### Proposed Tasks

1. **Add `listTenantsWithUsage(db, period)` to `src/db.js`**
   - LEFT JOIN tenants + usage_counters for given period
   - Return array of tenant objects with zeroed defaults for missing usage
   - Include `config` column for downstream quota calculation
   - Unit test: verify tenants with no usage row appear with zero counts

2. **Add `getUsageHistory(db, tenantId, limit)` to `src/db.js`**
   - Range scan on usage_counters PK for one tenant, ordered by period DESC
   - Default limit 12 (trailing year)
   - Unit test: verify ordering, limit, and empty history

3. **Add `getAggregateStats(db, period)` to `src/db.js`**
   - Single statement with scalar subqueries
   - Unit test: verify counts with mixed tenant states (paid/free/grace/blocked)

4. **Build admin handler for tenant list endpoint**
   - Call `listTenantsWithUsage`, then compute `effectiveLimit` and
     `usagePercent` per tenant using `getEffectiveQuota()`
   - Accept optional `period` query param (default: `computePeriod()`)

5. **Build admin handler for tenant history endpoint**
   - Validate tenantId from path, call `getUsageHistory`
   - Accept optional `periods` query param (default: 12)

6. **Build admin handler for aggregate stats endpoint**
   - Call `getAggregateStats`, accept optional `period` query param

7. **Register routes in `src/index.js`**
   - Three new GET routes under `/v1/admin/dashboard/`
   - All use existing `verifyAdminKey` + admin rate limiter

### Risks and Concerns

**R1: Config JSON parsing in bulk.**
`listTenantsWithUsage` returns the `config` column as raw JSON text for every
tenant. The handler must parse each one to call `getEffectiveQuota()`. At
current scale (tens of tenants) this is negligible. At hundreds of tenants,
the JSON parsing cost is still trivial (<1ms total). Not a real risk but worth
noting for documentation.

**R2: D1 read latency from Worker.**
D1 is co-located with the Worker, but under load, D1 has documented P99
latencies of ~30ms per query. The batch approach (one round-trip for
tenants+stats) keeps worst-case at ~30ms, well within the 2-second target.
The history endpoint adds one more round-trip on user click. No risk here.

**R3: No migration needed.**
All three queries work against the existing schema with existing indexes.
No new migration file is required. This is a pure application-layer change.

**R4: Unbounded tenant list.**
The `listTenantsWithUsage` query returns ALL tenants. If the tenant count
grows to thousands, this query result becomes large. At that point, add
pagination (`LIMIT/OFFSET` or cursor-based). For now, with tens of tenants,
returning all in one response is correct and simple. Do not add pagination
prematurely -- YAGNI.

**R5: Period parameter validation.**
All three endpoints accept a `period` query param. Validate it against the
`/^\d{4}-\d{2}$/` regex (same as `handleAdminGetUsage` already does). Reject
invalid formats with 400. Default to `computePeriod()`.

### Additional Agents Needed

- **api-design-minion**: Should validate the endpoint URL structure
  (`/v1/admin/dashboard/*` vs. extending existing `/v1/admin/*`), response
  envelope consistency with existing admin endpoints, and whether the three
  endpoints should be consolidated into fewer.
- **security-minion**: Should confirm that the existing `verifyAdminKey` +
  admin rate limiter is sufficient for these new endpoints, and that no
  tenant data leakage is possible through the bulk tenant list (all data is
  already available to admin-key holders via individual queries, so this
  should be fine).
- **test-minion**: Should plan tests for the three new DAL functions and
  the three new admin handlers. The DAL tests should use the real D1 test
  pool (not mocks), consistent with the project's testing philosophy.
