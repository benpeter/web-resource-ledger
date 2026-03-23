## Domain Plan Contribution: api-design-minion

### Recommendations

#### 1. Webhook Receiver: Deploy a dedicated Cloudflare Worker (Option 1)

**Recommendation: A lightweight Cloudflare Worker deployed as `wrl-webhook-test-receiver`.**

Rationale by elimination:

- **Option 2 (webhook.site / SaaS):** Rejected. Introduces an external dependency that can break CI at any time. webhook.site rate-limits free usage, has unpredictable latency, and provides no way to return configurable HTTP status codes on specific attempts. The test would be at the mercy of a third-party's availability and API stability. This violates the "ops reliability wins" principle.

- **Option 3 (ngrok/cloudflared tunnel):** Rejected. Tunnels require a local server process to be running on the CI runner, which means the Playwright test process must also manage a server lifecycle. GitHub Actions runners don't have persistent IPs, tunnel setup adds 5-15 seconds of flaky startup time, and both ngrok and cloudflared have their own auth/token requirements. This introduces operational complexity and a fragile setup/teardown sequence.

- **Option 1 (Cloudflare Worker):** Best fit. The project already deploys Cloudflare Workers (WRL itself). A test receiver Worker is:
  - Always available (no startup, no tunnel)
  - Sub-millisecond latency (same Cloudflare network as the staging Worker)
  - Configurable behavior via query params or headers (fail-then-succeed)
  - Zero additional infrastructure (uses the same `wrangler` toolchain)
  - Fully under our control (no SaaS dependency)
  - HTTPS by default (satisfies `validateWebhookUrl` HTTPS-only constraint)

**Proposed Worker design:**

```
POST https://wrl-test-receiver.benpeter.workers.dev/hook/:sessionId
```

The receiver Worker uses a simple state model backed by a Cloudflare KV namespace:

- **Session ID**: A random string generated per test run. Namespaces deliveries so parallel test runs don't collide.
- **Configurable failure**: The test creates a session with a "fail count" parameter. The receiver returns 503 for the first N requests to that session, then 200 for subsequent ones.
- **Payload storage**: Each received delivery is stored in KV keyed by `{sessionId}:{deliveryIndex}`, with the full headers and body preserved.
- **Retrieval endpoint**: `GET /session/:sessionId/deliveries` returns all stored deliveries for assertion in the Playwright test.

