# Phase 3: Synthesis -- E2E Test Suite (Playwright)

## Delegation Plan

**Team name**: e2e-test-suite
**Description**: Playwright-based end-to-end test suite validating WRL user journeys against the staging environment

## Conflict Resolutions

### Conflict 1: Webhook Receiver Strategy

**Chosen**: webhook.site + ping endpoint (test-minion approach)
**Over**: Dedicated Cloudflare Worker (api-design-minion approach)
**Why**: Deploying and maintaining a separate Worker (`wrl-test-receiver`) with its own wrangler.toml, KV namespace, secrets, and deployment pipeline is significant infrastructure for testing one feature. The project philosophy is "lean and mean" -- minimize moving parts. The pragmatic approach:

1. **Ping endpoint** (`POST /v1/webhooks/:id/ping`) validates webhook registration, HMAC signing, and delivery mechanics synchronously. This is the high-value test.
2. **Real async delivery** is tested by registering a webhook pointing to `https://httpbin.org/post` (or similar known-good HTTPS endpoint), triggering a capture, and polling `/v1/admin/usage` or checking the webhook delivery status. We do NOT need to inspect the received payload for the async path -- the ping test already validates payload structure and HMAC.
3. If full payload inspection of async delivery is needed later, webhook.site can be added as an optional test behind an env var flag.

This avoids: a new Worker project, a new KV namespace, a new deployment pipeline, new secrets in 1Password, and an additional CI dependency. The ping endpoint already exists and tests the critical signing path.

### Conflict 2: OAuth Approach

**Chosen**: Skip OAuth entirely; use API keys for all tests (test-minion approach)
**Over**: Admin sessions endpoint (security-minion) and real GitHub OAuth (security-minion alternative)
**Why**: Adding `POST /v1/admin/sessions` would add production code solely for test purposes -- a YAGNI violation. The OAuth flow is already unit-tested via `_githubFetch` injection in `test/auth.test.js`. The e2e suite tests what unit tests cannot: real HTTP round-trips, queue processing, R2 storage, and cryptographic verification. These all work with API key auth. The single browser test (verification page) is a public endpoint requiring no auth at all.

### Conflict 3: Admin Sessions Endpoint

**Chosen**: Do not add `POST /v1/admin/sessions`
**Over**: Adding it as test infrastructure (security-minion T4)
**Why**: Same as Conflict 2. Adding production code for testing violates YAGNI. If session-authenticated endpoints need e2e testing in the future, that is a separate initiative requiring a dedicated GitHub test account -- not a test-only admin endpoint.

### Conflict 4: Test Scope (ux-strategy-minion additions)

**Chosen**: Accept key rotation test (P1); accept verify page reframing; reject ToS/welcome-redirect extensions to Test 1
**Over**: Full ux-strategy-minion reframing with ToS gate, welcome redirect, and show-once key semantics in Test 1

**Why**: The ToS gate, welcome redirect (`/ui?flow=welcome`), and show-once key semantics (`GET /v1/account/first-key`) are all session-authenticated features that require browser-based OAuth or the rejected admin sessions endpoint. Since we are using API key auth exclusively (Conflict 2), these cannot be tested in this suite. The key rotation test, however, operates entirely via API key auth against `/v1/account/keys` endpoints and adds real value -- it exercises a critical security workflow.

The verify page reframing is correct: Test 6 becomes "Public Evidence Verification" testing the real `/v1/verify/:id` endpoint instead of a nonexistent "share link" feature.

## Final Test List

| # | Test Name | Priority | Auth | Time Est. |
|---|-----------|----------|------|-----------|
| 1 | Capture and Verify (Golden Path) | P0 | API key | 30-60s |
| 2 | Public Evidence Verification (Browser) | P1 | None (public) | 15-20s |
| 3 | Account Key Rotation | P1 | API key + Admin | 15-20s |
| 4 | Batch Capture | P2 | API key | 30-40s |
| 5 | Quota Enforcement | P2 | API key + Admin | 15-20s |
| 6 | Webhook Lifecycle (Ping + HMAC) | P3 | API key | 15-20s |

**Total estimated: 120-180 seconds** (well within 5-minute budget)

---

### Task 1: Playwright Configuration and Test Infrastructure
- **Agent**: test-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: yes
- **Gate reason**: This establishes the project structure, configuration, and helper patterns that all subsequent tasks depend on. File ownership and test isolation patterns propagate to every test file.
- **Gate rationale**: |
    Chosen: APIRequestContext-based testing with single Chromium project for the verify page browser test; dynamic test tenant via admin API in global setup/teardown; `workers: 1` sequential execution
    Over: (a) Multi-project split (api + browser separately) -- unnecessary complexity for one browser test; (b) Pre-provisioned static API key -- less secure, no isolation between runs
    Why: Single project keeps config simple; dynamic tenant gives per-run isolation with automatic key revocation; sequential execution avoids race conditions on shared staging
