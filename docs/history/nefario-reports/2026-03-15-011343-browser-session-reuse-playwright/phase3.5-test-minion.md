# Test Minion Review: browser-session-reuse

## Verdict: ADVISE

The core test approach is sound. The DI pattern via `stubRenderer` already decouples all orchestration tests from the browser library, so the migration does not touch any existing test. The 4 new error-pattern tests and the concurrent test cover the most important new code paths in `categorizeError()`. No objections there.

Three issues worth flagging before Task 2 executes:

---

### 1. Concurrent test does not verify isolation -- it only verifies completion

The concurrent capture test (Task 2, section 2) asserts `status === 'complete'` for both captures. This is useful, but it does not verify what it advertises ("don't interfere"). Two captures sharing a single mocked `stubRenderer` with no shared state will never interfere regardless of the implementation. The test would pass even if `getOrCreateSession` had a race condition that wrote to a module-level variable.

This is acceptable given that `defaultRenderer` internals are an integration concern (not unit-testable without a real browser binding), but the test name and describe block label should be revised to accurately describe what is being verified: that `performCapture` orchestration handles concurrent invocations without KV corruption, not that session reuse is isolation-safe. A misleading test name erodes trust in the suite.

**Recommended change**: Rename the describe block from `'two captures with different IDs complete independently'` to `'two concurrent captures write separate KV records'` and add an assertion that neither record's artifacts path collides with the other's (e.g., `recordA.artifacts.screenshot !== recordB.artifacts.screenshot`).

---

### 2. Missing error category: `'Target closed'`

`categorizeError()` in the plan includes `msg.includes('Target closed')` as a session-unavailable signal (synthesis doc, section 6). The test suite adds tests for `'browser has been closed'` and `'session pool'` but not for `'Target closed'`. This is a valid Playwright error string that appears when a browser context is used after the browser disconnects (common in the reuse scenario). The coverage gap means a regression to that branch would be invisible in CI.

**Recommended change**: Add a fifth test in the Playwright-specific errors describe block for `'Target closed'`:

```js
it('handles Target closed error as retryable', async () => {
  const targetClosedRenderer = async () => {
    throw new Error('Target closed');
  };
  mockHeaderFetch();
  await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP);
  await performCapture(env, TEST_URL, TEST_IP, TEST_ID, targetClosedRenderer);
  const record = await getCapture(env.KV, TEST_ID);
  expect(record.status).toBe('failed');
  expect(record.retryable).toBe(true);
  expect(record.error).toBe('Browser session unavailable. Try again shortly.');
});
```

---

### 3. `beforeEach` cleanup does not cover ID_A / ID_B

The plan instructs Task 2 to add cleanup for `ID_A` and `ID_B` "in `beforeEach` if needed, or scope the cleanup within the test's own setup." The existing `beforeEach` only deletes `TEST_ID`. If test ordering changes (e.g., the concurrent test runs first and fails mid-way, leaving stale KV), a subsequent run of that test will not start from clean state.

The concurrent test should either delete `ID_A` and `ID_B` in the existing `beforeEach`, or scope its own `beforeEach`/`afterEach` inside the concurrent describe block. The "if needed" hedge in the task prompt leaves this ambiguous and risks a non-deterministic failure under test-runner parallelism or re-runs.

**Recommended change**: Make the cleanup requirement explicit in the task prompt -- add ID_A and ID_B deletes to the outer `beforeEach`, or add a scoped `beforeEach` inside the concurrent describe block.

---

### What is NOT a concern

- The decision not to mock `@cloudflare/playwright` is correct. The DI pattern already provides full unit-test coverage of the orchestration contract without needing to mock the library.
- The decision to keep all tests in `capture.test.js` is correct. No new file is warranted.
- The existing 17 tests require no changes -- the migration does not alter the `performCapture` or `captureHeaders` public API.
- `vitest.config.js` does not need changes; the `browserRendering` placeholder binding is already present and tests never use it directly.

---

### Summary

None of these issues are blockers. Issue 2 (missing `'Target closed'` test) is the highest-value fix -- it closes a real coverage gap in a new code path. Issues 1 and 3 are quality concerns that prevent future confusion and test flakiness. All three can be addressed by test-minion during Task 2 execution without requiring changes to Task 1.
