You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task

**Outcome**: Full audit trail of authenticated API activity — who captured what, when, with which key — enabling abuse investigation and compliance reporting for multi-tenant operation.

**Success criteria**:
- All authenticated API requests logged with tenant context (tenantId, keyId, action, resource)
- Key provisioning and revocation events logged
- Log entries integrate with existing Coralogix structured logging
- Audit trail queryable by tenant and time range in Coralogix

**Scope**:
- In: Structured log entries on every authenticated request, key lifecycle events, integration with existing log() helper
- Out: Audit log export API, compliance report generation, log retention policies

## Your Planning Question

Given the existing `log()` helper and Coralogix as the log backend, what should a consistent audit event schema look like for multi-tenant compliance querying? Consider: (a) which fields must be present on every authenticated request log entry (tenantId, keyId/keyName, action, resource, timestamp, cip, authMethod, responseStatus), (b) how to structure event names for efficient Coralogix filtering (current pattern: `subsystem.action` like `capture.queued`, `admin.key_create`), (c) whether key lifecycle events need additional fields beyond what's currently logged, (d) whether the existing severity levels (3=info for success, 5=error for failures) are appropriate for audit events. The current log calls are in `src/index.js` (handlers) and `src/admin.js` (admin handlers).

## Context

Read these files for context:
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/feature/audit-logging-for-authenticated-requests-2/src/log.js
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/feature/audit-logging-for-authenticated-requests-2/src/index.js
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/feature/audit-logging-for-authenticated-requests-2/src/admin.js
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/feature/audit-logging-for-authenticated-requests-2/src/auth.js

## Instructions
1. Read the relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. Return your contribution in this format:

## Domain Plan Contribution: observability-minion

### Recommendations
### Proposed Tasks
### Risks and Concerns
### Additional Agents Needed

5. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-NTwYqk/audit-logging-authenticated-requests/phase2-observability-minion.md
