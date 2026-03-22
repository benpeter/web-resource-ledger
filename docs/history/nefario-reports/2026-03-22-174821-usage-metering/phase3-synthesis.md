# Phase 3: Synthesis -- Usage Metering Delegation Plan

## Delegation Plan

**Team name**: usage-metering
**Description**: Implement per-tenant usage counters in D1 with deferred writes, covering capture count, storage bytes, and API call count. Add admin endpoint for querying usage by tenant and period.

### Task 1: D1 Schema Migration + Data Access Layer
- **Agent**: data-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: none
- **Approval gate**: yes
- **Gate reason**: Schema design locks the data model that all downstream tasks depend on. Hard to reverse once migration is applied and code is written against it.
- **Gate rationale**: |
    Chosen: Single-row-per-tenant-period with three counter columns, incremented via atomic UPSERT
    Over: (1) Append-only event log with aggregation views, (2) Separate row per metric type per tenant-period
    Why: The captures table already serves as the event log. A single row with UPSERT avoids JOIN complexity, allows atomic multi-counter updates via db.batch(), and D1/SQLite's UPSERT with `excluded.col` is well-tested since SQLite 3.24.
- **Prompt**: |
    ## Task: Create D1 Usage Counters Migration and Data Access Functions

    You are implementing per-tenant monthly usage counters for the Web Resource
    Ledger (WRL) project. This is a Cloudflare Workers application using D1
    (SQLite) for metadata storage.

    ### What to do

    **1. Create migration file `migrations/0002_usage_counters.sql`**

    The existing migration is `migrations/0001_initial_schema.sql`. Your new
    migration must be numbered `0002`. D1 migration tooling runs migrations in
    numeric order.

    Create a `usage_counters` table with this exact schema:

    ```sql
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
    ```

    **Do NOT create a secondary index.** The composite primary key
    `(tenant_id, period)` already covers exact-match lookups by tenant and
    period. A separate `idx_usage_counters_tenant ON (tenant_id, period DESC)`
    would be redundant -- the PK index handles the same queries. Only add a
    secondary index when there is a query pattern the PK cannot serve (e.g.,
    period-only lookups without tenant_id).

    Design rationale (for your understanding, not for comments in the file):
    - Composite PK `(tenant_id, period)` is the UPSERT conflict target
    - `period` as TEXT in YYYY-MM format matches the API query parameter
    - INTEGER counters are 64-bit signed (~9.2 quintillion max)
    - CHECK constraints as defense-in-depth against decrement bugs
    - FK to tenants(id) consistent with captures and api_keys tables
    - `PRAGMA foreign_keys = ON` matches 0001 convention

    **2. Add two functions to `src/db.js`**

    Follow the existing conventions in db.js exactly:
    - JSDoc comments on all exports
    - camelCase return object shapes (tenantId, not tenant_id)
    - snake_case in SQL column names
    - All DB access centralized in this module

    **Function 1: `incrementUsage(db, tenantId, deltas)`**

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
      const period = computePeriod();
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
    ```

    Key design points:
    - Single UPSERT statement handles both first-write (INSERT) and subsequent
      writes (UPDATE via ON CONFLICT). The `excluded.col` syntax references the
      VALUES clause.
    - Accepts a deltas object so a single call can increment multiple counters
      atomically.
    - Early return if all deltas are zero (avoids unnecessary D1 round-trip).
    - Period derived from `computePeriod()` (see below).

    **Function 2: `getUsage(db, tenantId, period)`**

    ```js
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

    Key design points:
    - Returns zeroed counters for unknown tenants/future periods (not 404/null).
    - camelCase return shape consistent with getCapture, getTenantConfig, etc.

    **Function 3: `computePeriod(date)`**

    A pure helper extracted for testability:

    ```js
    /**
     * Derive the billing period string ('YYYY-MM') from a Date.
     * Defaults to current UTC time. Exported for testing.
     *
     * @param {Date} [date]
     * @returns {string}
     */
    export function computePeriod(date = new Date()) {
      return date.toISOString().slice(0, 7);
    }
    ```

    **3. Update `test/fixtures.js`**

    Add `usage_counters` to the `cleanDb` function. It must be deleted BEFORE
    `tenants` (FK constraint) but can be in any order relative to other child
    tables. Add it as the first statement in the batch:

    ```js
    export async function cleanDb(db) {
      await db.batch([
        db.prepare('DELETE FROM usage_counters'),
        db.prepare('DELETE FROM captures'),
        db.prepare('DELETE FROM api_keys'),
        db.prepare('DELETE FROM signing_keys'),
        db.prepare('DELETE FROM tenants'),
      ]);
    }
    ```

    Also add a `seedUsageCounter` helper. **Use a plain INSERT, not an UPSERT.**
    Test fixtures should set up exact known state, not silently merge with
    existing data. If a test calls seedUsageCounter twice with the same
    tenant+period, it should fail loudly (UNIQUE constraint violation) rather
    than silently overwriting -- that would mask a test isolation bug.

    ```js
    export async function seedUsageCounter(db, {
      tenantId = 'default',
      period = '2026-03',
      captureCount = 0,
      storageBytes = 0,
      apiCallCount = 0,
    } = {}) {
      await db.batch([
        db.prepare('INSERT OR IGNORE INTO tenants (id) VALUES (?)').bind(tenantId),
        db.prepare(
          `INSERT INTO usage_counters (tenant_id, period, capture_count, storage_bytes, api_call_count)
           VALUES (?, ?, ?, ?, ?)`,
        ).bind(tenantId, period, captureCount, storageBytes, apiCallCount),
      ]);
    }
    ```

    ### What NOT to do

    - Do NOT create a separate `src/usage.js` module. All D1 access is
      centralized in `src/db.js` per project convention. The iac-minion suggested
      a separate module, but that diverges from the established pattern.
    - Do NOT add a `computeStorageBytes()` function here. Storage byte
      calculation belongs in `src/capture.js` where the buffers are in memory.
    - Do NOT add any route handlers or modify `src/index.js`. That is a separate
      task.
    - Do NOT write tests. Tests are a separate task.
    - Do NOT add event log tables or append-only patterns. The captures table
      is the source of truth; usage_counters is a materialized aggregate.
    - Do NOT create any secondary indexes. The composite PK is sufficient.

    ### File paths

    - Create: `migrations/0002_usage_counters.sql`
    - Modify: `src/db.js` (add three exports at the bottom: `computePeriod`, `incrementUsage`, `getUsage`)
    - Modify: `test/fixtures.js` (update `cleanDb`, add `seedUsageCounter`)

    ### Success criteria

    - `migrations/0002_usage_counters.sql` exists with the exact schema above (no secondary index)
    - `incrementUsage` exported from `src/db.js` with correct UPSERT SQL
    - `getUsage` exported from `src/db.js` returning camelCase shape with zeroed defaults
    - `computePeriod` exported from `src/db.js` as a pure function
    - `cleanDb` in `test/fixtures.js` deletes `usage_counters`
    - `seedUsageCounter` exported from `test/fixtures.js` using plain INSERT (not UPSERT)
    - All existing exports in `db.js` unchanged
    - No new files created (no `src/usage.js`)
