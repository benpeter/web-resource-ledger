# Domain Plan Contribution: api-design-minion

## Recommendations

### 1. Route Structure: Top-Level `/v1/schedules`

Schedules are a first-class resource, not a sub-resource of captures. A schedule *produces* captures over time, but it is not a capture itself. Nesting (`/v1/captures/schedules`) would imply schedules are a property of a single capture, which is semantically wrong.

Follow the webhooks pattern exactly:

```
POST   /v1/schedules                     -- create a schedule
GET    /v1/schedules                     -- list schedules for tenant
GET    /v1/schedules/:scheduleId         -- get a single schedule (with next/last run info)
PATCH  /v1/schedules/:scheduleId         -- update (pause/resume, change cron, rename)
DELETE /v1/schedules/:scheduleId         -- delete a schedule
```

**ID format:** `sch_` + 32 lowercase hex chars (total length 36), consistent with `cap_` and `whk_` patterns.

**Route regex:** `/v1/schedules/(sch_[a-f0-9]{32})` -- same validation-in-route approach as webhooks.

**Why GET single + PATCH:** Unlike webhooks (which have no updatable state beyond delete/recreate), schedules have a `paused` state and mutable fields (name, cron). A PATCH endpoint avoids the delete-and-recreate antipattern for pause/resume. PATCH is already in the project's HTTP vocabulary (the codebase uses idempotent semantics correctly).

**Why no POST `/:scheduleId/trigger`:** YAGNI. On-demand captures already exist via `POST /v1/captures`. If a user wants to trigger a scheduled URL outside its cron window, they can call the capture endpoint directly with the same URL. A trigger action can be added later without breaking changes.

### 2. Request/Response Shapes

#### POST /v1/schedules -- Create

**Request body:**

```json
{
  "url": "https://example.com/page-to-capture",
  "cron": "0 */6 * * *",
  "name": "Homepage every 6 hours"
}
```

| Field  | Type   | Required | Constraints |
|--------|--------|----------|-------------|
| `url`  | string | yes      | Same validation as `POST /v1/captures` (SSRF protection via `validateUrl()`) |
| `cron` | string | yes      | Standard 5-field cron expression. Minimum interval: 1 hour. See section 3. |
| `name` | string | yes      | 1-128 chars, same regex as webhooks: `/^[a-zA-Z0-9 _.:-]{1,128}$/` |

**Use `ALLOWED_CREATE_FIELDS` pattern** from webhooks to reject unknown fields. Fields: `url`, `cron`, `name`.

**201 response:**

```json
{
  "id": "sch_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
  "url": "https://example.com/page-to-capture",
  "cron": "0 */6 * * *",
  "name": "Homepage every 6 hours",
  "paused": false,
  "nextRunAt": "2026-03-23T12:00:00.000Z",
  "createdAt": "2026-03-23T10:15:30.000Z"
}
```

The `nextRunAt` field is computed from the cron expression at creation time and returned immediately so the user knows when the first execution will happen.

#### GET /v1/schedules -- List

**Response:**

```json
{
  "data": [
    {
      "id": "sch_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
      "url": "https://example.com/page-to-capture",
      "cron": "0 */6 * * *",
      "name": "Homepage every 6 hours",
      "paused": false,
      "nextRunAt": "2026-03-23T18:00:00.000Z",
      "lastRunAt": "2026-03-23T12:00:00.000Z",
      "lastRunStatus": "complete",
      "lastCaptureId": "cap_f1e2d3c4b5a6f1e2d3c4b5a6f1e2d3c4",
      "createdAt": "2026-03-23T10:15:30.000Z",
      "updatedAt": "2026-03-23T12:00:30.000Z"
    }
  ]
}
```

Wraps in `{ data: [...] }` following the webhooks list pattern. `lastRunStatus` is one of `complete`, `failed`, or `null` (never run). `lastCaptureId` links to the most recent capture produced by this schedule, enabling direct lookup via `GET /v1/captures/:captureId`.

