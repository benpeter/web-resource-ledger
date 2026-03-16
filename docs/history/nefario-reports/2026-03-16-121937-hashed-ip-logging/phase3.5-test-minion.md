## Verdict: ADVISE

The proposed tests are largely sufficient. Three issues worth flagging before execution:

---

### 1. Missing: `errorName`/`errorMessage` field assertions in capture tests (medium)

Task 3 adds tests for the new `categorizeError()` patterns (session expired, protocol error, connection refused) but only asserts on `record.status`, `record.retryable`, and `record.error`. These are KV fields.

The new `errorName` and `errorMessage` fields (from Task 2) are **log fields**, not KV fields. They won't appear in `record`. The plan doesn't include any assertion that these fields are actually populated on log calls.

This is a real gap: if someone accidentally omits `errorName`/`errorMessage` from the `capture.stage.fail` log call, no test would catch it.

**Recommendation**: The test prompt should include at least one test that verifies `errorName` and `errorMessage` are populated. The existing test suite uses a minimal `log()` no-op in test environments (from `test/log.test.js` patterns), so log field assertions may require either capturing log call arguments via a spy or inspecting the Coralogix payload. If that's impractical in this test environment, note the gap explicitly and accept it -- but the omission should be a conscious decision, not an oversight.

---

### 2. Missing: `cip` field propagation test (low)

The plan adds `cip` to every log call but no test verifies this propagation. The same constraint applies as above -- if `log()` no-ops in test environments, there's no practical way to assert field presence on log calls without a spy.

The plan does verify `computeCip()` returns the right shape (16-char hex) and the `IP_HASH_SEED` binding is present in `vitest.config.js`. That's the important behavior.

**Recommendation**: Accept this gap if log call assertions aren't feasible in miniflare. The unit tests for `computeCip()` cover the logic; the integration is simple field spreading.

---

### 3. Signature migration completeness risk (medium)

The plan explicitly warns about ~20+ `performCapture()` call sites needing the `cip` parameter inserted. This is a pure mechanical search-and-replace task with high failure risk: if any call is missed, `stubRenderer` silently becomes `cip` and `undefined` becomes `renderer`, causing that test to run with the real `defaultRenderer` rather than the stub -- likely hanging or failing opaquely.

**Recommendation**: The Task 3 prompt should instruct the agent to grep for all `performCapture(` occurrences in the test file before editing and count them. After editing, grep again and verify the count of `undefined, renderer` patterns matches. A concrete verification step prevents silent misses. Consider adding this to the success criteria for Task 3.

---

### What the plan gets right

- Unit tests for `computeCip()` cover all important paths: determinism, uniqueness across IPs, graceful degradation when seed is absent/empty, no-throw on bad inputs.
- New `categorizeError()` patterns all have corresponding test cases.
- Explicitly skipping daily rotation test is the right call -- the rationale is sound.
- Not modifying `log.test.js` is correct; the log function is unchanged.
