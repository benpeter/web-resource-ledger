# Phase 0016: Decisions

## Sort Order: Ascending (oldest-first)

**Decision**: Use ascending chronological order for list results.

**Alternatives considered**: Reverse-timestamp encoding (newest-first by
encoding timestamps as `9999-12-31T... - actual`) was proposed by
api-design-minion. data-minion argued for ascending per KISS/YAGNI.

**Rationale**: KV `list()` returns keys in lexicographic ascending order.
Reverse-timestamp encoding adds complexity to key format, debugging, and the
complete/fail index key updates. The API contract does not promise sort order, so
this can change with D1 migration. Both specialists acknowledged ascending as
acceptable for MVP.

## Cursor Strategy: KV-native wrapped in custom envelope

**Decision**: Wrap KV's native cursor in a base64url JSON envelope
(`{"kv":"<native-cursor>"}`).

**Alternatives considered**: Custom cursor encoding `{ts, id}` for D1 migration
insulation (api-design-minion). Direct KV cursor exposure (security-minion).

**Rationale**: Custom envelope gives D1 migration insulation (the envelope
format is ours; we can swap the internals) while leveraging KV's built-in cursor
mechanics. No need to implement start-after logic.

## Primary Key: Keep as-is

**Decision**: Keep `capture:{captureId}` primary key unchanged. Add secondary
index keys `tenant:{tenantId}:ts:{ISO}:{captureId}` for listing.

**Rationale**: captureId is globally unique, unauthenticated access endpoints
depend on the current key format, and the secondary index provides tenant
scoping. Changing the primary key would break all existing capture access.

## Note Field: Keep, change value

**Decision**: Keep the `note` field in CaptureAccepted (it's `required` in the
schema), but change its value from the lost-ID warning to a capability pointer.

**Alternatives considered**: Remove the field entirely (api-design-minion
considered). software-docs-minion flagged that removing a required field is a
breaking API change.

## requireAuth() Wrapper: Deferred

**Decision**: Defer extracting a `requireAuth()` helper. Inline auth checks in
each handler.

**Rationale**: Only 2 authenticated endpoints (POST and GET /v1/captures).
Inline is simpler per KISS. Extract when a 3rd authenticated endpoint is added.

## Status Filter: Single-pass over-fetch

**Decision**: Single-pass fetch of `limit * 3` keys when status filter is
active, in-memory filtering, no multi-iteration loop.

**Alternatives considered**: Multi-iteration loop with 500-key scan budget
(original synthesis). margo flagged this as ~20 lines of control flow that will
never activate at current scale and will be replaced by D1.

**Rationale**: Short pages from status filtering are normal cursor-based
pagination behavior. KISS wins.

## Global Rate Limiter on List

**Decision**: Added GLOBAL_CAPTURE_LIMITER to handleListCaptures during code
review.

**Rationale**: Code review caught that list fans out to N+1 KV operations per
request. Without global limiting, an authenticated caller could drive up KV read
costs. Both per-IP and global limits now apply, matching handleCreateCapture.

## Dual tenantId Validation

**Decision**: Validate tenantId in both `verifyApiKey()` (auth boundary) and
`tenantPrefix()` (KV layer).

**Rationale**: Defense-in-depth. The inner validation can never fire while
tenantId is hardcoded to 'default', but it establishes the invariant R12
depends on. Cost is trivial (one regex test).
