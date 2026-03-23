# Phase 4 Execution Prompt: Task 1 - Playwright Configuration and Test Infrastructure

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
   - `verifyWebhookSignature(payload, signatureHeader, secret)` that:
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
