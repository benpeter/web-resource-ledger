# Decisions: D1 Migration for Metadata

## Pagination: Offset/Limit over Cursor/Keyset

**Chosen**: Offset/limit with `total` count
**Over**: Cursor-based pagination (existing R1 implementation), keyset pagination
**Why**: Zero external users means no backward compatibility constraint. Offset/limit is simpler to implement, simpler for callers, and enables `total` count which cursor-based can't efficiently provide. The dataset size (< 10K captures) means offset performance is not a concern. Keyset was proposed by data-minion but rejected as over-engineering for the current scale.

## URL Filtering: Prefix Match over Substring/Full-Text

**Chosen**: URL prefix filter with `LIKE 'prefix%'` (index-friendly)
**Over**: Substring match (`LIKE '%term%'`), full-text search
**Why**: Prefix match uses the index efficiently (no full table scan). The primary use case is "show me captures from this domain" which prefix covers. Substring would require a full scan. Full-text search was explicitly out of scope. Minimum 4-char filter to prevent overly broad queries. Characters `%` and `_` are rejected to prevent SQL LIKE pattern injection.

## Foreign Keys: DDL-Only, No Per-Request PRAGMA

**Chosen**: FK constraints in CREATE TABLE for documentation; no PRAGMA foreign_keys = ON at runtime
**Over**: Enforcing FKs per-request via PRAGMA
**Why**: Application-layer validation already catches FK violations. D1's FK enforcement requires per-session PRAGMA which adds latency. The DDL constraints serve as documentation of data relationships. The migration SQL includes PRAGMA for migration execution only.

## Default Sort: Newest-First

**Chosen**: Default sort `-created_at` (descending, newest first)
**Over**: Oldest-first (previous KV behavior)
**Why**: Both consumers (API callers and MCP tools) are recency-biased. The old oldest-first order was a KV artifact, not a design choice. Newest-first matches user expectations.

## Tenant Auto-Creation via INSERT OR IGNORE

**Chosen**: `INSERT OR IGNORE INTO tenants` before capture insert
**Over**: Requiring explicit tenant creation, separate tenant management API
**Why**: Maintains backward compatibility with the existing flow where tenants are implicit. No tenant management API exists yet. Auto-creation keeps the migration simple -- KV never had explicit tenant records. Uses `db.batch()` for atomicity.

## API Key Upsert via INSERT OR REPLACE

**Chosen**: `INSERT OR REPLACE INTO api_keys` for key creation
**Over**: Plain `INSERT` with error handling
**Why**: When re-creating a key after revoking the previous one (same key hash), plain INSERT fails with UNIQUE constraint. INSERT OR REPLACE handles this cleanly. Discovered during test execution.

## Signing Keys Column: `id` over `key_id`

**Chosen**: Column name `id` for signing_keys primary key
**Over**: `key_id` (originally in the migration SQL)
**Why**: src/db.js already used `id` in its queries. The mismatch was caught during test execution. Using `id` is consistent with the other tables (tenants.id, captures.id).

## Migration Script: Wrangler CLI over D1 HTTP API

**Chosen**: Node.js script using `wrangler d1 execute` subprocess calls
**Over**: D1 HTTP API, direct SQL via bindings
**Why**: The migration script runs once before cutover, not at runtime. Wrangler CLI handles auth and environment targeting cleanly. No need for a Worker-based migration endpoint. INSERT OR IGNORE makes it idempotent (safe to re-run). 50-row batch size for D1 compatibility.

## Cron Trigger for Pending Capture Cleanup: Deferred

**Chosen**: Defer to parking lot
**Over**: Implementing a scheduled cleanup of stale pending captures
**Why**: Queue retries with exponential backoff handle most cases where captures get stuck. A Cron Trigger would add infrastructure complexity for an edge case. Deferred until stale pending captures accumulate beyond the queue retry window.
