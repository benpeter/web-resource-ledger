# Meta-Plan: D1 Migration for Metadata

## Context Summary

WRL is a Cloudflare Worker that captures, signs, and verifies web resources. All metadata (captures, API keys, tenant config, signing key archive) is currently stored in a single KV namespace accessed through `src/kv.js`. The migration moves metadata to Cloudflare D1 (edge SQLite), keeping KV only for rate limit counters.

### Current KV Usage (from codebase analysis)

**Data domains in KV (moving to D1):**
- `capture:{captureId}` -- capture lifecycle records (pending/complete/failed)
- `tenant:{tenantId}:ts:{ISO}:{captureId}` -- secondary index for tenant-scoped listing
- `apikey:{sha256hex}` -- API key records (auth, admin)
- `tenant:{tenantId}:config` -- tenant configuration (rate limit overrides)
- `signing-key:{keyId}` -- archived signing keys

**Data staying in KV:**
- `rl:{tenantId}:{group}:{windowId}` -- rate limit sliding window counters (TTL-based, ephemeral)

### Integration surface (files touching `env.KV`)
- `src/kv.js` -- all KV access functions (503 lines, 18 exported functions)
- `src/index.js` -- 17 call sites passing `env.KV` to kv.js functions
- `src/admin.js` -- 5 call sites (API key CRUD)
- `src/auth.js` -- 3 call sites (key lookup, legacy fallback)
- `src/mcp.js` -- 7 call sites (capture CRUD, rate limits, verify)
- `src/capture.js` -- 3 call sites (failCapture, archiveSigningKey, completeCapture)

### Test infrastructure
- Tests use `@cloudflare/vitest-pool-workers` with miniflare
- `wrangler.test.toml` configures KV namespace for tests
- `vitest.config.js` sets up miniflare bindings
- `isolatedStorage: false` due to R2 SQLite WAL file issues
- ~37 test files; `test/kv.test.js` and `test/list-captures.test.js` are most affected

---

## Planning Consultations

### Consultation 1: D1 Schema and Query Design
- **Agent**: data-minion
- **Planning question**: Design the D1 schema for four tables (`captures`, `api_keys`, `tenants`, `signing_keys`) that replaces the current KV data model. Key considerations: (1) The `captures` table must support SQL-based pagination (offset/limit), filtering (by status, URL pattern, date range), and sorting (by created_at) with target <100ms at 10K rows. (2) The `api_keys` table is keyed by SHA-256 hex hash and needs efficient lookup by hash plus listing by tenant with revocation filter. (3) Foreign key relationships: captures.tenant_id -> tenants.id, api_keys.tenant_id -> tenants.id. (4) D1 is SQLite-based -- verify which SQLite features are available (e.g., JSON functions, partial indexes, UPSERT). (5) Design the migration file structure and idempotent migration script for moving existing KV data to D1. (6) The current KV `listCaptures` uses cursor-based pagination with overfetch-and-filter for status; the D1 version should use proper WHERE clauses. Index design for: captures(tenant_id, created_at), captures(tenant_id, status, created_at), api_keys(key_hash).
- **Context to provide**: `src/kv.js` (full file -- current data model and access patterns), `wrangler.toml` (current bindings), the KV key prefix registry comments, the backlog entry noting "Pagination filtering and sorting require D1"
- **Why this agent**: Database schema design is the foundational decision that all other tasks depend on. Wrong indexes or table structure would cascade through every query.

### Consultation 2: Infrastructure Configuration
- **Agent**: iac-minion
- **Planning question**: What is the wrangler.toml configuration needed for D1 bindings (production + staging + test), and what is the deployment sequence? Specifically: (1) D1 database creation commands for production and staging. (2) `[[d1_databases]]` binding configuration in wrangler.toml (production, env.staging, and wrangler.test.toml). (3) Migration file management -- D1 supports `wrangler d1 migrations` with a `migrations/` directory. (4) The KV namespace binding must remain for rate limit counters -- what's the minimal KV config after migration? (5) The one-time KV-to-D1 data migration script: should it be a standalone script that reads KV via wrangler and writes to D1, or a Worker endpoint? (6) Deployment ordering: create D1 databases -> apply schema migrations -> run data migration -> deploy updated Worker code -> verify -> remove unused KV metadata.
- **Context to provide**: `wrangler.toml`, `wrangler.test.toml`, `vitest.config.js`, current staging/production environment setup
- **Why this agent**: Infrastructure configuration and deployment sequencing are this agent's core domain. The D1 binding setup and migration tooling require specific Cloudflare knowledge.

