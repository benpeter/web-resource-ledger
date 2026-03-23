# Domain Plan Contribution: ai-modeling-minion

## Recommendations

### 1. Fan-out strategy: query-then-enqueue via sendBatch

The `scheduled()` handler should follow the same pattern as `handleBatchCapture`
in `src/index.js` (line 993): query D1 for due schedules, then use
`env.CAPTURE_QUEUE.sendBatch()` to enqueue all captures in a single call.

**Concrete execution flow:**

```
scheduled() fires
  -> query D1: SELECT schedules WHERE next_run_at <= now() AND enabled = 1
  -> for each schedule:
       1. checkQuota(db, tenantId)  -- existing quotas.js function, no changes needed
       2. if allowed: createCapture(db, captureId, url, ip='scheduled', tenantId)
       3. build queue message: { captureId, url, ip:'scheduled', tenantId, cip:'cron', enqueuedAt, scheduleId }
       4. UPDATE schedule SET next_run_at = <computed next>, last_run_at = now()
  -> sendBatch(allMessages)  -- up to 100 messages per call
  -> for any quota-denied schedules: log and skip (do NOT disable the schedule)
```

The `scheduleId` field is the only addition to the existing queue message schema.
The existing `handleCaptureMessage` already destructures `msg.body` with spread --
unknown fields are simply ignored, so adding `scheduleId` is backward-compatible.

**Partial failure handling:**
- If `sendBatch` fails, the captures have already been created in D1 as `pending`.
  The `scheduled()` handler should catch the sendBatch error, call `failCapture()`
  for each captureId in the failed batch, log the error, and NOT update
  `next_run_at` on those schedules (they will be retried on the next cron tick).
- If individual `createCapture` calls fail (D1 transient error), skip that
  schedule, log, and continue processing remaining schedules. Do not let one
  tenant's failure block other tenants.
- `checkQuota` failures should be treated the same as quota-denied: log and skip.

### 2. Concurrency / duplicate prevention: last_run_at + idempotency guard

The existing capture pipeline already has an idempotency guard in
`handleCaptureMessage` (line 154-159): it checks if the capture is already
`complete` or `failed` and acks silently. This is the first line of defense.

For schedule-level deduplication, the `next_run_at` column is the mechanism:

- The `scheduled()` handler queries `WHERE next_run_at <= NOW()`.
- Immediately after building the batch, it updates `next_run_at` to the
  computed next occurrence **before** calling `sendBatch`.
- This means if the cron fires again while captures are still processing,
  those schedules will NOT be selected again (their `next_run_at` is in the future).

This is simpler and more reliable than a `locked_until` or `processing` column
because it has no cleanup path needed for crashed invocations. The worst case
is a missed run (if the handler crashes between sendBatch and commit), which
is acceptable for a "best effort" cron system.

**Important: update `next_run_at` in a D1 batch with `createCapture`.**
Use `db.batch()` to atomically create the capture record AND advance `next_run_at`
in a single round-trip. This eliminates the race window between "schedule
selected" and "schedule marked as processed."

### 3. scheduleId propagation through the capture pipeline: minimum-change path

The queue message body gains one optional field: `scheduleId`. The propagation path:

1. **scheduled() handler** -- adds `scheduleId` to the queue message body
   (alongside existing `captureId`, `url`, `ip`, `tenantId`, `cip`, `enqueuedAt`)

2. **handleCaptureMessage (index.js:120)** -- destructure `scheduleId` from
   `msg.body`. No behavioral change needed. The field is passed through to
   `createCapture` which stores it in the captures table.

3. **createCapture (db.js:85)** -- add an optional `scheduleId` parameter.
   The INSERT statement gains a `schedule_id` column. This is the only DB
   function that needs modification.

4. **completeCapture / failCapture (db.js)** -- NO changes. The `schedule_id`
   is written at creation time and is immutable.

5. **performCapture (capture.js)** -- NO changes. It does not need to know
   about schedules. It receives `captureId`, does its work, returns results.

6. **rowToCapture (db.js:51)** -- add `scheduleId: row.schedule_id ?? null`
   to the returned object so API responses include the field.

7. **captures table** -- add `schedule_id TEXT` nullable column via migration.
   Add index: `CREATE INDEX idx_captures_schedule ON captures (schedule_id)
   WHERE schedule_id IS NOT NULL` for efficient schedule-grouped queries.

**Total changes to existing files: 3** (index.js message destructuring, db.js
createCapture + rowToCapture). The capture pipeline (capture.js, quotas.js)
is completely untouched.

### 4. CPU/wall-clock budget for scheduled() invocations

**Platform constraints (verified against Cloudflare docs):**
- Cron triggers with < 1 hour interval: 30s CPU time
- Cron triggers with >= 1 hour interval: 15 min CPU time
- Wall clock: 15 minutes maximum for all scheduled invocations
- sendBatch: max 100 messages per call, 256KB total
- Subrequests (D1 queries count): 10,000 per invocation on paid plan

