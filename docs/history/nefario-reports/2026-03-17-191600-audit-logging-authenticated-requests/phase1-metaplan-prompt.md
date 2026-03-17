MODE: META-PLAN

You are creating a meta-plan — a plan for who should help plan.

## Task

**Outcome**: Full audit trail of authenticated API activity — who captured what, when, with which key — enabling abuse investigation and compliance reporting for multi-tenant operation.

**Success criteria**:
- All authenticated API requests logged with tenant context (tenantId, keyId, action, resource)
- Key provisioning and revocation events logged
- Log entries integrate with existing Coralogix structured logging
- Audit trail queryable by tenant and time range in Coralogix

**Scope**:
- In: Structured log entries on every authenticated request, key lifecycle events, integration with existing log() helper
- Out: Audit log export API, compliance report generation, log retention policies

**Constraints**:
- Depends on R12 (per-tenant keys) — audit logging is meaningful only with tenant identity

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/feature/audit-logging-for-authenticated-requests-2

## Codebase Context

### Existing logging infrastructure
- `src/log.js`: Coralogix structured logging helper. Fire-and-forget via `ctx.waitUntil()`. Takes (env, severity, subsystem, data).
- Severity levels: 3=info, 4=warn, 5=error, 6=debug

### Current auth system
- `src/auth.js`: `verifyApiKey()` returns `{ ok, tenantId, scopes, keyName, authMethod }` on success; `verifyAdminKey()` returns `{ ok, authMethod: 'admin_key' }` on success.
- Auth methods: 'kv' (per-tenant API key), 'legacy' (single shared key), 'admin_key' (infrastructure secret)

### Current logging in handlers
- `handleCreateCapture` already logs `capture.queued` with tenantId, keyName, authMethod, url, cip
- `handleListCaptures` already logs `list.success` with tenantId, keyName, authMethod, resultCount
- Admin endpoints already log `admin.key_create`, `admin.key_revoke`, `admin.key_list`
- Auth failures logged as `security.auth_fail`

### Key files
- `src/index.js`: Router and all endpoint handlers
- `src/admin.js`: Admin API key management (create, list, revoke)
- `src/auth.js`: Authentication logic
- `src/log.js`: Logging helper
- `src/capture.js`: Capture pipeline

### Engineering philosophy (from CLAUDE.md)
- YAGNI, KISS, Lean and Mean
- Fail loudly, degrade intentionally
- <300ms latency always
- Vanilla JS, no frameworks

## External Skill Discovery
No external skills found in .claude/skills/ or .skills/.

## Instructions
1. Read relevant files to understand the codebase context
2. Analyze the task against your delegation table
3. Identify which specialists should be CONSULTED FOR PLANNING (not execution — planning)
4. For each specialist, write a specific planning question that draws on their unique expertise
5. Return the meta-plan in the structured format
6. Write your complete meta-plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-NTwYqk/audit-logging-authenticated-requests/phase1-metaplan.md
