You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise
to help build a comprehensive plan.

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

**Constraints**:
- Depends on R12 (per-tenant keys) — audit logging is meaningful only with tenant identity

## Your Planning Question
Given the existing Coralogix structured logging in `src/log.js` and the current event taxonomy (`security.*`, `capture.*`, `list.*`), what should the audit log schema look like? (a) Should audit events use a new subsystem (e.g., `audit`) or extend existing subsystems? (b) What fields are required per event for tenant+time-range querying in Coralogix? (c) Do we need request-start events or just completion events? (d) How should key lifecycle events (create, revoke) be structured given they don't exist in the codebase yet?

## Context
- Working directory: /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/feature/audit-logging-for-authenticated-requests
- Key files: `src/log.js`, `src/index.js`, `src/auth.js`, `src/capture.js`
- Coralogix severity levels: 3=info, 4=warn, 5=error, 6=verbose
- Current event naming: `security.auth_fail`, `security.rate_limit`, `security.ssrf_block`, `capture.start`, `capture.success`, `capture.fail`, `list.success`, `list.error`
- log() signature: `log(env, severity, subsystem, data)` — fire-and-forget to Coralogix
- INVARIANT: `data` must contain only static values and predetermined strings, never attacker-controlled input

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that
   aren't already part of the planning, say so and explain why
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
6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-i3EPD4/audit-logging-authenticated-requests/phase2-observability-minion.md`
