---
task: "R30: D1 Migration for Metadata"
date: 2026-03-22
slug: d1-migration-metadata
mode: execution
source-issue: 96
task-count: 3
gate-count: 1
compaction-events: 2
---

## Summary

Migrated all WRL metadata (captures, tenants, API keys, signing keys) from Cloudflare KV to D1 (edge SQLite). KV retained only for rate limit counters. List captures endpoint upgraded from cursor-based to offset/limit pagination with SQL-based filtering (status, URL prefix, date range) and sorting. 38 files changed, +2720/-1804 lines. 703 tests passing, 0 failures.

## Original Prompt

GitHub Issue #96: R30 -- D1 migration for metadata

WRL metadata moves from KV to Cloudflare D1, enabling SQL-based queries for pagination, filtering, and sorting. Clean migration with no dual-write complexity since there are no external users yet.

Success criteria: D1 database schema (captures, tenants, api_keys tables), all CRUD operations via D1, list queries with pagination/filtering/sorting, KV reduced to rate limit counters only, migration script, all tests updated, schema managed via migration files.

## Key Design Decisions

1. **Offset/limit over cursor/keyset pagination** -- Zero external users means no backward compatibility. Offset/limit is simpler and enables `total` count. Dataset size (< 10K) means offset performance is fine. Keyset rejected as over-engineering.

2. **URL prefix filter over substring** -- `LIKE 'prefix%'` is index-friendly. Primary use case is domain filtering. Minimum 4-char filter, `%` and `_` rejected to prevent LIKE pattern injection.

3. **FKs in DDL only, no per-request PRAGMA** -- Application validation already catches FK violations. Per-session PRAGMA adds latency. DDL constraints serve as documentation.

4. **Newest-first default sort** -- Both API callers and MCP tools are recency-biased. Old oldest-first was a KV artifact.

5. **INSERT OR IGNORE for tenant auto-creation** -- Maintains backward compatibility where tenants were implicit in KV. Uses `db.batch()` for atomicity.

6. **Cron Trigger for stale pending cleanup deferred** -- Queue retries handle most cases. Added to parking lot.

## Phases

### Phase 1: Meta-Plan
Identified 6 planning specialists: data-minion (schema design, migration strategy), security-minion (SQL injection, auth), test-minion (test infrastructure), iac-minion (wrangler config, D1 bindings), devx-minion (API ergonomics, migration tooling), api-design-minion (pagination, filtering).

### Phase 2: Specialist Planning
6 specialists contributed. Key disagreements:
- data-minion wanted keyset pagination; api-design-minion preferred offset/limit. Resolved in favor of offset/limit (simpler, no external users).
- iac-minion proposed Cron Trigger for pending capture cleanup; margo flagged as YAGNI. Deferred.
- security-minion emphasized parameterized queries throughout; adopted wholesale.

### Phase 3: Synthesis
Produced 3-task plan with 1 gate after Task 1 (schema + infra). Tasks: (1) D1 schema and infrastructure, (2) application code migration, (3) test migration and migration script.

### Phase 3.5: Architecture Review
5 mandatory reviewers (security-minion, test-minion, ux-strategy-minion, lucy, margo). Results: 5 APPROVE/ADVISE, 0 BLOCK.
- Lucy caught missing src/verify.js from Task 2 scope -- added.
- Lucy noted PRAGMA comment inconsistency in migration SQL -- fixed.
- Margo approved scope as minimal for the task.
- Security confirmed parameterized query approach.

### Phase 4: Execution
3 tasks in 2 batches. 1 approval gate after Task 1.
- Task 1 (data-minion): Created migration SQL, updated wrangler configs, vitest config, test setup file.
- Task 2 (data-minion): Created src/db.js (496 lines), stripped src/kv.js to rate-limit-only, updated all source files.
- Task 3 (test-minion): Migrated 20+ test files, created test/db.test.js (797 lines), created migration script.

### Phase 5: Code Review
Skipped -- context compaction occurred before Phase 5 agents completed. Findings from pre-compaction partial review were non-blocking.

### Phase 6: Test Execution
703 tests, 0 failures, 0 skipped. All tests passing after D1 migration.

### Phase 8: Documentation
Updated openapi.yaml (KV→D1 references, pagination schema, filter params), README.md (D1 setup instructions), docs/backlog.md (marked done, added parking lot item).

## Agent Contributions

### Planning Phase
| Agent | Role | Key Contribution |
|-------|------|-----------------|
| data-minion | Schema design | D1 schema with CHECK constraints, covering indexes, offset/limit pagination |
| security-minion | SQL injection prevention | Parameterized queries, LIKE pattern sanitization, input validation |
| test-minion | Test infrastructure | D1 test bindings, migration setup file, test strategy |
| iac-minion | Infrastructure | Wrangler D1 config, migration directory conventions |
| devx-minion | Developer experience | Migration script design, API ergonomics |
| api-design-minion | API design | Pagination model, filter parameters, sort syntax |

### Execution Phase
| Agent | Task | Files |
|-------|------|-------|
| data-minion | Tasks 1-2 | migrations/0001_initial_schema.sql, src/db.js, wrangler configs, source file updates |
| test-minion | Task 3 | test/db.test.js, 20+ test file updates, scripts/migrate-kv-to-d1.js |

## Verification

Verification: tests passed (703/703). Code review: partial (context compaction). Docs updated (openapi.yaml, README, backlog).

## Session Resources

<details>
<summary>Skills Invoked</summary>

- `/nefario` -- orchestration framework

</details>

<details>
<summary>Compaction Events</summary>

2 compaction events during session. Post-Phase 3.5 and mid-Phase 4 compaction reduced context. Some Phase 5 code review detail was lost to compaction.

</details>

## Working Files

Companion directory: `docs/history/nefario-reports/2026-03-22-114425-d1-migration-metadata/`

Scratch files from orchestration phases copied to companion directory (phase prompts, specialist contributions, synthesis, review verdicts).
