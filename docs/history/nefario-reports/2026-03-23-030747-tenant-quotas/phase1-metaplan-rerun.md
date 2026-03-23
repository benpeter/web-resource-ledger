# Meta-Plan: Tenant Quotas (R26)

## Planning Consultations

### Consultation 1: Data Model for Tiers and Quota Overrides

- **Agent**: data-minion
- **Planning question**: The `tenants` table currently has an `id`, `config` (JSON), `created_at`, `updated_at`, and `updated_by`. The `usage_counters` table already tracks `capture_count` and `storage_bytes` per tenant per period. How should tier assignment and per-tenant quota overrides be modeled? Specifically: (a) Should `tier` be a new column on the `tenants` table or a field inside the existing `config` JSON? (b) Should default quota limits per tier live in code (a constant map) or in D1? (c) How should per-tenant quota overrides be stored -- as fields in the existing `config` JSON column, or as a separate table? (d) The quota check must read current usage + tier limits in a single D1 call to stay under 10ms -- what query pattern achieves this (JOIN usage_counters with tenant tier in one statement, or batch two statements)?
- **Context to provide**: `migrations/0001_initial_schema.sql` (tenants table), `migrations/0002_usage_counters.sql` (usage_counters table), `src/db.js` (existing `getTenantConfig`, `setTenantConfig`, `getUsage`, `incrementUsage`), the constraint that D1 is edge SQLite with batch support
- **Why this agent**: Database schema design is foundational -- the tier/quota data model determines the shape of every other task. Getting this wrong means rework across the migration, DAL, API, and UI.

### Consultation 2: Quota Check Placement and API Contract

- **Agent**: api-design-minion
- **Planning question**: The capture pipeline currently has auth (step 2), rate limit (step 3), URL validation (step 6), and then D1 write + queue enqueue (steps 8-10). Where exactly should the quota check be inserted, and what should the 429 response look like? The issue specifies `{ "error": "quota_exceeded", "detail": "monthly capture limit reached", "limit": N, "used": N }` but the existing error format uses RFC 7807 problem responses (`{ "status": 429, "title": "...", "detail": "..." }`) via the `problemResponse` helper in `src/responses.js`, which supports an `extra` object for additional fields. Should we extend the problem response with `limit` and `used` as extra fields, or use a separate response shape for quota errors? Also: should the batch capture endpoint (`POST /v1/captures/batch`) check quotas upfront for the whole batch, or per-item? Consider that the API spec changes (OpenAPI updates) should reflect whichever response shape is chosen -- the api-design-minion's recommendation here feeds directly into the software-docs-minion's documentation planning.
- **Context to provide**: `src/index.js` (handleCreateCapture steps 1-10, handleBatchCapture), `src/responses.js` (problemResponse helper with `extra` param), existing rate limit 429 pattern, `openapi.yaml`
- **Why this agent**: API contract decisions (response shape, header conventions, batch semantics) affect every API consumer. The tension between RFC 7807 and the issue's requested format needs resolution before implementation.

### Consultation 3: Quota Enforcement Strategy and Latency Budget

