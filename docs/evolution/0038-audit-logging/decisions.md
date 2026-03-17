# Phase 0038: Decisions

## a. Subsystem strategy: dedicated `audit` subsystem

Audit events are emitted under a dedicated `audit` subsystem rather than
augmenting existing operational events with an `audit: true` flag.

**Decision**: Dedicated subsystem.

**Rationale**: A clean `subsystemName:"audit"` query retrieves the complete
audit trail with no false positives. Subsystem separation also allows
independent retention policies for audit vs. operational data in Coralogix.

**Rejected alternative**: observability-minion recommended augmenting
existing events with an `audit: true` flag. Rejected because field-level
filtering (`json.audit:true`) is less ergonomic than subsystem filtering,
and mixing audit fields into operational events serves neither audience well
-- operators debugging a capture need different context than auditors
reviewing access.

## b. Event naming convention: `audit.<resource>.<action>`

Audit events use a three-segment naming pattern that consciously extends the
existing `subsystem.detail` taxonomy.

**Decision**: `audit.<resource>.<action>` for all audit events.

**Rationale**: Existing operational events use two segments
(`capture.start`, `security.auth_fail`). Audit events use three segments to
separate the resource being acted on from the action taken. This is a
deliberate taxonomy extension, not a deviation.

**Pattern guide for future event authors**:
- Operational events: `subsystem.detail` (two segments, e.g. `capture.success`)
- Audit events: `audit.<resource>.<action>` (three segments, e.g. `audit.capture.create`)

## c. Outcome enum: three values

**Decision**: `outcome` field uses three string values: `success`, `denied`,
`error`.

**Rationale**: Boolean pass/fail loses meaningful distinction between
intentional rejection and unexpected failure.

- `success` -- authenticated request completed normally
- `denied` -- system correctly rejected (auth failure, SSRF block, rate
  limit); the system behaved as designed
- `error` -- something broke after authentication succeeded

This distinction is critical for abuse investigation: a pattern of `denied`
events is expected noise; a pattern of `error` events after auth is an
incident.

## d. Audit events supplement, not replace, operational events

**Decision**: Audit events carry only the common envelope (tenantId, keyId,
action, outcome, captureId). Operational events (`capture.success`,
`capture.start`, etc.) remain for debugging with full detail.

**Rationale**: Lean audit events avoid duplicating fields that exist in
operational logs. Operators correlate audit and operational events via
`captureId`. Neither log stream is authoritative for both purposes.

## e. keyId derivation pre-R12

**Decision**: Before R12 ships per-tenant keys, `keyId` is derived as the
first 8 hex characters of the SHA-256 hash of `CAPTURE_API_KEY`.

**Rationale**: A static fingerprint allows audit events to carry a `keyId`
field without R12 in place. The value is deterministic and consistent across
all events for the same key.

**Known limitation**: This is a static identifier -- all requests use the
same `keyId` until R12 ships. The field exists to establish the audit event
schema; it becomes meaningful when R12 introduces per-tenant keys.

**Important**: `keyId` is a logging label only, not a security primitive. It
MUST NOT be used for access control decisions.

## f. Key lifecycle events (forward reference to R12)

R12 will extend the audit subsystem with key lifecycle events:

- `audit.key.create` -- emitted when a new API key is provisioned
- `audit.key.revoke` -- emitted when an API key is revoked

**Hard constraint**: Key material (raw API key values, signing keys, or any
derivative that could be used to reconstruct a key) MUST NEVER appear in any
log entry. Log the `keyId` fingerprint only.

Field-level schema for these events is not defined here. R12's admin API
design will drive the schema. The event names and the no-key-material
constraint are the binding decisions recorded now.

## g. URL exclusion from audit events

**Decision**: Audit events do not include the capture URL.

**Rationale**: The capture URL is attacker-controlled input. Including it in
audit events would make audit logs a secondary vector for URL injection or
exfiltration of attacker-supplied content. The URL is already logged in the
operational `capture.start` event, which is the appropriate place for
input-derived fields.

Audit events use `captureId` as the resource identifier. Operators who need
to correlate a `captureId` to a URL look it up via KV or the `capture.start`
operational log entry.

## h. Coralogix JSON parse rule dependency

The `log()` function in `src/log.js` stores the event payload as
`JSON.stringify(data)` in the `text` field of the Coralogix log entry.
Field-level Coralogix queries (e.g., `json.tenantId:"acme"`,
`json.outcome:"denied"`) require a **Parse JSON Field** rule to be active on
the `text` field in the Coralogix UI.

Without this rule:
- Full-text search against the raw JSON string works
- Field-level queries do not resolve

**Verification requirement**: Before marking this phase complete, confirm
that a field-level query against `json.tenantId` or `json.outcome` returns
results from a real audit event. If it does not, the Parse JSON Field rule
needs to be enabled or created in Coralogix before the feature is considered
operational.

## i. No capture.js changes (deferred to R12)

**Decision**: `keyId` is NOT threaded through the `performCapture()`
function signature in this phase.

**Rationale**: The original plan proposed adding `keyId` as a parameter to
`performCapture()` to enrich operational logs (`capture.start`,
`capture.success`, etc.). This was deferred after architecture review: three
reviewers independently flagged that inserting a positional parameter would
silently break 50+ test call sites across 5+ files. The value is also static
pre-R12, so enriching operational logs with it provides limited benefit now.

Audit events are emitted in `src/index.js` where `keyId` is already in scope
at the point of authentication. No signature changes are needed to emit audit
events.

**R12 follow-up**: When per-tenant keys make `keyId` meaningful per-request,
R12 should revisit threading it through `performCapture()` to enrich
operational logs consistently.