**No pagination needed initially** -- schedules are capped at a small number per tenant (see section 4). If the cap is 10, returning all in one response is fine. Add pagination later if caps increase.

#### GET /v1/schedules/:scheduleId -- Single

Same shape as a list item. Returns 404 (same for nonexistent and other-tenant's schedule, matching the webhooks information-disclosure defense).

#### PATCH /v1/schedules/:scheduleId -- Update

**Request body (all fields optional, at least one required):**

```json
{
  "paused": true,
  "cron": "0 */12 * * *",
  "name": "Homepage every 12 hours"
}
```

| Field    | Type    | Constraints |
|----------|---------|-------------|
| `paused` | boolean | Pause/resume the schedule |
| `cron`   | string  | Same validation as create |
| `name`   | string  | Same validation as create |

**URL is immutable.** Changing the target URL is semantically a different schedule. Delete and recreate. This avoids confusion about whether historical captures belong to the old URL or new URL.

**200 response:** Full schedule object (same shape as GET single), with `updatedAt` reflecting the change. `nextRunAt` is recomputed if `cron` or `paused` changed (null when paused).

Use `ALLOWED_PATCH_FIELDS` set to reject unknown fields, same pattern as webhooks' `ALLOWED_CREATE_FIELDS`.

#### DELETE /v1/schedules/:scheduleId

**200 response:** `{ "id": "sch_...", "deleted": true }` -- matches webhooks pattern exactly.

### 3. Cron Expression Validation

**Use a small cron-parser library** (e.g., `cron-parser` or `croner`) rather than writing a custom parser. Cron parsing is deceptively complex (step values, ranges, month names, day-of-week conflicts). A well-tested library avoids subtle bugs.

However, per the project's KISS/lean philosophy, evaluate whether `croner` (0 deps, ~6KB minified) is sufficient. It can parse, validate, and compute `nextRunAt` -- which covers all three needs (validation, minimum interval enforcement, and next-run computation).

**Minimum interval enforcement (hourly):**

Compute the next N (e.g., 5) fire times from the cron expression. If any two consecutive fire times are less than 60 minutes apart, reject the expression with a 400:

```json
{
  "type": "about:blank",
  "status": 400,
  "title": "Bad Request",
  "detail": "Cron expression '*/5 * * * *' would fire more frequently than once per hour. Minimum interval is 60 minutes."
}
```

**Why check multiple intervals:** A cron like `0 9,10 * * 1` (9 AM and 10 AM on Mondays) has a 1-hour minimum gap -- valid. But `0 9,9 * * 1` or `*/30 * * * *` would fail. Checking only adjacent pairs of the next 5 fire times catches all practical cases without being overly conservative.

**Disallowed patterns:**
- Reject `@reboot`, `@yearly`, `@annually` -- only standard 5-field syntax
- Reject seconds fields (6-field cron) -- this is not a sub-minute system
- Reject empty or whitespace-only strings

**Why not just restrict to preset intervals:** The cron format is more flexible and is what developers expect. Preset intervals (`hourly`, `daily`, `weekly`) are too limiting and would require a separate expression-to-interval mapping anyway.

### 4. Schedule Limit Exceeded Response

**Use 409 Conflict, not 429 Too Many Requests.**

The webhooks module already uses 409 for the max-5-webhooks-per-tenant limit. 429 means "you are sending requests too fast" (rate limiting). 409 means "the current state of the resource prevents this action" (you have too many schedules). The semantics are different and clients need to distinguish them.

**Per-tenant schedule limit:** Start with **10 schedules per tenant** (free and paid alike). This is a resource limit, not a rate limit. Override via `tenantConfig` if needed (same pattern as rate limit overrides).

**409 response:**

```json
{
  "type": "about:blank",
  "status": 409,
  "title": "Conflict",
  "detail": "Tenant 'acme' has reached the maximum of 10 schedules. Delete an existing schedule before creating a new one."
}
```

This matches the webhooks 409 response pattern word-for-word (modulo numbers and resource name).

**Future consideration:** If schedules become a paid-tier differentiator (e.g., free: 3, paid: 10), the limit can be read from `getEffectiveQuota()`. But YAGNI -- start with a flat cap.

### 5. Auth Model: Reuse `capture` Scope

**Do not create a new scope.** Creating a schedule is logically equivalent to pre-authorizing future captures. Any key that can create captures should be able to schedule them.

- `POST /v1/schedules` -- requires `capture` scope
- `GET /v1/schedules` -- requires `capture` scope (NOT `read`, because schedule management is an operational action, not a read-only audit)
- `PATCH /v1/schedules/:scheduleId` -- requires `capture` scope
- `DELETE /v1/schedules/:scheduleId` -- requires `capture` scope

This matches webhooks, which also use `capture` scope for all CRUD operations.

**Session auth (OAuth users):** Use `verifyAuth()` (the dual cookie+API-key function from index.js), not `verifyApiKey()` directly. This allows Web UI users to manage schedules through the dashboard, same as captures and webhooks.

### 6. Capture-Schedule Linkage via `scheduleId` Filter

**Yes, add `schedule_id` as a query parameter to `GET /v1/captures`.**

```
GET /v1/captures?schedule_id=sch_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4
```

This follows the existing filter parameter pattern (`status`, `url`, `created_after`, `created_before`, `sort`).

**Implementation:** Add a `schedule_id` column to the `captures` table (nullable, foreign key to `schedules.id`). When the cron handler creates a capture, it populates this field. Manual (non-scheduled) captures have `schedule_id = NULL`.

**Include in capture response body:** When a capture has a `scheduleId`, include it in the capture response:

```json
{
  "id": "cap_...",
  "scheduleId": "sch_...",
  "url": "...",
  "status": "complete",
  ...
}
```

This is an additive, backward-compatible change (new optional field, null for existing captures).

**Index:** `CREATE INDEX idx_captures_schedule ON captures (schedule_id, created_at DESC) WHERE schedule_id IS NOT NULL;` -- partial index avoids bloating the index with NULL rows from manual captures.

### 7. Additional API Design Details

**operationId conventions** (for future OpenAPI spec):
- `createSchedule`, `listSchedules`, `getSchedule`, `updateSchedule`, `deleteSchedule`
- Consistent with the existing pattern: `createWebhook`, `listWebhooks`, `deleteWebhook`

**Logging events** (follow webhooks pattern):
- `schedule.create`, `schedule.list`, `schedule.get`, `schedule.update`, `schedule.delete`
- `schedule.execute` (when cron fires and enqueues a capture)
- `schedule.execute.skip` (when cron fires but schedule is paused or tenant is over quota)

**Rate limiting:** Schedule CRUD should fall under the existing `capture` rate limit group. No separate rate limit group needed -- schedule operations are low-frequency management operations, and the per-tenant 10/60s capture limit is more than sufficient.

**File organization:** Create `src/schedules.js` following the `src/webhooks.js` pattern -- self-contained CRUD handlers, imported and registered in `src/index.js`.

## Proposed Tasks

1. **Design and write D1 migration `0007_schedules.sql`** -- `schedules` table with all columns, indexes; `ALTER TABLE captures ADD COLUMN schedule_id` with index.

2. **Add DB access functions in `src/db.js`** -- `createSchedule`, `getSchedule`, `listSchedules`, `updateSchedule`, `deleteSchedule`, `countSchedules`, following the webhooks function signatures and row-transform pattern.

3. **Implement `src/schedules.js`** -- CRUD HTTP handlers (`handleCreateSchedule`, `handleListSchedules`, `handleGetSchedule`, `handleUpdateSchedule`, `handleDeleteSchedule`). Include cron validation, schedule count enforcement, and `nextRunAt` computation.

4. **Register routes in `src/index.js`** -- Add 5 route tuples to the `routes` array, import handlers from `src/schedules.js`, add `schedule` to `getRateLimitGroup` mapping.

5. **Add `schedule_id` filter to `handleListCaptures`** -- New query parameter, SQL WHERE clause, partial index.

6. **Include `scheduleId` in capture response shapes** -- Update `handleGetCapture`, `handleCaptureStatus`, and `handleListCaptures` to include the field when non-null.

7. **Implement `scheduled()` handler in worker export** -- The Cloudflare Cron Trigger handler that reads due schedules from D1 and enqueues capture jobs with `schedule_id` populated.

8. **Configure cron trigger in `wrangler.toml`** -- Add `[triggers] crons = ["* * * * *"]` (every minute) to both production and staging. The handler itself checks which schedules are actually due; the cron trigger just wakes the worker.

9. **Write tests** -- Unit tests for cron validation logic, CRUD handlers (following `test/webhooks.test.js` patterns), and integration test for the scheduled handler.

## Risks and Concerns

### Risk 1: Cron Library Dependency

Adding a cron parsing library adds a dependency to a project that values minimal deps. **Mitigation:** Use `croner` (0 transitive deps, ~6KB). The alternative -- writing a custom 5-field cron parser -- is a significant effort with high bug risk for edge cases (month boundaries, day-of-week vs day-of-month conflicts). The library cost is justified.

### Risk 2: Cloudflare Cron Trigger Granularity vs. Schedule Volume

Cloudflare Cron Triggers fire the `scheduled()` handler at a configured interval. If we use a 1-minute cron trigger, every minute the handler must query D1 for due schedules across all tenants. With a small number of tenants this is trivial, but at scale it becomes a hot path.

**Mitigation:** The query `SELECT * FROM schedules WHERE paused = 0 AND next_run_at <= datetime('now')` is indexed and returns only due schedules. Even at 1000 schedules, this is a single indexed D1 query. D1's read performance handles this easily.

**Longer term:** If schedule volume grows significantly, consider partitioning by next-run-at bucket or using Durable Object alarms for per-schedule timers. But YAGNI for now.

### Risk 3: Quota Interaction with Scheduled Captures

Scheduled captures consume quota just like manual captures. If a tenant hits their monthly limit, the scheduled handler must skip execution gracefully (not fail the schedule permanently). The handler should:
- Check quota before enqueuing
- Log `schedule.execute.skip` with reason `quota_exceeded`
- NOT pause or disable the schedule (it should resume automatically when quota resets)
- NOT count the skip as a "last run" (preserve the previous successful run info)

### Risk 4: Time Drift and Missed Runs

If the cron trigger fires late or the handler takes too long, a schedule's `next_run_at` might be in the past. The handler should:
- Execute at most **one** capture per schedule per handler invocation (not try to "catch up" missed runs)
- Advance `next_run_at` to the *next future* occurrence, not just the next occurrence after the missed time
- Log `schedule.execute.catchup` if the scheduled time was more than 5 minutes ago

### Risk 5: URL Immutability Decision

Making `url` immutable on PATCH means renaming a URL requires delete+create, which loses run history linkage. This is an intentional tradeoff -- it keeps the data model clean (all captures for a schedule share the same URL) and avoids ambiguity. The captures themselves retain their URL regardless, so history is not lost -- it just is not grouped under the same schedule ID.

## Additional Agents Needed

- **data-minion**: To review the D1 migration schema (`schedules` table, `captures.schedule_id` column, indexes) and ensure it aligns with D1/SQLite constraints and query patterns.
- **security-minion**: To review the auth model (reusing `capture` scope), ensure scheduled captures cannot be used to bypass rate limits or quotas, and verify that the `scheduled()` handler (which runs without user auth) cannot be abused.