- **Agent**: iac-minion
- **Planning question**: The quota check has a 10ms latency budget. Options include: (a) single D1 read per request (read usage_counters + tenant tier, compare in application code), (b) cached tier/quota data in KV with short TTL (avoids D1 read on every request but introduces staleness), (c) Cloudflare rate limiter binding with dynamic limits (but limits can't be changed per-request). Given that D1 is edge-colocated SQLite with sub-5ms read latency for simple queries, is option (a) sufficient? Or should we plan for caching in KV? Also: the existing per-tenant rate limit already does a KV read (`getTenantConfig`) for rate limit overrides -- can we piggyback the quota check on that same config read to avoid an additional round-trip?
- **Context to provide**: `wrangler.toml` (D1 binding, KV binding, rate limiter bindings), `src/rate-limits.js` (getEffectiveLimit with tenantConfig), `src/kv.js` (rateLimitCounter), `src/index.js` (checkCaptureRateLimit flow), the 10ms latency constraint
- **Why this agent**: Infrastructure-level decisions about caching strategy and D1 read patterns affect the latency budget and determine whether the implementation is a simple D1 read or requires a caching layer.

### Consultation 4: Web UI Usage Dashboard Design

- **Agent**: frontend-minion
- **Planning question**: The existing web UI is vanilla JS with no framework (inline in ui-shell.js as string constants). It has hash-based routing with views: `#/captures`, `#/captures/:id`, and `#/settings`. The usage dashboard needs to show current period usage vs. quota with progress bars for captures and storage. Design questions: (a) Should usage be a new view (`#/usage`) or a section within the existing settings view? (b) The data source is the existing `GET /v1/admin/usage` endpoint -- but this is admin-only. Should we add a session-gated `GET /v1/account/usage` endpoint, or should the session endpoint `/auth/session` return usage data inline? (c) What's the minimal viable progress bar implementation in vanilla CSS (no framework)? Note: the ux-strategy-minion will separately advise on journey design (when/where to surface quota info), so focus your recommendation on the technical implementation within the existing vanilla JS architecture.
- **Context to provide**: `src/ui/ui-shell.js` (hash router, view structure), `src/ui/ui-settings.js` (existing settings view with account info and key management), `src/ui/ui-css.js` (existing CSS), `src/design-system.css` (design tokens), `src/oauth.js` (handleAuthSession response shape)
- **Why this agent**: The UI implementation must fit within the existing vanilla JS architecture and maintain consistent UX patterns. The routing decision (new view vs. settings section) and data source question affect both backend and frontend work.

### Consultation 5: Security Review of Quota Bypass Vectors

- **Agent**: security-minion
- **Planning question**: The quota system introduces new attack surfaces: (a) Can a tenant bypass quotas by creating multiple API keys? (The answer should be no -- quotas are per-tenant, not per-key -- but confirm the data model supports this.) (b) The issue says "slight overages are acceptable" due to eventual consistency. What's the maximum realistic overage given that captures are queued (one concurrent consumer per tenant due to rate limiting, but up to 10 concurrent globally)? Is there a risk of intentional overage exploitation? (c) The per-tenant quota override in D1 means an admin can grant custom limits. Should this require the admin key, or should it be protected differently? (d) Should the usage dashboard expose absolute numbers (capture count, storage bytes) or only relative (percentage of quota)? (e) What are the security implications of surfacing tier information in user-facing endpoints -- could a tenant infer other tenants' tier assignments or usage patterns?
- **Context to provide**: `src/auth.js` (verifyApiKey binds to tenantId), `src/index.js` (queue consumer with tenantId from message), `src/db.js` (incrementUsage with UPSERT), `wrangler.toml` (max_concurrency = 10 for capture queue)
- **Why this agent**: Quota systems are authorization mechanisms. Bypass vectors, overage exploitation, and information disclosure in the usage dashboard are security concerns that should shape the design.

### Consultation 6: User Journey and Quota Awareness Strategy

- **Agent**: ux-strategy-minion
- **Planning question**: The usage dashboard will show captures/month and storage used vs. quota limits. From a user journey perspective: (a) When should users encounter quota information -- only on a dedicated page/section, or proactively surfaced as contextual warnings when approaching limits (e.g., banner on the captures list, inline warning on the submit form)? (b) What cognitive load does quota awareness add to the capture submission flow -- should the submit form show remaining quota, or does that add unnecessary friction for users well under their limits? (c) Should the 429 quota_exceeded API response include a human-readable hint about next steps (even though auto-upgrade is out of scope)? (d) For the progress bar, what thresholds should trigger visual warning states (yellow at 80%? red at 95%?)? (e) Should the dashboard show historical usage (past months) or only current period? (f) How should the system communicate tier identity to users -- is "free" a useful label or does it carry negative connotations (consider alternatives like "starter")? Note: the frontend-minion will handle technical implementation; your focus is on WHAT quota information to surface and WHERE in the user journey.
- **Context to provide**: Existing UI views (captures list, capture detail, submit form, settings), the session response shape from `/auth/session`, the quota error response shape (TBD from api-design-minion)
- **Why this agent**: Every plan needs journey coherence review and cognitive load assessment. Quota information is a cross-cutting UX concern -- it touches the submit flow, the captures list, the settings page, and API error responses. Deciding where to surface it (and where NOT to) requires user journey analysis, not just UI implementation.

### Consultation 7: Documentation Impact Assessment

- **Agent**: software-docs-minion
- **Planning question**: This feature introduces several documentation surfaces. Assess and recommend: (a) The OpenAPI spec (`openapi.yaml`) needs updates for the 429 quota_exceeded response on `POST /v1/captures` and `POST /v1/captures/batch`, any new `GET /v1/account/usage` endpoint, and tier/quota fields on tenant config admin endpoints -- should these be documented as inline response schemas or referenced components? (b) The existing docs site may have an "API Rate Limits" guide -- should it be updated to distinguish rate limits (per-minute, via Cloudflare rate limiter) from quotas (per-month, via D1 usage counters), or does this warrant a separate "Usage Quotas" guide? (c) Should the architecture documentation capture the quota check flow as a distinct pipeline stage (it sits between rate limiting and capture execution)? (d) Are there documentation implications for the tenant admin API (`PUT /v1/admin/tenants/:id/config`) when it gains quota override fields?
- **Context to provide**: `openapi.yaml` (current API spec), existing API documentation structure, `src/responses.js` (problemResponse format with extra fields), the current tenant config admin endpoints
- **Why this agent**: API documentation is a critical contract with consumers. The distinction between rate limits and quotas is subtle enough to cause confusion if not documented clearly. The OpenAPI spec updates need to align with whichever response format the api-design-minion recommends.

---

### Cross-Cutting Checklist

- **Testing**: Include test-minion for planning? **No** -- test strategy for this feature is straightforward (unit tests for quota check logic, integration tests for the 429 response, UI tests for dashboard rendering). The patterns are well-established from R25 usage metering (20 unit + 16 integration tests). Test-minion will participate in Phase 3.5 architecture review and Phase 6 test execution.
- **Security**: Include security-minion for planning? **Yes** -- included as Consultation 5 above. Quota bypass vectors and overage exploitation need pre-implementation analysis.
- **Usability -- Strategy**: ALWAYS include. **Yes** -- included as Consultation 6 above. Quota information touches multiple points in the user journey (submit, captures list, settings, API errors). Journey coherence and cognitive load assessment are needed before implementation.
- **Usability -- Design**: Include ux-design-minion / accessibility-minion? **No** -- the progress bar is a simple visual element within an established design system. No new interaction patterns are introduced. The accessibility-minion review in Phase 3.5 will cover WCAG for the progress bar (color contrast, ARIA attributes for progress indicators, screen reader announcement of quota status).
- **Documentation**: ALWAYS include. **Yes** -- included as Consultation 7 above. OpenAPI spec updates, rate limit vs. quota documentation distinction, and architecture documentation of the quota check flow all need pre-implementation assessment.
- **Observability**: Include observability-minion / sitespeed-minion? **No** -- the quota check will use the existing structured logging infrastructure (log events like `quota.exceeded`, `quota.check` via the existing `log()` helper in `src/log.js`). No new observability patterns are needed. The existing Coralogix alerting pipeline can be extended later if quota events need alerting. sitespeed-minion is not relevant -- the dashboard is a simple page load with a single API call, not a performance-critical rendering concern.

---

### Notable Exclusions

- **oauth-minion**: The OAuth/session infrastructure is already built and tested. The usage dashboard will reuse existing session auth (`verifySession` in `src/session.js`). No new auth flows are needed -- just a new session-gated endpoint that follows the same pattern as existing `/v1/account/*` routes.
- **mcp-minion**: The MCP server tools (capture_url, list_captures, etc.) will naturally return 429 quota errors without any MCP-specific changes. The error propagation is transparent -- the MCP handler calls the same pipeline that produces the 429.
- **edge-minion**: No CDN, caching, or edge worker changes. D1 reads are edge-colocated by default. KV caching (if needed) is an infrastructure concern being evaluated by iac-minion in Consultation 3, not an edge delivery concern.

---

### Anticipated Approval Gates

1. **Data model and migration** (MUST gate): The D1 schema for tier assignment and quota overrides is hard to reverse once migrated to production. This determines the shape of the quota check query, the admin API, the session response, and the UI data source. High blast radius (blocks all downstream tasks).

2. **API contract for quota error response** (MUST gate): Whether to extend RFC 7807 problem responses with `limit`/`used` extra fields or use the issue's custom shape affects all API consumers and the OpenAPI spec. The batch endpoint behavior (upfront vs. per-item quota check) is also a contract decision. Hard to change after consumers adopt it.

---

### Rationale

This feature has seven distinct planning perspectives needed:

1. **Data modeling** (data-minion) -- the tier/quota schema is the foundation. The tenants table needs a tier field, and the quota check needs an efficient query pattern against usage_counters. This is the highest-risk decision because schema changes are hard to reverse.

2. **API design** (api-design-minion) -- the 429 response shape and batch behavior are API contracts. The tension between RFC 7807 and the issue's requested format needs explicit resolution. The response format feeds directly into both the frontend implementation and the documentation.

3. **Infrastructure** (iac-minion) -- the 10ms latency constraint requires understanding D1 read performance and whether caching is needed. This intersects with the existing rate limit infrastructure.

4. **Frontend** (frontend-minion) -- the usage dashboard is a new UI surface within an established vanilla JS architecture. Routing and data source decisions need to align with backend design.

5. **Security** (security-minion) -- quota systems are authorization mechanisms with bypass risks. Pre-implementation security analysis prevents architectural vulnerabilities.

6. **User journey** (ux-strategy-minion) -- quota information is a cross-cutting UX concern that touches multiple views and flows. Deciding where to surface quota awareness (and where NOT to) shapes both the frontend and API work. Without journey analysis, the implementation risks either under-informing users (they hit 429 with no warning) or over-informing them (quota noise on every interaction).

7. **Documentation** (software-docs-minion) -- the API contract changes need OpenAPI spec updates, and the distinction between rate limits and quotas is subtle enough to cause consumer confusion. Early documentation planning ensures the spec and guides align with the chosen response format.

The cross-cutting agents for usability strategy and documentation have been promoted from checklist items to full planning consultations because this feature introduces a new user-facing concept (tiers and quotas) that requires coherent presentation across the API, UI, and documentation surfaces.

---

### Scope

**What this task achieves**: Adds tier-based usage quotas to WRL. Tenants are assigned tiers (free/pro) with default capture and storage limits. The capture pipeline checks quotas before accepting work. A web UI dashboard shows usage vs. limits. Operators can override quotas per-tenant via admin API.

**In scope**:
- `tier` field on tenant records (defaults to "free" on auto-provisioning)
- Default quota map per tier (free: 100 captures/month, 1 GB storage; pro: 5000 captures/month, 50 GB)
- Pre-capture quota check in the HTTP handler (before queue enqueue)
- 429 `quota_exceeded` response with usage details
- Per-tenant quota overrides in D1 (admin-configurable)
- Web UI usage dashboard with progress bars (reads from D1 on page load)
- D1 migration for tier field and any new schema
- OpenAPI spec updates
- Unit and integration tests

**Out of scope**:
- Automatic tier upgrades or billing integration
- Storage cleanup/eviction on quota breach
- Per-endpoint API call quotas (only captures and storage)
- Quota alerts or notifications
- Real-time usage updates (dashboard reads on page load only)

---

### External Skill Integration

No external skills detected in project. No `.claude/skills/` or `.skills/` directories found in the working directory.
