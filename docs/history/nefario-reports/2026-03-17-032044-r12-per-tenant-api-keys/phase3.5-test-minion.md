---
verdict: ADVISE
reviewer: test-minion
---

# Test Review: R12 Per-Tenant API Keys

## Verdict: ADVISE

The plan is structurally sound and the synthesis document references a test
matrix ("83 test cases across auth rewrite, KV operations, admin endpoints,
and tenant isolation"). However, the test matrix is referenced but not
defined here -- it is described as a future deliverable in "Phase 6
(post-execution test phase)". My concerns are about the gap between
implementation and test execution, plus three specific coverage gaps worth
naming before the code is written.

---

## What the plan gets right

**Testing deferred to Phase 6 is acceptable in principle.** The synthesis
makes clear that Phase 6 writes `auth.test.js` (full rewrite), new
`admin.test.js`, and regression of the existing suite. The project already
uses `@cloudflare/vitest-pool-workers`, so auth and admin tests will run
against real Workers runtime with real KV -- consistent with the project
philosophy of testing real boundaries.

**The synthesis identifies the right high-risk cases.** Risks 1 and 2 call
out the specific scenarios that must be tested: KV read failure fail-closed
(cases #28-29) and cross-tenant IDOR (cases #61, #74, #81-83). The case
numbers imply a written matrix exists somewhere, even though it is not in
this document. If those cases are real and land in Phase 6, coverage will be
adequate.

**The existing KV test patterns are solid.** `test/kv.test.js` uses `env`
from `cloudflare:test`, does real KV writes, and cleans up in `beforeEach`.
The same pattern should be followed in `admin.test.js` for the
`apikey:{hash}` and `tenant-keys:{tenantId}` namespaces.

---

## Concerns

### 1. No auth.test.js rewrite spec is in scope for implementation tasks

Tasks 1-6 all say "no test files" in their deliverables. The auth module is
completely rewritten (new exports, new return shape, 6-step flow, KV
dependency), but the existing `test/auth.test.js` tests the *old* shape
(`{ ok: true, tenantId }` only, no `scopes`, no `authMethod`, no `keyHash`).

If Tasks 1-3 ship without updating `auth.test.js`, the existing tests will
fail immediately (the return shape changes break assertions on lines 29-49,
and the misconfiguration guard in the new flow requires `!env.KV &&
!env.ADMIN_KEY && !env.CAPTURE_API_KEY` rather than just `!env.CAPTURE_API_KEY`).

**The existing auth tests will not pass with the new code unless they are
updated.** This creates a broken-test window between the implementation tasks
and Phase 6. Either:
- (a) Phase 6 is guaranteed to run before the PR is created, so the
  broken-test window never lands in a PR, OR
- (b) An explicit note to edge-minion should clarify that auth.test.js
  must be updated as part of Task 1 to maintain a green suite throughout
  implementation.

The synthesis says verification step 4 is "npm test passes with zero
failures (dual-mode fallback works)" -- this implies tests must pass before
PR creation, which resolves concern (a). But edge-minion's Task 1 prompt does
not mention updating auth.test.js, leaving ambiguity about when tests become
green again.

**Recommendation**: Add "update auth.test.js to match new return shape" to
Task 1's deliverables, or add it to Task 4/Phase 6 with a clear constraint
that `npm test` must pass before the PR is opened.

### 2. The revocation fall-through invariant needs explicit test structure

The single most important security property in this change is: "a revoked KV
key MUST NOT fall through to env-var paths." The synthesis calls this out in
Task 1 and in Risk 1, referencing test cases #28-29.

However, I want to name the exact test structure this requires, because it is
easy to write this test incompletely:

```js
// INSUFFICIENT -- only tests that revoked key returns 401
it('returns 401 for revoked key', async () => {
  // set up revoked KV record
  // verify 401 returned
});

// REQUIRED -- tests that revoked key does not authenticate via env-var fallback
it('revoked KV key does not authenticate even when CAPTURE_API_KEY matches', async () => {
  const rawKey = 'shared-key';
  const hash = await hashKey(rawKey);
  await env.KV.put(`apikey:${hash}`, JSON.stringify({
    tenantId: 'acme', scopes: ['capture'], name: 'test',
    revoked: true, revokedAt: new Date().toISOString(),
  }));
  const result = await verifyApiKey(
    makeRequest(`Bearer ${rawKey}`),
    { KV: env.KV, CAPTURE_API_KEY: rawKey }, // same key in both KV and env
  );
  expect(result.ok).toBe(false);
  expect(result.reason).toBe('key_revoked');
});
```

The critical distinction: the env provides `CAPTURE_API_KEY` equal to the
revoked key's raw value. If fall-through occurs, this test passes auth when it
should return 401. Without this specific setup, the test is incomplete.

**Recommendation**: Confirm that Phase 6's auth test matrix includes this
exact scenario (not just "revoked key returns 401" but "revoked key does not
authenticate despite matching env-var").

### 3. KV namespace collision between admin keys and capture keys

`test/kv.test.js` uses `beforeEach` to clean the `capture:` and `tenant:`
prefixes. The new `admin.test.js` will write to `apikey:` and
`tenant-keys:` prefixes -- different namespaces. However, since
`isolatedStorage: false` in `vitest.config.js`, all tests share the same KV
namespace within a run.

If `admin.test.js` and `kv.test.js` run in the same pool and share state,
test pollution is possible. This is low risk in practice (different key
prefixes), but the `beforeEach` in `admin.test.js` must clean `apikey:` and
`tenant-keys:` prefixes explicitly. The `kv.test.js` cleanup pattern is the
right model -- match it.

**Recommendation**: Phase 6's admin.test.js must include:
```js
beforeEach(async () => {
  const { keys: apikeys } = await env.KV.list({ prefix: 'apikey:' });
  for (const k of apikeys) await env.KV.delete(k.name);
  const { keys: tenantKeys } = await env.KV.list({ prefix: 'tenant-keys:' });
  for (const k of tenantKeys) await env.KV.delete(k.name);
});
```

---

## Coverage matrix gaps to confirm before Phase 6 executes

These scenarios must exist in the test matrix. If they are already in the
"83 test cases" referenced in the synthesis, no action is needed -- just
confirming they are named:

| Scenario | File | Priority |
|---|---|---|
| KV.get throws (network error) -> 503, not fall-through | auth.test.js | CRITICAL |
| Revoked key with matching CAPTURE_API_KEY -> 401 key_revoked | auth.test.js | CRITICAL |
| ADMIN_KEY does NOT have capture scope -> 403 on POST /v1/captures | auth.test.js or capture.test.js | HIGH |
| Tenant-A admin key cannot list Tenant-B keys (IDOR) | admin.test.js | HIGH |
| Tenant-A admin key cannot revoke Tenant-B key (returns 404, not 403) | admin.test.js | HIGH |
| Self-revocation returns 409 | admin.test.js | HIGH |
| Last admin key revocation blocked (409) | admin.test.js | HIGH |
| requireScope returns null when scope present | auth.test.js | MEDIUM |
| scope expansion: 'capture' implies 'read' in returned scopes | auth.test.js | MEDIUM |
| superadmin (env-admin) can create key for any tenant | admin.test.js | MEDIUM |
| tenant admin cannot create key for different tenant (403) | admin.test.js | HIGH |
| generateApiKey output format matches wrl_live_ + 43 base64url chars | admin.test.js | MEDIUM |
| DELETE confirms name+keyHash in response body (not just 204) | admin.test.js | MEDIUM |
| Already-revoked key DELETE returns 200 with revoked:true (idempotent) | admin.test.js | MEDIUM |

---

## Summary

The plan is approvable with one clarifying action before implementation
begins: add an explicit statement in Task 1 (or the execution plan) that
`test/auth.test.js` must be updated to reflect the new return shape so that
`npm test` remains green throughout the implementation sequence. The rest of
the gaps are Phase 6 concerns -- well-positioned to be addressed before PR
creation -- but the auth test regression needs to be owned by a specific task,
not left as Phase 6 cleanup.

The security-critical fall-through test (concern 2) and KV cleanup pattern
(concern 3) are notes for Phase 6, not blockers.
