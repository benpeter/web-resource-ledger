## Delegation Plan

**Team name**: scheduled-captures
**Description**: Implement cron-style scheduled recurring captures with Cloudflare Cron Triggers, D1 schedule management, per-tenant limits, Web UI schedule panel, and full observability.

### Task 1: D1 schema migration + db.js CRUD functions
- **Agent**: data-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: yes
- **Gate reason**: Schema design is hard to reverse once deployed. All downstream tasks depend on the table structure, column names, and index strategy. Wrong schema here forces rework everywhere.
- **Gate rationale**: |
    Chosen: Single migration `0007_schedules.sql` with schedules table + ALTER TABLE captures ADD schedule_id, using pre-computed `next_run_at` for fan-out queries
    Over: (a) Separate cron evaluation at query time (O(N) parse per tick), (b) Join table for captures-schedules (unnecessary for one-to-many)
    Why: Pre-computed next_run_at makes the hot-path fan-out query a simple indexed range scan; nullable FK is the textbook pattern for one-to-many with optional parent
- **Prompt**: |
    You are implementing the D1 schema migration and database access functions for the WRL scheduled captures feature. This is a Cloudflare Workers project using D1 (SQLite) for metadata.

    ## What to do

    ### 1. Create migration file `migrations/0007_schedules.sql`

    Follow the conventions in existing migrations (0001-0006). Include `PRAGMA foreign_keys = ON;` at the top.

    **schedules table:**
    ```sql
    CREATE TABLE schedules (
      id          TEXT    NOT NULL PRIMARY KEY
                            CHECK (id GLOB 'sch_[a-f0-9]*' AND length(id) = 36),
      tenant_id   TEXT    NOT NULL REFERENCES tenants(id),
      url         TEXT    NOT NULL CHECK (length(url) <= 2048),
      name        TEXT    NOT NULL CHECK (length(name) BETWEEN 1 AND 128),
      cron        TEXT    NOT NULL CHECK (length(cron) <= 128),
      next_run_at TEXT    NOT NULL,
      paused      INTEGER NOT NULL DEFAULT 0 CHECK (paused IN (0, 1)),
      last_run_at TEXT,
      last_capture_id TEXT,
      last_capture_status TEXT,
      created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at  TEXT
    );
    ```

    **Indexes on schedules:**
    ```sql
    -- Fan-out query: find all active schedules due now
    CREATE INDEX idx_schedules_due
      ON schedules (next_run_at, tenant_id)
      WHERE paused = 0;

    -- Tenant listing: all schedules for a tenant
    CREATE INDEX idx_schedules_tenant
      ON schedules (tenant_id, created_at DESC);
    ```

    **Add schedule_id to captures:**
    ```sql
    ALTER TABLE captures ADD COLUMN schedule_id TEXT REFERENCES schedules(id);

    CREATE INDEX idx_captures_schedule
      ON captures (schedule_id, created_at DESC)
      WHERE schedule_id IS NOT NULL;
    ```

    ### 2. Add schedule functions to `src/db.js`

    Add these exports to db.js, following existing patterns exactly (see `createWebhook`, `listWebhooks`, `deleteWebhook`, `countWebhooks` as templates):

    **Constants:**
    - `export const SCHEDULE_ID_RE = /^sch_[a-f0-9]{32}$/;`
    - `DEFAULT_SCHEDULE_LIMIT = 10` (not exported -- internal default)

    **Row transformer:**
    ```js
    function rowToSchedule(row) {
      return {
        id: row.id,
        url: row.url,
        name: row.name,
        cron: row.cron,
        paused: Boolean(row.paused),
        nextRunAt: row.next_run_at,
        lastRunAt: row.last_run_at ?? null,
        lastCaptureId: row.last_capture_id ?? null,
        lastCaptureStatus: row.last_capture_status ?? null,
        createdAt: row.created_at,
        updatedAt: row.updated_at ?? null,
      };
    }
    ```

    **Functions to implement:**
    - `createSchedule(db, id, tenantId, url, name, cron, nextRunAt)` -- INSERT with tenant existence check via db.batch()
    - `getSchedule(db, id, tenantId)` -- SELECT with tenant_id filter (IDOR protection)
    - `listSchedules(db, tenantId)` -- SELECT all for tenant, ORDER BY created_at DESC
    - `deleteSchedule(db, id, tenantId)` -- SET captures.schedule_id = NULL for this schedule, then DELETE schedule, both in db.batch(). Return `{ deleted: true }` or null if not found.
    - `countSchedules(db, tenantId)` -- SELECT COUNT(*) WHERE tenant_id = ? (count ALL non-deleted schedules, including paused)
    - `updateSchedule(db, id, tenantId, fields)` -- UPDATE only the provided fields (paused, cron, name, next_run_at). Set updated_at. Return updated row or null.
    - `getDueSchedules(db, asOf)` -- SELECT * FROM schedules WHERE paused = 0 AND next_run_at <= ? ORDER BY tenant_id. This is the fan-out query.
    - `advanceSchedule(db, id, nextRunAt, lastCaptureId, lastCaptureStatus)` -- CAS-style UPDATE: `UPDATE schedules SET next_run_at = ?, last_run_at = datetime('now'), last_capture_id = ?, last_capture_status = ?, updated_at = datetime('now') WHERE id = ? AND paused = 0`. Return rows affected (0 = already advanced by concurrent tick).
    - `getEffectiveScheduleLimit(tenantConfig)` -- return `tenantConfig?.schedules?.maxSchedules ?? DEFAULT_SCHEDULE_LIMIT`. Pure function, no DB call.

    **Modify existing functions:**
    - `createCapture(db, captureId, url, ip, tenantId, scheduleId = null)` -- add optional scheduleId param. Add `schedule_id` to the INSERT statement. Backward compatible (existing callers pass nothing).
    - `rowToCapture(row)` -- add `scheduleId: row.schedule_id ?? null` to the returned object.

    **Update cleanDb pattern note:** The `cleanDb` function in `test/fixtures.js` will need `DELETE FROM schedules` added (between webhooks and captures deletes). This is for the test-writing task, not this task, but keep the FK ordering in mind: delete captures first (they reference schedules), then schedules.

    ### 3. Add config validation for schedules.maxSchedules

    In the existing `setTenantConfig` validation logic (search for where `config.rateLimit` is validated), add validation for `config.schedules.maxSchedules`:
    - Must be a positive integer if present
    - Maximum value: 100 (hard ceiling)

    ## What NOT to do
    - Do NOT create the HTTP route handlers (that is Task 2)
    - Do NOT create the scheduled() handler (that is Task 3)
    - Do NOT create any cron parsing/validation logic
    - Do NOT modify wrangler.toml
    - Do NOT create test files (Phase 6 handles testing)
    - Do NOT add a `timezone` column -- UTC-only for MVP (YAGNI)
    - Do NOT add a `capture_settings` column to schedules -- all captures use default settings for MVP

    ## Context files to read
    - `migrations/0003_webhooks.sql` -- pattern for table creation with CHECK constraints
    - `src/db.js` -- existing CRUD patterns (createWebhook, listWebhooks, etc.)
    - `src/quotas.js` -- getEffectiveQuota pattern for limit computation
    - `test/fixtures.js` -- understand seedWebhook, cleanDb patterns (for FK ordering awareness)

    ## Deliverables
    - `migrations/0007_schedules.sql`
    - Updated `src/db.js` with all schedule functions + modified createCapture + modified rowToCapture
