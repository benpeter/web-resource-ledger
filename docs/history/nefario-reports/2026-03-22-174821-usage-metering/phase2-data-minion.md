# Domain Plan Contribution: data-minion

## Planning Question

What D1 schema design best supports per-tenant monthly usage counters (capture count, storage bytes, API calls) with these constraints: (1) counter increments via `waitUntil` (deferred, non-blocking), (2) monotonically increasing within a billing period, (3) calendar month (UTC) periods, (4) queryable by tenant + period? Should counters use a single row per tenant-period with atomic increments, or an append-only event log with aggregation?

## Recommendations

### Schema Design: Single Row Per Tenant-Period with Atomic Increments

**Recommendation: Use a single `usage_counters` row per tenant per billing period, incremented with `UPDATE ... SET col = col + N WHERE ...` statements.**

This is the correct design for this workload. Here is the full analysis.

#### Why NOT an append-only event log

An append-only event log (one row per event -- "tenant X did a capture", "tenant X used N bytes") has theoretical appeal for auditability, but it is wrong for this use case:

1. **Query cost**: Every `GET /v1/admin/usage` call would require `SELECT SUM(...) FROM events WHERE tenant_id = ? AND period = ?`. At modest scale (1000 captures/month for 10 tenants), this is already scanning 10K+ rows per query. The captures table already serves as the event log -- duplicating it in a usage events table adds no information.

2. **Write amplification**: Each capture produces 3 events (capture count, storage bytes, API call). At 10K captures/month this is 30K rows/month of pure overhead. D1 is billed per row written and has a 10GB database size limit.

3. **No auditability benefit**: The `captures` table already records every capture with `tenant_id`, `created_at`, and `wacz` (which contains size). If an auditor questions usage, a `SELECT COUNT(*), SUM(json_extract(wacz, '$.size')) FROM captures WHERE tenant_id = ? AND created_at >= ? AND created_at < ?` gives the exact numbers. The usage counters table is a materialized aggregate -- the source data already exists.

4. **Complexity**: Append-only requires aggregation views or materialized counters anyway. You end up with both the log and the summary table, which is the worst of both worlds for a system that already has the raw events in `captures`.

#### Why single-row-per-tenant-period works

D1 is SQLite. SQLite has a single-writer model -- one write transaction at a time, all others queue. This sounds like a problem for concurrent counter increments, but it is actually fine here because:

1. **`waitUntil` writes are non-blocking and serialized by D1 automatically.** Each `UPDATE usage_counters SET capture_count = capture_count + 1 WHERE ...` takes microseconds of SQLite lock time. D1's write queue handles the serialization transparently. There is no application-level lock contention -- the workers fire-and-forget, and D1 processes them in order.

2. **Write volume is low.** The success criteria states this is for billing and quota enforcement, not real-time dashboards. At the current scale (one tenant, max 100 captures/min per the rate limiter ceiling), D1 handles this trivially. Even at 10 tenants doing 100 captures/min each (1000 writes/min), each write is a single indexed UPDATE that holds the WAL lock for <1ms.

3. **`UPDATE ... SET col = col + N`** is atomic within SQLite. It reads the current value and writes the new value in a single statement execution. No read-then-write race. This is SQLite's fundamental guarantee -- it is not the same as a distributed database where read-then-increment has a TOCTOU window.

4. **Monotonicity is guaranteed by design.** We only increment, never decrement. The initial value is 0 (set on row creation). `col = col + N` where N >= 1 can only increase the value. There is no code path that decrements.

#### D1/SQLite UPSERT with increment

The metaplan notes "no native UPDATE ... SET col = col + 1 with UPSERT in all cases." This is incorrect -- SQLite (and therefore D1) fully supports `INSERT ... ON CONFLICT DO UPDATE SET col = col + excluded.col`:

```sql
INSERT INTO usage_counters (tenant_id, period, capture_count, storage_bytes, api_call_count)
VALUES (?, ?, ?, ?, ?)
ON CONFLICT(tenant_id, period) DO UPDATE SET
  capture_count = capture_count + excluded.capture_count,
  storage_bytes = storage_bytes + excluded.storage_bytes,
  api_call_count = api_call_count + excluded.api_call_count,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
```

