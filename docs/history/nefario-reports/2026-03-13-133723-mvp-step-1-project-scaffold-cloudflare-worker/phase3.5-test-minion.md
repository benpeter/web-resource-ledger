ADVISE

- [test-minion]: The POST /health test expects RFC 9457 response but POST /health is not a registered route, so it hits the generic 404 fallback -- the test name "POST /health returns 404" is accurate, but this tests the fallback dispatcher, not method-not-allowed behavior; this is fine for Step 1 but the test comment should make the intent clear so future contributors don't "fix" it by adding a 405 handler.
  SCOPE: test/health.test.js, test case "POST /health returns 404"
  CHANGE: Add a comment in the test body noting that POST /health intentionally returns 404 (not 405) because method dispatch is out of scope for Step 1; this prevents a future contributor from misreading a passing test as evidence that 405 handling exists.
  WHY: When Step 8 adds security headers and proper method handling, someone will look at this test and either expect it to be updated to 405 or silently leave it testing the wrong thing. A single inline comment eliminates ambiguity with zero overhead.
  TASK: Task 3

- [test-minion]: The `vitest.config.js` prompt omits a `miniflare` config block for the Browser Rendering binding; the `[browser]` binding in wrangler.toml declares `binding = "BROWSER"` but `@cloudflare/vitest-pool-workers` requires explicit `miniflare.browserRendering` configuration or the binding will throw during Worker initialization in the Miniflare environment.
  SCOPE: vitest.config.js, `[browser]` binding emulation
  CHANGE: Add a `miniflare: { browserRendering: { fetch: async () => new Response('', { status: 501 }) } }` stub (or equivalent no-op) to the `workers` pool options in `vitest.config.js`, so tests that do not exercise the Browser binding can still boot the Worker without errors.
  WHY: Miniflare emulates R2 and KV automatically but Browser Rendering is a controlled API that requires explicit configuration. If the binding causes Worker initialization to throw in the test pool, all 10 tests fail with a cryptic startup error rather than the expected test results. This is a known issue documented in the `@cloudflare/vitest-pool-workers` changelog for 0.12.x and later.
  TASK: Task 1 (vitest.config.js) and Task 4 (the version fallback troubleshooting list should include this)

- [test-minion]: The test suite has no test that verifies the `Content-Type: application/problem+json` header on the integration-level 404 from `GET /nonexistent`; the `responses.test.js` unit tests cover Content-Type for `problemResponse` directly, but the integration test table for `/nonexistent` only asserts "RFC 9457 shape" without specifying a Content-Type assertion.
  SCOPE: test/health.test.js, test case "GET /nonexistent returns 404"
  CHANGE: Explicitly add `expect(response.headers.get('content-type')).toContain('application/problem+json')` to the `/nonexistent` test (and the "POST /health" test) to confirm the header survives the full Worker dispatch path, not just the utility function in isolation.
  WHY: The unit tests verify `problemResponse` sets the header correctly; the integration tests verify the routing wires up to `problemResponse`. Without the Content-Type assertion in the integration test, a future refactor that bypasses `problemResponse` for the fallback 404 would pass all tests while silently breaking the RFC 9457 contract. This is a one-line addition per test.
  TASK: Task 3
