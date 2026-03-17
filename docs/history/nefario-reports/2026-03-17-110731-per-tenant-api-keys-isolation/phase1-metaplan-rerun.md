# Meta-Plan: Per-Tenant API Keys and Tenant Isolation (R12)

## Task Summary

Implement multi-tenant API key authentication for WRL. Replace the single
`CAPTURE_API_KEY` environment variable with KV-based key lookup, add admin
API endpoints for key provisioning, enforce per-tenant capture isolation,
and provide a migration runbook from current single-key to multi-tenant auth.

The design decisions are pre-resolved by advisory (2026-03-17): admin key
is a separate infrastructure credential, three-scope model
(`capture`/`read`/`admin`), server-generated 256-bit keys with `wrl_live_`
prefix, soft-delete revocation, dedicated admin rate limiter.

## Planning Consultations

### Consultation 1: Auth Module and Key Lifecycle Security

- **Agent**: security-minion
- **Planning question**: Given the pre-resolved design (KV-based key lookup
  via `apikey:{sha256hex}`, three scopes `capture`/`read`/`admin`, `ADMIN_KEY`
  as infrastructure secret, dual-mode fallback for `CAPTURE_API_KEY` during
  migration), what is the correct implementation sequence to avoid security
  gaps during the transition? Specifically: (1) How should the dual-mode
  auth fallback be implemented so the legacy key cannot escalate to admin
  scope? (2) What timing-safe comparison approach is needed when switching
  from direct string compare to KV-based hash lookup? (3) What are the
  security-critical ordering constraints between deploying the code, setting
  `ADMIN_KEY`, and provisioning the first tenant key? (4) What should the
  admin API authorization check look like (ADMIN_KEY env var check vs.
  KV-stored admin-scoped key)? (5) What are the injection/bypass risks
  for the `apikey:{sha256hex}` key pattern in KV (e.g., crafted key values
  that collide with other KV prefixes)?
- **Context to provide**: `src/auth.js` (current implementation -- timing-safe
  comparison, tenant contract, TENANT_ID_RE validation), `src/index.js`
  (route table and handler flow), `src/kv.js` (KV data model with
  `capture:`, `tenant:`, `signing-key:` prefixes), `wrangler.toml`
  (bindings and secrets), `OPERATIONS.md` (secret surfaces).
- **Why this agent**: The auth module is the trust boundary. Security-minion
  needs to validate the implementation approach for KV-based key lookup,
  scope enforcement, and the migration path to ensure no window of
  vulnerability during transition.

### Consultation 2: Admin API and OpenAPI Contract Design

- **Agent**: api-design-minion
- **Planning question**: The advisory specifies three admin endpoints
  (`POST/GET/DELETE /v1/admin/keys`). Design the request/response contracts
  for each endpoint: (1) What should `POST /v1/admin/keys` accept as input
  (tenantId, scopes, name) and return (including the one-time raw key
  display)? (2) What should `GET /v1/admin/keys` return and should it
  support filtering by tenant/scope? (3) What should `DELETE /v1/admin/keys/{keyHash}`
  return and how does soft-delete surface in subsequent GET responses?
  (4) How should the scope `capture implies read` be represented in the
  API contract? (5) How should 403 responses name the required scope per
  the advisory decision? (6) Should revoked keys appear in GET responses
  by default or require an explicit `?include=revoked` filter?
  Consider consistency with the existing v1 API patterns (RFC 9457 problem
  responses, `application/json` content type, existing auth flow, existing
  pagination pattern in `GET /v1/captures`).
- **Context to provide**: `openapi.yaml` (existing API spec -- version 0.4.0,
  RFC 9457 problem responses, bearer auth scheme, pagination pattern),
  `src/responses.js` (problem response pattern with titles map),
  `src/index.js` (existing route patterns, handler structure).
- **Why this agent**: The admin API is a new surface that must be consistent
  with the existing v1 API conventions. The request/response contracts
  need to be right before implementation -- they are the hardest thing to
  change after deployment.

