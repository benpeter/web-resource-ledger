## Delegation Plan

**Team name**: d1-migration-metadata
**Description**: Migrate WRL metadata (captures, tenants, API keys, signing keys) from KV to Cloudflare D1, enabling SQL-based queries for pagination, filtering, and sorting. KV retained only for rate limit counters.

---

### Conflict Resolutions

**1. Pagination model: offset/limit vs. cursor/keyset**

Chosen: **Offset/limit**, removing cursor entirely.
Over: Keeping cursor-based pagination (api-design-minion), or keeping cursor as deprecated alias (ux-strategy-minion fallback).
Why: The task spec explicitly requests offset/limit. There are zero external users. The current cursor wraps KV's internal cursor which disappears entirely with D1 -- there is nothing to preserve. Offset/limit is simpler to implement, simpler to test, and enables "page N of M" navigation for any future UI. At 10K captures per tenant (the stated ceiling), offset performance is identical to keyset. The YAGNI principle strongly favors the simpler model. If deep-page performance ever becomes an issue (100K+), keyset can be added as an additive change -- the D1 schema supports it without migration.

**2. URL filtering: prefix match vs. substring match**

Chosen: **Prefix match** (`LIKE ? || '%'`), with minimum 4 characters.
Over: Substring match / case-insensitive contains (`LIKE '%' || ? || '%'`).
Why: Prefix match is index-friendly -- SQLite optimizes `LIKE 'prefix%'` into a B-tree range scan using `idx_captures_tenant_created`. Substring match with leading wildcard defeats all indexes and forces a full table scan. At 10K rows this is fast, but it sets a bad precedent and creates a performance cliff. The common user job ("show me captures of example.com") works perfectly with prefix matching on the URL. If full-text URL search is needed, it is explicitly out of scope per the task spec. Minimum 4 characters prevents trivially broad queries.

**3. Total count in response envelope**

Chosen: **Include `total` in the pagination response**.
Over: Omitting total count.
Why: With D1, `SELECT COUNT(*)` with the same WHERE clause is cheap (covered by indexes). Total count is required for any paginated UI and provides immediate context to MCP agents. The `pagination` envelope changes from `{ cursor, hasMore, limit }` to `{ total, offset, limit, hasMore }`.

**4. Cron Trigger for pending capture TTL cleanup**

Chosen: **Defer to backlog** -- do not include in this phase.
Over: Implementing a Cron Trigger scheduled handler (data-minion recommendation).
Why: YAGNI. The KV model used `expirationTtl` for pending capture self-cleanup. D1 has no TTL mechanism, so stuck pending captures will persist. However: (a) the queue retry mechanism already handles most stuck captures (they fail after retries and get marked `failed`), (b) the actual volume of truly stuck pending captures is near-zero in practice, (c) adding a scheduled handler is new scope -- new exports, new wrangler.toml config, new test coverage -- that is not in the success criteria. Add it to the backlog as a post-MVP item.

**5. Default sort order**

Chosen: **Newest-first** (`ORDER BY created_at DESC`) as default.
Over: Oldest-first (current KV behavior).
Why: Both ux-strategy-minion and api-design-minion agree on this. The current oldest-first order was an artifact of KV lexicographic ordering, not a deliberate UX choice. Phase 0016 decisions explicitly note: "The API contract does not promise sort order, so this can change with D1 migration." Both consumer types (MCP agents, future UI) are recency-biased.

**6. Sort parameter naming**

Chosen: **`sort` with values `created_at` and `-created_at`** (prefix `-` for descending).
Over: `sort=newest/oldest` enum (ux-strategy-minion) or `sort=created_at:desc` (software-docs-minion).
Why: The `-field` convention is standard REST (used by JSON:API, Django, many APIs). It is self-documenting and extensible -- if a second sort field is ever added, the pattern scales. Default is `-created_at` (newest first).

**7. Schema: tenants table vs. tenant_configs table**

