## Meta-Plan

**Task**: Build an admin dashboard for operator visibility into tenant overviews, per-tenant usage, tier consumption, and basic profitability signals -- replacing manual D1 queries.

### Codebase Context

The WRL project is a Cloudflare Workers application with:
- **D1 database** for metadata (tenants, captures, usage_counters, api_keys, etc.)
- **Existing admin API** at `/v1/admin/*` using `verifyAdminKey` (Bearer token against `env.ADMIN_KEY` infrastructure secret). Existing endpoints: key CRUD, usage query (per-tenant/per-period), cache purge, tenant config get/put.
- **Existing user-facing Web UI** at `/ui` -- vanilla JS SPA with hash router, design system CSS tokens, modular JS files in `src/ui/`. Auth via GitHub OAuth sessions OR API keys (dual auth pattern).
- **No frameworks** -- project philosophy mandates vanilla JS/CSS/HTML (CLAUDE.md, Helix Manifesto).
- **Design system** -- established CSS custom properties in `design-system.css`, component patterns in `ui-css.js`.
- **DAL pattern** -- all D1 access is centralized in `db.js`. No raw `env.DB.prepare()` outside this module.
- **Existing tenant data**: `tenants` table (id, tier, billing_status, payment_method_added_at, grace_period_end), `usage_counters` (tenant_id, period, capture_count, storage_bytes, api_call_count, eidas_capture_count), `github_users` (github_id, github_login, tenant_id), `api_keys`, `captures`.
- **Quotas**: `FREE_CAPTURE_LIMIT = 200`, free tier has 1 GB storage limit, paid tier unlimited via Stripe metering.
- **Ops runbook skill** (`.claude/skills/ops-runbook/`) documents the exact D1 queries operators currently run manually -- this is effectively the "requirements spec" for what the dashboard should replace.

Key architectural constraints:
- All data access through `db.js` (new queries go there)
- Admin routes use `verifyAdminKey` (infrastructure secret, not session auth)
- UI is served as a single HTML response from `htmlDashboard()` in `ui-shell.js`
- Rate limiting via `ADMIN_RATE_LIMITER` (5 req/60s per IP)
- Response pattern: `jsonResponse()` and `problemResponse()` from `responses.js`

### Planning Consultations

#### Consultation 1: Admin Dashboard Data Model & API Design
- **Agent**: data-minion
- **Planning question**: Given the existing D1 schema (tenants, usage_counters, captures, api_keys, github_users tables) and the ops runbook queries that operators currently run manually, what aggregate queries should the admin dashboard API expose? Consider: (1) listing all tenants with their tier, billing status, and current-period usage in a single query; (2) historical usage across periods for a given tenant; (3) aggregate overview stats (total tenants, total captures this period, tenants approaching limits). What indexes may be needed? Should we add new DAL functions or compose existing ones? The existing `getUsage()` function only queries one tenant+period at a time -- should we add a bulk function?
- **Context to provide**: `src/db.js` (especially tenantExists, getUsage, getTenantConfig, getTenantBilling), D1 migrations directory listing, `src/quotas.js` (FREE_CAPTURE_LIMIT, TIER_QUOTAS), ops-runbook SKILL.md (the manual queries section)
- **Why this agent**: D1 query design, join strategy, index planning. The dashboard's value depends entirely on efficient, correct aggregate queries over the existing schema.

#### Consultation 2: Admin API Endpoint Design
- **Agent**: api-design-minion
- **Planning question**: What REST endpoints should the admin dashboard expose? The existing admin API has `/v1/admin/keys`, `/v1/admin/usage?tenant=X&period=Y`, `/v1/admin/cache/purge`, and `/v1/admin/tenants/:id/config`. The dashboard needs: (1) a tenant list with usage and billing info (possibly a single enriched list endpoint), (2) per-tenant detail/history, (3) aggregate overview stats. Should these be separate endpoints or a single enriched `/v1/admin/tenants` endpoint with query params? How does this fit the existing API style (RFC 7807 problem responses, `Cache-Control: private, no-store`, JSON responses)? Consider the <2s load time requirement and whether the UI should make one request or parallel requests.
- **Context to provide**: `src/admin.js` (existing admin handlers), `src/responses.js` (response helpers), route table from `src/index.js`, existing admin auth pattern
- **Why this agent**: REST API design patterns, endpoint granularity decisions, response shape design. Getting the API surface right determines whether the frontend can meet the <2s requirement with reasonable complexity.

