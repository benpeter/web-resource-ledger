# Phase 1: Meta-Plan -- Audit Logging for Authenticated Requests (R13)

## Context Summary

WRL is a Cloudflare Worker that captures web pages as evidence-grade archives.
The codebase uses a single `CAPTURE_API_KEY` env var for auth (`src/auth.js`)
with a hardcoded `tenantId: 'default'`. Structured logging already ships to
Coralogix via `src/log.js` (fire-and-forget fetch with severity, subsystem,
and data payload). Existing log events cover security (auth failures, SSRF
blocks, rate limits), capture lifecycle (start/success/fail/partial), and list
operations.

R13 (audit logging) depends on R12 (per-tenant API keys) which has NOT shipped.
The auth module is designed for R12 -- `verifyApiKey()` returns `{ ok, tenantId }`
and there's a `TENANT_ID_RE` regex contract. But today all requests resolve to
`tenantId: 'default'` because key-to-tenant mapping doesn't exist yet.

The task asks for audit log entries on every authenticated request plus key
lifecycle events (provisioning, revocation). Since no admin API or key management
system exists in the codebase, the key lifecycle logging depends on whatever
R12 implements for key CRUD.

**Key architectural facts:**
- `src/log.js`: Coralogix log helper -- `log(env, severity, subsystem, data)`
- `src/index.js`: Route handlers; auth checked in `handleCreateCapture` and
  `handleListCaptures` only (GET endpoints for captures/artifacts are public)
- `src/auth.js`: `verifyApiKey()` returns `tenantId` on success
- `src/capture.js`: Background pipeline; already logs tenantId in all events
- Existing event naming convention: `subsystem.action` (e.g., `security.auth_fail`,
  `capture.success`, `list.success`)
- Log invariant: `data` must contain only static values and predetermined strings,
  never attacker-controlled input

## Meta-Plan

### Planning Consultations

#### Consultation 1: Audit log schema and event taxonomy
- **Agent**: observability-minion
- **Planning question**: Given the existing Coralogix structured logging in `src/log.js` and the current event taxonomy (`security.*`, `capture.*`, `list.*`), what should the audit log schema look like? Specifically: (a) Should audit events use a new subsystem (e.g., `audit`) or extend the existing subsystems? (b) What fields are required for each audit event to support querying by tenant and time range in Coralogix? (c) What event types are needed -- is it sufficient to log on authenticated request completion, or do we need request-start events too? (d) How should key lifecycle events (create, revoke) be structured given they don't exist yet in the codebase?
- **Context to provide**: `src/log.js`, `src/index.js` (the handleCreateCapture and handleListCaptures handlers showing existing log patterns), the grep output showing all current `event:` values, Coralogix severity levels in use (3=info, 4=warn, 5=error, 6=verbose)
- **Why this agent**: Observability-minion owns logging schema design, structured log field standards, and Coralogix querying patterns. The core deliverable here is getting the log schema right so audit trails are queryable.

#### Consultation 2: Security properties of audit logs
- **Agent**: security-minion
- **Planning question**: What security properties must the audit log entries have for abuse investigation and compliance? Specifically: (a) What fields must NEVER appear in audit logs (the existing invariant prohibits attacker-controlled input -- does this affect audit logging of request parameters like URL)? (b) Should failed auth attempts be part of the audit trail or remain in the security subsystem? (c) For key lifecycle events, what constitutes sufficient provenance (e.g., do we need to log who performed the key operation, or is the operation itself enough at this stage)? (d) Are there log integrity concerns (tamper evidence) or is Coralogix's append-only model sufficient?
- **Context to provide**: `src/log.js` (the INVARIANT comment about data constraints), `src/auth.js`, the existing security event patterns in `src/index.js`, CLAUDE.md engineering philosophy ("fail loudly"), the task's scope ("in: structured log entries on every authenticated request")
- **Why this agent**: Security-minion must validate that audit logging doesn't create new information disclosure vectors and that the audit trail is sufficient for abuse investigation. The log injection invariant is a security property that constrains the design.

