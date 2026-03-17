# API Design Recommendations: DELETE /v1/admin/keys/{keyHash} Safety Guards

## Edge Case Resolutions

### 1. Tenant-scoped vs global last-admin-key check

**Recommendation: Tenant-scoped.**

Rationale:

- The key record already carries `tenantId`. Every API key is created for a specific tenant.
- The admin endpoint's purpose is tenant key management -- admin-scoped keys grant tenant-level admin powers, not system-wide powers. System-wide admin access is the `ADMIN_KEY` infrastructure secret, which is a completely separate auth path (`verifyAdminKey` in auth.js, line 249).
- A global check would create a cross-tenant dependency: revoking `tenant-a`'s admin key could succeed or fail depending on whether `tenant-b` has admin keys. That coupling is surprising and violates the principle of least astonishment.
- Tenant isolation is already a design invariant (the test file has an entire "Cross-tenant isolation" describe block). The guard should respect that boundary.

Implementation detail: look up `listApiKeyRecords(env.KV, { tenantId: record.tenantId, includeRevoked: false })` and count entries where `scopes.includes('admin')` and `keyHash !== targetKeyHash`. If count is 0, this is the last one -- block it.

Note on the `listApiKeyRecords` call: it does a full KV `list({ prefix: 'apikey:' })` followed by in-memory filtering. For the expected scale (single-digit to low-double-digit keys per tenant), this is fine and KISS-compliant. No new KV index is needed.

### 2. 409 response body shape

**Recommendation: Follow the existing `problemResponse` pattern exactly (RFC 9457 Problem Details).**

The codebase already has a `409` entry in the `titles` map in `responses.js` (line 11: `409: 'Conflict'`), which means `problemResponse(409, ...)` will produce the correct RFC 9457 shape out of the box.

Proposed response:

```json
{
  "type": "about:blank",
  "status": 409,
  "title": "Conflict",
  "detail": "Cannot revoke the only admin-scoped key for tenant 'acme'. Create another admin key first."
}
```

Design notes:

- **Status 409 is correct.** The request is well-formed but conflicts with the current state of the resource. This is the textbook use case for 409.
- **The detail message is actionable.** It tells the operator what is wrong (only admin key) and what to do (create another first). This follows the convention in `responses.js` line 3: "State what is wrong and what to do."
- **The detail includes the tenant name** for operational clarity -- the operator may be managing multiple tenants in one session and needs to know which tenant is blocked.
- **No additional fields needed.** The `problemResponse` helper uses `type: 'about:blank'`, which the RFC allows for simple cases. Adding a custom `type` URI would only be warranted if clients need to switch on error type programmatically. For an admin-only endpoint with a human operator, `status` + `detail` is sufficient.
- **Self-revocation guard uses the same pattern** but different detail text:

```json
{
  "type": "about:blank",
  "status": 409,
  "title": "Conflict",
  "detail": "Cannot identify the calling key for self-revocation check. ADMIN_KEY authentication does not have an associated keyHash."
}
```

Wait -- re-reading the task description: "Self-revocation guard (TODO only -- ADMIN_KEY has no keyHash)." This means we are NOT implementing the self-revocation guard in code, only leaving a TODO comment. The ADMIN_KEY is an infrastructure secret compared via `timingSafeEqual`, not a KV-stored key with a keyHash. There is no way to determine "which key am I?" from the current auth flow. The self-revocation guard needs a future design where admin endpoints are also callable by KV-backed admin-scoped keys (not just the infrastructure ADMIN_KEY). For now, a TODO comment is the correct approach.

### 3. Guard behavior for already-revoked keys

**Recommendation: Skip the last-admin-key guard for already-revoked keys. Return 200 idempotently, as today.**

Rationale:

- The current behavior (lines 183-218 of admin.js) is deliberately idempotent: `revokeApiKeyRecord` returns `{ revoked: true, record: existing }` for already-revoked keys, and the handler returns 200 with the revoked record.
- The guard's purpose is to prevent *state transitions* that would leave the tenant without admin access. An already-revoked key is already revoked -- no state transition occurs. Running the guard would be wasted work and could produce confusing behavior (e.g., the key is already revoked but the API says "you can't revoke it").
- The idempotent DELETE contract is a deliberate API design choice (tested at line 287-293 of admin-keys.test.js). Adding a guard that blocks idempotent re-deletion would break that contract.
- Implementation: check `result.record.revoked` status (or detect idempotency via the existing revokedMs heuristic) and only run the guard when actually revoking a non-revoked key.

Practical sequencing: the guard must run *before* calling `revokeApiKeyRecord`, because the guard needs to count active admin keys. The cleanest flow is:

1. Look up the target key record (new `getApiKeyRecord` call)
2. If not found, return 404 (same as today)
3. If already revoked, return 200 idempotently (same as today, skip guard)
4. If the key has `admin` in its scopes, run the last-admin-key count
5. If it is the last admin key for the tenant, return 409
6. Proceed with `revokeApiKeyRecord` (same as today)

