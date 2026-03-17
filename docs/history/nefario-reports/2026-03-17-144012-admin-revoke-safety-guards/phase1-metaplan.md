## Meta-Plan

### Task Summary

Implement two safety guards for `DELETE /v1/admin/keys/{keyHash}` in `src/admin.js`:

1. **Self-revocation guard**: Add a TODO comment noting this is deferred (ADMIN_KEY is an env-var secret with no keyHash, so there is nothing to compare against today).
2. **Last-admin-key guard**: Before revoking an admin-scoped key, check whether other active admin keys exist for the same tenant. Return 409 Conflict if revoking would leave zero admin keys for that tenant.

Changes scoped to two files: `src/admin.js` and `test/admin-keys.test.js`.

### Codebase Context

- `handleAdminRevokeKey` (admin.js:180-219) receives `match[1]` as the keyHash, calls `revokeApiKeyRecord(env.KV, keyHash)`, and returns 200/404.
- `revokeApiKeyRecord` (kv.js:360-374) is idempotent -- already-revoked keys return success with the existing record.
- `listApiKeyRecords` (kv.js:384-403) can filter by tenantId and includeRevoked. It lists all `apikey:*` keys via KV list and filters in memory. This is the natural mechanism for the last-admin-key check.
- The revoke handler currently does NOT read the key record before calling `revokeApiKeyRecord`. For the last-admin-key guard, the handler needs the record's scopes and tenantId BEFORE revoking. The handler will need to call `getApiKeyRecord` first (already exported from kv.js).
- `problemResponse(409, ...)` already works -- 409 is in the titles map in responses.js.
- Tests use `SELF.fetch()` against the real worker with miniflare-backed KV. Rate limiter is 5 req/60s per IP, so tests use distinct IPs via `nextIp()`.
- `seedApiKey` in fixtures.js can create keys with specific scopes, useful for seeding admin-scoped keys in tests.

### Planning Consultations

#### Consultation 1: API behavior for the 409 guard

- **Agent**: api-design-minion
- **Planning question**: For the last-admin-key guard: (a) Should the check be scoped to the same tenant, or global across all tenants? The task says "same tenant" but admin keys may be cross-tenant in practice. (b) Should the 409 response body include a hint about which admin keys exist, or just state the constraint? (c) Should an already-revoked admin key that happens to be the last one also return 409, or is idempotent 200 still correct (since the revocation already happened)?
- **Context to provide**: admin.js revoke handler, kv.js listApiKeyRecords function, responses.js problemResponse format
- **Why this agent**: The 409 semantics, idempotent revocation interaction, and response body design are API design decisions that should be intentional.

#### Consultation 2: Security implications of the guard

- **Agent**: security-minion
- **Planning question**: (a) Is there a race condition where two concurrent DELETE requests could both pass the "other admin keys exist" check and both revoke, leaving zero admin keys? If so, is KV's eventual consistency a concern here or is the risk acceptable given the admin rate limiter (5 req/60s)? (b) Should the guard count keys that are in the process of being created (eventual consistency lag) or is point-in-time correctness sufficient? (c) Is the TODO for self-revocation sufficient, or should it be a code-level guard (e.g., always skip)?
- **Context to provide**: admin.js, kv.js revokeApiKeyRecord and listApiKeyRecords, rate limiter config
- **Why this agent**: Race conditions on safety guards are a security concern. KV eventual consistency could create a window where the guard is ineffective.

### Cross-Cutting Checklist

- **Testing**: Include test-minion for planning? **No** -- the test changes are straightforward (create 2 admin keys, revoke one = ok, revoke the last = 409; verify non-admin keys are not guarded). The test patterns are well-established in the existing test file. The api-design-minion consultation will clarify the edge cases that need test coverage.
- **Security**: **Yes** -- included as Consultation 2 above. Race conditions and KV consistency are genuine concerns.
- **Usability -- Strategy**: **Not included for planning.** This is a backend API guard with no user-facing journey change. The 409 error message is the only "UX" touchpoint, and api-design-minion covers that. Excluding ux-strategy-minion from planning, but noting that their perspective on the error message could be folded into api-design-minion's consultation.
- **Usability -- Design**: **Not included.** No UI components. No user-facing interface changes.
- **Documentation**: **Not included for planning.** The change is 2 files, adds one guard and one TODO comment. Phase 8 post-execution will handle any documentation needs (API docs noting the 409 response). No planning input needed from docs agents.
- **Observability**: **Not included.** The existing revoke handler already logs `admin.key_revoke_fail`. The new 409 path should log similarly, but this is straightforward and does not need observability planning.

### Anticipated Approval Gates

**None.** This task has low blast radius (2 files), is easy to reverse (revert a single commit), and follows clear best-practice patterns. No gate is warranted under the gate classification matrix.

### Rationale

This is a small, well-scoped change with two genuine planning questions:

1. **API semantics** (api-design-minion): The interaction between idempotent revocation and the last-admin-key guard has a few edge cases that should be decided intentionally, not by accident of implementation. The scope of the check (per-tenant vs global) also needs confirmation.

2. **Concurrency safety** (security-minion): Cloudflare KV is eventually consistent. Two concurrent revocations could both read "2 admin keys exist" and both proceed, leaving zero. Whether this is an acceptable risk depends on the deployment model and rate limiting.

The remaining cross-cutting concerns (testing, docs, observability, UX) do not need planning-phase input -- they are either handled by the execution task itself, by post-execution phases, or are not applicable.

### Scope

**In scope**:
- Add last-admin-key guard to `handleAdminRevokeKey` in `src/admin.js`
- Add TODO comment for self-revocation guard in `src/admin.js`
- Add tests for the new guard in `test/admin-keys.test.js`
- Log the 409 case appropriately

**Out of scope**:
- Changes to kv.js (existing `listApiKeyRecords` and `getApiKeyRecord` are sufficient)
- Changes to responses.js (409 is already in the titles map)
- Self-revocation implementation (explicitly deferred)
- API documentation updates (handled by Phase 8)
- Any other files

### External Skill Integration

No external skills detected in project.
