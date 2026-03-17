MODE: META-PLAN

You are creating a revised meta-plan after a team adjustment.

## Task
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
Additional context: look at #42, there seems to be no plan what the admin key is. is that implicitly tenant 1? also, key provisioning must happen via admin API, not CLI. if CLI at all then later and it would work with the admin API

## Original Meta-Plan
The following meta-plan was produced for the original team. Use it as context for the revised plan, not as a template to minimally edit.

Read the original meta-plan from: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-boFNSO/per-tenant-api-keys-isolation/phase1-metaplan.md

## Team Adjustment
- Added: edge-minion, iac-minion
- Removed: data-minion, software-docs-minion, ux-strategy-minion, test-minion
- Revised team: security-minion, api-design-minion, observability-minion, edge-minion, iac-minion

## Constraints
- Keep the same scope and task description
- Preserve external skill integration decisions unless the team change removes all agents relevant to a skill's domain
- Generate planning consultations for ALL agents in the revised team
- Re-evaluate the cross-cutting checklist against the new team
- Produce output at the same depth and format as the original
- Do NOT change the fundamental scope of the task
- Do NOT add agents the user did not request (beyond cross-cutting requirements)
- Design planning questions as a coherent set -- each question should address aspects that no other agent on the team covers, and questions should reference cross-cutting boundaries where relevant

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/advisory-42

## Instructions
1. Read the original meta-plan for context
2. Read relevant codebase files to understand the architecture
3. Generate planning consultations for ALL agents in the revised team
4. For each agent, write a specific planning question that draws on their unique expertise
5. Re-evaluate the cross-cutting checklist against the revised team
6. Write your complete revised meta-plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-boFNSO/per-tenant-api-keys-isolation/phase1-metaplan-rerun.md`