This means we need to call `getApiKeyRecord` before `revokeApiKeyRecord`. The extra KV read is acceptable for an admin endpoint with 5 req/60s rate limit.

**Alternative considered and rejected**: running the guard inside `revokeApiKeyRecord` in kv.js. This would couple domain logic (tenant admin policy) into the data access layer, violating the current clean separation where kv.js is purely CRUD and admin.js holds business logic.

## Proposed Implementation Tasks

### Task 1: Add `getApiKeyRecord` import to admin.js

The function already exists in kv.js (line 343) but is not imported in admin.js. Add it to the import statement on line 20.

### Task 2: Restructure `handleAdminRevokeKey` with pre-flight checks

Replace the current "call revokeApiKeyRecord first, check result" flow with:

```
1. getApiKeyRecord(env.KV, keyHash)
2. if null -> 404
3. if record.revoked -> return 200 with revoked record (idempotent path)
4. if record.scopes.includes('admin') -> count other active admin keys for tenant
5. if count === 0 -> return 409
6. revokeApiKeyRecord(env.KV, keyHash)
7. return 200
```

This is a structural change to the handler, not just an additive guard. The current flow delegates the "not found" and "already revoked" checks to `revokeApiKeyRecord`. The new flow front-loads those checks.

**Race condition note**: Between step 1 (read) and step 6 (revoke), another request could revoke the same key or a sibling admin key. KV does not support transactions. This is acceptable because:
- Admin endpoints are rate-limited to 5 req/60s per IP
- Admin key management is a low-frequency operational task
- The worst case is that two concurrent requests both pass the guard and both revoke, leaving zero admin keys -- the same situation the guard prevents. To truly prevent this, you would need a distributed lock or compare-and-swap. That complexity is not justified for an admin endpoint with this traffic profile.
- **Mitigation**: Log the guard decision at severity 3, so operators can audit if it ever fires. If the race becomes a problem in practice, revisit with a CAS pattern.

### Task 3: Add TODO comment for self-revocation guard

Add a comment block at the top of the guard logic explaining:
- The ADMIN_KEY auth path has no keyHash (it is an infrastructure secret, not a KV record)
- Self-revocation prevention requires knowing which key is making the request
- This will be possible when admin endpoints support KV-backed admin-scoped key auth
- Reference the issue number for traceability

### Task 4: Add tests

New test cases for `DELETE /v1/admin/keys/{keyHash}`:

1. **409 when revoking last admin key for tenant**: Create one admin-scoped key, try to delete it, expect 409 with RFC 9457 body containing "admin" and tenant name in detail.
2. **200 when revoking admin key when another admin key exists**: Create two admin-scoped keys for same tenant, delete one, expect 200.
3. **200 when revoking non-admin key even if it is the only key**: Create one capture-scoped key, delete it, expect 200 (guard only applies to admin-scoped keys).
4. **200 idempotent re-delete of formerly-last admin key**: Create two admin keys, delete both (second delete succeeds because there are still two at that point -- wait, this needs care). Better: create one admin key, create a second admin key, delete the first (succeeds), delete the first again (200 idempotent, guard does not fire for already-revoked).
5. **409 is tenant-scoped**: Create admin key for tenant-a, create admin key for tenant-b, delete tenant-a's admin key, expect 409 (tenant-b's admin key does not count).
6. **Guard allows revoking admin key when tenant has another admin key**: Create two admin-scoped keys for same tenant, revoke one, expect 200. Then verify only one admin key remains via GET list.

### Task 5: Logging

Log the guard rejection at severity 3 (warn-level operational event):

```js
ctx.waitUntil(log(env, 3, 'admin', {
  event: 'admin.key_revoke_blocked',
  keyHashPrefix: keyHash.slice(0, 8),
  tenantId: record.tenantId,
  reason: 'last_admin_key',
}) ?? Promise.resolve());
```

This follows the existing logging pattern in the handler (lines 201-206).

## Risks

1. **Extra KV read on every DELETE**: The pre-flight `getApiKeyRecord` adds one KV read before `revokeApiKeyRecord` (which does its own read). At 5 req/60s, this is negligible. If it bothers anyone, the `revokeApiKeyRecord` function could be refactored to accept a pre-fetched record, but YAGNI -- don't do this now.

2. **Race condition on concurrent revocations**: Covered above. Acceptable given traffic profile. Log it, revisit if evidence shows it matters.

3. **listApiKeyRecords performance**: The guard calls `listApiKeyRecords` which fetches ALL keys, not just the target tenant. For the expected scale (dozens of keys total, not thousands), this is fine. If key count grows significantly, add a tenant-scoped KV prefix index for API keys (similar to the capture tenant index). Not needed now -- YAGNI.

4. **Self-revocation TODO scope creep**: The TODO should be minimal. Do not design the future KV-backed admin auth flow as part of this task. Just note that it is needed and reference the tracking issue.
