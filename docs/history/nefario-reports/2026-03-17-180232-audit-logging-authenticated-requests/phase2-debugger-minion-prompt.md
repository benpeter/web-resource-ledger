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
Looking at the request flow in `src/index.js`, where should audit log calls go for minimum code change and maximum coverage? (a) Router level vs. per-handler? (b) Can the post-auth sections of `handleCreateCapture`/`handleListCaptures` be extended without duplicating log patterns? (c) Does `capture.js` already logging `tenantId` count as audit coverage, or do we need separate audit events? (d) What's the minimal set of code changes?

## Context
- Working directory: /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/feature/audit-logging-for-authenticated-requests
- Key files: `src/index.js` (route table and handlers), `src/auth.js`, `src/capture.js`, `src/log.js`
- Authenticated endpoints: POST /v1/captures (handleCreateCapture), GET /v1/captures (handleListCaptures)
- Public endpoints (no auth): GET /health, GET /v1/captures/:id, GET /v1/captures/:id/status, GET /v1/captures/:id/artifacts/:name, GET /v1/verify/:id, GET /.well-known/signing-key(s)
- capture.js already logs: capture.start, capture.success, capture.partial, capture.fail — all include tenantId
- list handler logs: list.success, list.error — both include tenantId

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that
   aren't already part of the planning, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: debugger-minion

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
6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-i3EPD4/audit-logging-authenticated-requests/phase2-debugger-minion.md`
