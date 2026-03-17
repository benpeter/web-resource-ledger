---
reviewer: test-minion
verdict: APPROVE
---

# Test Coverage Review -- admin-revoke-safety-guards

## Verdict: APPROVE

The test plan is well-constructed. All guard paths are covered, the critical
isolation properties are verified, and the test structure follows the existing
file conventions. One minor gap is noted but does not warrant blocking.

---

## Guard path coverage

### Last-admin-key 409 guard

The decision tree in the implementation has four branches. All are covered:

| Branch | Test |
|--------|------|
| Only admin key for tenant -> 409 | Test 1 |
| Admin key, but another admin key exists for tenant -> 200 | Test 2 |
| Non-admin key, only key for tenant -> 200 | Test 3 |
| Admin key already revoked -> 200 (guard skipped) | Test 4 |

Test 5 covers the tenant-scoping invariant -- the most important correctness
property of the guard, and the one most likely to be implemented incorrectly.
The use of `seedApiKey` to bypass rate limits is the right call here.

Test 6 covers the RFC 9457 response shape explicitly, verifying `type`,
`status`, `title`, and `detail`. Good -- this is an API contract assertion,
not just a status-code check.

### Self-revocation guard

The guard is a TODO comment only (no runtime behavior). No test is needed or
appropriate. Correct.

---

## Edge cases

### What is covered

- Idempotent re-delete after successful revocation (test 4). The plan correctly
  notes the guard must be skipped when `record.revoked === true`, so the
  pre-flight logic doesn't incorrectly 409 a second DELETE of an already-revoked
  admin key.

- Cross-tenant isolation (test 5). Uses `seedApiKey` directly to write KV
  records for two tenants, then verifies the admin key for tenant-a cannot be
  revoked even though tenant-b has an admin key. This is the right tool --
  going through the API would exhaust the rate limit on the shared IP counter.

- Non-admin key unaffected by guard (test 3). The guard condition is
  `scopes.includes('admin')`; a key with only `capture` scope must bypass the
  guard entirely. Covered.

- RFC 9457 body shape (test 6). The `detail` field is asserted to contain the
  tenant name, which also verifies the message template is parameterized
  correctly.

### Minor gap (non-blocking)

**No test verifies that the 409-blocked key is still usable after the 409.**
Test 1 asserts the key has not been revoked (by listing and confirming it
appears active), which covers the correctness property that matters. A follow-up
assertion that the key can still authenticate to a capture endpoint would add
defense-in-depth, but given the existing lifecycle test in the DELETE block
already validates that path, and this is an admin-only endpoint with a 5 req/60s
rate limit, the omission is acceptable.

---

## Test structure fit

The plan nests the new describe block inside the existing
`'DELETE /v1/admin/keys/{keyHash}'` block. This is consistent with how the
existing tests are organized and avoids polluting the top-level describe
namespace.

The instruction to use `nextIp()` per test and `beforeEach(cleanupApiKeys)`
in the nested block matches the rate-limit isolation pattern used throughout
the file. Without this, tests in the new block could exhaust the shared IP
counter that the parent describe block uses.

Each test uses its own tenant name (`'guard-test'`, etc.). This is necessary
for the tenant-isolation test to be unambiguous, and consistent with the
approach used elsewhere in the file.

---

## Implementation details to verify at execution

These are checkpoints for the implementing agent, not blockers for this review:

1. `getApiKeyRecord` must be added to the import on line 20 of `src/admin.js`.
   The function exists in kv.js at line 343 and returns `object|null`.

2. The already-revoked idempotent path (step 3 in the guard flow) must NOT call
   `revokeApiKeyRecord` again. The pre-fetched record is used directly to build
   the response body. The test for this (test 4) will catch a double-write but
   not the extra read -- acceptable given the rate-limit context.

3. The `listApiKeyRecords` call filters by `{ tenantId: record.tenantId, includeRevoked: false }`.
   The second argument being `false` is critical -- counting revoked admin keys
   as "other admin keys" would defeat the guard. Test 1 and test 5 will catch
   this if miscoded.

4. The race condition comment must be present. The verification step in the
   plan calls for it explicitly. This is documentation, not behavior -- no
   test covers it, which is appropriate.

5. Logging at severity 3 for the guard rejection. No test asserts this (the
   test harness does not capture log calls), but the plan's observability
   coverage note acknowledges this is by convention.

---

## Summary

Six tests cover all meaningful behavioral branches of the guard: the 409 path,
the pass-through paths (second admin key exists, non-admin key, already-revoked),
tenant isolation, and the RFC 9457 response shape. The test structure follows
existing file conventions. No coverage gaps rise to blocking level.

APPROVE.
