# Domain Plan Contribution: software-docs-minion

## Planning Question

> Should R13 establish an audit event catalog (table of events and fields)? Where should it live -- `docs/audit-events.md`, inline in `log.js`, or code comments?

## Recommendations

### Yes, establish a catalog -- but keep it in the evolution log, not as a standalone doc

The project already has an implicit event catalog: the "Log event taxonomy" table in `docs/evolution/0015-coralogix-logging/outcome.md`. That table lists 10 events with severity, subsystem, and source file. R13 will add 5-10 new audit events. The question is where this growing catalog should live.

**Recommendation: Put the audit event catalog in the R13 evolution log's `outcome.md`, following the exact pattern established in Phase 0015.**

Rationale for each option considered:

1. **`docs/audit-events.md` (standalone doc)** -- Rejected. This creates a second source of truth that must be kept in sync with code. The project has no mechanism for enforcing doc-code sync (no CI lint, no automated extraction). Standalone reference docs rot. The Helix Manifesto's "lean and mean" principle argues against maintaining a document that duplicates information derivable from `grep -r "event:" src/`. The backlog already has a `[consider]` for cross-document link linting (#118 in parking lot) -- the infrastructure for keeping standalone docs honest does not exist yet.

2. **Inline in `log.js`** -- Rejected. `log.js` is a 46-line fire-and-forget transport function. It has no knowledge of event semantics. Putting a catalog there violates single-responsibility and would make `log.js` the most-edited file in the project despite being functionally stable.

3. **Code comments at each call site** -- Already partially done (the events are self-documenting via their `event:` field names like `security.auth_fail`, `capture.success`). This is sufficient for the "what." No additional inline comments needed -- the naming convention (`subsystem.action`) is clear and consistent.

4. **Evolution log `outcome.md` table** (recommended) -- Follows the established pattern from Phase 0015. The evolution log is the project's canonical record of what was built and why. The table serves as a snapshot of the audit events introduced in R13, with enough context to understand the design decisions. Anyone investigating audit events will find them in the same place they find all other feature documentation: the evolution log.

### The catalog should document the contract, not the implementation

The audit event table should capture:

| Column | Why |
|--------|-----|
| Event name | The `event` field value (e.g., `audit.capture.create`) |
| Severity | Coralogix severity level |
| Subsystem | The `subsystem` parameter (`audit`, `security`, etc.) |
| Required fields | Fields that are always present (tenantId, keyId, action) |
| Conditional fields | Fields that appear only for specific events (captureId, url hash, etc.) |
| Source | File where the log call lives |

This is the same structure as Phase 0015's table, extended with the field inventory. The field inventory is critical because audit logs have a contract with Coralogix queries -- if a field name changes, queries break.

### Event naming convention should extend the existing `subsystem.noun_verb` pattern

The existing events follow `subsystem.detail`:
- `capture.start`, `capture.success`, `capture.fail`
- `security.auth_fail`, `security.rate_limit`, `security.ssrf_block`
- `list.success`, `list.error`

For audit events, I recommend using `audit.` as the subsystem prefix with the existing noun-verb pattern:
- `audit.capture.create` -- authenticated capture request accepted
- `audit.capture.retrieve` -- authenticated capture retrieval
- `audit.key.create` -- API key provisioned (when R12 ships)
- `audit.key.revoke` -- API key revoked

This keeps audit events queryable as a distinct subsystem in Coralogix (`subsystemName == 'audit'`) while maintaining naming consistency with existing events.

### Do NOT create an ADR for the catalog location decision

This is a documentation format choice, not an architectural decision. The evolution log's `decisions.md` is the right place to record the rationale (and a short entry there is sufficient). ADRs are for choices with lasting architectural impact -- database selection, auth approach, API patterns. "Where we wrote down the event list" does not meet that threshold.

## Proposed Tasks

### Task 1: Define audit event naming convention in `decisions.md`

