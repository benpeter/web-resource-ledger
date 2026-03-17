## Task: Create evolution log entries for audit logging phase

You are creating the evolution log directory and documentation for the audit
logging phase (R13). This is phase 0038 in the evolution log.

### Context

The project requires evolution log entries for every significant phase
(see CLAUDE.md "Evolution Log" section). This phase adds structured audit
logging to authenticated API requests.

### What to do

1. Create directory `docs/evolution/0038-audit-logging/`

2. Create `docs/evolution/0038-audit-logging/prompt.md` with the original
   task briefing:
   ```
   # Phase 0038: Audit Logging for Authenticated Requests

   Full audit trail of authenticated API activity -- who captured what, when,
   with which key -- enabling abuse investigation and compliance reporting
   for multi-tenant operation.

   Depends on R12 (per-tenant keys) for full value; ships ahead of R12 with
   keyId derived from the single CAPTURE_API_KEY (static fingerprint).

   GitHub Issue: #43
   ```

3. Create `docs/evolution/0038-audit-logging/decisions.md` documenting:

   a. **Subsystem strategy**: Dedicated `audit` subsystem chosen over
      `audit: true` flag on existing events. Rationale: clean
      `subsystemName:"audit"` queries, separation of audit trail from
      operational logs, independent retention possible. Rejected alternative:
      observability-minion recommended augmenting existing events with
      `audit: true` flag -- rejected because field-level filtering is less
      ergonomic than subsystem filtering, and mixing audit fields into
      operational events serves neither audience well.

   b. **Event naming convention**: `audit.<resource>.<action>` pattern
      explicitly extending the existing `subsystem.detail` taxonomy. This is
      a conscious taxonomy extension, not a continuation of the two-segment
      pattern. Existing events use two segments (`capture.start`,
      `security.auth_fail`); audit events use three segments to separate
      resource from action. Document this clearly so future event authors
      know which pattern to use: operational events continue with
      `subsystem.detail`; audit events use `audit.<resource>.<action>`.

   c. **Outcome enum**: Three values: `success`, `denied`, `error`. Not
      boolean. "denied" = system correctly rejected (auth fail, SSRF block);
      "error" = something broke after auth succeeded.

   d. **Audit events as supplements, not replacements**: Audit events are
      lean (common envelope only). Operational events (`capture.success`,
      `list.success`) remain for debugging with full detail.

   e. **keyId derivation pre-R12**: SHA-256 prefix (8 hex chars) of the
      single `CAPTURE_API_KEY`. Static value until R12 ships per-tenant keys.
      Document the known limitation and why it is acceptable. Note: keyId is
      a logging label only, not a security primitive.

   f. **Key lifecycle events (forward reference)**: R12 will extend the audit
      subsystem with key lifecycle events (`audit.key.create`,
      `audit.key.revoke`). Document the intended event names and the hard
      constraint that key material MUST NEVER appear in any log entry. Do NOT
      define field-level schema tables -- R12's admin API design will drive
      the schema. A single paragraph noting the planned events and constraints
      is sufficient.

   g. **URL exclusion from audit events**: Audit events do not include the
      capture URL. The URL is attacker-controlled input and is already logged
      in the operational `capture.start` event. Audit events use `captureId`
      as the resource identifier; operators correlate to URL via KV or
      operational logs.

   h. **Coralogix JSON parse rule dependency**: The existing `log()` function
      stores the event payload as `JSON.stringify(data)` in the `text` field.
      Field-level Coralogix queries (e.g., `json.tenantId:"acme"`) require a
      Parse JSON Field rule to be active on the `text` field. Without this
      rule, only full-text search against the raw string works. Document this
      dependency and note that the verification step for this phase should
      confirm field-level queries work before marking the feature done.

   i. **No capture.js changes (deferred to R12)**: The original plan
      proposed threading `keyId` through the `performCapture()` function
      signature to enrich operational logs (`capture.start`, `capture.success`,
      etc.). This was deferred after architecture review: 3 reviewers
      independently flagged that inserting a positional parameter would
      silently break 50+ test call sites across 5+ files, and the value is
      static pre-R12. Audit events are emitted in `src/index.js` where
      `keyId` is already in scope. R12 should revisit threading `keyId`
      into `capture.js` when per-tenant keys make it meaningful.

4. Update `docs/evolution/README.md` -- add row after the last entry:
   `| [0038-audit-logging](0038-audit-logging/) | Audit logging for authenticated API requests (Issue #43) |`

### What NOT to do

- Do NOT create `outcome.md` yet -- that is written after execution.
- Do NOT create a standalone `docs/audit-events.md`. The event catalog
  lives in the evolution log following the Phase 0015 pattern.
- Do NOT create an ADR. This is a documentation format choice documented
  in decisions.md.
- Do NOT create field-level schema tables for key lifecycle events --
  that is YAGNI until R12 ships.

### Files to create
- `docs/evolution/0038-audit-logging/prompt.md`
- `docs/evolution/0038-audit-logging/decisions.md`

### Files to modify
- `docs/evolution/README.md` -- add Phase 0038 row

### Reference
- See `docs/evolution/0015-coralogix-logging/outcome.md` for the existing
  log event taxonomy table format.
- See `docs/backlog.md` line with R13 for the backlog item.