#### Consultation 3: Frontend Architecture
- **Agent**: frontend-minion
- **Planning question**: The existing WRL web UI is a vanilla JS SPA with hash routing (`src/ui/ui-shell.js`), design system CSS tokens, and modular view files. The admin dashboard needs a separate entry point (operators are not regular users). How should the admin UI be structured? Options: (A) a new route within the existing `/ui` SPA (gated by admin auth), (B) a separate `/admin` endpoint serving its own HTML shell, (C) a new section in the existing shell with admin-only nav. Consider: admin auth uses `verifyAdminKey` (Bearer token), not session cookies. The existing UI uses session auth or API key dual auth. The admin dashboard should show: tenant list table, per-tenant drill-down, aggregate stats overview. Must use vanilla JS (no frameworks), reuse the design system, and load in <2s.
- **Context to provide**: `src/ui/ui-shell.js`, `src/ui/ui-css.js`, `src/design-system.css`, route table from `src/index.js`, auth patterns from `src/auth.js` and `src/index.js`
- **Why this agent**: Frontend architecture decisions (routing, auth flow, component structure) within the project's vanilla-JS constraints. The admin auth model being different from user auth is a key design decision.

#### Consultation 4: Security Model
- **Agent**: security-minion
- **Planning question**: The admin dashboard exposes tenant data (usage counts, billing status, API key metadata) via new endpoints. Current admin auth is a single infrastructure secret (`ADMIN_KEY`) compared via timing-safe equal. For the dashboard UI: (1) how should the admin authenticate in the browser? The current admin key is a Bearer token -- should the UI prompt for it and store it in sessionStorage (like the existing UI does with API keys)? (2) Is CSRF a concern if admin requests are Bearer-token-authenticated (no cookies)? (3) The dashboard queries D1 directly (no cached snapshots) -- any query injection risks given all queries use prepared statements? (4) Should the admin endpoints be rate-limited differently than the current 5 req/60s (which may be too tight for a dashboard making multiple parallel requests on page load)?
- **Context to provide**: `src/auth.js` (verifyAdminKey), admin rate limiter config from `wrangler.toml`, existing admin route auth flow from `src/index.js`, existing UI auth pattern from `src/ui/ui-auth.js`
- **Why this agent**: Admin interfaces are high-value targets. The auth model for a browser-based admin tool needs explicit security review before implementation.

### Cross-Cutting Checklist

