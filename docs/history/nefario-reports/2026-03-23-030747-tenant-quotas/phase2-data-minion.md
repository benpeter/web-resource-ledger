## Domain Plan Contribution: data-minion

### Recommendations

#### (a) `tier` should be a new column on the `tenants` table, not inside `config` JSON

**Recommendation: Add a `tier TEXT NOT NULL DEFAULT 'free'` column to the `tenants` table.**

Rationale:

1. **Query performance.** The quota check is on the hot path (before every capture). It needs to JOIN `tenants.tier` with `usage_counters` in a single statement. If `tier` lives inside the `config` JSON blob, you must use `json_extract(config, '$.tier')` in the WHERE/JOIN clause. SQLite's `json_extract` works but cannot be indexed, and it adds parsing overhead on every call. A real column with a CHECK constraint is both faster and indexable if needed later.

2. **Schema contract.** `tier` is not optional configuration -- it is a core business attribute of every tenant. The `config` column is designed for optional, evolving settings (rate limit overrides, future feature flags). Tier determines billing and access rights. It deserves a NOT NULL column with a CHECK constraint (`CHECK (tier IN ('free', 'pro'))`) so the database enforces data integrity.

3. **Consistency with existing patterns.** The tenants table already has structured columns (`id`, `created_at`, `updated_at`, `updated_by`) and delegates only truly flexible data to `config`. Tier is not flexible -- it has a fixed set of valid values.

4. **Auto-provisioning default.** The existing `INSERT OR IGNORE INTO tenants (id) VALUES (?)` pattern (used in `createCapture`, `createApiKeyRecord`, `createWebhook`, `createGitHubUser`) auto-creates tenants with default values. Adding `tier TEXT NOT NULL DEFAULT 'free'` means every auto-provisioned tenant gets `free` tier automatically with zero code changes to the four existing INSERT OR IGNORE call sites.

Migration (0005):
```sql
ALTER TABLE tenants ADD COLUMN tier TEXT NOT NULL DEFAULT 'free'
  CHECK (tier IN ('free', 'pro'));
```

Note: SQLite (and D1) does not support adding CHECK constraints in ALTER TABLE ADD COLUMN. The CHECK must be enforced at the application layer, with the column added as:
```sql
ALTER TABLE tenants ADD COLUMN tier TEXT NOT NULL DEFAULT 'free';
```
Application-layer validation in `setTenantConfig` / a new `setTenantTier` function enforces the allowed values.

#### (b) Default quota limits per tier should live in code, not D1

**Recommendation: A constant map in a `src/quotas.js` module.**

```js
export const TIER_QUOTAS = {
  free: { capturesPerMonth: 100, storageBytes: 1 * 1024 * 1024 * 1024 },
  pro:  { capturesPerMonth: 5000, storageBytes: 50 * 1024 * 1024 * 1024 },
};
```

Rationale:

1. **Zero-latency access.** Tier defaults are read on every capture request. Fetching them from D1 adds a round-trip that provides no value -- these values change with code releases, not at runtime.

2. **Consistency with existing pattern.** `RATE_LIMITS` in `src/rate-limits.js` already follows this exact pattern: a constant map of defaults in code, with per-tenant overrides in D1 config. Quota limits are the same class of setting.

3. **Deployment atomicity.** When you change tier limits, you want the new limits and any code that depends on them to deploy together. A code constant guarantees this. A D1 value requires a separate migration step that can get out of sync with the deployment.

4. **Simplicity.** Two tiers with two numbers each. A database table for this is over-engineering. When a third tier is added, it is a one-line code change plus a migration to add the CHECK value.

5. **Testability.** Tests can import the constant directly without needing a database fixture.

#### (c) Per-tenant quota overrides should be fields inside the existing `config` JSON column

**Recommendation: Store overrides as `config.quotas.capturesPerMonth` and `config.quotas.storageBytes` inside the existing `config` JSON column.**

Example config with quota overrides:
```json
{
  "rateLimit": { "capture": { "limit": 20, "period": 60 } },
  "quotas": { "capturesPerMonth": 500, "storageBytes": 5368709120 }
}
```

Rationale:

1. **Established pattern.** Per-tenant rate limit overrides already live in `config.rateLimit`. Quota overrides are the same concept: a per-tenant exception to a tier default. Putting them in `config.quotas` is natural and consistent.

2. **No migration needed.** The `config` column is already nullable JSON. Adding new keys requires zero schema changes.

3. **Admin API reuse.** The existing `PUT /v1/admin/tenants/:id/config` endpoint (backed by `setTenantConfig`) already handles config updates with validation. Adding quota override validation to `setTenantConfig` (similar to the existing `rateLimit` validation) is a small change.

4. **A separate `quota_overrides` table would be wasteful.** Overrides are rare (most tenants use tier defaults), tightly coupled to the tenant, and always read alongside other tenant config. A separate table means an extra JOIN on the hot path for data that is almost always absent.

5. **Effective-limit pattern.** Mirror the existing `getEffectiveLimit(tenantConfig, group)` with a `getEffectiveQuota(tier, tenantConfig)` function that returns tier defaults merged with any config overrides.

