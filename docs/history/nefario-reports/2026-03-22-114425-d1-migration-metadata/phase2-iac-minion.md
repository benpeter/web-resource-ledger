# Domain Plan Contribution: iac-minion

## Recommendations

### 1. D1 Database Creation Commands

Create separate databases for production and staging. Use `--location weur` for EU data locality (consistent with the existing Coralogix EU endpoint).

```bash
# Production
unset CLOUDFLARE_API_TOKEN && npx wrangler d1 create wrl-metadata --location weur

# Staging
unset CLOUDFLARE_API_TOKEN && npx wrangler d1 create wrl-metadata-staging --location weur
```

Each command outputs a `database_id` (UUID). Record these IDs immediately -- they go into `wrangler.toml`.

Note: `CLOUDFLARE_API_TOKEN` must be unset before calling wrangler per project conventions (wrangler uses its own OAuth token from `wrangler login`).

### 2. D1 Binding Configuration in wrangler.toml

The binding name should be `DB` (not `D1` -- `DB` is the Cloudflare convention and avoids confusion with the product name). The existing `KV` binding remains for rate limit counters.

**Production (top-level in wrangler.toml):**

```toml
[[d1_databases]]
binding = "DB"
database_name = "wrl-metadata"
database_id = "<UUID-from-create-command>"
migrations_dir = "migrations"
```

**Staging (env.staging section):**

```toml
[[env.staging.d1_databases]]
binding = "DB"
database_name = "wrl-metadata-staging"
database_id = "<UUID-from-staging-create-command>"
migrations_dir = "migrations"
```

**Test config (wrangler.test.toml):**

D1 bindings in `wrangler.test.toml` are **not needed** for the database itself -- miniflare creates an in-memory SQLite database automatically when it sees the binding in the main config. However, since `wrangler.test.toml` is the config loaded by vitest (it strips queue consumers), it must include the D1 binding:

```toml
[[d1_databases]]
binding = "DB"
database_name = "wrl-metadata"
database_id = "<same-production-UUID>"
migrations_dir = "migrations"
```

Miniflare will use a local SQLite for this during tests regardless of the `database_id` value, but the binding declaration is required so the `DB` binding exists in `env`.

**KV binding retention:**

The `KV` binding stays in all three configs (production, staging, test). After migration, the only KV usage is `rateLimitCounter()` and `rateLimitWindowId()` in `kv.js`. The KV namespace IDs remain unchanged. Consider renaming the binding from `KV` to `RATE_LIMIT_KV` in a follow-up to make the purpose explicit, but this is cosmetic and not blocking.

The full KV config that remains:

```toml
# Production
[[kv_namespaces]]
binding = "KV"
id = "b5cd6168cd32485dba7a90558e5fad29"
preview_id = "d7d4739a73074b9793889046e59c9323"

# Staging
[[env.staging.kv_namespaces]]
binding = "KV"
id = "ed564f8e8f4d4133aaee779e7f9e61cb"
```

No KV namespace deletion is needed -- the same namespace stores both rate limit counters and the old metadata. Old metadata keys simply age out or remain harmless. Deleting them in bulk is optional cleanup, not a requirement.

### 3. Migration File Management

D1 uses `wrangler d1 migrations` with a `migrations/` directory at the project root. Each migration is a numbered `.sql` file.

**Create the initial migration:**

```bash
unset CLOUDFLARE_API_TOKEN && npx wrangler d1 migrations create wrl-metadata "initial-schema"
```

This creates `migrations/0001_initial-schema.sql`. Write the schema SQL into this file.

