# Phase 3: Synthesis -- Admin Key Revocation Safety Guards

## Delegation Plan

**Team name**: admin-revoke-safety-guards
**Description**: Add last-admin-key 409 guard and self-revocation TODO to DELETE /v1/admin/keys/{keyHash}

### Task 1: Implement safety guards and tests

- **Agent**: security-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |

    ## Task

    Add two safety guards to `DELETE /v1/admin/keys/{keyHash}` in `src/admin.js`
    and corresponding tests in `test/admin-keys.test.js`. No other files should
    be modified.

    ## Guard 1: Last-admin-key 409

    Restructure `handleAdminRevokeKey` to use a pre-flight read pattern. The
    current flow calls `revokeApiKeyRecord` first and checks the result. The new
    flow front-loads checks:

    1. `getApiKeyRecord(env.KV, keyHash)` -- read the target key
    2. If null, return 404 (same as today)
    3. If `record.revoked === true`, skip the guard and proceed to the existing
       idempotent return path (return 200 with the revoked record -- do NOT
       call `revokeApiKeyRecord` again, just build the response from the
       pre-fetched record)
    4. If `record.scopes.includes('admin')`:
       a. Call `listApiKeyRecords(env.KV, { tenantId: record.tenantId, includeRevoked: false })`
       b. Count entries where `r.scopes.includes('admin')` AND `r.keyHash !== keyHash`
       c. If count === 0 (this is the last admin key for the tenant), return 409
    5. Call `revokeApiKeyRecord(env.KV, keyHash)` and return 200

    **Important implementation details:**

    - Add `getApiKeyRecord` to the import from `./kv.js` on line 20. The function
      already exists in kv.js (line 343): `getApiKeyRecord(kv, sha256hex)` returns
      the record object or null.

    - `listApiKeyRecords(kv, { tenantId, includeRevoked })` returns an array of
      objects with shape `{ keyHash, tenantId, scopes, name, createdAt, createdBy,
      revoked, revokedAt }`. It is already imported.

    - The 409 response MUST use `problemResponse(409, ...)` which is already
      imported. The detail message should be:
      `"Cannot revoke the last admin-scoped key for tenant '${record.tenantId}'. Create a replacement key first."`

    - Log the guard rejection at severity 3:
      ```js
      ctx.waitUntil(log(env, 3, 'admin', {
        event: 'admin.key_revoke_blocked',
        keyHashPrefix: keyHash.slice(0, 8),
        tenantId: record.tenantId,
        reason: 'last_admin_key',
      }) ?? Promise.resolve());
      ```

    - Add the race condition limitation comment near the guard logic:
      ```js
      // KNOWN LIMITATION: This check is not atomic with the subsequent
      // revocation. Concurrent requests may both pass the check. Acceptable
      // because ADMIN_KEY (env var) prevents lockout. Revisit when admin
      // auth moves to per-tenant KV keys.
      ```

    - For the already-revoked idempotent path (step 3), preserve the existing
      logging behavior. The current handler detects idempotency via a revokedAt
      timestamp heuristic. Since you have the record from the pre-flight read,
      you can directly set `idempotent: true` in the log entry. Build the
      response body from the pre-fetched record (same shape as today):
      ```js
      {
        keyHash,
        tenantId: record.tenantId,
        scopes: record.scopes,
        name: record.name,
        createdAt: record.createdAt,
        revoked: true,
        revokedAt: record.revokedAt,
      }
      ```

    - For the success path (step 5), `revokeApiKeyRecord` still does its own
      KV read internally. This extra read is acceptable -- the admin endpoint
      has a 5 req/60s rate limit. Do NOT refactor revokeApiKeyRecord.

    - The non-admin key path (key whose scopes do NOT include 'admin') skips
      the guard entirely -- no listApiKeyRecords call, straight to
      revokeApiKeyRecord.

    ## Guard 2: Self-revocation TODO

    Add this TODO comment inside `handleAdminRevokeKey`, right after
    `const keyHash = match[1];` (line 181), before any KV operations:

    ```js
    // TODO: Self-revocation guard (#42). When admin auth moves from ADMIN_KEY
    // (env var) to KV-stored admin-scoped keys, prevent a caller from revoking
    // their own keyHash. Requires the auth result to include the caller's
    // keyHash, which it currently does not (ADMIN_KEY has no hash).
    ```

    No runtime code for self-revocation. The ADMIN_KEY is an infrastructure
    secret with no keyHash -- self-revocation is impossible today.

    ## Tests

    Add a new describe block in `test/admin-keys.test.js` titled
    `'Last-admin-key guard'` inside the existing
    `'DELETE /v1/admin/keys/{keyHash}'` describe block (nest it). Use the
    existing test patterns (makeAdminPost, makeAdminDelete, cleanupApiKeys,
    nextIp, seedApiKey).

    Tests to write:

    1. **'returns 409 when revoking the only admin-scoped key for a tenant'**
       - Create one key with `scopes: ['admin']` for tenant 'guard-test'
       - DELETE that keyHash
       - Expect 409
       - Verify response body has `status: 409` and `detail` containing 'admin'
       - Verify the key is NOT actually revoked: create a GET helper, list
         keys for the tenant, confirm the key still appears as active

    2. **'returns 200 when another admin key exists for the tenant'**
       - Create two keys with `scopes: ['admin']` for the same tenant
       - DELETE the first keyHash
       - Expect 200
       - Verify `body.revoked === true`

    3. **'returns 200 when revoking non-admin key even if it is the only key'**
       - Create one key with `scopes: ['capture']` for a tenant
       - DELETE that keyHash
       - Expect 200 (guard only applies to admin-scoped keys)

    4. **'idempotent re-delete of revoked admin key returns 200'**
       - Create two admin keys for a tenant
       - DELETE the first (200 -- guard passes because second exists)
       - DELETE the first again (200 -- already revoked, guard skipped)

    5. **'409 is tenant-scoped -- other tenant admin keys do not count'**
       - Use seedApiKey to create an admin key for 'tenant-a' and another
         for 'tenant-b' (seedApiKey bypasses the API, writing directly to KV)
       - DELETE tenant-a's keyHash
       - Expect 409 (tenant-b's admin key does not satisfy tenant-a's guard)

    6. **'409 response follows RFC 9457 problem detail shape'**
       - Create one admin key, try to DELETE it
       - Expect 409 body to have: `type: 'about:blank'`, `status: 409`,
         `title: 'Conflict'`, `detail` as a string containing the tenant name

    **Test implementation notes:**
    - Each test in the nested describe block should use `nextIp()` for its
      own IP to avoid rate limit bleed.
    - Use `beforeEach` with `cleanupApiKeys()` in the nested block.
    - The `seedApiKey` fixture is already imported in the test file. Use it
      for test 5 to directly seed KV records without consuming rate-limited
      admin API calls. Import `env` from 'cloudflare:test' (already imported
      at line 10).
    - `seedApiKey(env.KV, rawKey, { tenantId, scopes, name })` returns the
      keyHash. The rawKey can be any string starting with `wrl_live_`.

    ## Boundaries -- do NOT do any of these

    - Do NOT modify any files other than `src/admin.js` and `test/admin-keys.test.js`
    - Do NOT refactor `revokeApiKeyRecord` in kv.js
    - Do NOT add distributed locking or CAS operations
    - Do NOT implement a runtime self-revocation guard (TODO only)
    - Do NOT add a new KV index for tenant-scoped key lookups
    - Do NOT change the existing test structure outside the new nested describe block