### Consultation 3: Test Infrastructure Adaptation
- **Agent**: test-minion
- **Planning question**: How should the test infrastructure adapt from KV mocks to D1 bindings? Specifically: (1) miniflare supports D1 -- what changes are needed in `vitest.config.js` and `wrangler.test.toml` to configure D1 for tests? (2) Current tests use `env.KV.delete()` / `env.KV.list()` for cleanup in `beforeEach` -- what's the D1 equivalent (DELETE FROM tables? PRAGMA reset?)? (3) The `test/kv.test.js` file tests the data layer directly -- it should become `test/db.test.js` testing D1 queries. (4) `test/list-captures.test.js` tests the HTTP endpoint including pagination/filtering -- these tests should be expanded to cover SQL-based filtering/sorting. (5) `test/admin-keys.test.js` and `test/auth.test.js` test API key operations -- what changes for D1? (6) `isolatedStorage: false` is currently set due to R2 WAL issues -- does D1 change this? (7) Should we add SQL-specific tests (e.g., verifying index usage via EXPLAIN QUERY PLAN)?
- **Context to provide**: `vitest.config.js`, `wrangler.test.toml`, `test/kv.test.js`, `test/list-captures.test.js`, `test/auth.test.js`
- **Why this agent**: Test infrastructure changes are as complex as the production code changes. Getting the D1 test setup wrong would block all development.

### Consultation 4: API Layer Refactoring Strategy
- **Agent**: api-design-minion
- **Planning question**: The list captures endpoint currently returns `{ data: [...], pagination: { cursor, hasMore, limit } }`. Moving to D1 enables offset/limit pagination, filtering by multiple fields, and sorting. (1) Should the API add `offset`/`limit` query params alongside or replacing the current `cursor`? The task spec says offset/limit, but cursor is already shipped. (2) What new query params should be supported: `status`, `url` (prefix or contains?), `created_after`/`created_before` (date range), `sort` (field + direction)? (3) The admin keys list endpoint has no pagination -- should D1 migration add it? (4) Are there any API contract changes that would be breaking for existing consumers (the MCP server reuses `listCaptures` internally)?
- **Context to provide**: `src/index.js` handleListCaptures function, `src/mcp.js` list_captures tool, current API response shapes, OpenAPI spec if present
- **Why this agent**: API contract decisions affect consumers (MCP server, future web UI). Getting pagination semantics right before implementation prevents breaking changes.

---

## Cross-Cutting Checklist

- **Testing**: INCLUDED -- test-minion consulted above (Consultation 3). Test infrastructure fundamentally changes from KV to D1 bindings. Every test file touching `env.KV` needs adaptation.
- **Security**: NOT included for planning. The migration is a storage backend swap with no new attack surface. Auth flows (API key lookup) move from KV.get to D1 SELECT but the trust model is identical. The D1 SQL queries use parameterized statements (no SQL injection risk). Security-minion will review in Phase 3.5 (mandatory reviewer) -- SQL injection defense, tenant isolation in queries, and timing characteristics of D1 vs KV lookups.
- **Usability -- Strategy**: INCLUDED as mandatory. Planning question for ux-strategy-minion: The list captures API gains SQL-based filtering, sorting, and offset/limit pagination. From a user journey perspective, what query capabilities matter most for the two primary consumers (MCP tool callers and future web UI)? Should the API expose full SQL flexibility or constrained filter presets? Does the pagination model change (cursor -> offset/limit) create cognitive load for existing consumers?
- **Usability -- Design**: NOT included for planning. No UI is being built in this phase. The web UI (R17) is a future backlog item that will consume these APIs.
- **Documentation**: INCLUDED as mandatory. Planning question for software-docs-minion: This migration changes the data architecture from KV to D1. What documentation artifacts need updating? Candidates: (1) ARCHITECTURE.md or equivalent if it exists, (2) API documentation for new query params, (3) OPERATIONS.md for D1 management commands, (4) migration runbook for the one-time data move.
- **Observability**: NOT included for planning. The Worker already has structured logging via Coralogix. D1 queries will use the same `log()` function. D1 provides built-in query metrics in the Cloudflare dashboard. No new observability infrastructure is needed. observability-minion will review in Phase 3.5 if discretionary review is warranted (query latency logging for D1 operations).

