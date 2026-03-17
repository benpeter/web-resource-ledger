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

The audit trail consumer is an operator querying Coralogix to investigate abuse or generate compliance reports. What's the operator journey for "show me all actions by tenant X in the last 24 hours"? Are the proposed event names and field structure intuitive for Coralogix queries? Consider: (a) event naming conventions that support both filtering (exact match) and exploration (prefix/wildcard), (b) field naming consistency across event types, (c) whether the current subsystem names (capture, security, admin, list) map well to operator mental models.

## Context

The existing event names are:
- `capture.queued` (subsystem: capture) - with tenantId, keyName, authMethod, url, cip
- `list.success` (subsystem: list) - with tenantId, keyName, authMethod, resultCount
- `admin.key_create` (subsystem: admin) - with keyHashPrefix, tenantId, scopes, name
- `admin.key_revoke` (subsystem: admin) - with keyHashPrefix, tenantId
- `admin.key_list` (subsystem: admin) - with count, tenantFilter
- `security.auth_fail` (subsystem: security) - with status, reason, cip
- `security.rate_limit` (subsystem: security) - with limiter, cip
- `security.legacy_auth_used` (subsystem: security) - with keyHashPrefix

## Instructions
1. Apply your domain expertise to the planning question
2. Identify risks, dependencies, and requirements from your perspective
3. Return your contribution in this format:

## Domain Plan Contribution: ux-strategy-minion

### Recommendations
### Proposed Tasks
### Risks and Concerns
### Additional Agents Needed

4. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-NTwYqk/audit-logging-authenticated-requests/phase2-ux-strategy-minion.md
