# Phase 0059: Scheduled Captures (Cron)

Issue: #107 (R28)

## Task Briefing

Tenants can schedule recurring captures via a cron-style API, with Cloudflare
Cron Triggers executing captures on schedule. Capture results are linked to the
originating schedule for grouping and review. Per-tenant schedule limits prevent
abuse.

## Success Criteria

- POST /v1/schedules creates a schedule with URL and cron expression
- GET /v1/schedules lists all schedules for the authenticated tenant
- DELETE /v1/schedules/{id} removes a schedule
- Minimum cron granularity is hourly (rejects sub-hour expressions)
- Cloudflare Cron Trigger invokes the Worker; Worker executes pending captures
- Capture results include scheduleId field for grouping
- Per-tenant schedule limit enforced (429 when exceeded)
- Schedule management visible in web UI
- Coralogix logs for each schedule execution

## Scope

- In: CRUD API, Cron Trigger integration, schedule-to-capture linking,
  per-tenant limits, web UI schedule panel, execution logging
- Out: Sub-hourly schedules, change detection/diff, pause/resume, schedule
  webhook events

## Constraints

- Depends on R24 (tenant identity), R26 (quotas)
- Cron Trigger is per-Worker; dispatch fans out from single trigger to
  per-tenant schedules in D1
- Scheduled captures count against tenant's capture quota
