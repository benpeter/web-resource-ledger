# Meta-Plan: R12 Per-Tenant API Keys and Tenant Isolation

## Context

R12 is the largest change to WRL since the initial MVP. It replaces the single
static `CAPTURE_API_KEY` with a KV-backed multi-tenant key system, adds an admin
API for key provisioning, and enforces per-tenant capture isolation. All design
decisions were settled in the 2026-03-17 advisory -- this is pure implementation
planning.

**Codebase state**: The auth system (`src/auth.js`) currently compares a Bearer
token against a single `CAPTURE_API_KEY` env var and returns hardcoded
`tenantId: 'default'`. Tenant isolation infrastructure already exists in
`src/kv.js` (tenant-prefixed index keys, `tenantPrefix()` validation). The
router (`src/index.js`) has 9 routes; admin routes must be added. Rate limiters
are per-IP via `unsafe.bindings` in `wrangler.toml`. OPERATIONS.md exists with
secret management docs. OpenAPI spec at v0.4.0 needs admin endpoints and updated
auth schemes.

**Files that will change**:
- `src/auth.js` -- rewrite: KV key lookup, scope checking, ADMIN_KEY fallback,
  CAPTURE_API_KEY dual-mode fallback
- `src/kv.js` -- new: apikey CRUD functions (`putApiKey`, `getApiKey`,
  `deleteApiKey`, `listApiKeys`)
- `src/index.js` -- new: admin route handlers, admin rate limiter, scope-gated
  auth on existing routes
- `src/rate-limits.js` -- new: admin rate limit entry
- `wrangler.toml` -- new: ADMIN_RATE_LIMITER binding (both envs)
- `openapi.yaml` -- new: admin tag, admin endpoints, updated securitySchemes
- `OPERATIONS.md` -- new: migration runbook section
- `test/auth.test.js` -- rewrite for KV-based auth
- New: `test/admin.test.js` -- admin API tests
- New: `src/admin.js` (or inline in index.js) -- admin endpoint handlers

## Planning Consultations

### Consultation 1: Auth Module and KV Key Schema Implementation

- **Agent**: security-minion
- **Planning question**: Given the settled design (SHA-256 key lookup in KV,
  `wrl_live_` prefix, 256-bit server-generated keys, soft-delete revocation,
  `capture`/`read`/`admin` scopes, `ADMIN_KEY` env var as global superadmin,
  `CAPTURE_API_KEY` as dual-mode fallback for `default` tenant), plan the
  implementation of `src/auth.js` rewrite. Specifically:
  1. What is the correct auth flow ordering? (ADMIN_KEY check first? KV lookup
     first? CAPTURE_API_KEY fallback position?)
  2. How should timing-safe comparison work when the lookup is hash-based?
     (SHA-256 the bearer token, KV get, then what -- just check `revoked` flag?)
  3. What should the 403 response look like when scope is insufficient?
     (The advisory says "name the required scope" -- how to phrase this safely?)
  4. What are the security boundaries for the admin endpoints? (Rate limit
     before auth? Auth before body parse? How to prevent key enumeration via
     the list endpoint?)
  5. How should revoked key handling work? (Return 401 "Invalid API key" or
     a distinct 403 "Key has been revoked"?)
  6. For the dual-mode CAPTURE_API_KEY fallback: should it be checked before
     or after the KV lookup? What scopes does it get?
- **Context to provide**: Current `src/auth.js`, `src/kv.js`, the advisory
  design decisions, `src/responses.js` (problemResponse format)
- **Why this agent**: Security is the primary domain. The auth rewrite is the
  core of R12 and must be implemented correctly. Key lookup, scope enforcement,
  timing considerations, and error response design are all security-critical.

### Consultation 2: Admin API Design and Route Structure

- **Agent**: edge-minion
- **Planning question**: Given that WRL is a Cloudflare Worker with the router
  pattern in `src/index.js`, plan the implementation of the admin API endpoints
  (`POST/GET/DELETE /v1/admin/keys`). Specifically:
  1. How should admin routes integrate with the existing router pattern? (New
     tuples in the `routes` array? Separate admin route group?)
  2. How should the dedicated `ADMIN_RATE_LIMITER` binding work? (The advisory
     specifies 5/min, rate check before auth. Should it be per-IP like existing
     limiters?)
  3. What is the right file organization? (New `src/admin.js` for handlers, or
     keep everything in `src/index.js`?)
  4. For key generation: how to generate 256-bit keys with `wrl_live_` prefix
     in the Workers runtime? (crypto.getRandomValues + base64url encoding?)
  5. How should the GET /v1/admin/keys list endpoint work? (KV list with
     `apikey:` prefix? Pagination? What fields are returned -- never the raw key?)
  6. How should the DELETE endpoint work? (Soft-delete: set `revoked: true`,
     `revokedAt`, `revokedBy` on the existing KV record?)
  7. Wrangler.toml changes: new `ADMIN_RATE_LIMITER` binding for both prod and
     staging envs.
