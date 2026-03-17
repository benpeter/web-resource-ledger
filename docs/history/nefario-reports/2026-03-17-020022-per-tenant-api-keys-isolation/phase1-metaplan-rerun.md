# Meta-Plan: R12 Per-Tenant API Keys and Tenant Isolation (Revised)

## Context

R12 transforms WRL from a single-operator service (one static `CAPTURE_API_KEY`
env var) into a multi-tenant service where each operator has their own API
key(s) with scoped permissions. The current auth module (`src/auth.js`) already
returns `{ tenantId: 'default' }` and the KV layer (`src/kv.js`) already uses
`tenant:{tenantId}:` secondary index keys -- these were deliberately set up in
Phase 0016 (R8) as scaffolding for R12.

### User clarifications

- **Admin key**: The issue does not define what the "admin" key is. The user
  clarifies that the existing static key should implicitly become tenant 1's
  key -- no separate admin concept unless needed for key provisioning.
- **Key provisioning**: Must happen via an admin API endpoint, not CLI. CLI
  may wrap the admin API later but is not in scope for R12.
- **Open question**: What authenticates the admin API itself? The existing
  static key becoming the first tenant key means there needs to be a
  bootstrap mechanism. This is a critical design decision that planning must
  resolve.

### Key architectural facts

- Platform: Cloudflare Workers (KV, R2, rate limiters, Browser Rendering)
- Auth today: single `CAPTURE_API_KEY` env var, timing-safe comparison in
  `verifyApiKey()`, hardcoded `tenantId = 'default'`
- KV schema: primary `capture:{captureId}`, secondary `tenant:{tenantId}:ts:{ISO}:{captureId}`
- Tenant ID regex: `/^[a-z0-9_-]{1,64}$/` (validated in both auth.js and kv.js)
- Rate limiting: per-IP via Cloudflare rate limiter bindings (not per-tenant)
- The issue explicitly excludes OAuth, RBAC beyond read/write, admin web UI, billing
- Dependencies: R1 (list endpoint) and R8 (auth identity) are both DONE
- Constraint: gated on multi-user decision -- this is a planning exercise, not
  immediate implementation

### Team composition (revised)

The original team included data-minion, software-docs-minion, ux-strategy-minion,
and test-minion alongside security-minion, api-design-minion, and
observability-minion. The revised team replaces those four with edge-minion and
iac-minion, reflecting the user's focus on infrastructure and deployment concerns
for the multi-tenant transition. The revised team is:

- **security-minion** -- auth design, threat model, key storage (retained)
- **api-design-minion** -- admin API contract, endpoint changes (retained)
- **observability-minion** -- logging schema for multi-tenant auth (retained)
- **edge-minion** -- rate limiting strategy, CDN caching implications (added)
- **iac-minion** -- wrangler config, secrets management, deployment (added)

## Planning Consultations

### Consultation 1: Auth module, key storage design, and admin bootstrap

- **Agent**: security-minion
- **Planning question**: Design the KV-based API key lookup system and the
  admin API's own authentication. Specifically:
  (a) Key storage format: what does `kv.get("apikey:{sha256}")` return? What
  fields are in the record (`tenantId`, `scopes`, `createdAt`, `name`, etc.)?
  (b) How does the existing static `CAPTURE_API_KEY` env var transition to the
  first tenant key in KV? Is it a one-time migration script, or does
  `verifyApiKey()` check KV first and fall back to env var?
  (c) How does read/write scoping work? What scopes exist (`capture`, `read`,
  `admin`?) and how are they checked in request handlers?
  (d) Admin API bootstrap: what authenticates the key provisioning endpoint?
  The user says the existing static key becomes tenant 1's key -- does it also
  get an `admin` scope? Or is there a separate `ADMIN_KEY` env var? Design
  the bootstrap so a cold-start deployment can provision its first tenant key
  via the admin API without a chicken-and-egg problem.
  (e) Key generation: who generates the raw API key bytes? Server-generated
  and returned once, or client-provided?
  (f) Key compromise response: how does an operator revoke a single key
  without affecting other tenants?
  (g) Timing-safe comparison: current code compares raw keys. With SHA-256
  lookup, do we still need timing-safe comparison for the hash, or does the
  hash-then-lookup pattern eliminate the timing channel?
  (h) Scope enforcement boundaries: where in the request pipeline are scopes
  checked? Should `verifyApiKey()` return scopes and let each handler check,
  or should there be a middleware-like pattern?
  Note: edge-minion will address rate limiting changes separately -- focus on
  auth logic, key storage, and scope enforcement.