- **Deliverables**:
    - Modified `src/admin.js` with restructured `handleAdminRevokeKey` including last-admin-key 409 guard, self-revocation TODO comment, and race condition limitation comment
    - Modified `test/admin-keys.test.js` with 6 new test cases in a nested describe block
- **Success criteria**:
    - `npx vitest run test/admin-keys.test.js` passes all existing and new tests
    - DELETE of last admin-scoped key for a tenant returns 409 with RFC 9457 body
    - DELETE of admin key when another admin key exists returns 200
    - DELETE of non-admin key always succeeds (guard not triggered)
    - Idempotent re-delete of already-revoked admin key returns 200 (guard skipped)
    - Cross-tenant isolation: tenant-b's admin keys do not satisfy tenant-a's guard
    - Self-revocation TODO comment present referencing issue #42

### Cross-Cutting Coverage

- **Testing**: Covered -- 6 new test cases in Task 1
- **Security**: Task 1 is assigned to security-minion; race condition explicitly accepted with documented rationale
- **Usability -- Strategy**: Not applicable -- admin-only API endpoint, no end-user journey impact
- **Usability -- Design**: Not applicable -- no UI
- **Documentation**: Not needed as a separate task -- the 409 response follows existing RFC 9457 pattern already documented; the TODO comment is self-documenting
- **Observability**: Covered -- guard rejection logged at severity 3 within Task 1

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**: none -- no UI, no web-facing runtime, no multi-service coordination, no user-facing documentation changes
- **Not selected**: ux-design-minion, accessibility-minion, sitespeed-minion, observability-minion, user-docs-minion

### Conflict Resolutions

**Logging severity**: api-design-minion recommended severity 3 (info-level operational event). security-minion recommended severity 4 (WARN). Resolution: use severity 3. The guard protects a future capability (admin-scoped KV keys are currently inert for auth). A WARN signal would be miscalibrated -- it implies operational urgency where there is none today. Severity 3 provides the audit trail without false alarms.

**Guard scope**: Both specialists agreed on tenant-scoped (not global). No conflict.

**Race condition**: Both specialists agreed to accept the race. No conflict. api-design-minion noted the 5 req/60s rate limit; security-minion calculated risk score 1/25 (very low likelihood x low impact). Both recommend logging and documentation.

### Risks and Mitigations

1. **Extra KV read on every DELETE**: Pre-flight `getApiKeyRecord` adds one read before `revokeApiKeyRecord` (which reads again internally). Mitigated by 5 req/60s rate limit. Not worth optimizing.

2. **Race condition on concurrent revocations**: Two concurrent DELETEs for different admin keys of the same tenant could both pass the guard. Mitigated by: (a) rate limit, (b) ADMIN_KEY env var prevents actual lockout, (c) logged for audit. Documented in code comment.

3. **listApiKeyRecords pagination**: KV list has 1000 key default limit. Irrelevant at current scale (single-digit keys per tenant). Noted as future consideration.

### Execution Order

```
Batch 1: Task 1 (security-minion) -- single task, no dependencies
```

No gates. Single batch.

### Verification Steps

1. Run `npx vitest run test/admin-keys.test.js` -- all tests pass
2. Verify 409 response body matches RFC 9457 shape (type, status, title, detail)
3. Verify TODO comment references issue #42
4. Verify `getApiKeyRecord` import added to admin.js
5. Verify no other files modified
