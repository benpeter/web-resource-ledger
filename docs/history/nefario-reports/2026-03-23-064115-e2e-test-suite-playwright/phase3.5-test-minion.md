ADVISE

- [testing]: Key rotation test mutates shared auth state, creating a hidden ordering dependency that cascades when rotation fails mid-way.
  SCOPE: `tests/e2e/key-rotation.spec.js`, Task 4 prompt
  CHANGE: Add explicit recovery logic to the teardown section of the rotation test. If the test fails after revoking the original key but before writing the replacement, subsequent tests will fail with 401 instead of their actual assertion errors. The Task 4 prompt should specify: if the state-update step fails, the test must call `POST /v1/account/keys` in an `afterEach` or `finally` block and write the new key hash back to `.auth-state.json` before propagating the failure. Without this, one mid-test failure silently breaks the entire suite.
  WHY: `workers: 1` ensures ordering but does not protect against partial execution. The current plan relies on the test completing normally to leave a working auth state. A test that fails is by definition not completing normally. The result is that a key rotation bug produces misleading failures in unrelated tests (quota, webhook, batch), wasting investigation time.
  TASK: Task 4

- [testing]: Quota test contains an unresolved factual question about when `usage_counters` increments, which determines whether the test logic is correct.
  SCOPE: `tests/e2e/quota-enforcement.spec.js`, Task 6 prompt (line: "quota is checked on submission based on `usage_counters` which is incremented when the capture completes (or immediately on queue acceptance -- verify by reading the code)")
  CHANGE: Resolve this before Task 6 executes. The implementing agent should read `src/index.js` around the quota check and capture acceptance logic before writing the test. The Task 6 prompt should be amended to state the actual behavior rather than leaving it as "verify by reading the code." If the counter increments on acceptance (not completion), the test does not need to poll after the first capture before submitting the second -- and adding the poll wastes time. If it increments on completion, skipping the poll makes the test incorrect. The current prompt creates a 50/50 chance the agent writes the test wrong.
  WHY: A quota enforcement test that submits the second capture before the first has incremented the counter will get a 202 instead of a 429, then fail with a confusing assertion error. This is the kind of subtle timing bug that appears to work sometimes (if the capture is fast) and fails other times.
  TASK: Task 6

- [testing]: Batch capture test uses "at least 1 of 2" assertion, which tolerates a 50% real failure rate and reduces CI signal.
  SCOPE: `tests/e2e/batch-capture.spec.js`, Task 5 prompt (step 6: "Assert at least 1 of 2 completes successfully")
  CHANGE: Change to "assert both complete successfully" with a documented allowance for transient failures via `retries: 1` (already configured for CI). If the goal is to avoid flakiness from transient queue issues, the retry mechanism handles it at the test level. A soft "at least 1" assertion means a batch endpoint bug that silently drops half of all captures passes CI indefinitely.
  WHY: The batch endpoint's value proposition is submitting multiple captures atomically. A test that accepts 50% completion validates almost nothing about batch semantics. The existing `retries: 1` config is the correct mechanism for handling transient failures -- the assertion should be strict.
  TASK: Task 5

- [testing]: Task 7 prompt allows the HMAC verification to be silently downgraded to a no-op without blocking resolution.
  SCOPE: `tests/e2e/webhook-lifecycle.spec.js`, Task 7 prompt (paragraph beginning "If the ping response does NOT include the raw signature/headers...")
  CHANGE: The Task 7 prompt should require the implementing agent to check `src/webhooks.js` `handlePingWebhook` response shape before writing the test, and report the finding at the approval gate in Task 1. If ping does not return signing details, the implementation plan should be updated to reflect that HMAC is not end-to-end verified by this suite -- that is a coverage gap worth documenting explicitly in the plan, not discovered implicitly when the agent writes a comment saying "HMAC verification not possible." The current language ("document as limitation") allows the agent to leave with a passing test that verifies nothing about signing.
  WHY: HMAC signature verification is listed in the synthesis as a key security validation ("HMAC signing...this is the high-value test"). If ping does not expose the sent signature, the entire webhook test section validates only CRUD operations, not the cryptographic path. That is a material coverage difference that the plan author should know about before Task 7 executes.
  TASK: Task 7

- [testing]: `pollUntilComplete` timeout behavior is unspecified -- a stuck capture will produce a Playwright timeout error rather than a meaningful test failure.
  SCOPE: `tests/e2e/helpers/api-client.js`, Task 1 prompt
  CHANGE: The Task 1 prompt should specify that `pollUntilComplete` must throw a descriptive error on timeout (e.g., `throw new Error(\`Capture ${captureId} did not reach terminal state within ${timeoutMs}ms. Last status: ${lastStatus}\`)`) rather than returning the last status silently or letting the surrounding test fail on a null assertion. This makes test failures immediately actionable without reading Playwright traces.
  WHY: Without an explicit throw, a 60-second poll timeout will result in `pollUntilComplete` returning undefined or the last partial status, then the test's `expect(status).toBe('complete')` fails with "expected undefined to be complete" -- with no indication of how long the capture had been running or what state it was in. Clear error messages from polling helpers cut debugging time significantly for queue-latency failures.
  TASK: Task 1