- **Context to provide**: `src/auth.js` (current implementation), `src/kv.js`
  (KV access patterns and tenant prefix), `wrangler.toml` (env bindings),
  the issue's success criteria
- **Why this agent**: Security owns the threat model for auth systems. Key
  storage format, scope enforcement, and the admin bootstrap problem are
  security-critical design decisions where a wrong choice creates
  exploitable gaps.

### Consultation 2: API contract for admin and tenant-scoped endpoints

- **Agent**: api-design-minion
- **Planning question**: Design the admin API for key provisioning and any
  changes to existing endpoints. Specifically:
  (a) Admin endpoint design: `POST /v1/admin/keys` to create a key,
  `DELETE /v1/admin/keys/{keyId}` to revoke, `GET /v1/admin/keys` to list?
  What request/response schemas? What authentication (the `admin` scope from
  security-minion's design)?
  (b) Do existing endpoints (`POST /v1/captures`, `GET /v1/captures`,
  `GET /v1/captures/{id}`) need any API contract changes for multi-tenancy?
  The user says "v1 API contract unbroken" -- confirm this holds.
  (c) How does the capture retrieval endpoint (`GET /v1/captures/{id}`)
  enforce tenant isolation? Currently it uses captureId as an access secret
  with no auth. Does R12 change this, or is unauth access by capture ID
  still the model?
  (d) Error responses: any new error codes or problem types for scope
  violations (e.g., read-only key tries to create a capture)?
  (e) How does scoping interact with the list endpoint? A read-only key
  should still be able to list captures for its tenant, right?
  (f) Admin endpoint rate limiting: should admin endpoints have their own
  rate limiter binding, or reuse existing ones? Note that edge-minion will
  advise on rate limiter implementation -- focus on the API contract (headers,
  response codes, Retry-After semantics).
- **Context to provide**: `openapi.yaml` (current API spec), `src/index.js`
  (route handlers), `src/responses.js` (RFC 9457 error format), the issue's
  scope/success criteria, user clarification that admin API not CLI
- **Why this agent**: The admin API is a new API surface with its own
  contract. api-design-minion ensures the endpoints follow existing
  conventions (RFC 9457 errors, Bearer auth, response envelopes) and that
  the v1 contract remains unbroken.

### Consultation 3: Rate limiting strategy for multi-tenant auth

- **Agent**: edge-minion
- **Planning question**: Design the rate limiting strategy changes needed for
  multi-tenant API keys. Specifically:
  (a) Per-IP rate limiting is retained as a secondary control (issue
  requirement). Should per-tenant rate limiting be added in R12, or is that
  a follow-on? The backlog has `[consider] Per-tenant rate limiting` in the
  parking lot with condition "when R12 ships." Does R12 need to lay
  groundwork for it even if it doesn't implement it?
  (b) Admin endpoints (`/v1/admin/keys`) need rate limiting. Should they
  get their own Cloudflare rate limiter binding (separate `namespace_id` in
  wrangler.toml), or reuse an existing one? The admin API is low-volume
  but high-impact -- what limits are appropriate?
  (c) Caching implications: currently `GET /v1/captures/{id}` and artifact
  endpoints use `Cache-Control: public, max-age=31536000, immutable` for
  artifacts and `private, no-store` for metadata. Does multi-tenancy change
  any caching behavior? With tenant isolation, are there cache poisoning
  risks if a CDN layer is added later (parking lot item: Fastly CDN)?
  (d) The current global rate limiter (`GLOBAL_CAPTURE_LIMITER`, 200/min)
  protects service capacity. With multiple tenants, should this remain
  global or should each tenant get a capacity share? Consider the Cloudflare
  rate limiter binding model -- each binding is a separate `namespace_id`.
  (e) Key lookup adds a KV read to every authenticated request. Is this
  latency-acceptable given the `<300ms uncached` latency constraint from
  CLAUDE.md? KV reads are ~10-40ms at the edge. Should key lookup results
  be cached in-memory (Workers have no persistent memory, but
  `caches.default` exists)?
- **Context to provide**: `wrangler.toml` (rate limiter bindings, namespaces),
  `src/rate-limits.js` (current rate limit constants), `src/index.js`
  (rate limit check flow), the issue's success criteria, backlog parking
  lot items related to rate limiting and CDN
- **Why this agent**: edge-minion owns CDN, caching, and rate limiting
  strategy. Multi-tenant auth changes who gets rate-limited (IP vs tenant vs
  both) and how admin endpoints are protected. The latency impact of KV key
  lookup on every request is an edge performance concern.

### Consultation 4: Wrangler configuration, secrets management, and deployment

- **Agent**: iac-minion
- **Planning question**: Design the infrastructure changes needed for
  multi-tenant API key management. Specifically:
  (a) Secrets management: `CAPTURE_API_KEY` is currently a wrangler secret
  (set via `wrangler secret put`). With KV-based key lookup, does this secret
  remain (for backward compatibility / fallback), get removed after migration,
  or get repurposed as `ADMIN_KEY`? What about the bootstrap scenario -- how
  does a fresh deployment provision its first key?
  (b) If the admin API needs its own secret (e.g., `ADMIN_KEY` env var for
  bootstrap), how is it managed? `wrangler secret put ADMIN_KEY` for both
  production and staging? Does this affect the existing deployment pipeline
  (`deploy-production.yml`, `deploy-staging.yml`)?
  (c) New wrangler.toml bindings: if edge-minion recommends a new rate limiter
  for admin endpoints, that means a new `[[unsafe.bindings]]` entry with a
  new `namespace_id`. Are there any Cloudflare account-level constraints on
  rate limiter namespaces?
  (d) KV namespace capacity: the existing KV namespace holds capture records
  and signing keys. Adding `apikey:{hash}` records is trivial in volume
  (dozens, not millions). Any operational concerns?
  (e) Staging parity: the staging environment (`env.staging` in wrangler.toml)
  needs the same multi-tenant config. How do we ensure staging and production
  stay in sync for new bindings and secrets?
  (f) GitHub Actions: does the CD pipeline need changes to support the new
  secrets or bindings? Currently `deploy-production.yml` runs
  `wrangler deploy` -- does it need additional steps?
- **Context to provide**: `wrangler.toml` (full file including staging),
  `.github/workflows/` (deployment pipelines), `src/auth.js` (current
  CAPTURE_API_KEY usage)
- **Why this agent**: iac-minion owns infrastructure provisioning, deployment
  pipelines, and secrets management. The transition from a single env var to
  KV-based keys has direct implications for wrangler configuration, CI/CD
  pipelines, and the staging environment.

### Consultation 5: Observability for multi-tenant auth

- **Agent**: observability-minion
- **Planning question**: What logging and metrics changes are needed for
  multi-tenant auth? Specifically:
  (a) Auth events: what should be logged on key lookup (success with
  tenantId + key name, failure with hashed attempt), key provisioning
  (creation, revocation), scope violations?
  (b) Per-tenant metrics: should we log per-tenant capture counts, rate
  limit hits, etc. for operational visibility? Or is that R13 (audit
  logging)?
  (c) How do the existing Coralogix log entries need to change? Current
  entries already include `tenantId` from R8. The `security` subsystem
  already logs `security.auth_fail` and `security.rate_limit`. What new
  event types are needed for KV key lookup, scope violations, and admin
  API operations?
  (d) What's the boundary between R12 observability (operational logging)
  and R13 (audit logging)? R13 depends on R12 and is explicitly out of
  scope, but R12's log schema should be forward-compatible with R13.
  (e) Admin API observability: key provisioning (create, revoke, list) is a
  high-sensitivity operation. What severity level should these events use?
  Should they go to a separate Coralogix subsystem (e.g., `admin`) or use
  the existing `security` subsystem?
  Note: focus on log schema and event types, not rate limiter metrics
  (edge-minion handles that) or infrastructure (iac-minion handles that).
- **Context to provide**: `src/log.js` (current logging implementation and
  contract), `src/index.js` (existing log calls with event names, severity
  levels, and subsystems), Phase 0015 (Coralogix integration), Phase 0020
  (hashed IP logging)
- **Why this agent**: Multi-tenant auth creates new operational signals
  (which tenant is active, key usage patterns, scope violations) that need
  structured logging. Getting the log schema right now avoids breaking
  changes when R13 adds audit logging.

## Cross-Cutting Checklist

- **Testing**: Exclude from planning consultations (test-minion removed from
  team). However, testing remains a cross-cutting concern for execution.
  Phase 3.5 architecture review will include test-minion as a mandatory
  reviewer. The auth module rewrite changes a security boundary -- test
  strategy for KV-based key lookup, scope enforcement, tenant isolation,
  and migration will be addressed during architecture review and Phase 6
  (test execution).

- **Security**: Include security-minion for planning (Consultation 1 above).
  This is the primary security-sensitive task in the backlog: auth model
  change, key storage, scope enforcement, admin API bootstrap.

- **Usability -- Strategy**: Exclude from planning consultations
  (ux-strategy-minion removed from team). This is a backend API change with
  no user-facing interface. The operator experience (key provisioning
  workflow, scope comprehension, revocation flow) will be evaluated during
  Phase 3.5 architecture review where ux-strategy-minion participates as a
  mandatory reviewer. The admin API naming and error messages from
  api-design-minion's consultation cover the most critical usability
  concerns within the current team.

- **Usability -- Design**: Exclude from planning. R12 has no user-facing
  interface -- it is purely API endpoints and backend auth logic. No UI
  components, no visual design.

- **Documentation**: Exclude from planning consultations (software-docs-minion
  removed from team). Documentation updates (OpenAPI spec, README auth
  section, OPERATIONS.md key provisioning runbook) will be handled in
  Phase 8 (post-execution documentation). api-design-minion's consultation
  covers the API contract design that documentation will describe.

- **Observability**: Include observability-minion for planning (Consultation 5
  above). Multi-tenant auth creates new operational signals that need
  structured logging before R13 adds audit logging.

## Anticipated Approval Gates

1. **Auth module + KV key storage design** (MUST gate): The key storage
   format, scope model, and admin bootstrap mechanism are hard to reverse
   once implemented and every other task depends on them. This is the
   critical architectural decision. Combines security-minion's design with
   iac-minion's secrets management recommendation.

2. **Admin API contract** (MUST gate): The admin endpoints are a new API
   surface. Once shipped, the contract is locked. High blast radius
   because key provisioning tooling and documentation depend on it.

3. **Migration strategy** (OPTIONAL gate): How the existing static key
   becomes tenant 1's key. Easy to reverse if the approach is
   backward-compatible (which it should be by requirement), but worth
   reviewing given the "no breaking change" constraint.

## Rationale

R12 is the most security-sensitive feature in the WRL backlog. It
transforms the auth model from a single shared secret to a multi-tenant
key management system. The revised team adds infrastructure and edge
expertise while relying on post-execution phases for testing,
documentation, and UX review.

The five planning consultations form a coherent set with minimal overlap:

1. **security-minion** owns the auth design: key storage, scope model,
   timing-safe comparison strategy, admin bootstrap. The core security
   architecture that everything else depends on.

2. **api-design-minion** owns the API contract: the admin endpoints are
   new API surface that must follow existing conventions and remain
   stable. The v1 contract must remain unbroken. References
   security-minion's scope model but does not redesign it.

3. **edge-minion** owns rate limiting and caching: multi-tenant auth
   changes who gets rate-limited and how. The latency impact of KV key
   lookup is an edge performance concern. References but does not
   redesign the API contract or auth model.

4. **iac-minion** owns infrastructure: wrangler secrets, deployment
   pipeline changes, staging parity. The transition from env var to
   KV-based keys has direct deployment implications. References
   security-minion's bootstrap design and edge-minion's rate limiter
   recommendations.

5. **observability-minion** owns the logging schema: new event types for
   multi-tenant operations, forward-compatible with R13's audit logging.
   References the auth flow and admin API but does not design them.

Cross-cutting agents removed from the planning team (test-minion,
ux-strategy-minion, software-docs-minion) remain active through
mandatory architecture review (Phase 3.5) and post-execution phases
(5, 6, 8).

## Scope

**In scope (R12)**:
- New auth module: KV-based key lookup replacing static env var comparison
- Key record schema in KV (`apikey:{hash}` -> `{ tenantId, scopes, ... }`)
- Read/write key scoping (capture vs read-only)
- Admin API endpoints for key provisioning (create, revoke, list)
- Tenant isolation enforcement on `GET /v1/captures` (already scoped by
  tenant from R8)
- Migration path: existing static key becomes first tenant's key with no
  breaking change
- Per-IP rate limiting retained alongside per-tenant identity

**Out of scope**:
- OAuth, social signup, RBAC beyond read/write
- Admin web UI
- Billing
- Audit logging (that is R13, depends on R12)
- Per-tenant rate limiting (parking lot item, revisit after R12)
- CLI tooling (may wrap admin API later, not R12 scope)

## External Skill Integration

No external skills detected in project.
