# Domain Plan Contribution: test-minion

## Recommendations

### (a) Auth State Management: API Keys, Not OAuth Sessions

Do NOT use Playwright to drive the GitHub OAuth browser flow. The OAuth flow depends on GitHub's login UI (which changes, requires MFA, CAPTCHAs, etc.) and would be the single most fragile part of the entire suite. Instead:

1. **Use a pre-provisioned API key for all capture/read/webhook tests.** The staging environment already has a `SMOKE_API_KEY` (used in `scripts/smoke-test.sh` and passed as `WRL_STAGING_CAPTURE_API_KEY` in CI). This key authenticates via `Authorization: Bearer <key>` header. All capture, read, and webhook endpoints accept API key auth (see `verifyAuth()` in `src/index.js` which tries session cookie first, then falls back to `verifyApiKey()`).

2. **Use the admin key for test setup/teardown.** The staging admin key (`WRL_STAGING_ADMIN_KEY`) can create tenant-specific API keys, manage tenant config, and query usage. Use the admin API to create an isolated test tenant and a dedicated API key at the start of each test run (global setup), and clean up at the end.

3. **Skip browser-based OAuth testing in this suite.** The OAuth flow is already tested by unit tests (`test/oauth.test.js`) using the `env._githubFetch` injection point. The E2E suite should focus on what unit tests cannot cover: real HTTP round-trips through the Worker, queue processing, R2 storage, and cryptographic verification. If OAuth E2E testing is desired in the future, it requires a dedicated test GitHub account with a personal access token -- that is a separate initiative, not part of this suite.

**Rationale:** The existing smoke test (`scripts/smoke-test.sh`) already validates the staging environment using API key auth. The E2E suite is an extension of this pattern, not a replacement for it.

### (b) GitHub OAuth: Do Not Mock, Do Not Test E2E

The `env._githubFetch` injection point only works in-process (vitest with miniflare bindings). When hitting the real staging Worker over HTTP, there is no way to inject a mock. The options are:

- **Real GitHub OAuth** -- requires a test GitHub account, real credentials in CI secrets, MFA handling, and is fragile against GitHub UI changes. Not worth the maintenance cost.
- **Mock GitHub's endpoints** -- impossible from outside the Worker without modifying staging's deployed code.

**Recommendation:** Exclude OAuth from E2E scope entirely. The OAuth flow is thoroughly unit-tested. The E2E suite tests everything _after_ authentication (capture, verify, webhook, quota). This is the right boundary -- OAuth is a third-party integration; the E2E suite validates WRL's own integration boundaries (D1, R2, KV, Queues, Browser rendering).

### (c) Webhook Delivery Test: Two Approaches

The webhook delivery test needs a publicly reachable HTTPS endpoint that the staging Worker can POST to. Two viable approaches:

**Approach 1 (recommended): Use webhook.site or similar disposable endpoint service.**
- Create a unique webhook.site URL at test start.
- Register it as a webhook on the staging tenant.
- Trigger a capture, wait for completion, then poll webhook.site's API to check for received payloads.
- Pros: zero infrastructure, works in CI, genuinely tests the full webhook path.
- Cons: external dependency (webhook.site could be down); adds ~10-15 seconds for delivery + polling.

**Approach 2: Test via ping endpoint only.**
- Register a webhook pointing to a known-good HTTPS endpoint (e.g., `https://httpbin.org/post`).
- Use `POST /v1/webhooks/:id/ping` to trigger a test delivery (this is a synchronous endpoint that returns the delivery result directly -- see `handlePingWebhook` in `src/webhooks.js`).
- Assert on the ping response (which includes `httpStatus`, `success`, `durationMs`).
- Pros: synchronous, no polling, no external state to query.
- Cons: does not test the async queue-based delivery path (only tests the synchronous ping path).

**My recommendation: Use both.** The ping test validates webhook registration and HMAC signing work correctly (fast, reliable). A second test uses webhook.site to validate the full async queue delivery after a real capture. If webhook.site is unreliable in CI, mark the async test as `test.slow()` with a generous timeout and allow skip via env var.

