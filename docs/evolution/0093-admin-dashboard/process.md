# Phase 0093: Admin Dashboard -- Process

## TL;DR

Seven specialists planned an admin dashboard to replace manual D1 queries.
The team argued about rate limits (20 vs 30/60s), standalone vs embedded
getUsageHistory, and whether to add a dedicated auth-check endpoint. Synthesis
resolved all three in favor of simplicity. Six execution tasks produced ~2,400
lines of new code across 8 new files and 8 modified files. Three code reviewers
found and fixed a field-name bug, a naming inconsistency, and a dead-code
reference. All 1,634 tests pass. PR #239.

## Phase 1: Meta-Plan

Nefario analyzed the task and identified seven specialists across four domains:

**Primary domains**: data-minion (D1 queries), api-design-minion (REST surface),
frontend-minion (vanilla JS SPA), security-minion (admin auth model).

**Cross-cutting**: ux-design-minion (visual hierarchy), test-minion (DAL and
endpoint test strategy), ux-strategy-minion (jobs-to-be-done analysis).

Notable exclusions: oauth-minion (admin uses static key, not OAuth),
observability-minion (read-only dashboard, existing logging patterns),
edge-minion (no caching -- admin responses are no-store).

One external skill discovered: ops-runbook (the manual D1 queries this
dashboard replaces). Treated as reference material, not an execution
dependency.

## Phase 2: Specialist Planning

All seven specialists ran in parallel. Key arguments:

**data-minion** proposed three DAL functions using LEFT JOINs and correlated
subqueries. Argued that no new indexes were needed because the existing
composite PK on usage_counters (tenant_id, period) already covers the query
patterns. Also proposed a standalone `getUsageHistory(db, tenantId, limit)`
function for reuse.

**api-design-minion** proposed three endpoints mapping 1:1 to the DAL
functions. Recommended the client make parallel requests for overview + tenants
to meet the 2s load target. Suggested 20 req/60s rate limit.

**security-minion** recommended sessionStorage for admin key (tab-scoped, no
CSRF), column-name allowlist for ORDER BY (to prevent SQL injection via sort
parameters), and 30 req/60s rate limit. Argued 20 was too tight: a page load
makes 2 parallel requests, and during incident triage an operator might
refresh several times in quick succession.

**frontend-minion** argued for Option B (separate /admin shell) over Option A
(admin views inside /ui). The auth models diverge -- /ui uses session auth or
API key dual auth, /admin uses a static infrastructure secret. Embedding admin
in /ui would require mixing two auth models in the same SPA.

**ux-design-minion** proposed auto-fit grid for stat cards, `::after`-based
sort indicators on table headers, and a wider 1100px admin container (vs the
standard 900px).

**ux-strategy-minion** identified three operator workflows: daily health check
(overview stats → tenant scan), incident investigation (specific tenant →
usage history + keys), and periodic review (month-over-month trends). Argued
for three-level hierarchy: overview → list → detail.

**test-minion** proposed a 60/35/5 test split: DAL tests (~60% of test effort),
API endpoint tests (~35%), UI structure tests (~5%). Recommended new fixture
helpers for multi-tenant scenarios with tier configuration.

## Phase 3: Synthesis

### Conflicts resolved

**Rate limit (20 vs 30/60s)**: Resolved in favor of 30/60s. The admin key
has ~256 bits of entropy -- brute-force is not the threat. 20/60s would allow
only 10 page loads per minute, which is tight during incident triage.

**Standalone getUsageHistory**: Dropped per YAGNI. Usage history is only ever
fetched as part of tenant detail -- embedding it in getTenantDetail's
db.batch() call avoids a dead function.

**Auth validation endpoint**: The frontend needs to validate the admin key
before showing the dashboard. api-design-minion suggested a dedicated ping
endpoint. Synthesis chose GET /v1/admin/overview instead -- it returns data
the first page load needs anyway, and a 401 doubles as auth rejection.

**Column sort**: Client-side only. The tenant list is small (tens, not
thousands). Server-side sort would require an ORDER BY parameter with SQL
injection surface -- security-minion's column-name allowlist becomes
unnecessary.