### Consultation 3: KV Data Model and Tenant Isolation

- **Agent**: data-minion
- **Planning question**: The current KV model uses `capture:{captureId}` for
  primary records and `tenant:{tenantId}:ts:{ISO}:{captureId}` for the
  secondary index. The new auth model adds `apikey:{sha256hex}` records.
  (1) What is the correct KV schema for the key records (exact fields,
  TTLs)? (2) How should the existing capture records (which already have
  `tenantId: 'default'`) be treated -- do they need migration or are they
  already correctly tagged? (3) What consistency guarantees matter for
  key revocation (60s KV eventual consistency is accepted per advisory)?
  (4) Should key records have any expiration/TTL or persist indefinitely?
  (5) How should the `createdBy` field in key records work (admin key
  has no identity beyond "admin")? (6) What is the key count upper bound
  we should design for -- do we need a `tenant:{tenantId}:keys:` secondary
  index for listing keys, or is a full `apikey:` prefix scan acceptable?
- **Context to provide**: `src/kv.js` (full data model -- `capture:`,
  `tenant:`, `signing-key:` prefixes, tenantPrefix validation, secondary
  index pattern), `src/auth.js` (current auth flow and tenantId contract).
- **Why this agent**: KV schema changes are hard to reverse in production
  with existing data. The data model for API keys needs to be right the
  first time, especially around the hash-based lookup pattern and
  interaction with existing tenant-scoped capture records.

### Consultation 4: Observability Enrichment

- **Agent**: observability-minion
- **Planning question**: The advisory specifies enriching existing log events
  with `keyName`/`reason` fields and adding a new `admin` subsystem for
  `key_create`/`key_revoke` events. (1) Which existing log events in
  `src/index.js` and `src/capture.js` need `keyName` enrichment (enumerate
  them -- there are currently `security.auth_fail`, `security.rate_limit`,
  `security.capacity_limit`, `security.ssrf_block`, `capture.*`, `list.*`
  events)? (2) What fields should `admin.key_create` and `admin.key_revoke`
  events include? (3) Should auth failures from KV lookup include the key
  hash prefix for debugging, or is that a security risk? (4) What
  severity levels are appropriate for admin operations? (5) How should
  the dual-mode fallback period be observable (so operators can tell when
  all traffic has migrated to KV-based keys)? (6) Should the `reason`
  field distinguish between "key not found", "key revoked", "scope
  insufficient", and "legacy fallback used"?
- **Context to provide**: `src/log.js` (logging module -- Coralogix
  integration, severity levels, safety invariant on attacker-controlled
  input), `src/index.js` (existing log calls with events and fields),
  `src/capture.js` (capture pipeline logging).
- **Why this agent**: The advisory explicitly calls out observability
  enrichment. This needs to be planned before implementation so the
  logging contract is consistent across all new and modified code paths.

### Consultation 5: Edge Worker Configuration

- **Agent**: edge-minion
- **Planning question**: The advisory specifies a dedicated
  `ADMIN_RATE_LIMITER` binding (5/min) with rate check before auth.
  (1) What wrangler.toml changes are needed for both production and
  staging (new rate limiter binding, namespace IDs)? (2) How should admin
  routes interact with the existing per-IP rate limiters (the capture and
  verify limiters are already defined with namespace IDs 1001-1003 and
  2001-2003)? (3) Should admin endpoints have CORS handling or are
  they always server-to-server? (4) What security headers should admin
  responses include (the existing global headers pipeline adds
  Referrer-Policy, X-Content-Type-Options, etc.)? (5) Do the admin
  routes need a separate rate limit group for X-RateLimit-Limit headers
  (currently only `capture` and `verify` groups exist in
  `getRateLimitGroup`)? (6) What namespace IDs should be used for the
  new admin rate limiter (production and staging)?
