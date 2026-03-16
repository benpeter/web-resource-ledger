# Phase 0016: Outcome

## What was built

### R8: Auth Identity Enrichment (#38)

- `verifyApiKey()` now returns `{ ok: true, tenantId: 'default' }` on success
- tenantId validated with `/^[a-z0-9_-]{1,64}$/` at auth boundary
- `tenantPrefix()` helper in kv.js with defense-in-depth validation
- `createCapture()` accepts tenantId as required 5th parameter
- Secondary index keys `tenant:{tenantId}:ts:{ISO}:{captureId}` written on every
  capture creation (empty string value, same TTL as primary record)
- `completeCapture()` and `failCapture()` re-write index keys without TTL
- tenantId threaded into all 6 post-auth log calls in the capture pipeline
- Pre-auth log calls (auth_fail, rate_limit, capacity_limit) do not include
  tenantId

### R1: List Captures Endpoint (#31)

- `GET /v1/captures` with Bearer auth, cursor-based pagination, optional status
  filter
- Response envelope: `{ data: CaptureSummary[], pagination: { cursor, hasMore, limit } }`
- CaptureSummary: `id, status, url, createdAt` + conditional fields per status
  (completedAt, failedAt, error, retryable). Never includes ip, R2 keys, or
  wacz.key.
- Default page size 20, max 100, silent clamp
- Opaque cursor wrapping KV native cursor in base64url JSON envelope
- Status filter with single-pass 3x over-fetch, no loop
- Both per-IP and global rate limiters applied
- `Cache-Control: private, no-store` on all responses
- 200 with empty data array for no results (never 404)
- Structured logging: `list.success` with durationMs for <300ms SLO, `list.error`
  with durationMs for failure correlation

### Documentation

- 202 response note updated to reference list endpoint
- 8 lost-ID references removed/updated across openapi.yaml, README.md, MVP.md
- README: new "Finding and sharing captures" section with curl example
- OpenAPI spec: 3 new schemas (CaptureSummary, Pagination, CaptureListResponse),
  new path, version bumped to 0.2.0
- Backlog: R8 and R1 marked done, "Capture ID recovery" parking lot item resolved

## Test Coverage

- 384 tests across 19 files, all passing
- 12 new tests for R8 (tenantId in auth, index key format/persistence, tenantPrefix validation)
- 26 new integration tests for list endpoint (auth, empty results, response shape,
  status filter, pagination round-trip with 25 items, headers)
- 8 new unit tests for listCaptures (empty KV, tenant isolation, limit, cursor,
  status filter, orphaned keys)

## Code Review Findings (2, both fixed)

1. Dead-branch cursor logic: `hasFilterMore` condition could never produce a
   valid cursor when KV exhausted its last page. Simplified to `hasMore` only.
2. Missing GLOBAL_CAPTURE_LIMITER on list endpoint: asymmetry with
   handleCreateCapture. Added both per-IP and global limiting.

## What deviated from the plan

- Status filter: synthesis proposed multi-iteration loop with 500-key scan
  budget. margo's review convinced us to simplify to single-pass 3x over-fetch.
  Short pages are normal cursor behavior.
- Pre-R8 record handling: implementation added fallback (`if (existing.tenantId)`)
  for records created before R8, which the synthesis mentioned but didn't
  explicitly spec. Safer approach.

## Backlog changes

- R8 (#38): moved to Done
- R1 (#31): moved to Done
- "Capture ID recovery" parking lot item: marked resolved (solved by R1)
- No new backlog items added
