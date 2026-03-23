# Domain Plan Contribution: data-minion

## Recommendations

### 1. Schedules Table Schema

Migration `0007_schedules.sql`. Follow existing conventions: `PRAGMA foreign_keys = ON`, prefixed IDs with CHECK constraints, TEXT timestamps, JSON for flexible fields.

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE schedules (
  id          TEXT    NOT NULL PRIMARY KEY
                        CHECK (id GLOB 'sch_[a-f0-9]*' AND length(id) = 36),
  tenant_id   TEXT    NOT NULL REFERENCES tenants(id),
  url         TEXT    NOT NULL CHECK (length(url) <= 2048),
  name        TEXT    NOT NULL,
  cron        TEXT    NOT NULL CHECK (length(cron) <= 128),
  timezone    TEXT    NOT NULL DEFAULT 'UTC' CHECK (length(timezone) <= 64),
  next_run_at TEXT    NOT NULL,  -- ISO 8601, pre-computed from cron expression
  active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  capture_settings TEXT,  -- JSON: same shape as captures.capture_settings
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT
);

-- The critical fan-out query: "find all schedules due now"
-- Covering index on (active, next_run_at) with tenant_id for grouping
CREATE INDEX idx_schedules_due
  ON schedules (next_run_at, tenant_id)
  WHERE active = 1;

-- Tenant listing: all schedules for a tenant, most recent first
CREATE INDEX idx_schedules_tenant
  ON schedules (tenant_id, created_at DESC);
```

### 2. Cron Expression Storage: Pre-computed `next_run_at` (strongly recommended)

**Decision: Store both `cron` (the raw expression) AND `next_run_at` (the pre-computed next execution time).**

Rationale:

- **The fan-out query is the hot path.** On every Cron Trigger tick (e.g., every minute), the Worker must find all schedules due for execution. This query must be a simple range scan: `WHERE active = 1 AND next_run_at <= ?`. Without `next_run_at`, every active schedule row must be loaded and its cron expression parsed in application code -- O(N) parse operations on every tick, which degrades linearly with schedule count.
- **D1 has no cron parsing function.** SQLite (and D1) cannot evaluate cron expressions in SQL. Application-layer parsing is required regardless, but the question is *when*: at write time (once per schedule update) or at read time (once per tick per active schedule). Write-time computation is strictly better.
- **`cron` is kept for display and re-computation.** The raw expression is needed for the API response (`GET /v1/schedules/:id`), for editing, and to recompute `next_run_at` after each execution. It is the source of truth; `next_run_at` is a materialized derived value.
- **After each execution, update `next_run_at`.** The scheduled handler computes the next occurrence from `cron` + `timezone` and writes it back. This is a single UPDATE per executed schedule -- negligible cost.

This is the **Computed Pattern** from document databases applied to SQLite: pre-calculate expensive derivations at write time to keep reads fast.

### 3. Linking Captures to Schedules: Nullable FK on `captures`

**Decision: Add `schedule_id TEXT REFERENCES schedules(id)` to the `captures` table.** No join table.

Rationale:

- **One-to-many relationship.** A schedule produces many captures over time; each capture is produced by at most one schedule (or none, for ad-hoc captures). This is a textbook nullable FK.
- **No join table needed.** A join table (captures_schedules) would be justified for many-to-many relationships. Here the cardinality is strictly one-to-many, so a join table adds a JOIN on every capture query and doubles the write cost for scheduled captures with zero benefit.
- **Nullable preserves backward compatibility.** Existing ad-hoc captures have `schedule_id = NULL`. No data migration needed. The `ALTER TABLE` adds the column with a NULL default.
- **Follows existing patterns.** `captures.tenant_id` is already a FK. Adding `schedule_id` is identical in pattern.
- **Enables efficient grouping.** `SELECT * FROM captures WHERE schedule_id = ? ORDER BY created_at DESC` is a clean query for "show me all captures from this schedule." Add an index to support it.

Migration addition (in same `0007_schedules.sql` or a separate `0007b`):

```sql
ALTER TABLE captures ADD COLUMN schedule_id TEXT REFERENCES schedules(id);

-- Captures belonging to a schedule, most recent first
CREATE INDEX idx_captures_schedule
  ON captures (schedule_id, created_at DESC)
  WHERE schedule_id IS NOT NULL;
