MODE: META-PLAN

You are re-running the meta-plan after a team adjustment.

## Task

<github-issue>
**Outcome**: A second operator can use WRL with their own API key. Captures are isolated by tenant. Key compromise affects only one tenant. The single static key becomes the first tenant's key — no breaking change to existing clients.

**Success criteria**:
- KV-based key lookup (`kv.get("apikey:{sha256}")` → `{ tenantId, scopes }`)
- Per-tenant capture isolation (tenant can only list/retrieve their own captures)
- Read/write key scoping (capture vs read-only keys)
- Key provisioning via admin API (`POST/GET/DELETE /v1/admin/keys`)
- Migration path for existing captures (tagged to "default" tenant via R8)
- v1 API contract unbroken — existing single key works as first tenant key
- Per-IP rate limiting retained as secondary control alongside per-tenant

**Scope**:
- In: New auth module (KV key lookup), tenant tagging in KV records, tenant-scoped list endpoint, key scoping, admin API endpoints, capture migration
- Out: OAuth, social signup, RBAC beyond read/write, admin web UI, billing, CLI tooling (may wrap admin API later)

**Constraints**:
- Gated on multi-user decision — do not build until a second user is real or imminent
- R1 (list endpoint) and R8 (auth identity enrichment) must ship first
- Security-minion recommends per-tenant keys + isolation + scoping as a single PR, audit logging as follow-on

---

## Design Decisions (from advisory 2026-03-17)

Resolved by nefario advisory with 5 specialists (security, api-design, edge, iac, observability).

### Admin key identity

The admin key is **not** tenant 1. It is a separate infrastructure credential (`ADMIN_KEY` wrangler secret), analogous to `SIGNING_KEY` or `IP_HASH_SEED`. It can provision keys for any tenant, including the first one. Tenant 1 (`default`) gets its own tenant keys through the admin API, just like any other tenant.

The existing `CAPTURE_API_KEY` remains as a dual-mode fallback for the `default` tenant during migration, then gets removed. It does **not** grant admin access.

### Key provisioning

Key provisioning happens **exclusively via admin API**, not CLI. Three endpoints:

- `POST /v1/admin/keys` — create a key (returns raw key exactly once)
- `GET /v1/admin/keys` — list keys
- `DELETE /v1/admin/keys/{keyHash}` — revoke a key (soft-delete)

If CLI tooling is ever built, it would be a thin client calling these endpoints — not a separate provisioning path.

### Scope model

Three scopes: `capture`, `read`, `admin`. `capture` implies `read`. `admin` does NOT imply `capture`/`read`. `ADMIN_KEY` env var is global superadmin (cross-tenant). KV-stored admin keys are tenant-scoped.

### Other decisions

- **Key format**: server-generated 256-bit, `wrl_live_` prefix, base64url
- **Key storage**: `apikey:{sha256hex}` → `{ tenantId, scopes, name, createdAt, createdBy, revoked }`
- **Revocation**: soft-delete (`revoked: true`), 60s KV eventual consistency accepted
- **Admin rate limiter**: dedicated `ADMIN_RATE_LIMITER` binding (5/min), rate check before auth
- **No KV key caching**: 10-40ms latency acceptable within 300ms budget
- **Observability**: enrich existing events with `keyName`/`reason`, new `admin` subsystem for key_create/key_revoke
- **403 responses**: name the required scope (scope model is public)

## Migration plan requirement

The implementing PR **must include a migration runbook** (in OPERATIONS.md or a dedicated section) that documents the exact sequence of steps to go from the current single-key setup to multi-tenant keys. The runbook must cover:

1. What to do **before** merging the PR (if anything)
2. What to do **after** deploy but before switching to KV-based auth
3. How to provision `ADMIN_KEY` via `wrangler secret put` (both production and staging)
4. How to create the first tenant key for `default` via the admin API
5. How to verify KV-based auth is working
6. When and how to remove the legacy `CAPTURE_API_KEY` secret
7. What to do if something goes wrong (rollback path)

The runbook must be explicit about the relationship between PR merge, deploy, and secret provisioning — these are three separate events and the order matters.
</github-issue>

## Original Meta-Plan
Read the original meta-plan from: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-BWG9Hx/per-tenant-api-keys-isolation/phase1-metaplan.md

The following meta-plan was produced for the original team. Use it as context for the revised plan, not as a template to minimally edit.

## Team Adjustment
- Added: gru, lucy, devx-minion
- Removed: (none)
- Revised team: security-minion, api-design-minion, data-minion, observability-minion, edge-minion, test-minion, ux-strategy-minion, software-docs-minion, gru, lucy, devx-minion

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
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario-42-human-in-the-loop

## Instructions
1. Read relevant files to understand the codebase context
2. Read the original meta-plan for context
3. Generate planning consultations for ALL 11 agents in the revised team
4. Re-evaluate the cross-cutting checklist against the new team
5. Write your complete revised meta-plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-BWG9Hx/per-tenant-api-keys-isolation/phase1-metaplan-rerun.md`
