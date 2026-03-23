# Domain Plan Contribution: software-docs-minion

## Recommendations

### 1. OpenAPI spec is the single source of truth -- update it first, derive everything else

The existing `openapi.yaml` (currently v0.6.0, OpenAPI 3.1) is comprehensive and well-structured with 7 tags, reusable schemas, and real examples on every endpoint. All new schedule management endpoints must be added here first. The docs site at docs.webresourceledger.com auto-generates its API Reference page from this spec (via the `api-reference.njk` template and Redocly). No separate API reference writing is needed -- the spec *is* the reference.

Specific additions to `openapi.yaml`:

- **New tag**: `schedules` -- "Scheduled recurring captures (cron-style)"
- **New paths**: CRUD endpoints for schedule management (at minimum: create, list, get, update/pause, delete)
- **New schemas**: `Schedule`, `ScheduleId`, `CronExpression` (with pattern validation), schedule limit error responses
- **Link captures to schedules**: Add optional `scheduleId` field to existing `CaptureRecord` and `CaptureListItem` schemas so captures produced by a schedule reference their origin
- **Real examples on every endpoint**: Follow the existing pattern -- every request body, every response, every error case gets a concrete example with realistic data (not placeholder text)
- **Version bump**: Bump to 0.7.0

### 2. New docs site guide page: "Scheduled Captures"

The docs site (`site/content/`) follows a consistent pattern: each major feature gets its own guide page (batch.md, webhooks.md, limits.md, etc.) with a prerequisites section, code examples, constraint documentation, and error handling patterns. Scheduled captures need the same treatment.

The guide should cover:

- **Prerequisites**: API key with `capture` scope (consistent with batch and webhook guides)
- **Create a schedule**: Full curl example with cron expression, target URL, and optional metadata
- **Cron expression format**: A clear reference table. Document the exact subset of cron syntax supported (5-field vs 6-field, minimum interval, timezone handling). This is the part users will get wrong most often -- invest documentation effort here
- **List and manage schedules**: Show list, get-by-id, pause/resume, delete flows
- **View schedule history**: How to query captures that belong to a schedule (using the `scheduleId` filter on `GET /v1/captures`)
- **Schedule limits**: Per-tenant maximum, what happens when the limit is hit (429 response), how operators can override limits
- **Interaction with quotas**: Scheduled captures consume from the same monthly quota as on-demand captures. Document what happens when a scheduled capture fires but the quota is exhausted (does it skip silently? fail with a logged error? pause the schedule?). This is a critical design decision that must be documented clearly
- **Error patterns**: Schedule creation validation errors (invalid cron, URL validation, limit exceeded), execution failures (quota exhausted, URL unreachable), and how failures surface (webhook events, capture status)

### 3. Update existing docs site pages

Several existing guide pages reference capture submission in ways that should acknowledge schedules:

- **Getting Started (`index.md`)**: Add "Scheduled Captures" to the "What's next" card grid at the bottom. One line, one link -- no restructuring needed
- **Limits & Quotas (`limits.md`)**: Add a section explaining how scheduled captures interact with monthly quotas. Scheduled captures should be called out explicitly since users will wonder "does my cron job count against my 200/month?"
- **Authentication (`authentication.md`)**: Update the endpoint scope requirements table to include the new schedule endpoints
- **Webhooks (`webhooks.md`)**: If new webhook event types are added (e.g., `schedule.fired`, `schedule.quota_exhausted`), document them in the existing events section

### 4. README update -- minimal

The README is already well-structured and appropriately concise. It should get:

- A one-sentence mention in the Roadmap section (move "Scheduled captures" from parking lot to done/in-progress, depending on phase)
- No new usage examples in the README itself -- link to the docs site guide instead. The README pattern is "show the simplest path, link for depth"

### 5. Cron expression format deserves its own reference section

Cron syntax is deceptively familiar but varies wildly between implementations (5-field UNIX, 6-field with seconds, Quartz, AWS EventBridge, etc.). The scheduled captures guide should include a dedicated "Cron Expression Format" section that:

- States explicitly which format WRL uses (recommend standard 5-field: minute hour day-of-month month day-of-week)
- Shows a reference table of common patterns: `0 * * * *` (hourly), `0 0 * * *` (daily at midnight), `0 9 * * 1` (Monday at 9am), `*/15 * * * *` (every 15 minutes)
- Documents the **minimum interval** -- if WRL enforces a floor (e.g., no more than once per 15 minutes), state it prominently with the error response when violated
- Clarifies timezone: UTC-only is the sane default and should be stated explicitly
- Lists what is NOT supported (e.g., `@daily` shorthands, seconds field, `L`/`W`/`#` modifiers) to prevent users from guessing