**Recommended schema** (for iac-minion's perspective on the file -- data-minion should finalize column types and indexes):

```sql
-- 0001_initial-schema.sql
PRAGMA defer_foreign_keys = true;

CREATE TABLE IF NOT EXISTS captures (
  capture_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  url TEXT NOT NULL,
  ip TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  completed_at TEXT,
  failed_at TEXT,
  error TEXT,
  retryable INTEGER,
  artifacts TEXT,       -- JSON blob
  wacz TEXT,            -- JSON blob
  render_quality TEXT,
  render TEXT,          -- JSON blob
  capture_settings TEXT -- JSON blob
);

CREATE INDEX IF NOT EXISTS idx_captures_tenant_created
  ON captures(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_captures_status
  ON captures(tenant_id, status, created_at);

CREATE TABLE IF NOT EXISTS api_keys (
  key_hash TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  scopes TEXT NOT NULL,   -- JSON array
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_api_keys_tenant
  ON api_keys(tenant_id);

CREATE TABLE IF NOT EXISTS tenant_configs (
  tenant_id TEXT PRIMARY KEY,
  config TEXT NOT NULL,     -- JSON blob
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS signing_keys (
  key_id TEXT PRIMARY KEY,
  algorithm TEXT NOT NULL,
  public_key TEXT NOT NULL,
  archived_at TEXT NOT NULL
);
```

**Applying migrations:**

```bash
# Local development / testing
unset CLOUDFLARE_API_TOKEN && npx wrangler d1 migrations apply wrl-metadata --local

# Staging (remote)
unset CLOUDFLARE_API_TOKEN && npx wrangler d1 migrations apply wrl-metadata-staging --remote --env staging

# Production (remote)
unset CLOUDFLARE_API_TOKEN && npx wrangler d1 migrations apply wrl-metadata --remote
```

D1 automatically tracks applied migrations in the `d1_migrations` table. Migrations are idempotent by default -- re-running skips already-applied ones.

### 4. Vitest / Miniflare D1 Configuration

The `@cloudflare/vitest-pool-workers` package (v0.12.21, already installed) supports D1 natively. Configuration requires two changes:

**vitest.config.js changes:**

```js
import { readD1Migrations } from '@cloudflare/vitest-pool-workers/config';
import path from 'node:path';

// Inside defineWorkersConfig:
const migrationsPath = path.join(__dirname, 'migrations');
const migrations = await readD1Migrations(migrationsPath);

// Add to miniflare.bindings:
bindings: {
  // ... existing bindings ...
  TEST_MIGRATIONS: migrations,
},
```

**Test setup file** (new file, e.g. `test/apply-migrations.js`):

```js
import { env } from 'cloudflare:test';
import { applyD1Migrations } from '@cloudflare/vitest-pool-workers/d1';

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
```

Register in vitest config:

```js
test: {
  setupFiles: ['./test/apply-migrations.js'],
  // ... rest of test config
}
```

This ensures every test file starts with the D1 schema applied. The `beforeEach` cleanup in test files changes from KV deletes to `DELETE FROM captures; DELETE FROM api_keys;` etc.

### 5. KV-to-D1 Data Migration Script

**Recommendation: standalone script, not a Worker endpoint.**

Rationale:
- One-time operation, no need to keep the endpoint in the codebase
- Worker endpoints have CPU time limits (60s); the migration script can run locally against the remote D1 via wrangler
- No authentication/authorization decisions needed
- Easier to test and re-run idempotently
- wrangler provides both KV bulk-read and D1 execute commands

**Script approach** (`scripts/migrate-kv-to-d1.js`):

```bash
# Usage:
# Production:
node scripts/migrate-kv-to-d1.js --env production

# Staging:
node scripts/migrate-kv-to-d1.js --env staging
```

The script should:
1. Use `wrangler kv key list` to enumerate all keys in the KV namespace
2. Use `wrangler kv get` (or bulk read via the CF API) to fetch each value
3. Parse each key by prefix (`capture:`, `apikey:`, `tenant:*:config`, `signing-key:`)
4. Skip rate limit keys (`rl:`) and secondary index keys (`tenant:*:ts:`)
5. Transform the JSON into INSERT statements
6. Batch-execute against D1 via `wrangler d1 execute` (or use the D1 HTTP API)
7. Log counts per entity type: captures migrated, api_keys migrated, etc.
8. Be idempotent: use `INSERT OR REPLACE` so re-runs are safe

**Alternative**: Since the project has no external users yet and data volumes are small, consider skipping the migration script entirely and starting fresh. The `wrangler kv` bulk operations can be slow for large datasets, and there's no user-facing data continuity requirement. If there are fewer than ~100 captures in production, manual verification that nothing important is lost may be faster than writing and testing a migration script.

**If the migration script is built**, it should be a Node.js script using the Cloudflare REST API directly (not `wrangler` CLI subprocess calls), because:
- `wrangler kv key list` is paginated and returns at most 1000 keys per call
- `wrangler d1 execute` has a 100KB SQL statement limit
- Direct API calls give better error handling and progress reporting

### 6. Deployment Ordering

The deployment must be atomic from the Worker's perspective -- the code that reads D1 must deploy only after D1 exists and has data. Since there are no external users, this is low-risk, but the ordering still matters for staging validation.

**Sequence:**

```
Step 1: Create D1 databases
  wrangler d1 create wrl-metadata --location weur
  wrangler d1 create wrl-metadata-staging --location weur
  -> Record database_ids, update wrangler.toml + wrangler.test.toml

Step 2: Commit wrangler.toml changes + migration files + new code
  -> All changes in a single PR so the migration file, binding config,
     and D1-reading code land together

Step 3: Apply schema migrations (staging first)
  wrangler d1 migrations apply wrl-metadata-staging --remote --env staging
  wrangler d1 migrations apply wrl-metadata --remote

Step 4: Run data migration (staging first)
  node scripts/migrate-kv-to-d1.js --env staging
  -> Verify: wrangler d1 execute wrl-metadata-staging --remote --command "SELECT COUNT(*) FROM captures"
  node scripts/migrate-kv-to-d1.js --env production
  -> Verify: wrangler d1 execute wrl-metadata --remote --command "SELECT COUNT(*) FROM captures"

Step 5: Deploy updated Worker code (staging first)
  wrangler deploy --env staging
  -> Smoke test staging: create capture, list captures, verify D1 is the source
  wrangler deploy
  -> Smoke test production

Step 6: Verify (post-deploy)
  - Hit GET /v1/captures on staging + production, verify list returns D1 data
  - Create a new capture, verify it appears in D1
  - Check Coralogix for any D1-related errors
  - Verify rate limiting still works (KV counters unaffected)

Step 7: Cleanup (separate PR, after soak period)
  - Remove old KV metadata keys (optional -- they're inert)
  - Do NOT remove KV namespace from wrangler.toml (rate limit counters still use it)
  - Consider renaming KV binding from "KV" to "RATE_LIMIT_KV" for clarity
```

**Important: Steps 3 and 4 must happen BEFORE Step 5.** The new Worker code expects the D1 binding and tables to exist. If the Worker deploys before schema migration, all metadata operations will fail with binding errors.

**GitHub Actions integration:** The deploy workflow (`wrangler deploy`) already exists. The migration steps (3 and 4) are one-time manual operations and should NOT be automated in CI. Schema migrations for future changes (adding columns, indexes) can be added to the deploy workflow later if desired, but the initial migration should be manual and verified.

## Proposed Tasks

### Task 1: Create D1 Databases (Manual, pre-PR)
- Run `wrangler d1 create` for both environments
- Record database IDs
- Estimate: 5 minutes

### Task 2: Update wrangler.toml + wrangler.test.toml
- Add `[[d1_databases]]` binding to production, staging, and test configs
- Keep existing KV bindings unchanged
- Keep all rate limiter, queue, R2, and browser bindings unchanged
- Estimate: 15 minutes

### Task 3: Create migrations/ Directory and Initial Schema
- `wrangler d1 migrations create wrl-metadata "initial-schema"`
- Write the schema SQL (tables: captures, api_keys, tenant_configs, signing_keys)
- Data-minion should finalize exact column types and indexes
- Estimate: 30 minutes

### Task 4: Update vitest.config.js for D1
- Import `readD1Migrations` from `@cloudflare/vitest-pool-workers/config`
- Add TEST_MIGRATIONS binding
- Create `test/apply-migrations.js` setup file
- Verify existing tests still pass with both KV and DB bindings present
- Estimate: 30 minutes

### Task 5: Write KV-to-D1 Migration Script (If Needed)
- Standalone Node.js script using Cloudflare REST API
- Reads all KV keys by prefix, transforms to D1 INSERTs
- Idempotent via INSERT OR REPLACE
- Estimate: 1-2 hours (including testing)

### Task 6: Deploy Infrastructure (Manual, day-of)
- Apply migrations to staging, then production
- Run data migration to staging, then production
- Deploy Worker to staging, verify, then production
- Estimate: 30-45 minutes

### Task 7: Post-Migration Cleanup (Separate PR)
- Consider renaming `KV` binding to `RATE_LIMIT_KV`
- Remove dead code paths that reference old KV metadata operations
- Update documentation (evolution log, backlog)
- Estimate: 1 hour

## Risks and Concerns

### Risk 1: D1 Single-Threaded Throughput
D1 is single-threaded per database. At ~1ms per query, throughput is ~1000 queries/second. At current WRL traffic levels this is a non-issue, but if capture volume grows significantly (>100 captures/second sustained), D1 query serialization could become a bottleneck. **Mitigation**: The success criterion of "<100ms at p95 for 10K captures" is well within D1 limits. Monitor query latency in Coralogix. D1 read replicas (when available) would address read scaling.

### Risk 2: JSON Blob Columns vs. Normalized Columns
The current KV model stores artifacts, wacz, render, and captureSettings as JSON within a single value. Moving these to D1 as JSON TEXT columns preserves the current structure but forfeits SQL queryability on those fields. **Recommendation**: Keep as JSON blobs for now (YAGNI -- there's no current need to query inside these). If needed later, D1 supports `json_extract()` for SQLite JSON functions.

### Risk 3: Test Suite Breakage Scope
Every test file that uses `env.KV` for metadata operations (not rate limiting) must be updated. Based on the grep, this affects at minimum: `kv.test.js`, `admin-keys.test.js`, `auth.test.js`, `capture.test.js`, `list-captures.test.js`, `capture-integration.test.js`, `capture-retrieval.test.js`, `queue-consumer.test.js`, `mcp.test.js`, `verify.test.js`, `verify-integration.test.js`, `key-rotation.test.js`. That's ~12-15 test files. The `beforeEach` cleanup pattern changes from KV key deletion to SQL `DELETE FROM` statements. **Mitigation**: The data layer abstraction in `kv.js` means most test files only need the function signatures to stay the same; the internal implementation changes are in one file.

### Risk 4: wrangler.test.toml Synchronization
`wrangler.test.toml` is described as "auto-generated from wrangler.toml" but is actually manually maintained (it strips queue consumers). Adding D1 bindings requires updating both files. If they drift, tests will fail with missing binding errors. **Mitigation**: Add a comment in both files cross-referencing each other. Consider a script that generates `wrangler.test.toml` from `wrangler.toml` by stripping `[[queues.consumers]]` sections.

### Risk 5: Migration Script Complexity vs. Fresh Start
If there are fewer than ~50 captures in production, writing a robust migration script (with pagination, error handling, idempotency) may not be worth the effort. **Recommendation**: Count existing KV records first (`wrangler kv key list --namespace-id <id> | wc -l`) and decide based on volume. If low, consider a fresh start with explicit acknowledgment that old captures won't be queryable via the API (they remain in KV for direct access if needed).

### Risk 6: D1 Billing for INIT Phase
As of August 2025, Lambda INIT is billed. D1 does not have this concern -- there are no cold start costs for D1 itself. However, the Worker's D1 queries during the INIT phase (if any module-level code runs queries) would count as billed rows. **Mitigation**: Ensure all D1 queries are in request handlers, not at module load time. The current codebase already follows this pattern.

### Risk 7: Concurrent Writes During Queue Processing
The queue consumer calls `completeCapture()` and `failCapture()` which currently do read-modify-write on KV. D1 supports transactions, which is actually an improvement -- the read-modify-write can be atomic. **Recommendation**: Use D1 transactions (`db.batch()`) for status transitions to prevent race conditions that were theoretically possible with KV's eventual consistency.

## Additional Agents Needed

### data-minion (Required)
Should finalize the D1 schema design: exact column types, index strategy, whether to use foreign keys (D1/SQLite supports them but they add overhead), and the query patterns for pagination/filtering/sorting that replace the current KV list+filter approach.

### test-minion (Recommended)
The test suite changes are extensive (~12-15 files). Test-minion should plan the test migration strategy: which tests need D1, which still need KV (rate limiting), and whether to introduce a test helper for D1 cleanup similar to the current KV cleanup patterns.

### No other specialists needed.
The application code refactoring (changing `kv.js` to use `env.DB` instead of `env.KV` for metadata) is implementation work within the existing codebase, not a separate domain concern.