```js
export function getEffectiveQuota(tier, tenantConfig) {
  const defaults = TIER_QUOTAS[tier] || TIER_QUOTAS.free;
  if (!tenantConfig?.quotas) return { ...defaults };
  return {
    capturesPerMonth: tenantConfig.quotas.capturesPerMonth ?? defaults.capturesPerMonth,
    storageBytes: tenantConfig.quotas.storageBytes ?? defaults.storageBytes,
  };
}
```

#### (d) Quota check query pattern: single `db.batch()` with two prepared statements

**Recommendation: Use `db.batch()` with two SELECTs -- one for tenant tier + config, one for current period usage -- then compute the check in application code.**

This is superior to a JOIN for several reasons:

1. **D1 batch is a single round-trip.** `db.batch([stmt1, stmt2])` sends both statements to the D1 edge in one HTTP call. The latency is effectively the same as a single query. The codebase already uses this pattern extensively (see `listCaptures` which batches a data query + count query).

2. **Simpler queries, better SQLite query plans.** Two simple PK lookups are faster than a JOIN, especially in SQLite which uses nested-loop joins. Each statement hits an exact-match primary key:
   - `SELECT tier, config FROM tenants WHERE id = ?` (PK lookup)
   - `SELECT capture_count, storage_bytes FROM usage_counters WHERE tenant_id = ? AND period = ?` (composite PK lookup)
   Both are O(log n) B-tree seeks with zero scanning.

3. **Graceful handling of missing rows.** If the `usage_counters` row does not exist (tenant has zero usage this period), a LEFT JOIN would return NULLs that need COALESCE. With separate statements, you simply default to zero in application code -- exactly as `getUsage` already does.

4. **Application-level merge is trivial.** After the batch returns, compute the decision in JS:

```js
export async function checkQuota(db, tenantId) {
  const period = computePeriod();
  const [tenantResult, usageResult] = await db.batch([
    db.prepare('SELECT tier, config FROM tenants WHERE id = ?').bind(tenantId),
    db.prepare(
      'SELECT capture_count, storage_bytes FROM usage_counters WHERE tenant_id = ? AND period = ?'
    ).bind(tenantId, period),
  ]);

  const tenant = tenantResult.results?.[0];
  if (!tenant) return { allowed: false, reason: 'tenant_not_found' };

  const tier = tenant.tier || 'free';
  const config = tenant.config ? JSON.parse(tenant.config) : null;
  const quota = getEffectiveQuota(tier, config);

  const usage = usageResult.results?.[0];
  const captureCount = usage?.capture_count ?? 0;
  const storageBytes = usage?.storage_bytes ?? 0;

  if (captureCount >= quota.capturesPerMonth) {
    return {
      allowed: false,
      reason: 'capture_limit',
      limit: quota.capturesPerMonth,
      used: captureCount,
      period,
    };
  }

  if (storageBytes >= quota.storageBytes) {
    return {
      allowed: false,
      reason: 'storage_limit',
      limit: quota.storageBytes,
      used: storageBytes,
      period,
    };
  }

  return { allowed: true, quota, captureCount, storageBytes, period };
}
```

**Performance estimate:** Two PK lookups in D1 edge SQLite should complete in 1-3ms. The `db.batch()` overhead is a single Cloudflare internal RPC. Well under the 10ms budget.

**Why not a single JOIN query?** A JOIN would work:
```sql
SELECT t.tier, t.config, COALESCE(u.capture_count, 0) AS capture_count,
       COALESCE(u.storage_bytes, 0) AS storage_bytes
FROM tenants t
LEFT JOIN usage_counters u ON u.tenant_id = t.id AND u.period = ?
WHERE t.id = ?
```
This is also valid and would be a single statement. Either approach meets the 10ms requirement. I recommend the batch approach because:
- It is consistent with how the codebase already structures multi-statement reads (see `listCaptures`)
- Individual statements are easier to test and reuse independently
- No COALESCE / NULL-handling complexity in SQL

Both approaches are acceptable. If the team prefers fewer statements, the JOIN is fine too.


### Proposed Tasks

#### Task 1: Migration 0005 -- Add `tier` column to tenants table
- **What:** Create `migrations/0005_tenant_tiers.sql` adding `tier TEXT NOT NULL DEFAULT 'free'` to tenants
- **Deliverables:** Migration file, tested against existing data
- **Dependencies:** None (must be applied before any code that reads `tier`)

#### Task 2: `src/quotas.js` -- Tier defaults and quota logic
- **What:** Create module with `TIER_QUOTAS` constant map, `getEffectiveQuota(tier, tenantConfig)` function, and `checkQuota(db, tenantId)` function
- **Deliverables:** `src/quotas.js`, unit tests in `test/quotas.test.js`
- **Dependencies:** Task 1 (migration must exist for schema awareness)