This is a single statement, fully atomic, and handles both the "first write of the period" (INSERT) and "subsequent writes" (UPDATE) cases. No need for a separate "ensure row exists" step. The `excluded.col` syntax references the values from the VALUES clause.

This UPSERT pattern is the standard approach for counter tables in SQLite. It has been supported since SQLite 3.24.0 (2018) and is well-tested in D1.

### Proposed Schema

```sql
-- Usage counters: one row per tenant per billing period (calendar month UTC).
-- Counters are monotonically increasing within a period. Never decremented.
-- Incremented via waitUntil (deferred, non-blocking) after each relevant operation.
CREATE TABLE usage_counters (
  tenant_id       TEXT    NOT NULL REFERENCES tenants(id),
  period          TEXT    NOT NULL
                            CHECK (period GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'
                                   AND length(period) = 7),
  capture_count   INTEGER NOT NULL DEFAULT 0 CHECK (capture_count >= 0),
  storage_bytes   INTEGER NOT NULL DEFAULT 0 CHECK (storage_bytes >= 0),
  api_call_count  INTEGER NOT NULL DEFAULT 0 CHECK (api_call_count >= 0),
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT,
  PRIMARY KEY (tenant_id, period)
);

-- Query by tenant (all periods, reverse chronological)
CREATE INDEX idx_usage_counters_tenant
  ON usage_counters (tenant_id, period DESC);
```

#### Design decisions in this schema

1. **Composite primary key `(tenant_id, period)`**: Natural key, no surrogate. Each tenant has exactly one row per period. The PK is the UPSERT conflict target.

2. **`period` as `TEXT` in `YYYY-MM` format**: Matches the API query parameter (`?period=2026-03`), sorts lexicographically, and is human-readable. CHECK constraint ensures format. Alternative considered: integer (202603) -- rejected because it requires formatting for display and is not obviously a date.

3. **`INTEGER` for counters**: SQLite integers are 64-bit signed, so max ~9.2 quintillion. No overflow risk. `CHECK (>= 0)` as defense-in-depth against bugs that would subtract.

4. **`storage_bytes` as INTEGER, not REAL**: Byte counts are exact integers. No floating point. This will support up to ~9.2 exabytes per tenant-period, which is sufficient.

5. **Foreign key to `tenants(id)`**: Consistent with `captures` and `api_keys` tables. The `INSERT OR IGNORE INTO tenants` pattern used in `createCapture()` ensures the tenant row exists before any usage counter write.

6. **No separate table per counter type**: A single row with three counter columns avoids JOIN complexity and allows a single UPSERT to increment all applicable counters atomically. For example, a successful capture increments both `capture_count` and `storage_bytes` in one statement.

7. **`created_at` and `updated_at`**: Follows the existing `tenants` table pattern. `created_at` is immutable (set on INSERT), `updated_at` is set on each UPDATE via the UPSERT.

8. **No `CHECK` on period date validity** (e.g., no month 13): The `GLOB` check ensures format but not semantic validity. The application code generates the period string from `new Date()`, which cannot produce `2026-13`. Adding a month range check in SQL adds complexity without value since the input is never user-supplied directly -- it is derived from the server clock.

### Data Access Layer Functions

Add to `src/db.js`, following existing conventions (camelCase exports, snake_case SQL, JSDoc, centralized):

```js
/**
 * Increment usage counters for a tenant in the current billing period.
 * Uses UPSERT: creates the row on first write, increments on subsequent.
 * Caller should pass this to ctx.waitUntil() for non-blocking execution.
 *
 * @param {D1Database} db
 * @param {string} tenantId
 * @param {{ captures?: number, storageBytes?: number, apiCalls?: number }} deltas
 * @returns {Promise<void>}
 */
export async function incrementUsage(db, tenantId, deltas) {
  const period = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
  const captures = deltas.captures ?? 0;
  const storageBytes = deltas.storageBytes ?? 0;
  const apiCalls = deltas.apiCalls ?? 0;

  if (captures === 0 && storageBytes === 0 && apiCalls === 0) return;

  await db.prepare(
    `INSERT INTO usage_counters (tenant_id, period, capture_count, storage_bytes, api_call_count)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(tenant_id, period) DO UPDATE SET
       capture_count = capture_count + excluded.capture_count,
       storage_bytes = storage_bytes + excluded.storage_bytes,
       api_call_count = api_call_count + excluded.api_call_count,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
  ).bind(tenantId, period, captures, storageBytes, apiCalls).run();
}

