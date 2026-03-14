## Verdict: ADVISE

---

- [test-minion]: `buildTestWacz` helper puts the wrong value in `signedData.hash`
  SCOPE: `test/verify.test.js` -- `buildTestWacz` helper function (Task 3)
  CHANGE: In the helper, `digestDoc.signedData.hash` must be set to `bundleHash` (the sha256 of canonical datapackage JSON), not to `dpHashOfBytes` (the sha256 of the pretty-printed bytes). As written, `digestDoc.hash` correctly gets `dpHashOfBytes` (hash of the serialized file), but `digestDoc.signedData.hash` is also set to `dpHashOfBytes`. In `wacz.js` the real WACZ sets `signedData.hash = bundleHash` where `bundleHash = sha256(encode(canonicalize(datapackage)))`. The signature is over `bundleHash`, so `signedData.hash` must hold `bundleHash`. If `verify.js` reads `signedData.hash` to reconstruct the payload being verified, the helper will produce a structurally inconsistent WACZ that either always fails or masks a bug in the verifier.
  WHY: The helper is the trust anchor for all 12 unit tests. A structurally wrong helper means the happy-path test passes for the wrong reason (or fails silently), and the tamper tests prove nothing. This is a latent defect that survives code review because the field names look plausible.
  TASK: Task 3

---

- [test-minion]: Missing test for `failed`-status capture in integration suite
  SCOPE: `test/verify-integration.test.js` -- error cases describe block (Task 4)
  CHANGE: Add a test that creates a capture and calls `failCapture()` on it, then asserts the verify endpoint returns 404. The handler spec says "status is not `'complete'`" triggers 404, which covers `failed` as well as `pending`. A `failed` capture is a real production state (network error, renderer crash) that operators will encounter.
  WHY: Without this test, a regression that accidentally treats `failed` as `complete` would not be caught. The `pending` test only covers one of the two non-complete states. The fix is one test with `failCapture(env.KV, id, 'renderer crashed')`.
  TASK: Task 4

---

- [test-minion]: Unit test key generation uses `crypto.subtle.generateKey` outside `cloudflare:test` import -- vitest worker scope must be confirmed
  SCOPE: `test/verify.test.js` -- key generation pattern (Task 3)
  CHANGE: Confirm that `crypto.subtle.generateKey('Ed25519', ...)` is available in the Vitest workers pool (miniflare) context without importing `cloudflare:test`. The existing `test/wacz.test.js` uses `crypto.subtle` inside a test that runs via `cloudflare:test` env -- those tests import from `cloudflare:test`. The unit test for `verifyWacz` explicitly avoids `cloudflare:test`, but it still runs inside the workers pool because the vitest config uses `defineWorkersConfig`. In miniflare, `crypto` is a global with Ed25519 support, so this should work. Flag this for a quick smoke-check before parallelizing with Task 4.
  WHY: If the crypto global is not available in the workers pool without an explicit import, all 12 unit tests fail at key generation before reaching any assertion. Low probability but zero-cost to verify.
  TASK: Task 3

---

- [test-minion]: Integration test 18/19 (`verifyUrl` in retrieval) will conflict with `capture-retrieval.test.js` seed state
  SCOPE: `test/verify-integration.test.js` -- `verifyUrl` tests using `TEST_ID = 'cap_' + 'f'.repeat(32)` (Task 4)
  CHANGE: The `verifyUrl` tests (18 and 19) share the same `TEST_ID` and no-WACZ helper ID as the rest of the integration test file. `capture-retrieval.test.js` creates its own permanent records for `'a'.repeat(32)` through `'e'.repeat(32)` in `beforeEach`. The `'f'.repeat(32)` ID is clean and not used elsewhere. The no-WACZ helper uses `'e'.repeat(31)+'f'` which is also distinct. No collision, but this should be verified explicitly: the `capture-retrieval.test.js` `noHeadersId` is `'e'.repeat(32)`, not `'e'.repeat(31)+'f'`. This is safe. Noting for the implementer to not drift the ID choice during implementation.
  WHY: `isolatedStorage: false` means all test files share the same KV and R2 state. ID collisions cause silent cross-test contamination that produces flaky tests rather than obvious failures.
  TASK: Task 4

---

- [test-minion]: No test exercises the 503 path (missing `SIGNING_KEY`) at the integration level
  SCOPE: `test/verify-integration.test.js` -- error cases (Task 4)
  CHANGE: Add a test that calls the verify endpoint when `env.SIGNING_KEY` is absent (or simulate by temporarily overwriting it). The handler spec says "return 503 if `env.SIGNING_KEY` is not configured -- never silently skips signature verification." In miniflare, `SIGNING_KEY` is injected via `vitest.config.js`. This path is difficult to test without a separate worker config or by mocking `getSigningKeys`. If impractical, document the gap explicitly in the test file with a `it.todo` entry.
  WHY: The 503 branch is a hard security invariant: if the signing key is absent, verification must refuse rather than silently succeed. Not having a test for this means a future refactor that accidentally returns 200/false instead of 503 would not be caught.
  TASK: Task 4
