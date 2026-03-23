# Meta-Plan: Content Security Scanning (Safe Browsing)

## Planning Consultations

### Consultation 1: Safe Browsing API Integration Design
- **Agent**: security-minion
- **Planning question**: What is the correct integration pattern for Google Safe Browsing on a Cloudflare Worker? Specifically: (1) Should WRL use the Lookup API v4 or the Update API v5 with local hashing? The constraint is <200ms added latency for pre-capture checks, and Workers have no persistent filesystem for local hash databases. (2) What is the right quarantine model -- should quarantined captures remain accessible to the owning tenant via metadata endpoints, or should metadata also be restricted? (3) How should the re-scan cron handle URLs that were safe at capture time but are now flagged -- what should the quarantine transition look like (status field change, separate quarantine table, or flag column)? (4) Should the Safe Browsing API key be a per-tenant secret or a platform-level secret? Consider the current architecture where secrets are set via `wrangler secret put` and there is one Worker instance serving all tenants.
- **Context to provide**: `src/url-validation.js` (existing SSRF prevention), `src/index.js` handleCreateCapture flow (lines 595-755), `src/scheduler.js` (existing cron pattern), `src/db.js` (D1 schema, captures table shape), `wrangler.toml` (existing cron trigger at `*/1 * * * *`), the issue spec's <200ms latency constraint and graceful degradation requirement.
- **Why this agent**: Security owns threat modeling for the capture pipeline. Safe Browsing is a security control -- the integration pattern (Lookup vs Update API), quarantine model, and failure mode design all have security implications. The wrong quarantine model could either leak malicious content or destroy evidence that has compliance value.

### Consultation 2: Database Schema for Quarantine
- **Agent**: data-minion
- **Planning question**: What D1 schema changes are needed to support quarantine? Options include: (1) Adding `quarantine_status` and `quarantine_reason` columns to the existing `captures` table, (2) A separate `quarantine_events` table with foreign key to captures, (3) Overloading the existing `status` column with a 'quarantined' value. Consider: the `status` column currently drives the artifact retrieval gate (`status === 'complete'`), the `rowToCapture()` function in db.js that maps all columns, the existing migration chain (0001-0008), and the need for the re-scan cron to efficiently query "all complete captures with URLs not checked in the last N hours." Also consider: should we store the last Safe Browsing check timestamp and result per capture to avoid redundant API calls?
- **Context to provide**: `migrations/0007_schedules.sql` (latest migration pattern), `src/db.js` (rowToCapture, createCapture, completeCapture, getCapture, listCaptures), captures table schema, the issue spec's requirement that quarantined captures preserve metadata but restrict artifact access.
- **Why this agent**: Schema design for quarantine has high blast radius -- it affects the captures table that every endpoint reads, the artifact retrieval gate, and the list/filter API. Getting the schema wrong means a hard-to-reverse migration.

### Consultation 3: API Contract for Rejection and Quarantine Responses
- **Agent**: api-design-minion
- **Planning question**: How should the API surface Safe Browsing results? Specifically: (1) Pre-capture rejection: the issue says HTTP 422 with threat type. Should this use the existing RFC 7807 problem+json format with an extension field for `threatType`? What should the error detail say? (2) Quarantined artifact access: the issue says HTTP 451 (Unavailable For Legal Reasons). Is 451 the right status? The RFC says it's for legal demands, but Safe Browsing is a reputation service, not a legal order. Alternatives: 403 with a specific error code, or 451 since it's the closest semantic fit. (3) Should the capture metadata endpoint (GET /v1/captures/{id}) still return full metadata for quarantined captures, or should it include a restricted view? (4) Should `status: "quarantined"` appear in list endpoint results, or should quarantined captures be filtered by default with an opt-in query parameter? Consider the existing OpenAPI spec, the `problemResponse()` helper, and the precedent set by how `status: "failed"` captures are handled.
- **Context to provide**: `openapi.yaml` (existing response schemas), `src/responses.js` (problemResponse helper), the existing status values ('pending', 'complete', 'failed'), the artifact retrieval handler (lines 1350-1400 of index.js), the list captures endpoint with its `status` filter parameter.
- **Why this agent**: API contract design has downstream dependents (OpenAPI spec update, client SDK behavior, UI display). Getting the status code and response shape wrong is visible to every consumer.

