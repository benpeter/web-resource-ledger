# Phase 0059: Scheduled Captures -- Process

## TL;DR

11 specialist agents planned the scheduled captures feature across 5 domains
(infra, data, API, execution logic, UI) plus cross-cutting concerns (security,
testing, observability, docs, UX). 7 architecture reviewers checked the
synthesis. Lucy and Margo caught a scope violation (PATCH/pause/resume was
in the plan but out of issue scope) that was removed before execution. 6
execution tasks produced 26 changed files and 55 new tests. Code review
found 5 issues (2 bugs, 3 style); both bugs were fixed. All 1093 tests pass.

## Phase 1: Meta-Plan

Nefario identified 5 primary specialist consultations covering the distinct
technical layers:

1. **iac-minion** -- Cron Trigger configuration and Worker `scheduled()` export
2. **data-minion** -- D1 schema for schedules table and capture linking
3. **api-design-minion** -- Schedule CRUD API design
4. **ai-modeling-minion** -- Fan-out execution logic and edge cases
5. **frontend-minion** -- Web UI schedule panel

Plus 6 cross-cutting agents: test-minion, security-minion, ux-strategy-minion,
ux-design-minion, software-docs-minion, observability-minion.

## Phase 2: Specialist Planning

All 11 agents consulted in parallel. Key arguments by domain:

### Infrastructure (iac-minion)
Recommended `*/1 * * * *` cron interval for prompt schedule execution.
Argued for reusing the existing `wrl-captures` queue rather than a separate
scheduled queue -- the capture pipeline is identical, only the message body
differs (adds `scheduleId`). Staging gets its own cron trigger in
`[env.staging.triggers]`.

### Data Model (data-minion)
Proposed `schedules` table with pre-computed `next_run_at` column (indexed)
for efficient fan-out queries. The alternative -- storing only the cron
expression and computing next-run at query time -- was rejected because D1
can't evaluate cron expressions in SQL. `captures.schedule_id` as a nullable
FK for linking. Partial indexes on both `next_run_at` (for due-schedule
queries) and `schedule_id` (for schedule-grouped capture listing).

### API Design (api-design-minion)
Followed the webhooks CRUD pattern: `POST/GET/DELETE /v1/schedules` with
`sch_` ID prefix. Recommended 409 for limit exceeded (following webhook
pattern), but the issue spec explicitly says 429. **Conflict resolution**:
429 wins because the issue is the product spec. No PATCH endpoint --
api-design-minion noted this was explicitly out of scope.

### Execution Logic (ai-modeling-minion)
Designed the fan-out flow: query due schedules → group by tenant → one
quota check per tenant (not per schedule) → create capture records →
batch enqueue → increment usage after sendBatch success. Key insight:
CAS-based deduplication via `advanceSchedule` (UPDATE with WHERE
`next_run_at = expected_value`) prevents duplicate captures when
overlapping cron ticks race.

### Frontend (frontend-minion)
Recommended a new `#/schedules` route with `ui-schedules.js` module
following existing patterns. Cron input via presets dropdown (hourly,
daily, weekly, etc.) with custom option for raw cron. Status badges
showing last capture outcome.

### Security (security-minion)
Three key recommendations: (1) URL validation must reuse `validateUrl()`
to prevent SSRF. (2) Cron expressions need a lookahead cap (2-year) to
prevent DoS via expressions that compute forever. (3) `incrementUsage`
should happen AFTER `sendBatch` succeeds, not before -- prevents charging
for failed enqueues. All three were incorporated into the execution plan.

### Testing (test-minion)
Recommended 4 test files covering the distinct boundaries: cron parsing,
schedule CRUD endpoints, limit enforcement, and the scheduled handler
fan-out. Integration tests should use `env.DB` directly (no mocks) since
the capture pipeline is queue-based and harder to test end-to-end in
vitest.

### Observability (observability-minion)
Defined 7 log event types with Coralogix severity levels: tick_empty (debug),
tick_start/execute/tick_complete (info), execute_skip (warn),
execute_fail/batch_enqueue_fail (error). Each event includes scheduleId,
tenantId, URL, and duration where applicable.

## Phase 3: Synthesis

Nefario consolidated into 6 execution tasks with 2 approval gates:

1. D1 schema + db.js CRUD (data-minion, sonnet) -- **Gate 1**
2. Cron validation + CRUD handlers (api-design-minion, sonnet)
3. Cron trigger + scheduled handler (iac-minion, sonnet)
4. Web UI panel (frontend-minion, sonnet) -- **Gate 2**
5. Tests (test-minion, sonnet)
6. OpenAPI + docs (software-docs-minion, sonnet)

The synthesis initially included a PATCH endpoint for pause/resume. This
was caught and removed during architecture review (see Phase 3.5).

## Phase 3.5: Architecture Review

7 reviewers (5 mandatory + 2 discretionary):