**CPU budget analysis for a 1-minute cron:**
- The `[limits]` config sets `cpu_ms = 60000` (60s), but this may not
  override the cron-specific 30s limit for sub-hour intervals. The Cloudflare
  docs are ambiguous on whether `limits.cpu_ms` applies to scheduled handlers.
  **Must verify empirically before relying on > 30s CPU for the cron handler.**
- Each schedule iteration costs roughly:
  - 1 D1 batch (checkQuota): ~2ms CPU
  - 1 D1 batch (createCapture + update next_run_at): ~2ms CPU
  - Total per schedule: ~4-5ms CPU
- At 30s CPU budget: ~6,000 schedules theoretically, but D1 round-trip
  latency dominates wall clock, not CPU
- At 100 sendBatch limit: need multiple sendBatch calls for > 100 schedules

**Wall clock budget analysis:**
- D1 query latency: ~5-10ms per prepared statement
- checkQuota batch: ~10ms wall clock
- createCapture batch: ~10ms wall clock
- Per schedule total: ~20-25ms wall clock
- At 15 min wall clock: ~36,000 schedules theoretically
- More realistically, with 100-schedule sendBatch chunks: 360 batches

**Recommendation: process schedules in chunks of 100 (matching sendBatch limit).**
Query D1 for up to 100 due schedules at a time, process the chunk, sendBatch,
then query the next 100. This keeps memory bounded and aligns with the queue
API limit. Add a hard cap of 500-1000 schedules per invocation as a safety
valve -- if exceeded, log a warning and process the rest on the next tick.

**For MVP, the numbers are academic.** With per-tenant schedule limits of
e.g. 5-10 schedules and < 100 tenants initially, the total due schedules per
minute will be well under 100. A single D1 query + single sendBatch call
covers the entire fan-out. Design for the chunked approach but expect the
fast path (single batch) to be the norm.

### 5. Quota checking: batch-optimize for many schedules from the same tenant

When processing due schedules, multiple schedules may belong to the same tenant.
Calling `checkQuota(db, tenantId)` once per schedule is wasteful when 5
schedules from the same tenant are all due at the same minute.

**Optimization: group schedules by tenantId, check quota once per tenant,
then process all that tenant's schedules up to the remaining quota.**

```
dueSchedules = query D1
grouped = groupBy(dueSchedules, 'tenantId')
for each [tenantId, schedules] in grouped:
    quota = checkQuota(db, tenantId, schedules.length)
    if quota.allowed:
        process all schedules
    else:
        // Partial: some may fit within remaining quota
        remaining = quota.limit - quota.used
        process schedules.slice(0, remaining)
        log quota_exceeded for the rest
```

This reduces D1 round-trips from N (one per schedule) to T (one per tenant).

### 6. Cron interval recommendation

Use `*/1 * * * *` (every minute) as the cron trigger interval. This is the
minimum granularity Cloudflare supports and allows schedules to fire at their
configured time with at most 59 seconds of delay.

However, the 30s CPU limit for sub-hour intervals is the constraint to watch.
If CPU proves too tight, consider `0 * * * *` (hourly) which gets 15 minutes
of CPU, but this would mean hourly is the minimum schedule granularity --
likely unacceptable. Alternative: use a per-minute cron but ensure the
handler is extremely lean (pre-compute next_run_at, minimal JS processing).

## Proposed Tasks

1. **Migration: add schedule_id to captures table** -- `ALTER TABLE captures ADD COLUMN schedule_id TEXT; CREATE INDEX idx_captures_schedule ON captures (schedule_id) WHERE schedule_id IS NOT NULL;`

2. **Migration: create schedules table** -- `CREATE TABLE schedules (id TEXT PK, tenant_id TEXT FK, url TEXT NOT NULL, cron_expression TEXT NOT NULL, enabled INTEGER DEFAULT 1, next_run_at TEXT NOT NULL, last_run_at TEXT, created_at TEXT, updated_at TEXT);` with per-tenant index on `(tenant_id, enabled)` and a query index on `(enabled, next_run_at)`.

3. **db.js: add schedule data access functions** -- `getDueSchedules(db, limit)`, `advanceScheduleNextRun(db, scheduleId, nextRunAt)`, `createSchedule()`, `getSchedule()`, `listSchedules()`, `deleteSchedule()`, `updateSchedule()`. Group the advance + createCapture in a single `db.batch()`.

4. **db.js: modify createCapture to accept optional scheduleId** -- Add `schedule_id` to the INSERT statement, default null.

5. **db.js: modify rowToCapture to include scheduleId** -- Add `scheduleId: row.schedule_id ?? null`.

