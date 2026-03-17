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

Review the proposed audit logging for security implications: (a) Does logging `keyName` and `keyHashPrefix` (first 8 chars of SHA-256) create information disclosure risk? (b) Are there fields we should explicitly NEVER include in audit logs? (c) Does tenant context (tenantId, keyName, authMethod) satisfy the `log()` helper's INVARIANT that data must contain only static values and predetermined strings, never attacker-controlled input? (d) Should admin operations include more caller identity than `authMethod: 'admin_key'`?

## Context

Read these files for context:
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/feature/audit-logging-for-authenticated-requests-2/src/log.js (INVARIANT comment)
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/feature/audit-logging-for-authenticated-requests-2/src/auth.js (auth result shapes)
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/feature/audit-logging-for-authenticated-requests-2/src/admin.js (current admin logging)
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/feature/audit-logging-for-authenticated-requests-2/src/ip-hash.js

## Instructions
1. Read the relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. Return your contribution in this format:

## Domain Plan Contribution: security-minion

### Recommendations
### Proposed Tasks
### Risks and Concerns
### Additional Agents Needed

5. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-NTwYqk/audit-logging-authenticated-requests/phase2-security-minion.md