- **security-minion**: APPROVE. Satisfied with SSRF reuse, cron lookahead
  cap, and post-sendBatch usage increment.
- **test-minion**: ADVISE. Suggested testing the gap-check edge case for
  expressions that fire exactly every 60 minutes (boundary). Incorporated.
- **ux-strategy-minion**: APPROVE. Preset-based cron input reduces cognitive
  load. Schedule list with next-run and last-capture status gives users
  monitoring confidence.
- **lucy**: ADVISE → **scope violation caught**. The synthesis included
  PATCH/pause/resume functionality despite the issue explicitly listing
  pause/resume as out of scope. Lucy recommended removing the PATCH
  endpoint and all active/paused toggle logic from task prompts. Margo
  independently flagged the same issue.
- **margo**: ADVISE. Echoed Lucy's scope concern. Also flagged that
  `verifyAuth` was duplicated between `index.js` and `schedules.js` --
  noted as maintainability concern but not blocking.
- **ux-design-minion**: APPROVE. Schedule list grid, status badges, and
  responsive layout follow existing design system patterns.
- **accessibility-minion**: ADVISE. Recommended `aria-live="polite"` on
  the cron preview region so screen readers announce next-run time updates.
  Incorporated into the UI task prompt.

**Scope violation resolution**: Removed PATCH endpoint from Task 2 prompt.
Kept `paused` column in migration (D7 decision -- cheap schema insurance,
1 byte per row, no code paths reference it). No `active` field in API
responses. This was the most significant review intervention.

## Phase 4: Execution

6 tasks executed across 3 batches:

**Batch 1** (Task 1 → Gate 1): data-minion produced migration 0007 and
all schedule-related db.js functions. Gate approved after verifying the
schema design, index strategy, and `rowToSchedule` shape.

**Batch 2** (Tasks 2, 3, 4 in parallel → Gate 2):
- api-design-minion: CRUD handlers with auth, validation, 429 limit response
- iac-minion: wrangler.toml cron triggers + `handleScheduledTick` with
  full fan-out logic
- frontend-minion: ui-schedules.js with presets, custom cron, status badges

**Batch 3** (Tasks 5, 6 in parallel):
- test-minion: 55 tests across 4 files
- software-docs-minion: OpenAPI v0.7.0, docs site guide

### Bug discovered during testing

Task 5 (tests) revealed that `rowToSchedule()` was missing `tenant_id`
in its return object. The scheduler groups due schedules by
`schedule.tenant_id`, which was `undefined` for every schedule. Every
quota check returned "tenant not found" and no captures were ever
created by the scheduler. Fixed by adding `tenant_id: row.tenant_id` to
`rowToSchedule()`.

## Phase 5: Code Review

3 reviewers (code-review-minion, lucy, margo) examined all 26 changed files.
code-review-minion returned ADVISE with 5 findings:

1. **BUG (HIGH)**: `scheduleStatusBadge()` checked `!schedule.active` but
   API returns `paused`. Every schedule showed "Paused". Fixed.
2. **BUG (MEDIUM)**: Partial sendBatch failure (>100 messages, chunk 2 fails)
   caused usage for chunk 1 to go uncounted. Fixed with per-chunk tracking.
3. **STYLE**: `tenant_id` included in API response via `rowToSchedule` --
   minor information leak (tenant knows own ID). Noted, not fixed.
4. **STYLE**: `verifyAuth` duplicated between index.js and schedules.js.
   Noted as tech debt, not fixed (follows existing webhooks pattern).
5. **NIT**: `CRON_LABELS` map could use `Object.freeze()`. Noted, not fixed.

Lucy and margo: APPROVE (no additional findings beyond what was already
addressed in Phase 3.5).

## Phase 6: Tests

All 1093 tests pass (44 test files). No pre-existing failures. The 55 new
tests cover:
- Cron validation: sub-hourly rejection, hourly acceptance, edge cases (19 tests)
- Schedule CRUD: create/list/get/delete, auth, validation (integration tests)
- Limit enforcement: default 10, custom config, 429 response
- Scheduled handler: fan-out, quota skip, CAS dedup, batch enqueue

## What the Human Changed

This was an autonomous execution (no human at gates -- Lucy agents made
all gate decisions). No human interventions occurred during execution.

## What Was Deliberately Left Alone

- `tenant_id` in API responses -- minor, tenant already knows their own ID
- `verifyAuth` duplication -- follows established webhooks pattern, refactoring
  is a separate concern
- `paused` column in migration with no API exposure -- cheap insurance

## Where to Read More

- **Full specialist contributions**: `docs/history/nefario-reports/` companion directory
- **Synthesis plan**: scratch files in the companion directory (`phase3-synthesis.md`)
- **Code review findings**: `phase5-code-review-minion.md` in companion directory
- **Architecture review verdicts**: `phase3.5-*.md` files in companion directory
