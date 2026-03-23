# Domain Plan Contribution: iac-minion

## Recommendations

### Option (a) -- Single D1 Read -- Is Sufficient. No KV Cache Needed.

After reading the codebase, the answer is clear: **option (a) is sufficient, and the quota check should piggyback on the existing `getTenantConfig` D1 read** rather than introducing a second read or a KV caching layer.

Here is the reasoning:

**1. D1 read latency is well within budget.**

D1 is edge-colocated SQLite. A single `SELECT` by primary key is sub-2ms in practice. Even a two-statement batch (tenant tier + usage counter) via D1's `db.batch()` completes in under 5ms. The 10ms budget has generous headroom for a single D1 read path.

**2. The existing `checkCaptureRateLimit` already does a D1 read.**

At line 495 of `src/index.js`, `checkCaptureRateLimit` calls `getTenantConfig(env.DB, auth.tenantId)` -- this is a D1 `SELECT config FROM tenants WHERE id = ?` by primary key. The quota check needs the same tenant record (to read the tier) plus the current period's usage counter. This can be done as a `db.batch()` of two prepared statements in a single D1 round-trip, returning both results. The latency cost is negligible vs. the single read that already exists.

**3. KV caching would add complexity with no meaningful latency benefit.**

KV reads are ~5ms from within Workers (edge-local). D1 reads by primary key are ~2ms. Adding a KV cache for tier data would actually increase P50 latency (KV read + occasional D1 read on cache miss) while introducing staleness. The only scenario where KV caching helps is if D1 is under write contention -- but `usage_counters` writes happen via `ctx.waitUntil()` (non-blocking), so they do not contend with the quota check read path.

**4. Cloudflare rate limiter bindings (option c) are not viable for monthly quotas.**

The rate limiter binding (`unsafe.bindings` with `type = "ratelimit"`) supports only fixed `limit` and `period` values set in `wrangler.toml`. They cannot accept dynamic per-tenant limits, per-tier limits, or monthly rolling windows. They are designed for per-minute/per-second rate limiting, not monthly quota enforcement.

### Piggyback on Existing Flow -- Merge Quota Check into `checkCaptureRateLimit`

The current capture pipeline order is:
1. Auth (`verifyApiKey`)
2. Usage increment (`incrementUsage` via `ctx.waitUntil()`)
3. Rate limit (`checkCaptureRateLimit` -- calls `getTenantConfig` from D1, then `rateLimitCounter` from KV)
4. URL validation
5. D1 write + queue enqueue

The quota check should be integrated into step 3. The `checkCaptureRateLimit` function already fetches `tenantConfig` from D1. The modified flow:

1. **Batch-read tenant config + usage counter in one D1 round-trip** using `db.batch()`:
   - Statement 1: `SELECT config, tier FROM tenants WHERE id = ?` (add `tier` column -- see data-minion for schema)
   - Statement 2: `SELECT capture_count, storage_bytes FROM usage_counters WHERE tenant_id = ? AND period = ?`
2. **Check monthly quota first** (cheaper rejection -- reject before KV read):
   - Look up tier's default limits from a code-level constant map
   - Apply per-tenant overrides from config JSON if present
   - Compare current `capture_count` against limit
   - If exceeded, return immediately with `quota_exceeded` (no KV read, no rate limiter call)
3. **Then proceed with existing rate limit checks** (KV counter, IP guard)

This means the quota check adds zero additional network round-trips when it passes (the D1 read was already happening, now it just reads one more row in the same batch). When the quota is exceeded, it actually saves a round-trip by short-circuiting before the KV read.

### No New Bindings or Infrastructure Changes Needed

The existing infrastructure is sufficient:

- **D1 binding `DB`**: Already used for `getTenantConfig` and `incrementUsage`. The quota check query uses the same binding.
- **KV binding `KV`**: Unchanged. Rate limit counters continue to use KV. Monthly quotas do NOT use KV.
- **Rate limiter bindings**: Unchanged. The per-minute rate limiters remain as hard backstops. Monthly quotas are a separate concern enforced in application code.
- **Queues**: Unchanged. The queue consumer calls `incrementUsage` after capture completion -- this is the write side of the counter. The quota check is the read side, and both use D1.