**Important: validate HMAC signature in the webhook payload.** The test should not just check "was the webhook delivered" but also verify the `X-WRL-Signature` header matches the expected HMAC-SHA256 of the payload. This is the critical security property.

### (d) Scheduled Capture Test: Drop It

There is no scheduled capture feature in the codebase:
- No cron trigger in `wrangler.toml` (no `[triggers]` section)
- No scheduling API in the route table (`src/index.js`)
- No schedule-related code anywhere in `src/`

**Recommendation:** Replace with a test that exercises the **batch capture** endpoint (`POST /v1/captures/batch`), which does exist and is a distinct code path from single capture. This validates the batch orchestration logic (quota pre-check for N captures, per-URL validation, partial success handling) against the real staging environment.

### (e) Test Isolation on Shared Staging Environment

All tests hit a shared staging D1/R2/KV. Isolation strategy:

1. **Dedicated test tenant.** In global setup, use the admin API to create a tenant with a unique ID like `e2e-{timestamp}` and a fresh API key. All tests use this tenant's key. This provides natural isolation -- captures, webhooks, and usage counters are all scoped to `tenantId`.

2. **Unique URLs per test.** Each capture test should use a distinct URL (e.g., `https://example.com?e2e={testId}` where `testId` is a unique identifier). This ensures captures from different tests or test runs do not collide. The `?e2e=` parameter does not affect the captured content of example.com but gives each capture a unique identity.

3. **No cleanup required for captures.** D1 captures and R2 objects from test runs are harmless -- they are scoped to the test tenant and cost nothing (staging R2 is free tier). If accumulation becomes a concern, add a periodic cleanup script rather than per-test teardown (which is fragile and slow).

4. **Webhook cleanup in afterAll.** Delete any webhooks registered during the test run using `DELETE /v1/webhooks/:id`. Webhooks consume D1 rows and queue messages, so cleanup prevents accumulation.

