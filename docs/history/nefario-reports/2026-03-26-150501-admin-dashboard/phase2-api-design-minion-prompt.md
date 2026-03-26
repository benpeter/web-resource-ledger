You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
Build an admin dashboard for operator visibility into tenant overviews, per-tenant usage, tier consumption — replacing manual D1 queries for operational awareness.

Success criteria:
- Dashboard shows: list of all tenants, per-tenant capture counts (current period and historical), tier/plan info, usage vs. limits
- Data is live from D1 (not cached snapshots)
- Protected by admin authentication
- Loads in under 2 seconds

## Your Planning Question
What REST endpoints should the admin dashboard expose? The existing admin API has `/v1/admin/keys`, `/v1/admin/usage?tenant=X&period=Y`, `/v1/admin/cache/purge`, and `/v1/admin/tenants/:id/config`. The dashboard needs: (1) a tenant list with usage and billing info (possibly a single enriched list endpoint), (2) per-tenant detail/history, (3) aggregate overview stats. Should these be separate endpoints or a single enriched `/v1/admin/tenants` endpoint with query params? How does this fit the existing API style (RFC 7807 problem responses, `Cache-Control: private, no-store`)? Consider the <2s load time requirement and whether the UI should make one or parallel requests.

## Context
Read these files for context:
- src/admin.js
- src/responses.js
- src/index.js (route table)
- Existing admin auth pattern

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. Return your contribution in the structured format below
5. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-wqDwHT/admin-dashboard/phase2-api-design-minion.md

## Domain Plan Contribution: api-design-minion

### Recommendations
### Proposed Tasks
### Risks and Concerns
### Additional Agents Needed
