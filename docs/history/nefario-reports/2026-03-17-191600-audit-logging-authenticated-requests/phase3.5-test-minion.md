## Verdict: ADVISE

**Reviewer**: test-minion
**Focus**: Test coverage for audit logging and auth contract changes

---

### Summary

The plan is structurally sound. The existing test suite is well-organized, the "no new test task" rationale is defensible for log payload assertions, but there are two gaps that should be addressed before or during execution.

---

### Finding 1: auth.test.js will need updating for keyHashPrefix -- executor must be explicit about this

**Severity**: MEDIUM (not a blocker, but the plan undersells it)

The plan says: "Tests asserting exact object shape will need updating -- the executing agent handles that inline."

Looking at `test/auth.test.js`, Block 1 line 29-36 checks `result.ok`, `result.tenantId`, `result.scopes`, `result.authMethod`. None of these use `toEqual` on the full object, so they will continue to pass without change. However, there is no test that asserts `keyHashPrefix` IS present on a successful KV auth result. This means:

- Existing tests will not break (good)
- But there is no verification that Task 1's primary deliverable (keyHashPrefix in the success return) is actually correct

**Recommendation**: The executor running Task 1 should add a single assertion to `test/auth.test.js` Block 1:

```js
it('success result includes keyHashPrefix as 8-char hex string', async () => {
  await seedApiKey(env.KV, TEST_TENANT_KEY, { tenantId: 'acme', scopes: ['capture'] });
  const result = await verifyApiKey(makeRequest(`Bearer ${TEST_TENANT_KEY}`), env);
  expect(result.ok).toBe(true);
  expect(result.keyHashPrefix).toMatch(/^[0-9a-f]{8}$/);
});
```

This is one test, uses the existing pattern, requires no new infrastructure, and closes the gap where the primary contract change has zero direct test coverage.

---

### Finding 2: legacy auth path keyHashPrefix behavior is unspecified

**Severity**: LOW

The plan says `keyHashPrefix` should be present on KV success paths but is silent on whether `verifyApiKey` with legacy auth (`authMethod: 'legacy'`) will also return `keyHashPrefix`. Looking at the Task 2 prompt: it uses `auth.keyHashPrefix || null` for some paths, implying the field may be absent on legacy auth results.

The existing legacy auth tests (Block 2) do not test for `keyHashPrefix` presence or absence. If the legacy path omits it, log calls using `auth.keyHashPrefix` without the `|| null` guard will emit `undefined` into the log payload rather than `null`. The plan's Task 2 prompt inconsistently applies the guard (some paths have it, some don't).

**Recommendation**: The executor for Task 2 should verify the legacy auth return explicitly includes `keyHashPrefix: null` (or equivalent), not just relies on `|| null` guards scattered across log call sites. A test asserting `result.keyHashPrefix` is `null` or `undefined` for legacy auth would catch this, but at minimum the executor should audit the consistency of `|| null` guards during Task 2.

---

### What the plan gets right

- "Tests asserting exact object shape" concern is real but resolved correctly -- existing tests use `.toBe()` on individual fields, not `toEqual` on the full return, so Task 1 is safe to execute.
- The rationale for not adding Coralogix log payload assertions is correct: it would require fetchMock contention and test infrastructure changes that are out of scope.
- The `npx vitest run` gate at the end of every task is the right lightweight enforcement.
- Grepping for `log(env,` as a field-completeness check (Verification Step 1) is a good operator-level verification that doesn't require test code.

---

### Action Required

The executor for Task 1 should add the `keyHashPrefix` assertion to `test/auth.test.js` using the existing Vitest/KV pattern. This is an inline change during Task 1 execution, not a separate task. The gate review for Task 1 should confirm this assertion is present.
