# Domain Plan Contribution: iac-minion

## Recommendations

### 1. waitUntil + D1 Write Reliability

**Verdict: Reliable enough for usage counters in the queue consumer path, with a caveat for the fetch handler path.**

There are two distinct hot paths to consider:

**Queue consumer path** (capture completion, storage bytes):
The queue consumer (`queue()` handler) has a 15-minute wall-clock budget. When `performCapture()` completes and `completeCapture()` has been awaited, the consumer is still within its active execution window. A `ctx.waitUntil(db.batch(...).run())` issued at this point runs while the consumer is still alive processing the batch -- the 30-second post-response `waitUntil` window does not apply because the queue handler has not yet returned. The `waitUntil` promises must resolve before the queue handler is considered complete ([Cloudflare Queues JS API docs](https://developers.cloudflare.com/queues/configuration/javascript-apis/)). This makes deferred D1 writes in the queue consumer path effectively guaranteed to execute as long as they complete before the 15-minute wall clock.

However, there is a subtlety: if the D1 write itself fails (network error, D1 outage, SQLite constraint violation), the promise resolves with an error that is silently swallowed in `waitUntil`. The counter is simply lost. For usage counters where eventual consistency is acceptable and the requirement says "batched writes acceptable; no strong consistency requirement," this is a tolerable trade-off. The alternative -- making the counter write synchronous and blocking capture completion -- violates the "must not add measurable latency" constraint.

**Fetch handler path** (API call counting):
For counting API calls in the `fetch()` handler, `ctx.waitUntil(db.prepare(...).run())` has a 30-second window after the response is sent. D1 writes typically complete in 5-30ms. This is safe for the expected case but can be silently dropped if:
- The D1 write takes longer than 30 seconds (unlikely but possible during D1 service degradation)
- The Workers runtime terminates the isolate before the `waitUntil` promise resolves

The [official Cloudflare documentation](https://developers.cloudflare.com/workers/runtime-apis/context/) explicitly warns: "waitUntil() tasks did not complete within the allowed time after invocation end and have been cancelled." For guaranteed work, Cloudflare recommends using Queues.

**Recommendation**: Use `ctx.waitUntil()` for both paths. The eventual consistency requirement makes silent drops tolerable. If monitoring later shows counter drift, the escalation path is a dedicated lightweight "counter queue" -- but that is YAGNI for now.

### 2. Batching Strategy: Yes, Use db.batch()

**Batch multiple counter increments in a single `waitUntil` call.**

A single capture completion can trigger up to three counter increments:
1. `captures` counter (+1)
2. `storage_bytes` counter (+N bytes, sum of all R2 object sizes)
3. `api_calls` counter (already counted on the fetch path -- do NOT double-count here)

D1's `db.batch()` executes all statements in a single round-trip and runs them as a transaction. This means:
- **One network round-trip** instead of two or three (reduces D1 write latency from ~15ms x 3 to ~15ms x 1)
- **Atomicity**: if one statement fails, all are rolled back -- you never get a state where captures incremented but storage bytes did not
- **Fits naturally**: the project already uses `db.batch()` extensively (see `createCapture`, `createApiKeyRecord`, `listCaptures`)

The pattern should be:

```js
// In queue consumer, after completeCapture() succeeds
const period = getCurrentPeriod(); // '2026-03'
const storageBytes = computeStorageBytes(artifacts, waczInfo);

ctx.waitUntil(
  db.batch([
    db.prepare(
      `INSERT INTO usage_counters (tenant_id, period, metric, value)
       VALUES (?, ?, 'captures', 1)
       ON CONFLICT(tenant_id, period, metric)
       DO UPDATE SET value = value + 1, updated_at = ?`
    ).bind(tenantId, period, new Date().toISOString()),
    db.prepare(
      `INSERT INTO usage_counters (tenant_id, period, metric, value)
       VALUES (?, ?, 'storage_bytes', ?)
       ON CONFLICT(tenant_id, period, metric)
       DO UPDATE SET value = value + excluded.value, updated_at = ?`
    ).bind(tenantId, period, storageBytes, new Date().toISOString()),
  ]).catch((err) => {
    // Fire-and-forget: log failure but do not block capture completion
    console.warn('wrl:usage_counter_fail', err?.message);
    // Optionally: log to Coralogix for monitoring counter drift
  })
);
```

Note: SQLite (D1) does support `INSERT ... ON CONFLICT DO UPDATE SET value = value + 1` -- the meta-plan's concern about "no native UPDATE ... SET col = col + 1 with UPSERT" is incorrect for this case. SQLite's UPSERT with `excluded.value` and self-referential `value + N` works correctly. The data-minion should verify this in their schema design, but the pattern is standard SQLite 3.24+.

### 3. D1 Over KV for Usage Counters -- Unambiguously

**Use D1. KV is wrong for this use case.**

The question asks whether counters should use KV (like rate limits in `kv.js`) or D1. The analysis:

| Dimension | KV | D1 |
|-----------|----|----|
| **Persistence** | Durable, but eventual consistency across locations. A KV write in one PoP may not be visible in another for up to 60 seconds. | Durable with strong consistency (single-writer SQLite via Durable Objects internally). |
| **Atomic increment** | No. KV is read-then-write (`get` -> parse -> `put`). Two concurrent writes to the same key = last-write-wins, losing one increment. | Yes. `UPDATE SET value = value + 1` is atomic at the SQLite level. `INSERT ... ON CONFLICT DO UPDATE SET value = value + N` is a single atomic statement. |
| **Query capability** | None. KV is key-value only. Listing all tenants' usage for a period requires scanning all keys. | Full SQL. `SELECT * FROM usage_counters WHERE period = '2026-03'` gives you all tenants in one query. |
| **Period management** | Manual. You'd need TTLs or key naming conventions (`usage:{tenant}:{period}:{metric}`), and no way to query across periods without listing all keys. | Natural. A `period` column with an index. Historical queries are trivial. |
| **Write contention** | Lost updates under concurrency (read-modify-write race). Acceptable for rate limits (approximate is fine) but NOT for billing counters. | SQLite serializes writes. UPSERT with `value = value + N` is atomic. No lost updates. |
| **Survives Worker restarts** | Yes. | Yes. |
| **Cost** | $0.50/million writes. | D1 is included with Workers Paid (first 25M rows read, 50M rows written free per month). |

KV is the right choice for rate limits because:
- Rate limits are approximate by design (a few leaked requests are fine)
- Rate limits need edge-local reads (low latency) -- KV caches at PoPs
- Rate limits use TTL for automatic window expiry

Usage counters are the opposite:
- Billing accuracy matters -- lost increments mean underbilling
- Usage counters are write-heavy but read-infrequently (admin query, not hot path)
- Usage counters need SQL queries for reporting

**D1 is the correct and only reasonable choice.**

### 4. Storage Byte Calculation

The storage bytes for a capture are known at the point of R2 upload, before the actual `put()` call. Specifically:

- **Screenshot PNG**: `screenshot.byteLength` (it's a `Uint8Array` from Playwright)
- **screenshotBefore PNG**: `screenshotBefore.byteLength` (if present)
- **Rendered HTML**: `new TextEncoder().encode(html).byteLength` or `html.length` (ASCII-safe approximation)
- **Headers JSON**: `JSON.stringify(headers).length`
- **WACZ bundle**: `waczBytes.byteLength` (already tracked as `waczInfo.size` in capture.js line 212)

The sum of these byte lengths matches what R2 stores as Content-Length. There is no need to read R2 object metadata after upload -- the data is already in memory. The counter increment should compute `storageBytes` from the in-memory artifacts before (or alongside) the R2 `put()` calls.

### 5. API Call Counting Placement

API call counting belongs in the fetch handler, not in the queue consumer. The two concerns are orthogonal:

- **API calls** = count of HTTP requests that were authenticated and dispatched (regardless of whether the capture later succeeds or fails). Count once in `handleCreateCapture` / `handleBatchCapture` / `handleListCaptures` etc., via `waitUntil`.
- **Captures** = count of successfully completed captures. Count once in the queue consumer after `completeCapture()` succeeds, via `waitUntil`.
- **Storage bytes** = bytes written to R2. Count once in the queue consumer alongside capture count, via `waitUntil`.

This separation means:
- A failed capture still counts as 1 API call (it consumed auth, validation, queue dispatch resources)
- A failed capture does NOT count as a capture or add storage bytes
- A batch capture of 5 URLs counts as 1 API call but potentially 5 captures

### 6. Error Handling for Deferred Writes

The `.catch()` on the `waitUntil` promise is critical. Without it, an unhandled rejection from a D1 write inside `waitUntil` will:
- Log an error in Workers Logs (visible in `wrangler tail`)
- NOT crash the worker or affect the response
- BUT will trigger Cloudflare's unhandled rejection tracking, which may cause noise in monitoring

Pattern to follow (mirrors the existing `log()` pattern where `.catch()` is built into the function):

```js
ctx.waitUntil(
  incrementUsageCounters(env.DB, tenantId, period, metrics)
    .catch((err) => {
      // Log but do not propagate -- counter loss is tolerable
      log(env, 4, 'usage', {
        event: 'usage.counter_fail',
        tenantId,
        period,
        metrics,
        errorMessage: String(err?.message ?? '').slice(0, 256),
      });
    })
);
```

Note: the `log()` call inside the catch is itself fire-and-forget (returns a Promise that is not awaited). This is fine -- it is a best-effort notification, not a guarantee.

## Proposed Tasks

### Task 1: Implement deferred counter increment function
**File**: `src/usage.js` (new module, following the pattern of `src/kv.js` for rate limits and `src/db.js` for data access)
**Deliverables**:
- `incrementUsageCounters(db, tenantId, period, counters)` -- accepts a map of `{ captures: N, storage_bytes: N, api_calls: N }` and runs a batched UPSERT
- `getCurrentPeriod()` -- returns `YYYY-MM` string in UTC
- `computeStorageBytes(artifacts, waczInfo)` -- sums in-memory artifact sizes
- All D1 access via `db.batch()` with proper `.catch()` for fire-and-forget use
**Dependencies**: D1 schema migration (from data-minion) must be finalized first

### Task 2: Hook counter increments into capture pipeline
**File**: `src/capture.js` (or `src/index.js` queue consumer -- depends on api-design-minion's integration point recommendation)
**Deliverables**:
- After `completeCapture()` succeeds: `ctx.waitUntil(incrementUsageCounters(db, tenantId, period, { captures: 1, storage_bytes: N }))`
- Storage bytes computed from in-memory artifact sizes (no R2 metadata read)
- Failed captures do NOT increment capture or storage counters
**Dependencies**: Task 1

### Task 3: Hook API call counting into fetch handler
**File**: `src/index.js` (in existing route handlers or as shared post-auth logic)
**Deliverables**:
- After successful auth in each API endpoint: `ctx.waitUntil(incrementUsageCounters(db, tenantId, period, { api_calls: 1 }))`
- Batch endpoint counts as 1 API call (not N)
- Rate-limited (429) and auth-failed (401/403) requests do NOT increment
**Dependencies**: Task 1

### Task 4: Verify D1 UPSERT atomic increment behavior
**Deliverable**: A focused test (can be part of `test/db.test.js` or a new `test/usage.test.js`) that confirms `INSERT ... ON CONFLICT DO UPDATE SET value = value + N` works correctly in D1/miniflare, including:
- First insert (no conflict) sets initial value
- Subsequent inserts increment atomically
- `db.batch()` with multiple UPSERT statements executes transactionally
**Dependencies**: D1 schema migration

## Risks and Concerns

### Risk 1: Silent Counter Loss (Low probability, Low impact)
**What**: A `waitUntil` D1 write fails silently (D1 outage, network timeout, isolate termination).
**Impact**: Usage counter is lower than actual. For billing, this means underbilling -- the safe direction.
**Mitigation**: Log counter write failures to Coralogix. Periodically reconcile counters against R2 object counts and capture table rows (a scheduled CRON job can recount from source-of-truth tables). This reconciliation is out of scope for R25 but should be a backlog item.
**Detection**: Monitor for `usage.counter_fail` log events in Coralogix. If the rate exceeds a threshold (e.g., >1% of captures), investigate.

### Risk 2: D1 Write Contention Under Burst Load (Low probability, Low impact)
**What**: Multiple queue consumers completing captures for the same tenant in the same period simultaneously, all issuing `UPDATE SET value = value + N` on the same row.
**Impact**: SQLite serializes writes, so no data loss. But under high contention, D1 write latency increases (queuing at the SQLite level). Since these are `waitUntil` writes, increased latency does not affect capture hot path -- it only delays counter persistence.
**Mitigation**: The current max_concurrency is 10 for the queue consumer. Even if all 10 are for the same tenant (unlikely), SQLite handles 10 concurrent UPSERTs without issue -- this is well within D1's documented throughput.

### Risk 3: Period Boundary Race (Low probability, Negligible impact)
**What**: A capture starts at 2026-03-31T23:59:59Z and completes at 2026-04-01T00:00:01Z. If `getCurrentPeriod()` is called at completion time, the capture counts toward April even though it was initiated in March.
**Impact**: Negligible for billing (the capture did consume April resources). The requirement says "calendar month (UTC) periods" -- the period should be determined at increment time (completion), not at creation time.
**Mitigation**: None needed. Document the semantics: period is determined at the time the counter is incremented, which is capture completion time for captures/storage and request time for API calls.

### Risk 4: Fetch Handler waitUntil Window (Low probability, Low impact)
**What**: For API call counting in the `fetch()` handler, the 30-second `waitUntil` window starts after the response is sent. If D1 is experiencing elevated latency (>30s), the counter write is cancelled.
**Impact**: API call counter is lower than actual. Same safe-direction underbilling as Risk 1.
**Mitigation**: Same as Risk 1 -- Coralogix logging on failure, future reconciliation job.

## Additional Agents Needed

None beyond what the meta-plan already specifies. The data-minion's schema design is the critical dependency -- the UPSERT pattern I recommend above depends on the table having a unique constraint on `(tenant_id, period, metric)`. The data-minion should confirm this works in D1's SQLite implementation as part of their schema contribution.
