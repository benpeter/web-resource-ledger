MODE: META-PLAN

You are creating a meta-plan — a plan for who should help plan.

## Task

Tenants can schedule recurring captures via a cron-style API, with Cloudflare Cron Triggers executing captures on schedule. Capture results are linked to the originating schedule for grouping and review. Per-tenant schedule limits prevent abuse.

**Success criteria**:
- POST /v1/schedules creates a schedule with URL and cron expression; returns schedule ID
- GET /v1/schedules lists all schedules for the authenticated tenant with next-run time
- DELETE /v1/schedules/{id} removes a schedule
- Minimum cron granularity is hourly (rejects sub-hour expressions)
- Cloudflare Cron Trigger invokes the Worker on schedule; Worker executes pending captures
- Capture results include `scheduleId` field for grouping in list responses
- Per-tenant schedule limit enforced (e.g., 10 for free users, configurable for paying tenants); exceeded limit returns 429 with clear message
- Schedule management visible in web UI (schedule list, create, delete)
- Coralogix logs for each schedule execution: scheduleId, URL, outcome, duration

**Scope**:
- In: CRUD API for schedule management, Cron Trigger integration, schedule-to-capture linking, per-tenant limits, web UI schedule panel, execution logging
- Out: Sub-hourly schedules, change detection / diff between scheduled captures, schedule pause/resume, schedule-specific webhook events

**Constraints**:
- Depends on R24 (tenant identity) for tenant-scoped schedule ownership
- Depends on R26 (quotas) for per-tenant schedule limit enforcement
- Cron Trigger configuration is per-Worker; schedule dispatch must fan out from a single trigger to per-tenant schedules stored in D1
- Each scheduled capture counts against the tenant's capture quota

## Working Directory

/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/indexed-beaming-plum

## Codebase Context

This is a Cloudflare Worker project (vanilla JS, no frameworks) with:
- D1 database for metadata (6 migrations so far)
- R2 for capture artifact storage
- KV for rate limit counters
- Queue-based capture processing (wrl-captures queue + DLQ)
- Existing route pattern: regex routes in index.js, handlers in separate modules
- Web UI: vanilla JS SPA at /ui with modules in src/ui/
- Auth: dual-mode (session cookie for UI + API key for programmatic access)
- Quotas: usage-based billing via Stripe, free tier with capture limits
- Webhooks: CRUD API + queue-based delivery (existing pattern to follow)
- No `scheduled()` handler exists yet -- needs to be added to the Worker export
- wrangler.toml has queue producers/consumers, rate limiters, browser binding

## External Skill Discovery

No external skills discovered in .claude/skills/ or .skills/.

## Instructions

1. Read relevant files to understand the codebase context
2. No external skills to discover
3. Analyze the task against your delegation table
4. Identify which specialists should be CONSULTED FOR PLANNING (not execution — planning). These are agents whose domain expertise is needed to create a good plan.
5. For each specialist, write a specific planning question that draws on their unique expertise.
6. Return the meta-plan in the structured format.
7. Write your complete meta-plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-jtBqwi/scheduled-captures-cron/phase1-metaplan.md
