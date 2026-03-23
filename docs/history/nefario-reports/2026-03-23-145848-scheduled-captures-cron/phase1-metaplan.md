# Meta-Plan: Scheduled Captures via Cron Triggers

## Planning Consultations

#### Consultation 1: Cron Trigger Architecture and `scheduled()` Handler Design
- **Agent**: iac-minion
- **Planning question**: How should the Cloudflare Cron Trigger be configured in `wrangler.toml` and integrated with the Worker's `scheduled()` export? The Worker currently has `fetch()` and `queue()` handlers but no `scheduled()`. Cron Triggers are per-Worker (not per-tenant), so a single trigger fires at some interval and the Worker must fan out to all due schedules stored in D1. What cron interval should the trigger use (e.g., every minute, every 5 minutes, at the top of every hour)? How does this interact with the existing queue architecture -- should scheduled captures be enqueued onto the existing `wrl-captures` queue, or do they need a separate queue? What staging environment considerations apply (separate cron trigger for staging)?
- **Context to provide**: `wrangler.toml` (queue config, staging env structure), `src/index.js` (Worker export with `queue()` and `fetch()`), existing queue consumer pattern in `handleCaptureMessage()`
- **Why this agent**: Cron Trigger configuration is infrastructure-level. iac-minion understands Cloudflare Worker deployment topology, cron trigger limitations (per-Worker, not per-schedule), and how this integrates with the existing queue/DLQ architecture.

#### Consultation 2: D1 Schema Design for Schedules
- **Agent**: data-minion
- **Planning question**: What should the `schedules` table schema look like in D1? Key decisions: (1) How to store cron expressions -- raw string with application-layer parsing, or pre-computed `next_run_at` column for efficient queries? (2) How to link captures back to schedules -- add a `schedule_id` column to the existing `captures` table, or a join table? (3) Index strategy for the fan-out query ("find all schedules due now" grouped by tenant). (4) How to handle schedule limits per tenant -- store in the existing `tenants.config` JSON, or as a column on the schedules table? Consider the existing patterns: webhooks table (ID format `whk_*`, tenant FK, created_at), captures table (FK to tenant, status column), tenant config JSON overrides.
- **Context to provide**: All 6 migration files, `src/db.js` (CRUD patterns for webhooks, captures, tenant config), `src/quotas.js` (quota enforcement pattern)
- **Why this agent**: Schema design is the foundational decision that shapes every downstream task. The schedule table design, the capture-to-schedule linking strategy, and the fan-out query pattern all flow from data-minion's schema recommendation.

#### Consultation 3: Schedule CRUD API Design
- **Agent**: api-design-minion
- **Planning question**: What should the schedule management API look like? Specific questions: (1) Route structure -- `POST/GET/DELETE /v1/schedules` following the webhooks pattern, or nested under captures (`/v1/captures/schedules`)? (2) Request/response shapes -- what fields for create (URL, cron expression, name?), what to return on list (next-run-at computation, last-run status?). (3) Cron expression validation -- what library/approach for parsing cron expressions and enforcing hourly minimum granularity? (4) How should the 429 response for schedule limit exceeded be structured (following existing quota/rate-limit response patterns)? (5) Auth model -- should schedules use the same `capture` scope as webhooks, or need their own scope? (6) Should `GET /v1/captures` expose a `scheduleId` filter parameter?
- **Context to provide**: `src/webhooks.js` (CRUD pattern to follow), `src/index.js` (route table), `src/quotas.js` (quota enforcement), `src/responses.js` (response helpers)
- **Why this agent**: API surface design determines developer experience and sets the contract before implementation. The existing webhooks CRUD is the closest pattern -- api-design-minion should evaluate whether to replicate it or adjust.

#### Consultation 4: Schedule Execution and Capture Linking Logic
- **Agent**: ai-modeling-minion
- **Planning question**: What should the `scheduled()` handler's execution logic look like? Key design questions: (1) Fan-out strategy -- when the cron fires, query D1 for all due schedules, then for each one: check the tenant's quota, enqueue a capture message on the existing `wrl-captures` queue with a `scheduleId` field. How to handle partial failures (some tenants over quota, some not)? (2) Concurrency -- if the cron fires every minute but some schedules are still processing, how to prevent duplicate captures (idempotency guard)? (3) How does `scheduleId` propagate through the existing capture pipeline (`handleCaptureMessage` -> `performCapture` -> `completeCapture`) -- what's the minimum-change path to add this field? (4) Error budget -- if the fan-out query returns 500 schedules, what's the CPU/wall-clock budget within a single `scheduled()` invocation?
- **Context to provide**: `src/index.js` (capture message handling, queue consumer), `src/capture.js` pattern, `src/quotas.js` (checkQuota), `wrangler.toml` (CPU limits, queue config)
- **Why this agent**: The execution logic is the core complexity -- multi-tenant fan-out, quota integration, idempotency, and fitting within Cloudflare Worker constraints. ai-modeling-minion can reason about the end-to-end flow and identify edge cases.