/**
 * Read usage counters for a tenant in a specific billing period.
 * Returns zeroed counters if no row exists (tenant had no activity).
 *
 * @param {D1Database} db
 * @param {string} tenantId
 * @param {string} period  'YYYY-MM' format
 * @returns {Promise<{ tenantId: string, period: string, captureCount: number,
 *   storageBytes: number, apiCallCount: number, updatedAt: string|null }>}
 */
export async function getUsage(db, tenantId, period) {
  const row = await db.prepare(
    'SELECT * FROM usage_counters WHERE tenant_id = ? AND period = ?',
  ).bind(tenantId, period).first();

  if (!row) {
    return {
      tenantId,
      period,
      captureCount: 0,
      storageBytes: 0,
      apiCallCount: 0,
      updatedAt: null,
    };
  }

  return {
    tenantId: row.tenant_id,
    period: row.period,
    captureCount: row.capture_count,
    storageBytes: row.storage_bytes,
    apiCallCount: row.api_call_count,
    updatedAt: row.updated_at ?? null,
  };
}
```

### Counter Increment Placement

Three counters, three increment points:

| Counter | Where to increment | What value | When |
|---------|-------------------|------------|------|
| `api_call_count` | `src/index.js`, after successful auth + rate limit pass, before route dispatch | `+1` | Every authenticated API request (capture, read, batch, MCP) |
| `capture_count` | `src/index.js` queue consumer, after `result.ok === true` from `performCapture()` | `+1` | Every successfully completed capture |
| `storage_bytes` | `src/index.js` queue consumer, after `result.ok === true` from `performCapture()` | WACZ size + artifact sizes | Every successfully completed capture |

**Why NOT increment in `capture.js`**: The `performCapture()` function is the browser rendering pipeline. It should not have a dependency on usage counters. It already returns the result to the queue consumer, which has access to `ctx.waitUntil()` and `env.DB`. The queue consumer is the natural aggregation point.

**Why NOT increment `capture_count` on capture submission (202)**: A submitted capture might fail. The success criteria says "captures, storage consumption" -- which implies successful captures that actually consumed storage. Failed captures consumed compute but not storage. If you want to count failed captures separately, add a `failed_capture_count` column later.

**Why `api_call_count` increments in index.js, not auth.js**: The `auth.js` module (`verifyApiKey`) does not have access to `ctx` or `env.DB`. It returns an auth result object. The caller in `index.js` already has `ctx.waitUntil()` available and is the right place to fire deferred writes. This follows the same pattern as rate limit counter writes (`if (rl.writePromise) ctx.waitUntil(rl.writePromise)`).

**Storage bytes calculation**: After `performCapture()` returns `{ ok: true }`, the queue consumer needs the storage bytes. The capture data is already in D1 (via `completeCapture()`). Two options:

- **Option A** (recommended): `performCapture()` already returns `{ ok: true }` -- extend it to return `{ ok: true, storageBytes: N }` where N is the sum of all R2 `put()` sizes. The sizes are known before the R2 puts (they are buffer/ArrayBuffer lengths: `screenshot.byteLength`, `html.length`, `waczBytes.byteLength`).

- **Option B**: Read the completed capture record from D1 to get `wacz.size`. This adds a D1 read to the hot path and only gets the WACZ size, not the individual artifact sizes.

Option A is cleaner because the sizes are already in memory during `performCapture()`. The capture pipeline can sum them and return them without any additional I/O.

### Migration File

This should be `migrations/0002_usage_counters.sql`:

```sql
-- Usage metering: per-tenant monthly counters for billing and quota enforcement.
-- Counters increment via UPSERT on each relevant operation (deferred via waitUntil).
-- Period is calendar month UTC in YYYY-MM format.
PRAGMA foreign_keys = ON;