- **Deliverables**: `migrations/0002_usage_counters.sql`, updated `src/db.js` with three new exports, updated `test/fixtures.js`
- **Success criteria**: Migration creates table with correct schema; DAL functions follow existing db.js conventions; fixtures updated for test support

### Task 2: Counter Integration (capture pipeline + API call counting)
- **Agent**: iac-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |
    ## Task: Wire Usage Counter Increments into Capture Pipeline and API Handlers

    You are wiring the usage counter increment logic into the WRL Cloudflare
    Worker. The `incrementUsage` function already exists in `src/db.js` (from
    a prior task). Your job is to call it at the right points.

    ### Context

    The project uses `ctx.waitUntil()` for deferred non-blocking writes
    throughout (logging, rate limit counter writes). Usage counter writes
    follow the same pattern.

    Three counters need incrementing:

    | Counter | Where | When | Value |
    |---------|-------|------|-------|
    | `apiCalls` | `src/index.js` fetch handlers | After successful auth, for each authenticated tenant endpoint | +1 |
    | `captures` | `src/index.js` queue consumer | After `performCapture()` returns `{ ok: true }` | +1 |
    | `storageBytes` | `src/index.js` queue consumer | After `performCapture()` returns `{ ok: true, storedBytes: N }` | +N |

    ### What to do

    **1. Extend `performCapture()` return value in `src/capture.js`**

    Currently `performCapture()` returns `{ ok: true }` on success (line 265).
    Extend it to return `{ ok: true, storedBytes: N }` where N is the sum of
    all R2 artifact sizes stored for this capture.

    Compute storedBytes from the in-memory buffers BEFORE the R2 puts. The
    sizes are already known:

    ```js
    // After the R2 Promise.all() at line 150-160, before completeCapture():
    let storedBytes = screenshot.byteLength;
    if (screenshotBefore) storedBytes += screenshotBefore.byteLength;
    storedBytes += new TextEncoder().encode(html).byteLength;
    if (headers) storedBytes += new TextEncoder().encode(JSON.stringify(headers)).byteLength;
    if (waczBytes) storedBytes += waczBytes.byteLength;
    ```

    Note: `waczBytes` is available inside the WACZ block (line 195). You need
    to compute the WACZ contribution after the WACZ block completes, since
    `waczBytes` may or may not exist. Structure it so the total is accumulated
    progressively.

    Compute the base artifact sizes (screenshot, screenshotBefore, html,
    headers) right after the R2 Promise.all() completes. Then add waczBytes
    if WACZ bundling succeeded. Return the total in the success result.

    For partial captures, waczBytes is always null (WACZ is skipped). The
    storedBytes for a partial capture is just screenshot + html.

    Change the success return at line 265 from:
    ```js
    return { ok: true };
    ```
    to:
    ```js
    return { ok: true, storedBytes };
    ```

    **2. Add capture + storage counter increment in queue consumer (`src/index.js`)**

    In `handleCaptureMessage()`, after line 137 (`if (result.ok === true) {`),
    add the counter increment before `msg.ack()`:

    ```js
    if (result.ok === true) {
      // Usage counter: capture count + storage bytes (deferred, non-blocking)
      ctx.waitUntil(
        incrementUsage(env.DB, tenantId, {
          captures: 1,
          storageBytes: result.storedBytes || 0,
        }).catch((err) => {
          log(env, 4, 'usage', {
            event: 'usage.counter_fail',
            tenantId,
            captureId,
            counters: 'captures,storageBytes',
            errorMessage: String(err?.message ?? '').slice(0, 256),
          });
        })
      );

      // Log successful counter increment for monitoring reconciliation
      ctx.waitUntil(log(env, 3, 'usage', {
        event: 'usage.counter_incremented',
        tenantId,
        captureId,
        captures: 1,
        storageBytes: result.storedBytes || 0,
      }) ?? Promise.resolve());

      msg.ack();
    ```

    The `usage.counter_incremented` log event is intentional: the capture queue
    consumer is the single source of truth for capture counting, and this event
    enables reconciliation queries (compare D1 counter totals against Coralogix
    event counts to detect counter drift). Do NOT add a similar success log for
    API call counter increments in the fetch handlers -- those fire at high
    volume and the admin can reconcile API calls via other means.

    Add the import at the top of `src/index.js`:
    ```js
    import { createCapture, getCapture, failCapture, listCaptures, listArchivedSigningKeys, TENANT_ID_RE, getTenantConfig, setTenantConfig, incrementUsage } from './db.js';
    ```

    **3. Add API call counter increment in authenticated handlers (`src/index.js`)**

    Add `ctx.waitUntil(incrementUsage(env.DB, tenantId, { apiCalls: 1 }).catch(...))`
    to each of the **three** authenticated handler functions that call
    `verifyApiKey` and have `tenantId` available. Place it right after the
    `const { tenantId, keyName, keyHashPrefix, authMethod } = auth;` line
    (or equivalent) in each handler.

    The three handlers (all in `src/index.js`):
    1. `handleCreateCapture` -- after line 420 (`const { tenantId, ... } = auth;`)
    2. `handleBatchCapture` -- after line 564 (`const { tenantId, ... } = auth;`)
    3. `handleListCaptures` -- after the auth block

    **IMPORTANT**: Only these three handlers use `verifyApiKey` and have a
    `tenantId` from the auth result. The other handlers (`handleCaptureStatus`,
    `handleGetCapture`, `handleGetCaptureArtifact`) are public endpoints with
    no `verifyApiKey` call and no `tenantId` -- do NOT add counter increments
    to those handlers.

    Pattern for each handler:
    ```js
    // Usage counter: API call (deferred, non-blocking)
    ctx.waitUntil(
      incrementUsage(env.DB, tenantId, { apiCalls: 1 }).catch((err) => {
        log(env, 4, 'usage', {
          event: 'usage.counter_fail',
          tenantId,
          counters: 'apiCalls',
          // captureId intentionally omitted: API call counting is at the
          // request level, not capture level. The tenantId + timestamp in the
          // log event is sufficient for debugging counter failures.
          errorMessage: String(err?.message ?? '').slice(0, 256),
        });
      })
    );
    ```

    **Counting rules**:
    - Auth failures (401, 403): do NOT count (the waitUntil fires only after
      auth succeeds)
    - Rate limit rejections (429): do NOT count (counter fires before rate
      limit check, but the handler returns early on 429 -- actually, place the
      counter increment AFTER rate limit check passes, to avoid counting
      rate-limited requests)
    - Batch capture: counts as 1 API call (one HTTP request), not N
    - Admin endpoints: do NOT count (they use verifyAdminKey, a different auth
      path -- these are operator actions, not tenant usage)
    - Public endpoints (handleCaptureStatus, handleGetCapture,
      handleGetCaptureArtifact): do NOT count (no tenant auth, no tenantId)
    - MCP requests that authenticate as a tenant: handled separately (the MCP
      handler uses its own auth -- out of scope for this task)

    **Important placement detail for handleCreateCapture and handleBatchCapture**:
    Place the API call counter AFTER the rate limit check passes (after the
    `if (rl.exceeded)` block). This way, rate-limited requests are not counted.
    The line should go right before the functional logic begins (before body
    parsing in handleCreateCapture, before the global rate limit check in
    handleBatchCapture).

    For handleListCaptures, place it right after auth succeeds since that
    handler has no rate limiting.

    **4. Error handling pattern**

    All `incrementUsage` calls MUST be wrapped in `.catch()` inside
    `ctx.waitUntil()`. The catch handler logs the failure but does NOT
    propagate the error. This follows the existing pattern where
    `ctx.waitUntil(log(...) ?? Promise.resolve())` is fire-and-forget.

    Use `log(env, 4, 'usage', { event: 'usage.counter_fail', ... })` for
    counter failures. Severity 4 (warning) because counter loss is tolerable
    but worth monitoring.

    ### What NOT to do

    - Do NOT modify `src/admin.js` or admin endpoints. Admin calls are not
      metered.
    - Do NOT create a separate `src/usage.js` module. The `incrementUsage`
      function lives in `src/db.js`.
    - Do NOT add counter increments inside `src/capture.js` (except the
      storedBytes return value). Metering is a cross-cutting concern that
      belongs in the orchestration layer (index.js).
    - Do NOT increment counters for failed captures (only `result.ok === true`).
    - Do NOT count admin API calls or unauthenticated endpoints (/health,
      /.well-known/*, /v1/verify/*).
    - Do NOT add counter increments to public endpoints (handleCaptureStatus,
      handleGetCapture, handleGetCaptureArtifact) -- they have no tenant auth.
    - Do NOT write tests. Tests are a separate task.
    - Do NOT modify the `src/db.js` file (DAL functions are from Task 1).
    - Do NOT add `usage.counter_incremented` success log events in the API call
      handlers -- only in the capture queue consumer.

    ### File paths

    - Modify: `src/capture.js` (extend return value with storedBytes)
    - Modify: `src/index.js` (add import, counter increments in 4 places: queue consumer + 3 authenticated handlers)

    ### Success criteria

    - `performCapture()` returns `{ ok: true, storedBytes: N }` where N is the
      sum of all artifact sizes written to R2
    - Queue consumer increments captures + storageBytes on successful capture
    - Queue consumer logs `usage.counter_incremented` event on success
    - All 3 authenticated handlers increment apiCalls after auth + rate limit
    - All increment calls wrapped in ctx.waitUntil with .catch() error handler
    - API handler .catch() log blocks include comment explaining intentional
      absence of captureId
    - Batch capture counts as 1 API call
    - No counter increments on auth failure, rate limit, failed captures, or
      public/unauthenticated endpoints
- **Deliverables**: Updated `src/capture.js` (storedBytes return), updated `src/index.js` (counter increments in queue consumer and 3 authenticated handlers)
- **Success criteria**: Counter increments fire at correct points with proper error handling; no latency added to hot paths

### Task 3: Admin Usage Endpoint + OpenAPI Spec
- **Agent**: api-design-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |
    ## Task: Implement GET /v1/admin/usage Endpoint and Update OpenAPI Spec

    You are adding the admin usage query endpoint to WRL. The `getUsage()`
    function already exists in `src/db.js` (from a prior task). Your job is
    to build the HTTP handler and wire the route.

    ### Context

    The existing admin endpoint pattern is in `src/admin.js`:
    - Handlers are exported functions called from `src/index.js` route table
    - Admin auth is handled centrally in `index.js` (verifyAdminKey) before
      the route handler is called
    - All admin responses use `ADMIN_CACHE` headers (`Cache-Control: private, no-store`)
    - Error responses use `problemResponse(status, detail)`
    - Success responses use `jsonResponse(body, status, headers)`
    - Logging uses `ctx.waitUntil(log(env, severity, category, payload))`
    - Client IP hashing: `const cip = await computeCip(env, clientIp)`

    ### What to do

    **1. Add `handleAdminGetUsage` to `src/admin.js`**

    ```js
    /**
     * GET /v1/admin/usage -- query usage counters for a tenant
     */
    export async function handleAdminGetUsage(request, env, ctx) {
      const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
      const cip = await computeCip(env, clientIp);

      const params = new URL(request.url).searchParams;

      // Validate tenant param (required)
      const tenantId = params.get('tenant');
      if (!tenantId) {
        return problemResponse(400, "Query parameter 'tenant' is required");
      }
      if (!TENANT_ID_RE.test(tenantId)) {
        return problemResponse(400, "Query parameter 'tenant' must match /^[a-z0-9_-]{1,64}$/");
      }

      // Validate period param (optional, defaults to current month UTC)
      let period = params.get('period');
      if (period) {
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
          return problemResponse(400, "Query parameter 'period' must be in YYYY-MM format (e.g., 2026-03)");
        }
      } else {
        period = computePeriod();
      }

      // Verify tenant exists -- return 404 for nonexistent tenants rather
      // than zeroed counters. An admin querying usage for a tenant that
      // doesn't exist is likely a typo or misconfiguration, and returning
      // zeros would be operationally deceptive. The admin can already
      // enumerate tenants via other admin endpoints.
      const tenant = await getTenant(env.DB, tenantId);
      if (!tenant) {
        return problemResponse(404, `Tenant '${tenantId}' not found`);
      }

      const usage = await getUsage(env.DB, tenantId, period);

      // Compute period boundaries
      const [year, month] = period.split('-').map(Number);
      const periodStart = new Date(Date.UTC(year, month - 1, 1)).toISOString();
      const periodEnd = new Date(Date.UTC(year, month, 1)).toISOString();

      ctx.waitUntil(log(env, 3, 'admin', {
        event: 'admin.usage_query',
        tenantId,
        period,
        authMethod: 'admin_key',
        responseStatus: 200,
        cip,
      }) ?? Promise.resolve());

      return jsonResponse({
        tenantId: usage.tenantId,
        period: usage.period,
        periodStart,
        periodEnd,
        usage: {
          captures: usage.captureCount,
          storageBytes: usage.storageBytes,
          apiCalls: usage.apiCallCount,
        },
        updatedAt: usage.updatedAt,
      }, 200, ADMIN_CACHE);
    }
    ```

    **Tenant existence check**: Note the `getTenant` call above. Check whether
    `src/db.js` already exports a function that checks tenant existence (e.g.,
    `getTenantConfig` or similar). If so, use it. If not, you may need to add
    a simple `getTenant` query or reuse an existing function. The key behavior
    is: return 404 for a tenant_id that has no row in the `tenants` table.
    Zeroed counters (no usage_counters row) for an existing tenant are still
    returned as 200 with zeros -- that is correct (the tenant exists but had
    no activity in this period).

    Update the imports at the top of `src/admin.js`:
    ```js
    import { createApiKeyRecord, getApiKeyRecord, listApiKeyRecords, revokeApiKeyRecord, TENANT_ID_RE, getUsage, computePeriod, getTenantConfig } from './db.js';
    ```

    (Use whatever function name is appropriate for checking tenant existence.
    `getTenantConfig` may work if it returns null for nonexistent tenants.)

    **2. Add route entry in `src/index.js`**

    Add to the routes array (after the existing admin routes, before the
    tenant config routes):

    ```js
    ['GET',    /^\/v1\/admin\/usage$/, handleAdminGetUsage],
    ```

    Add to the import from `./admin.js`:
    ```js
    import { handleAdminCreateKey, handleAdminListKeys, handleAdminRevokeKey, handleAdminGetUsage } from './admin.js';
    ```

    **3. Update `openapi.yaml`**

    Add the new endpoint spec. Place it after the existing admin endpoints
    (after DELETE /v1/admin/keys/{keyHash}) and before the tenant config
    endpoints.

    ```yaml
      /v1/admin/usage:
        get:
          operationId: getUsage
          summary: Get usage counters for a tenant
          description: >
            Returns usage counters (captures, storage bytes, API calls) for a
            specific tenant in a billing period. Defaults to the current calendar
            month (UTC). Returns zeroed counters for existing tenants with no
            activity. Returns 404 for nonexistent tenants.
          tags:
            - admin
          security:
            - adminAuth: []
          parameters:
            - name: tenant
              in: query
              required: true
              description: Tenant identifier. Must correspond to an existing tenant.
              schema:
                type: string
                pattern: '^[a-z0-9_-]{1,64}$'
            - name: period
              in: query
              required: false
              description: >
                Billing period in YYYY-MM format. Defaults to current month (UTC).
              schema:
                type: string
                pattern: '^\d{4}-(0[1-9]|1[0-2])$'
                example: '2026-03'
          responses:
            '200':
              description: Usage counters for the requested tenant and period
              content:
                application/json:
                  schema:
                    type: object
                    required: [tenantId, period, periodStart, periodEnd, usage, updatedAt]
                    properties:
                      tenantId:
                        type: string
                      period:
                        type: string
                        example: '2026-03'
                      periodStart:
                        type: string
                        format: date-time
                        example: '2026-03-01T00:00:00.000Z'
                      periodEnd:
                        type: string
                        format: date-time
                        example: '2026-04-01T00:00:00.000Z'
                      usage:
                        type: object
                        required: [captures, storageBytes, apiCalls]
                        properties:
                          captures:
                            type: integer
                            minimum: 0
                          storageBytes:
                            type: integer
                            minimum: 0
                          apiCalls:
                            type: integer
                            minimum: 0
                      updatedAt:
                        type: ['string', 'null']
                        format: date-time
                        description: >
                          Timestamp of the last counter increment for this
                          tenant-period. Reflects when usage was last recorded,
                          not when this endpoint was queried. null means the
                          tenant exists but had no activity in this period.
            '400':
              $ref: '#/components/responses/BadRequest'
            '401':
              $ref: '#/components/responses/Unauthorized'
            '404':
              description: Tenant not found
              content:
                application/json:
                  schema:
                    $ref: '#/components/schemas/ProblemDetail'
            '429':
              $ref: '#/components/responses/TooManyRequests'
    ```

    Check the existing openapi.yaml for the exact response $ref names and
    adjust if the project uses different component names. If BadRequest,
    Unauthorized, or TooManyRequests refs don't exist, inline the response
    schemas following the pattern used by other admin endpoints. For the 404
    response, check if there is an existing `NotFound` response ref and use
    it; otherwise inline as shown above (adjust `ProblemDetail` schema ref
    to match whatever the project uses).

    ### Response shape rationale

    - `tenantId` and `period`: Echo back the queried values (standard practice)
    - `periodStart`/`periodEnd`: ISO 8601 UTC timestamps for unambiguous period
      boundaries. Prevents off-by-one bugs in consumers.
    - `usage` nested object: Groups the three counters cleanly. Easy to add
      counters later (e.g., bandwidth) without polluting the root.
    - `updatedAt`: Communicates data freshness. Reflects the last counter
      increment timestamp, NOT the query time. null means no activity in period.
    - 404 for nonexistent tenants: The admin already has tenant enumeration
      capability. Returning zeros for a nonexistent tenant would be
      operationally misleading (looks like the tenant exists but has no usage).
    - Zeroed counters for existing tenants with no activity: 200 with zeros.
      The tenant exists, zero usage is a valid fact.
    - Future periods: Return zeroed counters for existing tenants (not an error).

    ### What NOT to do

    - Do NOT add a multi-tenant listing endpoint (GET /v1/admin/usage without
      tenant param returning all tenants). That is deferred to R26.
    - Do NOT add per-tenant admin auth scoping. The current shared ADMIN_KEY
      model is acceptable.
    - Do NOT modify `src/db.js`. The getUsage and computePeriod functions
      already exist.
    - Do NOT write tests. Tests are a separate task.
    - Do NOT count admin usage queries as API calls. Admin endpoints are not
      metered.

    ### File paths

    - Modify: `src/admin.js` (add handleAdminGetUsage export)
    - Modify: `src/index.js` (add route entry and import)
    - Modify: `openapi.yaml` (add endpoint spec)

    ### Success criteria

    - `GET /v1/admin/usage?tenant=acme` returns 200 with correct response shape (when tenant exists)
    - `GET /v1/admin/usage?tenant=acme&period=2026-03` returns specified period
    - Missing tenant param returns 400
    - Invalid tenant format returns 400
    - Invalid period format returns 400
    - Nonexistent tenant returns 404 (not zeroed counters)
    - Existing tenant with no activity returns 200 with zeroed counters
    - Cache-Control: private, no-store on all responses
    - Route registered in index.js routes array
    - OpenAPI spec documents the endpoint including 404 response and updatedAt semantics
- **Deliverables**: `handleAdminGetUsage` in `src/admin.js`, route entry in `src/index.js`, OpenAPI spec update
- **Success criteria**: Endpoint returns correct response shape; all validation cases handled; 404 for nonexistent tenants; OpenAPI spec complete with updatedAt description

### Task 4: Unit Tests (DAL + period computation)
- **Agent**: test-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |
    ## Task: Write Unit Tests for Usage Counter Data Access Layer

    You are writing unit tests for the usage metering DAL functions added to
    `src/db.js`. Follow the exact patterns in `test/db.test.js`.

    ### Context

    The project uses Vitest with miniflare for Cloudflare Workers testing.
    Tests run against real D1 (miniflare-backed SQLite). The test setup
    (`test/apply-migrations.js`) runs all migrations from `migrations/`
    before any test executes.

    Existing test patterns (from `test/db.test.js`):
    - Import from `cloudflare:test` for `env`
    - Import from `vitest` for `describe`, `it`, `expect`, `beforeEach`
    - Use `cleanDb(env.DB)` in `beforeEach` for clean slate
    - Call DAL functions directly with `env.DB`
    - No HTTP routing, no auth -- pure DAL testing

    ### What to do

    **Create `test/usage-counters.test.js`** with these test groups:

    **1. computePeriod() tests** (pure function, no D1 needed):
    - `returns YYYY-MM for a mid-month date` (e.g., 2026-03-15T10:00:00Z -> '2026-03')
    - `returns YYYY-MM for first moment of month` (2026-03-01T00:00:00Z -> '2026-03')
    - `returns YYYY-MM for last moment of month` (2026-02-28T23:59:59.999Z -> '2026-02')
    - `defaults to current month when no argument` (verify format matches /^\d{4}-\d{2}$/)

    **2. incrementUsage() tests** (real D1 via miniflare):
    - `creates row on first increment` -- increment once, query DB directly,
      verify row exists with correct values
    - `increments existing row on subsequent calls` -- increment twice,
      verify values are cumulative
    - `handles multi-field increment` -- increment with { captures: 1, storageBytes: 5000 },
      verify both fields updated
    - `skips DB write when all deltas are zero` -- call with { captures: 0 },
      verify no row created (query returns null)
    - `isolates tenants` -- increment tenant A, increment tenant B, verify
      each has independent counters
    - `isolates periods` -- increment same tenant in '2026-03' and '2026-04',
      verify each period has independent counters. **Important**: assert BOTH
      the new-period row has the expected values AND the old-period row is
      unchanged. Do not only check the new row.
    - `monotonically increasing` -- increment N times sequentially, read after
      each, verify each value >= previous value
    - `handles large storage bytes` -- increment with storageBytes: 50 * 1024 * 1024 (50MB),
      verify exact value stored

    **3. getUsage() tests**:
    - `returns zeroed counters for unknown tenant` -- query a tenant that has
      no data, verify all counters are 0
    - `returns zeroed counters for future period` -- seed data for 2026-03,
      query 2026-12, verify zeros
    - `returns actual counters for existing data` -- seed known values via
      seedUsageCounter, query, verify match
    - `returns null updatedAt when no row exists`
    - `returns null updatedAt on first INSERT (before any update)` -- use
      seedUsageCounter to create a row (plain INSERT, no update), query
      via getUsage, verify `updatedAt` is null. This tests that the initial
      INSERT does not set updatedAt (only the ON CONFLICT UPDATE path does).
    - `returns non-null updatedAt after increment` -- seedUsageCounter to
      create the row, then call incrementUsage to trigger the ON CONFLICT
      UPDATE path, then query, verify updatedAt is a valid ISO timestamp.
      This tests the dual-path: INSERT leaves updatedAt null, subsequent
      UPSERT-update sets it.

    For period-isolated tests, call `incrementUsage` but first set up the
    data by passing specific periods. Since `incrementUsage` derives period
    from `computePeriod()` (which uses `new Date()`), you have two options:
    - Option A: Insert rows directly via `db.prepare()` for specific periods,
      then verify getUsage reads them correctly (tests getUsage, not
      incrementUsage period behavior)
    - Option B: Use the `seedUsageCounter` fixture to set up known state,
      then test that incrementUsage updates the current period only

    Use Option B for simplicity. The period derivation logic is tested in
    the computePeriod() group.

    **Imports you will need:**
    ```js
    import { env } from 'cloudflare:test';
    import { describe, it, expect, beforeEach } from 'vitest';
    import { cleanDb, seedUsageCounter } from './fixtures.js';
    import { incrementUsage, getUsage, computePeriod } from '../src/db.js';
    ```

    ### What NOT to do

    - Do NOT test ctx.waitUntil() behavior (that is a platform guarantee)
    - Do NOT test D1 write concurrency (miniflare is single-connection)
    - Do NOT use vi.useFakeTimers() (risk of miniflare timer interference)
    - Do NOT write integration/HTTP tests (that is a separate task)
    - Do NOT test admin endpoint behavior
    - Do NOT modify any source files

    ### File paths

    - Create: `test/usage-counters.test.js`

    ### Success criteria

    - All tests pass with `npx vitest run test/usage-counters.test.js`
    - ~17-20 tests covering computePeriod, incrementUsage, getUsage
    - Tests use real D1 via miniflare (no mocks)
    - cleanDb called in beforeEach for clean slate
    - Period isolation test asserts both old and new period rows
    - updatedAt tests cover both the null (initial INSERT) and non-null
      (subsequent UPSERT update) paths
    - Tests complete in under 3 seconds
- **Deliverables**: `test/usage-counters.test.js` with ~17-20 unit tests
- **Success criteria**: All tests pass; covers period computation, increment semantics, query behavior, tenant/period isolation, updatedAt dual-path

### Task 5: Integration Tests (admin usage endpoint)
- **Agent**: test-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: Task 2, Task 3
- **Approval gate**: no
- **Prompt**: |
    ## Task: Write Integration Tests for GET /v1/admin/usage Endpoint

    You are writing integration tests for the admin usage query endpoint.
    Follow the exact patterns in `test/admin-keys.test.js`.

    ### Context

    The project uses Vitest with miniflare. Integration tests use
    `SELF.fetch()` to make real HTTP requests through the full worker stack.
    The test setup runs all D1 migrations before tests execute.

    Key patterns from `test/admin-keys.test.js`:
    - `import { env, SELF } from 'cloudflare:test'`
    - `const ADMIN_AUTH = 'Bearer ' + TEST_ADMIN_KEY`
    - Each describe block uses a distinct CF-Connecting-IP via `nextIp()` to
      avoid admin rate limit bleed-over (5 req/60s per IP)
    - `cleanDb(env.DB)` in beforeEach
    - Response assertions check status, headers, and parsed JSON body

    ### What to do

    **Create `test/admin-usage.test.js`** with these test groups:

    **1. Auth enforcement:**
    - `returns 401 without auth header`
    - `returns 401 with CAPTURE_API_KEY (wrong auth type)`

    **2. Parameter validation:**
    - `returns 400 when tenant param is missing`
    - `returns 400 when tenant format is invalid` (e.g., "UPPER_CASE")
    - `returns 400 when period format is invalid` (e.g., "2026-3", "2026-13", "not-a-date")

    **3. Tenant existence:**
    - `returns 404 for nonexistent tenant` -- query a tenant_id that has no
      row in the tenants table, verify 404 response with problem detail body.
      This is a critical test: the endpoint MUST distinguish between "tenant
      does not exist" (404) and "tenant exists but has no usage" (200 with
      zeroed counters).
    - `returns 200 with zeroed counters for existing tenant with no usage` --
      seed a tenant (e.g., via seedUsageCounter's tenant INSERT, or directly
      insert into tenants table), query usage for that tenant, verify 200
      with all counters at 0.

    **4. Happy path:**
    - `returns seeded counters for known tenant` -- use seedUsageCounter to
      create known data, query, verify exact values
    - `returns current period when period param omitted` -- query without
      period, verify response period matches current YYYY-MM
    - `returns specified period when period param provided` -- seed data for
      2026-03, query with period=2026-03, verify match
    - `returns zeroed counters for future period` -- seed 2026-03 data for
      an existing tenant, query 2026-12, verify zeros (200, not 404)
    - `includes periodStart and periodEnd as ISO timestamps` -- verify
      periodStart is first day of month at 00:00:00, periodEnd is first day
      of next month

    **5. Response shape and headers:**
    - `response shape matches spec` -- verify all fields present: tenantId,
      period, periodStart, periodEnd, usage.captures, usage.storageBytes,
      usage.apiCalls, updatedAt
    - `sets Cache-Control: private, no-store`

    **6. Cross-tenant isolation:**
    - `tenant A cannot see tenant B usage` -- seed counters for tenant-a and
      tenant-b with different values, query each, verify isolation

    **7. End-to-end wiring test:**
    - `authenticated API call increments usage counter` -- make an actual
      authenticated API call (e.g., POST /v1/captures or GET /v1/captures
      with a valid API key), then query GET /v1/admin/usage for that tenant,
      and verify the apiCalls counter is >= 1. This tests that the counter
      increment wiring in Task 2 actually flows through to the usage endpoint
      in Task 3.

      To set up the API key for this test, use the admin key creation endpoint
      (POST /v1/admin/keys) or the seedApiKey fixture if available. The exact
      setup depends on what test fixtures exist -- check `test/fixtures.js`
      for helper functions. The important thing is that the test makes a real
      authenticated API call through the full worker stack, not just a
      database-level incrementUsage call.

      Note: If the authenticated endpoint has side effects (e.g., POST
      /v1/captures enqueues to a queue that miniflare may not process), prefer
      GET /v1/captures which is a simpler read-only authenticated endpoint.

    **Helper functions you will need:**
    ```js
    function makeAdminGet(ip) {
      return (query = '') => SELF.fetch(`https://worker.test/v1/admin/usage${query}`, {
        headers: {
          Authorization: ADMIN_AUTH,
          'CF-Connecting-IP': ip,
        },
      });
    }
    ```

    **Imports:**
    ```js
    import { env, SELF } from 'cloudflare:test';
    import { describe, it, expect, beforeEach } from 'vitest';
    import { TEST_ADMIN_KEY, cleanDb, seedUsageCounter } from './fixtures.js';
    ```

    **Rate limit awareness**: The admin rate limiter is 5 req/60s per IP.
    Each describe block MUST use a different IP via nextIp(). Plan test
    counts per describe block carefully -- no describe should exceed 5
    requests. Split into multiple describe blocks if needed. The end-to-end
    test makes both a tenant API call and an admin API call, so count both
    against their respective rate limits (the tenant API call uses a
    different rate limit pool than the admin call).

    ### What NOT to do

    - Do NOT test counter increment logic at the DB level (that is the unit test task)
    - Do NOT use vi.useFakeTimers()
    - Do NOT modify any source files

    ### File paths

    - Create: `test/admin-usage.test.js`

    ### Success criteria

    - All tests pass with `npx vitest run test/admin-usage.test.js`
    - ~14-17 tests covering auth, validation, tenant existence, happy path,
      response shape, end-to-end wiring
    - Tests use SELF.fetch() pattern (real HTTP through worker)
    - Each describe block uses unique IP
    - No describe block exceeds 5 requests
    - cleanDb called in beforeEach
    - 404 for nonexistent tenant is explicitly tested
    - End-to-end wiring test verifies counter increment flows from API call
      through to usage query
    - Tests complete in under 5 seconds
- **Deliverables**: `test/admin-usage.test.js` with ~14-17 integration tests
- **Success criteria**: All tests pass; covers auth, validation, 404 for nonexistent tenant, response shape, cross-tenant isolation, end-to-end wiring

### Cross-Cutting Coverage

- **Testing**: Task 4 (unit tests) and Task 5 (integration tests) cover all new code. Task 5 includes end-to-end wiring test that verifies the full flow from authenticated API call to usage query. Phase 6 post-execution will run the full test suite.
- **Security**: The usage endpoint reuses the existing verifyAdminKey flow. Added tenant existence check (404 for nonexistent tenants) per security-minion advisory to prevent operationally deceptive zeroed responses. Counter writes are fire-and-forget (no new error propagation paths). security-minion reviewed in Phase 3.5.
- **Usability -- Strategy**: This is an internal admin API, not a user-facing feature. The response shape design (zeroed counters for existing tenants, period boundaries, nested usage object) was shaped by api-design-minion with UX considerations. updatedAt semantics clarified per ux-strategy-minion advisory. Reviewed in Phase 3.5.
- **Usability -- Design**: No user-facing UI produced. Excluded.
- **Documentation**: OpenAPI spec update is included in Task 3, including updatedAt semantics description and 404 response documentation. Phase 8 post-execution documentation assessment will identify any additional needs (architecture docs, user docs for admin API consumers).
- **Observability**: Counter write failures logged at severity 4 (warning) with event `usage.counter_fail`. Capture counter success logged at severity 3 (info) with event `usage.counter_incremented` (queue consumer only, not API handlers) per observability-minion advisory. Admin usage queries logged at severity 3 (info). Backlog item for counter drift reconciliation query to be added per observability-minion advisory. observability-minion reviewed in Phase 3.5.

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - observability-minion: The plan introduces fire-and-forget D1 writes via waitUntil with .catch() error handling. Observability review should verify the logging pattern is sufficient for monitoring counter drift and that the `usage.counter_fail` event has enough context for alerting.
    Review focus: Counter failure logging completeness, monitoring gap assessment
  - gru: Technology choice validation for D1 as the usage counter store, and billing semantics review for artifact fetch counting and storedBytes approximation.
    Review focus: D1 suitability confirmation, billing model correctness
- **Not selected**:
  - ux-design-minion: No user-facing UI components produced
  - accessibility-minion: No web-facing HTML/UI produced
  - sitespeed-minion: No web-facing runtime code; the admin endpoint is programmatic, not browser-facing
  - user-docs-minion: Admin API documentation is in OpenAPI spec; no end-user guides needed for internal metering

### Decisions

- **DAL module placement**
  Chosen: Add incrementUsage/getUsage/computePeriod to existing `src/db.js`
  Over: Create new `src/usage.js` module (recommended by iac-minion)
  Why: The project convention centralizes all D1 access in `src/db.js`. The module header explicitly states "No raw env.DB.prepare() calls should exist outside this module." Creating a separate usage module would break this convention for no clear benefit -- the three functions are small and follow the same patterns as existing db.js functions.

- **API call counting placement**
  Chosen: Explicit `ctx.waitUntil(incrementUsage(...))` in each of the 3 authenticated handlers
  Over: (1) Side-channel via `ctx._usage` object checked in central dispatch, (2) Counting inside verifyApiKey, (3) Counting in all 6 "tenant endpoint" handlers
  Why: Only 3 handlers (handleCreateCapture, handleBatchCapture, handleListCaptures) call verifyApiKey and have tenantId available. The other 3 (handleCaptureStatus, handleGetCapture, handleGetCaptureArtifact) are public endpoints with no tenant auth. Counting in all 6 was incorrect per lucy's review. The codebase already does per-handler cross-cutting work (rate limit header injection, logging).

- **Failed captures and counter behavior**
  Chosen: Only successful captures increment capture_count and storage_bytes. API calls increment on every authenticated request (regardless of capture outcome).
  Over: test-minion recommended counting failed captures in capture_count (since they consumed compute). data-minion and api-design-minion recommended counting only successful captures.
  Why: The success criteria says "capture count, storage consumption" -- storage is zero for failed captures, and the semantic of "capture count" for billing aligns with "captures that produced a result." API calls count regardless because the request consumed auth, validation, and queue dispatch resources. This is the cleaner model: capture_count tracks deliverables, api_call_count tracks resource consumption.

- **Batch capture API call counting**
  Chosen: Count as 1 API call (one HTTP request = one API call)
  Over: Count as N API calls (one per URL in the batch)
  Why: The batch endpoint is a convenience for callers. Penalizing efficient API usage by counting N calls for a single request would discourage batching. Capture count will naturally be N (one per successful capture). This aligns with the standard REST interpretation: one request = one API call.

- **Nonexistent tenant response (revised per security-minion)**
  Chosen: Return 404 for nonexistent tenants
  Over: Return 200 with zeroed counters for any tenant_id (original plan)
  Why: The admin can already enumerate tenants via other endpoints, so a 404 does not leak new information. Returning zeros for a nonexistent tenant is operationally deceptive -- an admin debugging a typo would see "no usage" instead of "tenant not found." The 404 makes the API honest. Existing tenants with no activity still return 200 with zeros.

### Risks and Mitigations

1. **waitUntil D1 write reliability (MEDIUM probability, LOW impact)**
   Counter increments via `ctx.waitUntil()` are fire-and-forget. If a D1 write fails (transient error, D1 outage), the counter is permanently under-counted. Mitigation: (a) `.catch()` logs failures to Coralogix for monitoring, (b) underbilling is the safe direction, (c) the captures table is the source of truth -- a reconciliation query can derive exact counts if needed. (d) `usage.counter_incremented` success log in queue consumer enables reconciliation. Reconciliation CRON to be added to backlog.

2. **Period boundary edge case (LOW probability, NEGLIGIBLE impact)**
   A capture completing at midnight UTC may land in the next month's period. This is by design: period is determined at increment time (completion), not submission time. Documented in the response payload via periodStart/periodEnd boundaries.

3. **Storage byte accuracy (LOW probability, LOW impact)**
   Storage bytes are computed from in-memory buffer sizes before R2 upload. R2 stores objects as-is (no transformation), so buffer sizes match Content-Length. The counter tracks logical content bytes, excluding R2 metadata overhead. Documented as "logical bytes" in OpenAPI spec description.

4. **Admin endpoint shared auth (KNOWN LIMITATION)**
   The usage endpoint reuses verifyAdminKey (single shared ADMIN_KEY). Any admin key holder can see any tenant's usage. This is the current admin auth model. Per-tenant admin scoping is a natural follow-up when admin auth evolves (existing TODO at admin.js line 211).

### Execution Order

```
Batch 1 (parallel, no dependencies):
  Task 1: D1 Schema Migration + Data Access Layer [GATE]

  -- APPROVAL GATE after Task 1 --