6. **index.js: implement scheduled() handler** -- Query due schedules, group by tenant, check quotas, create captures, advance next_run_at, sendBatch to queue. Include chunk-based processing and hard cap safety valve.

7. **index.js: pass scheduleId through handleCaptureMessage** -- Destructure from msg.body, pass to createCapture (already created by scheduled handler, but the field validates the linkage).

8. **wrangler.toml: add cron trigger configuration** -- `[triggers] crons = ["*/1 * * * *"]` for both production and staging.

9. **Schedule CRUD API endpoints** -- POST/GET/PUT/DELETE /v1/schedules with per-tenant auth and schedule limit enforcement.

10. **Verify CPU budget empirically** -- After deploying to staging, trigger the cron with varying numbers of due schedules and monitor CPU time via Cloudflare dashboard analytics. Confirm the `limits.cpu_ms = 60000` setting applies to scheduled invocations or if the 30s cron-specific limit prevails.

## Risks and Concerns

### R1: CPU limit ambiguity for sub-hour cron triggers (HIGH)

The Cloudflare docs state 30s CPU for cron intervals < 1 hour. The existing
`[limits] cpu_ms = 60000` may or may not override this for scheduled handlers.
If it does not, the handler has 30s of CPU. This is likely sufficient for MVP
scale but must be validated empirically on staging before production deployment.

**Mitigation:** Instrument the scheduled handler with start/end timestamps.
Deploy to staging first. If 30s proves too tight, options are: (a) move to
hourly cron with minute-level next_run_at checks, (b) offload fan-out to a
queue message that triggers the actual processing via the queue consumer
(which has the full 60s CPU budget), (c) use Durable Objects for scheduling.

### R2: sendBatch partial failure semantics (MEDIUM)

If `sendBatch()` throws, it is unclear whether zero messages were delivered or
some subset was. The Cloudflare docs do not specify atomicity guarantees for
sendBatch. If some messages were delivered and the handler treats the entire
batch as failed (calling failCapture on all), those delivered messages will
create duplicate captures.

**Mitigation:** The existing idempotency guard in `handleCaptureMessage`
(checks if capture is already terminal) prevents actual duplicate work. The
risk is orphaned `pending` capture records that never get processed. Consider
a periodic cleanup job that fails captures older than 30 minutes still in
`pending` state.

### R3: D1 write contention during fan-out (LOW for MVP)

The scheduled handler writes one capture record + one schedule update per
schedule in a `db.batch()`. At scale (hundreds of concurrent due schedules),
D1's single-writer model could cause elevated latency. D1 batches are
serialized per database.

**Mitigation:** For MVP this is not an issue (< 100 schedules total).
At scale, consider batching multiple createCapture INSERTs into a single
db.batch() call (D1 supports up to 100 statements per batch). This is a
natural optimization that aligns with the sendBatch chunk size of 100.

### R4: Schedule drift on long-running captures (LOW)

If a schedule is set to `*/5 * * * *` (every 5 minutes) and the previous
capture takes 10 minutes, the schedule will fire immediately on the next
cron tick after the capture completes (because next_run_at was advanced to
5 minutes after last_run_at, which is now in the past). This means two
captures fire in quick succession.

This is actually correct behavior for cron semantics (fire at every matching
time regardless of previous duration). If "don't overlap" semantics are
desired, that's a different feature (one-at-a-time mode) which should be
deferred to post-MVP.

### R5: Quota consumption by scheduled captures may surprise users (MEDIUM)

Scheduled captures consume from the same monthly quota as on-demand captures.
A user with 5 hourly schedules burns 5 * 24 * 30 = 3,600 captures/month,
well exceeding the 200 free tier limit in 2 days. Users need clear
documentation and ideally a projected-usage calculation at schedule creation
time.

**Mitigation:** At schedule creation, calculate monthly projected captures
and warn if it exceeds remaining quota. Include projected_monthly_captures
in the schedule API response.

## Additional Agents Needed

- **backend-minion**: Primary implementer for the scheduled() handler, D1 migrations, schedule CRUD endpoints, and integration with the existing capture pipeline. This is core Cloudflare Workers development.
- **data-minion**: Review the D1 schema design for the schedules table, index strategy, and the query pattern for `getDueSchedules` (the `(enabled, next_run_at)` index is critical for performance at scale).
- **security-minion**: Review schedule creation for abuse vectors -- a tenant creating many schedules with high-frequency cron expressions could amplify load beyond what per-tenant rate limits catch (rate limits gate the API call, not the cron fan-out). The per-tenant schedule limit is the primary defense.
- **testing-minion**: The cron fan-out has multiple failure modes (quota denied, D1 error, sendBatch failure, partial failure) that need targeted test coverage. The interaction between `checkQuota` and `incrementUsage` across multiple same-tenant schedules in a single cron tick is a subtle correctness concern.
