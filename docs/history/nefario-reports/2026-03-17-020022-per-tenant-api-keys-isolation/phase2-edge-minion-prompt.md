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

## Your Planning Question
Design the rate limiting strategy changes needed for multi-tenant API keys. Specifically:
(a) Per-IP rate limiting is retained as a secondary control (issue requirement). Should per-tenant rate limiting be added in R12, or is that a follow-on? The backlog has `[consider] Per-tenant rate limiting` in the parking lot with condition "when R12 ships." Does R12 need to lay groundwork for it even if it doesn't implement it?
(b) Admin endpoints (`/v1/admin/keys`) need rate limiting. Should they get their own Cloudflare rate limiter binding (separate `namespace_id` in wrangler.toml), or reuse an existing one? The admin API is low-volume but high-impact -- what limits are appropriate?
(c) Caching implications: currently `GET /v1/captures/{id}` and artifact endpoints use `Cache-Control: public, max-age=31536000, immutable` for artifacts and `private, no-store` for metadata. Does multi-tenancy change any caching behavior? With tenant isolation, are there cache poisoning risks if a CDN layer is added later (parking lot item: Fastly CDN)?
(d) The current global rate limiter (`GLOBAL_CAPTURE_LIMITER`, 200/min) protects service capacity. With multiple tenants, should this remain global or should each tenant get a capacity share? Consider the Cloudflare rate limiter binding model -- each binding is a separate `namespace_id`.
(e) Key lookup adds a KV read to every authenticated request. Is this latency-acceptable given the `<300ms uncached` latency constraint from CLAUDE.md? KV reads are ~10-40ms at the edge. Should key lookup results be cached in-memory (Workers have no persistent memory, but `caches.default` exists)?

## Context
Read these files for context:
- `wrangler.toml` (rate limiter bindings, namespaces)
- `src/rate-limits.js` (current rate limit constants)
- `src/index.js` (rate limit check flow)
- `docs/backlog.md` (parking lot items on rate limiting and CDN)

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that aren't already part of the planning, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: edge-minion

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

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-boFNSO/per-tenant-api-keys-isolation/phase2-edge-minion.md`