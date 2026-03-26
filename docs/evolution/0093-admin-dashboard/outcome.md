# Phase 0093: Admin Dashboard -- Outcome

## What was built

An operator-facing admin dashboard at `GET /admin` that replaces manual D1
queries for tenant and usage visibility. Three API endpoints provide the data;
a vanilla JS SPA with two views (tenant list + tenant detail) renders it.

### New files

| File | Purpose | Lines |
|------|---------|-------|
| `src/admin-dashboard.js` | API handlers for 3 dashboard endpoints | ~210 |
| `src/admin/admin-shell.js` | HTML shell factory (CSP, inline CSS/JS) | ~125 |
| `src/admin/admin-auth.js` | Login gate, sessionStorage auth, adminFetch wrapper | ~290 |
| `src/admin/admin-css.js` | Admin-specific CSS using design system tokens | ~280 |
| `src/admin/admin-tenants.js` | Tenant list view: stats cards, sortable table, overview | ~375 |
| `src/admin/admin-detail.js` | Per-tenant detail: usage history, keys, config, usage bar | ~365 |
| `test/admin-dashboard.test.js` | DAL + API + security tests (43 tests) | ~650 |
| `test/ui-admin.test.js` | HTML structure and security header tests | ~120 |

### Modified files

| File | Change |
|------|--------|
| `src/db.js` | +3 DAL functions: `listTenantsWithUsage`, `getTenantDetail`, `getOverviewStats` |
| `src/index.js` | +4 routes (3 API + 1 HTML shell), imports |
| `src/rate-limits.js` | Admin rate limit raised from 5 to 30 req/60s |
| `src/admin.js` | Comment updated to reflect new rate limit |
| `wrangler.toml` | ADMIN_RATE_LIMITER limit 5→30 (production + staging) |
| `wrangler.test.toml` | ADMIN_RATE_LIMITER limit synced to 30 |
| `test/fixtures.js` | +`seedTenantWithTier` helper, `eidasCaptureCount` param |
| `openapi.yaml` | +3 endpoint specs, admin tag updated, rate limit docs updated |

### API endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/v1/admin/tenants` | List all tenants with current-period usage |
| GET | `/v1/admin/tenants/:id` | Tenant detail with usage history and keys |
| GET | `/v1/admin/overview` | Platform-wide aggregate stats |
| GET | `/admin` | Admin dashboard HTML shell |

### Key metrics

- Tests: 63 files, 1634 passed, 0 failed
- New tests: 43 (DAL) + ~120 lines UI = comprehensive coverage
- No new dependencies
- No schema changes or migrations needed

## Success criteria assessment

| Criterion | Status |
|-----------|--------|
| Tenant list with capture counts, tier, usage vs. limits | Done: list view with stat cards, sortable table, quota bars |
| Data live from D1 | Done: all queries hit env.DB directly, Cache-Control: private, no-store |
| Admin authentication | Done: ADMIN_KEY Bearer token, sessionStorage login gate |
| Loads in under 2 seconds | Design-level: db.batch() single round-trip, Promise.all parallel fetch; runtime verification pending production deploy |

## Deviations from plan

1. **totalStorageBytes renamed**: Code review caught that the SQL scoped storage
   to the current period, but the name implied all-time. Renamed to
   `currentPeriodStorageBytes` across all layers.
2. **keyHashPrefix fixed**: Frontend referenced a non-existent `keyHashPrefix`
   field. Fixed to use `keyHash.slice(0, 8)`.
3. **quota.captures → quota.capturesPerMonth**: margo caught a frontend bug
   where the usage progress bar would never render due to wrong field name.

## Surface consistency

| Surface | Action |
|---------|--------|
| OpenAPI spec | Updated: 3 new endpoints, admin tag description, rate limit docs (5→30) |
| Docs site | No update needed: docs don't reference admin rate limit numbers directly |
| Landing page | No update needed: no admin functionality mentioned |
| MCP server | No update needed: admin endpoints should not be exposed as MCP tools |
| Legal pages | No update needed: no new data collection or third-party integrations |

## Backlog changes

- Added to Done section: Admin dashboard (Issue #203, Phase 0093)
- No new parking lot items: all deferred items (profitability calculations,
  tenant self-service) were explicitly out of scope from the start and don't
  need separate tracking