- **Testing**: Include test-minion for planning. The admin dashboard introduces new D1 query functions in `db.js` and new API endpoints -- both need test strategy. Planning question: What test approach for the new DAL functions (D1 queries with joins/aggregations) and admin endpoints? The existing test suite uses `@cloudflare/vitest-pool-workers` with real D1. Should we test the admin UI at all (it's server-rendered HTML with inline JS)?

- **Security**: Include security-minion for planning (Consultation 4 above). Admin dashboard is a high-value attack surface.

- **Usability -- Strategy**: ALWAYS include. Planning question for ux-strategy-minion: The admin dashboard replaces manual D1 queries run via wrangler CLI (see ops-runbook skill). What are the operator's actual jobs-to-be-done when checking the dashboard? The issue lists "tenant overviews, per-tenant usage, tier consumption, profitability signals" -- but which of these are daily checks vs. incident investigation vs. periodic review? How should the information hierarchy be organized to minimize cognitive load for the most common operator workflow?

- **Usability -- Design**: Include ux-design-minion. The dashboard will have tables, stats cards, and drill-down views -- all need visual hierarchy and interaction design within the existing design system constraints (no frameworks, existing CSS tokens). Planning question: How should the tenant list table, aggregate stats, and drill-down views be laid out? What interaction patterns (sorting, filtering, expandable rows vs. separate detail view)?

- **Documentation**: ALWAYS include. Planning question for software-docs-minion: The admin dashboard adds new API endpoints. Should these be added to the existing OpenAPI spec (`openapi.yaml`)? The ops-runbook skill (`.claude/skills/ops-runbook/SKILL.md`) documents manual D1 queries -- should it be updated to reference the dashboard instead? Any ADR needed for the admin auth model decision?

- **Observability**: Not included for planning. The admin dashboard is read-only against existing data. Logging for admin API requests is already established in the existing admin endpoints (see `admin.js` -- all handlers log via `ctx.waitUntil(log(...))`). The new endpoints will follow the same pattern. No new runtime services, background processes, or production-impacting changes.

### Notable Exclusions

- **oauth-minion**: Admin auth uses a static infrastructure secret (`ADMIN_KEY`), not OAuth flows. If the security review recommends upgrading admin auth to session-based, oauth-minion would be added during synthesis -- but for planning, the existing auth model is sufficient.
- **edge-minion**: No CDN/caching concerns -- admin responses explicitly set `Cache-Control: private, no-store`. No edge workers involved.
- **observability-minion**: Read-only dashboard over existing data. Existing admin endpoint logging patterns are established and will be reused. No new observability architecture needed.

### Anticipated Approval Gates

1. **Admin API surface design** (MUST gate) -- The REST endpoint structure, response shapes, and query approach are hard to reverse once frontend code is built against them. Multiple downstream tasks depend on this. Likely delivered by api-design-minion with input from data-minion.

2. **Admin auth model for the browser UI** (MUST gate) -- How the operator authenticates in the dashboard browser session determines the frontend auth flow, security posture, and rate limiting approach. Hard to reverse, multiple dependents. Likely delivered by security-minion with input from frontend-minion.

### Rationale

This task spans four primary domains: **data access** (D1 aggregate queries for tenant overviews), **API design** (new admin REST endpoints), **frontend** (vanilla JS admin UI), and **security** (admin auth in a browser context). Each domain has a specialist whose input materially improves the plan:

- data-minion ensures efficient D1 queries over the existing schema without needing migrations
- api-design-minion ensures the endpoint surface fits the existing API style and supports the <2s load requirement
- frontend-minion navigates the vanilla-JS constraint and the divergent auth models (admin key vs. session)
- security-minion evaluates the admin auth model for browser use -- a new attack surface

Cross-cutting agents (ux-strategy, ux-design, test, docs) add planning value because the dashboard is operator-facing and replaces a manual workflow -- getting the information hierarchy and interaction design right is critical for adoption.

### Scope

**In scope**:
- New admin API endpoints for tenant list, usage aggregates, and per-tenant detail
- New DAL functions in `db.js` for aggregate queries
- Admin dashboard UI (vanilla JS, reusing design system)
- Admin authentication flow for browser-based access
- Tests for new DAL functions and API endpoints
- OpenAPI spec updates for new endpoints

**Out of scope**:
- Tenant self-service portal (tenants already have `/ui` with account management)
- Billing management (Stripe portal integration already exists)
- Real-time streaming metrics (not needed for operational awareness)
- Profitability calculations (requires cost data not yet available -- explicitly excluded in issue)
- Changes to existing user-facing UI or auth flows
- New D1 migrations (dashboard should work with existing schema)

### External Skill Integration

#### Discovered Skills
| Skill | Location | Classification | Domain | Recommendation |
|-------|----------|---------------|--------|----------------|
| ops-runbook | `.claude/skills/ops-runbook/SKILL.md` | LEAF | WRL operational procedures | Reference during planning -- documents the manual D1 queries this dashboard replaces. Include as context for data-minion and ux-strategy-minion consultations. |

#### Precedence Decisions
No precedence conflicts. The ops-runbook skill is a reference resource (disable-user-invocation: true), not an execution skill. It provides domain context for planning but does not overlap with any specialist agent's role.