```

The partial index (`WHERE schedule_id IS NOT NULL`) keeps the index small -- only scheduled captures are indexed, ad-hoc captures (the majority) are excluded.

### 4. Index Strategy for the Fan-Out Query

The critical query executed on every Cron Trigger tick:

```sql
SELECT id, tenant_id, url, cron, timezone, capture_settings
FROM schedules
WHERE active = 1 AND next_run_at <= ?
ORDER BY tenant_id;
```

The partial index `idx_schedules_due ON schedules (next_run_at, tenant_id) WHERE active = 1` covers this perfectly:

- **Partial index filters inactive schedules at storage time**, not query time. Paused/deleted schedules never enter the index.
- **`next_run_at` as leading column** enables a range scan (`<= ?`) that stops as soon as it hits schedules not yet due.
- **`tenant_id` as second column** provides the `ORDER BY tenant_id` grouping for free (the index is already sorted by tenant within each next_run_at bucket).
- **Expected cardinality is tiny.** On any given tick, the number of due schedules is small (most schedules fire hourly or less frequently). Even with thousands of total schedules, the query returns tens of rows.

**Why ORDER BY tenant_id matters:** The scheduled handler should group by tenant to (a) batch quota checks per tenant rather than per schedule, and (b) respect per-tenant schedule limits without N+1 queries.

### 5. Schedule Limits Per Tenant: `tenants.config` JSON

**Decision: Store schedule limits in the existing `tenants.config` JSON, not as a new column.**

Rationale:

- **Follows the established pattern.** `config.rateLimit` and `config.quotas` already live in the config JSON. Schedule limits are the same category: per-tenant operational limits with platform defaults.
- **No ALTER TABLE needed.** Adding a column for every new limit type does not scale. The config JSON is the extensible mechanism for tenant-specific overrides.
- **Application-layer defaults.** Just like `FREE_CAPTURE_LIMIT` in quotas.js, define `DEFAULT_SCHEDULE_LIMIT = 5` (free tier) as an application constant. If `config.schedules.maxSchedules` exists, use it; otherwise use the default. Paid tenants (payment_method_added_at != null) get a higher default (e.g., 25).
- **Enforcement pattern mirrors webhooks.** `countWebhooks()` already enforces a 5-per-tenant webhook limit. Use the same pattern: `countSchedules(db, tenantId)` returns the current count, the API checks it against the effective limit before INSERT.

Config JSON shape:

```json
{
  "quotas": { "capturesPerMonth": 500 },
  "rateLimit": { "capture": { "limit": 20, "period": 60 } },
  "schedules": { "maxSchedules": 10 }
}
```

Validation in `setTenantConfig`:

```js
if (config.schedules?.maxSchedules !== undefined) {
  if (typeof config.schedules.maxSchedules !== 'number' ||
      config.schedules.maxSchedules < 1 ||
      !Number.isInteger(config.schedules.maxSchedules)) {
    throw new Error('schedules.maxSchedules must be a positive integer');
  }
}
```

### 6. ID Format

`sch_` + 32 lowercase hex chars (total 36 chars). Matches the conventions of `cap_` (captures) and `whk_` (webhooks). Regex: `/^sch_[a-f0-9]{32}$/`.

### 7. Queue Message Enhancement

When the scheduled handler enqueues captures, include `scheduleId` in the queue message body so the queue consumer can set `captures.schedule_id` in `createCapture`:

```js
await env.CAPTURE_QUEUE.send({
  captureId, url, ip: null, tenantId, cip: 'cron',
  scheduleId: schedule.id,  // new field
  enqueuedAt: Date.now(),
});
```

The `createCapture` function in db.js needs a new optional `scheduleId` parameter:

```js
export async function createCapture(db, captureId, url, ip, tenantId, scheduleId = null) {
  const createdAt = new Date().toISOString();
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO tenants (id) VALUES (?)').bind(tenantId),
    db.prepare(
      'INSERT INTO captures (id, tenant_id, url, ip, status, created_at, schedule_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).bind(captureId, tenantId, url, ip, 'pending', createdAt, scheduleId),
  ]);
}
```

### 8. Timezone Handling

Store the IANA timezone string (e.g., `Europe/Berlin`, `America/New_York`) alongside the cron expression. Cron expressions are inherently ambiguous without a timezone. The `timezone` column defaults to `UTC` and is used when computing `next_run_at`. Validation should reject unknown timezone identifiers at the API layer (use `Intl.supportedValuesOf('timeZone')` available in Workers runtime).

## Proposed Tasks

1. **Write migration `0007_schedules.sql`**: CREATE TABLE schedules, ALTER TABLE captures ADD schedule_id, CREATE INDEX for both. Single migration file for atomic deployment.

2. **Add db.js CRUD functions for schedules**: `createSchedule`, `getSchedule`, `listSchedules`, `updateSchedule`, `deleteSchedule`, `countSchedules`, `getDueSchedules` (the fan-out query). Follow existing patterns (rowToSchedule transformer, db.batch for multi-statement, camelCase return shapes).

3. **Extend `createCapture` signature**: Add optional `scheduleId` parameter. Backward compatible -- existing callers pass nothing, new scheduled handler passes the schedule ID.

4. **Add schedule limit enforcement**: `getEffectiveScheduleLimit(hasPaymentMethod, tenantConfig)` function analogous to `getEffectiveQuota`. Default: 5 for free, 25 for paid.

5. **Add config validation for `schedules.maxSchedules`** in `setTenantConfig`.

6. **Add `getDueSchedules` and `advanceSchedule` functions**: `getDueSchedules(db, asOf)` returns all active schedules where `next_run_at <= asOf`. `advanceSchedule(db, scheduleId, nextRunAt)` updates `next_run_at` after execution. These are the two primitives the Cron Trigger handler needs.

7. **Cron expression library selection**: Need a lightweight JS library to parse cron expressions and compute next occurrence given a timezone. Candidates: `cron-parser` (mature, handles timezones, ~15KB). Must run in Workers runtime (no Node.js-specific APIs). This is an implementation concern but has data implications (it determines what cron syntax is valid and stored).

## Risks and Concerns

### R1: Cron Trigger Granularity vs. Schedule Precision

Cloudflare Cron Triggers have a minimum granularity of 1 minute. If a schedule's `next_run_at` falls between ticks, it will execute on the next tick. This is fine -- cron is inherently approximate. But the `next_run_at` computation must round to minute boundaries to avoid schedules being consistently late by up to 59 seconds.

### R2: Clock Skew on Cron Trigger Execution

The Cron Trigger fires at approximately the configured time, not exactly. The fan-out query should use a small grace window (e.g., `next_run_at <= datetime('now', '+60 seconds')`) to avoid missing schedules that are a few seconds past due. Alternatively, since the handler computes "now" in JS, pass `new Date().toISOString()` as the threshold -- this avoids SQLite `datetime()` vs JS `Date` inconsistency (the same pattern used for grace period expiry in quotas.js).

### R3: Concurrent Cron Trigger Execution

If the Cron Trigger fires every minute and a previous invocation is still running, Cloudflare may run them concurrently. The fan-out query + advance pattern must be idempotent: if two invocations both select the same schedule and both try to enqueue + advance, the capture should not be duplicated. Solutions: (a) use a CAS-style UPDATE (`UPDATE schedules SET next_run_at = ? WHERE id = ? AND next_run_at = ?`) so only one invocation succeeds, (b) accept rare duplicates and deduplicate downstream. Option (a) is preferred -- it is simple and correct.

### R4: Scheduled Captures and Quota Interaction

Scheduled captures must still go through `checkQuota`. If a tenant hits their capture limit mid-month, scheduled captures should be skipped (not queued) with a log entry. The schedule should NOT be paused permanently -- it should try again on the next tick (the tenant may upgrade or the period may reset). This means: check quota, skip if denied, advance `next_run_at` regardless.

### R5: Large Fan-Out at Scale

If many schedules fire at the same minute (e.g., hundreds of `0 * * * *` schedules), the Cron Trigger handler must batch the queue sends. `CAPTURE_QUEUE.sendBatch()` is already used in the batch capture endpoint. The handler should batch by chunks of 100 (Workers queue batch limit) and use `ctx.waitUntil` for non-blocking sends.

### R6: D1 Row Count Growth

Each schedule adds one row forever (until deleted). The index `idx_schedules_due` is partial (only active schedules), so deactivated schedules do not bloat the hot index. But the `idx_schedules_tenant` index includes all schedules. At expected scale (hundreds to low thousands of schedules total), this is not a concern. If scale reaches tens of thousands, consider a `deleted_at` soft-delete column with periodic hard-delete cleanup.

### R7: `schedule_id` FK and Cascade on Delete

When a schedule is deleted, what happens to its captures? Two options:
- **SET NULL on DELETE**: Captures lose their schedule association but remain queryable. This preserves audit trail.
- **RESTRICT**: Cannot delete a schedule that has captures. Forces explicit cleanup.

**Recommendation: SET NULL.** The captures are valuable data artifacts regardless of whether the schedule that created them still exists. Losing the association is acceptable. However, D1 does not support `ON DELETE SET NULL` in ALTER TABLE ADD COLUMN. The FK constraint is advisory (D1 enforces FKs per-session, and the application layer handles deletion). Implement SET NULL behavior in the `deleteSchedule` db.js function: first `UPDATE captures SET schedule_id = NULL WHERE schedule_id = ?`, then `DELETE FROM schedules WHERE id = ?`, both in a `db.batch()`.

## Additional Agents Needed

- **api-design-minion**: Needs to define the REST API surface for schedules (CRUD endpoints, request/response shapes, cron expression validation rules, error responses). The data schema flows from access patterns, and the API design determines what access patterns exist.
- **iac-minion**: Cron Trigger configuration in `wrangler.toml` (the `[triggers]` section). Needs to decide trigger frequency (every minute is the most flexible but costs more in invocations). Also needs to set up the staging equivalent.
- **security-minion**: Scheduled captures bypass the normal API request flow (no API key in the request, no IP address). The `ip` field will be NULL and `cip` will be `'cron'`. Need to confirm this does not violate any audit or compliance assumptions. Also: cron expressions should be validated to prevent unreasonable frequencies (e.g., `* * * * *` = every minute may be too aggressive for free tier).