API surface:

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/session` | Create a test session. Body: `{ "failCount": 1 }`. Returns `{ "sessionId": "...", "url": "https://wrl-test-receiver.../hook/{sessionId}" }` |
| `POST` | `/hook/:sessionId` | Receive webhook deliveries. Returns 503 for first N attempts (per session config), then 200. Stores each delivery in KV. |
| `GET` | `/session/:sessionId/deliveries` | Retrieve all deliveries for the session, ordered by receipt time. Returns `{ "deliveries": [{ "headers": {...}, "body": {...}, "receivedAt": "...", "statusReturned": 503 }, ...] }` |
| `DELETE` | `/session/:sessionId` | Cleanup. Removes session config and all stored deliveries from KV. |

**Security considerations:**
- The receiver should be restricted to only accept requests from known sources. A simple shared secret in a header (`X-Test-Auth: <token>`) on the session management endpoints (POST /session, GET /deliveries, DELETE) is sufficient. The `/hook/:sessionId` endpoint must remain open since the WRL Worker will POST to it without test auth.
- Session IDs should be cryptographically random (UUID v4) so they cannot be guessed.
- KV entries should have a TTL (e.g., 1 hour) so leaked sessions auto-expire.
- The Worker should have its own wrangler.toml in a `test/e2e/webhook-receiver/` directory or similar.

#### 2. HMAC Signature Verification: Verify client-side in Playwright

**Recommendation: The test receiver should NOT validate HMAC signatures. Store the raw delivery (headers + body) and let the Playwright test verify the signature itself.**

Rationale:
- The receiver's job is to be a dumb sink that stores what it receives. Adding verification logic duplicates the signing code and creates a second place where signing bugs could hide.
- The Playwright test already has access to the webhook secret (it created the webhook registration and received the secret in the 201 response). It can recompute `HMAC-SHA256(secret, "${timestamp}.${body}")` and compare against `X-WRL-Signature-256`.
- This follows the Stripe testing model: their test suite verifies signatures on the client side, not in the receiver.
- The test assertion is more explicit and debuggable: if verification fails, the test can log the expected vs actual signature, the timestamp, and the exact body bytes.

**Verification flow in the test:**
1. Create webhook via `POST /v1/webhooks` -- capture the `secret` from the 201 response.
2. Trigger a capture that will complete (or fail).
3. Poll the test receiver's `GET /session/:sessionId/deliveries` until a delivery arrives.
4. Extract `X-WRL-Signature-256` header (format: `t={timestamp},v1={hex}`).
5. Extract `X-WRL-Timestamp` header.
6. Recompute: `HMAC-SHA256(secret_key_bytes, "{timestamp}.{body_string}")`.
7. Assert `v1` from the header matches the computed hex digest.
8. Assert timing: `timestamp` is within a reasonable window of `Date.now()`.

This means the Playwright test needs a small helper function that mirrors `signWebhookPayload` from `src/webhook-signing.js`. Since the e2e test runs in Node.js (Playwright), it can use `node:crypto` directly. Alternatively, import `signWebhookPayload` from the source -- but that couples the test to the source. A standalone 10-line HMAC function is better for an e2e test that should be independent.

#### 3. Critical Constraint: Testing Retry Without Real Queue Delays

**The 5-minute test budget makes it impossible to test real queue retries (60s + 300s + 900s = 21 minutes minimum).**

This is the hardest design question. Here are the options, ranked:

**Option A (Recommended): Test first-delivery behavior only; assert retry intent from the delivery record.**

Do NOT test actual queue retry in e2e. Instead:
1. Configure the test receiver to fail with 503 on the first attempt.
2. Observe that the first delivery arrives and is stored with `statusReturned: 503`.
3. The test trusts that Cloudflare Queues will retry (this is platform behavior, not application code). The retry schedule is tested in the unit tests (`webhookRetryDelay` is already thoroughly tested in `test/webhook-dispatch.test.js`).
4. Separately, configure the receiver to succeed on first attempt in a second scenario, and verify the payload and HMAC signature on the successful delivery.

What the e2e test actually proves:
- The full pipeline works: capture -> queue -> dispatch -> HTTP POST to external URL
- The HMAC signature is valid (end-to-end signing verification)
- The payload structure matches the contract (event type, captureId, verificationUrl, etc.)
- The receiver gets the correct headers (Content-Type, User-Agent, X-WRL-Event, X-WRL-Delivery, X-WRL-Timestamp, X-WRL-Signature-256)

What the unit tests already prove (and e2e should not re-prove):
- Retry schedule delays are correct (60, 300, 900)
- 5xx triggers retry, 4xx (except 408/429) does not
- DLQ handling works
- Deleted-webhook-since-enqueue is handled

This is the right tradeoff. The e2e test exercises the integration boundary (actual HTTP POST to an external endpoint with real signing). The unit tests exercise the retry logic. Trying to test both in e2e would make the test slow, flaky, and dependent on queue timing.

**Option B (If retry testing is non-negotiable): Use the ping endpoint as a proxy.**

The `POST /v1/webhooks/:webhookId/ping` endpoint performs a synchronous delivery (no queue involved). The test could:
1. Configure receiver to return 503.
2. Ping -> assert `{ success: false, httpStatus: 503 }` in the response.
3. Configure receiver to return 200.
4. Ping -> assert `{ success: true, httpStatus: 200 }`.

This tests the delivery path (signing, HTTP POST, error classification) without queue delays. It does not test actual retry, but it tests the fail/succeed behavior end-to-end.

**Option C (Avoid): Reduce retry delays for staging.**

One could set shorter retry delays via env vars for the staging Worker. This is dangerous: it creates a divergence between staging and production behavior, and the retry schedule is hardcoded in `webhookRetryDelay()` (not configurable). Making it configurable just for testing violates YAGNI and introduces a footgun where staging tests pass but production fails.

**Final recommendation: Combine Option A and Option B.** The e2e test should:
1. Create a webhook pointing to the test receiver (configured to succeed).
2. Trigger a capture and wait for it to complete.
3. Poll the test receiver until the webhook delivery arrives.
4. Verify the payload structure and HMAC signature.
5. As a separate assertion, use the ping endpoint to verify fail/succeed behavior: configure the receiver to fail once, ping (assert failure response), then ping again (assert success response).

This covers both the real delivery path AND the fail/succeed scenario, all within seconds.

#### 4. Webhook URL and SSRF Considerations

The staging Worker runs `validateWebhookUrl()` at registration time, which includes SSRF checks and HTTPS-only enforcement. The test receiver URL (`https://wrl-test-receiver.benpeter.workers.dev/hook/{sessionId}`) will pass both checks naturally since:
- It is HTTPS (Workers get TLS by default)
- `workers.dev` resolves to Cloudflare IPs (not private ranges)

