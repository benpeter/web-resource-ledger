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
Additional context: The user clarifies that the existing static key should implicitly become tenant 1's key -- no separate admin concept unless needed for key provisioning. Key provisioning must happen via an admin API endpoint, not CLI. CLI may wrap the admin API later but is not in scope for R12.

## Your Planning Question
Design the KV-based API key lookup system and the admin API's own authentication. Specifically:
(a) Key storage format: what does `kv.get("apikey:{sha256}")` return? What fields are in the record (`tenantId`, `scopes`, `createdAt`, `name`, etc.)?
(b) How does the existing static `CAPTURE_API_KEY` env var transition to the first tenant key in KV? Is it a one-time migration script, or does `verifyApiKey()` check KV first and fall back to env var?
(c) How does read/write scoping work? What scopes exist (`capture`, `read`, `admin`?) and how are they checked in request handlers?
(d) Admin API bootstrap: what authenticates the key provisioning endpoint? The user says the existing static key becomes tenant 1's key -- does it also get an `admin` scope? Or is there a separate `ADMIN_KEY` env var? Design the bootstrap so a cold-start deployment can provision its first tenant key via the admin API without a chicken-and-egg problem.
(e) Key generation: who generates the raw API key bytes? Server-generated and returned once, or client-provided?
(f) Key compromise response: how does an operator revoke a single key without affecting other tenants?
(g) Timing-safe comparison: current code compares raw keys. With SHA-256 lookup, do we still need timing-safe comparison for the hash, or does the hash-then-lookup pattern eliminate the timing channel?
(h) Scope enforcement boundaries: where in the request pipeline are scopes checked? Should `verifyApiKey()` return scopes and let each handler check, or should there be a middleware-like pattern?

Note: edge-minion will address rate limiting changes separately -- focus on auth logic, key storage, and scope enforcement.

## Context
Read these files for context:
- `src/auth.js` (current implementation)
- `src/kv.js` (KV access patterns and tenant prefix)
- `wrangler.toml` (env bindings)
- `test/auth.test.js` (existing test coverage)

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that aren't already part of the planning, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: security-minion

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

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-boFNSO/per-tenant-api-keys-isolation/phase2-security-minion.md`