### Consultation 4: Cron Architecture for Background Re-scan
- **Agent**: iac-minion
- **Planning question**: How should the background re-scan cron be structured given the existing cron architecture? The current `*/1 * * * *` trigger handles scheduled capture fan-out via `handleScheduledTick()`. Options: (1) Add a second cron trigger expression (e.g., daily at 03:00 UTC) to `wrangler.toml` and dispatch to a new handler based on `controller.cron`, (2) Use the existing per-minute trigger with a "is it time for a re-scan?" check inside the handler (simpler but couples concerns), (3) A separate Worker for re-scanning. Consider: the Cloudflare Workers cron trigger model (multiple crons → single `scheduled()` handler, distinguished by `controller.cron`), the Safe Browsing Lookup API's batch capability (up to 500 URLs per request), and the need to page through all complete captures without exceeding the Worker CPU limit (60s). Also: what are the quota limits on Google Safe Browsing Lookup API v4 and how does batching affect them?
- **Context to provide**: `wrangler.toml` (existing cron trigger, queue config, CPU limits), `src/scheduler.js` (existing scheduled handler pattern), `src/index.js` scheduled() export handler, the issue spec's "daily re-scan" requirement.
- **Why this agent**: Infrastructure agent understands Cloudflare Workers constraints (CPU time limits, cron trigger dispatch model, queue architecture). The re-scan needs to iterate potentially thousands of captures within Worker limits.

### Consultation 5: Observability and Alerting for Quarantine Events
- **Agent**: observability-minion
- **Planning question**: What logging events and Coralogix alerts should the Safe Browsing integration produce? The issue requires a Coralogix alert when flagged-capture count exceeds a threshold (>5 in 24h). Consider: (1) What structured log events are needed? At minimum: `safebrowsing.check` (per URL check with result), `safebrowsing.quarantine` (when a capture is quarantined), `safebrowsing.rescan_tick` (re-scan cron summary), `safebrowsing.api_fail` (API degradation). (2) The alert should use the same provisioning pattern as the existing 4 alerts in `scripts/provision-alerts.sh`. (3) Should there be a separate alert for Safe Browsing API failures (degradation monitoring), or is the existing worker-errors alert sufficient? (4) What severity levels for each event? Consider the existing logging patterns in `src/log.js` and the Coralogix alert provisioning script.
- **Context to provide**: `src/log.js` (log function signature, severity conventions, content safety rules), `scripts/provision-alerts.sh` (existing alert provisioning pattern), `docs/operations/alerts.md` (existing alert definitions), the 4 existing alert rules and their thresholds.
- **Why this agent**: Observability owns the alerting design. The quarantine alert is a key deliverable, and the log event design determines what is queryable in Coralogix for incident response.

### Cross-Cutting Checklist

- **Testing**: Include test-minion for planning. The Safe Browsing integration touches the capture hot path (pre-capture check), the cron handler (re-scan), the artifact retrieval gate (quarantine blocking), and the D1 schema (migration). Each of these has existing test files. Planning question: What test strategy covers the Safe Browsing client without hitting the real API in unit tests? The existing pattern uses injectable resolvers (see `url-validation.js` DNS injection). Should we mock the Safe Browsing API similarly? What integration test should verify end-to-end quarantine behavior?
- **Security**: Include -- security-minion is Consultation 1 (primary).
- **Usability -- Strategy**: ALWAYS include. Planning question: How does quarantine affect the tenant experience? When a capture is quarantined, the tenant submitted it in good faith (the URL was clean at capture time). What should the Web UI show? What error message explains quarantine without alarming the tenant? Should there be any self-service path for tenants to see why a capture was quarantined (threat type) or is that an admin-only concern?
- **Usability -- Design**: Exclude from planning. No new UI views are being created. The quarantine status will appear in existing capture detail/list views using existing UI patterns. The Web UI changes are minimal (displaying a "quarantined" badge/status and the 451 error message).
- **Documentation**: ALWAYS include. Planning question for software-docs-minion: What documentation updates are needed? At minimum: OpenAPI spec (new error responses, new query parameter, new status value), OPERATIONS.md (new alert), a runbook for quarantine investigation. Should the public API documentation explain what quarantine means and how Safe Browsing is used?
- **Observability**: Include -- observability-minion is Consultation 5.