- **Context to provide**: `wrangler.toml` (all rate limiter bindings and
  env configurations -- namespace IDs 1001-1003 production, 2001-2003
  staging), `src/index.js` (rate limit and header pipeline,
  `getRateLimitGroup`), `src/rate-limits.js` (current rate limit
  constants).
- **Why this agent**: Cloudflare Worker-specific configuration (rate
  limiter bindings, staging env parity) requires edge-minion expertise.
  Misconfigured rate limiters or missing staging bindings would cause
  deployment failures.

### Consultation 6: Test Strategy for Auth Rewrite

- **Agent**: test-minion
- **Planning question**: The auth module rewrite fundamentally changes
  what `verifyApiKey` does -- from a single env var string comparison to
  a KV-based hash lookup with scope checking and dual-mode fallback.
  (1) What test structure should the new auth tests have? The current
  `test/auth.test.js` tests are simple (correct key, wrong key, missing
  header, misconfigured env). The new auth needs tests for: KV-based
  lookup, scope enforcement (`capture` implies `read`), dual-mode
  fallback (legacy key still works during migration), revoked key
  rejection, admin scope enforcement. (2) How should KV be mocked for
  auth unit tests -- the current tests don't touch KV at all? (3) What
  admin API endpoint tests are needed (success, auth failures, validation
  errors, revocation flows)? (4) Should there be integration tests that
  exercise the full auth-to-capture flow with KV-based keys, or is that
  covered by the existing capture integration tests with updated auth?
  (5) What is the boundary between mocked unit tests (acceptable for
  scope/fallback logic) and real-boundary tests (needed for KV interaction)?
  The project philosophy says "mocking out the browser is like testing an
  HTTP server without sending requests" -- does the same apply to mocking
  KV in auth tests?
- **Context to provide**: `test/auth.test.js` (current auth test structure),
  `test/fixtures.js` (shared test helpers), `test/kv.test.js` (existing KV
  test patterns), `test/list-captures.test.js` (list endpoint tests with
  auth), `test/integration/` (integration test patterns), CLAUDE.md
  engineering philosophy section on testing boundaries.
- **Why this agent**: The test strategy needs to match the new auth
  architecture. The current tests are trivial; the new auth has significantly
  more surface. test-minion should define the test structure before
  implementation so tests are designed, not bolted on.

### Consultation 7: Operator Journey and Error Experience

- **Agent**: ux-strategy-minion
- **Planning question**: The admin API has no UI (out of scope). But the
  operator experience matters -- provisioning keys, understanding the
  migration sequence, and diagnosing auth failures are all operator
  journeys. (1) Is the three-endpoint admin API the right abstraction
  for a single-operator-provisioning-keys workflow? (2) What error
  messages should the admin API return when things go wrong -- evaluate:
  "key already revoked" (idempotent DELETE vs. error), "tenant not found"
  (should tenants be pre-provisioned or created implicitly on first key?),
  "scope invalid", "name already in use"? (3) How should the migration
  runbook be structured for cognitive simplicity -- what is the operator's
  mental model? (4) The `wrl_live_` prefix on generated keys is operator-
  facing -- is this prefix sufficient for distinguishing WRL keys from
  other credentials in an operator's key management? (5) When a 403 names
  the required scope (advisory decision), what is the clearest message
  format -- `"Requires scope: capture"` vs `"This endpoint requires a key
  with 'capture' scope"`?
- **Context to provide**: `OPERATIONS.md` (existing operator documentation
  style), `README.md` (onboarding flow), existing error messages in
  `src/responses.js` and `src/index.js`.
- **Why this agent**: Operator-facing API design is UX. The admin API will
  be used by a human operator via curl or a thin CLI client. Error messages,
  response structure, and the migration runbook must minimize cognitive
  load for someone who touches this system infrequently.

### Consultation 8: Documentation Impact Assessment