No special SSRF bypass is needed.

### Proposed Tasks

1. **Create the webhook test receiver Worker**
   - New directory: `test/e2e/webhook-receiver/` (or `tools/webhook-receiver/`)
   - `wrangler.toml` with a KV namespace binding for delivery storage
   - Worker code implementing the 4-endpoint API surface described above
   - Session management with TTL-based auto-expiry
   - Configurable fail count per session
   - Deploy to `wrl-test-receiver.benpeter.workers.dev`

2. **Deploy the receiver to Cloudflare**
   - Create KV namespace for test delivery storage
   - Generate and store a test auth token as a Worker secret
   - Verify the Worker is reachable and returns 200 on a health check

3. **Write the webhook e2e test in Playwright**
   - Test helper: create session on receiver, return webhook URL
   - Test helper: poll receiver for deliveries with timeout
   - Test helper: HMAC signature verification (standalone, not imported from src)
   - Test scenario 1: capture.complete -> webhook delivered -> verify payload + HMAC
   - Test scenario 2: ping with 503 receiver -> assert failure -> ping with 200 receiver -> assert success
   - Test teardown: delete session, delete webhook registration

4. **Add receiver deployment to CI**
   - The receiver Worker should be deployed once (not per-test-run). It is a long-lived test fixture.
   - CI workflow needs the receiver URL and auth token as secrets.
   - Consider a health-check step in the e2e workflow that verifies the receiver is up before running tests.

5. **Store receiver secrets in 1Password WRL vault**
   - `TEST_RECEIVER_AUTH_TOKEN` for session management endpoints
   - Add to CI as `E2E_WEBHOOK_RECEIVER_TOKEN` secret

### Risks and Concerns

1. **KV eventual consistency**: Cloudflare KV has eventual consistency (writes may take up to 60 seconds to propagate globally). Since both the staging Worker and the test receiver run on Cloudflare's network, the write-then-read gap should be minimal (same region). However, the Playwright test should poll with retries rather than assuming immediate availability when calling `GET /session/:sessionId/deliveries`. A 1-2 second poll interval with a 30-second timeout is appropriate.

2. **Parallel test run collisions**: If multiple CI runs execute simultaneously, they must not interfere. Session IDs (UUID v4) provide natural isolation. No shared state between sessions.

3. **Stale KV entries**: If a test fails mid-run and doesn't clean up, stale sessions accumulate. The 1-hour TTL on KV entries handles this automatically.

4. **Queue delivery timing**: Even without retry delays, the first delivery from the Cloudflare Queue is not instant. The `max_batch_timeout` is 5 seconds for the webhook queue, meaning the queue consumer may wait up to 5 seconds before processing. Combined with capture processing time, the test should budget 30-60 seconds for the webhook delivery to arrive after triggering a capture.

5. **Webhook URL length and session ID**: The full URL (`https://wrl-test-receiver.benpeter.workers.dev/hook/{uuid}`) is well within URL length limits and passes `validateWebhookUrl` checks. No concern here.

6. **Test receiver availability**: The test receiver Worker is a dependency for the e2e test suite. If it goes down (unlikely for a Workers deployment, but possible during a Cloudflare incident), all webhook e2e tests fail. The health-check step in CI will surface this clearly rather than producing confusing test failures.

7. **Cost**: The test receiver Worker and KV namespace fall well within Cloudflare's free tier for Workers (100K requests/day) and KV (100K reads/day, 1K writes/day). Test runs will generate maybe 10-20 requests per run.

### Additional Agents Needed

None. The test receiver Worker is simple enough (4 endpoints, KV storage, no complex logic) that it doesn't require additional specialist input beyond what the implementation agent can handle with these design specifications.
