# Margo Review: Audit Logging Plan

## Verdict: ADVISE

The plan is well-scoped and proportional to the problem. Four tasks for adding
audit logging to two authenticated endpoints is reasonable. The decision to use
inline `log()` calls over an abstraction layer, to keep events lean, and to
avoid new files all align with KISS. The dedicated `audit` subsystem is a
defensible choice with clear operator benefit.

Three concerns, one significant:

---

### 1. [YAGNI] Key lifecycle event schemas documented before R12 exists

- **SCOPE**: `docs/evolution/0038-audit-logging/decisions.md`, Task 4 section (f)
- **CHANGE**: Remove the `audit.key.create` and `audit.key.revoke` schema tables
  from decisions.md. Document only the schemas that ship in this phase
  (`audit.capture.create`, `audit.capture.list`). Add a single sentence noting
  that R12 will extend the audit subsystem with key lifecycle events -- no field
  tables.
- **WHY**: Defining field-level schemas for endpoints that do not exist yet is
  speculative documentation. When R12 ships, the actual admin API implementation
  will drive the schema -- and it will likely differ from what is guessed today
  (e.g., `scopes` as `string[]` breaks the flat-field-only rule stated in the
  same plan). Pre-defining schemas creates a false contract that either
  constrains R12 unnecessarily or gets ignored and becomes stale. YAGNI applies
  to documentation contracts as much as to code.
- **TASK**: Task 4

### 2. [Signature Change] `performCapture()` positional parameter insertion is fragile

- **SCOPE**: `src/capture.js` `performCapture()` function signature, ~50 call
  sites in `test/capture.test.js`
- **CHANGE**: Instead of inserting `keyId` between `cip` and `renderer` in the
  positional parameter list, consider passing `keyId` as part of an options
  object appended after the existing parameters, or -- simpler still -- just
  append `keyId` after `cip` but before `renderer` via a destructured last
  argument. However, the simplest KISS-compliant approach: keep the current
  signature and just add `keyId` to the existing log call objects inline at
  the call site in `src/index.js` (where `keyId` is already available). The
  `capture.start`/`capture.success`/`capture.partial`/`capture.fail` log calls
  in `capture.js` already receive `tenantId` -- adding `keyId` the same way
  (threading it through) is mechanically correct but creates a 50-call-site
  test update for a field that is informational in operational logs (not audit
  events). Weigh whether threading `keyId` into capture.js logs is worth the
  churn. If the team decides it is worth it, the positional insertion approach
  is fine -- just be aware of the mechanical cost.
- **WHY**: The plan acknowledges this is mechanical but 50+ test call sites is
  non-trivial churn. The audit events themselves (the core deliverable) are
  emitted in `src/index.js` where `keyId` is already in scope. Threading
  `keyId` into `capture.js` only enriches operational logs, not audit logs.
  Deferring the capture.js threading to R12 (when keyId becomes meaningful --
  right now it is the same static value for every request) would halve the
  diff and eliminate test churn entirely.
- **TASK**: Task 2

### 3. [Minor Scope] Adding `outcome: 'denied'` to existing security events

- **SCOPE**: `src/index.js` `security.auth_fail` and `security.ssrf_block` log
  calls
- **CHANGE**: No change needed, just flagging: the plan adds `outcome` and audit
  fields (`action`, `resource`, `resourceId`) to existing `security` subsystem
  events. This is a minor scope expansion beyond "add audit events" -- it
  modifies the schema of existing operational events. Ensure these field
  additions are documented so Coralogix queries against `security` events are
  not surprised by new fields.
- **WHY**: Adding fields to existing events changes the implicit contract for
  anyone querying `subsystemName:"security"`. The risk is low (additive fields
  do not break existing queries), but the SSRF block modification in particular
  adds 4 new fields (`tenantId`, `keyId`, `action`, `resource`, `resourceId`,
  `outcome`) to an event that currently has 3 fields. This is a significant
  schema expansion of an existing event. Worth a conscious decision rather than
  a side effect.
- **TASK**: Task 2