- **Agent**: software-docs-minion
- **Planning question**: This change introduces a new auth model, new admin
  endpoints, new secrets, and a migration runbook. (1) Which documents need
  updating? Enumerate: `openapi.yaml` (new admin endpoints, new security
  scheme for admin), `OPERATIONS.md` (new secrets: ADMIN_KEY, migration
  runbook), `README.md` (onboarding flow changes -- new secrets), possibly
  `SECURITY.md` or `TERMS.md`. (2) What should the OpenAPI spec version
  bump be (currently 0.4.0)? (3) How should the migration runbook be
  structured within OPERATIONS.md -- as a new section or a standalone
  document? (4) Should the admin API security scheme in OpenAPI be a
  separate scheme from the existing bearerAuth, since admin uses a
  different credential? (5) Does the evolution log entry (phase 0037)
  need anything beyond the standard structure (prompt.md, decisions.md,
  outcome.md)?
- **Context to provide**: `openapi.yaml` (current spec structure),
  `OPERATIONS.md` (current operational documentation), `README.md`
  (onboarding steps), `docs/evolution/README.md` (evolution log index),
  `docs/backlog.md` (R12 entry and related parking lot items).
- **Why this agent**: Multiple documentation surfaces need coordinated
  updates. The OpenAPI spec is a machine-readable contract that external
  tooling may consume. Getting the documentation scope right before
  implementation prevents drift.

### Consultation 9: Technology Landscape Validation

- **Agent**: gru
- **Planning question**: The advisory design uses server-generated API keys
  with SHA-256 hashing in KV for a Cloudflare Worker. Before committing
  to implementation: (1) Are there Cloudflare-native auth primitives
  (e.g., Access Service Tokens, API Shield) that would achieve tenant
  isolation with less custom code? The advisory explicitly ruled out OAuth,
  but Cloudflare has evolved its security product since the advisory --
  is there anything we would be reimplementing? (2) The `wrl_live_` prefix
  convention follows Stripe's pattern. Is this still the industry best
  practice for API key formats, or has anything emerged (e.g., Unkey,
  WorkOS) that suggests a better pattern? (3) The advisory specified no
  KV key caching due to 10-40ms latency being acceptable. Is this still
  correct given Cloudflare's current KV performance characteristics, or
  should we revisit caching for hot-path auth? (4) Are there any
  Cloudflare Worker limitations or gotchas with the proposed approach
  (e.g., KV consistency model implications for key revocation, rate
  limiter binding limits)?
- **Context to provide**: The advisory design decisions summary (from the
  GitHub issue), `wrangler.toml` (current Cloudflare bindings), the
  project's technology preferences (Cloudflare, KISS, Helix Manifesto).
- **Why this agent**: Gru validates that we are not reimplementing what the
  platform provides and that the chosen approach aligns with the current
  technology landscape. This is a one-time check before committing to
  a custom auth system. If Cloudflare provides a simpler native solution,
  the entire implementation plan changes.

### Consultation 10: Intent Alignment and Convention Compliance

- **Agent**: lucy
- **Planning question**: This PR implements R12 from the backlog. Before
  planning proceeds: (1) Does the proposed scope (auth module rewrite,
  admin API, migration runbook, observability enrichment) align with the
  issue description and success criteria, or does it exceed/fall short?
  (2) Does the evolution log numbering (0037) need verification against
  the current `docs/evolution/` directory? (3) The issue says "gated on
  multi-user decision -- do not build until a second user is real or
  imminent." Is the user explicitly choosing to build now, or should
  this be flagged? (4) Are there CLAUDE.md conventions (engineering
  philosophy, error handling, testing boundaries) that apply to this
  task and should be explicitly called out in agent prompts? (5) The
  issue specifies audit logging (R13) as a follow-on -- does any part
  of the proposed scope creep into R13 territory?
- **Context to provide**: The GitHub issue (full text), CLAUDE.md (project
  instructions), `docs/backlog.md` (R12 entry, R13 dependency),
  `docs/evolution/` (current phase numbers).