---

## Notable Exclusions

- **security-minion**: Excluded from planning because this is a storage backend swap, not a new auth or trust surface. SQL injection is mitigated by D1's parameterized query API. Will participate as mandatory reviewer in Phase 3.5.
- **mcp-minion**: Excluded because the MCP server (`src/mcp.js`) calls the same kv.js functions as the HTTP API. Refactoring kv.js to use D1 automatically updates MCP. No protocol-level changes needed.
- **observability-minion**: Excluded because existing Coralogix logging infrastructure covers the new D1 operations. D1 provides built-in dashboard metrics. No new observability stack changes needed.

---

## Anticipated Approval Gates

1. **D1 Schema Design** (MUST gate) -- The table schemas, indexes, and migration files are hard to reverse once data is written. All downstream tasks (refactoring kv.js, test infrastructure, data migration) depend on this. High blast radius, hard to reverse.

2. **API Contract Changes** (MUST gate) -- If the list endpoint pagination model changes (cursor -> offset/limit, new filter params), this affects the MCP server and any future consumers. API contracts are hard to reverse once shipped.

3. **Execution Plan Approval** (standard gate) -- Before any code is written, the full delegation plan needs approval.

---

## Rationale

The five planning consultations cover the critical decision axes of this migration:

- **data-minion** designs the schema -- the foundation everything else builds on. Wrong indexes or table structure cascade through every query.
- **iac-minion** handles the Cloudflare-specific D1 setup -- binding configuration, migration tooling, and deployment sequencing. This is non-trivial Cloudflare platform knowledge.
- **test-minion** handles the test infrastructure adaptation -- the project has comprehensive tests using miniflare's KV, and switching to D1 requires understanding miniflare's D1 support.
- **api-design-minion** resolves the API contract question -- cursor vs offset/limit pagination and new filter params affect the public API surface.
- **ux-strategy-minion** (mandatory) ensures the new query capabilities serve real user needs rather than exposing SQL flexibility for its own sake.
- **software-docs-minion** (mandatory) identifies which documentation artifacts need updating.

The agents NOT consulted for planning (security-minion, mcp-minion, observability-minion, edge-minion, frontend-minion, etc.) are either covered by Phase 3.5 mandatory review or have no domain relevance to a storage backend migration.

---

## Scope

**In scope:**
- D1 schema design (4 tables: captures, tenants, api_keys, signing_keys)
- Migration files in `migrations/` directory
- One-time KV-to-D1 data migration script (idempotent)
- Refactor `src/kv.js` to use D1 instead of KV (rename to `src/db.js`)
- Update all call sites in index.js, admin.js, auth.js, mcp.js, capture.js
- Update wrangler.toml (production + staging) and wrangler.test.toml for D1 bindings
- Retain KV binding for rate limit counters only
- Remove unused KV metadata operations
- Update all affected tests to use D1
- Add SQL-based pagination, filtering, and sorting to list captures
- Update API documentation for new query capabilities

**Out of scope:**
- Dual-write/dual-read transition period (clean cutover, no external users)
- D1 backups (Cloudflare handles this)
- Read replicas
- Full-text search
- Web UI (R17 is a separate backlog item)
- Changes to R2 storage (artifacts stay in R2)

---

## External Skill Integration

No external skills detected in project.
