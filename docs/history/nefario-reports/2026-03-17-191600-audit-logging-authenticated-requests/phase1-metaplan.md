## Meta-Plan

### Task Analysis

**What already exists**: The codebase has substantial logging already. `handleCreateCapture` logs `capture.queued` with tenantId, keyName, authMethod, url, cip. `handleListCaptures` logs `list.success` with tenantId, keyName, authMethod, resultCount. Admin endpoints log `admin.key_create`, `admin.key_revoke`, `admin.key_list`. Auth failures log `security.auth_fail`. The `log()` helper in `src/log.js` ships structured JSON to Coralogix via fire-and-forget fetch.

**What's needed**: The task is about ensuring *completeness and consistency* of audit logging across all authenticated endpoints, not building new infrastructure. The gap is:
1. No uniform audit event schema (field names/presence vary across handlers)
2. Some authenticated endpoints may lack logging entirely (e.g., GET /v1/captures/:id doesn't log because it uses captureId-as-secret auth, not API key auth -- but this is by design)
3. Key lifecycle events (create, revoke) are logged but may not have all fields needed for compliance querying (e.g., "show me all actions by tenant X between date A and date B")
4. No documentation of the audit log schema for Coralogix query authors

**Scope assessment**: This is a *small, focused task*. The log infrastructure exists. The auth system exists and already returns rich context. The handlers already call `log()`. The work is: (a) audit existing log calls for completeness, (b) add missing fields to achieve a consistent audit schema, (c) possibly add log calls to any authenticated endpoint that lacks them, (d) document the schema. No new modules, no middleware, no architectural changes.

### Planning Consultations

#### Consultation 1: Audit log schema and Coralogix queryability
- **Agent**: observability-minion
- **Planning question**: Given the existing `log()` helper and Coralogix as the log backend, what should a consistent audit event schema look like for multi-tenant compliance querying? Consider: (a) which fields must be present on every authenticated request log entry (tenantId, keyId/keyName, action, resource, timestamp, cip, authMethod, responseStatus), (b) how to structure event names for efficient Coralogix filtering (current pattern: `subsystem.action` like `capture.queued`, `admin.key_create`), (c) whether key lifecycle events need additional fields beyond what's currently logged, (d) whether the existing severity levels (3=info for success, 5=error for failures) are appropriate for audit events. The current log calls are in `src/index.js` (handlers) and `src/admin.js` (admin handlers). The `log()` helper is in `src/log.js`.
- **Context to provide**: `src/log.js`, `src/index.js` (handler log calls), `src/admin.js` (admin log calls), `src/auth.js` (auth result shapes)
- **Why this agent**: Observability-minion understands structured logging schemas, Coralogix query patterns, and how to design log events that support compliance querying by tenant and time range.

#### Consultation 2: Security review of audit log content
- **Agent**: security-minion
- **Planning question**: Review the proposed audit logging changes for security implications: (a) Does the current practice of logging `keyName` (human-readable label) and `keyHashPrefix` (first 8 chars of SHA-256) in audit events create any information disclosure risk? (b) Are there fields we should explicitly NEVER include in audit logs (raw tokens, full key hashes, IP addresses vs. the current HMAC-hashed `cip`)? (c) The `log()` helper's INVARIANT comment states data must contain only static values and predetermined strings -- does tenant context (tenantId, keyName, authMethod) satisfy this contract? (d) Should audit log entries for admin operations (key create, revoke) include the admin caller's identity beyond `authMethod: 'admin_key'`?
- **Context to provide**: `src/log.js` (INVARIANT comment), `src/auth.js` (auth result shapes), `src/admin.js` (current admin logging), `src/ip-hash.js` (CIP computation)
- **Why this agent**: Security-minion ensures audit logs don't leak secrets, satisfy the log helper's safety invariant, and capture enough for forensics without creating new attack surface.

### Cross-Cutting Checklist

- **Testing**: Include test-minion for planning. The existing test suite has `test/log.test.js` and handler-level tests. Planning question: given that audit logging adds log calls to existing handlers, should we add tests that verify specific audit fields are present in log calls, or is this over-testing the `log()` helper? What's the right test boundary?
- **Security**: Include -- see Consultation 2 above.
- **Usability -- Strategy**: Include. Planning question: the audit trail is consumed by operators querying Coralogix, not end users. What's the operator journey for "investigate abuse by tenant X" and "generate compliance report for time range"? Are the proposed event names and field structure intuitive for someone writing Coralogix queries? This is a UX question for an internal tool.
- **Usability -- Design**: Exclude. No user-facing UI is being built or modified. The audit trail is backend-only structured logging consumed via Coralogix's existing query interface.
- **Documentation**: Include. Planning question for software-docs-minion: what documentation artifacts should accompany the audit logging changes? Candidates: (a) an audit log schema reference (event names, fields, severity levels, example queries), (b) updates to the OpenAPI spec if any response behavior changes, (c) an entry in the evolution log. Where should the schema reference live -- inline in `src/log.js`, a standalone `docs/audit-log.md`, or in the existing architecture docs?
- **Observability**: Include -- see Consultation 1 above. Sitespeed-minion: exclude, no web-facing performance impact.

### Notable Exclusions

- **margo**: Could assess whether the audit logging adds unnecessary complexity, but the scope is narrow (adding fields to existing log calls and possibly a few new log calls). Margo will review at Phase 3.5 anyway. Excluding from planning because the YAGNI risk here is low -- we're filling gaps in existing logging, not building new abstractions.
- **api-design-minion**: No API surface changes are in scope (audit log export API is explicitly out of scope). The work is entirely internal logging.
- **frontend-minion**: No frontend changes. This is purely backend structured logging.

### Anticipated Approval Gates

1. **Audit log schema design** (MUST gate) -- The schema (event names, mandatory fields, severity mapping) is a contract that Coralogix queries will depend on. Hard to change retroactively because existing log data in Coralogix won't match the new schema. High blast radius: every execution task depends on the schema. This gate should present the proposed schema, rejected alternatives (e.g., separate audit subsystem vs. enriching existing events), and the Coralogix query patterns it enables.

No other gates anticipated. The implementation itself is straightforward once the schema is agreed.

### Rationale

This task is fundamentally about **observability design** (what to log, in what shape, for what queries) with a **security review** overlay (what not to log, what the safety constraints are). The implementation is mechanical once those questions are answered. The codebase already has the infrastructure -- the `log()` helper, the `ctx.waitUntil()` pattern, the auth result shapes with tenantId/keyName/authMethod. The planning phase needs to nail down the audit schema and validate its safety before anyone writes code.

ux-strategy-minion is included because the "user" of audit logs is an operator investigating incidents or generating compliance reports. The event naming and field structure is a UX problem for that persona.

test-minion is included to determine the right test boundary -- whether to assert on specific log fields or trust the existing `log()` test coverage.

software-docs-minion is included because an undocumented audit schema is nearly useless for the operator persona.

### Scope

**In scope**:
- Consistent audit log entries on all authenticated API requests (tenant endpoints and admin endpoints)
- Key lifecycle event logging (create, revoke) with full tenant context
- Integration with existing `log()` helper and Coralogix structured logging
- Audit schema documentation
- Tests for audit logging completeness

**Out of scope**:
- Audit log export API
- Compliance report generation
- Log retention policies
- Changes to the `log()` helper itself (unless the schema requires it)
- Changes to any API response format
- New middleware or abstraction layers

### External Skill Integration

No external skills detected in project.
