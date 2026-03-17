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
What security properties must audit log entries have? (a) What fields must NEVER appear (the existing invariant prohibits attacker-controlled input -- does this affect logging request parameters like URL)? (b) Should failed auth be part of the audit trail or remain in the security subsystem? (c) For key lifecycle events, what constitutes sufficient provenance? (d) Are there log integrity concerns beyond Coralogix's append-only model?

## Context
- Working directory: /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/feature/audit-logging-for-authenticated-requests
- Key files: `src/log.js`, `src/auth.js`, `src/index.js`
- The INVARIANT in log.js: `data` must contain only static values and predetermined strings, never attacker-controlled input. HMAC-derived values from request data (e.g., hashed IP) are acceptable.
- auth.js: verifyApiKey() returns `{ ok: true, tenantId }` on success; currently hardcodes `tenantId: 'default'`
- SECURITY: The provided Bearer token is never logged or echoed
- The "fail loudly" engineering philosophy: silent catch {} blocks are forbidden

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that
   aren't already part of the planning, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: security-minion

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
6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-i3EPD4/audit-logging-authenticated-requests/phase2-security-minion.md`
