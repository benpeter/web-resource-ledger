# Outcome: D1 Migration for Metadata

## What Was Built

All WRL metadata (captures, tenants, API keys, signing keys) moved from Cloudflare KV to D1 (edge SQLite). KV is retained only for rate limit counters (`rl:*` keys). The list captures endpoint was upgraded from cursor-based to offset/limit pagination with SQL-based filtering (status, URL prefix, date range) and sorting.

## Files Changed

### Created
- `migrations/0001_initial_schema.sql` -- D1 schema: 4 tables, CHECK constraints, 3 indexes
- `src/db.js` -- Complete D1 data access layer (~496 lines), replaces src/kv.js for all metadata
- `test/db.test.js` -- D1 data layer tests (replaces test/kv.test.js)
- `test/apply-migrations.js` -- Test setup file for D1 migrations
- `scripts/migrate-kv-to-d1.js` -- One-time KV-to-D1 migration script
- `docs/evolution/0047-d1-migration-metadata/prompt.md` -- Evolution log prompt

### Modified (significant)
- `src/kv.js` -- Reduced from ~503 to ~67 lines (rate limit functions only)
- `src/index.js` -- handleListCaptures rewritten for offset/limit, new query params
- `src/capture.js`, `src/auth.js`, `src/admin.js`, `src/mcp.js`, `src/verify.js` -- Import changes KV→D1
- `openapi.yaml` -- Pagination schema, filter params, KV references updated to D1
- `vitest.config.js` -- D1 migration loading, setup file
- `wrangler.toml` -- D1 bindings for production and staging
- `wrangler.test.toml` -- D1 binding for tests
- `README.md` -- Setup instructions updated for D1
- `docs/backlog.md` -- D1 and pagination filtering marked done

### Modified (mechanical test updates)
- 20+ test files: env.KV→env.DB, KV cleanup→cleanDb/DELETE FROM, seedApiKey signature changes, capture ID fixes for D1 CHECK constraints

## What Surprised Us

1. **`@cloudflare/vitest-pool-workers/d1` doesn't exist**: The import path for `applyD1Migrations` is `cloudflare:test`, not what the task prompt specified. Fixed early in testing.

2. **Capture ID CHECK constraints broke many tests**: D1 enforces `cap_[a-f0-9]*` with length 36. Many test fixtures used IDs with non-hex characters. Required widespread test fixture updates.

3. **null vs undefined for absent JSON columns**: D1 returns `null` for absent columns; KV returned `undefined`. Test assertions needed updating from `toBeUndefined()` to `toBeFalsy()`.

4. **INSERT OR REPLACE needed for api_keys**: Plain INSERT fails when re-creating a key with the same hash (e.g., after revoking). Changed to INSERT OR REPLACE.

5. **src/verify.js was missing from the original plan**: Lucy reviewer caught this during Phase 3.5. It imports from kv.js for signing key functions and needed updating.

## Backlog Changes

- **Marked done**: D1 (edge SQLite) in Storage parking lot
- **Marked done**: Pagination filtering and sorting in API Enhancements parking lot
- **Added to parking lot**: Cron Trigger for pending capture TTL cleanup (Operations)
- **Updated**: R1 done entry noting pagination upgrade from cursor to offset/limit
- **Updated**: Dropped Items -- D1 note updated since it shipped
- **Added to Done**: R30: D1 migration for metadata
