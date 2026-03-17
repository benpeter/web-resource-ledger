# Outcome: R13 Audit Logging

## Summary

Added structured audit logging to all authenticated API requests and key
lifecycle events. Every log call on an authenticated path now includes a
consistent audit envelope: `tenantId`, `keyName`, `keyHashPrefix`,
`authMethod`, `cip`, and `responseStatus`.

## What was built

1. **Auth contract enrichment**: `verifyApiKey()` success return now includes
   `keyHashPrefix` (8-char SHA-256 prefix) for audit correlation across events.

2. **Admin handler cip**: All three admin handlers (`handleAdminCreateKey`,
   `handleAdminListKeys`, `handleAdminRevokeKey`) now compute `cip` for
   source IP tracing.

3. **Event rename**: `list.success` -> `capture.list`, `list.error` ->
   `capture.list_fail`. Aligns with operator mental model (listing captures
   is a capture-domain action).

4. **Severity promotion**: `admin.key_list` elevated from severity 6
   (verbose) to 3 (info). Prevents Coralogix TCO policies from filtering
   admin key enumeration out of the audit trail.

5. **INVARIANT fix**: `tenantFilter` query parameter validated against
   `TENANT_ID_RE` before logging in `admin.key_list`. Previously logged
   raw user input, violating the `log()` INVARIANT.

6. **Documentation**: `docs/audit-log-schema.md` with full event taxonomy,
   field dictionary, severity mapping, and 6 example Coralogix queries.

## Files changed

- `src/auth.js` -- keyHashPrefix in success return, JSDoc update
- `src/admin.js` -- cip computation, audit fields on all log calls, INVARIANT annotation
- `src/index.js` -- audit fields on all log calls, event rename
- `src/log.js` -- expanded INVARIANT comment, NEVER-LOG documentation
- `docs/audit-log-schema.md` -- new operator reference
- `docs/evolution/0039-audit-logging/` -- evolution log
- `docs/evolution/README.md` -- index update
- `docs/backlog.md` -- R13 marked DONE
- `OPERATIONS.md` -- cross-reference to audit log schema

## What was NOT built (explicitly deferred)

- Audit log export API (out of scope per issue)
- Compliance report generation (out of scope)
- Log retention policies (out of scope)
- `src/audit.js` extraction (YAGNI -- inline is clearer for ~15 log calls)
- Separate `audit` subsystem (operators would query two places)
- Explicit `action`/`resource` fields (event names provide sufficient queryability)

## Backlog changes

- R13 (#43) marked DONE
