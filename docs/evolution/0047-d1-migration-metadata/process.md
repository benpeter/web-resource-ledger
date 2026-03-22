# Process: D1 Migration for Metadata

**TL;DR**: Six specialists planned the KV-to-D1 migration over 3 planning phases, producing a 3-task execution plan. The main conflict was pagination model (offset vs keyset) — resolved by simplicity and zero external users. Five mandatory reviewers approved without blocking. Execution required two context compactions and significant test fixture rework due to D1's CHECK constraint enforcement. 703 tests passing, 38 files changed, +2720/-1804 lines.

## Team Composition

### Planning Specialists (Phase 2)
- **data-minion** — schema design lead. Proposed keyset pagination initially, pivoted to offset/limit after api-design-minion's argument that zero users = no backward compat concern. Designed covering indexes, CHECK constraints mirroring existing validation patterns, and the `db.batch()` pattern for atomic count+query.
- **api-design-minion** — pagination and filtering design. Strongest voice for offset/limit, argued that cursor pagination was a premature scalability optimization for < 10K records. Proposed the URL prefix filter, date range params, and sort parameter syntax.
- **security-minion** — SQL injection prevention. Insisted on parameterized queries throughout (no string interpolation), LIKE pattern sanitization (rejecting `%` and `_` in URL filter), and minimum 4-char filter length.
- **iac-minion** — infrastructure configuration. Detailed the wrangler.toml D1 bindings, migration directory conventions, and test infrastructure setup. Also proposed a Cron Trigger for stale pending capture cleanup.
- **test-minion** — test infrastructure migration strategy. Planned the vitest D1 setup, migration loading via `readD1Migrations`, and the test cleanup pattern (`cleanDb` helper with FK-safe delete order).
- **ux-strategy-minion** — API consumer experience. Contributed filtering ergonomics feedback and validated the sort parameter design.

Additionally, **software-docs-minion** was consulted but contributed primarily to documentation scope (OpenAPI updates, README changes).

### Reviewers (Phase 3.5)
All 5 mandatory reviewers participated:
- **lucy** — caught two issues: (1) src/verify.js was missing from Task 2's scope (it imports signing key functions from kv.js), and (2) the migration SQL comment said "Do not add PRAGMA here" but line 9 had the PRAGMA. Both incorporated.
- **margo** — approved the scope as minimal. Flagged the Cron Trigger proposal from iac-minion as YAGNI, which was already being deferred.
- **security-minion** — confirmed parameterized query approach, no blocking concerns.
- **test-minion** — approved test migration strategy.
- **ux-strategy-minion** — approved API design, no journey coherence concerns.

## Key Conflicts and Resolutions

### Pagination Model: Offset/Limit vs Keyset
- **data-minion** initially recommended keyset pagination (`WHERE created_at < ?`) for scalability.
- **api-design-minion** argued offset/limit was appropriate: zero external users, dataset under 10K, and offset enables `total` count which keyset cannot efficiently provide.
- **Resolution**: Offset/limit chosen. The "no external users" argument was decisive — there's no backward compatibility constraint, and the dataset size doesn't warrant the complexity of keyset.

### Cron Trigger for Stale Pending Captures
- **iac-minion** proposed a Cron Trigger to clean up pending captures that never complete.
- **margo** flagged as YAGNI — queue retries with exponential backoff already handle this.
- **Resolution**: Deferred to parking lot. Queue retries cover the common case; Cron adds infrastructure for an edge case.

### Foreign Key Enforcement Strategy
- **data-minion** included FKs in DDL but noted D1 requires per-session PRAGMA for enforcement.
- **security-minion** preferred runtime enforcement.
- **Resolution**: FKs in DDL for documentation only. Application validation already prevents FK violations. Per-request PRAGMA adds latency with no practical benefit.

## Human Interventions

This ran in autonomous mode (no human operator). Lucy agent served as the gate decision-maker at all approval points. Lucy approved:
- Team composition (6 specialists)
- Reviewer list (5 mandatory, no discretionary)
- Execution plan (3 tasks, 1 gate)
- Task 1 gate deliverable

## What Was Deliberately Left Alone

- **KV rate limit infrastructure** — kept entirely as-is. The migration scope was metadata-only; rate limiting stays on KV.
- **Audit log event names** — unchanged despite the storage layer change. Coralogix alert rules depend on specific event strings.
- **R2 storage** — not touched. Binary artifact storage (WACZ bundles, screenshots) remains on R2.

## Execution Observations

### Context Compaction Impact
Two compaction events occurred during the session. The first (post-Phase 3.5) was clean — the execution plan was preserved. The second (mid-Phase 4) caused some Phase 5 code review detail to be lost. The code review agents were spawned but their results arrived after compaction had reduced the context. No blocking findings were identified in the partial results visible pre-compaction.

### CHECK Constraint Cascade
D1's CHECK constraints on capture IDs (`cap_[a-f0-9]*` with length 36) triggered a cascade of test fixture updates. Many test files used IDs like `cap_test123` or `cap_abc` that contained non-hex characters or were the wrong length. This was anticipated by test-minion but the scope was larger than expected — touching 20+ test files for ID format compliance.

### Import Path Discovery
The task prompt specified `@cloudflare/vitest-pool-workers/d1` as the import path for `applyD1Migrations`. This module doesn't exist in v0.12.21. The correct import is from `cloudflare:test`. Caught during the first test run.

### null vs undefined Semantic Shift
KV's `JSON.parse(await kv.get(key))` returns `undefined` for absent fields. D1's row-to-object mapping returns `null`. This caused assertion failures across test files that checked `toBeUndefined()`. Fixed by using `toBeFalsy()` or explicit `toBeNull()`.

## Where to Read More

- **Specialist contributions**: `docs/history/nefario-reports/2026-03-22-114425-d1-migration-metadata/phase2-*.md`
- **Synthesis (full execution plan)**: `docs/history/nefario-reports/2026-03-22-114425-d1-migration-metadata/phase3-synthesis.md`
- **Review verdicts**: `docs/history/nefario-reports/2026-03-22-114425-d1-migration-metadata/phase3.5-*.md`
- **Evolution log decisions**: `docs/evolution/0047-d1-migration-metadata/decisions.md`
- **Evolution log outcome**: `docs/evolution/0047-d1-migration-metadata/outcome.md`
