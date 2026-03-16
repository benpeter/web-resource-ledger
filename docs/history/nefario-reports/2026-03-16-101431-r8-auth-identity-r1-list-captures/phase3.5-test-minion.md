## Verdict: APPROVE

The plan covers the critical test paths well. A few issues worth flagging, in descending priority.

---

### Issues

**1. kv.test.js beforeEach cleanup will not clean index keys (medium)**

The existing `beforeEach` in `test/kv.test.js` deletes only `capture:${TEST_ID}`. After Task 1, `createCapture` also writes `tenant:default:ts:{ISO}:{TEST_ID}`. This index key won't be cleaned between tests, causing the index key format test and list prefix assertions to accumulate state if the same TEST_ID is reused across tests. The plan tells the agent to add new tests but doesn't mention updating the cleanup block.

Fix: the agent should extend `beforeEach` to also delete any index keys for TEST_ID. Since the timestamp is unknown at cleanup time, use `env.KV.list({ prefix: 'tenant:default:ts:' })` and delete matching keys, or use a unique captureId per test instead of the shared `TEST_ID` constant.

**2. No test for tenantPrefix() throwing on invalid input (low)**

The plan specifies that `tenantPrefix()` throws on invalid tenantId (fail-closed defense-in-depth). This behavior is security-load-bearing -- it's the KV layer's last line of defense before a bad tenantId reaches a KV key. The plan asks for it to be implemented but does not include a test for the throw path. The agent prompt for Task 2 kv.test.js additions also omits it.

Fix: add one test to kv.test.js: `tenantPrefix('bad/tenant')` (or a value failing the regex) throws. This is a 3-line test.

**3. Status filter over-fetch edge case: no test for scan budget exhaustion (low)**

The plan specifies that when the 500-key scan budget is exhausted, `hasMore: true` is returned even if fewer than `limit` items matched. This is a documented behavior. The proposed test suite has no test for this path -- it's hard to test cheaply with miniflare (would require seeding 500+ records with mismatched status). Document this as a known gap acceptable for MVP, or add a comment in the test file noting it's untested. No action required to block.

**4. Parallel KV fetches -- no test for partial null handling in the page (low)**

`listCaptures` fetches capture records in parallel and filters out nulls (expired/orphaned index keys). The kv.test.js additions include a test for orphaned keys, which is good. However, the list-captures.test.js suite doesn't include an integration-level test that mixes valid and expired records in the same page -- the filtering only gets exercised at the unit level. Acceptable for MVP given the unit coverage exists.

---

### Confirmations (plan does these correctly)

- Round-trip pagination test (25 items, 3 pages, uniqueness assertion) is specified -- this is the most important test for the pagination implementation and it's present.
- `vi.useFakeTimers()` usage for deterministic ordering in pagination tests is specified, with `vi.useRealTimers()` in afterEach -- correct pattern.
- `ip` field exclusion is tested explicitly via CaptureSummary shape tests.
- Auth boundary tests cover 401 paths for the new endpoint.
- Invalid cursor returns 400 is tested.
- `Cache-Control: private, no-store` is tested.
- Error result `tenantId === undefined` assertion is called out in the auth.test.js update instructions.
- The beforeEach cleanup gap (issue 1) is the only thing that could cause spurious test failures in CI.

---

### Summary

The plan is approvable as-is. Issue 1 (beforeEach cleanup) is worth a note to the implementing agent -- it won't cause test failures in a fresh environment but will cause flakiness if tests run in a non-isolated order or the same KV namespace accumulates state. Issues 2-4 are low priority and do not block.