5. **Test ordering independence.** Each test creates its own captures, registers its own webhooks, and asserts on its own results. No test depends on state created by another test. Tests can run in parallel (Playwright's default) because they are all under the same tenant but operate on different capture IDs.

6. **Quota awareness.** The free tier allows 100 captures/month. If the E2E suite runs on every push, it could exhaust the quota. Two mitigations:
   - Use admin API to set the test tenant to a higher quota via `PUT /v1/admin/tenants/{id}/config`.
   - Count captures per test run (currently ~5-8 captures across all tests) and track total monthly usage in the test output.

### (f) Documentation

Yes, embed a `tests/e2e/README.md` that covers:

1. **Required environment variables** -- `E2E_BASE_URL`, `E2E_API_KEY`, `E2E_ADMIN_KEY` (and how to obtain them from 1Password).
2. **How to run locally** -- `npx playwright test` with the env vars set. Note that running locally uses the same staging environment as CI.
3. **CI configuration** -- how the GitHub Actions workflow is structured, what secrets are needed.
4. **Interpreting results** -- where screenshots and trace files are saved, how to view Playwright traces.
5. **Adding new tests** -- the pattern for creating a new test (unique capture URL, assert on status poll, verify result).
6. **Rate limit awareness** -- the staging rate limits and how many times the suite can run per minute.

### Playwright Configuration Specifics

Since this is a pure API test suite (not browser UI testing), the Playwright config should:

- **Use `request` context only, not `browser` context.** Playwright's `APIRequestContext` is the right tool for HTTP API testing. No browser needs to be launched. This makes the suite faster and eliminates browser-related flakiness.
- **Exception: the public verification page.** The `/v1/verify/:id` endpoint serves HTML when `Accept: text/html` is sent. One test should use a real browser to navigate to this page and assert the page renders with verification status. This is the single legitimate browser test in the suite.
- **Project config:** One `api` project (request-only, majority of tests) and one `browser` project (Chromium, for the verification page test only).
- **Timeout:** 60 seconds per test (captures take 10-30 seconds to process through the queue).
- **Retries:** 1 retry on CI (staging environment can have transient queue delays), 0 retries locally.
- **Reporter:** HTML reporter for local development, JUnit for CI (GitHub Actions can parse JUnit results).
- **Trace/screenshot:** On failure only (`on-first-retry` trace mode), saved as artifacts.

## Proposed Tasks

### Task 1: Project Setup and Configuration
**What:** Initialize Playwright in the project. Create `tests/e2e/playwright.config.js` with two projects (`api` and `browser`). Add `@playwright/test` as a devDependency. Add npm script `test:e2e`. Create helper module `tests/e2e/helpers/api-client.js` wrapping `APIRequestContext` with auth headers and base URL injection.
**Deliverables:** `playwright.config.js`, `helpers/api-client.js`, updated `package.json` with script and dependency.
**Dependencies:** None.

### Task 2: Global Setup -- Test Tenant Provisioning
**What:** Create `tests/e2e/global-setup.js` that uses the admin API to: (1) create a test tenant `e2e-{timestamp}`, (2) create an API key for it, (3) configure the tenant with elevated quota (1000 captures/month), (4) write the tenant ID and API key to a shared state file for tests to consume. Create matching `global-teardown.js` that revokes the test API key.
**Deliverables:** `global-setup.js`, `global-teardown.js`, shared state mechanism.
**Dependencies:** Task 1 (project exists).

### Task 3: Test -- Capture and Verify Journey
**What:** Test the complete happy path: POST a capture request, poll `/v1/captures/:id/status` until terminal, assert status is `complete`, fetch the capture details via `GET /v1/captures/:id`, then hit `GET /v1/verify/:id` (with `Accept: application/json`) and assert `verified: true` with valid checks.
**Deliverables:** `tests/e2e/capture-verify.spec.js`
**Dependencies:** Tasks 1, 2.

### Task 4: Test -- Batch Capture
**What:** Submit a batch of 3 URLs via `POST /v1/captures/batch`. Assert 202 response with 3 items. Poll each capture until terminal. Assert at least 2/3 complete successfully (allows for transient failures on external URLs). Verify each completed capture has valid verification.
**Deliverables:** `tests/e2e/batch-capture.spec.js`
**Dependencies:** Tasks 1, 2.

### Task 5: Test -- Webhook Registration and Delivery
**What:** Two sub-tests: (a) Register a webhook, trigger a ping via `POST /v1/webhooks/:id/ping`, assert ping returns success. (b) Register a webhook pointing to webhook.site, submit a capture, wait for completion, poll webhook.site API for delivery, validate the received payload structure and HMAC signature. Clean up webhook in afterEach.
**Deliverables:** `tests/e2e/webhook-delivery.spec.js`
**Dependencies:** Tasks 1, 2.

### Task 6: Test -- Quota Enforcement
**What:** Use admin API to create a second test tenant with quota `capturesPerMonth: 1`. Submit one capture (should succeed). Submit a second capture (should return 429 with `capture_limit` reason). Assert the error response includes `limit`, `used`, `resetsAt` fields. Clean up via admin API.
**Deliverables:** `tests/e2e/quota-enforcement.spec.js`
**Dependencies:** Tasks 1, 2.

### Task 7: Test -- Public Verification Page (Browser)
**What:** This is the single browser-based test. First, create a capture via API and wait for completion. Then use Playwright's browser context to navigate to `/v1/verify/:id` (which serves HTML). Assert the page title contains the capture ID, the verification status is displayed, and the page loads without JavaScript errors. Take a screenshot on pass for visual baseline.
**Deliverables:** `tests/e2e/verify-page.spec.js`
**Dependencies:** Tasks 1, 2, 3 (depends on understanding the capture flow).

### Task 8: CI Workflow
**What:** Create `.github/workflows/e2e.yml`. Trigger on `workflow_dispatch` (manual) and optionally after staging deploy. Install Playwright, run the E2E suite against staging, upload HTML report and trace files as artifacts. Required secrets: `WRL_STAGING_ADMIN_KEY`, `WRL_STAGING_CAPTURE_API_KEY`. Required vars: `WRL_STAGING_BASE_URL`.
**Deliverables:** `.github/workflows/e2e.yml`
**Dependencies:** All test tasks (this wires them into CI).

### Task 9: Documentation
**What:** Write `tests/e2e/README.md` covering environment variables, local run instructions, CI details, result interpretation, adding new tests, and rate limit considerations.
**Deliverables:** `tests/e2e/README.md`
**Dependencies:** All tasks (documents the final state).

## Risks and Concerns

### 1. Rate Limits Will Bite
The staging environment has aggressive rate limits: 5 req/60s on admin endpoints, 100 req/60s on capture (binding-level), 10 req/60s on per-tenant KV counters. Running the full suite could hit these limits, especially if tests run in parallel. **Mitigation:** Use admin API to configure the test tenant with elevated limits. Sequence admin API calls carefully (the admin rate limiter is the tightest at 5/60s). Consider serializing tests or adding small delays between admin calls.

### 2. Capture Processing Time
Captures involve Cloudflare Browser Rendering (headless Chromium) and take 10-30 seconds. With 5-8 captures across all tests, wall-clock time could approach 3-4 minutes even with parallel execution. The 5-minute budget is tight. **Mitigation:** Parallelize tests (each test creates its own capture). Use lightweight URLs like `https://example.com` that render fast. Monitor timing in CI and optimize if needed.

### 3. Queue Delivery Latency
Webhook delivery depends on `wrl-webhooks-staging` queue processing. Queue `max_batch_timeout` is 5 seconds, plus delivery attempt time. The webhook test may need to wait 15-30 seconds for delivery. **Mitigation:** Use generous timeouts for webhook polling. The ping test provides a fast synchronous assertion; the full delivery test is the slow one.

### 4. Staging Environment Instability
The E2E suite depends on the staging Worker being deployed and healthy. If staging is broken or in the middle of a deployment, all tests fail. **Mitigation:** The first test in the suite should be a health check (`GET /health`). If health check fails, skip all tests with a clear error message rather than producing a wall of confusing failures.

### 5. webhook.site External Dependency
If webhook.site is down or slow, the webhook delivery test fails through no fault of WRL. **Mitigation:** Make the webhook.site test skippable via env var (`E2E_SKIP_WEBHOOK_DELIVERY=1`). The ping test still validates webhook HMAC signing without external dependencies.

### 6. Tenant/Data Accumulation
Over time, E2E test runs will accumulate tenants, captures, and R2 objects in staging. This is not an immediate problem (D1 free tier is generous, R2 staging is free), but it could eventually slow down list endpoints or confuse debugging. **Mitigation:** Name test tenants with `e2e-` prefix so they are easily identifiable. Add a periodic cleanup script (not part of the test suite itself) that deletes `e2e-*` tenants older than 7 days.

### 7. No Direct D1/R2/KV Access for Assertions
Unlike the unit tests which operate in-process with direct D1/R2/KV bindings, the E2E tests can only observe behavior through the HTTP API. Some state (like whether the usage counter was incremented correctly, or whether the R2 object exists) is not directly queryable from outside. **Mitigation:** The admin usage endpoint (`GET /v1/admin/usage?tenantId=X`) provides usage data. Verification endpoint proves R2 + signing work. Accept that E2E tests are black-box; unit and integration tests cover the internals.

### 8. Playwright vs Fetch for API Tests
Playwright's `APIRequestContext` adds overhead compared to plain `fetch`. For a pure API test suite, you might wonder whether Playwright is the right tool. **Position:** Playwright is justified because: (a) the verification page test needs a real browser, (b) Playwright provides excellent test infrastructure (retries, reporters, parallel workers, trace files, artifacts) that we would otherwise need to build ourselves, (c) the API request overhead is negligible compared to capture processing time.

## Additional Agents Needed

**ops-minion (or iac-minion):** The CI workflow needs GitHub Actions secrets (`WRL_STAGING_ADMIN_KEY`) and repository variables (`WRL_STAGING_BASE_URL`) configured. The admin key for staging needs to be stored as a GitHub Actions secret. This is an ops/infrastructure task that should be coordinated with whoever manages the GitHub repository settings and 1Password vault.

No other additional specialists are needed. The test suite is a straightforward API test suite against an existing staging environment. The implementation requires JavaScript/Playwright expertise (which the test-minion covers) and no new infrastructure beyond CI secrets.
