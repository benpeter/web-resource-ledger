# Phase 0047: D1 Migration for Metadata

Source: GitHub Issue #96 — R30: D1 migration for metadata

## Task Description

**Outcome**: WRL metadata (captures, tenants, API keys) moves from KV to Cloudflare D1, enabling SQL-based queries for pagination, filtering, and sorting. This is a clean migration with no dual-write complexity since there are no external users yet. KV is retained only for rate limit counters.

**Success criteria**:
- D1 database created with schema: `captures`, `tenants`, `api_keys` tables
- All capture metadata CRUD operations read/write D1 instead of KV
- All tenant and API key operations read/write D1 instead of KV
- List queries support SQL-based pagination (offset/limit), filtering (by status, URL, date range), and sorting (by timestamp)
- KV usage reduced to rate limit counters only; all other KV namespaces removed from wrangler.toml
- Migration script moves existing KV data to D1 (one-time, run before cutover)
- List query latency <100ms at p95 for up to 10K captures
- All existing tests updated to use D1 bindings instead of KV mocks
- D1 schema managed via migration files in `migrations/` directory

**Scope**:
- In: D1 schema design, migration files, KV-to-D1 data migration script, refactor all metadata operations to D1, update test infrastructure, remove KV metadata namespaces
- Out: Dual-write/dual-read transition period, D1 backups (Cloudflare handles this), read replicas, full-text search

**Constraints**:
- D1 is in GA on Cloudflare Workers; verify current size and row limits before schema design
- Migration must be idempotent (safe to re-run)
- Foreign key constraints between tables (e.g., captures.tenant_id references tenants.id)
- Indexes on frequently queried columns: captures(tenant_id, created_at), api_keys(key_hash)
