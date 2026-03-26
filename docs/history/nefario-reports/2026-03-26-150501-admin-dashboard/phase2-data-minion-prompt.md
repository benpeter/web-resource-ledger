You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
Build an admin dashboard for operator visibility into tenant overviews, per-tenant usage, tier consumption — replacing manual D1 queries for operational awareness.

Success criteria:
- Dashboard shows: list of all tenants, per-tenant capture counts (current period and historical), tier/plan info, usage vs. limits
- Data is live from D1 (not cached snapshots)
- Protected by admin authentication
- Loads in under 2 seconds

Scope:
- In: Tenant list view, usage summary per tenant, aggregate usage overview
- Out: Tenant self-service portal, billing management, real-time streaming metrics, profitability calculations

## Your Planning Question
Given the existing D1 schema (tenants, usage_counters, captures, api_keys, github_users tables) and the ops runbook queries operators currently run manually, what aggregate queries should the admin dashboard API expose? Consider: (1) listing all tenants with their tier, billing status, and current-period usage in a single query; (2) historical usage across periods for a given tenant; (3) aggregate overview stats (total tenants, total captures this period, tenants approaching limits). What indexes may be needed? Should we add new DAL functions or compose existing ones? The existing `getUsage()` function only queries one tenant+period at a time -- should we add a bulk function?

## Context
Read these files for context:
- src/db.js (especially tenantExists, getUsage, getTenantConfig, getTenantBilling)
- D1 migrations directory listing
- src/quotas.js (FREE_CAPTURE_LIMIT, TIER_QUOTAS)

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. Return your contribution in the structured format below
5. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-wqDwHT/admin-dashboard/phase2-data-minion.md

## Domain Plan Contribution: data-minion

### Recommendations
<your expert recommendations for this aspect of the task>

### Proposed Tasks
<specific tasks that should be in the execution plan>
For each task: what to do, deliverables, dependencies

### Risks and Concerns
<things that could go wrong from your domain perspective>

### Additional Agents Needed
<any specialists not yet involved who should be, and why>
(or "None" if the current team is sufficient)