No changes to `wrangler.toml` are required for quota enforcement.

### Race Condition Analysis

The constraint says "slight overages are acceptable." Here is the analysis:

**Write path** (`incrementUsage`): Runs in `ctx.waitUntil()` after the capture is enqueued. This means the D1 counter is incremented asynchronously, after the HTTP response is sent. Two concurrent requests from the same tenant could both read `capture_count = 99` (limit 100) and both pass the quota check before either write lands.

**Maximum realistic overage**: Bounded by the per-tenant rate limit. The `CAPTURE_RATE_LIMITER` binding hard-caps any tenant at 100 requests/60 seconds. Combined with the KV-based per-tenant counter (default 10/60s), the maximum concurrent in-flight requests that could slip past the quota check is equal to the rate limit window (at most 10 concurrent for default tenants, up to 100 for overridden tenants). In practice, the D1 `ctx.waitUntil()` write completes in <10ms, so the actual race window is tiny.

**Mitigation needed?** No. The constraint explicitly accepts slight overages. The overage is bounded at `rate_limit_per_minute` captures at most, which is a rounding error on monthly quotas of 100-5000 captures. No additional locking, atomic compare-and-set, or pessimistic check is needed.

**Storage quota** is harder to enforce pre-capture because the final storage size is unknown until after the browser renders the page. The quota check should compare the pre-capture `storage_bytes` counter against the limit, but cannot account for the in-progress capture's eventual size. This means storage overage could be up to `max_single_capture_size` bytes beyond the limit. This is acceptable for the same reason -- the limit is soft, not a hard billing boundary.

### Migration Considerations

The only infrastructure-adjacent schema change is adding a `tier` column to the `tenants` table (data-minion owns the exact schema design). From an infrastructure perspective:

- **D1 migration**: A new `0005_tenant_quotas.sql` migration adds the `tier` column with a default value (e.g., `'free'`). This is a safe ALTER TABLE -- SQLite adds columns with defaults without rewriting the table.
- **Deployment order**: Migration must run before the new Worker code deploys. Since `wrangler deploy` does not auto-run D1 migrations, the deployment process must call `wrangler d1 migrations apply` first. This is the same pattern used for all prior migrations.
- **Rollback**: If the new code is rolled back, the `tier` column is harmless -- old code ignores it (it reads `config` only). No backward-incompatible schema change.

## Proposed Tasks

### Task 1: Extend `getTenantConfig` to Batch-Read Tier + Usage Counter

**What**: Modify the D1 access layer to support a single `db.batch()` call that retrieves both the tenant record (with tier) and the current period's usage counter row. This replaces the current single-statement `getTenantConfig` read in the rate limit path.

**Deliverables**:
- New function in `src/db.js` (e.g., `getTenantQuotaContext(db, tenantId)`) that returns `{ tier, config, usage: { captureCount, storageBytes } }` in one D1 round-trip
- Unit tests verifying batch read returns correct data for existing tenant, tenant with no usage row, and non-existent tenant

**Dependencies**: Depends on data-minion's schema design for the `tier` column and migration.

### Task 2: Define Tier Quota Constants in Application Code

**What**: Create a constant map of tier defaults (captures/month, storage bytes) in a new module or within `src/rate-limits.js`. This keeps tier definitions in code rather than D1 -- they change infrequently and should be deployed with the application.

**Deliverables**:
- Constant map, e.g.:
  ```js
  export const TIER_QUOTAS = {
    free: { capturesPerMonth: 100, storageBytesMax: 1_073_741_824 },
    pro:  { capturesPerMonth: 5000, storageBytesMax: 53_687_091_200 },
  };
  ```
- Function `getEffectiveQuota(tier, configOverrides)` that merges tier defaults with per-tenant overrides from config JSON
- Unit tests for default resolution and override merging

**Dependencies**: None (code-only, no infrastructure changes).