### 6. No ADR needed -- but the evolution log must document the scheduling design choices

Per the project's evolution log requirements (non-negotiable per CLAUDE.md), the implementation phase must produce `decisions.md` entries covering: why cron expressions over simpler interval-only scheduling, why Cloudflare Cron Triggers as the execution mechanism, how schedule-to-capture linking was designed, and what the per-tenant schedule limit was set to and why.

An ADR is not warranted here because scheduled captures are a feature addition within an established architecture (Cloudflare Workers, D1, Queues). The technology choices are constrained by what's already in place. The evolution log captures the decisions with the same rigor.

## Proposed Tasks

### T1: Add schedule endpoints to openapi.yaml
**Scope**: Add `schedules` tag, CRUD path definitions, `Schedule`/`ScheduleId`/`CronExpression` schemas, schedule limit error responses, `scheduleId` field on capture schemas. Bump version to 0.7.0. Validate with Redocly (`npx redocly lint openapi.yaml`).
**Depends on**: API design decisions (endpoint paths, request/response shapes) must be finalized first
**Effort**: Medium

### T2: Create scheduled captures guide page
**Scope**: New file `site/content/schedules.md` following the established guide pattern (frontmatter, prerequisites, curl examples, error handling, constraints). Include cron expression reference section.
**Depends on**: T1 (needs finalized API shapes for examples)
**Effort**: Medium

### T3: Update existing docs site pages
**Scope**: Add schedule card to Getting Started "What's next" grid. Add schedule-quota interaction section to Limits & Quotas. Update Authentication scope table. Update Webhooks if new event types exist.
**Depends on**: T2 (must know what to link to)
**Effort**: Small

### T4: Update README roadmap section
**Scope**: Mark scheduled captures as done/in-progress in the roadmap. Update backlog.md to move the item from parking lot.
**Depends on**: Implementation complete
**Effort**: XS

### T5: Redocly lint validation in CI
**Scope**: Verify that the existing CI pipeline validates the updated openapi.yaml. The project already has `redocly.yaml` with `extends: recommended` -- confirm the new paths pass lint. No new CI work expected, just verification.
**Depends on**: T1
**Effort**: XS

## Risks and Concerns

### Risk 1: Cron-quota interaction is a design decision, not just a documentation decision
The most important thing to document about scheduled captures is what happens when a scheduled capture fires but the tenant's monthly quota is exhausted. This is a product design question that must be answered before documentation can be written. Options include: skip silently (bad -- user loses monitoring), fail and log (better), pause the schedule and notify via webhook (best UX but most complex). **The docs minion cannot write this section until the design is decided.** Flag this as a required input from api-design-minion or the product owner.

### Risk 2: Cron expression validation documentation must match implementation exactly
If the docs say "standard 5-field cron" but the implementation uses a library that accepts `@daily` or 6-field syntax, users will hit confusing validation errors. The documentation and implementation must be developed from the same spec. **Recommend the OpenAPI schema's `pattern` regex for `CronExpression` be the authoritative definition, and the docs cite it.**

### Risk 3: Schedule limits interact with billing
With Stripe usage-based billing now live (Phase 0058), scheduled captures will generate meter events. The docs need to clearly state whether scheduled captures are billed identically to on-demand captures (they should be -- same capture, same cost). If the billing model treats them differently, the Limits & Quotas guide needs updating. **Confirm billing treatment before writing the guide.**

### Risk 4: Docs site build validation
The docs site uses 11ty v3 with Cloudflare Workers Static Assets. Adding a new content page (`schedules.md`) requires the correct frontmatter format and navigation integration. Verify the build locally (`cd site && npm run build`) before merging. This is low-risk since the pattern is well-established, but a broken docs build should fail CI.

## Additional Agents Needed

- **api-design-minion**: Must finalize endpoint paths, request/response shapes, and cron expression format specification before documentation can be written. The OpenAPI spec update (T1) depends on these decisions.
- **ux-strategy-minion**: Should weigh in on the schedule-quota exhaustion UX -- what does the user experience when their scheduled capture can't run? This affects both the docs guide and the webhook event design.
- **test-minion**: Should verify that the OpenAPI spec additions are validated by existing Redocly lint in CI, and that any new guide examples are tested against the real API in smoke tests.
