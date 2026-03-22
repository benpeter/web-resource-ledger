# Meta-Plan: R25 Usage Metering

## Planning Consultations

### Consultation 1: D1 Schema and Counter Strategy
- **Agent**: data-minion
- **Planning question**: What D1 schema design best supports per-tenant monthly usage counters (capture count, storage bytes, API calls) with these constraints: (1) counter increments via `waitUntil` (deferred, non-blocking), (2) monotonically increasing within a billing period, (3) calendar month (UTC) periods, (4) queryable by tenant + period? Should counters use a single row per tenant-period with atomic increments, or an append-only event log with aggregation? Consider D1's SQLite semantics (no UPSERT with increment in a single statement without a workaround), write contention on hot rows, and the existing schema pattern in `migrations/0001_initial_schema.sql`.
- **Context to provide**: `migrations/0001_initial_schema.sql` (existing schema), `src/db.js` (data access patterns, all DB access centralised here), `wrangler.toml` (D1 binding), the constraint that storage byte counting relies on R2 `Content-Length` available after `env.BUCKET.put()`.
- **Why this agent**: Schema design for usage counters involves trade-offs between write contention, query performance, and D1/SQLite-specific limitations. data-minion understands database modeling for counters and time-series data patterns.

### Consultation 2: Integration Points and Hot Path Impact
- **Agent**: api-design-minion
- **Planning question**: Where exactly should counter increments be placed in the existing request flow, and what should the admin usage endpoint response shape look like? Specifically: (1) For API call counting, should it happen in the auth middleware (`verifyApiKey` in `auth.js`), in each route handler, or in a new middleware layer in `index.js`? (2) For capture counting and storage bytes, the natural hook is after `completeCapture()` in `capture.js` -- is that correct, or should it be in the queue consumer in `index.js`? (3) What response shape for `GET /v1/admin/usage` follows the existing RFC 7807 problem+json error pattern and the existing admin API conventions (see `admin.js`)? (4) Should the endpoint support listing all tenants' usage in one call, or only single-tenant queries?
- **Context to provide**: `src/index.js` (routing, auth flow, rate limit integration in `handleCreateCapture`), `src/auth.js` (verifyApiKey returns tenantId/scopes), `src/admin.js` (existing admin endpoint patterns), `src/capture.js` (performCapture, R2 put calls with artifact sizes), `openapi.yaml` (API conventions).
- **Why this agent**: API design expertise for endpoint shape, integration point selection, and consistency with existing patterns. The "where to count" question is as much API architecture as it is data.

### Consultation 3: Performance and Deferred Writes
- **Agent**: iac-minion
- **Planning question**: The constraint says counter increments must not add measurable latency to the capture hot path. The existing pattern uses `ctx.waitUntil()` for deferred logging (see `log.js`). For D1 writes via `waitUntil`: (1) Is `ctx.waitUntil(env.DB.prepare(...).run())` reliable for D1 counter increments in Cloudflare Workers, or can deferred D1 writes be silently dropped? (2) Should we batch multiple counter increments (API call + capture + storage bytes) into a single `db.batch()` call in `waitUntil`? (3) The existing rate limit counters use KV with TTL (`kv.js`) -- should usage counters follow the same KV pattern for write performance, or is D1 the right choice given the "must survive Worker restarts" requirement?
- **Context to provide**: `wrangler.toml` (D1 binding, queue consumer config), `src/kv.js` (KV counter pattern with `rateLimitCounter`), `src/log.js` (waitUntil pattern for Coralogix), `src/capture.js` (the capture pipeline where storage bytes become available).
- **Why this agent**: Infrastructure expertise on Cloudflare Workers runtime behavior, D1 write reliability in deferred contexts, and the KV vs D1 trade-off for counter storage.

### Consultation 4: Counter Accuracy and Edge Cases
- **Agent**: test-minion
- **Planning question**: What test strategy covers the critical correctness properties of usage counters? Specifically: (1) Monotonicity -- counters never decrease within a period. How do we test for this given concurrent `waitUntil` writes? (2) Period boundaries -- what happens when a capture starts in March and completes in April? Which period gets the count? (3) Storage byte accuracy -- R2 `put()` doesn't return Content-Length; we need to compute artifact sizes from the buffers before upload. How do we test that the byte count matches actual R2 object sizes? (4) Failed captures -- should a failed capture still increment the capture counter (it consumed resources) or only successful ones? (5) What's the right test boundary: unit tests for the counter module, integration tests for the admin endpoint, or both?
- **Context to provide**: `vitest.config.js`, `test/fixtures.js` (existing test patterns), `test/admin-keys.test.js` (admin endpoint test patterns), `test/db.test.js` (D1 test patterns), `wrangler.test.toml` (test bindings).
- **Why this agent**: Test strategy must be planned before implementation to ensure the counter increment logic and admin endpoint are testable. The edge cases (period boundaries, failed captures, concurrent writes) need explicit test coverage decisions.

