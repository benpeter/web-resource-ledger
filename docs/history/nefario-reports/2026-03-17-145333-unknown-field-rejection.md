---
task: "Unknown field rejection on POST /v1/admin/keys"
date: 2026-03-17
mode: execution
task-count: 1
gate-count: 0
agents: api-design-minion
reviewers: lucy, margo
compaction-events: 0
---

## Summary

Added strict field validation to POST /v1/admin/keys: unknown top-level fields return 400 listing all unrecognized field names. Prevents silent acceptance of fields callers believe are supported (e.g., `expiresAt`, `description`). 582 tests pass (1 new).

## Original Prompt

Add strict field validation to POST /v1/admin/keys. After parsing JSON body, check all top-level keys are in {tenantId, scopes, name}. Return 400 for unknown fields with detail message listing them.

## Key Design Decisions

1. **Check runs before individual field validation** -- a caller sending `tenant_id` (underscore) sees "Unknown field 'tenant_id'" immediately, not "Field 'tenantId' is required" which points in the wrong direction.

2. **Report all unknown fields, not just the first** -- avoids fix-retry-discover loop. Comma-separated list in the `detail` string stays within existing `problemResponse` contract.

3. **`ALLOWED_CREATE_FIELDS` as module-scope Set** -- alongside `VALID_SCOPES`, visible at top of file. Avoids per-request allocation.

## Verification

Verification: 582 tests pass.

## Working Files

[`docs/history/nefario-reports/2026-03-17-145333-unknown-field-rejection/`](./2026-03-17-145333-unknown-field-rejection/) (3 files)
