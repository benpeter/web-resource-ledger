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
  KV-stored admin-scoped key)?
- **Context to provide**: `src/auth.js` (current implementation), `src/index.js`
  (route table and handler flow), `src/kv.js` (KV data model), `wrangler.toml`
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
  API contract? (5) How should 403 responses name the required scope?
  Consider consistency with the existing v1 API patterns (RFC 9457 problem
  responses, `application/json` content type, existing auth flow).
- **Context to provide**: `openapi.yaml` (existing API spec), `src/responses.js`
  (problem response pattern), `src/index.js` (existing route patterns).
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
  has no identity beyond "admin")?
- **Context to provide**: `src/kv.js` (full data model), `src/auth.js`
  (current auth flow and tenantId contract).
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
  them)? (2) What fields should `admin.key_create` and `admin.key_revoke`
  events include? (3) Should auth failures from KV lookup include the key
  hash prefix for debugging, or is that a security risk? (4) What
  severity levels are appropriate for admin operations? (5) How should
  the dual-mode fallback period be observable (so operators can tell when
  all traffic has migrated to KV-based keys)?
- **Context to provide**: `src/log.js` (logging module), `src/index.js`
  (existing log calls with events and fields), `src/capture.js` (capture
  pipeline logging).
- **Why this agent**: The advisory explicitly calls out observability
  enrichment. This needs to be planned before implementation so the
  logging contract is consistent across all new and modified code paths.

### Consultation 5: Edge Worker Configuration

- **Agent**: edge-minion
- **Planning question**: The advisory specifies a dedicated
  `ADMIN_RATE_LIMITER` binding (5/min) with rate check before auth.
  (1) What wrangler.toml changes are needed for both production and
  staging? (2) How should admin routes interact with the existing per-IP
  rate limiters? (3) Should admin endpoints have CORS handling or are
  they always server-to-server? (4) What security headers should admin
  responses include (the existing global headers pipeline adds
  Referrer-Policy, X-Content-Type-Options, etc.)? (5) Do the admin
  routes need a separate rate limit group for X-RateLimit-Limit headers?
- **Context to provide**: `wrangler.toml` (all rate limiter bindings and
  env configurations), `src/index.js` (rate limit and header pipeline),
  `src/rate-limits.js`.
- **Why this agent**: Cloudflare Worker-specific configuration (rate
  limiter bindings, staging env parity) requires edge-minion expertise.
  Misconfigured rate limiters or missing staging bindings would cause
  deployment failures.

## Cross-Cutting Checklist

- **Testing**: Include test-minion for planning. The auth module is the
  trust boundary -- the test strategy needs careful planning because the
  current auth tests (`test/auth.test.js`) test a simple string comparison
  against an env var. The new KV-based lookup with scope checking, dual-mode
  fallback, and admin API endpoints need a fundamentally different test
  approach. test-minion should define what needs unit tests vs. what needs
  integration tests, and how to test the migration path.

- **Security**: Include -- this is Consultation 1 (security-minion). Auth
  and tenant isolation are the core of this task.

- **Usability -- Strategy**: ALWAYS include. Planning question for
  ux-strategy-minion: The admin API has no UI (out of scope). But the
  operator experience matters -- provisioning keys, understanding the
  migration sequence, and diagnosing auth failures are all operator
  journeys. (1) Is the three-endpoint admin API the right abstraction
  for a single-operator-provisioning-keys workflow? (2) What error
  messages should the admin API return when things go wrong (key already
  revoked, tenant not found, scope invalid)? (3) How should the
  migration runbook be structured for cognitive simplicity -- what is
  the operator's mental model?

- **Usability -- Design**: Not applicable. No UI components or visual
  interfaces are produced by this task. The admin API is server-to-server /
  CLI-to-API.

- **Documentation**: ALWAYS include. Planning question for
  software-docs-minion: The OpenAPI spec (`openapi.yaml`) needs new admin
  endpoints. The migration runbook goes in OPERATIONS.md. What other
  documentation needs updating? (1) Does the README onboarding flow need
  to change (new secrets: ADMIN_KEY)? (2) Does SECURITY.md need updates
  for the new auth model? (3) What should the OpenAPI spec version bump
  be (currently 0.4.0)?

- **Observability**: Include -- this is Consultation 4
  (observability-minion). Explicit advisory requirement for enriched
  logging.

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

Five specialists are consulted for planning because:

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

Cross-cutting agents (test-minion, ux-strategy-minion, software-docs-minion)
are included per the mandatory checklist. ux-design-minion and
accessibility-minion are excluded because this task produces no UI.
sitespeed-minion is excluded because no web-facing runtime code is
affected (admin endpoints are server-to-server).

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
- Evolution log entry (phase 0037)
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
`.skills/` directories -- no SKILL.md files found.
