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

## Your Planning Question
What test approach validates that audit events are emitted with correct tenant context, given existing test fixtures in `test/fixtures.js` and `test/log.test.js`?

## Context
- Working directory: /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/feature/audit-logging-for-authenticated-requests
- Key test files: `test/log.test.js`, `test/fixtures.js`, `test/auth.test.js`
- Test framework: vitest (see vitest.config.js)
- log() is fire-and-forget (returns fetch Promise or undefined)
- The project principle: "Test the real boundaries" -- mocks for orchestration logic are fine, but integration tests must exercise real external boundaries

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that
   aren't already part of the planning, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: test-minion

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
6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-i3EPD4/audit-logging-authenticated-requests/phase2-test-minion.md`
