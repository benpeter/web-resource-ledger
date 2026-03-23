---
task: "R28: Scheduled captures (cron)"
date: 2026-03-23
source-issue: 107
slug: scheduled-captures-cron
mode: execution
task-count: 6
gate-count: 2
skills-used: []
---

## Summary

Implemented scheduled captures feature (Issue #107): tenants can create
recurring capture schedules via a cron-style CRUD API, with a Cloudflare
Cron Trigger (`*/1 * * * *`) invoking a fan-out handler that queries D1
for due schedules, checks per-tenant quotas, creates capture records, and
enqueues jobs on the existing capture queue. Capture results link back to
schedules via `scheduleId`. Per-tenant schedule limits (default 10,
configurable) prevent abuse, returning 429 when exceeded. Web UI provides
schedule list, create (with preset + custom cron), and delete. 55 new
tests across 4 test files; all 1093 tests pass.

## Original Prompt

GitHub Issue #107: R28: Scheduled captures (cron)

Tenants can schedule recurring captures via a cron-style API, with
Cloudflare Cron Triggers executing captures on schedule. Capture results
are linked to the originating schedule for grouping and review.
Per-tenant schedule limits prevent abuse.

## Key Design Decisions

| Decision | Chosen | Over | Why |
|----------|--------|------|-----|
| Cron trigger interval | Every minute (`*/1 * * * *`) | Hourly, 5-minute | Prompt execution within 60s of due time |
| Capture queue | Reuse existing `wrl-captures` | Separate queue | Identical pipeline, only adds `scheduleId` field |
| Deduplication | CAS on `next_run_at` | Idempotency table, Durable Objects | Zero-infra overhead, DB does coordination |
| Cron library | `croner` (0-dep, ~6KB) | `cron-parser`, hand-rolled | Exact feature match, zero transitive deps |
| Hourly minimum check | 5-consecutive-gap enumeration | Regex field inspection | Catches all sub-hourly patterns correctly |
| Limit exceeded status | 429 | 409 (api-design-minion) | Issue spec explicitly requires 429 |
| PATCH/pause/resume | Omitted | Included in initial synthesis | Out of scope per issue; caught by lucy + margo |
| Cron UI input | Presets + custom option | Raw cron only | Reduces cognitive load for common cases |
| Usage increment | Per-chunk after sendBatch | All-or-nothing | Accurate counting on partial batch failures |

## Phases

### Phase 1: Meta-Plan

Identified 11 specialists across 5 primary domains (infrastructure, data,
API design, execution logic, frontend) and 6 cross-cutting concerns
(security, testing, observability, docs, UX strategy, UX design).

### Phase 2: Specialist Planning

All 11 agents consulted in parallel. Key contributions:

- **iac-minion**: `*/1 * * * *` cron, reuse existing queue, staging trigger config
- **data-minion**: `schedules` table with pre-computed `next_run_at`, partial indexes, `captures.schedule_id` FK
- **api-design-minion**: Webhooks CRUD pattern, `sch_` ID prefix, 429 for limits
- **ai-modeling-minion**: Fan-out flow with CAS dedup, per-tenant quota grouping, post-sendBatch usage increment
- **frontend-minion**: New `#/schedules` route, preset dropdown + custom cron input
- **security-minion**: SSRF reuse, cron lookahead cap, post-sendBatch usage ordering
- **test-minion**: 4 test files covering distinct boundaries
- **observability-minion**: 7 log event types with severity levels
- **ux-strategy-minion**: Presets reduce cognitive load, schedule list needs monitoring UX
- **ux-design-minion**: Grid layout, status badges, responsive design
- **software-docs-minion**: OpenAPI v0.7.0, docs site guide

### Phase 3: Synthesis

Consolidated into 6 tasks with 2 gates. Conflict resolution: 429 vs 409
status code (429 wins per issue spec). PATCH endpoint initially included
in synthesis.

### Phase 3.5: Architecture Review

7 reviewers (5 mandatory + 2 discretionary). Lucy and margo independently
caught scope violation: PATCH/pause/resume was in the plan but explicitly
out of issue scope. Removed before execution. `paused` column kept as
schema insurance. accessibility-minion recommended `aria-live` on cron
preview region.

Verdicts: 5 APPROVE, 2 ADVISE (lucy, margo -- scope violation).

### Phase 4: Execution

6 tasks in 3 batches:
1. Schema + db.js CRUD → Gate 1 (approved)
2. CRUD handlers + scheduler + UI (parallel) → Gate 2 (approved)
3. Tests + docs (parallel)

Bug found during testing: `rowToSchedule()` missing `tenant_id` field
caused all scheduler quota checks to fail silently.

### Phase 5: Code Review

Verdict: ADVISE (5 findings). 2 bugs fixed:
1. UI badge: `!schedule.active` → `schedule.paused`
2. Partial sendBatch: per-chunk usage tracking

3 style notes accepted as-is (tenant_id in response, verifyAuth duplication,
CRON_LABELS freeze).

### Phase 6: Test Execution

1093 tests pass (44 files). 55 new tests across 4 files. No regressions.

### Phase 7: Deployment

Skipped (not requested).

### Phase 8: Documentation

8a assessment: all MUST/SHOULD items verified (OpenAPI updated, docs site
guide created, README updated). 0 documentation debt.

## Execution

| Task | Agent | Files | Status |
|------|-------|-------|--------|
| 1. D1 schema + db.js CRUD | data-minion | migrations/0007_schedules.sql, src/db.js | Done |
| 2. Cron validation + CRUD handlers | api-design-minion | src/cron.js, src/schedules.js | Done |
| 3. Cron trigger + scheduled handler | iac-minion | src/scheduler.js, src/index.js, wrangler.toml | Done |
| 4. Web UI schedule panel | frontend-minion | src/ui/ui-schedules.js, ui-shell.js, ui-auth.js, ui-css.js, ui-detail.js, ui-submit.js | Done |
| 5. Tests | test-minion | 4 test files + fixtures | Done |
| 6. OpenAPI + docs | software-docs-minion | openapi.yaml, site/content/schedules.md, README.md | Done |

## Verification

Verification: 2 code review findings auto-fixed, all tests pass (1093).
Documentation coverage verified (OpenAPI, docs site, README).

## Agent Contributions

### Planning (Phase 2)

| Agent | Recommendation | Tasks |
|-------|---------------|-------|
| iac-minion | Every-minute cron, reuse capture queue | 1 (trigger config) |
| data-minion | Pre-computed next_run_at, partial indexes | 1 (schema design) |
| api-design-minion | Webhooks CRUD pattern, sch_ prefix | 1 (CRUD endpoints) |
| ai-modeling-minion | CAS dedup, per-tenant quota grouping | 1 (fan-out logic) |
| frontend-minion | Presets + custom cron input | 1 (UI panel) |
| security-minion | SSRF reuse, lookahead cap, usage ordering | Cross-cutting |
| test-minion | 4 test files, distinct boundaries | 1 (test suite) |
| observability-minion | 7 event types, severity levels | Cross-cutting |
| ux-strategy-minion | Presets for cognitive load, monitoring UX | Cross-cutting |
| ux-design-minion | Grid layout, badges, responsive | Cross-cutting |
| software-docs-minion | OpenAPI v0.7.0, docs guide | 1 (documentation) |

### Review (Phase 3.5)

| Reviewer | Verdict | Key Finding |
|----------|---------|-------------|
| security-minion | APPROVE | -- |
| test-minion | ADVISE | Boundary test for exactly-60-min gap |
| ux-strategy-minion | APPROVE | -- |
| lucy | ADVISE | Scope violation: PATCH/pause/resume out of scope |
| margo | ADVISE | Scope violation + verifyAuth duplication |
| ux-design-minion | APPROVE | -- |
| accessibility-minion | ADVISE | aria-live on cron preview |

## Session Resources

<details>
<summary>Skills Invoked</summary>

- `/nefario` -- full orchestration workflow

</details>

<details>
<summary>Working Files</summary>

Companion directory: `docs/history/nefario-reports/2026-03-23-145848-scheduled-captures-cron/`

Files:
- prompt.md -- original task description
- phase1-metaplan-prompt.md, phase1-metaplan.md
- phase2-*.md (11 specialist contributions)
- phase3-synthesis.md
- phase3.5-*.md (7 reviewer verdicts)
- phase5-code-review-minion.md

</details>
