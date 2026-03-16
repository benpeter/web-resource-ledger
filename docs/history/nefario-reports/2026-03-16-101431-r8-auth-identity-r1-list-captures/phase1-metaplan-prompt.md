MODE: META-PLAN

You are creating a meta-plan — a plan for who should help plan.

## Task

Combined implementation of two dependent GitHub issues:

**Issue #38: R8: Auth identity enrichment (internal refactor)**
The auth module returns tenant identity (`{ ok: true, tenantId }`) instead of just a boolean, preparing the codebase for per-tenant keys without changing external API behavior. The single static key maps to a "default" tenant. All downstream code threads tenantId into logging and KV operations.

Success criteria:
- `verifyApiKey()` returns `{ ok, tenantId }` (single static key -> tenantId "default")
- All handler call sites updated to thread tenantId
- KV keys for new captures include tenant scope (e.g., `tenant:default:ts:{ISO}:{id}`)
- Log entries include tenantId field
- No external API change -- transparent to clients
- All existing tests pass

Scope:
- In: Auth module refactor, handler call site updates, KV key format update for new captures, log entry updates, tests
- Out: Per-tenant key lookup, key management endpoints, migration of existing KV keys (handled in R12)

**Issue #31: R1: List captures endpoint (GET /v1/captures)**
Users can browse and recover their captures by date, eliminating the "lost ID = lost capture" anti-pattern.

Success criteria:
- `GET /v1/captures` returns paginated list of captures for the authenticated tenant
- Cursor-based pagination using KV native list cursor works correctly
- `{ data, pagination }` envelope pattern established for future collection endpoints
- `status` query parameter filters captures by processing state
- Requires Bearer auth (cannot use capture-ID-as-secret pattern)
- OpenAPI spec updated with new endpoint
- README "lost ID" warnings removed
- Response time <300ms for lists up to 100 captures

Scope:
- In: New GET endpoint, KV list integration, cursor pagination, status filter, auth requirement, OpenAPI update, secondary KV index, tests
- Out: URL filtering, sorting, full-text search (require D1), pagination UI, SDK generation

Constraints:
- R8 must ship before or alongside R1 to ensure KV keys include tenant scope from day one
- KV `list()` returns keys only; each page of 20 results costs 21 KV operations
- API contract (cursor + envelope) must be storage-backend-agnostic for future D1 migration

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger

## External Skill Discovery
Before analyzing the task, scan for project-local skills. If skills are discovered, include an "External Skill Integration" section in your meta-plan.

## Key Codebase Context
- Auth module: src/auth.js -- returns `{ ok: true }` or `{ ok: false, response }`. Single call site in handleCreateCapture (src/index.js:70).
- KV layer: src/kv.js -- key prefix `capture:{captureId}`. Functions: createCapture, getCapture, completeCapture, failCapture.
- Router: src/index.js -- manual regex route table. Handlers receive (request, env, ctx, match).
- Logging: src/log.js -- structured Coralogix logs. Subsystems: capture, security.
- Responses: src/responses.js -- problemResponse() and jsonResponse() helpers.
- OpenAPI: openapi.yaml -- comprehensive 3.1.0 spec.
- Tests: 18 test files using Vitest with cloudflare:test bindings.
- README: Contains "lost ID" warnings at lines 44, 48, 74.

## Instructions
1. Read relevant files to understand the codebase context
2. Discover external skills (scan .claude/skills/ and .skills/)
3. Analyze the task against your delegation table
4. Identify which specialists should be CONSULTED FOR PLANNING (not execution -- planning)
5. For each specialist, write a specific planning question that draws on their unique expertise
6. Return the meta-plan in the structured format
7. Write your complete meta-plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-cnxnz8/r8-auth-identity-r1-list-captures/phase1-metaplan.md
