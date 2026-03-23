ADVISE

- [testing]: Task 2 quota tests require the tenant row to have a `tier` column but `seedApiKey` in `fixtures.js` does not seed a `tier` value, so the column defaults to 'free' only after the migration runs -- tests that assert quota behavior will silently pass with free-tier defaults even if the migration is missing or not applied in the test environment.
  SCOPE: `test/fixtures.js`, `test/capture-integration.test.js`, `test/batch-capture.test.js`
  CHANGE: Add a `seedTenantTier(db, tenantId, tier)` helper to `fixtures.js` and use it explicitly in the Task 2 quota tests, so each test that depends on tier-specific limits sets the tier deliberately rather than relying on the column default.
  WHY: The existing `cleanDb()` + `seedApiKey()` pattern creates a tenant row with no explicit tier. If the migration hasn't applied (or if a future test forgets to set tier), the test still passes because the app falls back to free defaults. The test should fail loudly when tier state is wrong, not silently continue with a different tier than intended.
  TASK: Task 2

- [testing]: The plan requires testing that "quota check runs after rate limit" by sending a request that is both rate-limited and over-quota, but `capture-integration.test.js` uses a shared KV rate-limit bucket that can be exhausted by prior tests in the same run, making the ordering test unreliable.
  SCOPE: `test/capture-integration.test.js`
  CHANGE: The ordering test must use a unique `CF-Connecting-IP` that has not been seen in the current test run (use the `nextTestIp()` pattern from `batch-capture.test.js`) and pre-seed the tenant's usage_counters to be at-quota BEFORE exhausting the IP rate limit. Add a `beforeEach` that cleans KV rate-limit keys for the ordering test's IP, so the test controls both states.
  WHY: The test depends on the rate limiter firing before the quota check. If the KV bucket for that IP is already exhausted by an earlier test, the rate limit 429 happens for the wrong reason (bucket exhaustion, not the test's intended setup). This produces a false positive that masks ordering regressions.
  TASK: Task 2

- [testing]: The Task 1 `checkQuota` test for "correct resetsAt (first of next month)" will produce a brittle date assertion unless the test either mocks the clock or uses a relative assertion.
  SCOPE: `test/quotas.test.js`
  CHANGE: Assert that `resetsAt` parses to a valid ISO date whose UTC day is 1 and whose UTC month is one greater than `computePeriod()`'s month (handling year rollover). Do not assert the exact ISO string, which would fail when tests run on different days. Example: `expect(new Date(result.resetsAt).getUTCDate()).toBe(1)`.
  WHY: If the test asserts a hardcoded string like `"2026-04-01T00:00:00.000Z"`, it passes in March 2026 and fails in April 2026. The intent is "first of next month" which requires structural, not literal, assertion.
  TASK: Task 1

- [testing]: Task 3 (`GET /v1/account/usage`) test plan requires a "tenant with zero usage" case but does not specify that the `usage_counters` row must be absent (not just have zero values). The plan needs a test for the `usageResult.results?.[0]` being undefined, which is a distinct code path from a row with zeros.
  SCOPE: `test/account-usage.test.js`
  CHANGE: Add a distinct test case: "returns 200 with zero usage when no usage_counters row exists for the current period" (do not seed `usage_counters` at all). Separately, add "returns 200 with zero usage when usage_counters row has zero values" (seed a row with captureCount=0). These test two different code paths in the null-coalescing logic.
  WHY: The `??` fallback `usage?.capture_count ?? 0` handles both cases, but only one is tested. If the row-absent path is broken (e.g., `results[0]` throws instead of returning undefined), it won't be caught.
  TASK: Task 3

- [testing]: The Task 4 UI tests target `test/ui-dashboard.test.js`, but the existing file tests `htmlDashboard()` response headers and HTML structure -- it does not have a DOM environment or the ability to call UI component functions directly. Progress bar rendering tests that assert CSS classes and ARIA attributes require either a DOM (jsdom) environment or a different testing approach.
  SCOPE: `test/ui-dashboard.test.js`
  CHANGE: Confirm that the test environment has jsdom available (check vitest config for `environment: 'jsdom'`). If not, the progress bar class tests must be written as string-content assertions against the generated HTML string, not DOM property checks. The plan's wording ("Usage section renders with correct progress bar percentages") implies DOM assertions -- clarify which approach is available before implementation.
  WHY: String-template UI tests that check for class names in generated HTML are valid but different from DOM property checks. An agent implementing "assert CSS class applied" without knowing which approach is available will likely use DOM APIs that don't exist in the test environment, producing import errors rather than useful failures.
  TASK: Task 4

- [testing]: No test verifies that the `X-Quota-*` headers on a successful 202 response reflect the pre-capture state (i.e., before the usage increment, not after). The plan says quota check runs before the increment, but if the implementation reads usage after incrementing, the `X-Quota-Used` header will be inflated by 1 on the first capture.
  SCOPE: `test/capture-integration.test.js`
  CHANGE: Add a test that seeds a tenant with exactly N captures used (via `seedUsageCounter`), makes one successful capture, and asserts that `X-Quota-Used` equals N (pre-increment count), not N+1. This pins the documented semantics of the header.
  WHY: The header should report the snapshot at check time. If implementation accidentally uses post-increment count, the value is misleading. Without a test that seeds a known count, this regression is invisible.
  TASK: Task 2