- **Context to provide**: Current `src/index.js` (router pattern), `wrangler.toml`
  (rate limiter bindings), the advisory design decisions
- **Why this agent**: Edge-minion owns Cloudflare Worker architecture, rate
  limiter bindings, and the deployment surface. The admin API is new Worker
  surface area that must fit the existing patterns.

### Consultation 3: Infrastructure and Migration

- **Agent**: iac-minion
- **Planning question**: Plan the infrastructure changes and migration runbook
  for R12. Specifically:
  1. What wrangler.toml changes are needed? (New `ADMIN_RATE_LIMITER` binding
     with namespace_id for both prod and staging)
  2. What new wrangler secrets are needed? (`ADMIN_KEY` for both envs)
  3. What does the migration runbook in OPERATIONS.md need to cover?
     (Pre-merge: set ADMIN_KEY secret. Post-deploy: create first tenant key
     via admin API. Verification: test with new key. CAPTURE_API_KEY removal:
     when and how. Rollback path: revert commit + remove ADMIN_KEY.)
  4. GitHub Actions changes: do deploy workflows need updating for the new
     secret? (Smoke tests need to work with both old and new auth.)
  5. `.dev.vars` changes for local development?
  6. How to handle the staging environment? (Staging gets ADMIN_KEY too?)
- **Context to provide**: `wrangler.toml`, `OPERATIONS.md`, `.github/workflows/`
  deploy files, the advisory migration plan requirement
- **Why this agent**: Infrastructure-as-code, deployment configuration, and
  operational runbooks are iac-minion's domain. The migration is the highest-risk
  part of R12 -- a mistake here breaks production auth.

### Consultation 4: OpenAPI Spec Updates

- **Agent**: api-spec-minion
- **Planning question**: Plan the OpenAPI spec changes for R12. Specifically:
  1. How should the new `admin` tag and admin endpoints be documented?
     (POST /v1/admin/keys, GET /v1/admin/keys, DELETE /v1/admin/keys/{keyId})
  2. How should the security schemes be updated? (The existing `bearerAuth`
     covers tenant keys; admin auth is the same scheme but different scopes.
     Should there be a separate `adminAuth` scheme or just document the scope
     requirement?)
  3. What request/response schemas are needed for the admin endpoints?
     (CreateKeyRequest, CreateKeyResponse with the raw key shown once,
     KeyListResponse, etc.)
  4. How should scope requirements be documented per-endpoint?
  5. Version bump: 0.4.0 -> 0.5.0?
- **Context to provide**: Current `openapi.yaml`, the advisory design decisions
- **Why this agent**: API spec authoring is api-spec-minion's domain. The spec
  must accurately document the new endpoints and auth model.

### Consultation 5: Observability Enrichment

- **Agent**: observability-minion
- **Planning question**: The advisory specifies enriching existing log events
  with `keyName` and `reason` fields, plus a new `admin` subsystem. Plan the
  implementation. Specifically:
  1. Which existing log calls need enrichment? (auth failures need keyName if
     available, scope failures need the required scope)
  2. What new log events are needed for admin operations? (key.create,
     key.revoke, key.list -- what severity levels?)
  3. How should the `admin` subsystem integrate with the existing `log()`
     function? (It already takes a subsystem parameter.)
  4. Should failed admin auth attempts be logged differently from failed
     capture auth? (Same `security.auth_fail` event with additional context?)
- **Context to provide**: `src/log.js`, existing log calls in `src/index.js`,
  the advisory observability decisions
- **Why this agent**: Observability-minion ensures the logging strategy is
  coherent and follows the existing patterns.

## Cross-Cutting Checklist

- **Testing**: INCLUDE test-minion for planning. The auth rewrite is the most
  security-critical code in WRL. Test strategy needs to cover: KV-based auth
  with mocked KV, scope enforcement, admin API CRUD, migration fallback
  behavior (CAPTURE_API_KEY still works), revocation. The existing
  `test/auth.test.js` needs a complete rewrite. New `test/admin.test.js`
  needed. Planning question: What is the test matrix for the new auth module?
  How should KV be mocked in auth tests? What edge cases need coverage
  (revoked keys, expired keys, wrong scope, dual-mode fallback)?