- **Prompt**: |
    ## Task: Playwright Configuration and Test Infrastructure

    You are setting up a Playwright-based e2e test suite for the WRL (Web Resource Ledger) project. The tests run against a live staging environment at `wrl-staging.benpeter.workers.dev`.

    ### What to do

    1. **Add `@playwright/test` as a devDependency.** Run `npm install -D @playwright/test`. This coexists with the existing `@cloudflare/playwright` (runtime dependency for in-Worker browser rendering -- different package, different purpose).

    2. **Create `test/e2e/playwright.config.js`** with:
       - `baseURL` from env var `E2E_BASE_URL` (default: `https://wrl-staging.benpeter.workers.dev`)
       - Single project named `e2e` pointing at `test/e2e/`
       - `workers: 1` (sequential -- shared staging environment, avoid race conditions)
       - `retries: process.env.CI ? 1 : 0`
       - `timeout: 60_000` per test (captures take 10-30s through the queue)
       - `use.trace: 'on-first-retry'`
       - `use.screenshot: 'only-on-failure'`
       - `reporter: [['html', { open: 'never' }]]`
       - `globalSetup` pointing to `./global-setup.js`
       - `globalTeardown` pointing to `./global-teardown.js`
       - Only Chromium browser needed (for the single verify page test)

    3. **Create `test/e2e/global-setup.js`** that:
       - Reads `E2E_BASE_URL` and `E2E_ADMIN_KEY` from environment
       - Calls `POST /v1/admin/keys` with admin key to create a test tenant with ID `e2e-{timestamp}` and scopes `['capture', 'read']`
       - Calls `PUT /v1/admin/tenants/{tenantId}/config` to set elevated quotas: `{ quotas: { capturesPerMonth: 500 } }`
       - Stores tenant ID, API key, key hash, and base URL in a JSON state file at `test/e2e/.auth-state.json` (gitignored). **Do NOT write the admin key to this file** -- tests that need the admin key should read `process.env.E2E_ADMIN_KEY` directly. Only the test tenant's API key belongs in the state file.
       - Performs a health check (`GET /health`) and aborts with clear error if staging is unreachable

    4. **Create `test/e2e/global-teardown.js`** that:
       - Reads the state file
       - Calls `DELETE /v1/admin/keys/{keyHash}` to revoke the test API key
       - Logs a warning (does not throw) if cleanup fails (accepted risk: orphaned key in staging)

    5. **Create `test/e2e/helpers/api-client.js`** with:
       - A helper that wraps Playwright's `APIRequestContext` with base URL and auth headers
       - `createClient(request, { apiKey })` function that returns a preconfigured request object
       - Helper functions: `pollUntilComplete(client, captureId, timeoutMs)` that polls `/v1/captures/:id/status` every 3 seconds until `status === 'complete'` or `status === 'failed'` or timeout. **On timeout, throw a descriptive error** naming the capture ID, elapsed time, and last known status (do NOT return undefined or null -- silent timeout makes assertion failures unintelligible)
       - `readAuthState()` function that reads the `.auth-state.json` file

    6. **Create `test/e2e/helpers/hmac.js`** with:
       - A standalone HMAC-SHA256 verification function using `node:crypto`
       - `verifyWebhookSignature(payload, signatureHeader, timestampHeader, secret)` that:
         - Parses the `t={ts},v1={hex}` format from the signature header
         - Computes `HMAC-SHA256(secret, "{timestamp}.{body}")`
         - Returns `{ valid: boolean, expectedSignature: string, receivedSignature: string }`
       - This is intentionally NOT imported from `src/webhook-signing.js` -- the e2e test must independently verify the signature

    7. **Add npm script** to `package.json`: `"test:e2e": "npx playwright test --config=test/e2e/playwright.config.js"`

    8. **Add to `.gitignore`**: `test/e2e/.auth-state.json` and `test-results/` and `playwright-report/`

    ### What NOT to do
    - Do not create any test spec files (those are separate tasks)
    - Do not create the CI workflow (separate task)
    - Do not modify any source code in `src/`
    - Do not install Firefox or WebKit browsers
    - Do not add browser caching in CI config

    ### Context
    - The project uses ES modules (`"type": "module"` in package.json)
    - Node version is in `.nvmrc`
    - The admin API (`POST /v1/admin/keys`) requires `Authorization: Bearer {adminKey}` header
    - The admin key for staging is passed as `E2E_ADMIN_KEY` env var
    - The `PUT /v1/admin/tenants/{tenantId}/config` endpoint accepts JSON body with `quotas` and `rateLimit` overrides
    - Existing smoke test pattern is in `scripts/smoke-test.sh` -- follow its env var naming conventions
    - Rate limit on admin endpoints: 5 req/60s -- the setup must make <= 3 admin calls

    ### Deliverables
    - `test/e2e/playwright.config.js`
    - `test/e2e/global-setup.js`
    - `test/e2e/global-teardown.js`
    - `test/e2e/helpers/api-client.js`
    - `test/e2e/helpers/hmac.js`
    - Updated `package.json` (new devDep + script)
    - Updated `.gitignore`

    ### Success Criteria
    - `npm install` succeeds without dependency conflicts between `@playwright/test` and `@cloudflare/playwright`
    - `npx playwright test --config=test/e2e/playwright.config.js --list` runs without errors (lists 0 tests, which is correct at this stage)
    - Global setup creates a test tenant when `E2E_BASE_URL` and `E2E_ADMIN_KEY` are set
    - State file is written and readable
    - Global teardown cleans up the API key

