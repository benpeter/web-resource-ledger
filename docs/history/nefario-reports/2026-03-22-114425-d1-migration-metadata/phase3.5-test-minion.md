## Verdict: ADVISE

- [testing]: The `auth.test.js` describe block is named "verifyApiKey -- KV-based key lookup" and the `authMethod` assertion checks for `'kv'` — both will be stale after migration and will mislead when tests fail.
  SCOPE: `test/auth.test.js`, describe block names and `authMethod` assertion
  CHANGE: After updating fixtures to use D1, rename the describe block to "verifyApiKey -- D1-based key lookup" and update the `authMethod` expected value to whatever `src/auth.js` emits post-migration (or remove the assertion if the field is dropped).
  WHY: Stale describe block names and wrong expected string constants make failing tests actively misleading. When auth breaks, a developer reading "KV-based key lookup" will look in the wrong place.
  TASK: Task 3 (test suite migration)

- [testing]: The Task 3 prompt instructs test-minion to "update KV error simulation test: create equivalent D1 mock that throws on prepare/bind/first" but gives no concrete guidance on what D1 error shape to simulate or which `db.js` error path to exercise.
  SCOPE: `test/auth.test.js` — D1 error path test
  CHANGE: Specify that the D1 error mock should stub `env.DB.prepare` to throw (or return a rejected promise from `.first()`), and that the test should assert the HTTP response is 500 with an `internal_error` body — matching the existing KV error test's intent.
  WHY: Without a concrete pattern, test-minion is likely to write a mock that doesn't actually exercise the error-handling path in `db.js`, producing a test that passes vacuously. The existing KV error test (`env.KV.get` throws) has a clear target; the D1 equivalent needs one too.
  TASK: Task 3 (test suite migration)

- [testing]: The `cleanDb` helper deletes from `api_keys` before `tenants`, but `api_keys.tenant_id` has a FK reference to `tenants`. FK enforcement is off at runtime (per Conflict Resolution 8), so this order is safe — but the comment in the plan says "FK-safe order" without acknowledging that FK enforcement is actually disabled. If a future change enables FK enforcement, the delete order would need to flip.
  SCOPE: `test/fixtures.js` — `cleanDb` function comment
  CHANGE: Add an inline comment to `cleanDb` noting that the delete order assumes FK enforcement is OFF (per wrangler.toml PRAGMA decision). This makes the constraint explicit so it doesn't silently break if FK enforcement is ever enabled.
  WHY: Low-risk now, but the comment in the synthesis plan is slightly wrong ("FK-safe order" implies FKs are enforced). The correct order with FKs ON would be captures -> api_keys -> signing_keys -> tenants; the proposed order happens to be that already, so functionally correct — the comment just needs to not claim something that isn't true.
  TASK: Task 3 (test suite migration)
