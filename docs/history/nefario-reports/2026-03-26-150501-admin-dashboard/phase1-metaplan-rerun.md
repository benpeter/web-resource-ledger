## Meta-Plan (Revised)

**Task**: Build an admin dashboard for operator visibility into tenant overviews, per-tenant usage, tier consumption — replacing manual D1 queries.

**Adjustment**: Removed ux-strategy-minion (disproportionate for single-user admin dashboard) and software-docs-minion (docs are implementation-phase work). Team reduced from 8 to 6 specialists.

### Planning Consultations

#### Consultation 1: Admin Dashboard Data Model & API Design
- **Agent**: data-minion
- **Planning question**: Given the existing D1 schema (tenants, usage_counters, captures, api_keys, github_users tables) and the ops runbook queries operators currently run manually, what aggregate queries should the admin dashboard API expose? Consider: (1) listing all tenants with their tier, billing status, and current-period usage in a single query; (2) historical usage across periods for a given tenant; (3) aggregate overview stats (total tenants, total captures this period, tenants approaching limits). What indexes may be needed? Should we add new DAL functions or compose existing ones? The existing `getUsage()` function only queries one tenant+period at a time -- should we add a bulk function?
- **Context to provide**: `src/db.js` (especially tenantExists, getUsage, getTenantConfig, getTenantBilling), D1 migrations directory listing, `src/quotas.js` (FREE_CAPTURE_LIMIT, TIER_QUOTAS), ops-runbook SKILL.md (the manual queries section)

#### Consultation 2: Admin API Endpoint Design
- **Agent**: api-design-minion
- **Planning question**: What REST endpoints should the admin dashboard expose? The existing admin API has `/v1/admin/keys`, `/v1/admin/usage?tenant=X&period=Y`, `/v1/admin/cache/purge`, and `/v1/admin/tenants/:id/config`. The dashboard needs: (1) a tenant list with usage and billing info (possibly a single enriched list endpoint), (2) per-tenant detail/history, (3) aggregate overview stats. Should these be separate endpoints or a single enriched `/v1/admin/tenants` endpoint with query params? How does this fit the existing API style (RFC 7807 problem responses, `Cache-Control: private, no-store`)? Consider the <2s load time requirement and whether the UI should make one or parallel requests.
- **Context to provide**: `src/admin.js`, `src/responses.js`, route table from `src/index.js`, existing admin auth pattern

#### Consultation 3: Frontend Architecture
- **Agent**: frontend-minion
- **Planning question**: The existing WRL web UI is a vanilla JS SPA with hash routing, design system CSS tokens, and modular view files. The admin dashboard needs a separate entry point (operators are not regular users). How should the admin UI be structured? Options: (A) a new route within the existing `/ui` SPA (gated by admin auth), (B) a separate `/admin` endpoint serving its own HTML shell, (C) a new section in the existing shell with admin-only nav. Consider: admin auth uses `verifyAdminKey` (Bearer token), not session cookies. The existing UI uses session auth or API key dual auth. Must use vanilla JS (no frameworks), reuse the design system, and load in <2s.
- **Context to provide**: `src/ui/ui-shell.js`, `src/design-system.css`, route table from `src/index.js`, auth patterns

#### Consultation 4: Security Model
- **Agent**: security-minion
- **Planning question**: The admin dashboard exposes tenant data via new endpoints. Current admin auth is a single infrastructure secret (`ADMIN_KEY`) via timing-safe comparison. For the dashboard UI: (1) How should the admin authenticate in the browser -- prompt for the key and store in sessionStorage? (2) Is CSRF a concern with Bearer-token auth (no cookies)? (3) Any query injection risks given prepared statements? (4) Should the admin rate limit (5 req/60s) be raised for a dashboard making multiple parallel requests on page load?
- **Context to provide**: `src/auth.js`, `wrangler.toml` rate limiter config, `src/index.js` admin auth flow

#### Consultation 5: UI Visual Design
- **Agent**: ux-design-minion
- **Planning question**: The admin dashboard needs tables (tenant list, usage data) and summary statistics (aggregate overview). The project has an existing design system with CSS tokens. What visual patterns should the dashboard follow for tables, stat cards, and any drill-down interactions? How should the information hierarchy work within the existing design system constraints? The dashboard must be readable/usable on desktop (no mobile requirement for admin tools).
- **Context to provide**: `src/design-system.css`, existing UI views in `src/ui/`

#### Consultation 6: Test Strategy
- **Agent**: test-minion
- **Planning question**: The project uses `@cloudflare/vitest-pool-workers` with real D1 in tests. New DAL functions will include aggregate queries with JOINs. New admin API endpoints need auth + response shape testing. What test strategy should we follow? Should aggregate query tests use seed data? How should the admin UI be tested (if at all -- it's vanilla JS served from the worker)?
- **Context to provide**: existing test files, `vitest.config.ts`, test helper patterns

### Cross-Cutting Checklist
- **Testing**: Included as Consultation 6
- **Security**: Included as Consultation 4
- **Usability -- Design**: Included as Consultation 5

### Notable Exclusions
- **ux-strategy-minion**: Single-operator dashboard with 3 simple views. Frontend-minion and ux-design-minion cover information hierarchy.
- **software-docs-minion**: OpenAPI/runbook updates handled during implementation, not planning.
- **oauth-minion**: Admin auth uses static infrastructure secret, not OAuth flows.
- **edge-minion**: No CDN/caching concerns (admin responses use no-store).
- **observability-minion**: Read-only dashboard with established logging patterns.

### Anticipated Approval Gates
1. **Admin API surface design** (MUST gate) -- Endpoint structure, response shapes, query approach
2. **Admin auth model for the browser UI** (MUST gate) -- How operator authenticates in the dashboard browser session

### External Skill Integration
| Skill | Location | Classification | Recommendation |
|-------|----------|---------------|----------------|
| ops-runbook | `.claude/skills/ops-runbook/SKILL.md` | LEAF | Reference during planning (documents manual D1 queries this dashboard replaces) |
