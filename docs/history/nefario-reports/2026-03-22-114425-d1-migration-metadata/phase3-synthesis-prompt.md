MODE: SYNTHESIS

You are synthesizing specialist planning contributions into a final execution plan.

## Original Task
WRL metadata (captures, tenants, API keys) moves from KV to Cloudflare D1, enabling SQL-based queries for pagination, filtering, and sorting. Clean migration with no dual-write complexity since there are no external users yet. KV retained only for rate limit counters.

Success criteria:
- D1 database created with schema: captures, tenants, api_keys tables
- All capture metadata CRUD operations read/write D1 instead of KV
- All tenant and API key operations read/write D1 instead of KV
- List queries support SQL-based pagination (offset/limit), filtering (by status, URL, date range), and sorting (by timestamp)
- KV usage reduced to rate limit counters only; all other KV namespaces removed from wrangler.toml
- Migration script moves existing KV data to D1 (one-time, run before cutover)
- List query latency <100ms at p95 for up to 10K captures
- All existing tests updated to use D1 bindings instead of KV mocks
- D1 schema managed via migration files in migrations/ directory

## Specialist Contributions

Read the following scratch files for full specialist contributions:
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-MPY0Rl/d1-migration-for-metadata/phase2-data-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-MPY0Rl/d1-migration-for-metadata/phase2-iac-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-MPY0Rl/d1-migration-for-metadata/phase2-test-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-MPY0Rl/d1-migration-for-metadata/phase2-api-design-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-MPY0Rl/d1-migration-for-metadata/phase2-ux-strategy-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-MPY0Rl/d1-migration-for-metadata/phase2-software-docs-minion.md

## Key consensus across specialists:

### data-minion
Recommendation: Four tables (tenants, captures, api_keys, signing_keys) with covering indexes; replace KV expirationTtl with Cron Trigger for stale capture cleanup; offset/limit pagination.
Tasks: 4 — schema DDL migration file; idempotent data migration script; src/db.js replacing kv.js; Cron Trigger for pending capture TTL
Risks: PRAGMA foreign_keys not persistent per-connection; pre-R8 records without tenantId; offset degradation beyond 100K
Conflicts: Recommends offset/limit; api-design-minion recommends keyset/cursor

### iac-minion
Recommendation: Add [[d1_databases]] with binding DB to all config files; keep KV bindings for rate limits; standalone Node.js migration script via REST API.
Tasks: 3 — wrangler.toml D1 binding config; migration script; deployment sequence documentation
Risks: Test suite breakage scope (12-15 files); wrangler.test.toml sync drift; consider fresh start if data volume low

### test-minion
Recommendation: Use readD1Migrations + applyD1Migrations via setup file; cleanup simplifies to DELETE FROM; keep isolatedStorage false; do NOT add EXPLAIN QUERY PLAN tests.
Tasks: 4 — test config changes; db.test.js replacing kv.test.js; expanded list-captures tests; update fixtures
Risks: Blast radius across 12+ test files; raw env.KV.put() calls in tests bypassing data layer

### api-design-minion
Recommendation: Keep cursor-based pagination (keyset under the hood); add url prefix filter, created_after/created_before, sort param; skip admin keys pagination; detect old KV cursors gracefully.
Tasks: 3 — API contract definition; cursor encoding change; sort+filter implementation
Risks: Sort direction interaction with cursor; old KV cursors won't decode
Conflicts: Recommends cursor/keyset; ux-strategy recommends offset/limit

### ux-strategy-minion
Recommendation: Constrained named parameters; 6 params (status, url substring, created_after/before, sort, limit, offset); replace cursor with offset; add total count; flip default sort to newest-first.
Tasks: 2 — parameter design; response envelope changes
Risks: LIKE '%term%' won't scale past 100K; offset deep-page ceiling
Conflicts: Recommends offset replacing cursor; api-design-minion recommends keeping cursor

### software-docs-minion
Recommendation: 8 docs need updating (openapi.yaml most critical), 2 new docs needed; OpenAPI must be updated design-first.
Tasks: 9 — openapi.yaml, README, OPERATIONS.md, CONTRIBUTING.md, migration runbook, evolution log, audit log event names
Risks: OpenAPI divergence; audit log event name changes breaking Coralogix alerts

## Key Conflicts to Resolve

1. **Pagination model**: api-design-minion recommends keeping cursor/keyset; ux-strategy-minion recommends replacing with offset/limit; data-minion recommends offset/limit. The issue spec says offset/limit. There are no external users yet.

2. **URL filtering**: api-design-minion says prefix match (index-friendly LIKE 'term%'); ux-strategy-minion says substring match (LIKE '%term%'). Different trade-offs for performance vs recall.

3. **Total count**: ux-strategy-minion wants total in response envelope; api-design-minion didn't mention it.

4. **Cron Trigger**: data-minion proposes Cron Trigger for pending capture TTL cleanup (replacing KV expirationTtl). This is new scope not in the original issue.

## External Skills Context
No external skills detected.

## Instructions
1. Review all specialist contributions (READ the full files)
2. Resolve the conflicts above with clear rationale
3. Incorporate risks and concerns into the plan
4. Create the final execution plan in structured format with complete, self-contained task prompts
5. Every task must have a specific agent assignment, model selection (sonnet for execution, opus for complex design), and mode
6. Include approval gates where specified
7. Write your complete delegation plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-MPY0Rl/d1-migration-for-metadata/phase3-synthesis.md

IMPORTANT: The project follows YAGNI and KISS principles. Do not over-engineer. Keep the number of tasks minimal. The Cron Trigger for pending capture TTL may be out of scope -- evaluate carefully.
