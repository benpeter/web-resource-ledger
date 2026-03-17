MODE: SYNTHESIS

You are synthesizing specialist planning contributions into a final execution plan.

## Original Task

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

## Specialist Contributions

Read the following scratch files for full specialist contributions:
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-NTwYqk/audit-logging-authenticated-requests/phase2-observability-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-NTwYqk/audit-logging-authenticated-requests/phase2-security-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-NTwYqk/audit-logging-authenticated-requests/phase2-test-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-NTwYqk/audit-logging-authenticated-requests/phase2-ux-strategy-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-NTwYqk/audit-logging-authenticated-requests/phase2-software-docs-minion.md

## Key consensus across specialists:

### observability-minion
Recommendation: Define consistent audit envelope (event, tenantId, keyName, keyHashPrefix, authMethod, responseStatus, cip) on every authenticated request; fix gaps where admin handlers lack cip, success paths lack keyHashPrefix, and responseStatus is never logged.
Tasks: 4 -- add keyHashPrefix to verifyApiKey success return; compute cip in admin handlers; add responseStatus to all audit log calls; promote admin.key_list severity 6 to 3
Risks: Auth result contract change needs test updates; log volume increase minor
Conflicts: none

### security-minion
Recommendation: All proposed audit fields (tenantId, keyName, keyHashPrefix, authMethod, cip) are safe to log and satisfy the log() INVARIANT; never log raw tokens, full keyHash, raw IPs, or Authorization headers; don't add admin caller identity beyond cip until per-operator admin keys exist.
Tasks: 7 -- enforce destructured field picking in log calls; add cip to admin handlers; update INVARIANT comment for url field; verify keyName regex prevents injection; document never-log fields
Risks: Full keyHash in admin responses could be copy-pasted into logs by mistake; url field bends INVARIANT
Conflicts: none

### test-minion
Recommendation: Test audit schema with unit tests on pure function, smoke integration tests for wiring, don't assert on log payloads from handler-level tests; suggests extracting audit event construction into src/audit.js.
Tasks: 3 -- extract audit event schema construction; unit test audit schema; smoke integration tests for audit wiring
Risks: verifyApiKey success path lacks keyHashPrefix; log() is no-op in tests
Conflicts: src/audit.js extraction may conflict with KISS principle

### ux-strategy-minion
Recommendation: Rename list.* to capture.list*, normalize mandatory audit fields across all events, ensure tenantId present even as null on pre-auth failures, elevate admin.key_list severity 6 to 3, don't create separate audit subsystem.
Tasks: 3 -- rename list subsystem; normalize mandatory fields across all events; document copy-pasteable Coralogix queries
Risks: Renaming list.* breaks existing Coralogix queries/alerts
Conflicts: none

### software-docs-minion
Recommendation: Create docs/audit-log-schema.md as standalone operator-facing reference with full event taxonomy, field dictionary, severity mapping, and Coralogix queries; ship in same PR; add cross-reference from OPERATIONS.md.
Tasks: 3 -- write docs/audit-log-schema.md; create evolution log 0039; update backlog and OPERATIONS.md
Risks: Schema doc written before implementation may drift
Conflicts: none

## External Skills Context
No external skills detected.

## Key Conflict to Resolve

test-minion proposes extracting audit event construction into src/audit.js. This needs evaluation against the project's KISS/YAGNI principles. If the audit "schema" is just consistently passing the same fields to the existing log() helper, a separate module may be over-engineering. Consider whether inline field construction with a shared field set is simpler.

## Instructions
1. Review all specialist contributions
2. Resolve any conflicts between recommendations
3. Incorporate risks and concerns into the plan
4. Create the final execution plan in structured format
5. Ensure every task has a complete, self-contained prompt
6. Write your complete delegation plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-NTwYqk/audit-logging-authenticated-requests/phase3-synthesis.md