**What**: During R13 implementation, record in `docs/evolution/NNNN-audit-logging/decisions.md` the naming convention for audit events (`audit.noun.verb`), the subsystem choice (`audit`), and the field contract (which fields are required on all audit events vs. event-specific).

**Deliverable**: A decisions.md entry (3-5 paragraphs) covering the naming convention, alternatives considered, and rationale.

**Dependencies**: None. This is a documentation task that happens alongside implementation.

### Task 2: Produce audit event taxonomy table in `outcome.md`

**What**: After implementation, include a table in `docs/evolution/NNNN-audit-logging/outcome.md` listing every audit event introduced, following the Phase 0015 pattern but extended with a "Required fields" and "Conditional fields" column.

**Deliverable**: A Markdown table in outcome.md. Example shape:

```
| Event | Severity | Subsystem | Required fields | Conditional fields | Source |
|-------|----------|-----------|-----------------|-------------------|--------|
| audit.capture.create | 3 (info) | audit | tenantId, keyId, action, cip | captureId, url (no) | index.js |
```

**Dependencies**: Implementation must be complete so the table reflects actual shipped events, not planned ones.

### Task 3: Update backlog entry for R13

**What**: Mark R13 as done in `docs/backlog.md`. Note that security event logging (marked PARTIAL in Phase 0015) is now fully addressed by the combination of Phase 0015 security events and R13 audit events.

**Deliverable**: Updated backlog.md with R13 struck through, any new deferred items added to the parking lot.

**Dependencies**: R13 implementation and PR merge.

## Risks and Concerns

### Risk 1: Event field drift between code and Coralogix queries

The biggest documentation risk is not "where is the catalog" but "will it stay accurate." Coralogix queries that reference field names (`tenantId`, `keyId`, `action`) will break silently if those fields are renamed in code. The evolution log table is a snapshot -- it does not enforce consistency.

**Mitigation**: The field names should be chosen to match the existing data model vocabulary exactly (`tenantId` from auth.js, `keyId` from R12's key record, `captureId` from existing capture events). Reuse existing field names; do not invent synonyms.

### Risk 2: Audit events confused with existing security events

The codebase already logs `security.auth_fail` on every failed auth attempt. R13 will add `audit.capture.create` on every successful authenticated request. If both use the same `subsystem: 'security'`, Coralogix queries become ambiguous. If they use different subsystems, the relationship is unclear.

**Mitigation**: Use `subsystem: 'audit'` for all R13 events. Document explicitly in decisions.md that audit events log **successful authenticated actions** (who did what), while security events log **rejected/suspicious requests** (who tried what and was stopped). This distinction is the "why" that future developers need.

### Risk 3: Over-documenting a simple feature

R13 is adding `log()` calls to existing handlers. The implementation is likely 20-30 lines of code across 2-3 files. Creating a standalone `docs/audit-events.md` or an ADR for this would violate the project's lean-and-mean principle and create maintenance burden disproportionate to the feature's complexity.

**Mitigation**: Keep documentation in the evolution log (which is already required by project rules) and in code (event name strings that are self-documenting). No new standalone docs.

### Risk 4: R12 dependency means key lifecycle events are speculative

The issue says "depends on R12 (per-tenant keys)." If R13 ships before R12, there are no key provisioning or revocation events to log because the current auth is a single hardcoded key. The catalog should only document events that actually ship in R13's PR, not aspirational events for future phases.

**Mitigation**: If R13 ships with R12, include key lifecycle events. If R13 ships ahead of R12 (just audit logging for the current single-key auth), document only the request-level audit events and note that key lifecycle events will follow with R12.

## Additional Agents Needed

None. The current team is sufficient. The documentation deliverables (evolution log entries, backlog updates) are mechanical outputs of the implementation process. No separate documentation phase is needed -- the evolution log structure enforced by CLAUDE.md ensures documentation happens as part of every phase.

One note: if the team includes an **observability-minion**, they should validate the Coralogix subsystem and field naming choices to ensure queries work as expected. The documentation captures what was decided, but the observability specialist should validate that the decisions result in queryable data.