Batch 2 (parallel, both blocked by Task 1):
  Task 2: Counter Integration (capture pipeline + API call counting)
  Task 3: Admin Usage Endpoint + OpenAPI Spec
  Task 4: Unit Tests (DAL + period computation)

Batch 3 (blocked by Task 2 + Task 3):
  Task 5: Integration Tests (admin usage endpoint)
```

Gate position: After Task 1 completes. The schema and DAL design locks the data model for all downstream tasks. Task 1 is the only gate (hard-to-reverse schema + high blast radius: 4 downstream dependents).

### External Skills

No external skills detected in project.

### Verification Steps

After all tasks complete:
1. Run full test suite: `npx vitest run` -- all existing + new tests pass
2. Verify migration applies cleanly: check `migrations/0002_usage_counters.sql` syntax (no secondary index)
3. Verify counter increments: unit tests confirm UPSERT semantics, monotonicity, isolation, updatedAt dual-path
4. Verify admin endpoint: integration tests confirm auth, validation, 404 for nonexistent tenant, response shape, end-to-end wiring
5. Verify OpenAPI spec: endpoint documented with parameters, response schema, 404 response, updatedAt semantics, and examples
6. Manual smoke test (optional): deploy to staging, create a capture, query usage endpoint

### Backlog Items (from architecture review)

- Counter drift reconciliation query: Coralogix query comparing `usage.counter_incremented` event counts against D1 usage_counters totals (per observability-minion advisory)
- Document storedBytes as approximation derived from in-memory buffer sizes (per gru advisory)
- Confirm artifact fetch counting is intended billing semantics (per gru advisory)
