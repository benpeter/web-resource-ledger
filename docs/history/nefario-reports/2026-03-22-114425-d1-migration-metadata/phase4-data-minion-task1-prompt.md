You are creating the D1 database schema and infrastructure configuration for the WRL KV-to-D1 migration.

## Context
WRL currently stores all metadata (captures, tenants, API keys, signing keys) in Cloudflare KV. This migration moves metadata to D1 (Cloudflare's SQLite-at-edge database). KV is retained only for rate limit counters (rl:* keys).

There are no external users -- this is a clean cutover with no backward compatibility constraints.

## What to do

### 1. Create the migration SQL file
Create `migrations/0001_initial_schema.sql` with the following tables:

**tenants** -- Explicit tenant registry (currently implicit in KV key prefixes).
- `id` TEXT PRIMARY KEY with CHECK constraint matching TENANT_ID_RE pattern: `[a-z0-9_-]{1,64}`
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

Include `PRAGMA foreign_keys = ON;` at the top of the migration for documentation.

### 2. Update wrangler.toml
Add D1 bindings with binding name `DB`:

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

Use PLACEHOLDER_PROD and PLACEHOLDER_STAGING as database_id values -- these will be replaced after `wrangler d1 create` is run manually before deployment.

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
- Do NOT create D1 databases (manual step before deployment)
- Do NOT implement any application code changes (Task 2)
- Do NOT add Cron Trigger configuration (deferred)
- Do NOT remove any KV configuration
- Do NOT add a PRAGMA foreign_keys = ON wrapper function

## Files to modify
- CREATE: `migrations/0001_initial_schema.sql`
- CREATE: `test/apply-migrations.js`
- MODIFY: `wrangler.toml` (add D1 bindings, keep everything else)
- MODIFY: `wrangler.test.toml` (add D1 binding)
- MODIFY: `vitest.config.js` (add D1 migration loading and setup file)

## Verification
- The migration SQL is valid SQLite syntax
- All CHECK constraints match the validation patterns in src/kv.js
- The migrations/ directory follows wrangler D1 conventions

When you finish, report: file paths with change scope and line counts, 1-2 sentence summary, and the approach you chose with any alternatives you rejected.
