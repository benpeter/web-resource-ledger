MODE: SYNTHESIS

You are synthesizing specialist planning contributions into a
final execution plan.

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
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-i3EPD4/audit-logging-authenticated-requests/phase2-observability-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-i3EPD4/audit-logging-authenticated-requests/phase2-security-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-i3EPD4/audit-logging-authenticated-requests/phase2-debugger-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-i3EPD4/audit-logging-authenticated-requests/phase2-ux-strategy-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-i3EPD4/audit-logging-authenticated-requests/phase2-software-docs-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-i3EPD4/audit-logging-authenticated-requests/phase2-test-minion.md

## Key consensus across specialists:

### Summary: observability-minion
Phase: planning
Recommendation: Add `audit: true` boolean to existing event payloads rather than creating a new subsystem; thread keyId from auth through handlers into performCapture(); flat fields, no nesting; completion events only (no request-start)
Tasks: 5 -- Extend verifyApiKey return with keyId; Thread keyId through handlers; Add audit fields to existing events; Define key lifecycle schema (docs); Validate Coralogix queries
Risks: keyId pre-R12 is static; performCapture() signature change
Conflicts: Subsystem strategy conflicts with 4 other specialists (they want dedicated `audit` subsystem)
Full output: phase2-observability-minion.md

### Summary: security-minion
Phase: planning
Recommendation: Failed auth stays in security subsystem; URL logging acceptable as explicit INVARIANT exception (WHATWG-normalized, SSRF-validated); key lifecycle needs keyId hash fingerprint never key material; log integrity acceptable for MVP
Tasks: 5 -- Define schema; Emit audit events; Define key lifecycle schema; Update INVARIANT; Query docs
Risks: INVARIANT tension with URL logging; keyId before R12; subsystem proliferation
Conflicts: Recommends `audit` subsystem (opposite of observability-minion)
Full output: phase2-security-minion.md

### Summary: debugger-minion
Phase: planning
Recommendation: Per-handler audit logging (not router-level); two log calls in index.js; capture.js existing logs supplement but don't replace (fire in ctx.waitUntil background); no new abstractions; minimal code change (~20 lines)
Tasks: 3 -- Add audit log events to handlers; Define schema (docs); Verify queryability
Risks: R12 dependency (keyId null); ctx.waitUntil not guaranteed; no admin endpoints
Conflicts: Wants `audit` subsystem (aligns with majority)
Full output: phase2-debugger-minion.md

### Summary: ux-strategy-minion
Phase: planning
Recommendation: Three investigation scenarios (tenant activity, key tracing, error triage); flat event envelope; dedicated `audit` subsystem; three-value outcome enum (success/denied/error); audit events supplement not replace operational events
Tasks: 3 -- Define schema+taxonomy; Validate completeness against scenarios; Implement emission
Risks: Duplicate events without differentiation; pre-auth queryability gap; R12 delays key tracing
Conflicts: Wants `audit` subsystem
Full output: phase2-ux-strategy-minion.md

### Summary: software-docs-minion
Phase: planning
Recommendation: Event catalog in evolution log outcome.md (not standalone doc); extend Phase 0015 table format with Required/Conditional fields; use audit subsystem; only document shipped events
Tasks: 3 -- Naming convention in decisions.md; Taxonomy table in outcome.md; Update backlog
Risks: Event field drift; audit/security confusion; over-documenting
Conflicts: none
Full output: phase2-software-docs-minion.md

### Summary: test-minion
Phase: planning
Recommendation: Extend existing fetchMock patterns; unit tests for audit event payloads; integration tests for audit emission on authenticated endpoints; PII leakage guard tests; shared fixtures
Tasks: 7 -- Audit event builder+tests; Integration tests capture; Integration tests list; Auth failure tests; PII guard tests; Key lifecycle tests (conditional); Fixtures
Risks: ctx.waitUntil+fetchMock timing; Coralogix env vars scope; R12 dependency
Conflicts: none
Full output: phase2-test-minion.md

## Key Conflict to Resolve
**Subsystem strategy**: observability-minion recommends `audit: true` flag on existing events (no new subsystem); 4 other specialists (debugger, ux-strategy, security, software-docs) recommend a dedicated `audit` subsystem. Both approaches have merit. The dedicated subsystem enables cleaner Coralogix queries (`subsystemName:"audit"`) but splits context. The flag approach preserves co-location but requires field filtering.

## External Skills Context
No external skills detected.

## Instructions
1. Review all specialist contributions
2. Resolve the subsystem strategy conflict between specialists
3. Incorporate risks and concerns into the plan
4. Create the final execution plan in structured format
5. Ensure every task has a complete, self-contained prompt
6. Write your complete delegation plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-i3EPD4/audit-logging-authenticated-requests/phase3-synthesis.md`