- **Why this agent**: Lucy ensures the plan aligns with human intent and
  project conventions. The gating condition on R12 ("do not build until
  a second user is real or imminent") needs explicit acknowledgment.
  Convention compliance (evolution log, backlog updates, error handling
  philosophy) must be baked into the plan, not discovered during review.

### Consultation 11: Admin API Developer Experience

- **Agent**: devx-minion
- **Planning question**: The admin API will initially be consumed via curl
  or a future thin CLI. (1) What curl examples should be included in the
  migration runbook and OpenAPI spec for each admin endpoint? (2) How
  should the one-time key display work in practice -- the POST response
  shows the raw key once, and the operator must capture it. What is the
  best UX for this pattern in a JSON API (specific response field naming,
  warning text in the response body)? (3) Should the admin API use
  a different auth header format (e.g., `X-Admin-Key` vs `Authorization:
  Bearer`) to prevent operators from accidentally using their admin key
  as a capture key? (4) Error messages for admin operations need to be
  actionable -- for each error case (missing required field, invalid scope,
  key not found, already revoked), what is the most developer-friendly
  error message pattern? (5) Should the admin API return the key hash
  in create/list responses to make DELETE easier (the operator needs the
  hash to delete, but they receive the raw key at creation time)?
- **Context to provide**: `openapi.yaml` (existing API conventions),
  `OPERATIONS.md` (existing curl examples and operator workflow style),
  `src/responses.js` (RFC 9457 error format).
- **Why this agent**: The admin API is a developer tool. devx-minion
  ensures the API is ergonomic for curl-based workflows: clear field
  names, actionable errors, easy copy-paste key management. The
  one-time-display pattern for generated keys is a critical UX decision
  that affects operator workflows.

## Cross-Cutting Checklist

- **Testing**: Include test-minion for planning (Consultation 6). The auth
  module is the trust boundary -- the test strategy needs careful planning
  because the current auth tests (`test/auth.test.js`) test a simple string
  comparison against an env var. The new KV-based lookup with scope
  checking, dual-mode fallback, and admin API endpoints need a
  fundamentally different test approach. test-minion should define what
  needs unit tests vs. what needs integration tests, and how to test
  the migration path.

- **Security**: Include -- this is Consultation 1 (security-minion). Auth
  and tenant isolation are the core of this task.

- **Usability -- Strategy**: ALWAYS include -- this is Consultation 7
  (ux-strategy-minion). The operator journey for key provisioning,
  migration, and error diagnosis is critical even though there is no UI.

- **Usability -- Design**: Not applicable. No UI components or visual
  interfaces are produced by this task. The admin API is server-to-server /
  CLI-to-API.

- **Documentation**: ALWAYS include -- this is Consultation 8
  (software-docs-minion). OpenAPI spec updates, OPERATIONS.md migration
  runbook, README changes, and evolution log entries are all in scope.

- **Observability**: Include -- this is Consultation 4
  (observability-minion). Explicit advisory requirement for enriched
  logging and new admin subsystem events.

## Anticipated Approval Gates

1. **Admin API contract** (MUST gate): The request/response schema for
   `POST/GET/DELETE /v1/admin/keys` locks in the API contract that future
   CLI tooling and external integrations will depend on. Hard to reverse,
   high blast radius (every downstream consumer depends on it). This
   should be gated before implementation begins.

2. **Auth module KV lookup design** (MUST gate): The new auth flow
   (KV-based key lookup with scope checking and dual-mode legacy
   fallback) is the security boundary. The implementation approach
   needs approval because it determines the security posture during
   and after migration. Hard to reverse, every endpoint depends on it.

3. **Migration runbook** (OPTIONAL gate): The runbook is a documentation
   deliverable that can be revised after the fact, but given it describes
   a production transition sequence with ordering constraints (deploy
   before secret provisioning, secret provisioning before key creation),
   getting it right matters. Gate only if the runbook is complex enough
   to warrant review.

## Rationale

This task is primarily a **security + API design + data model** problem.
The design decisions are pre-resolved by advisory, so the planning phase
focuses on implementation details that the advisory did not specify:
exact code structure, test strategy, migration sequencing, and
observability enrichment.

Eleven specialists are consulted for planning because:

**Core domain agents (5)** -- these address the primary implementation:

- **security-minion**: The auth module rewrite is the trust boundary.
  Implementation errors here create vulnerabilities.
- **api-design-minion**: Three new admin endpoints need precise contracts
  consistent with the existing API.
- **data-minion**: KV schema for key records is write-once in production.
  Getting the schema wrong means data migration.
- **observability-minion**: Advisory explicitly requires logging
  enrichment. The logging contract needs to be defined before
  implementation.
- **edge-minion**: Cloudflare Worker-specific configuration (rate limiter
  bindings, staging parity) must be correct for deployment.

**Added agents (3)** -- user-requested additions that bring new perspectives:

- **gru**: Technology landscape validation -- ensures we are not
  reimplementing what Cloudflare provides natively, and that the API key
  format/pattern is current best practice. This is a one-time sanity
  check before committing to a custom auth system.
- **lucy**: Intent alignment -- verifies the plan matches the issue
  description, checks the R12 gating condition, ensures CLAUDE.md
  conventions (evolution log, error handling philosophy, testing
  boundaries) are baked into agent prompts rather than discovered
  during Phase 3.5 review.
- **devx-minion**: Admin API developer experience -- the admin API is
  consumed by a human operator via curl. Field naming, one-time key
  display UX, auth header conventions, and actionable error messages
  are all developer experience concerns distinct from API contract design.

**Cross-cutting agents (3)** -- per mandatory checklist:

- **test-minion**: The auth test suite needs to be redesigned, not just
  extended. The current tests are trivial; the new auth has significantly
  more surface.
- **ux-strategy-minion**: Operator journey for key provisioning and
  migration runbook structure.
- **software-docs-minion**: Multiple documentation surfaces need
  coordinated updates (OpenAPI, OPERATIONS.md, README, evolution log).

**Excluded agents** (with justification):

- **ux-design-minion**: No UI components produced.
- **accessibility-minion**: No web-facing HTML/UI produced.
- **sitespeed-minion**: No web-facing runtime code affected (admin
  endpoints are server-to-server, existing capture/verify endpoints
  unchanged).
- **margo**: Not a planning consultant -- mandatory Phase 3.5 reviewer
  (governance). Will review the execution plan for YAGNI/KISS/scope creep.

## Scope

**In scope**:
- New auth module with KV-based key lookup (`apikey:{sha256hex}`)
- Scope enforcement (`capture`, `read`, `admin`) with `capture implies read`
- Dual-mode fallback: legacy `CAPTURE_API_KEY` env var for `default` tenant
  during migration
- Admin API: `POST/GET/DELETE /v1/admin/keys`
- `ADMIN_KEY` infrastructure secret for admin API authorization
- Dedicated `ADMIN_RATE_LIMITER` binding (5/min)
- Tenant-scoped capture list (already functional via secondary index)
- OpenAPI spec updates for admin endpoints
- Migration runbook in OPERATIONS.md
- Observability enrichment (`keyName`, `reason`, admin subsystem events)
- wrangler.toml updates (rate limiter bindings for production + staging)
- Test suite for new auth module and admin API
- Evolution log entry (phase number TBD -- lucy to verify)
- Backlog updates (R12 done, parking lot cleanup)

**Out of scope** (per issue):
- OAuth, social signup
- RBAC beyond read/write/admin
- Admin web UI
- Billing
- CLI tooling (may wrap admin API later)
- Audit logging (R13, follow-on)
- Per-tenant rate limiting (parking lot, revisit when R12 ships)

## External Skill Integration

No external skills detected in project. Scanned `.claude/skills/` and
`.skills/` directories -- neither exists in the project.