- **Deliverables**: `test/e2e/playwright.config.js`, `test/e2e/global-setup.js`, `test/e2e/global-teardown.js`, `test/e2e/helpers/api-client.js`, `test/e2e/helpers/hmac.js`, updated `package.json`, updated `.gitignore`
- **Success criteria**: Playwright config loads without errors; npm install succeeds; global setup/teardown can create and revoke a test tenant against staging

---

### Task 2: Test -- Capture and Verify (Golden Path)
- **Agent**: test-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |
    ## Task: E2E Test -- Capture and Verify (Golden Path)

    Write the P0 "golden path" e2e test that validates the complete capture-through-verification journey.

    ### What to do

    Create `test/e2e/capture-verify.spec.js` with:

    **Test: "captures a URL and verifies the result"**
    1. Read auth state from `test/e2e/.auth-state.json` (tenant API key created by global setup)
    2. `POST /v1/captures` with `{ url: "https://example.com" }` and the test API key
    3. Assert 202 response with `id` field
    4. Poll `GET /v1/captures/{id}/status` until `status === 'complete'` (use `pollUntilComplete` helper, 60s timeout)
    5. `GET /v1/captures/{id}` -- assert response includes `url`, `status: 'complete'`, `verification.verified: true`, `verification.checks` array
    6. Assert the capture response includes a `wacz` object with a `key` field (the R2 object key for the WACZ archive)
    7. `GET /v1/captures/{id}/download` with the test API key -- assert 200 response with binary content (Content-Type should be `application/wacz` or `application/octet-stream`) and Content-Length > 0. This validates the full capture-through-download chain.

    **Important details:**
    - Use the unique URL pattern `https://example.com?e2e={testId}` where testId is a timestamp or random string -- this gives each test run a unique capture identity
    - The capture involves real Cloudflare Browser Rendering -- expect 10-30 seconds for completion
    - The `/v1/captures/{id}` endpoint requires the test API key (Bearer auth)
    - Use Playwright's `APIRequestContext` for all requests (no browser needed in this test)
    - The WACZ download validates R2 storage is working end-to-end
    - Do NOT test `/v1/verify/{id}` here -- that is covered by the dedicated verify-page test (Task 3)

    ### What NOT to do
    - Do not test OAuth or session-based auth
    - Do not test ToS acceptance (requires session auth, not available via API key)
    - Do not modify any files from Task 1
    - Do not modify any source code in `src/`

    ### Context
    - Project uses ES modules
    - Helper module at `test/e2e/helpers/api-client.js` provides `readAuthState()` and `pollUntilComplete()`
    - Auth state file at `test/e2e/.auth-state.json` contains `{ tenantId, apiKey, keyHash, baseUrl }`
    - The capture poll response looks like: `{ status: 'queued' | 'processing' | 'complete' | 'failed' }`
    - The capture detail response includes `wacz: { key: 'captures/{id}/archive.wacz' }` when complete
    - The download endpoint (`GET /v1/captures/{id}/download`) returns the WACZ binary via R2 presigned URL or direct stream

    ### Deliverables
    - `test/e2e/capture-verify.spec.js`

    ### Success Criteria
    - Test creates a capture, waits for completion, and verifies the result
    - WACZ download returns binary content with correct content type
    - Test completes within 60 seconds

- **Deliverables**: `test/e2e/capture-verify.spec.js`
- **Success criteria**: Test creates a capture, polls to completion, verifies metadata, and downloads WACZ

---