CREATE TABLE usage_counters (
  tenant_id       TEXT    NOT NULL REFERENCES tenants(id),
  period          TEXT    NOT NULL
                            CHECK (period GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'
                                   AND length(period) = 7),
  capture_count   INTEGER NOT NULL DEFAULT 0 CHECK (capture_count >= 0),
  storage_bytes   INTEGER NOT NULL DEFAULT 0 CHECK (storage_bytes >= 0),
  api_call_count  INTEGER NOT NULL DEFAULT 0 CHECK (api_call_count >= 0),
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT,
  PRIMARY KEY (tenant_id, period)
);

CREATE INDEX idx_usage_counters_tenant
  ON usage_counters (tenant_id, period DESC);
```

**Migration notes**:
- PRAGMA foreign_keys = ON matches `0001_initial_schema.sql` convention.
- The migration is additive only (CREATE TABLE + CREATE INDEX). No data migration needed. Safe to run on both staging and production with zero downtime.
- D1 migration numbering: `0002` follows `0001` sequentially. Verify no other migration has been added between metaplan writing and implementation.

## Proposed Tasks

### Task 1: D1 Migration File
- **Deliverable**: `migrations/0002_usage_counters.sql`
- **Dependencies**: R30 (D1 migration) -- DONE per backlog
- **Approval gate**: Schema design must be approved before implementation proceeds

### Task 2: Data Access Functions in db.js
- **Deliverable**: `incrementUsage()` and `getUsage()` functions in `src/db.js`
- **Dependencies**: Task 1 (schema must exist)
- **Notes**: Follow existing patterns -- JSDoc, camelCase return shapes, snake_case SQL, centralized in db.js

### Task 3: Counter Increment Integration
- **Deliverable**: `ctx.waitUntil(incrementUsage(...))` calls at the three increment points
- **Dependencies**: Task 2
- **Integration points**:
  - `src/index.js` post-auth for `api_call_count` (in the fetch handler, after auth succeeds and rate limit passes, before route dispatch)
  - `src/index.js` queue consumer for `capture_count` and `storage_bytes` (after `result.ok === true`)
- **Notes**: `performCapture()` return shape needs extension to include `storageBytes`

### Task 4: Admin Usage Endpoint
- **Deliverable**: `GET /v1/admin/usage` route and handler
- **Dependencies**: Task 2
- **Notes**: Follows existing admin patterns (verifyAdminKey, ADMIN_RATE_LIMITER, Cache-Control: private no-store). Response shape to be finalized by api-design-minion.

### Task 5: Tests
- **Deliverable**: Unit tests for `incrementUsage()`/`getUsage()`, integration tests for admin endpoint
- **Dependencies**: Tasks 2, 4
- **Notes**: Test strategy owned by test-minion. Key cases: UPSERT on first write, increment on subsequent writes, period isolation, zero counters for inactive tenants.

### Task 6: OpenAPI Spec Update
- **Deliverable**: `GET /v1/admin/usage` in openapi.yaml
- **Dependencies**: Task 4 (endpoint shape must be finalized)

## Risks and Concerns

### Risk 1: `waitUntil` D1 write reliability (MEDIUM)

**What**: `ctx.waitUntil()` extends the Worker invocation lifetime to let deferred work complete, but Cloudflare does not guarantee that `waitUntil` promises always resolve. If the Worker runtime terminates early (e.g., resource limits, runtime errors), deferred D1 writes could be silently dropped.

**Impact**: Usage counters would undercount. For billing, undercounting is better than overcounting (you don't charge customers for usage they didn't get), but significant undercounting undermines the purpose of metering.

**Mitigation**: The success criteria explicitly states "eventually consistent (batched writes acceptable; no strong consistency requirement)." This is the correct framing. `waitUntil` is reliable in practice for Cloudflare Workers -- the same pattern is already used for logging (which works), and D1 writes are fast (single UPSERT, <10ms). The risk of silent drops is low but nonzero.

**Secondary mitigation**: If accuracy becomes critical (e.g., for billing disputes), a reconciliation query can derive exact counts from the `captures` table: `SELECT COUNT(*), SUM(json_extract(wacz, '$.size')) FROM captures WHERE tenant_id = ? AND created_at >= '2026-03-01' AND created_at < '2026-04-01'`. This is the source of truth. The usage_counters table is a fast-read cache of this data.

### Risk 2: Period Boundary Edge Case (LOW)

**What**: A capture starts processing at 2026-03-31T23:59:59Z and completes at 2026-04-01T00:00:01Z. The `incrementUsage()` call uses `new Date().toISOString().slice(0, 7)` to determine the period, which would be `2026-04` at the time of the increment. But the capture was submitted in March.

**Impact**: The capture is counted in April instead of March. For billing purposes, this shifts ~1 capture per month at the boundary.

**Mitigation**: This is acceptable and consistent with the design choice of "period determined at increment time, not at submission time." The alternative (use the submission timestamp) would require passing the period through the queue message and the capture pipeline, adding complexity for a 1-in-N edge case. The success criteria says "calendar month (UTC)" without specifying whether "month" means "month of submission" or "month of completion." The natural interpretation for billing is "when did we actually consume the resources" -- which is completion time.

**Documentation**: The response payload should include period boundary timestamps (e.g., `periodStart: '2026-03-01T00:00:00Z'`, `periodEnd: '2026-04-01T00:00:00Z'`) so API consumers can unambiguously interpret the period.

### Risk 3: Missing `api_call_count` for Non-Capture Requests (LOW)

**What**: The success criteria says "API call count." Which API calls? All authenticated requests? Only capture-related? Read requests? Admin requests? MCP tool calls?

**Impact**: Different definitions lead to different counting logic and different integration points.

**Recommendation**: Count all authenticated API requests (any request that passes `verifyApiKey`). Admin requests (which use `verifyAdminKey` -- a different auth path) should NOT be counted because they are operator actions, not tenant usage. MCP requests that authenticate as a tenant SHOULD be counted. This aligns with "API calls that consume platform resources as a tenant."

### Risk 4: Write Contention Under High Concurrency (LOW)

**What**: If a single tenant fires 100 concurrent API requests, all 100 `waitUntil` writes will attempt to UPDATE the same row. D1 (SQLite) serializes writes, so they queue up.

**Impact**: The writes themselves are fast (<1ms each), but 100 queued writes would take ~100ms total. Since these are deferred (`waitUntil`), this does not affect request latency. However, it does extend the Worker invocation lifetime.

**Mitigation**: Not a concern at current scale. The rate limiter ceiling is 100 req/60s per tenant and 200 req/60s globally. Even in the worst case (100 simultaneous deferred writes), the serialization cost is negligible. If this ever becomes a problem (10x-100x current scale), the solution is to batch increments in a Durable Object or accumulate in-memory and flush periodically -- but that is premature optimization today.

### Risk 5: Storage Bytes for Non-WACZ Artifacts (LOW)

**What**: The success criteria says "storage bytes (R2 object sizes)." Currently, `waczInfo.size` captures only the WACZ bundle size. But a capture also stores individual artifacts in R2: `screenshot.png`, `screenshot-before.png`, `rendered.html`, `headers.json`. These are separate R2 objects not counted by `waczInfo.size`.

**Impact**: Storage bytes would undercount actual R2 usage if only WACZ size is counted.

**Recommendation**: Sum all artifact sizes in `performCapture()`. The buffers are in memory at the time of `env.BUCKET.put()`: `screenshot.byteLength` + `screenshotBefore?.byteLength` + `new TextEncoder().encode(html).byteLength` + `headersJson?.length` + `waczBytes?.byteLength`. Return the total from `performCapture()`. This gives the true R2 storage consumption per capture.

For partial captures (no WACZ), storage bytes are just the individual artifacts. For full captures, it is artifacts + WACZ bundle.

## Additional Agents Needed

None beyond what the metaplan already specifies. The four consultations (data-minion, api-design-minion, iac-minion, test-minion) plus the cross-cutting UX strategy and documentation consultations cover all planning dimensions. Security review in Phase 3.5 is sufficient since no new auth mechanism or attack surface is introduced.
