## Domain Plan Contribution: security-minion

### Recommendations

#### (a) Dynamic test tenant via admin API -- RECOMMENDED for API key tests

This is the strongest approach for API-key-based test flows (capture, read, webhooks, quota).

**Security posture:** Only the staging `ADMIN_KEY` needs to be a GitHub Actions secret. This is a single infrastructure secret with a narrow blast radius -- it can only create/list/revoke keys on the staging Worker, which has isolated D1/R2/KV from production. The ADMIN_KEY already exists in the 1Password WRL vault (Staging item) and in Cloudflare's staging secret store.

**How it works:**
1. Test setup calls `POST /v1/admin/keys` with the staging ADMIN_KEY to create a test tenant (e.g., `e2e-{runId}`) and API key with `['capture', 'read']` scopes.
2. Tests use the returned `wrl_live_*` key for Bearer auth on all capture/read/webhook endpoints.
3. Test teardown calls `DELETE /v1/admin/keys/{keyHash}` to revoke the key.

**Security advantages:**
- Each CI run gets a unique, short-lived tenant ID and API key -- no credential reuse between runs.
- The raw API key never persists in 1Password or GitHub secrets beyond the run.
- If a CI log leak occurs, the exposed key is already revoked by teardown (or can be revoked by `keyHash`).
- Tenant isolation is inherent -- the test tenant's data is namespaced by `tenantId` in D1/R2.

**Required GitHub Actions secret:** `WRL_STAGING_ADMIN_KEY` (one secret).

**Risk:** If test teardown fails (CI runner crash, timeout), the key remains active in staging. Mitigation: add a periodic cleanup job or TTL-based key expiry in a future iteration. The blast radius is low -- staging has no production data, and the key scopes are limited to `capture` + `read`.

#### (b) Pre-provisioned test tenant -- ACCEPTABLE as fallback, not preferred

Store a dedicated test API key in GitHub Actions secrets (`WRL_E2E_API_KEY`).

**Security concerns:**
- The key is long-lived -- it persists across all CI runs indefinitely.
- If leaked (CI log exposure, GitHub secret exfiltration), it grants indefinite staging access until manually rotated.
- Key rotation requires manual 1Password + GitHub secret update -- operational burden.
- No automatic cleanup of test data tied to this key.

**When acceptable:** As a bootstrapping shortcut before the dynamic approach is built. Not recommended as the long-term solution.

#### (c) OAuth tests -- use a dedicated GitHub test account, NOT `_githubFetch` mock

**Critical finding:** The `env._githubFetch` injection point (oauth.js line 80-82) only works for in-process unit tests via Miniflare/`unstable_dev`. When tests hit the real staging Worker over HTTPS (which is the whole point of e2e tests), the Worker's runtime does NOT expose `_githubFetch` -- it uses the real `fetch` to call GitHub. There is no way to inject a mock into a deployed Worker.

**Recommended approach for OAuth e2e tests:**

1. **Create a dedicated GitHub test account** (e.g., `wrl-e2e-bot`) with a known, stable GitHub user ID. This account only needs to exist -- it does not need repos, org membership, or any permissions beyond basic `read:user` scope.

2. **OAuth flow execution in Playwright:** The test navigates to `/auth/login`, which redirects to GitHub. Playwright logs into the `wrl-e2e-bot` GitHub account and authorizes the staging OAuth App (`Ov23li0lii7I7Y43lbUs`). The callback redirects back to staging, creating a session.

3. **Required GitHub Actions secrets for OAuth tests:**
   - `WRL_E2E_GITHUB_USERNAME` -- the test account login
   - `WRL_E2E_GITHUB_PASSWORD` -- the test account password
   - `WRL_E2E_GITHUB_TOTP_SECRET` -- if MFA is enabled on the test account (and it SHOULD be -- see below)

