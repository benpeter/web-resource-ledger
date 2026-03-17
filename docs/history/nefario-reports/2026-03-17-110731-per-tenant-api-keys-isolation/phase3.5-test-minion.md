# Test-Minion Review: Per-Tenant API Keys (Phase 3 Synthesis)

## Verdict: ADVISE

The test plan in Task 4 is well-structured and the infrastructure choice (real miniflare KV, SELF.fetch pattern) is correct. The coverage spec explicitly calls out the critical auth paths, adversarial cases, and a round-trip lifecycle test. However, there are three gaps that should be addressed before execution, plus one structural concern about test isolation that will cause intermittent failures if not fixed.

---

## Advisory 1: KV cleanup in auth.test.js is underspecified -- will cause test pollution

**SCOPE**: Task 4 -- `test/auth.test.js`

**CHANGE**: The synthesis says "each describe block seeds KV state in `beforeEach` and cleans up apikey:* keys." This is correct intent but the cleanup instruction needs to be more specific. The existing `test/kv.test.js` uses targeted deletes (`env.KV.delete("capture:TEST_ID")`). For auth tests, `seedApiKey` writes `apikey:{sha256hex}` keys where the hash is derived at runtime from a constant test key. If the `afterEach` just lists `prefix: 'apikey:'` and bulk-deletes, that works -- but the task prompt to test-minion must say exactly that, or the agent will write `beforeEach` cleanup only (seeding fresh state without clearing stale state from a prior failed test). The failing test case to imagine: a test that seeds a revoked key, then the next describe block's `beforeEach` seeds a fresh active key at the same hash -- but if the prior afterEach didn't clean up, the revoked record is still there.

**WHY**: The auth tests are stateful (they modify KV), run in the same miniflare instance, and the test key constant (`TEST_TENANT_KEY = 'wrl_live_' + 'a'.repeat(43)`) is shared across describe blocks. Without explicit `afterEach` cleanup using `prefix: 'apikey:'` list-and-delete, cross-describe contamination is likely.

**TASK**: Add an explicit instruction to the Task 4 prompt: each describe block in `auth.test.js` must have both `beforeEach` (seed) AND `afterEach` (cleanup all `apikey:*` keys via `env.KV.list({ prefix: 'apikey:' })` + batch delete). This matches the existing pattern in `kv.test.js` for the `tenant:` prefix.

---

## Advisory 2: Missing test case -- KV lookup error (network/timeout) vs key-not-found

**SCOPE**: Task 4 -- `test/auth.test.js`, security adversarial tests

**CHANGE**: The auth spec covers the "misconfigured environment returns 503" case (no KV, no CAPTURE_API_KEY). But the CLAUDE.md requirement states the `reason` field MUST distinguish "key not found in KV" from "KV lookup error." The synthesis prompt for Task 1 reinforces this: reason values must include distinguishable states. The test suite has no case that exercises a KV lookup failure (e.g., `env.KV.get` throws) to verify it returns a distinct reason/status rather than silently falling through to legacy auth. Without this test, a KV error that silently falls through to legacy auth would pass all existing tests while violating the "fail loudly" principle.

**WHY**: This is the exact class of error that CLAUDE.md's "fail loudly" rule targets. In production, a KV outage that silently degrades to legacy auth would be invisible until someone noticed the `authMethod: 'legacy'` log spike -- if they were watching. A test that stubs `env.KV.get` to throw should exist to verify the error path is distinguishable from not-found.

**TASK**: Add one test case to the "verifyApiKey -- KV-based key lookup" describe block: mock `env.KV.get` to throw an error (use `vi.spyOn`) and verify the result is `{ ok: false, reason: 'kv_error' }` (or whatever reason name Task 1 assigns to this path) with status 500 or 503, NOT a fallthrough to legacy auth. Note: this is the one place where mocking is appropriate -- testing an infrastructure failure path that cannot be triggered via miniflare's real KV.

---

## Advisory 3: Round-trip lifecycle test needs explicit cross-tenant isolation assertion

**SCOPE**: Task 4 -- `test/admin-keys.test.js`, "Admin API -- round-trip lifecycle" describe block

**CHANGE**: The lifecycle test "Create key -> use key for POST /v1/captures -> revoke key -> verify 401" validates the single-tenant happy path. The success criteria from the prompt.md explicitly includes "tenant can only list/retrieve their own captures." The round-trip test should be extended (or a sibling test added) to verify: create key for tenant-A, create key for tenant-B, perform captures with each, then verify that GET /v1/captures with tenant-A's key returns only tenant-A captures. This is the isolation property that justifies the entire feature.

**WHY**: The synthesis correctly identifies this as a core success criterion ("Per-tenant capture isolation"). A round-trip test that only validates create->capture->revoke within a single tenant does not prove isolation. The isolation test is the highest-value test in the entire suite -- if it's missing, the feature could ship with a list endpoint that returns all captures regardless of tenant and all unit/auth tests would still pass.

**TASK**: Add to the "Admin API -- round-trip lifecycle" describe block (or as a separate describe "Tenant isolation"): create two keys for different tenants, perform one capture per tenant, then assert GET /v1/captures with tenant-A's key returns exactly the tenant-A capture and not tenant-B's. This test uses real miniflare KV and SELF.fetch -- no additional infrastructure needed.

---

## Structural Note (not a blocker): `vitest.config.js` ADMIN_RATE_LIMITER comment is potentially misleading

The synthesis says "The ADMIN_RATE_LIMITER binding will be picked up from wrangler.toml automatically." This is correct for `@cloudflare/vitest-pool-workers` when using `wrangler.toml` as config source, but only if the vitest config references `wrangler.toml` via `wranglerConfig`. If the existing `vitest.config.js` overrides bindings inline (as is implied by "Add these miniflare bindings"), the rate limiter may not be present and rate-limit tests in the admin suite would silently pass (the `if (env.ADMIN_RATE_LIMITER)` guard means rate limiting is skipped if the binding is absent). The implementing agent should verify `ADMIN_RATE_LIMITER` is actually present in the test environment before writing the rate-limit tests, or explicitly seed it in the vitest config if wrangler.toml is not the source of truth for test bindings.

This is low-risk if the agent confirms the binding is present, so it does not require a synthesis change -- just a note to include in the Task 4 prompt or for the implementing agent to verify.
