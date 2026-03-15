## Verdict: ADVISE

---

### Issue 1: fetchMock intercept pattern in Task 2 is incorrect for undici-mock

SCOPE: Task 2, `test/log.test.js`, test cases 3, 4, 5, 6

The plan instructs the agent to intercept the Coralogix POST using:

```js
fetchMock.get('https://ingress.test.coralogix.com')
  .intercept({ path: '/logs/v1/singles', method: 'POST' })
  .reply(200, 'ok');
```

The outer call is `.get()` — this sets up the undici mock scope for the host using the GET method chain entry point, which is confusing but fine as a hostname scope identifier in this library. However, `capture.test.js` (the reference file) consistently uses `.get(origin)` where origin is the target host, then `.intercept({ path, method })`. This pattern is correct.

The real issue is test case 5 ("swallows fetch errors silently"). The plan says to use `fetchMock.replyWithError(new Error(...))` but the actual `undici-mock` (used by `@cloudflare/vitest-pool-workers`) exposes `replyWithError` on the intercept chain, not on the mock scope. The correct call is:

```js
fetchMock
  .get('https://ingress.test.coralogix.com')
  .intercept({ path: '/logs/v1/singles', method: 'POST' })
  .replyWithError(new Error('network error'));
```

As shown in `capture.test.js` line 68: `mockHeaderFetchError` calls `.replyWithError(new Error('network error'))` on the intercept result. The plan's instruction leaves the agent to guess the correct method chain position. Since this test is the most important one (verifying the `.catch(() => {})` guard), a wrong intercept setup would cause it to pass for the wrong reason (network blocked by `disableNetConnect` rather than a real fetch error swallowed by the catch).

CHANGE: Update the Task 2 test case 5 instruction to show the complete, correct intercept chain using `replyWithError` chained after `.intercept(...)`, matching the pattern in `mockHeaderFetchError()` in `capture.test.js`.

WHY: If the agent writes `fetchMock.replyWithError(...)` at scope level (wrong), the test will likely fail or pass vacuously. The test for error swallowing is the highest-value test in this file — it's the one that would catch a future regression where `.catch(() => {})` is accidentally removed.

TASK: In Task 2's prompt, replace the error test case instruction with:

```js
// Test case 5: fetchMock replyWithError must be chained on the intercept, not the scope
fetchMock
  .get('https://ingress.test.coralogix.com')
  .intercept({ path: '/logs/v1/singles', method: 'POST' })
  .replyWithError(new Error('network error'));
const p = log(mockEnv, 5, 'capture', { event: 'capture.fail' });
await expect(p).resolves.toBeUndefined(); // Promise resolves, does not reject
```

---

### Issue 2: `capture.test.js` tests will encounter unmocked fetch after Task 4

SCOPE: Task 7, existing `capture.test.js` tests

The plan correctly notes (Task 7, "Potential issues" section) that `log()` will be called inside `performCapture()` after Task 4's changes. It asserts this is safe because the test environment has no `CORALOGIX_ENDPOINT` and `log()` returns `undefined` immediately.

This analysis is correct IF `env` in `capture.test.js` truly lacks `CORALOGIX_ENDPOINT`. Confirming: `vitest.config.js` bindings do not set `CORALOGIX_ENDPOINT`, and `wrangler.toml` currently has no `[vars]` section. After Task 3, `wrangler.toml` will have:

```toml
[vars]
CORALOGIX_ENDPOINT = "https://ingress.eu1.coralogix.com/logs/v1/singles"
```

`vitest.config.js` uses `wrangler: { configPath: './wrangler.toml' }`, which means miniflare WILL pick up `[vars]` from `wrangler.toml`. After Task 3 runs, `CORALOGIX_ENDPOINT` will be present in the test `env`. Since `CORALOGIX_SEND_KEY` is absent (it is a Worker secret, not set in wrangler.toml), the guard clause `if (!env.CORALOGIX_ENDPOINT || !env.CORALOGIX_SEND_KEY)` will still short-circuit on the missing key.

The guard is safe. No fetch will be attempted. This risk is already mitigated by requiring BOTH vars to be present.

However, Task 7 needs to be executed AFTER Task 3 lands (it is blocked by Tasks 2, 3, 4, 5 — correct). The plan's dependency graph is sound. No change needed here, but the agent running Task 7 should be aware that `CORALOGIX_ENDPOINT` will be present in env after Task 3.

CHANGE: Add a clarifying note to Task 7's "Potential issues" section: After Task 3, `CORALOGIX_ENDPOINT` IS present in the miniflare env (picked up from `wrangler.toml [vars]`). The guard still fires on missing `CORALOGIX_SEND_KEY`. No fetch is attempted.

WHY: Without this note, the Task 7 agent may misdiagnose a failure and incorrectly add `CORALOGIX_SEND_KEY` to `vitest.config.js` (explicitly forbidden in Task 7's "What NOT to do") to try to fix it.

TASK: Add to Task 7 "Potential issues" item 1: "Note: After Task 3, `CORALOGIX_ENDPOINT` will be present in miniflare env because wrangler.toml [vars] is read by the pool workers config. The guard short-circuits on missing `CORALOGIX_SEND_KEY` (a secret, never in wrangler.toml). `log()` still returns undefined in tests."

---

### Issue 3: Missing test coverage for `capture.js` log path — header fail warn path

SCOPE: Task 2 test spec vs Task 4 implementation

Task 4 adds a `log(env, 4, 'capture', { event: 'capture.header_fail', captureId })` call inside the header fail branch. Task 2 writes tests only for `src/log.js` in isolation. The `capture.test.js` existing test "capture completes (headers are optional)" exercises the header fail path but does not verify the log call fires.

This is acceptable for MVP — `capture.test.js` tests are integration-style and cannot easily intercept the log call without adding `CORALOGIX_SEND_KEY` to the test env (which is forbidden). The guard clause ensures log is a no-op in tests, so this is not a correctness risk.

No change required. Flagging for awareness: the header fail log path is implicitly untested at the unit level. The guard clause on both env vars is what makes this safe.

---

### Summary

Two actionable changes:

1. Fix the `replyWithError` intercept chain in Task 2 test case 5 (HIGH — prevents a vacuous pass on the most important test case).
2. Add a clarifying note to Task 7 about `CORALOGIX_ENDPOINT` being present after Task 3 (LOW — prevents a misdiagnosis that could lead to a forbidden config change).

The overall plan is well-structured. The guard clause design (`!env.CORALOGIX_ENDPOINT || !env.CORALOGIX_SEND_KEY`) is the correct isolation mechanism for test environments, and the dependency graph correctly sequences tasks. These are refinements, not blockers.
