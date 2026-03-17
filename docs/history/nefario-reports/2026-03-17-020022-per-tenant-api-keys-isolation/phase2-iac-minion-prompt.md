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
Additional context: Key provisioning must happen via an admin API endpoint, not CLI.

## Your Planning Question
Design the infrastructure changes needed for multi-tenant API key management. Specifically:
(a) Secrets management: `CAPTURE_API_KEY` is currently a wrangler secret (set via `wrangler secret put`). With KV-based key lookup, does this secret remain (for backward compatibility / fallback), get removed after migration, or get repurposed as `ADMIN_KEY`? What about the bootstrap scenario -- how does a fresh deployment provision its first key?
(b) If the admin API needs its own secret (e.g., `ADMIN_KEY` env var for bootstrap), how is it managed? `wrangler secret put ADMIN_KEY` for both production and staging? Does this affect the existing deployment pipeline (`deploy-production.yml`, `deploy-staging.yml`)?
(c) New wrangler.toml bindings: if edge-minion recommends a new rate limiter for admin endpoints, that means a new `[[unsafe.bindings]]` entry with a new `namespace_id`. Are there any Cloudflare account-level constraints on rate limiter namespaces?
(d) KV namespace capacity: the existing KV namespace holds capture records and signing keys. Adding `apikey:{hash}` records is trivial in volume (dozens, not millions). Any operational concerns?
(e) Staging parity: the staging environment (`env.staging` in wrangler.toml) needs the same multi-tenant config. How do we ensure staging and production stay in sync for new bindings and secrets?
(f) GitHub Actions: does the CD pipeline need changes to support the new secrets or bindings? Currently `deploy-production.yml` runs `wrangler deploy` -- does it need additional steps?

## Context
Read these files for context:
- `wrangler.toml` (full file including staging)
- `.github/workflows/` (deployment pipelines)
- `src/auth.js` (current CAPTURE_API_KEY usage)

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that aren't already part of the planning, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: iac-minion

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

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-boFNSO/per-tenant-api-keys-isolation/phase2-iac-minion.md`