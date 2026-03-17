# Meta-Plan: R12 Per-Tenant API Keys and Tenant Isolation

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

## Planning Consultations

### Consultation 1: Auth module and key storage design

- **Agent**: security-minion
- **Planning question**: Design the KV-based API key lookup system. Specifically:
  (a) Key storage format: what does `kv.get("apikey:{sha256}")` return? What
  fields are in the record (`tenantId`, `scopes`, `createdAt`, `name`, etc.)?
  (b) How does the existing static `CAPTURE_API_KEY` env var transition to the
  first tenant key in KV? Is it a one-time migration script, or does
  `verifyApiKey()` check KV first and fall back to env var?
  (c) How does read/write scoping work? What scopes exist (`capture`, `read`,
  `admin`?) and how are they checked in request handlers?
  (d) Admin API bootstrap: what authenticates the key provisioning endpoint?
  Options: a separate `ADMIN_KEY` env var, a scope on the first tenant key,
  or something else.
  (e) Key generation: who generates the raw API key bytes? Server-generated
  and returned once, or client-provided?
  (f) Key compromise response: how does an operator revoke a single key
  without affecting other tenants?
  (g) Timing-safe comparison: current code compares raw keys. With SHA-256
  lookup, do we still need timing-safe comparison for the hash, or does the
  hash-then-lookup pattern eliminate the timing channel?
- **Context to provide**: `src/auth.js` (current implementation), `src/kv.js`
  (KV access patterns and tenant prefix), `wrangler.toml` (env bindings),
  `test/auth.test.js` (existing test coverage), the issue's success criteria
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
- **Context to provide**: `openapi.yaml` (current API spec), `src/index.js`
  (route handlers), the issue's scope/success criteria, user clarification
  that admin API not CLI
- **Why this agent**: The admin API is a new API surface with its own
  contract. api-design-minion ensures the endpoints follow existing
  conventions (RFC 9457 errors, Bearer auth, response envelopes) and that
  the v1 contract remains unbroken.

### Consultation 3: KV schema for key records and capture migration

- **Agent**: data-minion
- **Planning question**: Design the KV data model extensions for multi-tenancy.
  Specifically:
  (a) Key record schema: `apikey:{sha256(key)}` -> what JSON shape? How does
  this interact with existing KV prefixes (`capture:`, `tenant:`, `signing-key:`)?
  (b) Existing capture migration: existing captures are tagged
  `tenantId: 'default'` and indexed under `tenant:default:ts:...`. When the
  static key becomes tenant 1's key, should `default` just be the tenantId
  for tenant 1? Or rename to something meaningful? What is the migration
  path -- is it just "the tenantId stays 'default' and that's tenant 1"?
  (c) Key-to-tenant relationship: one tenant can have multiple keys (e.g.,
  a capture key and a read-only key). How is this modeled? Is there a
  `tenant:{tenantId}:keys:` index, or do we just scan `apikey:*` and filter?
  (d) Capacity: how many API keys per tenant are reasonable? Any KV
  constraints to be aware of?
- **Context to provide**: `src/kv.js` (current KV schema and access patterns),
  `wrangler.toml` (KV namespace config), Phase 0016 decisions (secondary
  index design rationale)
- **Why this agent**: data-minion owns the KV schema design and ensures the
  new key records integrate cleanly with the existing data model. The
  migration question (existing captures -> tenant 1) is a data modeling
  decision.

### Consultation 4: Observability for multi-tenant auth

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
  entries already include `tenantId` from R8.
  (d) What's the boundary between R12 observability (operational logging)
  and R13 (audit logging)?
- **Context to provide**: `src/log.js` (current logging), Phase 0015
  (Coralogix integration), Phase 0020 (hashed IP logging), the issue
  mentioning R13 depends on R12
- **Why this agent**: Multi-tenant auth creates new operational signals
  (which tenant is active, key usage patterns, scope violations) that need
  structured logging. Getting the log schema right now avoids breaking
  changes when R13 adds audit logging.

## Cross-Cutting Checklist

- **Testing**: Include test-minion for planning. The auth module rewrite
  changes a security boundary -- test-minion should advise on test strategy
  for KV-based key lookup, scope enforcement, tenant isolation, and
  migration. The existing test suite (384 tests, 19 files) has strong
  auth coverage that needs to evolve.

- **Security**: Include security-minion for planning (Consultation 1 above).
  This is the primary security-sensitive task in the backlog: auth model
  change, key storage, scope enforcement, admin API bootstrap.

- **Usability -- Strategy**: ALWAYS include. Planning question for
  ux-strategy-minion: From an operator experience perspective, what is the
  key provisioning workflow? An operator adds a second user -- what steps do
  they take? How do they understand scopes? Is the admin API
  self-explanatory, or does it need careful naming and documentation? What
  happens when a key is compromised -- is the revocation flow obvious and
  fast?

- **Usability -- Design**: Exclude from planning. R12 has no user-facing
  interface -- it is purely API endpoints and backend auth logic. No UI
  components, no visual design.

- **Documentation**: ALWAYS include. Planning question for
  software-docs-minion: What documentation artifacts need to be created or
  updated? The OpenAPI spec needs the admin API endpoints. The README needs
  updated auth documentation. OPERATIONS.md needs key provisioning
  runbooks. The existing "Getting Started" section describes a single API
  key -- it needs to explain multi-tenant setup.

- **Observability**: Include observability-minion for planning (Consultation
  4 above). Multi-tenant auth creates new operational signals that need
  structured logging before R13 adds audit logging.

## Anticipated Approval Gates

1. **Auth module + KV key storage design** (MUST gate): The key storage
   format, scope model, and admin bootstrap mechanism are hard to reverse
   once implemented and every other task depends on them. This is the
   critical architectural decision.

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
key management system. The planning consultations are structured around
the three critical design decisions:

1. **Security-minion** owns the auth design: key storage, scope model,
   timing-safe comparison strategy, admin bootstrap. Getting this wrong
   creates exploitable auth bypasses.

2. **api-design-minion** owns the API contract: the admin endpoints are
   new API surface that must follow existing conventions and remain
   stable. The v1 contract must remain unbroken.

3. **data-minion** owns the KV schema: key records must integrate with
   the existing data model, and the migration path must preserve existing
   captures.

4. **observability-minion** ensures operational visibility: multi-tenant
   auth creates new signals that need logging before R13 adds formal
   audit trails.

Cross-cutting agents (test-minion, ux-strategy-minion, software-docs-minion)
are included because auth changes require comprehensive test coverage,
the operator workflow must be intuitive, and documentation must be
accurate on day one.

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