#### Task 3: Quota validation in `setTenantConfig`
- **What:** Add validation for `config.quotas` fields in `setTenantConfig` (same pattern as existing `rateLimit` validation). Ensure `capturesPerMonth` and `storageBytes` are positive integers when present.
- **Deliverables:** Updated `src/db.js` `setTenantConfig`, updated tests
- **Dependencies:** Task 2 (quota constants needed for ceiling validation)

#### Task 4: Tier management in `src/db.js`
- **What:** Add `setTenantTier(db, tenantId, tier, updatedBy)` function with application-layer validation of allowed tier values. Update `createGitHubUser` batch to ensure newly auto-provisioned tenants get `free` tier (already handled by DEFAULT, but explicit is better for clarity).
- **Deliverables:** Updated `src/db.js`, tests
- **Dependencies:** Task 1

#### Task 5: Wire quota check into capture pipeline
- **What:** In `handleCapture` (and `handleBatchCapture`) in `src/index.js`, call `checkQuota` after auth but before `createCapture`. Return 429 with `quota_exceeded` error body on failure. Place the check after rate limiting but before URL validation (fail fast -- quota check is cheaper than URL validation).
- **Deliverables:** Updated `src/index.js`, integration tests
- **Dependencies:** Task 2
- **Insertion point:** Between Step 3 (rate limiting, ~line 580) and Step 4 (parse JSON body, ~line 594). Or between Step 6 (URL validation) and Step 7 (generate capture ID) if the team prefers to validate the URL first. The former is better because it avoids unnecessary work on a request that will be rejected anyway.

#### Task 6: Admin API for tier management
- **What:** Add `PUT /v1/admin/tenants/:id/tier` endpoint. Accepts `{ "tier": "pro" }`. Only admin key authenticated. Returns updated tenant record.
- **Deliverables:** Route handler, tests
- **Dependencies:** Task 4

#### Task 7: Usage dashboard API endpoint
- **What:** Add `GET /v1/tenants/:id/usage` (authenticated, tenant-scoped) returning current period usage, effective quotas, and percentage used. This is the data source for the web UI progress bars.
- **Deliverables:** Route handler returning `{ period, captures: { used, limit, percent }, storage: { used, limit, percent }, tier }`
- **Dependencies:** Task 2

### Risks and Concerns

1. **Race condition on quota check.** The quota check reads usage counters, but `incrementUsage` happens asynchronously via `ctx.waitUntil()` after capture completion. This means the usage counter can lag behind actual captures in flight. Two rapid requests could both pass the quota check before either increments the counter. This is acceptable for a soft quota (100 captures/month -- a few extra captures at the boundary is not harmful), but it should be documented. If exact enforcement is needed later, the check-and-increment would need to be atomic (a single UPDATE ... WHERE capture_count < limit RETURNING statement), but that is over-engineering for the current requirements.

2. **Storage bytes is cumulative, not current.** The `storage_bytes` counter in `usage_counters` is incremented on each capture but never decremented when artifacts are deleted (if deletion is ever supported). For storage quota purposes, the counter represents "bytes ever stored this period" not "bytes currently stored." The success criteria says "storage GB" which implies current storage. If the intent is current storage, you would need to SUM artifact sizes from the `captures` table or maintain a separate running total. Clarify whether storage quota means "monthly ingestion volume" or "total stored data." The counter-based approach maps naturally to monthly ingestion volume.

3. **Existing auto-provisioning `INSERT OR IGNORE` does not set tier explicitly.** This is actually fine -- the `DEFAULT 'free'` on the column handles it. But if additional per-tier setup is ever needed at provisioning time (e.g., creating a usage counter row, sending a welcome webhook), the four existing `INSERT OR IGNORE` call sites are scattered across the codebase. Consider centralizing tenant creation into a single `ensureTenant(db, tenantId)` function that all paths call, to avoid future divergence.

4. **D1 ALTER TABLE limitations.** D1 uses SQLite, which does not support ALTER TABLE ADD COLUMN with CHECK constraints. The CHECK must be enforced in application code. This is not a problem -- the existing `config` JSON validation already follows this pattern -- but the migration file should document why the CHECK is absent.

5. **Period boundary edge case.** A tenant at 99/100 captures on January 31 23:59 UTC submits a capture. By the time `incrementUsage` runs (asynchronously, after browser rendering which takes seconds), it may be February 1. The counter increments in the new period. The quota check used the old period's count. This is harmless (they get one extra capture) but worth noting.

6. **Batch capture endpoint.** `handleBatchCapture` accepts up to 10 URLs. The quota check should either (a) check once for the entire batch count (`captureCount + batch.length <= limit`) or (b) check per-item. Option (a) is simpler and more correct -- a batch of 5 where only 3 quota slots remain should be rejected entirely, not partially processed then rejected mid-batch. The check should be: `captureCount + requestedCount > quota.capturesPerMonth`.

### Additional Agents Needed

None. The current team is sufficient for this scope. The data modeling questions are addressed above; implementation (wiring into the capture pipeline, admin endpoints, UI dashboard) falls to the implementation agents. If the web UI usage dashboard involves significant frontend work (progress bars, real-time updates), a frontend specialist may be useful but is likely already part of the team.
