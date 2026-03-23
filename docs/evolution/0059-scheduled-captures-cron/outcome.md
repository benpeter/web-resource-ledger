# Phase 0059: Scheduled Captures -- Outcome

## What Was Built

Full scheduled captures feature: tenants can create recurring capture
schedules via a cron-style API. A Cloudflare Cron Trigger fires every
minute, the Worker queries D1 for due schedules, checks per-tenant quotas,
creates capture records, and enqueues jobs on the existing capture queue.
Results are linked back to schedules via `scheduleId`.

### New Files

| File | Purpose |
|------|---------|
| `migrations/0007_schedules.sql` | D1 schema: `schedules` table, `captures.schedule_id` FK, partial indexes |
| `src/cron.js` | Cron validation (hourly minimum, 2-year lookahead) and next-run computation via `croner` |
| `src/schedules.js` | CRUD HTTP handlers: POST/GET/DELETE /v1/schedules with auth and limit enforcement |
| `src/scheduler.js` | `handleScheduledTick()` -- cron-triggered fan-out: query due → group by tenant → check quota → enqueue |
| `src/ui/ui-schedules.js` | Web UI: schedule list, create form (presets + custom cron), delete, status badges |
| `site/content/schedules.md` | Docs site guide for scheduled captures |
| `test/cron-parse.test.js` | 19 tests for cron validation and next-run computation |
| `test/schedule-crud.test.js` | POST/GET/DELETE endpoint integration tests |
| `test/schedule-limits.test.js` | Per-tenant limit enforcement tests |
| `test/scheduled-handler.test.js` | Scheduled handler fan-out, quota skip, CAS tests |

### Modified Files

| File | Change |
|------|--------|
| `src/db.js` | Schedule CRUD functions, `createCapture` scheduleId param, `listCaptures` schedule_id filter |
| `src/index.js` | 4 schedule routes, `scheduled()` export, scheduleId in capture message handling |
| `src/ui/ui-shell.js` | `#/schedules` route |
| `src/ui/ui-auth.js` | Schedules nav link |
| `src/ui/ui-css.js` | Schedule-specific CSS |
| `src/ui/ui-detail.js` | scheduleId in capture detail |
| `src/ui/ui-submit.js` | "Scheduled" label on scheduled captures |
| `wrangler.toml` | Cron triggers: `*/1 * * * *` (prod + staging) |
| `wrangler.test.toml` | Regenerated without consumers/triggers |
| `openapi.yaml` | v0.7.0: Schedule schemas, 4 paths, scheduleId on captures |
| `package.json` | Added `croner` dependency |
| `README.md` | Roadmap update |
| `test/fixtures.js` | Schedule test helpers |
| `test/list-captures.test.js` | schedule_id filter tests |
| `test/capture-retrieval.test.js` | scheduleId linkage test |

### Numbers

- **7 commits** on the feature branch
- **55 new tests** (4 test files), 1093 total tests passing
- **1 new dependency**: `croner` (0-dep, ~6KB)
- **26 files changed** vs main

## Success Criteria Verification

| Criterion | Status |
|-----------|--------|
| POST /v1/schedules creates schedule with URL + cron | Done |
| GET /v1/schedules lists with next-run time | Done |
| DELETE /v1/schedules/{id} removes schedule | Done |
| Hourly minimum granularity enforced | Done (5-consecutive-gap check) |
| Cron Trigger invokes Worker, Worker fans out | Done (`*/1 * * * *`, `handleScheduledTick`) |
| Capture results include `scheduleId` | Done (list + detail responses) |
| Per-tenant limit enforced, 429 on exceeded | Done (default 10, configurable) |
| Web UI schedule panel | Done (list, create, delete) |
| Coralogix logs per execution | Done (7 event types with scheduleId, URL, outcome, duration) |

## Issues and Surprises

1. **`rowToSchedule` missing `tenant_id`**: The initial implementation of
   `rowToSchedule()` in `db.js` didn't include `tenant_id` in the returned
   object. This caused every scheduler quota check to fail silently because
   the grouping code read `schedule.tenant_id` as `undefined`. Caught during
   test execution (Task 5), fixed immediately.

2. **UI badge checking wrong field**: `scheduleStatusBadge()` checked
   `!schedule.active` but the API returns `paused` (boolean), not `active`.
   Since `schedule.active` was always `undefined`, every schedule showed
   "Paused". Caught in Phase 5 code review, fixed to `schedule.paused`.

3. **Partial sendBatch under-counting**: When >100 messages are queued, they
   send in chunks of 100. The original code only incremented usage after ALL
   chunks succeeded. If chunk 2 failed, usage for chunk 1's successful sends
   went uncounted. Fixed by tracking sent count per-chunk and incrementing
   proportionally.

## Backlog Changes

- **Marked done**: `[consider] Scheduled captures (cron-style)` in Product Features
- **New parking lot items**:
  - `[consider] Schedule pause/resume (PATCH endpoint)` -- schema supports it (`paused` column), no API exposure yet
  - `[consider] Schedule-specific webhook events` -- beyond capture.complete/failed; when schedule monitoring is requested
  - `[consider] Change detection between scheduled captures` -- diff/comparison; when a user requests it