### Cross-Cutting Checklist

- **Testing**: INCLUDED above (Consultation 4). Usage counters have subtle correctness properties (monotonicity, period boundaries, deferred write reliability) that need test strategy before code.
- **Security**: NOT included for planning. The admin usage endpoint uses the same `verifyAdminKey` auth as existing admin endpoints (`admin.js`). No new attack surface, auth mechanism, or user input processing beyond what already exists. The tenantId query parameter is already validated by `TENANT_ID_RE` throughout the codebase. Security review in Phase 3.5 is sufficient.
- **Usability -- Strategy**: ALWAYS include. Planning question for ux-strategy-minion: The usage endpoint serves admin/billing use cases. Is the period format (`2026-03`) intuitive? Should the response include period boundaries (start/end timestamps) for unambiguous interpretation? Should "current period" be the default when no period parameter is provided, or should it require explicit specification? How should the response communicate that counters are eventually consistent (lag disclaimer)?
- **Usability -- Design**: NOT included for planning. No user-facing UI in scope (deferred to R26). The admin usage endpoint is a JSON API consumed programmatically.
- **Documentation**: ALWAYS include. Planning question for software-docs-minion: The OpenAPI spec (`openapi.yaml`) needs the new endpoint. Should the usage endpoint be documented under the existing `admin` tag or a new `usage` tag? What documentation is needed for the counter increment behavior (eventual consistency, period semantics) beyond the OpenAPI spec -- ADR, OPERATIONS.md update, or inline code comments?
- **Observability**: NOT included for planning. Counter increments are fire-and-forget D1 writes. The existing Coralogix logging pattern (`log.js`) already covers the capture pipeline. No new runtime service or background process is introduced. If counter writes fail, they should log via the existing `log()` pattern -- this is an implementation detail, not a planning question. Phase 3.5 review is sufficient.

### Notable Exclusions

- **observability-minion**: No new runtime service or process. Counter writes use existing `waitUntil` pattern. Failure logging uses existing `log.js`. Phase 3.5 review covers whether additional logging is needed.
- **security-minion**: Admin auth reuses `verifyAdminKey` verbatim. No new secrets, no new user input surfaces beyond `TENANT_ID_RE`-validated tenantId. Phase 3.5 mandatory review covers the security dimension.
- **mcp-minion**: MCP server exists (`src/mcp.js`) but usage metering is not exposed via MCP tools. If it should be, that's a separate backlog item.

### Anticipated Approval Gates

1. **D1 schema design (migration file)** -- Hard to reverse (schema migration), high blast radius (counter increment logic, admin endpoint, and tests all depend on it). MUST gate. data-minion produces the migration SQL; user approves before implementation proceeds.

2. **Counter increment placement** -- Where in the code counters are incremented affects correctness and performance. Medium reversibility but high blast radius (touches capture.js, index.js, possibly auth.js). Likely consolidated with schema gate into a single "design decisions" gate.

### Rationale

This task has four distinct planning dimensions:

1. **Data modeling** (data-minion): The D1 schema is the foundation. Counter tables, period partitioning, and increment strategy must be decided before any code is written. D1/SQLite has specific limitations (no native `UPDATE ... SET col = col + 1` with UPSERT in all cases) that affect the approach.

2. **API integration** (api-design-minion): The counter increment hooks touch the most critical code paths (capture pipeline, auth middleware). Choosing the wrong integration point could add latency or miss events. The admin endpoint shape must be consistent with existing conventions.

3. **Infrastructure reliability** (iac-minion): The `waitUntil` deferred write pattern is the proposed mechanism, but its reliability for D1 writes needs confirmation. The KV vs D1 trade-off for counter storage is an infrastructure question.

4. **Test strategy** (test-minion): Usage counters have correctness invariants (monotonicity, period boundaries) that are easy to get wrong and hard to debug in production. Test strategy must be planned alongside implementation.

UX strategy consultation ensures the admin API response shape serves its billing/quota use case clearly.

### Scope

**In scope**:
- New D1 migration adding a usage counters table
- Counter increment logic hooked into capture completion and API request authentication
- `GET /v1/admin/usage` endpoint with tenant and period filtering
- OpenAPI spec update for the new endpoint
- Unit and integration tests for counter logic and admin endpoint
- Evolution log entries (prompt.md exists; decisions.md and outcome.md to be written)

**Out of scope**:
- Usage dashboard in web UI (deferred to R26 per issue)
- Real-time usage / streaming counters
- Usage alerts or notifications
- Historical usage export
- Billing integration or quota enforcement logic
- Changes to existing rate limiting (that's R21, already done)

### External Skill Integration

No external skills detected in project. No project-local skills in `.claude/skills/` or `.skills/`. Global skills in `~/.claude/skills/` are all despicable-agents orchestration skills or personal utility skills with no domain overlap.