#### Consultation 5: Web UI Schedule Panel
- **Agent**: frontend-minion
- **Planning question**: How should the schedule management UI integrate with the existing vanilla JS SPA? The current UI has a hash router with routes for `/captures`, `/captures/:id`, and `/settings`. Questions: (1) New route `/schedules` or a tab/section within the existing settings view? (2) UI module structure -- new `ui-schedules.js` file following the existing pattern (`ui-settings.js`, `ui-submit.js`)? (3) Cron expression input -- human-friendly picker vs raw cron string input vs presets ("hourly", "daily", "weekly")? (4) What should the schedule list show (URL, cron expression in human-readable form, next run time, last capture status)?
- **Context to provide**: `src/ui/ui-shell.js` (router, module structure), `src/ui/ui-settings.js` (CRUD pattern for keys), `src/ui/ui-submit.js` (form submission pattern), `src/design-system.js` (CSS tokens)
- **Why this agent**: The UI is vanilla JS with specific patterns (inline modules in shell, hash router, design system). frontend-minion should advise on the UI architecture within these constraints.

### Cross-Cutting Checklist

- **Testing**: Include test-minion for planning. The schedule feature crosses multiple boundaries: D1 schema, HTTP handlers, queue integration, cron handler, UI. test-minion should advise on what can be unit-tested (cron parsing, schedule CRUD, limit enforcement) vs what needs integration testing (scheduled() handler fan-out, capture-to-schedule linking). The existing test suite has 42 test files with consistent patterns -- test-minion ensures the test strategy aligns.
- **Security**: Include security-minion for planning. Schedule creation accepts a URL and cron expression from tenants -- URL validation (SSRF) must reuse `validateUrl()`. Cron expressions could be crafted to cause resource exhaustion (sub-minute if validation is bypassed). Per-tenant schedule limits are an abuse prevention control. The `scheduled()` handler runs without HTTP auth context -- how does it authenticate to the capture pipeline? Security-minion should review the threat surface.
- **Usability -- Strategy**: ALWAYS include. How do scheduled captures fit into the user's workflow? Is the cron expression the right abstraction, or would "hourly/daily/weekly" presets be more intuitive? How does a user monitor whether their schedules are actually running? What happens when a scheduled capture fails -- is the user notified (webhook integration)?
- **Usability -- Design**: Include ux-design-minion for planning. The web UI gets a new schedule panel -- needs visual design guidance for the cron input, schedule list, and status indicators within the existing design system.
- **Documentation**: ALWAYS include. software-docs-minion should advise on API documentation for the new endpoints (following existing patterns). user-docs-minion should consider whether the cron expression format needs user-facing documentation/help text.
- **Observability**: Include observability-minion for planning. The success criteria explicitly require Coralogix logs for each schedule execution (scheduleId, URL, outcome, duration). observability-minion should advise on log schema, severity levels, and whether new alerting rules are needed for schedule execution failures.

### Notable Exclusions

- **edge-minion**: Cron Triggers are a Cloudflare Worker primitive, not a CDN/edge routing concern. No load balancing or caching decisions involved.
- **oauth-minion**: Schedule endpoints use the existing dual-auth pattern (session cookie + API key). No new auth flows needed.
- **mcp-minion**: The MCP server exposes capture tools. Schedules are a management plane feature -- MCP integration would be a separate future concern.

### Anticipated Approval Gates

1. **D1 Schema Design** (MUST gate) -- The `schedules` table schema and the `captures.schedule_id` column are hard to reverse once migrated. The fan-out query performance depends on index choices. 3+ downstream tasks depend on this schema.
2. **API Contract** (MUST gate) -- Route structure, request/response shapes, and cron validation rules set the contract for both the handler implementation and the UI. Hard to change after both are built.
3. **Cron Trigger Strategy** (OPTIONAL gate) -- Whether to use a single minutely trigger vs hourly triggers, and whether to reuse the existing capture queue. This is infrastructure config that's easy to change, but has performance implications.

### Rationale

This feature is a substantial cross-cutting addition that touches every layer of the stack: infrastructure (Cron Trigger config in wrangler.toml), data (new D1 table + migration), API (new CRUD endpoints), core logic (scheduled() handler with fan-out), UI (new schedule panel), and observability (execution logging). The webhook CRUD feature (Phase 0054) is the closest precedent -- it followed a similar pattern of schema + API + dispatch + logging. The planning consultations mirror that decomposition.

The five primary consultations cover the five distinct technical domains: infrastructure (iac-minion), data model (data-minion), API surface (api-design-minion), execution logic (ai-modeling-minion), and UI (frontend-minion). Cross-cutting agents (test, security, ux-strategy, ux-design, docs, observability) are all included because the feature has testable behavior, security-sensitive inputs, user-facing surfaces, and explicit logging requirements.

### Scope

**In scope**:
- `schedules` D1 table + migration (0007)
- `schedule_id` column on captures (or linking strategy) + migration
- CRUD handlers: POST/GET/DELETE /v1/schedules
- Cron expression parsing and hourly minimum validation
- Per-tenant schedule limit enforcement (free: 10, configurable via tenant config)
- Cloudflare Cron Trigger configuration in wrangler.toml (prod + staging)
- `scheduled()` Worker export with fan-out logic
- Capture queue integration (enqueue with scheduleId)
- `scheduleId` field in capture list/detail responses
- Web UI schedule management panel
- Coralogix structured logs for schedule execution
- Tests for all new code

**Out of scope**:
- Sub-hourly schedules
- Change detection / diffing between scheduled captures
- Schedule pause/resume (PATCH endpoint)
- Schedule-specific webhook events (beyond existing capture.complete/failed)
- MCP tool for schedule management
- Email/push notifications for schedule failures

### External Skill Integration

No external skills detected in project.