Chosen: **Single `tenants` table** (data-minion's design) with `config` as a nullable JSON column.
Over: Separate `tenant_configs` table (iac-minion's design).
Why: The tenants table serves as both the FK parent and the config store. A nullable `config` column is simpler and avoids an unnecessary join.

**8. Foreign key enforcement**

Chosen: **Include FK constraints in DDL but do NOT enforce per-request**.
Over: Per-request `PRAGMA foreign_keys = ON` via wrapper function (data-minion).
Why: KISS. Application-level validation already ensures referential integrity. The wrapper adds ceremony with no practical benefit at this scale. FKs in the DDL serve as documentation.

**9. Audit log event names**

Chosen: **Keep existing event names unchanged** (e.g., `capture.list_fail`, `capture.kv_create_fail`).
Over: Renaming to `capture.db_fail` etc.
Why: Event names are referenced in Coralogix alert rules provisioned in Phase 0046. Changing them silently breaks alerting.

---

### Task 1: D1 schema and infrastructure configuration
- **Agent**: data-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: none
- **Approval gate**: yes
- **Gate reason**: The D1 schema (table structure, indexes, column types) is hard to reverse once data is migrated. Every downstream task depends on this schema being correct. Multiple valid approaches exist (normalized vs. denormalized, FK enforcement, index strategy).
- **Gate rationale**: |
    Chosen: Four tables (tenants, captures, api_keys, signing_keys) with typed columns for queryable fields, JSON TEXT for opaque blobs. Offset/limit pagination.
    Over: (a) Single captures table with JSON blob (loses queryability), (b) Separate tenant_configs table (unnecessary normalization), (c) Keyset pagination (more complex, no benefit at current scale).
    Why: Decomposing queryable fields into columns enables proper WHERE/ORDER BY with index coverage. Four tables map cleanly to the four KV record types. Offset/limit is simplest for the stated 10K-row ceiling.
- **Prompt**: |
    You are creating the D1 database schema and infrastructure configuration for the WRL KV-to-D1 migration.

    ## Context
    WRL currently stores all metadata (captures, tenants, API keys, signing keys) in Cloudflare KV. This migration moves metadata to D1 (Cloudflare's SQLite-at-edge database). KV is retained only for rate limit counters (`rl:*` keys).

    There are no external users -- this is a clean cutover with no backward compatibility constraints.

    ## What to do

    ### 1. Create the migration SQL file
    Create `migrations/0001_initial_schema.sql` with the following tables:

    **tenants** -- Explicit tenant registry (currently implicit in KV key prefixes).
    - `id` TEXT PRIMARY KEY with CHECK constraint matching `TENANT_ID_RE` pattern: `[a-z0-9_-]{1,64}`
    - `config` TEXT nullable (JSON: rate limit overrides, future settings)
    - `created_at` TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    - `updated_at` TEXT nullable
    - `updated_by` TEXT nullable

    **captures** -- Structured columns for queryable fields, JSON for opaque blobs.
    - `id` TEXT PRIMARY KEY with CHECK: `id GLOB 'cap_[a-f0-9]*' AND length(id) = 36`
    - `tenant_id` TEXT NOT NULL REFERENCES tenants(id)
    - `status` TEXT NOT NULL CHECK (status IN ('pending', 'complete', 'failed'))
    - `url` TEXT NOT NULL
    - `ip` TEXT nullable
    - `created_at` TEXT NOT NULL (ISO 8601)
    - `completed_at` TEXT nullable
    - `failed_at` TEXT nullable
    - `error` TEXT nullable
    - `retryable` INTEGER nullable (0/1)
    - `render_quality` TEXT nullable ('full' or 'partial')
    - `artifacts` TEXT nullable (JSON)
    - `wacz` TEXT nullable (JSON)
    - `render` TEXT nullable (JSON)
    - `capture_settings` TEXT nullable (JSON)

    Indexes on captures:
    - `idx_captures_tenant_created` ON captures(tenant_id, created_at DESC) -- primary listing query
    - `idx_captures_tenant_status_created` ON captures(tenant_id, status, created_at DESC) -- filtered listing

    **api_keys** -- Keyed by SHA-256 hash (natural PK, no auto-increment).
    - `key_hash` TEXT PRIMARY KEY with CHECK: `length(key_hash) = 64`
    - `tenant_id` TEXT NOT NULL REFERENCES tenants(id)
    - `scopes` TEXT NOT NULL (JSON array)
    - `name` TEXT NOT NULL
    - `created_at` TEXT NOT NULL
    - `created_by` TEXT NOT NULL
    - `revoked` INTEGER NOT NULL DEFAULT 0 CHECK (revoked IN (0, 1))
    - `revoked_at` TEXT nullable

    Index: `idx_api_keys_tenant` ON api_keys(tenant_id, revoked, created_at)

    **signing_keys** -- Tiny table, simple design.
    - `key_id` TEXT PRIMARY KEY with CHECK: `length(key_id) = 8`
    - `algorithm` TEXT NOT NULL DEFAULT 'Ed25519'
    - `public_key` TEXT NOT NULL
    - `archived_at` TEXT NOT NULL

    Include `PRAGMA foreign_keys = ON;` at the top of the migration for documentation (application code will not enforce per-request).

    ### 2. Update wrangler.toml
    Add D1 bindings with binding name `DB` (Cloudflare convention):

    **Production (top-level):**
    ```toml
    [[d1_databases]]
    binding = "DB"
    database_name = "wrl-metadata"
    database_id = "PLACEHOLDER_PROD"
    migrations_dir = "migrations"
    ```

    **Staging (env.staging):**
    ```toml
    [[env.staging.d1_databases]]
    binding = "DB"
    database_name = "wrl-metadata-staging"
    database_id = "PLACEHOLDER_STAGING"
    migrations_dir = "migrations"
    ```

    Use `PLACEHOLDER_PROD` and `PLACEHOLDER_STAGING` as database_id values -- these will be replaced after `wrangler d1 create` is run manually before deployment.

    Keep all existing KV bindings unchanged (rate limit counters use them).

    ### 3. Update wrangler.test.toml
    Add matching D1 binding:
    ```toml
    [[d1_databases]]
    binding = "DB"
    database_name = "wrl-metadata"
    database_id = "local-test-db"
    migrations_dir = "migrations"
    ```

    ### 4. Update vitest.config.js for D1 test support
    - Import `readD1Migrations` from `@cloudflare/vitest-pool-workers/config`
    - Read migrations from `./migrations` directory using `path.join(__dirname, 'migrations')`
    - Add `TEST_MIGRATIONS` to `miniflare.bindings`
    - Add `setupFiles: ['./test/apply-migrations.js']` to test config

    ### 5. Create test/apply-migrations.js
    Setup file that applies D1 migrations before tests:
    ```js
    import { env } from 'cloudflare:test';
    import { applyD1Migrations } from '@cloudflare/vitest-pool-workers/d1';

    await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
    ```

    ## What NOT to do
    - Do NOT create D1 databases (that is a manual step done before deployment)
    - Do NOT implement any application code changes (that is Task 2)
    - Do NOT add Cron Trigger configuration (deferred to backlog)
    - Do NOT remove any KV configuration
    - Do NOT add a `PRAGMA foreign_keys = ON` wrapper function

    ## Files to modify
    - CREATE: `migrations/0001_initial_schema.sql`
    - CREATE: `test/apply-migrations.js`
    - MODIFY: `wrangler.toml` (add D1 bindings, keep everything else)
    - MODIFY: `wrangler.test.toml` (add D1 binding)
    - MODIFY: `vitest.config.js` (add D1 migration loading and setup file)

    ## Verification
    - The migration SQL is valid SQLite syntax
    - All CHECK constraints match the validation patterns in `src/kv.js`
    - Existing tests still pass (D1 binding presence should not break KV-based tests)
    - The `migrations/` directory follows wrangler D1 conventions

- **Deliverables**: `migrations/0001_initial_schema.sql`, `test/apply-migrations.js`, updated `wrangler.toml`, `wrangler.test.toml`, `vitest.config.js`
- **Success criteria**: Schema SQL is valid; vitest config loads migrations; existing tests pass with the new binding present

---

### Task 2: D1 data access layer and application wiring
- **Agent**: data-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |
    You are replacing the KV-based data access layer with D1 (SQLite) for all WRL metadata operations.

    ## Context
    Task 1 created the D1 schema with four tables: tenants, captures, api_keys, signing_keys. The binding name is `DB` (accessed via `env.DB`). KV (`env.KV`) is retained ONLY for rate limit counters.

    ## What to do

    ### 1. Create `src/db.js` -- the D1 data access layer
    This replaces `src/kv.js` for all metadata operations. Export the same function names with the same signatures (except the first argument changes from `kv` to `db`).

    **Capture operations:**
    - `createCapture(db, captureId, url, ip, tenantId)` -- INSERT into captures table. Use `new Date().toISOString()` for created_at. Ensure tenant exists first with `INSERT OR IGNORE INTO tenants (id) VALUES (?)`. Use `db.batch()` to run both statements atomically.
    - `completeCapture(db, captureId, artifacts, wacz, renderQuality, render, captureSettings)` -- UPDATE captures SET status='complete', completed_at, artifacts (JSON.stringify for objects), wacz (JSON.stringify), render_quality, render (JSON.stringify), capture_settings (JSON.stringify). Return early if capture not found (check result.meta.changes === 0).
    - `failCapture(db, captureId, error, retryable)` -- UPDATE captures SET status='failed', failed_at, error, retryable (as 0/1 integer). Return early if capture not found.
    - `getCapture(db, captureId)` -- SELECT from captures. Transform the row back to the same camelCase shape that KV returned: `{ captureId: row.id, status, url, ip, tenantId: row.tenant_id, createdAt: row.created_at, completedAt: row.completed_at, artifacts: JSON.parse(row.artifacts), wacz: JSON.parse(row.wacz), renderQuality: row.render_quality, render: JSON.parse(row.render), captureSettings: JSON.parse(row.capture_settings), failedAt: row.failed_at, error, retryable: Boolean(row.retryable) }`. Handle null JSON columns (don't parse null).
    - `listCaptures(db, tenantId, { offset = 0, limit = 20, status, url, created_after, created_before, sort = '-created_at' })` -- Build dynamic WHERE clause. Return `{ data, pagination: { total, offset, limit, hasMore } }`.

    For `listCaptures` query building:
    - Always: `WHERE tenant_id = ?`
    - If `status`: `AND status = ?`
    - If `url` (min 4 chars enforced at HTTP layer): `AND url LIKE ? || '%'`
    - If `created_after`: `AND created_at >= ?`
    - If `created_before`: `AND created_at < ?`
    - ORDER BY: `created_at DESC` when sort is `-created_at`, `created_at ASC` when sort is `created_at`
    - `LIMIT ? OFFSET ?`
    - Run COUNT(*) query with same WHERE (no LIMIT/OFFSET) in parallel via `db.batch()`
    - `hasMore` = `offset + data.length < total`
    - Transform each row to the same camelCase shape as `getCapture`

    **Tenant configuration:**
    - `getTenantConfig(db, tenantId)` -- SELECT config FROM tenants WHERE id = ?. JSON.parse the config or return null.
    - `setTenantConfig(db, tenantId, config, updatedBy)` -- Keep the same validation logic from kv.js (rate limit value checking). UPSERT: `INSERT INTO tenants (id, config, updated_at, updated_by) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET config = excluded.config, updated_at = excluded.updated_at, updated_by = excluded.updated_by`. Return the record with updatedAt.

    **API key operations:**
    - `createApiKeyRecord(db, sha256hex, record)` -- Validate sha256hex format. Check for existing non-revoked key (SELECT). If exists, return `{ created: false, reason: 'hash_collision' }`. Otherwise ensure tenant exists (`INSERT OR IGNORE INTO tenants`), then INSERT into api_keys. Return `{ created: true }`.
    - `getApiKeyRecord(db, sha256hex)` -- SELECT from api_keys. Return same shape as KV (with parsed scopes JSON array).
    - `revokeApiKeyRecord(db, sha256hex)` -- SELECT existing, return not_found if missing, return already-revoked if revoked. Otherwise UPDATE SET revoked=1, revoked_at.
    - `listApiKeyRecords(db, { tenantId, includeRevoked })` -- SELECT with dynamic WHERE on tenant_id and revoked. Include `keyHash` field in result (mapped from key_hash column). Sort by created_at ascending.

    **Signing key operations:**
    - `archiveSigningKey(db, keyId, publicKeyBase64)` -- Keep the 32-byte validation from kv.js. INSERT OR IGNORE into signing_keys.
    - `getArchivedSigningKey(db, keyId)` -- SELECT from signing_keys.
    - `listArchivedSigningKeys(db)` -- SELECT all. Return with keyId field.

    Keep `TENANT_ID_RE` exported from db.js.

    ### 2. Reduce `src/kv.js` to rate-limit-only functions
    Remove all metadata operations. Keep ONLY:
    - `rateLimitWindowId(period)`
    - `rateLimitCounter(kv, tenantId, group, limit, period, count)`
    - `TENANT_ID_RE` -- keep this export here too (some modules may import from kv.js for it)

    Update the file header comment to reflect the reduced scope.

    ### 3. Update all call sites in application code

    **src/index.js:**
    - Change imports: metadata functions from `'./db.js'`, keep rate limit from `'./kv.js'`
    - In `handleListCaptures`:
      - Add query params: `url` (string, min 4 chars, max 200, reject if contains `%`), `created_after` (ISO 8601), `created_before` (ISO 8601, must be after created_after if both present), `sort` (enum: `created_at` or `-created_at`, default `-created_at`)
      - Replace `cursor` with `offset`: parse as integer >= 0, default 0
      - Remove cursor decode logic and invalid_cursor check
      - Call `listCaptures(env.DB, auth.tenantId, { offset, limit, status, url, created_after, created_before, sort })`
      - Response pagination now has: `{ total, offset, limit, hasMore }`
    - In all other handlers: change `env.KV` to `env.DB` for metadata calls

    **src/capture.js:**
    - Import from `'./db.js'` instead of `'./kv.js'` for createCapture, completeCapture, failCapture, archiveSigningKey
    - Change first arg from `env.KV` to `env.DB`

    **src/auth.js:**
    - Import getApiKeyRecord from `'./db.js'`
    - Change `env.KV` to `env.DB` for getApiKeyRecord calls

    **src/admin.js:**
    - Import from `'./db.js'` for API key and tenant config operations
    - Change `env.KV` to `env.DB`

    **src/mcp.js:**
    - Import from `'./db.js'` for listCaptures, getCapture
    - In `list_captures` tool: remove `cursor` from Zod schema, add optional `offset` (z.number().int().min(0)), `url` (z.string()), `created_after` (z.string()), `created_before` (z.string()), `sort` (z.enum(['created_at', '-created_at']))
    - Update tool description to mention available filters and offset pagination
    - Pass new params through to `listCaptures(env.DB, ...)`

    ### 4. Keep existing audit log event names unchanged
    Do NOT rename `capture.list_fail`, `capture.kv_create_fail`, `capture.kv_fail` etc.

    ## What NOT to do
    - Do NOT modify rate limit logic -- it stays in kv.js using env.KV
    - Do NOT add a Cron Trigger for pending capture cleanup
    - Do NOT add PRAGMA foreign_keys enforcement wrapper
    - Do NOT implement a data migration script (that is Task 3)
    - Do NOT update tests (that is Task 3)
    - Do NOT modify openapi.yaml or documentation (handled by Phase 8)

    ## Key files to read
    - `src/kv.js` -- current implementation to replicate function signatures and behavior
    - `src/index.js` -- handleListCaptures (around line 739), all handler functions
    - `src/capture.js` -- queue consumer calling completeCapture/failCapture
    - `src/auth.js` -- verifyApiKey calling getApiKeyRecord
    - `src/admin.js` -- admin key and tenant config operations
    - `src/mcp.js` -- MCP tools calling listCaptures, getCapture
    - `migrations/0001_initial_schema.sql` -- the schema from Task 1

    ## Files to create/modify
    - CREATE: `src/db.js`
    - MODIFY: `src/kv.js` (reduce to rate-limit only)
    - MODIFY: `src/index.js`, `src/capture.js`, `src/auth.js`, `src/admin.js`, `src/mcp.js`

    ## Verification
    - All kv.js metadata exports are replicated in db.js with equivalent behavior
    - kv.js contains only rate limit functions and TENANT_ID_RE
    - All call sites use env.DB for metadata and env.KV for rate limits
    - handleListCaptures supports offset, url, created_after, created_before, sort params
    - MCP list_captures tool accepts new filter parameters
    - No `cursor` references remain in application code (except possibly in comments)

- **Deliverables**: `src/db.js`, reduced `src/kv.js`, updated `src/index.js`, `src/capture.js`, `src/auth.js`, `src/admin.js`, `src/mcp.js`
- **Success criteria**: All metadata operations use D1; KV used only for rate limits; new query parameters validated and passed through

---

### Task 3: Test suite migration and data migration script
- **Agent**: test-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: Task 2
- **Approval gate**: no
- **Prompt**: |
    You are migrating the WRL test suite from KV to D1 and writing the one-time data migration script.

    ## Context
    Tasks 1 and 2 have:
    - Created the D1 schema in `migrations/0001_initial_schema.sql`
    - Created `src/db.js` replacing `src/kv.js` for all metadata operations
    - Updated all application code to use `env.DB` for metadata, `env.KV` for rate limits
    - Added D1 test infrastructure: `test/apply-migrations.js`, updated `vitest.config.js`, `wrangler.test.toml`
    - Changed pagination from cursor to offset/limit with total count
    - Added filter params: url, created_after, created_before, sort
    - Default sort is newest-first (-created_at)

    ## Part A: Test suite migration

    ### 1. Update `test/fixtures.js`
    - Change `seedApiKey` to use D1: accept `db` instead of `kv`, INSERT INTO api_keys table. Also ensure tenant exists: `INSERT OR IGNORE INTO tenants (id) VALUES (?)`
    - Add a `cleanDb` helper that truncates all metadata tables (delete in FK-safe order: captures, api_keys, signing_keys, then tenants):
      ```js
      export async function cleanDb(db) {
        await db.batch([
          db.prepare('DELETE FROM captures'),
          db.prepare('DELETE FROM api_keys'),
          db.prepare('DELETE FROM signing_keys'),
          db.prepare('DELETE FROM tenants'),
        ]);
      }
      ```
    - Add `seedCapture(db, overrides)` helper that INSERTs into captures with sensible defaults and ensures tenant exists
    - Keep `seedApiKey` backward-compatible note: the function signature changes from `(kv, rawKey, opts)` to `(db, rawKey, opts)` -- update ALL callers

    ### 2. Rename `test/kv.test.js` to `test/db.test.js`
    - Update imports from `../src/kv.js` to `../src/db.js`
    - Change function call first argument from `env.KV` to `env.DB`
    - Remove tests for KV-specific behaviors (secondary index keys, KV key prefixes)
    - Replace KV-specific assertions with D1 equivalents (verify via SELECT after operations)
    - Keep rate limit tests (`rateLimitWindowId`, `rateLimitCounter`) -- these still import from kv.js and use env.KV

    ### 3. Update `test/list-captures.test.js`
    - Update seed helpers to use D1
    - Replace `beforeEach` KV cleanup with `cleanDb(env.DB)` or direct DELETE FROM statements
    - Update pagination assertions: no more `cursor` field, instead `offset`, `total`, `hasMore`
    - Add tests for new query parameters:
      - `?url=https://example.com` prefix filter
      - `?url=abc` (< 4 chars) returns 400
      - `?created_after=<ISO>` and `?created_before=<ISO>` date range filters
      - `?sort=created_at` ascending and `?sort=-created_at` descending
      - Combined filters: `?status=complete&url=https://example.com&sort=created_at`
      - `?offset=0&limit=5` basic offset pagination
      - Verify `total` count is correct
      - Verify default sort is newest-first

    ### 4. Update `test/auth.test.js`
    - Replace KV cleanup with D1 DELETE FROM statements
    - Update `seedApiKey` calls: `env.DB` instead of `env.KV`
    - Update KV error simulation test: create equivalent D1 mock that throws on prepare/bind/first

    ### 5. Update `test/admin-keys.test.js`
    - Replace KV cleanup with D1 DELETE FROM
    - Update seedApiKey calls
    - HTTP-level tests should mostly work unchanged

    ### 6. Update all remaining test files that touch KV for metadata
    Check each of these files and update as needed:
    - `test/capture.test.js` -- createCapture, getCapture
    - `test/capture-retrieval.test.js` -- getCapture
    - `test/capture-integration.test.js` -- end-to-end capture flow
    - `test/queue-consumer.test.js` -- completeCapture, failCapture
    - `test/batch-capture.test.js` -- batch capture creation
    - `test/mcp.test.js` -- MCP tools, may have raw KV writes
    - `test/verify.test.js`, `test/verify-integration.test.js`, `test/verify-html.test.js`
    - `test/wacz.test.js`
    - `test/signing-key.test.js` -- archiveSigningKey, getArchivedSigningKey
    - `test/key-rotation.test.js` -- signing key operations
    - `test/integration/advisory.test.js`, `test/integration/capture-pipeline.test.js`

    For each file:
    - Replace `env.KV` with `env.DB` for metadata operations
    - Replace raw `env.KV.put()` calls with D1 INSERT statements or fixture helpers
    - Replace KV cleanup with `cleanDb(env.DB)` or targeted DELETE FROM
    - Keep `env.KV` references for rate limit operations only

    ### 7. Add schema verification test to `test/db.test.js`
    Verify migration creates expected tables and indexes by querying sqlite_master.

    ## Part B: Data migration script

    Create `scripts/migrate-kv-to-d1.js` -- a standalone Node.js script for one-time KV-to-D1 data migration.

    Requirements:
    1. Accept `--env production` or `--env staging` argument
    2. Read config from wrangler.toml to get KV namespace IDs and D1 database IDs
    3. Use Cloudflare REST API for KV reads and D1 writes (better error handling than CLI)
    4. Paginate through KV keys (1000 per page)
    5. Route by key prefix:
       - `tenant:*:config` -> tenants table
       - `apikey:*` -> api_keys table (also discover tenantIds)
       - `capture:*` (not secondary index keys) -> captures table
       - `signing-key:*` -> signing_keys table
       - `rl:*` -> SKIP
       - `tenant:*:ts:*` -> SKIP (secondary index keys)
    6. Bootstrap tenants first (discover all tenantIds from records)
    7. Handle pre-R8 records without tenantId: assign to 'default' tenant
    8. Batch inserts (50 rows per batch)
    9. Idempotent via INSERT OR IGNORE
    10. `--dry-run` mode: read and log without writing
    11. Progress logging per entity type

    The script is operational tooling, not production code. Prioritize clarity and comments over test coverage.

    ## What NOT to do
    - Do NOT modify application code (that was Task 2)
    - Do NOT modify the schema (that was Task 1)
    - Do NOT add EXPLAIN QUERY PLAN tests to the regular test suite
    - Do NOT change audit log event names
    - Do NOT update documentation or openapi.yaml (handled by Phase 8)

    ## Key files to read
    - `test/fixtures.js` -- current fixture helpers
    - `test/kv.test.js` -- current data layer tests
    - `test/list-captures.test.js` -- current list tests
    - `test/auth.test.js`, `test/admin-keys.test.js` -- current auth/admin tests
    - `src/db.js` -- new data access layer (from Task 2)
    - `src/kv.js` -- reduced to rate-limit only (from Task 2)
    - ALL test files listed above to determine which need updates

    ## Verification
    - `npm test` passes with zero failures
    - No remaining references to `env.KV` for metadata operations in test files
    - New filter/sort/pagination tests cover the expanded query surface
    - Migration script runs with `--dry-run` without errors

- **Deliverables**: Updated test suite (all affected test files), `scripts/migrate-kv-to-d1.js`
- **Success criteria**: All tests pass; no KV metadata references remain in tests; migration script complete and idempotent

---

### Cross-Cutting Coverage

- **Testing**: Task 3 is entirely dedicated to test migration. Phase 6 (post-execution) runs the full test suite.
- **Security**: No new attack surface. D1 queries use parameterized bindings (no SQL injection risk). The `url` filter param is bound, not interpolated. Tenant isolation enforced by `WHERE tenant_id = ?`. security-minion reviews in Phase 3.5.
- **Usability -- Strategy**: ux-strategy-minion recommendations incorporated: newest-first default sort, constrained named parameters, total count in response, progressive disclosure in MCP tool descriptions. Reviews in Phase 3.5.
- **Usability -- Design**: No UI changes. Not needed.
- **Documentation**: Phase 8 handles all documentation (openapi.yaml, README, OPERATIONS.md, CONTRIBUTING.md, mcp.md, backlog, evolution log). software-docs-minion and user-docs-minion participate in Phase 8.
- **Observability**: No new runtime components. Existing Coralogix logging unchanged. Not needed.

---

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - None selected.
- **Not selected**:
  - ux-design-minion: No user-facing interface changes.
  - accessibility-minion: No web-facing HTML/UI changes.
  - sitespeed-minion: No new web-facing runtime code. Existing API latency target covered by success criteria.
  - observability-minion: Single Worker with existing Coralogix integration. No new coordinated observability needed.
  - user-docs-minion: Documentation scope clear from plan; handled in Phase 8.

---

### Decisions

- **Offset/limit over cursor**
  Chosen: Offset/limit pagination with total count
  Over: Cursor/keyset (api-design-minion), cursor as deprecated alias (ux-strategy-minion)
  Why: Task spec requests it. Zero external users. Simpler. At 10K rows, performance identical.

- **Prefix match over substring for URL filter**
  Chosen: `LIKE url || '%'` with 4-char minimum
  Over: `LIKE '%' || url || '%'` substring (ux-strategy-minion)
  Why: Index-friendly. Common use case (domain filtering) works. Full-text search explicitly out of scope.

- **Cron Trigger deferred**
  Chosen: No Cron Trigger for pending capture cleanup
  Over: Hourly scheduled handler (data-minion)
  Why: YAGNI. Queue retries handle most stuck captures. Not in success criteria.

- **No FK enforcement per-request**
  Chosen: FKs in DDL for documentation only
  Over: Per-request PRAGMA wrapper (data-minion)
  Why: KISS. Application validation already covers it.

---

### Risks and Mitigations

1. **Test suite blast radius (~15 files)**: Mitigated by centralized `cleanDb` helper and updated fixture functions. Most tests are HTTP-level and need only import/cleanup changes.

2. **D1 eventual consistency**: Writes immediately visible to same Worker invocation. Critical path (create -> complete) is write-then-write, not cross-replica. Acceptable.

3. **Offset pagination at high offsets**: Non-issue at 10K rows. Keyset can be added additively if needed at 100K+.

4. **Pre-R8 captures without tenantId**: Migration script assigns to 'default' tenant. captures.tenant_id is NOT NULL.

5. **Pending capture TTL loss**: KV expirationTtl auto-cleaned stuck pendings. D1 has no TTL. Queue retries cover most cases. Cron Trigger deferred to backlog.

6. **LIKE with wildcard chars in URLs**: `%` rejected in url param validation. `_` wildcard has negligible impact on URL prefix matching.

---

### Execution Order

```
Batch 1 (foundation):
  Task 1: D1 schema + infrastructure config
  --> APPROVAL GATE (schema review)

Batch 2 (implementation):
  Task 2: D1 data access layer + application wiring

Batch 3 (testing + migration):
  Task 3: Test suite migration + migration script

--> Phase 3.5: Architecture review
--> Phase 5: Code review (code-review-minion, lucy, margo)
--> Phase 6: Test execution
--> Phase 8: Documentation (openapi.yaml, README, OPERATIONS.md, evolution log, backlog)
```

---

### External Skills

No external skills detected in project.

---

### Verification Steps

After all tasks complete:
1. `npm test` -- full test suite passes
2. `grep -r 'env\.KV' src/` returns only rate-limit-related hits in kv.js and rate-limits.js
3. New query params work: `GET /v1/captures?status=complete&url=https://example.com&sort=-created_at&offset=0&limit=10`
4. Pagination response includes `total`, `offset`, `limit`, `hasMore` (no `cursor`)
5. Default sort order is newest-first
6. Migration script `--dry-run` runs successfully
7. Schema has all four tables with expected indexes