- **Deliverables**: `migrations/0007_schedules.sql`, updated `src/db.js`
- **Success criteria**: Migration creates schedules table with correct constraints and indexes; ALTER TABLE adds schedule_id to captures; all db.js functions follow existing patterns (camelCase returns, tenant isolation, db.batch for atomicity); createCapture accepts optional scheduleId; rowToCapture includes scheduleId field

### Task 2: Cron validation module + schedule CRUD HTTP handlers
- **Agent**: api-design-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1
- **Approval gate**: yes
- **Gate reason**: API contract (endpoint paths, request/response shapes, status codes, cron validation rules) is the interface consumed by the UI, tests, and external integrations. Changing it after implementation is expensive.
- **Gate rationale**: |
    Chosen: Top-level /v1/schedules CRUD with `croner` library for cron parsing, 429 for limit exceeded, `capture` scope for auth, hourly minimum granularity
    Over: (a) Nested /v1/captures/schedules (wrong semantics), (b) Custom cron parser (high bug risk), (c) 409 for limit exceeded (webhook pattern, but issue specifies 429)
    Why: Top-level resource matches webhooks pattern; croner is 0-dep ~6KB; 429 per issue success criteria; hourly minimum per explicit scope constraint
- **Prompt**: |
    You are implementing the cron expression validation module and schedule CRUD HTTP handlers for WRL. This is a Cloudflare Workers project. You will create two new files and register routes in index.js.

    ## What to do

    ### 1. Create `src/cron.js` -- Cron expression validation and next-run computation

    Install `croner` as a dependency (0 transitive deps, ~6KB, works in Workers runtime):
    ```bash
    npm install croner
    ```

    Implement and export:

    **`validateCron(expression)`** -- Returns `{ ok: true, cron: normalizedExpression }` or `{ ok: false, detail: string }`.
    - Use `croner` to parse. Catch parse errors and return friendly messages.
    - Reject 6-field cron (seconds), `@reboot`, `@yearly`, and other non-standard specifiers.
    - Accept only standard 5-field cron: minute hour day-of-month month day-of-week.
    - **Minimum interval enforcement (hourly):** Compute the next 5 fire times. If any two consecutive times are less than 60 minutes apart, reject with: `"Cron expression '...' would fire more frequently than once per hour. Minimum interval is 60 minutes."`
    - Maximum expression length: 128 characters.

    **`nextRun(expression)`** -- Returns ISO 8601 string of the next fire time from now (UTC). Uses croner internally.

    **`nextRunAfter(expression, afterDate)`** -- Returns ISO 8601 string of the next fire time after the given Date. Used by the scheduled handler to advance next_run_at.

    ### 2. Create `src/schedules.js` -- CRUD HTTP handlers

    Follow `src/webhooks.js` exactly as the template. Same module structure: imports, constants, handler functions, exports.

    **Constants:**
    ```js
    const NAME_RE = /^[a-zA-Z0-9 _.:-]{1,128}$/;
    const ALLOWED_CREATE_FIELDS = new Set(['url', 'cron', 'name']);
    const ALLOWED_PATCH_FIELDS = new Set(['paused', 'cron', 'name']);
    ```

    **Handlers:**

    **`handleCreateSchedule(request, env, ctx, tenantId, authInfo)`**
    1. Parse JSON body, validate fields against ALLOWED_CREATE_FIELDS (reject unknown fields)
    2. Validate `name` against NAME_RE (required)
    3. Validate `url` using `validateUrl()` from url-validation.js (same SSRF protection as captures)
    4. Validate `cron` using `validateCron()` from cron.js
    5. Check schedule count: `countSchedules(db, tenantId)` vs `getEffectiveScheduleLimit(tenantConfig)`. If at limit, return 429:
       ```json
       { "type": "about:blank", "status": 429, "title": "Too Many Requests",
         "detail": "Tenant has reached the maximum of N schedules. Delete an existing schedule before creating a new one." }
       ```
    6. Generate ID: `'sch_' + crypto.randomUUID().replace(/-/g, '')`
    7. Compute nextRunAt via `nextRun(cron)`
    8. Call `createSchedule(db, id, tenantId, url, name, cron, nextRunAt)`
    9. Log `schedule.created` with scheduleId, tenantId, url, cron, keyHashPrefix, authMethod
    10. Return 201 with the schedule object

    **`handleListSchedules(request, env, ctx, tenantId, authInfo)`**
    1. Call `listSchedules(db, tenantId)`
    2. Return `{ data: [...] }`

    **`handleGetSchedule(request, env, ctx, tenantId, authInfo, scheduleId)`**
    1. Call `getSchedule(db, scheduleId, tenantId)`
    2. Return 404 if not found (same info-disclosure defense as webhooks: don't distinguish "not found" from "not yours")

    **`handleUpdateSchedule(request, env, ctx, tenantId, authInfo, scheduleId)`**
    1. Parse JSON body, validate fields against ALLOWED_PATCH_FIELDS
    2. Require at least one field
    3. If `paused` is provided, must be boolean
    4. If `cron` is provided, validate via validateCron(), recompute nextRunAt
    5. If `name` is provided, validate against NAME_RE
    6. URL is immutable -- reject if present in body with 400: "URL cannot be changed. Delete and recreate the schedule."
    7. Call `updateSchedule(db, scheduleId, tenantId, fields)` where fields includes nextRunAt if cron changed
    8. Return 404 if not found, 200 with updated schedule if success
    9. Log `schedule.updated` or `schedule.paused`/`schedule.resumed` as appropriate

    **`handleDeleteSchedule(request, env, ctx, tenantId, authInfo, scheduleId)`**
    1. Call `deleteSchedule(db, scheduleId, tenantId)`
    2. Return 404 if not found
    3. Return 200 with `{ id: scheduleId, deleted: true }` (matches webhook pattern)
    4. Log `schedule.deleted`

    **Auth for all handlers:** Use the dual auth pattern via the `verifyAuth` function that is called in the fetch handler in index.js (same as webhooks). All schedule endpoints require `capture` scope.

    ### 3. Register routes in `src/index.js`

    Add these routes to the `routes` array (after webhook routes, before OAuth routes):
    ```js
    ['POST',   /^\/v1\/schedules$/, handleCreateSchedule],
    ['GET',    /^\/v1\/schedules$/, handleListSchedules],
    ['GET',    /^\/v1\/schedules\/(sch_[a-f0-9]{32})$/, handleGetSchedule],
    ['PATCH',  /^\/v1\/schedules\/(sch_[a-f0-9]{32})$/, handleUpdateSchedule],
    ['DELETE', /^\/v1\/schedules\/(sch_[a-f0-9]{32})$/, handleDeleteSchedule],
    ```

    Add the import at the top of index.js:
    ```js
    import { handleCreateSchedule, handleListSchedules, handleGetSchedule, handleUpdateSchedule, handleDeleteSchedule } from './schedules.js';
    ```

    Add schedule routes to `getRateLimitGroup`: map `/v1/schedules` to the `'capture'` rate limit group (same as captures and webhooks).

    **In the fetch handler**, schedule routes need the same auth treatment as webhook routes. Look at how `handleCreateWebhook` etc. are called -- they receive `(request, env, ctx)` and handle auth internally. Follow the same pattern: the handlers call `verifyAuth()` themselves.

    Actually, looking more carefully at `src/webhooks.js`, the webhook handlers call `verifyApiKey()` directly. Schedule handlers should use `verifyAuth()` (the dual cookie+API-key function from index.js) to support both Web UI and API key users. You'll need to either:
    (a) Export `verifyAuth` from index.js or move it to auth.js, OR
    (b) Import verifySession + verifyApiKey in schedules.js and implement the same dual-auth logic

    Option (b) is cleaner -- copy the `verifyAuth` pattern into schedules.js as a local function, same as webhooks has its own auth call.

    ### 4. Add `schedule_id` filter to capture list endpoint

    In the existing `handleListCaptures` in `src/index.js`, add support for a `schedule_id` query parameter. When present, add `AND schedule_id = ?` to the SQL WHERE clause. Follow the same pattern as existing filters (status, url, created_after, etc.).

    ## What NOT to do
    - Do NOT implement the `scheduled()` cron handler (Task 3)
    - Do NOT create UI components (Task 5)
    - Do NOT write test files (Phase 6)
    - Do NOT implement timezone support -- all times are UTC
    - Do NOT implement PATCH for url changes -- URL is immutable
    - Do NOT add webhook event types for schedules (out of scope)

    ## Context files to read
    - `src/webhooks.js` -- primary template for the CRUD handler pattern
    - `src/index.js` -- route registration, verifyAuth, getRateLimitGroup, handleListCaptures
    - `src/url-validation.js` -- validateUrl() for URL validation
    - `src/responses.js` -- problemResponse, jsonResponse helpers
    - `src/log.js` -- log() function signature
    - `src/db.js` -- the schedule functions from Task 1 (will be available when you run)
    - `src/quotas.js` -- getEffectiveQuota pattern

    ## Deliverables
    - `src/cron.js` (new file)
    - `src/schedules.js` (new file)
    - Updated `src/index.js` (route registration, imports, schedule_id filter on captures list)
    - Updated `package.json` (croner dependency)
- **Deliverables**: `src/cron.js`, `src/schedules.js`, updated `src/index.js`, updated `package.json`
- **Success criteria**: POST /v1/schedules creates a schedule with validated cron + URL, returns 201 with sch_ ID and nextRunAt; GET /v1/schedules returns tenant-scoped list; PATCH supports paused/cron/name; DELETE returns { deleted: true }; sub-hourly cron rejected with 400; limit exceeded returns 429; GET /v1/captures accepts schedule_id filter

### Task 3: Cron trigger config + scheduled() handler with fan-out logic
- **Agent**: iac-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1, Task 2
- **Approval gate**: no
- **Prompt**: |
    You are implementing the Cloudflare Cron Trigger configuration and the `scheduled()` handler that fans out due schedules into capture queue messages.

    ## What to do

    ### 1. Add cron trigger to `wrangler.toml`

    Add these sections to wrangler.toml:

    **Production (top-level):**
    ```toml
    # --- Cron Triggers ---
    # Fires every minute to evaluate tenant-defined capture schedules.
    # The scheduled() handler queries D1 for due schedules, then enqueues
    # capture jobs onto the existing wrl-captures queue. The handler itself
    # is lightweight (D1 read + queue dispatch); actual capture work stays
    # in the queue consumer.
    [triggers]
    crons = ["*/1 * * * *"]
    ```

    Place this after the `[limits]` section and before the `routes = [...]` line.

    **Staging:**
    ```toml
    [env.staging.triggers]
    crons = ["*/1 * * * *"]
    ```

    Place this after `[env.staging.limits]`.

    Note: Cron triggers are non-inheritable -- staging must declare its own. Add a comment noting this, and also note that setting `crons = []` disables them but merely commenting out the section does NOT (Cloudflare persists the previous config).

    ### 2. Implement `src/scheduler.js` -- the scheduled handler logic

    Create a new file `src/scheduler.js`. This is where all cron-tick logic lives, keeping index.js clean.

    **`handleScheduledTick(controller, env, ctx)`**

    Flow:
    1. Record start time: `const start = Date.now()`
    2. Compute the threshold: `const asOf = new Date(controller.scheduledTime).toISOString()`
    3. Query due schedules: `const dueSchedules = await getDueSchedules(env.DB, asOf)`
    4. If none: log `schedule.tick_empty` with `triggerTime: asOf`, return
    5. Log `schedule.tick_start` with `triggerTime: asOf` and `schedulesFound: dueSchedules.length`
    6. Group schedules by tenantId for batch quota checking
    7. For each tenant group:
       a. Call `checkQuota(env.DB, tenantId)` once
       b. If quota denied: log `schedule.execute_skip` for each schedule with `skipReason: 'quota_exhausted'`, advance their next_run_at anyway (so they don't pile up), continue to next tenant
       c. For each schedule in the group (up to remaining quota):
          - Generate captureId: `'cap_' + crypto.randomUUID().replace(/-/g, '')`
          - Call `createCapture(env.DB, captureId, schedule.url, null, tenantId, schedule.id)` -- ip is null for scheduled captures
          - Call `incrementUsage(env.DB, tenantId, { captures: 1, storageBytes: 0 })` -- storage is counted later by queue consumer
          - Build queue message: `{ captureId, url: schedule.url, ip: null, tenantId, cip: 'cron', scheduleId: schedule.id, enqueuedAt: Date.now() }`
          - Compute next run: `nextRunAfter(schedule.cron, new Date(controller.scheduledTime))`
          - Call `advanceSchedule(env.DB, schedule.id, nextRunAt, captureId, 'pending')` -- CAS-style, returns 0 if already advanced
          - Log `schedule.execute` with scheduleId, tenantId, url, captureId, triggerTime
    8. Send all messages via `env.CAPTURE_QUEUE.sendBatch(messages)` in chunks of 100 (sendBatch limit)
    9. Log `schedule.tick_complete` with triggerTime, executed count, skipped count, failed count, durationMs

    **Error handling:**
    - If an individual schedule fails (D1 error, etc.): log `schedule.execute_fail`, skip it, continue processing others. One tenant's failure must not block others.
    - If sendBatch fails: log the error. The captures are already created as 'pending' in D1 -- they will be orphans. Log a schedule.execute_fail for each. Do NOT call failCapture (the queue consumer handles retries).
    - If the entire handler throws: Cloudflare will retry the cron invocation. The CAS-based advanceSchedule prevents duplicates.
    - Never implement catch-up logic. If a schedule was missed, advance to the NEXT FUTURE occurrence, not the next occurrence after the missed time.

    **Import from existing modules:**
    - `getDueSchedules`, `advanceSchedule`, `createCapture`, `incrementUsage` from `./db.js`
    - `checkQuota` from `./quotas.js`
    - `nextRunAfter` from `./cron.js`
    - `log` from `./log.js`

    ### 3. Register scheduled() export in `src/index.js`

    Add the `scheduled` handler to the default export object alongside existing `fetch` and `queue`:

    ```js
    import { handleScheduledTick } from './scheduler.js';

    export default {
      async scheduled(controller, env, ctx) {
        await handleScheduledTick(controller, env, ctx);
      },
      async queue(batch, env, ctx) { /* existing */ },
      async fetch(request, env, ctx) { /* existing */ },
    };
    ```

    ### 4. Pass scheduleId through handleCaptureMessage

    In `handleCaptureMessage` in `src/index.js` (around line 121), destructure `scheduleId` from `msg.body`:

    ```js
    const { url, ip, captureId, tenantId, cip, enqueuedAt, scheduleId } = msg.body ?? {};
    ```

    The scheduleId is already written to the capture record at creation time (in the scheduled handler), so no additional write is needed in the queue consumer. However, include it in the `capture.dequeued` log event for correlation:

    ```js
    ctx.waitUntil(log(env, 3, 'capture', {
      event: 'capture.dequeued',
      captureId,
      tenantId,
      url,
      scheduleId: scheduleId ?? null,  // new field
      attempt: msg.attempts,
      queueTimeMs,
    }) ?? Promise.resolve());
    ```

    Also add `scheduleId` to the `capture.success` and `capture.fail` log events for full correlation.

    ## What NOT to do
    - Do NOT implement catch-up logic for missed runs
    - Do NOT create a separate queue for scheduled captures (reuse wrl-captures)
    - Do NOT implement per-tenant hourly caps on scheduled captures (YAGNI for MVP -- quota enforcement is sufficient)
    - Do NOT create UI components
    - Do NOT write test files
    - Do NOT add a global per-invocation ceiling (YAGNI for MVP with <100 total schedules)

    ## Context files to read
    - `src/index.js` -- existing export default block (fetch + queue), handleCaptureMessage, handleBatchCapture (sendBatch pattern)
    - `src/db.js` -- getDueSchedules, advanceSchedule, createCapture signatures (from Task 1)
    - `src/cron.js` -- nextRunAfter (from Task 2)
    - `src/quotas.js` -- checkQuota signature and return shape
    - `src/log.js` -- log() function
    - `wrangler.toml` -- current structure, queue config

    ## Deliverables
    - `src/scheduler.js` (new file)
    - Updated `wrangler.toml` (cron triggers for production and staging)
    - Updated `src/index.js` (scheduled export, scheduleId in handleCaptureMessage and log events)
- **Deliverables**: `src/scheduler.js`, updated `wrangler.toml`, updated `src/index.js`
- **Success criteria**: wrangler.toml has `*/1 * * * *` cron trigger for both environments; scheduled() handler queries due schedules, checks quota, creates capture records, enqueues to CAPTURE_QUEUE, advances next_run_at; CAS prevents duplicate processing; scheduleId flows through capture log events

### Task 4: Web UI schedule panel
- **Agent**: frontend-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 2
- **Approval gate**: no
- **Prompt**: |
    You are implementing the Web UI for schedule management in WRL. This is a vanilla JS single-page app served as inline HTML/CSS/JS from a Cloudflare Worker. No frameworks -- imperative DOM construction only.

    ## What to do

    ### 1. Create `src/ui/ui-schedules.js`

    New file exporting a `SCHEDULES_JS` string constant (same pattern as `ui-settings.js`, `ui-submit.js`). Contains all schedule view logic.

    **Implement these functions:**

    **`renderSchedules()`** -- builds the DOM skeleton for the schedule list + create form view.

    Layout:
    - Page heading: `<h1>Schedules</h1>`
    - Create form section (`<section aria-label="Create new schedule">`) with:
      - URL input (type="url", `.input` class, label "URL to capture")
      - Frequency select (`.input` class, label "Capture frequency") with options:
        - Every hour (`0 * * * *`)
        - Every 6 hours (`0 */6 * * *`)
        - Every 12 hours (`0 */12 * * *`)
        - Daily at midnight UTC (`0 0 * * *`)
        - Weekly on Monday (`0 0 * * 1`)
        - Custom... (reveals a text input for raw cron expression)
      - Name input (type="text", `.input` class, label "Schedule name (optional)", max 128 chars)
      - "Next capture" preview line below frequency select, updated on change
      - Submit button "Create Schedule" (`.btn--primary`)
      - Error display area (`.alert.alert--error` with `role="alert"` and `aria-live="polite"`)
    - Limit indicator: "N of M schedules" (same as API keys count pattern in settings)
    - Schedule list section (`<section aria-label="Schedules list">`) with:
      - Header row (`.schedule-header-row`): URL | Frequency | Next Run | Status
      - Item rows (`.schedule-item`): data populated by mountSchedules()
      - Empty state: "No scheduled captures yet. Create one above to automatically capture pages on a recurring basis."

    **`mountSchedules()`** -- wires events and fetches data.
    - Fetch `GET /v1/schedules` via `apiFetch()` (gets auth headers for free)
    - Populate list with schedule data
    - Wire create form submit handler:
      - Disable button, change text to "Creating..."
      - POST to `/v1/schedules` with `{ url, cron, name }`
      - On success: prepend to list, reset form, update count, announce via aria-live
      - On error: show inline error (429 = limit reached, 400 = validation, etc.)
    - Wire frequency select change handler:
      - Show/hide custom cron input when "Custom..." selected
      - Update "Next capture" preview based on selected cron
    - Wire inline actions on each schedule row (pause/resume, delete)

    **Pause/Resume:** Single `.btn--ghost.btn--sm` toggle. Optimistic badge update. PATCH to `/v1/schedules/:id` with `{ paused: true/false }`. Revert on API failure.

    **Delete:** Follow the EXACT same inline confirmation pattern as key revocation in `ui-settings.js`:
    1. Click "Delete" -> button hides, confirmation area appears: "Delete this schedule?" + "Confirm" + "Cancel"
    2. Focus moves to "Cancel" (safer action)
    3. On confirm: DELETE API call, remove row, update count, announce
    4. On cancel: restore Delete button, focus it

    **Cron to human-readable mapping:**
    ```js
    const CRON_LABELS = {
      '0 * * * *': 'Every hour',
      '0 */6 * * *': 'Every 6 hours',
      '0 */12 * * *': 'Every 12 hours',
      '0 0 * * *': 'Daily at midnight UTC',
      '0 0 * * 1': 'Weekly on Monday',
    };
    ```
    For custom cron expressions not in the map, display the raw cron string.

    **Status badges -- reuse existing badge classes:**
    - Active + last capture complete: `.badge--pass` "Active"
    - Active + last capture failed: `.badge--fail` "Error"
    - Active + never run: `.badge--pass` "Active"
    - Paused: `.badge--skip` "Paused"

    **Next Run column:**
    - Active: show relative time ("in 2h") or absolute if >24h
    - Paused: show "Paused" in muted text

    ### 2. Add schedule CSS to `src/ui/ui-css.js`

    Add schedule-specific CSS classes to the existing CSS string. Keep it minimal -- reuse existing design tokens and component classes. Key additions:

    - `.schedule-form-section` -- form container with bottom margin
    - `.schedule-form` -- flex column with gap
    - `.schedule-form-label` -- label styling matching `.settings-create-label`
    - `.schedule-form-preview` -- next-capture preview text (small, muted, tabular-nums)
    - `.schedule-header-row` and `.schedule-item` -- grid layout (1fr 7rem 7rem 5rem 6rem) for URL/Frequency/Next Run/Status/Actions
    - Mobile responsive: hide header row, stack to 2-row layout at <640px
    - `.schedule-actions` -- flex row for action buttons

    Follow the EXACT same grid pattern as `.capture-header-row` / `.capture-item` in the existing CSS.

    ### 3. Extend the hash router in `src/ui/ui-shell.js`

    - Add route match for `#/schedules` in the `route()` function
    - Import `SCHEDULES_JS` and concatenate into the `<script>` block (same as SETTINGS_JS, SUBMIT_VIEW_JS)

    ### 4. Add "Schedules" nav link in `renderAppShell()` (in `src/ui/ui-auth.js`)

    - Insert between "Captures" and "Settings" in the nav bar
    - Gate behind `_authMethod === 'session'` (same as Settings)
    - Add `aria-current="page"` handling for the new route

    ### 5. Add schedule-to-capture association in capture views

    In `ui-detail.js` (capture detail view): if the capture has a `scheduleId`, add a "Schedule" row to the metadata grid linking to `#/schedules` (just show the schedule name or ID).

    In `ui-submit.js` (capture list): if a capture has a `scheduleId`, show a small "Scheduled" label below the URL in muted text.

    ## What NOT to do
    - Do NOT build a visual cron picker widget (presets + optional custom input is enough)
    - Do NOT build a schedule detail view (`#/schedules/:id`) -- YAGNI for MVP. The list view shows enough.
    - Do NOT use innerHTML with dynamic/user content -- imperative DOM construction only
    - Do NOT import a cron parsing library in the frontend
    - Do NOT add real-time polling for schedules (a manual refresh link is sufficient)
    - Do NOT write test files

    ## Context files to read
    - `src/ui/ui-settings.js` -- primary template (form patterns, key revocation confirmation, count display)
    - `src/ui/ui-submit.js` -- capture list patterns, apiFetch(), form submission
    - `src/ui/ui-detail.js` -- capture detail metadata grid
    - `src/ui/ui-auth.js` -- renderAppShell(), nav link registration, session gating
    - `src/ui/ui-shell.js` -- route() function, module concatenation
    - `src/ui/ui-css.js` -- existing CSS (design tokens, grid patterns, badge classes)

    ## Deliverables
    - `src/ui/ui-schedules.js` (new file)
    - Updated `src/ui/ui-css.js`
    - Updated `src/ui/ui-shell.js`
    - Updated `src/ui/ui-auth.js`
    - Updated `src/ui/ui-detail.js`
    - Updated `src/ui/ui-submit.js`
- **Deliverables**: `src/ui/ui-schedules.js`, updated `src/ui/ui-css.js`, `src/ui/ui-shell.js`, `src/ui/ui-auth.js`, `src/ui/ui-detail.js`, `src/ui/ui-submit.js`
- **Success criteria**: #/schedules route renders schedule list and create form; presets dropdown with custom cron option; create/delete/pause/resume work via API calls; schedule count with limit displayed; status badges reflect schedule state; mobile responsive; accessible (labels, aria-live announcements, keyboard navigation); captures show schedule association

### Task 5: Tests for all new code
- **Agent**: test-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1, Task 2, Task 3
- **Approval gate**: no
- **Prompt**: |
    You are writing tests for the WRL scheduled captures feature. The project uses `@cloudflare/vitest-pool-workers` (v0.12.21) with vitest (v3.2.4). Tests run against miniflare-backed D1, R2, KV, and queue bindings.

    ## What to do

    ### 1. Extend test fixtures (`test/fixtures.js`)

    Add:
    - `export const TEST_SCHEDULE_ID = 'sch_' + 'c'.repeat(32);`
    - `seedSchedule(db, id, { tenantId, url, name, cron, nextRunAt, paused, lastRunAt, lastCaptureId, lastCaptureStatus, createdAt })` -- follow `seedWebhook` pattern exactly
    - Add `scheduleId` parameter to existing `seedCapture` function (optional, default null) -- add `schedule_id` to the INSERT
    - Update `cleanDb`: add `db.prepare('DELETE FROM schedules')` -- place it AFTER the webhooks delete and BEFORE the captures delete to respect FK ordering. Actually, since captures.schedule_id is a nullable FK (no CASCADE), and schedules references tenants, the order should be: delete schedules after captures but before tenants. Adjust to: sessions, github_users, webhooks, captures, schedules, usage_counters, api_keys, signing_keys, tenants.

    ### 2. Create `test/cron-parse.test.js` -- Cron validation unit tests

    Pure function tests for `validateCron()`, `nextRun()`, `nextRunAfter()` from `src/cron.js`. No D1 or HTTP dependencies.

    Use `it.each` for parameterized tests:

    **Valid expressions (should pass):**
    - `'0 * * * *'` (hourly)
    - `'30 8 * * 1-5'` (weekdays at 8:30)
    - `'0 0 1 * *'` (monthly)
    - `'0 */6 * * *'` (every 6 hours)
    - `'0 9 * * 1'` (weekly Monday)
    - `'0 0 * * *'` (daily midnight)

    **Invalid -- sub-hourly (should reject):**
    - `'*/5 * * * *'` (every 5 minutes)
    - `'0,30 * * * *'` (twice per hour)
    - `'* * * * *'` (every minute)
    - `'*/15 * * * *'` (every 15 minutes)
    - `'0,1 * * * *'` (two consecutive minutes)

    **Invalid -- malformed (should reject):**
    - `''` (empty)
    - `'not-a-cron'`
    - `'0 25 * * *'` (invalid hour)
    - `'0 * * * * *'` (6 fields -- seconds)
    - `'@daily'` (non-standard)
    - `'@reboot'`
    - A string longer than 128 chars

    **nextRun / nextRunAfter tests:**
    - Given `'0 * * * *'` and a reference time of 2026-03-23T10:30:00Z, nextRunAfter should return 2026-03-23T11:00:00Z
    - Given `'0 0 * * *'` and reference time 2026-03-23T10:30:00Z, should return 2026-03-24T00:00:00Z

    ### 3. Create `test/schedule-crud.test.js` -- Schedule CRUD endpoint tests

    Follow `test/webhook-crud.test.js` EXACTLY as the template. Same structure: imports from fixtures, SELF.fetch(), unique IPs per describe block via `nextIp()`.

    **Describe blocks:**

    **POST /v1/schedules:**
    - Returns 201 with sch_ prefixed ID, url, cron, name, nextRunAt, paused: false
    - Rejects missing url (400)
    - Rejects missing cron (400)
    - Rejects missing name (400)
    - Rejects invalid cron expression (400)
    - Rejects sub-hourly cron (400) with descriptive message
    - Rejects unknown fields (400)
    - Rejects invalid URL (same SSRF validation as captures)
    - Returns 401 for missing auth
    - Returns 401 for invalid API key

    **GET /v1/schedules:**
    - Returns empty `{ data: [] }` for tenant with no schedules
    - Returns tenant-scoped list (schedules from other tenants not visible)
    - Each schedule has nextRunAt field

    **GET /v1/schedules/:id:**
    - Returns 404 for non-existent ID
    - Returns 404 for other tenant's schedule (IDOR protection)
    - Returns schedule object for own schedule

    **PATCH /v1/schedules/:id:**
    - Pause: `{ paused: true }` sets paused and nulls nextRunAt
    - Resume: `{ paused: false }` restores nextRunAt
    - Update cron: recomputes nextRunAt
    - Update name: changes name
    - Rejects url in body (400 - immutable)
    - Rejects empty body (400)
    - Returns 404 for non-existent

    **DELETE /v1/schedules/:id:**
    - Returns 200 with `{ id, deleted: true }`
    - Returns 404 for non-existent
    - Returns 404 for other tenant's schedule

    ### 4. Create `test/schedule-limits.test.js` -- Per-tenant limit tests

    Follow `test/quota-enforcement.test.js` pattern:
    - Free tenant: create 10 schedules (the default limit), verify 11th returns 429
    - Tenant with config override `{ schedules: { maxSchedules: 3 } }`: verify 4th returns 429
    - Delete a schedule, then create again: succeeds (slot freed)
    - 429 response body includes clear message with current limit

    ### 5. Create `test/scheduled-handler.test.js` -- Cron handler tests

    Use `createScheduledController` and `createExecutionContext` from `cloudflare:test`. If `createScheduledController` is not available in this version, construct manually: `{ scheduledTime: Date.now(), cron: '*/1 * * * *', noRetry() {} }`.

    Import the worker default export and call `worker.scheduled(ctrl, env, ctx)` directly.

    **Test cases:**
    - No due schedules: handler completes without errors, no captures created
    - One due schedule: creates one pending capture with correct schedule_id, advances next_run_at
    - Multiple tenants with due schedules: creates captures for each, correct tenant isolation
    - Over-quota tenant: schedule skipped, next_run_at still advanced, no capture created
    - CAS idempotency: if advanceSchedule returns 0 (already advanced), no duplicate capture
    - Paused schedule: not returned by getDueSchedules query

    Verify by querying D1 after the handler runs:
    - Check captures table for new rows with schedule_id set
    - Check schedules table for updated next_run_at and last_capture_id
    - Check usage_counters for incremented capture count

    ### 6. Add schedule-related assertions to existing test files

    **`test/list-captures.test.js`:** Add a test that seeds a capture with `scheduleId` set, then verifies `GET /v1/captures` response includes `scheduleId` field. Also test the `schedule_id` query parameter filter.

    **`test/capture-retrieval.test.js`:** Verify `GET /v1/captures/:id` includes `scheduleId` when non-null.

    ## What NOT to do
    - Do NOT write E2E/Playwright tests (those run against staging, deferred to post-deploy)
    - Do NOT test the UI (no DOM testing framework in this project)
    - Do NOT mock D1 -- use the miniflare-backed real D1 from the test pool
    - Do NOT test Coralogix log delivery (the log function is fire-and-forget via fetch)

    ## Context files to read
    - `test/webhook-crud.test.js` -- primary template for CRUD tests
    - `test/quota-enforcement.test.js` -- template for limit tests
    - `test/queue-consumer.test.js` -- template for handler tests
    - `test/fixtures.js` -- all fixture helpers
    - `test/db.test.js` -- D1 function test patterns
    - `test/list-captures.test.js` -- capture list test patterns
    - `wrangler.test.toml` -- test environment config

    ## Deliverables
    - Updated `test/fixtures.js`
    - `test/cron-parse.test.js` (new)
    - `test/schedule-crud.test.js` (new)
    - `test/schedule-limits.test.js` (new)
    - `test/scheduled-handler.test.js` (new)
    - Updated `test/list-captures.test.js`
    - Updated `test/capture-retrieval.test.js`
- **Deliverables**: Updated `test/fixtures.js`, new test files for cron parsing, CRUD, limits, and scheduled handler; updated existing capture test files
- **Success criteria**: All tests pass against miniflare-backed D1; cron validation rejects sub-hourly and malformed expressions; CRUD tests cover create/list/get/update/delete with auth and validation; limit tests verify 429 at boundary; scheduled handler tests verify fan-out, quota skip, and CAS idempotency; capture list/detail include scheduleId

### Task 6: OpenAPI spec + docs updates
- **Agent**: software-docs-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 2
- **Approval gate**: no
- **Prompt**: |
    You are updating the OpenAPI specification and documentation for the WRL scheduled captures feature.

    ## What to do

    ### 1. Update `openapi.yaml`

    **Add new tag:**
    ```yaml
    - name: schedules
      description: Scheduled recurring captures (cron-style)
    ```

    **Add new schemas to `components/schemas`:**

    **Schedule:**
    ```yaml
    Schedule:
      type: object
      required: [id, url, cron, name, paused, nextRunAt, createdAt]
      properties:
        id:
          type: string
          pattern: '^sch_[a-f0-9]{32}$'
          example: 'sch_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4'
        url:
          type: string
          format: uri
          example: 'https://example.com/page'
        cron:
          type: string
          description: 'Standard 5-field cron expression (minute hour day-of-month month day-of-week). Minimum interval: 1 hour.'
          example: '0 */6 * * *'
        name:
          type: string
          minLength: 1
          maxLength: 128
          example: 'Homepage every 6 hours'
        paused:
          type: boolean
          example: false
        nextRunAt:
          type: string
          format: date-time
          nullable: true
          description: 'Next scheduled execution time (null when paused)'
          example: '2026-03-23T18:00:00.000Z'
        lastRunAt:
          type: string
          format: date-time
          nullable: true
          example: '2026-03-23T12:00:00.000Z'
        lastCaptureId:
          type: string
          nullable: true
          pattern: '^cap_[a-f0-9]{32}$'
        lastCaptureStatus:
          type: string
          nullable: true
          enum: [complete, failed, pending]
        createdAt:
          type: string
          format: date-time
        updatedAt:
          type: string
          format: date-time
          nullable: true
    ```

    **Add paths for all 5 endpoints:**
    - `POST /v1/schedules` -- createSchedule (201, 400, 401, 429)
    - `GET /v1/schedules` -- listSchedules (200, 401)
    - `GET /v1/schedules/{scheduleId}` -- getSchedule (200, 401, 404)
    - `PATCH /v1/schedules/{scheduleId}` -- updateSchedule (200, 400, 401, 404)
    - `DELETE /v1/schedules/{scheduleId}` -- deleteSchedule (200, 401, 404)

    Follow the existing webhook endpoint patterns for request/response examples, error responses, and security requirements.

    **Add scheduleId to CaptureRecord and CaptureListItem schemas:**
    ```yaml
    scheduleId:
      type: string
      nullable: true
      pattern: '^sch_[a-f0-9]{32}$'
      description: 'Originating schedule ID (null for ad-hoc captures)'
    ```

    **Add schedule_id query parameter to GET /v1/captures:**
    ```yaml
    - name: schedule_id
      in: query
      required: false
      schema:
        type: string
        pattern: '^sch_[a-f0-9]{32}$'
      description: 'Filter captures by originating schedule ID'
    ```

    **Version bump:** Change `info.version` from `0.6.0` to `0.7.0`.

    ### 2. Create docs site guide page `site/content/schedules.md`

    Follow the established guide page pattern (see `site/content/webhooks.md`, `site/content/batch.md`). Include frontmatter with title, description, nav order.

    Sections:
    - **Prerequisites:** API key with `capture` scope
    - **Create a schedule:** curl example with cron + url + name
    - **Cron expression format:** Reference table of supported syntax, minimum interval (hourly), what is NOT supported (@daily, seconds, L/W/#)
    - **List schedules:** curl example, response shape
    - **Pause and resume:** PATCH example
    - **Delete a schedule:** curl example
    - **View schedule captures:** GET /v1/captures?schedule_id=sch_... example
    - **Schedule limits:** Default 10 per tenant, 429 when exceeded
    - **Quota interaction:** Scheduled captures consume from monthly quota. Include estimated usage calculation: "A daily schedule uses ~30 captures/month."
    - **Error handling:** Common errors (invalid cron, limit reached, quota exhausted during execution)

    ### 3. Update existing docs pages

    - **`site/content/index.md`** (Getting Started): Add "Scheduled Captures" card to "What's next" grid
    - **`site/content/limits.md`**: Add section about scheduled capture quota consumption and per-tenant schedule limits
    - **`site/content/authentication.md`**: Add schedule endpoints to scope requirements table

    ### 4. Validate

    Run `npx redocly lint openapi.yaml` to verify the spec is valid.

    ## What NOT to do
    - Do NOT update README.md (Phase 8 handles that)
    - Do NOT create ADRs (evolution log covers decisions)
    - Do NOT document webhook events for schedules (out of scope)
    - Do NOT document timezone support (UTC-only for MVP)

    ## Context files to read
    - `openapi.yaml` -- existing spec (v0.6.0, 7 tags, webhook endpoints as template)
    - `site/content/webhooks.md` -- guide page template
    - `site/content/batch.md` -- guide page template
    - `site/content/limits.md` -- quota documentation
    - `site/content/authentication.md` -- scope table
    - `site/content/index.md` -- getting started page with "What's next" grid

    ## Deliverables
    - Updated `openapi.yaml`
    - `site/content/schedules.md` (new)
    - Updated `site/content/index.md`
    - Updated `site/content/limits.md`
    - Updated `site/content/authentication.md`
- **Deliverables**: Updated `openapi.yaml`, new `site/content/schedules.md`, updated existing docs pages
- **Success criteria**: openapi.yaml passes Redocly lint; all 5 schedule endpoints documented with examples; Schedule schema complete; scheduleId added to capture schemas; schedules.md guide covers cron format, limits, quota interaction; version bumped to 0.7.0

### Cross-Cutting Coverage

- **Testing**: Task 5 covers all test types (cron validation unit tests, CRUD endpoint tests, limit enforcement tests, scheduled handler tests, capture-schedule linkage tests). Phase 6 post-execution will run them.
- **Security**: Security concerns are addressed inline: SSRF validation reused from captures (Task 2), tenant isolation via WHERE tenant_id = ? on all queries (Task 1), capture scope auth (Task 2), scheduled handler as trusted internal caller with no external params (Task 3), CAS-based dedup (Task 3), URL immutability on PATCH (Task 2). No separate security task needed -- the patterns are established and reused.
- **Usability -- Strategy**: UX-strategy recommendations incorporated: preset-first cron input with custom escape hatch (Task 4), schedule limit indicator (Task 4), status badges showing last capture outcome (Task 4), quota disclosure not built as separate feature but documented (Task 6). The detailed schedule view is deferred to post-MVP (YAGNI).
- **Usability -- Design**: UX-design recommendations incorporated: constrained preset selector (Task 4), inline confirmation for delete matching key revocation (Task 4), badge reuse (Task 4), mobile responsive grid (Task 4). Accessibility patterns specified in Task 4 prompt (labels, aria-live, keyboard nav).
- **Documentation**: Task 6 covers OpenAPI spec updates, new guide page, updates to existing docs. Phase 8 handles README and changelog.
- **Observability**: Logging events integrated directly into Task 2 (CRUD handlers log schedule.created/updated/deleted) and Task 3 (scheduled handler logs tick_start/execute/execute_skip/execute_fail/tick_complete). Coralogix alerting is operational config documented in evolution log, not a code task. scheduleId propagated through capture pipeline for correlation (Task 3).

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - ux-design-minion: Task 4 produces user-facing UI components (schedule list, create form, inline actions). Review focus: visual hierarchy of the schedule list grid, accessibility of the preset selector + custom cron input pattern, inline confirmation consistency with existing key revocation pattern.
  - accessibility-minion: Task 4 produces web-facing HTML/UI with form inputs, select elements, dynamic list updates, and inline confirmation dialogs. Review focus: WCAG compliance of new form (label associations, error announcement), keyboard navigation through schedule list actions, screen reader compatibility of status badges and aria-live regions.
- **Not selected**:
  - observability-minion: Observability is addressed inline in Tasks 2 and 3 (11 log events, severity mapping, scheduleId correlation). No separate observability review needed -- the patterns are identical to existing webhook/capture logging.
  - sitespeed-minion: No new web-facing pages served to browsers via CDN. The UI is an inline SPA that adds ~8-10KB of JS. Performance impact is negligible.
  - user-docs-minion: Documentation is covered by software-docs-minion in Task 6 (OpenAPI spec + guide page). User-facing help text is integrated into the UI prompts. Separate user docs review is not warranted for a feature that follows established patterns.

### Decisions

- **Status code for schedule limit exceeded**
  Chosen: 429 Too Many Requests
  Over: 409 Conflict (api-design-minion recommendation, matches webhook pattern)
  Why: The issue's success criteria explicitly specifies 429. While 409 is semantically closer to "resource limit" and matches the existing webhook implementation, the issue requirement takes precedence. Clients consuming the API should handle 429 for both rate limiting and resource limits.

- **Cron input in Web UI**
  Chosen: Preset dropdown with "Custom..." option revealing raw cron input
  Over: Presets only in UI, raw cron API-only (ux-strategy-minion recommendation)
  Why: ux-strategy argues for presets-only UI, but the issue scope defines cron API as a core feature. Hiding custom cron from the UI creates a capability gap between UI and API users. The "Custom..." option is progressive disclosure -- most users use presets, power users get raw cron. Frontend-minion's recommendation strikes the right balance.

- **Per-tenant schedule limit**
  Chosen: 10 schedules per tenant (default), configurable via tenants.config JSON
  Over: 5 free / 25 paid (data-minion), flat 10 (api-design-minion)
  Why: Issue says "e.g., 10 for free users, configurable." A flat 10 with config override is simplest for MVP. Differentiated free/paid limits can come when the billing integration is mature enough to warrant it. Using the existing tenantConfig override mechanism means no code change is needed when limits are adjusted.

- **Minimum cron interval**
  Chosen: Hourly (60 minutes)
  Over: 5 minutes (security-minion recommendation)
  Why: Issue explicitly scopes out sub-hourly schedules: "Minimum cron granularity is hourly (rejects sub-hour expressions)." The 5-minute floor is a valid security concern but exceeds the issue scope. Hourly minimum with 10-schedule limit means worst case is 10 captures/hour per tenant, well within queue capacity.

- **No separate schedule detail view**
  Chosen: List-only view in Web UI for MVP
  Over: List + detail view with execution history (frontend-minion, ux-design-minion)
  Why: YAGNI. The schedule list shows URL, frequency, next run, status, and last capture. Captures from a schedule are already visible in the captures list (filtered by scheduleId). A separate detail view adds ~300-400 lines of code for information already accessible through existing views.

### Risks and Mitigations

1. **Cron Trigger CPU limit ambiguity (HIGH)** -- Cloudflare docs state 30s CPU for sub-hour cron intervals. The existing `[limits] cpu_ms = 60000` may or may not apply. **Mitigation:** The scheduled handler is lightweight (D1 query + queue dispatch). At MVP scale (<100 total schedules), CPU usage is ~1-2s max. Verify empirically on staging after deployment.

2. **Quota exhaustion surprise for free-tier users (MEDIUM)** -- 5 daily schedules = 150 captures/month (75% of free tier). Users may not realize scheduled captures consume quota. **Mitigation:** Task 6 docs explicitly state quota interaction. A projected-usage display at schedule creation is deferred to post-MVP.

3. **Concurrent cron tick overlap (MEDIUM)** -- If a tick takes >60s, the next tick fires concurrently. Both could select the same due schedules. **Mitigation:** CAS-based advanceSchedule (Task 3) ensures only one tick processes each schedule. At-most-once semantics per schedule per tick.

4. **croner library dependency (LOW)** -- Adds a new dependency to a project that values minimal deps. **Mitigation:** croner has 0 transitive dependencies, ~6KB minified, maintained. The alternative (hand-rolled 5-field cron parser) has high bug risk for edge cases. Cost is justified.

5. **sendBatch partial failure (LOW)** -- If sendBatch throws, it is unclear whether any messages were delivered. **Mitigation:** Captures are already created in D1 as 'pending'. The existing queue consumer idempotency guard prevents duplicate processing. Orphaned pending captures are a known acceptable failure mode (same as for the existing batch capture endpoint).

### Execution Order

```
Batch 1 (gated):
  Task 1: D1 schema + db.js  -----> APPROVAL GATE

Batch 2 (gated, depends on Task 1 approval):
  Task 2: Cron validation + schedule CRUD  -----> APPROVAL GATE

Batch 3 (parallel, depends on Task 2 approval):
  Task 3: Cron trigger + scheduled() handler
  Task 4: Web UI schedule panel
  Task 6: OpenAPI spec + docs

Batch 4 (depends on Tasks 1-3):
  Task 5: Tests

Post-execution phases:
  Phase 5: Code review (code-review-minion, lucy, margo)
  Phase 6: Test execution (lint + unit + integration)
  Phase 8: Documentation assessment + README/changelog
```

### Verification Steps

After all tasks complete:
1. Run `npx vitest run` -- all existing + new tests pass
2. Run `npx redocly lint openapi.yaml` -- spec validates
3. Deploy to staging: `unset CLOUDFLARE_API_TOKEN && npx wrangler deploy --env staging`
4. Verify cron trigger fires: check Coralogix for `schedule.tick_empty` events (no schedules exist yet)
5. Create a test schedule via API: `curl -X POST https://wrl-staging.benpeter.workers.dev/v1/schedules -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{"url":"https://example.com","cron":"0 * * * *","name":"test"}'`
6. Verify schedule appears in `GET /v1/schedules`
7. Wait for next hour boundary, verify `schedule.execute` in Coralogix logs
8. Verify capture was created with scheduleId set: `GET /v1/captures?schedule_id=sch_...`
9. Delete the test schedule: `DELETE /v1/schedules/:id`
10. Verify Web UI: navigate to /ui, check #/schedules route shows schedule management panel