**Security requirements for the GitHub test account:**
- **Enable MFA** (TOTP) on the test account. Store the TOTP seed in GitHub Actions secrets so Playwright can compute the code. This prevents the account from being usable by anyone who obtains only the username/password.
- **Do NOT reuse any personal GitHub account.** The OAuth flow grants `read:user` scope -- if the test account's token leaks, the exposure is limited to reading the test bot's (empty) profile.
- **The staging OAuth App (`Ov23li0lii7I7Y43lbUs`) must have its callback URL set to the staging Worker URL.** Verify this is correctly configured -- a misconfigured callback URL is the most common OAuth test failure.
- **Pre-authorize the OAuth App** for the test account (optional -- Playwright can handle the authorization prompt, but pre-authorization reduces flakiness).

**Alternative: Skip real OAuth e2e and rely on session injection.** If maintaining a GitHub test account is too much operational burden, the tests could directly seed a session into staging D1 using the admin API (if an admin endpoint for session creation exists, or is added). This bypasses the actual GitHub OAuth flow but still tests all session-authenticated endpoints. The OAuth flow itself is already covered by unit tests with `_githubFetch` mocks. This is a valid trade-off: the OAuth redirect/callback/PKCE logic has strong unit test coverage, and the e2e tests focus on what cannot be unit-tested (real HTTP through Cloudflare's stack, D1 latency, queue processing, R2 storage).

**My recommendation:** Start with session injection via admin API (add a `POST /v1/admin/sessions` endpoint scoped to ADMIN_KEY) for v1. Add real OAuth e2e tests later if the OAuth flow proves fragile in production. The unit test coverage for OAuth is already excellent.

#### (d) Webhook test receiver -- security requirements

**Webhook secret management:**

A **static test secret is acceptable for staging.** Here is the reasoning:

- The webhook secret is per-webhook, not per-environment. Each test run can register a new webhook with a unique secret via `POST /v1/webhooks`. The HMAC signing uses the registered secret (stored in D1), so every test run naturally gets a fresh signing key if the test creates a new webhook.
- Rotation per run is free if using approach (a): the test setup creates a webhook with a generated secret, and teardown deletes it.
- The secret never leaves the staging environment -- it is sent once in the 201 response when the webhook is registered, then stored in D1 for HMAC signing. The test receiver needs it to verify signatures.

**Webhook receiver implementation requirements:**

1. **HMAC signature verification is mandatory.** The receiver MUST verify `X-WRL-Signature-256` using the Stripe-model scheme: reconstruct `signed_payload = "${timestamp}.${body}"`, compute HMAC-SHA256, compare. If verification fails, the test MUST fail -- this validates the entire signing pipeline end-to-end.

2. **Timestamp validation:** The receiver should verify the `X-WRL-Timestamp` header is within a reasonable window (e.g., 5 minutes). This tests that the Worker is sending valid timestamps. For e2e tests, the window can be generous (300s) since we control both sides.

3. **The receiver must be HTTPS** -- `validateWebhookUrl()` in webhooks.js enforces HTTPS-only for webhook targets. Options:
   - **Cloudflare Workers test receiver:** Deploy a tiny Worker that accepts POST, verifies HMAC, stores payloads in KV, and exposes a GET endpoint for the test to poll. This is the cleanest approach -- same platform, auto-HTTPS, no infrastructure to manage.
   - **Publicly routable tunnel (e.g., Cloudflare Tunnel, ngrok):** More operational overhead, but lets the test runner directly receive webhooks. Security concern: tunnels expose a local port to the internet for the test duration. If used, the tunnel must be ephemeral (created/destroyed per test run) and the receiver must validate HMAC before accepting.
   - **Public HTTPS endpoint on a test domain:** A static receiver at e.g., `https://e2e-hooks.webresourceledger.com` backed by a simple Worker or serverless function. Persistent, no tunnel flakiness.

4. **SSRF validation at delivery time:** The webhook dispatch code (webhook-dispatch.js line 273) re-validates the URL for SSRF at delivery time. The test receiver's hostname must NOT resolve to a private IP range, or the delivery will be silently blocked. A Cloudflare Worker or public endpoint satisfies this constraint naturally.

5. **The receiver must handle retries idempotently.** The queue has `max_retries: 3` -- if the receiver is slow or returns 5xx, the same payload will be delivered again. The test should assert that at least one delivery succeeds, not that exactly one delivery occurs.

6. **Payload confidentiality:** The webhook payload contains `captureId`, `url`, and `status` -- no secrets, but the captured URL could be considered sensitive. The test receiver should not log payloads to any persistent external system. A Cloudflare Worker using in-memory state or short-TTL KV is appropriate.

### Proposed Tasks

#### T1: Add `WRL_STAGING_ADMIN_KEY` to GitHub Actions repository secrets
- Source from 1Password WRL vault, Staging item, `ADMIN_KEY` field.
- Scope to the `staging` GitHub environment (not globally available to all workflows).
- **Security gate:** Verify the staging environment has required reviewers configured, so the secret is not exposed to arbitrary PRs.

#### T2: Implement test tenant lifecycle (setup/teardown)
- `globalSetup`: call `POST /v1/admin/keys` with admin key to create test tenant `e2e-{runId}`.
- Store returned API key and keyHash in a shared state file (NOT in env vars -- those leak to child processes).
- `globalTeardown`: call `DELETE /v1/admin/keys/{keyHash}` to revoke.
- Implement a timeout-safe teardown: if the test suite is killed, the key remains. Add a comment documenting this accepted risk.

#### T3: Implement webhook test receiver (Cloudflare Worker)
- A minimal Worker that:
  - Accepts POST at `/hook/{runId}` -- the `{runId}` segment prevents cross-run interference.
  - Verifies HMAC-SHA256 signature using a secret passed at webhook registration.
  - Stores verified payloads in KV with a 1-hour TTL under key `delivery:{runId}:{deliveryId}`.
  - Exposes `GET /hook/{runId}/deliveries` for the test to poll.
  - Returns 401 on HMAC failure (triggering retry, which the test can also assert).
- Deploy as `wrl-e2e-hooks` Worker in the same Cloudflare account.
- The webhook secret is generated per test run and passed to both the webhook registration and the receiver (via a KV key set in global setup).

#### T4: OAuth test strategy decision
- **Recommended for v1:** Add `POST /v1/admin/sessions` endpoint (ADMIN_KEY-authenticated) that creates a session for a given tenantId without requiring GitHub OAuth. This is test-only infrastructure -- guard it behind ADMIN_KEY and log at severity 4 (`admin.session_create`).
- **Alternative (v2):** Create `wrl-e2e-bot` GitHub account, configure MFA, store TOTP seed in GitHub Actions secrets, implement Playwright GitHub login helper.
- The e2e tests can then test all session-authenticated endpoints (account keys, usage, ToS, first-key) via the admin-created session.

#### T5: Staging environment protection in GitHub
- Verify the `staging` GitHub environment has **required reviewers** enabled. This is critical because the e2e workflow will have access to `WRL_STAGING_ADMIN_KEY`.
- Without required reviewers, any PR can modify the workflow file to exfiltrate secrets.
- Set up **deployment branch restrictions** to limit which branches can use the staging environment.

#### T6: Test data cleanup strategy
- Each test run uses a unique tenant ID (`e2e-{runId}`) for data isolation.
- D1 data (captures, api_keys, webhooks, usage_counters) is scoped by tenant ID.
- R2 objects are prefixed by tenant ID (verify this in the capture pipeline).
- KV entries are prefixed by tenant ID (verify first_key, rate limits).
- After the test suite, the teardown should revoke all API keys for the test tenant.
- D1/R2/KV data for test tenants does not need immediate cleanup -- it is inert after key revocation. Add a periodic cleanup script if accumulation becomes a concern.

#### T7: CI secret hygiene audit
- Verify no test step echoes or logs the API key, admin key, or session cookie.
- Set `PLAYWRIGHT_HEADED=false` in CI (headless mode -- no screenshots of login forms).
- If Playwright trace recording is enabled, verify traces are uploaded to a private artifact bucket, not a public one.
- Add `::add-mask::` for all secrets in the workflow to prevent accidental log exposure.

### Risks and Concerns

#### RISK-1: Staging admin key in CI (Medium likelihood, High impact)
If the `WRL_STAGING_ADMIN_KEY` is exposed via CI logs, an attacker can create unlimited API keys on staging, potentially:
- Exhausting staging resources (R2 storage, D1 rows, queue messages).
- Using staging as an SSRF proxy (the capture pipeline fetches arbitrary URLs).

**Mitigation:** GitHub environment protection rules (required reviewers, branch restrictions). Never log the admin key. Use `::add-mask::` in workflow. Rate limiter on admin endpoints (`ADMIN_RATE_LIMITER`, 5 req/60s) provides a natural ceiling. Staging has no production data.

**Detection:** Monitor Coralogix for unexpected `admin.key_create` events on the staging application.

#### RISK-2: Orphaned test data accumulation (High likelihood, Low impact)
If CI teardown fails (runner crash, timeout, OOM), test tenants and their data persist in staging D1/R2/KV. Over months, this could:
- Inflate D1 row counts and R2 object counts.
- Make staging metrics unreliable.

**Mitigation:** Use deterministic tenant ID format (`e2e-{timestamp}` or `e2e-{runId}`). Add a weekly cron job or manual script that deletes tenants matching `e2e-*` older than 24 hours. The admin API already supports listing keys by tenant filter.

#### RISK-3: OAuth test account credential management (Medium likelihood, Medium impact)
If the `wrl-e2e-bot` GitHub account credentials are stored in GitHub Actions secrets and the account has MFA disabled, a secret exfiltration gives full GitHub account access.

**Mitigation:** Enable TOTP MFA on the test account. Store the TOTP seed as a separate secret. The account should have zero repositories, zero org memberships, and zero tokens beyond the OAuth flow. Prefer the admin session injection approach (T4) to avoid this risk entirely.

#### RISK-4: Webhook receiver as attack surface (Low likelihood, Medium impact)
The e2e webhook receiver Worker accepts POST requests from the internet. If it does not validate HMAC signatures, it could be used to inject false test results or store arbitrary data.

**Mitigation:** HMAC verification on every request. RunId-scoped endpoints prevent cross-run interference. 1-hour KV TTL limits data accumulation. No sensitive data in webhook payloads.

#### RISK-5: Rate limiters interfere with test execution (High likelihood, Low impact)
Staging has the same rate limiters as production (`ADMIN_RATE_LIMITER` at 5/60s, `CAPTURE_RATE_LIMITER` at 100/60s, `AUTH_RATE_LIMITER` at 10/60s). A fast test suite could trip these limits.

**Mitigation:** Design tests with delays between admin API calls. The admin limiter at 5/60s is the tightest constraint -- test setup should make at most 2-3 admin calls (create key, optionally create session). If needed, increase staging rate limits separately from production.

#### RISK-6: PR-triggered workflows accessing staging secrets (High likelihood, High impact)
If the e2e workflow runs on `pull_request` events, fork PRs can modify the workflow to exfiltrate secrets. GitHub does not expose environment secrets to fork PRs by default, but misconfigurations happen.

**Mitigation:** The e2e workflow should ONLY run on `push` to `main` (post-merge) or `workflow_dispatch`, NOT on `pull_request`. This matches the existing `deploy-staging.yml` pattern. If pre-merge e2e is desired, use `pull_request_target` with explicit SHA checkout (not the PR head) -- but this is fragile and not recommended.

### Additional Agents Needed

- **iac-minion** -- to implement the webhook test receiver Worker (wrangler.toml, deployment, KV namespace), and to configure GitHub environment protection rules for staging.
- **test-minion** -- to implement the Playwright test fixtures (global setup/teardown, tenant lifecycle, webhook polling helpers, HMAC verification in the receiver).
