Combined task: GitHub issues #38 and #31

## Issue #38: R8: Auth identity enrichment (internal refactor)

**Outcome**: The auth module returns tenant identity (`{ ok: true, tenantId }`) instead of just a boolean, preparing the codebase for per-tenant keys without changing external API behavior. The single static key maps to a "default" tenant. All downstream code threads tenantId into logging and KV operations.

**Success criteria**:
- `verifyApiKey()` returns `{ ok, tenantId }` (single static key -> tenantId "default")
- All handler call sites updated to thread tenantId
- KV keys for new captures include tenant scope (e.g., `tenant:default:ts:{ISO}:{id}`)
- Log entries include tenantId field
- No external API change -- transparent to clients
- All existing tests pass

**Scope**:
- In: Auth module refactor, handler call site updates, KV key format update for new captures, log entry updates, tests
- Out: Per-tenant key lookup, key management endpoints, migration of existing KV keys (handled in R12)

**Constraints**:
- Should ship before or alongside R1 (list endpoint) to ensure KV keys include tenant scope from day one

## Issue #31: R1: List captures endpoint (GET /v1/captures)

**Outcome**: Users can browse and recover their captures by date, eliminating the "lost ID = lost capture" anti-pattern that is currently documented as a known limitation in the README and 202 response.

**Success criteria**:
- `GET /v1/captures` returns paginated list of captures for the authenticated tenant
- Cursor-based pagination using KV native list cursor works correctly
- `{ data, pagination }` envelope pattern established for future collection endpoints
- `status` query parameter filters captures by processing state
- Requires Bearer auth (cannot use capture-ID-as-secret pattern)
- OpenAPI spec updated with new endpoint
- README "lost ID" warnings removed
- Response time <300ms for lists up to 100 captures

**Scope**:
- In: New GET endpoint, KV list integration, cursor pagination, status filter, auth requirement, OpenAPI update, secondary KV index (`tenant:{tenantId}:ts:{ISO}:{captureId}`), tests
- Out: URL filtering, sorting, full-text search (require D1), pagination UI, SDK generation

**Constraints**:
- KV `list()` returns keys only; each page of 20 results costs 21 KV operations -- acceptable at current scale
- API contract (cursor + envelope) must be storage-backend-agnostic for future D1 migration
- Depends on R8 (auth identity enrichment) shipping first or alongside

---
Additional context: all approvals given, but pause before creating the PR