#### Consultation 3: Integration points and code structure
- **Agent**: debugger-minion
- **Planning question**: Looking at the request flow through `src/index.js`, where exactly should audit log calls be placed for minimum code change and maximum coverage? Specifically: (a) Should we add audit logging at the router level (in the `fetch()` handler after auth succeeds) or within each handler? (b) The `handleCreateCapture` and `handleListCaptures` handlers already call `verifyApiKey()` -- can we extend the post-auth section to emit audit events without duplicating the log call pattern? (c) `capture.js` already logs `tenantId` in all its events -- does that count as audit coverage for capture operations, or do we need a separate audit event? (d) What's the minimal set of code changes to cover all authenticated endpoints?
- **Context to provide**: Full `src/index.js`, `src/auth.js`, `src/capture.js` (the performCapture log calls), the route table
- **Why this agent**: Debugger-minion excels at tracing execution paths and identifying the minimal intervention points. The task scope is narrow (extend existing logging, not build a new system), and getting the placement right avoids both duplication and gaps.

### Cross-Cutting Checklist

- **Testing**: Include test-minion for planning. Existing `test/log.test.js` tests the log helper; new audit events need test coverage to verify the correct fields are emitted. Planning question: What test approach validates that audit events are emitted with correct tenant context on authenticated requests, given the existing test fixtures pattern?
- **Security**: INCLUDED above as Consultation 2. Security properties of audit logging are a primary concern.
- **Usability -- Strategy**: INCLUDED. Planning question for ux-strategy-minion: From an operator's perspective, what does "queryable by tenant and time range" mean in practice? What are the 2-3 most common investigation scenarios (e.g., "show me everything tenant X did last Tuesday") and how should audit events be structured to make those queries simple in Coralogix? This shapes the event schema more than any technical constraint.
- **Usability -- Design**: Exclude. No user-facing UI is produced by this task. All output is structured log data consumed via Coralogix dashboards.
- **Documentation**: INCLUDED. Planning question for software-docs-minion: The existing codebase has no documentation of the log event taxonomy. Should R13 establish an audit event catalog (even a simple table in a doc) so operators know what events exist and what fields they carry? Where should this live -- inline in `log.js`, a separate `docs/audit-events.md`, or in code comments on each log call site?
- **Observability**: INCLUDED above as Consultation 1. This task IS an observability task.

### Notable Exclusions

- **api-design-minion**: No new API endpoints are being created. Audit logging is internal structured logging, not an API surface. If R12 introduces admin endpoints for key management, api-design-minion would be consulted there, not here.
- **iac-minion**: No infrastructure changes needed. Coralogix integration already exists; audit logs use the same `log()` helper and delivery pipeline. No new secrets, bindings, or deployment changes.
- **data-minion**: No new data stores. Audit events go through the existing Coralogix pipeline. No KV schema changes needed.

### Anticipated Approval Gates

1. **Audit event schema and taxonomy** (MUST gate): The event names, field sets, and subsystem assignment will be referenced by every downstream implementation task and by operators querying Coralogix. Hard to change retroactively once events are shipping to Coralogix (log consumers may build queries/alerts on the schema). High blast radius: all implementation tasks depend on this decision.

This should be the only gate. The implementation itself is straightforward once the schema is settled -- adding `log()` calls with agreed-upon fields at identified code locations. Easy to reverse (remove or modify log calls), low blast radius per-change.

### Rationale

This is a focused, well-scoped task: extend existing structured logging to create
an audit trail. The codebase already has the logging infrastructure (`log.js`),
the auth context (`tenantId` from `verifyApiKey()`), and a naming convention for
events. The main planning challenge is getting the schema right -- what events,
what fields, what subsystem -- so the audit trail is useful for abuse investigation
and compliance querying in Coralogix.

Three specialists are consulted for planning: observability-minion (log schema
design), security-minion (security properties and constraints), and
debugger-minion (minimal code intervention points). UX-strategy-minion shapes
the schema from the operator's investigation workflow perspective.
Software-docs-minion addresses whether the event taxonomy should be documented.
Test-minion advises on validation approach.

### Scope

**In scope:**
- Structured audit log entries on every authenticated API request (POST /v1/captures,
  GET /v1/captures) with tenant context (tenantId, action, resource, outcome)
- Key lifecycle event logging stubs (designed for R12 to call when key CRUD happens)
- Integration with existing `log()` helper and Coralogix pipeline
- Audit event documentation (scope TBD by software-docs-minion)

**Out of scope:**
- Audit log export API
- Compliance report generation
- Log retention policies
- Coralogix dashboard/alert creation
- R12 implementation (per-tenant keys)
- Admin API endpoints
- Changes to the `log()` helper itself (unless the schema review identifies a gap)

### External Skill Integration

No external skills detected in project.
