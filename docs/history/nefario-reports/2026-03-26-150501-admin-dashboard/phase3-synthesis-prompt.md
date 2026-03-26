MODE: SYNTHESIS

You are synthesizing specialist planning contributions into a final execution plan.

## Original Task
Build an admin dashboard for operator visibility into tenant overviews, per-tenant usage, tier consumption — replacing manual D1 queries for operational awareness.

Success criteria:
- Dashboard shows: list of all tenants, per-tenant capture counts (current period and historical), tier/plan info, usage vs. limits
- Data is live from D1 (not cached snapshots)
- Protected by admin authentication
- Loads in under 2 seconds

Scope:
- In: Tenant list view, usage summary per tenant, aggregate usage overview
- Out: Tenant self-service portal, billing management, real-time streaming metrics, profitability calculations

## Specialist Contributions

Read the following scratch files for full specialist contributions:
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-wqDwHT/admin-dashboard/phase2-data-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-wqDwHT/admin-dashboard/phase2-api-design-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-wqDwHT/admin-dashboard/phase2-frontend-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-wqDwHT/admin-dashboard/phase2-security-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-wqDwHT/admin-dashboard/phase2-ux-design-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-wqDwHT/admin-dashboard/phase2-test-minion.md

## Key consensus across specialists:
- data-minion: Three new DAL functions (listTenantsWithUsage, getUsageHistory, getAggregateStats) using LEFT JOINs and scalar subqueries; no new indexes or migrations needed; "approaching limits" computed in JS app layer
- api-design-minion: Three endpoints (GET /v1/admin/tenants, GET /v1/admin/tenants/:id, GET /v1/admin/overview) each mapping to single db.batch() call; parallel client load for tenants+overview; full consistency with existing patterns
- frontend-minion: Option B — separate /admin endpoint with its own HTML shell (admin-shell.js), mirroring existing ui-shell.js pattern; sessionStorage Bearer token auth; vanilla JS with design system CSS
- security-minion: sessionStorage for admin key (tab-scoped), Bearer token auth (no CSRF concern), column-name allowlist for ORDER BY, raise rate limit to 30/60s
- ux-design-minion: Reuse existing design system primitives; three-level hierarchy (aggregate stats → tenant table → detail drill-down); wider 1100px container for admin; semantic HTML table with aria-sort; manual refresh only
- test-minion: Three test layers — DAL tests (~60%), API endpoint tests (~35%), UI tests (~5%); new seedTenantWithTier fixture helper; IP counter range at 150+

## Conflict to resolve:
- Rate limit: api-design-minion recommends 20/60s, security-minion recommends 30/60s. Resolve this.

## External Skills Context
One external skill detected: ops-runbook (LEAF, reference only — documents manual D1 queries this dashboard replaces). No execution integration needed.

## Instructions
1. Review all specialist contributions (read the full files)
2. Resolve the rate limit conflict between api-design-minion and security-minion
3. Create the final execution plan in structured format with:
   - Task list with dependencies, agent assignments, model selection (sonnet for execution), and complete self-contained prompts
   - Approval gates where needed (the meta-plan identified 2: API surface design and admin auth model)
   - Consider consolidating gates if appropriate for this scope
4. Ensure every task has a complete, self-contained prompt that an agent can execute independently
5. Key constraints from CLAUDE.md:
   - Vanilla JS only (no frameworks)
   - YAGNI/KISS philosophy
   - Fail loudly, degrade intentionally
   - <300ms uncached response time target
6. Write your complete delegation plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-wqDwHT/admin-dashboard/phase3-synthesis.md
