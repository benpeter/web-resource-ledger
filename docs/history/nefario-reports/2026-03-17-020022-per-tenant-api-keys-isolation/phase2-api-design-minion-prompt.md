You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise
to help build a comprehensive plan.

## Advisory Context
This is an advisory-only orchestration. Your contribution will feed
into a team recommendation, not an execution plan. Focus on analysis,
trade-offs, and recommendations rather than implementation tasks.

## Project Task
<github-issue>
**Outcome**: A second operator can use WRL with their own API key. Captures are isolated by tenant. Key compromise affects only one tenant. The single static key becomes the first tenant's key — no breaking change to existing clients.

**Success criteria**:
- KV-based key lookup (`kv.get("apikey:{sha256}")` → `{ tenantId, scopes }`)
- Per-tenant capture isolation (tenant can only list/retrieve their own captures)
- Read/write key scoping (capture vs read-only keys)
- Key provisioning tooling (CLI or admin endpoint)
- Migration path for existing captures (tagged to "default" tenant via R8)
- v1 API contract unbroken — existing single key works as first tenant key
- Per-IP rate limiting retained as secondary control alongside per-tenant

**Scope**:
- In: New auth module (KV key lookup), tenant tagging in KV records, tenant-scoped list endpoint, key scoping, provisioning tooling, capture migration
- Out: OAuth, social signup, RBAC beyond read/write, admin web UI, billing

**Constraints**:
- Gated on multi-user decision — do not build until a second user is real or imminent
- R1 (list endpoint) and R8 (auth identity enrichment) must ship first
- Security-minion recommends per-tenant keys + isolation + scoping as a single PR, audit logging as follow-on
</github-issue>

---
Additional context: Key provisioning must happen via an admin API endpoint, not CLI. The existing static key becomes tenant 1's key implicitly.

## Your Planning Question
Design the admin API for key provisioning and any changes to existing endpoints. Specifically:
(a) Admin endpoint design: `POST /v1/admin/keys` to create a key, `DELETE /v1/admin/keys/{keyId}` to revoke, `GET /v1/admin/keys` to list? What request/response schemas? What authentication (the `admin` scope from security-minion's design)?
(b) Do existing endpoints (`POST /v1/captures`, `GET /v1/captures`, `GET /v1/captures/{id}`) need any API contract changes for multi-tenancy? The user says "v1 API contract unbroken" -- confirm this holds.
(c) How does the capture retrieval endpoint (`GET /v1/captures/{id}`) enforce tenant isolation? Currently it uses captureId as an access secret with no auth. Does R12 change this, or is unauth access by capture ID still the model?
(d) Error responses: any new error codes or problem types for scope violations (e.g., read-only key tries to create a capture)?
(e) How does scoping interact with the list endpoint? A read-only key should still be able to list captures for its tenant, right?
(f) Admin endpoint rate limiting: should admin endpoints have their own rate limiter binding, or reuse existing ones? Note that edge-minion will advise on rate limiter implementation -- focus on the API contract (headers, response codes, Retry-After semantics).

## Context
Read these files for context:
- `openapi.yaml` (current API spec)
- `src/index.js` (route handlers)
- `src/responses.js` (RFC 9457 error format)
- The issue's scope/success criteria

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that aren't already part of the planning, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: api-design-minion

### Recommendations
<your expert recommendations for this aspect of the task>

### Proposed Tasks
<specific tasks that should be in the execution plan>
For each task: what to do, deliverables, dependencies

### Risks and Concerns
<things that could go wrong from your domain perspective>

### Additional Agents Needed
<any specialists not yet involved who should be, and why>
(or "None" if the current team is sufficient)

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-boFNSO/per-tenant-api-keys-isolation/phase2-api-design-minion.md`