- **Security**: INCLUDE -- Consultation 1 (primary domain).

- **Usability -- Strategy**: INCLUDE. Planning question for ux-strategy-minion:
  The admin API is the operator's interface for key management. From a
  cognitive load perspective, is POST/GET/DELETE /v1/admin/keys sufficient,
  or are there journey gaps? (e.g., "How does an operator know which keys
  are active?" "How does an operator recover from a key compromise?" "Should
  the POST response include a curl example for using the new key?") Review
  the error messages for scope-denied scenarios -- will operators understand
  what scope they need?

- **Usability -- Design**: EXCLUDE. No user-facing UI is produced by this task.
  The admin API is a CLI/curl interface for operators.

- **Documentation**: INCLUDE. software-docs-minion planning question: The
  migration runbook in OPERATIONS.md is the most critical documentation
  deliverable. What sections does it need? Also: README.md setup instructions
  need updating for the new ADMIN_KEY secret and multi-tenant setup. The
  existing "configure capture API key" section needs revision.
  user-docs-minion: EXCLUDE -- no end-user documentation changes (the API
  contract is unchanged for existing clients).

- **Observability**: INCLUDE -- Consultation 5 (primary domain).

## Anticipated Approval Gates

1. **Auth module design** (MUST gate) -- The `src/auth.js` rewrite is hard to
   reverse (defines the auth contract for all endpoints) and has high blast
   radius (every endpoint depends on it). Security-minion's implementation plan
   for auth flow ordering, scope enforcement, and fallback behavior must be
   reviewed before coding.

2. **Admin API contract** (MUST gate) -- The POST/GET/DELETE endpoints define
   a new API surface. Once shipped, the contract is hard to change without
   breaking admin tooling. API-spec-minion's schema definitions and
   edge-minion's route structure must be reviewed together.

3. **Migration runbook** (MUST gate) -- The OPERATIONS.md migration section
   is a deployment-time procedure. Getting it wrong breaks production auth.
   iac-minion's runbook must be reviewed before merge.

## Rationale

Six specialists are recommended for planning:

- **security-minion** (required): Auth rewrite is the core security surface.
  Every decision in the auth flow has security implications.
- **edge-minion** (required): Cloudflare Worker architecture, rate limiter
  bindings, and admin route structure.
- **iac-minion** (required): Wrangler config, secrets provisioning, migration
  runbook, and deployment pipeline changes.
- **api-spec-minion**: OpenAPI spec must accurately document the new admin
  endpoints and updated auth model. Contract-first ensures implementation
  matches documentation.
- **observability-minion**: Log enrichment follows existing patterns but needs
  coordination with the new auth flow and admin subsystem.
- **test-minion**: Auth is the most security-critical code. Test strategy must
  be planned before implementation, not retrofitted.
- **ux-strategy-minion**: Operator journey review for the admin API.
- **software-docs-minion**: Migration runbook is the highest-risk documentation.

Agents NOT included in planning (with rationale):
- **data-minion**: KV schema is already settled in the advisory. No database
  selection or modeling decisions remain.
- **frontend-minion**: No UI changes.
- **ai-modeling-minion**: No prompt engineering or agent system changes.
- **code-review-minion**: Reviews happen in Phase 5 post-execution.
- **ux-design-minion, accessibility-minion**: No UI produced.
- **sitespeed-minion, seo-minion**: No web-facing pages affected.

## Scope

**In scope**: New auth module (KV key lookup with SHA-256, scope enforcement),
admin API (POST/GET/DELETE /v1/admin/keys), ADMIN_RATE_LIMITER binding,
ADMIN_KEY wrangler secret, CAPTURE_API_KEY dual-mode fallback, per-tenant
capture isolation enforcement, OpenAPI spec updates, OPERATIONS.md migration
runbook, auth test rewrite, admin API tests, wrangler.toml changes (both envs),
log enrichment with keyName/reason and admin subsystem.

**Out of scope**: OAuth, social signup, RBAC beyond read/write/admin, admin web
UI, billing, CLI tooling, audit logging (R13 follow-on), per-tenant rate
limiting (parking lot item), existing capture migration script (tagged to
"default" tenant via R8 -- already done).

## External Skill Integration

No external skills detected in project. No project-local skills in
`.claude/skills/` or `.skills/`. User-global skills in `~/.claude/skills/` are
either despicable-agents agents (nefario, despicable-prompter) or unrelated
personal skills (obsidian-tasks, transcribe, etc.).