### Task 3: Integrate Quota Check into `checkCaptureRateLimit`

**What**: Modify `checkCaptureRateLimit` in `src/index.js` to call the batch D1 read (Task 1), check monthly quotas before proceeding to KV rate limit checks. Quota failure short-circuits with a distinct return shape (e.g., `{ exceeded: true, type: 'quota', ... }`).

**Deliverables**:
- Modified `checkCaptureRateLimit` that checks quota first, then existing rate limits
- The function's return type gains `type: 'quota'` as a possible value, with `limit`, `used`, and `remaining` fields
- The caller in `handleCreateCapture` and `handleBatchCapture` maps `type: 'quota'` to the 429 quota_exceeded response (using whatever format api-design-minion recommends)
- Integration tests: request at quota boundary passes, request over quota returns 429 with correct response shape

**Dependencies**: Task 1, Task 2, api-design-minion's response format decision.

### Task 4: Verify No `wrangler.toml` Changes Required

**What**: Confirm that no new bindings, rate limiters, or configuration changes are needed in `wrangler.toml` or `wrangler.toml` staging environment. Document this as a non-change in the evolution log.

**Deliverables**:
- Explicit confirmation that the existing D1 (`DB`), KV (`KV`), and rate limiter bindings are sufficient
- No changes to `wrangler.toml`
- Note in evolution `decisions.md` explaining why infrastructure-level enforcement was not needed

**Dependencies**: None.

## Risks and Concerns

### Risk 1: D1 Batch Latency Under Load

**Concern**: While single D1 reads are sub-2ms, a `db.batch()` with two statements could have higher tail latency under heavy write contention on `usage_counters` (concurrent `incrementUsage` writes from multiple captures completing simultaneously).

**Mitigation**: SQLite's WAL mode (used by D1) allows concurrent readers even during writes. The read-side query hits the `usage_counters` primary key index directly. Monitor P99 latency of the quota check path after deployment. If tail latency exceeds 10ms, the fallback is to cache the usage counter value in KV with a 60-second TTL as a read-through cache -- but this should not be built preemptively. YAGNI.

### Risk 2: Storage Quota Cannot Be Enforced Pre-Capture

**Concern**: The capture's final storage size is unknown at request time. The quota check can only compare the cumulative `storage_bytes` counter against the limit, not account for the in-progress capture's eventual size. A tenant at 990 MB of a 1 GB limit could submit a capture that produces 50 MB, exceeding the limit.

**Mitigation**: Accept this as a design constraint. The storage quota is a soft limit. If strict enforcement is needed later, the queue consumer could check storage quota post-render and fail the capture before uploading to R2 -- but this is out of scope for R26 and should be a backlog item if the soft limit proves insufficient.

### Risk 3: Tier Column Migration on Existing Tenants

**Concern**: Existing tenants created via GitHub OAuth auto-provisioning have no tier. The migration must set a default tier for all existing rows.

**Mitigation**: The migration `DEFAULT 'free'` on the new column handles this. All existing tenants become `free` tier. No manual data fixup needed. This is a standard SQLite ALTER TABLE ADD COLUMN with a default value.

### Risk 4: Quota Check Adds Latency to Already-Blocked Requests

**Concern**: The quota check runs after auth but before rate limiting. If a tenant is both over quota AND rate-limited, the response now comes from the quota check (which does a D1 read) rather than the rate limiter (which uses the faster CF binding). This could slightly increase P50 latency for abusive tenants.

**Mitigation**: The quota check ordering (quota before rate limit) is correct because quota rejection is cheaper for the system than rate limit rejection followed by eventual queue processing and quota-check-at-consumer. A D1 read is <5ms. The alternative (checking rate limit first) would let over-quota requests consume KV counter tokens unnecessarily.

## Additional Agents Needed

None. The current team (data-minion, api-design-minion, iac-minion, frontend-minion, security-minion, ux-strategy-minion, software-docs-minion) covers all planning dimensions. The observability and test concerns are straightforward enough to handle during implementation without dedicated planning consultation.