### Consolidated execution plan

Six tasks with dependencies:
1. DAL functions in db.js (no dependencies)
2. API handlers + rate limit change (depends on 1)
3. wrangler.test.toml sync (depends on 2)
4. Frontend files (depends on 2 for API shape)
5. Tests (depends on 1, 2, 4)
6. Test run (depends on 5)

## Phase 3.5: Architecture Review

Three reviewers ran in parallel: gru, lucy, margo.

**gru**: APPROVE. No technology radar concerns.

**lucy**: APPROVE with one ADVISE. Noted that the authentication model
(sessionStorage Bearer token) is appropriate but should include a comment
documenting the trade-off. This was incorporated.

**margo**: APPROVE with two ADVISEs. (1) Standalone getUsageHistory would be
dead code -- already dropped in synthesis. (2) ADMIN_CACHE constant duplicated
in admin.js and admin-dashboard.js -- acknowledged but not worth extracting
(2 usages, different modules).

## Phase 4: Execution

Six tasks executed in sequence (dependency chain):

1. **DAL functions** (data-minion, sonnet): Added listTenantsWithUsage,
   getTenantDetail, getOverviewStats to src/db.js. Single commit.

2. **API handlers** (api-design-minion, sonnet): Created src/admin-dashboard.js,
   modified src/index.js with 4 new routes, raised rate limit 5→30 in
   rate-limits.js and wrangler.toml.

3. **wrangler.test.toml sync**: Initially used a Python script to regenerate
   from wrangler.toml -- it replaced `database_id = "local-test-db"` with the
   real production D1 ID. Reverted and did a targeted line edit instead.

4. **Frontend** (frontend-minion, sonnet): Created 5 files in src/admin/.
   HTML shell, auth gate, CSS, tenant list view, detail view.

5. **Tests** (test-minion, sonnet): 43 DAL/API tests in admin-dashboard.test.js,
   ~120 lines UI tests in ui-admin.test.js. New seedTenantWithTier fixture.

6. **Test run**: All 1,634 tests passed (63 files).

## Phase 5: Code Review

Three reviewers ran in parallel:

**margo**: ADVISE. Found `quota.captures` bug in admin-detail.js -- the
usage progress bar would never render because the API returns
`quota.capturesPerMonth`, not `quota.captures`. **Fixed** with replace_all
edit across 3 occurrences.

**code-review-minion**: ADVISE. Two findings: (1) `totalStorageBytes` in
getOverviewStats is period-scoped but named as if all-time -- **fixed** by
renaming to `currentPeriodStorageBytes` across DAL, API, frontend, tests.
(2) `keyHashPrefix` fallback in admin-detail.js references a field that
doesn't exist in getTenantDetail return shape -- **fixed** to use
`keyHash.slice(0, 8)`.

**lucy**: APPROVE. Comprehensive traceability matrix confirmed all 8
requirements covered. CLAUDE.md compliance verified across all 7 principles.
One finding (F1: keyHashPrefix, same as code-review-minion's) already
addressed.

## Phase 6: Test Execution

Post-fix test run: 63 files, 1,634 passed, 0 failed. ~41s runtime.

## Phase 8: Documentation

**OpenAPI spec**: Three new endpoint specifications added to openapi.yaml.
Admin tag description updated. All admin rate limit references updated
5→30/60s. `npm run lint:api` passes (12 pre-existing warnings, 0 errors).

**Other surfaces**: Docs site, landing page, MCP server, legal pages
evaluated -- no updates needed (admin dashboard is operator-internal).

## Human interventions

This was an autonomous orchestration (no human at the gates). Lucy agents
made all gate decisions. No human overrides.

## Where to read more

- Full specialist contributions: `docs/history/nefario-reports/` (companion
  directory copied from scratch at wrap-up)
- Phase 0093 decisions: `docs/evolution/0093-admin-dashboard/decisions.md`
- Phase 0093 outcomes: `docs/evolution/0093-admin-dashboard/outcome.md`
- PR: benpeter/web-resource-ledger#239
