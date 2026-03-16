# Test Minion Review: R2 Key Versioning

## Verdict: ADVISE

The plan is structurally sound and covers the core happy path. The scenarios listed in Task 2 are necessary but not sufficient. Several gaps in the test plan would leave critical fallback logic and failure modes unverified.

---

## What the plan gets right

- Unit tests for `archiveSigningKey`, `listArchivedSigningKeys`, and idempotent archive writes in `kv.test.js` are the right layer for KV functions.
- Integration tests for the key rotation scenario (sign with old key, verify with new current key + archived old key) directly validate the success criterion from the prompt.
- A second keypair in `vitest.config.js` (TEST_ARCHIVED_KEY) is the right mechanism for multi-key test scenarios.
- The plan correctly leaves `verifyWacz()` unchanged -- it is a pure function and its existing tests remain valid.

---

## Gaps that should be addressed

### 1. Fallback resolution order is untested for the failure path

The plan tests: "sign with old key, verify with new current key + archived old key." It does NOT test what happens when keyId lookup fails at every level:

- keyId in KV record points to an archived key that no longer exists in KV (deleted or expired)
- Server falls back to current key -- current key is also wrong (different rotation happened)
- Server falls back to all archived keys -- none match

Expected outcome: `verified: false`, `signature` check fails cleanly. Without a test, it is easy to introduce a runtime exception in the fallback loop that leaks to a 500 instead of a structured verification failure.

**Add a test**: capture with key A, delete archived key A from KV, verify -- expect `verified: false` with `signature` check status `fail`, no exception.

### 2. Legacy capture verification (no keyId) is specified but the fallback order within that path needs a second case

The plan covers: "no keyId in KV record -> try current key first." It does not cover: "no keyId in KV record AND current key is wrong (key was rotated since legacy capture was written)." In this case the server should try all archived keys. Without this test, the "try all archived keys" branch of the legacy fallback could be dead code that never executes.

**Add a test**: create a legacy KV record (no keyId field) whose WACZ was signed with key B (archived), with key A as the current key. Verify -- expect `verified: true` via archived key B fallback.

### 3. archiveSigningKey is called before completeCapture -- ordering is not verified

The plan says "Archive BEFORE completeCapture() -- no race window." The implementation in `capture.js` will enforce this via ordering, but no test verifies it. If a future refactor swaps the order, nothing will catch it. The KV record will be missing keyId at verification time even though the WACZ contains one.

**Add a test in `wacz.test.js` or a new `capture-keyid.test.js`**: after `performCapture`, read the KV record and verify `record.wacz.keyId` is present AND that `signing-key:{keyId}` exists in KV. Both must be true -- the presence of one without the other is a bug.

### 4. The `/.well-known/signing-keys` (plural) rate limiting test needs concrete shape

The plan mentions "rate limiting on new endpoint" but does not specify what this means. The existing `signing-key.test.js` tests the singular endpoint without rate limiting. If the plural endpoint has a rate limit, the test should verify: (a) normal requests succeed, (b) the rate-limited response has correct status (429) and headers (`Retry-After`). If there is no rate limit planned yet, remove the mention to avoid the agent writing a placeholder test that asserts nothing.

**Clarify or remove**: either specify what rate limiting behavior to test, or drop the mention.

### 5. keyId format is specified but not validated in unit tests

The design specifies: `SHA-256(raw 32-byte public key), first 4 bytes, 8 hex chars`. This is a deterministic function that should have a unit test. Without one, a bug in `computeKeyId` (wrong byte count, wrong encoding, wrong slice) will silently produce wrong keyIds that are stored and looked up incorrectly.

**Add a unit test for `computeKeyId`**: given a known public key byte sequence, assert the output is exactly 8 lowercase hex characters and matches the expected value. This belongs in a new `test/signing-key-id.test.js` or alongside signing unit tests.

---

## Architecture note: TEST_ARCHIVED_KEY binding

The plan specifies generating a second keypair and adding a `TEST_ARCHIVED_KEY` binding. This is the right approach for multi-key integration tests. Confirm the binding is passed as a separate env variable (not a replacement for `SIGNING_KEY`) so both keys are simultaneously available in tests that need to sign with one and verify with the other. The vitest config should export both the current signing key and the archived key so tests can construct KV records and WACZs signed with either.

---

## Summary

None of these gaps are blockers -- the plan is safe to execute -- but the fallback path tests (gaps 1 and 2) are high-value and directly map to the stated success criterion "all existing captures remain verifiable after a key rotation." They should be included in Task 2 before execution, not deferred. Gap 3 (ordering assertion) is a low-cost addition that prevents a class of silent regression. Gaps 4 and 5 are low-effort cleanups.

Recommend the executing agent address gaps 1, 2, 3, and 5. Gap 4 should be clarified before Task 2 begins.
