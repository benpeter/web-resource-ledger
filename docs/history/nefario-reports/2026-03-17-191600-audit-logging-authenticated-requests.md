---
task: "Audit logging for authenticated requests"
source-issue: 43
date: 2026-03-17
mode: execution
task-count: 4
gate-count: 1
agents: observability-minion, security-minion, test-minion, ux-strategy-minion, software-docs-minion
reviewers: security-minion, test-minion, ux-strategy-minion, lucy, margo
compaction-events: 0
---

## Summary

Added structured audit logging to all authenticated API requests and key lifecycle events. Every log call on an authenticated path now includes a consistent audit envelope: tenantId, keyName, keyHashPrefix, authMethod, cip, and responseStatus. Renamed list.* events to capture.list* for operator mental model alignment. Fixed an existing INVARIANT violation (tenantFilter logged as raw user input). Created docs/audit-log-schema.md with full event taxonomy and Coralogix queries. 583 tests pass (0 new -- enrichment-only changes).

Resolves #43

## Original Prompt

Full audit trail of authenticated API activity -- who captured what, when, with which key -- enabling abuse investigation and compliance reporting for multi-tenant operation. All approvals pre-given, no compaction stops.

## Key Design Decisions

1. **Enrich existing events, no separate audit subsystem** -- All 5 planning specialists agreed. Operators query one place, not two. The existing subsystem structure (capture, admin, security) maps to operator mental models.

2. **No src/audit.js extraction** -- test-minion proposed builder functions; rejected on KISS/YAGNI grounds. ~15 log calls with slightly different contexts each. Inline field addition is clearer.

3. **Rename list.* to capture.list*** -- Breaking change accepted because project is pre-GA. An operator searching event:capture.* would miss listing events under the old naming.

4. **admin.key_list severity 6 to 3** -- Severity 6 events may be filtered by Coralogix TCO policies, silently removing admin key listing from the audit trail.

5. **Validate tenantFilter before logging** -- Security-minion's Phase 3.5 advisory: the tenantFilter query parameter was raw user input being logged, violating the log() INVARIANT. Validated against TENANT_ID_RE; invalid values logged as null.

6. **No admin caller identity beyond cip** -- Single ADMIN_KEY cannot distinguish operators. Premature to add identity infrastructure until per-operator admin keys exist.

## Phases

### Phase 1: Meta-Plan
Selected 5 specialists: observability-minion (audit schema design), security-minion (field safety review), test-minion (test boundary), ux-strategy-minion (operator journey coherence), software-docs-minion (schema documentation). Team auto-approved per user directive.

### Phase 2: Specialist Planning (5 agents)
All 5 ran in parallel. Key consensus: consistent audit envelope fields, enrich existing events (no new subsystem), keep it simple. Observability-minion identified three gaps: admin handlers lack cip, success paths lack keyHashPrefix, responseStatus never logged. Security-minion confirmed all fields are INVARIANT-safe, flagged tenantFilter violation. test-minion proposed src/audit.js extraction (later rejected). ux-strategy-minion recommended list.* rename and severity promotion. software-docs-minion recommended standalone docs/audit-log-schema.md.

### Phase 3: Synthesis
Consolidated into 4 tasks with 1 approval gate on auth contract change. Resolved 1 conflict: src/audit.js extraction vs inline (chose inline per KISS). Execution in 3 batches.

### Phase 3.5: Architecture Review (5 mandatory reviewers)
All 5 mandatory reviewers ran in parallel. Results: 1 APPROVE (ux-strategy), 4 ADVISE (security, test, lucy, margo), 0 BLOCK.

Key advisories incorporated:
- security-minion: Validate tenantFilter against TENANT_ID_RE before logging
- test-minion: Add keyHashPrefix assertion to auth tests, audit null guard consistency for legacy path
- lucy: Create prompt.md before execution starts per CLAUDE.md rule 1
- margo: Use event names not line numbers in prompts, lighter docs scope

### Phase 4: Execution (4 tasks, 1 gate)
All approvals auto-given per user directive.

**Task 1**: Auth contract plumbing -- keyHashPrefix in verifyApiKey success return, cip in admin handlers, list.* rename. Gate auto-approved.
**Task 2**: Enrich all log calls with audit envelope fields. Severity promotion for admin.key_list. tenantFilter INVARIANT fix.
**Task 3**: Update log() INVARIANT comment, add NEVER-LOG documentation.
**Task 4**: docs/audit-log-schema.md, evolution log 0039, backlog update, OPERATIONS.md cross-reference.

### Verification
All checks passed. 583 tests pass. No old event names remaining. No forbidden fields in log calls.

## Agent Contributions

### Planning Agents
- **observability-minion**: Defined audit envelope schema, identified 3 coverage gaps (admin cip, success keyHashPrefix, responseStatus)
- **security-minion**: Confirmed INVARIANT compliance for all fields, identified tenantFilter violation, defined NEVER-LOG field list
- **test-minion**: Recommended test boundary (unit schema tests, smoke integration, no handler-level log assertions), proposed src/audit.js
- **ux-strategy-minion**: Recommended list.* rename, severity promotion, operator journey documentation with 3 job categories
- **software-docs-minion**: Recommended standalone audit-log-schema.md with full event taxonomy

### Review Agents
- **security-minion**: ADVISE -- tenantFilter INVARIANT violation (incorporated)
- **test-minion**: ADVISE -- keyHashPrefix test coverage, null guard consistency (incorporated)
- **ux-strategy-minion**: APPROVE -- plan is coherent for operator experience
- **lucy**: ADVISE -- prompt.md sequencing per CLAUDE.md rule 1 (incorporated)
- **margo**: ADVISE -- prompt simplification, lighter docs scope (noted)

## Session Resources

### Skills Invoked
- /nefario

### Compaction
0 compaction events (user requested no compaction stops).

## Working Files

Working files preserved in [2026-03-17-191600-audit-logging-authenticated-requests/](2026-03-17-191600-audit-logging-authenticated-requests/).