### Task 3: Test -- Public Evidence Verification (Browser)
- **Agent**: test-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 2 (needs a completed capture to verify against; can reuse the capture from Task 2's test, but actually should create its own)
- **Approval gate**: no
- **Prompt**: |
    ## Task: E2E Test -- Public Evidence Verification (Browser)

    Write the P1 browser-based test that validates the public verification page works for third-party evidence sharing.

    ### What to do

    Create `test/e2e/verify-page.spec.js` with:

    **Test: "serves public verification page without authentication"**
    1. First, create a capture via API and wait for completion (same pattern as capture-verify test)
    2. Using Playwright's browser context (Chromium), navigate to `/v1/verify/{captureId}`
    3. Assert the page loads without JavaScript errors (listen for console errors)
    4. Assert the page contains verification status information (look for text indicating "verified" or the capture URL)
    5. Take a screenshot (Playwright will capture on failure automatically via config)

    **Test: "returns JSON verification without authentication"**
    1. Using a completed capture ID
    2. `GET /v1/verify/{captureId}` with `Accept: application/json` (no auth headers)
    3. Assert 200 response
    4. Assert `verified: true`
    5. Assert `checks` array is non-empty
    6. Assert `signing` object has `algorithm` and `publicKey`
    7. Assert response has `Access-Control-Allow-Origin: *` header (CORS for third-party embedding)

    **Test: "returns 404 for nonexistent capture"**
    1. `GET /v1/verify/nonexistent-id` with `Accept: application/json`
    2. Assert 404 response

    ### What NOT to do
    - Do not use any authentication for these requests (the verification page is public)
    - Do not test session-based flows
    - Do not modify source code in `src/`

    ### Context
    - The verify page at `/v1/verify/{id}` serves HTML when `Accept: text/html` and JSON when `Accept: application/json`
    - The HTML page's JavaScript does `Promise.all([fetch(verifyUrl), fetch(retrievalUrl)])` to load data
    - The JSON verify endpoint includes CORS `Access-Control-Allow-Origin: *`
    - ID-as-secret model: knowing the capture ID grants read access to verification data
    - This is the ONLY test in the suite that needs a real browser

    ### Deliverables
    - `test/e2e/verify-page.spec.js`

    ### Success Criteria
    - Browser test loads the verification page and confirms it renders
    - JSON endpoint works without auth and includes CORS headers
    - 404 for nonexistent captures
    - Test completes within 60 seconds

- **Deliverables**: `test/e2e/verify-page.spec.js`
- **Success criteria**: Browser renders verification page; JSON endpoint returns correct data without auth; CORS headers present

---

### Task 4: Test -- Account Key Rotation
- **Agent**: test-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |
    ## Task: E2E Test -- Account Key Rotation

    Write the P1 test that validates the full API key lifecycle: create, use, revoke, and last-key guard.

    ### What to do

    Create `test/e2e/key-rotation.spec.js` with:

    **Test: "rotates API keys without losing access"**
    1. Read auth state (the test API key created by global setup)
    2. `GET /v1/account/keys` with the original API key -- assert returns at least 1 key
    3. `POST /v1/account/keys` with the original API key to create a second key -- assert 201 with `key` and `keyHash`
    4. Verify the new key works: `GET /v1/account/keys` with the NEW key -- assert 200
    5. `DELETE /v1/account/keys/{originalKeyHash}` using the NEW key -- assert 204 (revoke the original)
    6. Verify the original key is rejected: `GET /v1/account/keys` with the ORIGINAL key -- assert 401
    7. Re-create a key using the new key (to leave the tenant in a working state for other tests): `POST /v1/account/keys` -- store the new key hash

    **Test: "prevents revoking the last key"**
    1. This test needs its own setup: use the admin API to create a separate tenant with a single key
    2. Attempt `DELETE /v1/account/keys/{onlyKeyHash}` -- assert 409 (conflict, last-key guard)
    3. Cleanup: revoke the tenant's key via admin API

    **Important details:**
    - The key rotation test modifies auth state. It MUST re-create a working key and update the auth state file so subsequent tests still work. Since tests run sequentially (`workers: 1`), this ordering is deterministic.
    - **Recovery block required**: Wrap the key rotation steps in a try/finally that ensures a working key exists for the tenant even if the test fails mid-way (e.g., after revoking the original key but before creating a replacement). The finally block should use the admin API to create a recovery key if needed.
    - The `POST /v1/account/keys` endpoint returns `{ key: "wrl_live_...", keyHash: "abc..." }` -- the raw key is shown once.
    - The `DELETE /v1/account/keys/{keyHash}` endpoint uses the key hash (SHA-256 hex), not the raw key.
    - Account key endpoints require API key auth (Bearer token), not admin auth.
    - The `GET /v1/account/keys` response includes `[{ keyHash, name, scopes, createdAt }]` for each key.
    - Max 5 keys per tenant; admin scope is forbidden via account endpoints.
    - Be careful with admin rate limits (5 req/60s) -- the last-key test creates a separate tenant.

    ### What NOT to do
    - Do not leave the test tenant in a state where no valid API key exists
    - Do not modify source code in `src/`
    - Do not test OAuth or session endpoints

    ### Context
    - The admin API key is available via `process.env.E2E_ADMIN_KEY` (NOT in the auth state file -- read it directly from env)
    - `POST /v1/admin/keys` body: `{ tenantId, scopes: ['capture', 'read'], name: 'description' }`
    - The tenant ID pattern for the secondary tenant should be `e2e-kr-{timestamp}` to distinguish from the main test tenant
    - Rate limit: admin endpoints have 5 req/60s -- this test makes 2-3 admin calls for the secondary tenant

    ### Deliverables
    - `test/e2e/key-rotation.spec.js`

    ### Success Criteria
    - Key creation, verification, and revocation work end-to-end
    - Revoked key returns 401
    - Last-key guard returns 409
    - Main test tenant retains a working API key after the test

- **Deliverables**: `test/e2e/key-rotation.spec.js`
- **Success criteria**: Full key lifecycle works; last-key guard prevents lockout; test leaves tenant in working state

---

### Task 5: Test -- Batch Capture
- **Agent**: test-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |
    ## Task: E2E Test -- Batch Capture

    Write the P2 test that validates the batch capture endpoint.

    ### What to do

    Create `test/e2e/batch-capture.spec.js` with:

    **Test: "submits a batch of URLs and all complete"**
    1. Read auth state
    2. `POST /v1/captures/batch` with `{ urls: ["https://example.com?e2e=batch1-{ts}", "https://example.com?e2e=batch2-{ts}"] }` (2 URLs to keep it fast)
    3. Assert 207 response (multi-status)
    4. Assert response contains an `items` array with 2 entries, each having `id` and `status`
    5. Poll each capture individually via `GET /v1/captures/{id}/status` until terminal
    6. Assert both captures complete successfully (Playwright's `retries: 1` handles transient flakiness; the assertion itself should not mask silent failures)
    7. For each completed capture, verify via `GET /v1/verify/{id}` (JSON) that `verified: true`

    ### What NOT to do
    - Do not submit more than 2-3 URLs (each capture takes 10-30s of browser rendering time)
    - Do not test error cases for invalid URLs in batch (unit tests cover validation)
    - Do not modify source code in `src/`

    ### Context
    - `POST /v1/captures/batch` returns 207 with `{ items: [{ id, url, status }] }`
    - Batch endpoint does quota pre-check for the total count before accepting
    - Each capture processes independently through the queue
    - Use unique URLs per test run to avoid collisions with other test runs

    ### Deliverables
    - `test/e2e/batch-capture.spec.js`

    ### Success Criteria
    - Batch submission returns 207 with correct item count
    - Individual captures can be polled to completion
    - Completed captures pass verification

- **Deliverables**: `test/e2e/batch-capture.spec.js`
- **Success criteria**: Batch submission works; individual capture polling succeeds; verification passes

---

### Task 6: Test -- Quota Enforcement
- **Agent**: test-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |
    ## Task: E2E Test -- Quota Enforcement

    Write the P2 test that validates quota limits are enforced.

    ### What to do

    Create `test/e2e/quota-enforcement.spec.js` with:

    **Test: "enforces capture quota limits"**
    1. Use the admin API to create a SEPARATE test tenant `e2e-quota-{timestamp}` with `capturesPerMonth: 1` via `PUT /v1/admin/tenants/{tenantId}/config`
    2. Create an API key for this tenant via `POST /v1/admin/keys`
    3. Submit one capture with this tenant's key -- assert 202 (accepted)
    4. Wait for first capture to reach terminal state (poll status)
    5. Submit a second capture -- assert 429 response
    6. Assert the 429 response body includes:
       - `error.code` === `'capture_limit'` or similar
       - `quota.limit` === 1
       - `quota.used` >= 1
       - `quota.resetsAt` is a valid ISO timestamp
    7. Cleanup: revoke the test key via admin API `DELETE /v1/admin/keys/{keyHash}`

    ### What NOT to do
    - Do not use the main test tenant (it has elevated quotas)
    - Do not try to test storage quotas (only capture count quota)
    - Do not modify source code in `src/`

    ### Context
    - Admin endpoints have a 5 req/60s rate limit -- this test makes ~4 admin calls (create key, set config, delete key, possibly get usage). Space them carefully or accept small delays.
    - The 429 response body structure (from `src/index.js` lines 646-654):
      ```json
      {
        "error": { "code": "capture_limit", "message": "..." },
        "quota": { "limit": N, "used": N, "resource": "capturesPerMonth", "resetsAt": "ISO" }
      }
      ```
    - The tenant config endpoint is `PUT /v1/admin/tenants/{tenantId}/config` with body `{ quotas: { capturesPerMonth: 1 } }`
    - The first capture must reach terminal state before the second submission, because quota is checked on submission based on `usage_counters` which is incremented when the capture completes (or immediately on queue acceptance -- verify by reading the code)

    ### Deliverables
    - `test/e2e/quota-enforcement.spec.js`

    ### Success Criteria
    - First capture succeeds under quota
    - Second capture is rejected with 429
    - 429 response includes structured quota metadata
    - Test tenant is cleaned up

- **Deliverables**: `test/e2e/quota-enforcement.spec.js`
- **Success criteria**: Quota enforcement produces 429 with correct metadata; cleanup succeeds

---

### Task 7: Test -- Webhook Lifecycle (Ping + HMAC)
- **Agent**: test-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |
    ## Task: E2E Test -- Webhook Lifecycle (Ping + HMAC)

    Write the P3 test that validates webhook CRUD and the ping delivery mechanism.

    ### What to do

    Create `test/e2e/webhook-lifecycle.spec.js` with:

    **Test: "registers a webhook and validates ping delivery"**
    1. Read auth state
    2. `POST /v1/webhooks` with the test API key -- body: `{ url: "https://httpbin.org/post", events: ["capture.complete"], secret: "<generated-32-byte-hex>" }`
    3. Assert 201 response with `id` (format: `whk_...`) and `secret`
    4. `GET /v1/webhooks` -- assert the new webhook is in the list
    5. `POST /v1/webhooks/{id}/ping` -- assert response includes `success: true`, `httpStatus: 200`, `durationMs`
    6. Verify HMAC: the ping response includes delivery details. Extract the signature that was sent and verify it using the `verifyWebhookSignature` helper from `test/e2e/helpers/hmac.js`
    7. `DELETE /v1/webhooks/{id}` -- assert 204
    8. `GET /v1/webhooks` -- assert the webhook is no longer listed

    **Test: "ping detects delivery failure"**
    1. Register a webhook pointing to `https://httpbin.org/status/503` (httpbin returns 503)
    2. `POST /v1/webhooks/{id}/ping` -- assert response includes `success: false`, `httpStatus: 503`
    3. Clean up: `DELETE /v1/webhooks/{id}`

    ### Important notes on HMAC verification
    - The ping endpoint (`POST /v1/webhooks/:id/ping`) is synchronous -- it makes the HTTP request and returns the result directly
    - The ping response should include the delivery details: what was sent, what headers were used
    - If the ping response does NOT include the raw signature/headers (check `handlePingWebhook` in `src/webhooks.js`), then use `test.skip('ping response does not expose signature headers')` to make the gap visible. Do NOT silently pass the test without HMAC verification -- a green test that skipped the security-critical assertion is actively misleading. Also check if the delivery result stored in D1 includes the signature details that could be queried via admin API.
    - The webhook secret is generated by the test and passed at registration time. The WRL Worker uses this secret to sign deliveries.
    - Signature format: `X-WRL-Signature-256: t={timestamp},v1={hmac_hex}`
    - Signed payload: `"{timestamp}.{body}"`

    ### What NOT to do
    - Do not deploy a webhook test receiver Worker
    - Do not use webhook.site or any external service beyond httpbin.org
    - Do not test queue-based async retry delivery (unit tests cover retry logic)
    - Do not modify source code in `src/`

    ### Context
    - The `POST /v1/webhooks` endpoint requires API key auth
    - Webhook URL must be HTTPS (enforced by `validateWebhookUrl()`)
    - `httpbin.org/post` accepts POST and returns the request details as JSON (200)
    - `httpbin.org/status/503` returns a 503 status code
    - The ping endpoint handler is `handlePingWebhook` in `src/webhooks.js`
    - Webhook secret: generate with `crypto.randomBytes(32).toString('hex')` in the test

    ### Deliverables
    - `test/e2e/webhook-lifecycle.spec.js`

    ### Success Criteria
    - Webhook CRUD works (create, list, delete)
    - Ping to a healthy endpoint returns success
    - Ping to a failing endpoint returns failure with correct status
    - HMAC signature is verified (if ping response includes signing details) or explicitly skipped with `test.skip()`

- **Deliverables**: `test/e2e/webhook-lifecycle.spec.js`
- **Success criteria**: Webhook CRUD works; ping validates delivery; HMAC verified or explicitly skipped (never silently passed)

---

### Task 8: CI Workflow
- **Agent**: iac-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |
    ## Task: E2E Tests CI Workflow

    Create the GitHub Actions workflow for running the e2e test suite.

    ### What to do

    Create `.github/workflows/e2e-tests.yml` with:

    **Triggers:**
    - `workflow_run`: fires after "Deploy to Staging" workflow completes successfully on `main`
    - `workflow_dispatch`: manual trigger with optional `ref` input

    **Job: `e2e`**
    - Condition: skip if `workflow_run` triggered but conclusion is not `'success'`
    - `runs-on: ubuntu-latest`
    - `timeout-minutes: 10`
    - `environment: staging` (reuses existing staging environment secrets)
    - Steps:
      1. Checkout (use `inputs.ref || github.event.workflow_run.head_sha || github.sha`)
      2. Setup Node (use `.nvmrc`, cache `npm`)
      3. `npm ci`
      4. `npx playwright install --with-deps chromium` (only Chromium, no caching)
      5. Run tests: `npx playwright test --config=test/e2e/playwright.config.js`
         - Env vars: `E2E_BASE_URL` from `vars.WRL_STAGING_BASE_URL`, `E2E_ADMIN_KEY` from `secrets.WRL_STAGING_ADMIN_KEY`
      6. Upload HTML report (always, unless cancelled): `playwright-report/`, retention 14 days
      7. Upload traces (failure only): `test-results/`, retention 7 days

    **Permissions:** `contents: read` only

    **Action pinning:** Pin ALL actions to full commit SHAs, matching the pattern in existing workflows:
    - `actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683` (v4.2.2)
    - `actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020` (v4.4.0)
    - For `actions/upload-artifact`, look up the current v4 SHA -- verify against the tag before using

    **Important CI design decisions:**
    - E2e tests run IN PARALLEL with production deploy (both triggered by staging deploy success). E2e tests are a signal, not a gate for production.
    - Do NOT trigger on `pull_request` -- PR code is not deployed to staging, so e2e tests would test the wrong version.
    - Do NOT add `continue-on-error` -- force failures to be visible and investigated.
    - The workflow name MUST be "E2E Tests" (used in status badges and notifications).

    ### What NOT to do
    - Do not add browser caching steps
    - Do not add sharding configuration
    - Do not add secrets for webhook testing (the current tests use httpbin.org which needs no auth)
    - Do not add `CLOUDFLARE_API_TOKEN` (tests don't deploy anything)
    - Do not trigger on pull_request events

    ### Context
    - Existing workflows in `.github/workflows/` follow consistent patterns: SHA-pinned actions, `.nvmrc` for Node version, `npm ci` for install
    - The `deploy-staging.yml` workflow name is "Deploy to Staging" -- the `workflow_run` trigger must match this exactly
    - The staging environment already has: `WRL_STAGING_CAPTURE_API_KEY` and `WRL_STAGING_BASE_URL` (vars)
    - The `WRL_STAGING_ADMIN_KEY` secret needs to be added to the staging environment (documented in README, manual step)

    ### Deliverables
    - `.github/workflows/e2e-tests.yml`

    ### Success Criteria
    - Workflow triggers after successful staging deployment
    - Workflow can be triggered manually
    - All actions are SHA-pinned
    - Artifacts are uploaded correctly
    - Environment secrets are referenced properly

- **Deliverables**: `.github/workflows/e2e-tests.yml`
- **Success criteria**: Workflow triggers correctly; actions pinned; artifacts uploaded; environment scoped

---

### Task 9: Documentation
- **Agent**: test-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Tasks 1-8
- **Approval gate**: no
- **Prompt**: |
    ## Task: E2E Test Suite Documentation

    Write the README for the e2e test suite.

    ### What to do

    Create `test/e2e/README.md` covering:

    1. **Overview** -- what the e2e suite tests, how it differs from unit/integration tests (unit tests use miniflare bindings, e2e tests hit the real staging Worker over HTTP)

    2. **Prerequisites**
       - Environment variables: `E2E_BASE_URL`, `E2E_ADMIN_KEY`
       - How to get the admin key: `op item get "Staging" --vault WRL --reveal` (ADMIN_KEY field)
       - Node.js version (see `.nvmrc`)

    3. **Running locally**
       ```bash
       export E2E_BASE_URL=https://wrl-staging.benpeter.workers.dev
       export E2E_ADMIN_KEY=<from-1password>
       npm run test:e2e
       ```
       Note: running locally uses the same staging environment as CI

    4. **CI configuration**
       - Triggers: after successful staging deploy, or manual dispatch
       - Required GitHub secrets: `WRL_STAGING_ADMIN_KEY` (staging environment)
       - Artifacts: HTML report (14 days) and traces on failure (7 days)

    5. **Test structure**
       - Brief description of each test file and what it validates
       - Note that tests run sequentially (`workers: 1`) due to shared staging environment

    6. **Adding new tests**
       - Use unique URLs per test (`?e2e={testId}` pattern)
       - Read auth state from `.auth-state.json`
       - Keep per-test timeout at 60s
       - Admin API rate limit: 5 req/60s -- minimize admin calls

    7. **Troubleshooting**
       - How to view Playwright HTML reports and traces
       - Common failures: staging down (check `/health`), rate limited (wait 60s), capture timeout (increase poll timeout)
       - Orphaned test tenants: tenants prefixed `e2e-` can be cleaned up via admin API

    ### What NOT to do
    - Do not document features that don't exist (no scheduled captures, no share links)
    - Do not include sensitive secrets or keys
    - Do not document webhook.site or tunnel-based approaches (not implemented)

    ### Deliverables
    - `test/e2e/README.md`

    ### Success Criteria
    - A developer can set up and run the e2e tests locally by following the README
    - CI configuration is documented
    - Troubleshooting covers common failure modes

- **Deliverables**: `test/e2e/README.md`
- **Success criteria**: README enables local and CI execution; troubleshooting covers common failure modes

---

## Cross-Cutting Coverage

- **Testing**: This IS the testing task. test-minion is the primary agent for Tasks 1-7, 9.
- **Security**: Addressed in plan design. Dynamic test tenants with per-run API keys (security-minion recommendation adopted). No long-lived test credentials. Admin key scoped to GitHub staging environment with protection rules. No PR-triggered execution. HMAC signature verification included in webhook test. No production code added for testing purposes.
- **Usability -- Strategy**: ux-strategy-minion's verify page reframing and key rotation test adopted. ToS/welcome-redirect extensions excluded (require session auth not available in this suite). Quota enforcement assertions include structured error metadata per ux-strategy recommendation.
- **Usability -- Design**: Not applicable -- no user-facing UI is being built. The verify page browser test validates an existing page, not a new design.
- **Documentation**: Task 9 produces `test/e2e/README.md`. Phase 8 post-execution will assess whether additional docs are needed.
- **Observability**: Not applicable -- the test suite itself is not a runtime service. CI artifacts (HTML reports, traces) provide observability into test results. No new logging, metrics, or tracing needed.

## Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - None selected. The plan produces no user-facing UI (ux-design-minion excluded), no web-facing runtime code (sitespeed-minion excluded), no runtime components needing logging (observability-minion excluded), no changes to what end users see (user-docs-minion excluded), and no WCAG-relevant output (accessibility-minion excluded).
- **Not selected**:
  - ux-design-minion: Plan produces test infrastructure only, no UI components or visual layouts
  - accessibility-minion: No HTML/UI being created -- the verify page browser test validates existing markup
  - sitespeed-minion: No web-facing runtime code produced -- tests run in CI, not in browsers users access
  - observability-minion: No runtime services produced -- CI artifacts provide test result observability
  - user-docs-minion: End users do not interact with the test suite; the README is developer documentation

## Decisions

- **Webhook receiver approach**
  Chosen: httpbin.org + ping endpoint (no infrastructure)
  Over: Dedicated Cloudflare Worker with KV storage (api-design-minion); webhook.site SaaS (test-minion secondary recommendation)
  Why: The ping endpoint validates HMAC signing synchronously with zero infrastructure. Deploying a separate Worker with its own wrangler.toml, KV namespace, secrets, and deployment pipeline contradicts "lean and mean." The async delivery path through the queue is platform behavior (Cloudflare Queues) already tested by unit tests. If full async payload inspection is needed later, webhook.site can be added behind an env var flag.

- **Test count: 6 tests vs 9 tasks**
  Chosen: 6 test files, consolidating infrastructure into shared setup. Task 2 (golden path) stops at capture metadata + WACZ download; Task 3 owns all `/v1/verify/` assertions (browser + JSON + CORS + 404).
  Over: test-minion's original 9-task breakdown; earlier plan where Task 2 also tested verify endpoints (duplicating Task 3)
  Why: Clean separation of concerns. Golden path validates the capture lifecycle through download. Verify page validates the public evidence sharing journey. No assertion duplication between files.

- **Sequential execution**
  Chosen: `workers: 1` (sequential)
  Over: Parallel execution with per-test tenant isolation
  Why: 6 tests on a shared staging environment with real D1/R2/KV state. Parallel execution risks rate limit contention (5 admin req/60s), and the key rotation test modifies auth state. Sequential execution eliminates an entire category of flakiness for negligible time cost (~3 minutes vs ~2 minutes parallel).

- **No new production code**
  Chosen: Test against existing API surface only
  Over: Adding `POST /v1/admin/sessions` for session injection (security-minion T4)
  Why: YAGNI. The e2e suite tests what unit tests cannot (real HTTP, queue processing, R2 storage, cryptographic verification). All of these work with API key auth. Adding production code for testing creates maintenance burden and potential attack surface.

- **Scheduled captures: excluded**
  The original issue lists "scheduled capture creation -> cron trigger fires -> new capture appears" as a success criterion. This feature does not exist in the codebase -- there is no cron trigger handler in `src/`, no `[triggers]` section in `wrangler.toml`, and no scheduling API in the route table. The feature is in the project parking lot with `[consider]` status. It will be tested when (and if) the feature ships.

- **Webhook retry: narrowed to ping-based failure detection**
  The original issue asks for "retry on 5xx failure -> successful delivery on retry." The async retry path (Cloudflare Queue with backoff at 60s, 300s, 900s) exceeds the 5-minute test budget. The plan tests failure detection via ping (`POST /v1/webhooks/:id/ping` against `httpbin.org/status/503`), which validates that the Worker correctly detects and reports delivery failures. Queue retry logic is covered by unit tests (`test/webhooks.test.js`).

## Risks and Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Staging rate limits (admin: 5/60s) | Medium | Sequential execution; global setup makes <= 3 admin calls; quota test uses separate tenant with its own admin calls spaced out |
| Capture processing time (10-30s each) | Medium | Use `https://example.com` (fast); 60s per-test timeout; total suite budget is 5 minutes with 10-minute workflow timeout |
| Staging down or deploying | Medium | Health check in global setup; skip all tests with clear error if staging unreachable |
| Orphaned test tenants on CI crash | Low | `e2e-` prefix naming convention; periodic manual cleanup; staging data is inert after key revocation |
| `@playwright/test` + `@cloudflare/playwright` conflict | Low | Different npm package names; verify at install time; if conflict, add `--legacy-peer-deps` |
| webhook.site/httpbin.org unavailable | Low | httpbin.org only used for ping test (not data inspection); if down, ping test fails with clear network error; can be skipped via env var |
| Queue delivery latency variation | Low | Generous poll timeouts (60s per test); `retries: 1` in CI for transient flakiness |

## Execution Order

```
Batch 1 (parallel: none -- sequential gate):
  Task 1: Playwright Configuration and Test Infrastructure [APPROVAL GATE]

Batch 2 (parallel after Task 1 approval):
  Task 2: Capture and Verify
  Task 3: Public Evidence Verification
  Task 4: Account Key Rotation
  Task 5: Batch Capture
  Task 6: Quota Enforcement
  Task 7: Webhook Lifecycle

Batch 3 (after all tests):
  Task 8: CI Workflow

Batch 4 (after CI workflow):
  Task 9: Documentation
```

Note: Tasks 2-7 are all test spec files that can be written in parallel since they each own their own file. Task 8 (CI workflow) depends on the test infrastructure being final. Task 9 documents the final state.

## External Skills

No external skills detected in project.

## Verification Steps

1. **Local verification**: Run `npm run test:e2e` with `E2E_BASE_URL` and `E2E_ADMIN_KEY` set -- all 6 tests pass
2. **Dependency check**: `npm ls @playwright/test` shows it in devDependencies; `npm ls @cloudflare/playwright` still works
3. **CI dry run**: Push to a feature branch, manually trigger `e2e-tests.yml` via `workflow_dispatch` -- verify it runs against staging
4. **Artifact check**: After CI run, download HTML report and verify it contains results for all 6 tests
5. **Cleanup check**: After test run, verify the test tenant API key was revoked (attempt to use it, expect 401)
6. **Time budget**: Verify total test execution time is under 5 minutes
