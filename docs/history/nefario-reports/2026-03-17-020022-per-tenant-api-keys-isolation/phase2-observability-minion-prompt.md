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
What logging and metrics changes are needed for multi-tenant auth? Specifically:
(a) Auth events: what should be logged on key lookup (success with tenantId + key name, failure with hashed attempt), key provisioning (creation, revocation), scope violations?
(b) Per-tenant metrics: should we log per-tenant capture counts, rate limit hits, etc. for operational visibility? Or is that R13 (audit logging)?
(c) How do the existing Coralogix log entries need to change? Current entries already include `tenantId` from R8. The `security` subsystem already logs `security.auth_fail` and `security.rate_limit`. What new event types are needed for KV key lookup, scope violations, and admin API operations?
(d) What's the boundary between R12 observability (operational logging) and R13 (audit logging)? R13 depends on R12 and is explicitly out of scope, but R12's log schema should be forward-compatible with R13.
(e) Admin API observability: key provisioning (create, revoke, list) is a high-sensitivity operation. What severity level should these events use? Should they go to a separate Coralogix subsystem (e.g., `admin`) or use the existing `security` subsystem?

Note: focus on log schema and event types, not rate limiter metrics (edge-minion handles that) or infrastructure (iac-minion handles that).

## Context
Read these files for context:
- `src/log.js` (current logging implementation and contract)
- `src/index.js` (existing log calls with event names, severity levels, and subsystems)

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that aren't already part of the planning, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: observability-minion

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

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-boFNSO/per-tenant-api-keys-isolation/phase2-observability-minion.md`