### Notable Exclusions

- **edge-minion**: Safe Browsing API calls are made from the Worker, not from CDN edge logic. No caching layer or CDN configuration changes are involved.
- **oauth-minion**: No authentication flow changes. Safe Browsing uses a simple API key, not OAuth. The quarantine feature does not change auth behavior.
- **ai-modeling-minion**: No prompt engineering, agent definitions, or multi-agent architecture changes in this feature.

### Anticipated Approval Gates

1. **D1 schema design** (MUST gate) -- The quarantine schema change to the captures table is hard to reverse (migration) and has high blast radius (every endpoint reads captures). data-minion's schema recommendation should be approved before implementation begins.
2. **API contract for quarantine responses** (MUST gate) -- The choice of HTTP status codes (422 vs 400 for rejection, 451 vs 403 for quarantine artifact access), response shape, and list endpoint filtering behavior locks in the public API contract. api-design-minion's recommendation should be approved before coding.
3. **Safe Browsing API choice** (OPTIONAL gate) -- Lookup API v4 vs Update API v5 is a significant architectural choice, but if the latency constraint clearly favors one option within Workers constraints, it may not need explicit approval.

### Rationale

This task spans five domains: security (threat model, API integration), data (schema design), API design (contract changes), infrastructure (cron architecture), and observability (alerting). Each domain contributes decisions that constrain the others -- the schema design determines what the API returns, the cron architecture determines how re-scanning works, and the security model determines what quarantine means.

The consultations are ordered by dependency: security-minion's API choice (Lookup vs Update) affects iac-minion's cron architecture (batch size, frequency). data-minion's schema design affects api-design-minion's response shapes. observability-minion's logging design depends on knowing what events exist.

ux-strategy-minion's input is critical because quarantine is a negative experience for tenants -- they submitted a URL that was fine, and now their capture is restricted. The messaging and UX around this needs care.

### Scope

**In scope**:
- New module `src/safe-browsing.js` -- Google Safe Browsing Lookup API v4 client with batch support
- Pre-capture URL check in `handleCreateCapture` and `handleBatchCapture` (between URL validation and capture creation)
- Pre-capture URL check in `scheduler.js` for scheduled captures
- D1 migration (0009) adding quarantine columns to captures table
- Background re-scan cron (new or extended) that checks existing complete captures
- Quarantine transition logic in `src/db.js`
- Artifact retrieval gate update in `handleGetCaptureArtifact` (HTTP 451 for quarantined)
- Capture metadata updates (quarantine fields in `rowToCapture`, list/get responses)
- OpenAPI spec update with new error responses and status values
- Coralogix log events for Safe Browsing checks, quarantines, API failures
- Coralogix alert rule for quarantine threshold
- Graceful degradation when Safe Browsing API is unavailable
- Worker secret: `SAFE_BROWSING_API_KEY`
- Unit tests for Safe Browsing client, quarantine logic, cron re-scan
- Integration test for end-to-end quarantine flow

**Out of scope**:
- Content-level scanning (page body analysis, image classification)
- Tenant appeal/unquarantine workflow (admin-only manual process for now)
- Real-time threat feed beyond Safe Browsing
- Scanning of non-URL content (e.g., uploaded files)
- Web UI changes beyond displaying quarantine status in existing views
- Update API v5 local hash database (unless Lookup API latency is unacceptable)

### External Skill Integration

No external skills detected in project.
