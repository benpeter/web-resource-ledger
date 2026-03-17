# Decisions: R13 Audit Logging

## Enrich existing events vs. separate audit subsystem

**Chosen**: Add audit fields to existing `log()` calls within existing
subsystems (capture, admin, security).

**Rejected**: Creating a parallel `audit` subsystem with dedicated event
names.

**Rationale**: Operators would need to query two places for the same
information. The existing subsystem structure maps to operator mental
models. All five planning specialists agreed.

## No src/audit.js extraction

**Chosen**: Inline field addition to each `log()` call.

**Rejected**: Extracting audit event construction into `src/audit.js` with
builder functions per event type (proposed by test-minion).

**Rationale**: ~15 log calls with slightly different context each. A builder
module adds indirection and a new file for what amounts to adding 3-4 fields
to existing calls. KISS/YAGNI -- if field drift becomes a problem later,
extraction is a safe refactor.

## Rename list.* to capture.list*

**Chosen**: Breaking rename now.

**Rejected**: Keeping `list.*` for backward compatibility or dual-emitting.

**Rationale**: Project is pre-GA with no external consumers of Coralogix
queries. An operator searching `event:capture.*` would miss listing events
under the old naming. Clean break is cheaper than transition-period
complexity.

## admin.key_list severity 6 to 3

**Chosen**: Promote to severity 3 (info).

**Rationale**: Severity 6 events may be filtered by Coralogix TCO policies,
silently removing admin key enumeration from the audit trail.

## capture.list stays at severity 6

**Chosen**: Keep at severity 6 (verbose).

**Rationale**: Listing captures is a read-only operation that does not change
state. Per observability-minion: unlike admin key listing (which signals
potential abuse), capture listing is routine operational data. If compliance
requirements later mandate logging every authenticated data access, this can
be promoted to severity 3.

## keyHashPrefix (8 chars) is safe to log

SHA-256 prefix provides 2^32 uniqueness for correlation without enabling
key recovery (preimage resistance). Already logged on failure paths.

## No admin caller identity beyond cip

The current single ADMIN_KEY model cannot distinguish operators. Adding
identity infrastructure is premature until per-operator admin keys exist.
`cip` provides IP correlation for abuse investigation.

## No separate security.auth_success event

Downstream events (`capture.queued`, `capture.list`) already serve as proof
of successful auth. A separate event would double log volume for zero
additional queryability.

## Validate tenantFilter before logging

The `tenantFilter` query parameter in `admin.key_list` is raw user input.
Validated against `TENANT_ID_RE` before including in the log payload to
satisfy the `log()` INVARIANT. Invalid values logged as `null`.
