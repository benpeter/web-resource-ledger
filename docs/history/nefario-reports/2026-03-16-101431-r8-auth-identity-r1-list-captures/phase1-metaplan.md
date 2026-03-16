# Meta-Plan: R8 Auth Identity Enrichment + R1 List Captures Endpoint

## Task Summary

Combined implementation of two dependent GitHub issues (#38 and #31):

1. **R8**: Refactor auth module to return tenant identity (`{ ok: true, tenantId }`)
   instead of `{ ok: true }`, thread tenantId through logging and KV operations,
   and scope new KV keys with tenant prefix. Single static key maps to "default" tenant.
   No external API change.

2. **R1**: New `GET /v1/captures` endpoint with cursor-based pagination, status
   filtering, and `{ data, pagination }` envelope. Requires Bearer auth. Uses
   secondary KV index `tenant:{tenantId}:ts:{ISO}:{captureId}`. OpenAPI spec
   update and README cleanup (remove "lost ID" warnings).

R8 must ship before or alongside R1 (tenant-scoped KV keys from day one).

## Planning Consultations

### Consultation 1: API contract design for list endpoint

- **Agent**: api-design-minion
- **Planning question**: Design the `GET /v1/captures` API contract: response
  envelope shape (`{ data, pagination }`), cursor-based pagination mechanics
  (cursor opaqueness, page size parameter, defaults), status filter query
  parameter, and how to structure the response items (full records vs. summary
  projections). Consider how the envelope pattern establishes convention for
  future collection endpoints. KV `list()` returns keys only -- each page of
  20 results costs 21 KV operations (1 list + 20 gets). How should this
  constraint influence page size defaults and maximums? The API contract must
  be storage-backend-agnostic for future D1 migration.
- **Context to provide**: Current OpenAPI spec (`openapi.yaml`), existing
  response patterns (`src/responses.js`), KV data model (`src/kv.js`),
  existing single-capture GET response shape (`src/index.js` handleGetCapture),
  constraint that KV `list()` is key-only with 21-op cost per page.
- **Why this agent**: The list endpoint establishes the first collection pattern
  in this API. Getting the envelope, pagination, and filtering right here sets
  precedent for all future collection endpoints. The storage constraint
  (KV list is key-only) creates tension between API ergonomics and operational
  cost that needs explicit design attention.

### Consultation 2: KV key schema and secondary index design

- **Agent**: data-minion
- **Planning question**: Design the secondary KV index for tenant-scoped
  chronological listing. The proposed format is
  `tenant:{tenantId}:ts:{ISO}:{captureId}`. Evaluate: (1) Is this key format
  optimal for KV `list(prefix)` queries? (2) How should the ISO timestamp be
  formatted for correct lexicographic ordering? (3) Should the primary key
  also change from `capture:{captureId}` to `tenant:{tenantId}:capture:{captureId}`,
  or keep it as-is? (4) Dual-write consistency: both primary key and index
  key must be written atomically-enough -- what's the failure mode if one write
  succeeds and the other fails? (5) Impact on existing data: the issue says
  migration of existing KV keys is out of scope (handled in R12), so old
  captures won't appear in listings. Is that acceptable?
- **Context to provide**: Current KV layer (`src/kv.js`), KV key format
  `capture:{captureId}`, KV API constraints (list returns keys only, no
  transactions, eventual consistency), Cloudflare KV list API behavior
  (prefix filtering, cursor, limit).
- **Why this agent**: The KV key schema is the hardest-to-reverse decision in
  this task. Wrong key format means migration pain later. The dual-write
  pattern (primary + index) needs careful failure mode analysis given KV's
  lack of transactions.

### Consultation 3: Auth refactor approach and tenantId threading

- **Agent**: security-minion
- **Planning question**: Review the auth identity enrichment approach:
  (1) `verifyApiKey()` returns `{ ok: true, tenantId: 'default' }` for the
  single static key. Is hardcoding "default" as tenantId safe for the future
  R12 (per-tenant keys) transition? (2) The list endpoint requires Bearer auth
  (no capture-ID-as-secret pattern). Should auth enforcement be factored into
  a middleware/wrapper rather than duplicated in each handler? (3) tenantId
  flows into KV key construction (`tenant:{tenantId}:...`). What validation
  should be applied to tenantId to prevent key injection (e.g., tenantId
  containing `:`)? (4) The list endpoint exposes capture metadata for all of
  a tenant's captures -- any additional auth considerations vs. the current
  per-capture-ID access model?
- **Context to provide**: Current auth module (`src/auth.js`), current auth
  call site in `handleCreateCapture` (`src/index.js:70-74`), current security
  logging pattern, the fact that capture-ID-as-secret is the current access
  model for GET endpoints.
- **Why this agent**: Auth refactor + new access model (listing all captures
  by tenant) changes the security surface. tenantId injection into KV keys is
  a subtle attack vector. The transition from per-ID-secret to Bearer-auth-for-listing
  needs security review.

### Consultation 4: Observability enrichment with tenantId

- **Agent**: observability-minion
- **Planning question**: tenantId will be threaded into all log entries. Review
  the current logging pattern (`src/log.js`) and recommend: (1) Should tenantId
  be a top-level field in the Coralogix log entry or nested in the data payload?
  (2) Are there log entries beyond the current ones in `handleCreateCapture`
  that should gain tenantId? (3) For the new list endpoint, what log events
  should be emitted (access logging, error cases, pagination metrics)?
  (4) Should the list endpoint log request latency given the <300ms SLO?
- **Context to provide**: Current log module (`src/log.js`), all current log
  call sites in `src/index.js` and `src/capture.js`, Coralogix structured
  log format.
- **Why this agent**: tenantId enrichment touches every log call site. Getting
  the logging right for the list endpoint (with its <300ms SLO) is important
  for operational visibility. This is a runtime component that needs
  coordinated observability.

### Cross-Cutting Checklist

- **Testing**: Include test-minion for planning. Both R8 and R1 produce code
  that must be tested. The auth refactor must not break 18 existing test files.
  The list endpoint needs new tests for pagination, filtering, auth enforcement,
  and edge cases (empty list, single page, multi-page). Test strategy for
  dual-write KV consistency is non-trivial.
  - **Planning question for test-minion**: What is the test strategy for the
    list endpoint pagination? KV `list()` behavior in the Vitest cloudflare:test
    environment may differ from production. How should we test cursor-based
    pagination with the test KV binding? For R8, how do we verify that tenantId
    threading is complete across all call sites without missing one? Should we
    add a test that asserts on KV key format to catch regressions?
- **Security**: Include -- covered by Consultation 3 (security-minion). Auth
  refactor and new access model are security-critical.
- **Usability -- Strategy**: Include ux-strategy-minion for planning. The list
  endpoint eliminates the "lost ID = lost capture" anti-pattern, which is the
  biggest UX pain point currently documented in the README.
  - **Planning question for ux-strategy-minion**: The list endpoint changes the
    user journey from "lose your ID, lose your capture" to "browse and recover."
    (1) What should the POST /v1/captures response change to when listing is
    available (the current `note` field warns about lost IDs)? (2) Should the
    README language change from warnings to positive capability descriptions?
    (3) The capture-ID-as-secret model remains for individual capture retrieval
    even after listing exists. Is this confusing? Should the mental model be
    reframed?
- **Usability -- Design**: Exclude. No UI components produced. API-only changes.
- **Documentation**: Include software-docs-minion for planning. OpenAPI spec
  update is in scope, README changes are in scope.
  - **Planning question for software-docs-minion**: The OpenAPI spec needs a
    new `GET /v1/captures` path with pagination parameters, new schemas for
    the list response envelope and pagination object, and query parameter
    definitions for `status` filter, `cursor`, and `limit`. The existing
    `CaptureRecord` schema references "no listing endpoint" in its description.
    What other spec descriptions need updating to remove lost-ID language?
    Should the `CaptureAccepted` schema's `note` field be changed?
- **Observability**: Include -- covered by Consultation 4 (observability-minion).
  The list endpoint is a runtime component with a <300ms SLO.

### Anticipated Approval Gates

1. **API contract for GET /v1/captures** (MUST gate) -- The response envelope
   shape, pagination mechanics, and query parameters establish a pattern for
   all future collection endpoints. Hard to reverse once clients consume it.
   High blast radius: the OpenAPI spec update, handler implementation, and
   tests all depend on this contract.

2. **KV key schema / secondary index design** (MUST gate) -- The key format
   `tenant:{tenantId}:ts:{ISO}:{captureId}` is baked into KV and cannot be
   changed without migration. Wrong format means future migration pain. Blocks
   both R8 KV changes and R1 list implementation.

That gives 2 gates, well within the 3-5 budget.

### Rationale

This task spans four primary domains:

- **API design** (api-design-minion): The list endpoint is the first collection
  endpoint and establishes pagination and envelope conventions.
- **Data modeling** (data-minion): The KV secondary index is the hardest-to-reverse
  decision and needs careful key schema design.
- **Security** (security-minion): Auth refactor changes the trust model, and
  tenantId injection into KV keys is a subtle attack vector.
- **Observability** (observability-minion): tenantId enrichment touches every
  log call site, and the list endpoint has a <300ms latency SLO.

Cross-cutting agents (test-minion, ux-strategy-minion, software-docs-minion)
are included because testing strategy for pagination is non-trivial, the list
endpoint fundamentally changes the user journey, and the OpenAPI spec is a
first-class deliverable.

Agents NOT consulted for planning:
- **ux-design-minion, accessibility-minion**: No UI components. API-only.
- **frontend-minion**: No frontend work.
- **edge-minion, iac-minion**: No infrastructure changes. Cloudflare Worker
  code only.
- **sitespeed-minion**: No web-facing pages affected.
- **mcp-minion, oauth-minion**: Not relevant to these issues.
- **ai-modeling-minion**: No prompt engineering or agent architecture work.
- **code-review-minion**: Will participate in Phase 5 post-execution, not planning.

### Scope

**In scope:**
- Auth module refactor: `verifyApiKey()` returns `{ ok: true, tenantId }`,
  single static key maps to "default"
- Handler call site updates: thread tenantId through all handlers that use auth
- KV key format: new captures get tenant-scoped keys
  (`tenant:default:ts:{ISO}:{captureId}`)
- Secondary KV index for listing (dual-write in createCapture)
- New `GET /v1/captures` handler with cursor pagination and status filter
- `{ data, pagination }` response envelope
- Bearer auth required on list endpoint
- tenantId added to all log entries
- OpenAPI spec updated with new endpoint and schemas
- README "lost ID" warnings removed/updated
- Tests for all new and changed code
- Evolution log entry for this phase

**Out of scope:**
- Per-tenant key lookup (R12)
- Key management endpoints (R12)
- Migration of existing KV keys (R12)
- URL filtering, sorting, full-text search (require D1)
- Pagination UI
- SDK generation
- Deployment changes

### External Skill Integration

No external skills detected in project (`.claude/skills/` and `.skills/`
directories do not exist in the project). User-global skills are all
despicable-agents agents or unrelated personal utilities.
