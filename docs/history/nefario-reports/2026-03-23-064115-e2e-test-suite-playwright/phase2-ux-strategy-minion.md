# Domain Plan Contribution: ux-strategy-minion

## Recommendations

### (a) Signup-through-Verification: Accuracy of the Onboarding Journey

The proposed test (Test 1) captures the *API-first* onboarding journey accurately, but it conflates two distinct user populations and misses a critical "moment of truth."

**The actual flow in code:**

1. `GET /auth/login` -- generates PKCE state, redirects to GitHub
2. GitHub authorization (external) -- user grants `read:user` scope
3. `GET /auth/callback` -- exchanges code, creates tenant (`gh-{githubId}`), generates first API key, stores in KV (TTL 1hr), creates session, redirects to `/ui?flow=welcome`
4. `GET /v1/account/first-key` (session-gated) -- returns raw key (show-once, deletes from KV on read)
5. User stores key and begins making captures

**What the test gets right:** The happy path from OAuth through first-key retrieval to first capture is the correct sequence. Polling until complete, verifying the signature, and downloading the WACZ covers the full value delivery chain.

**What the test should also validate:**

- **The "welcome" redirect.** New users land at `/ui?flow=welcome`, returning users at `/ui`. This is a deliberate UX fork (line 404 of oauth.js). The test should assert this redirect target for new signups -- it is the first signal to the user that the system recognized them.
- **Show-once key semantics.** The first key has TTL 1 hour and is deleted on read. A second `GET /v1/account/first-key` should return 404. This is a critical UX invariant -- if it fails, the user sees their key twice (confusion) or never (lockout).
- **ToS gate.** After signup, account endpoints (except `first-key` and `tos`) return 403 until ToS is accepted via `POST /v1/account/tos`. The test should include this step; it is a real friction point users will encounter.

**Recommendation:** Keep Test 1 but extend it to assert the welcome redirect, ToS acceptance, show-once key behavior, and the full capture-through-verification chain. This single test becomes the "golden path" that validates the entire new-user onboarding journey. It will be the longest test but also the most valuable.

### (b) "Share Link" Test: Reframing Around the Real User Job

The proposed Test 6 names a feature that does not exist ("share link generation API"). But the *job* it describes is real and already served: a user who has captured evidence needs to share proof with a third party who has no WRL account.

**How this job is actually accomplished today:**

1. The capture URL `GET /v1/verify/{captureId}` is public -- no auth required (line 1367-1368 of index.js: "Public endpoint -- no authentication. Rate-limited per IP.")
2. When a browser requests this URL (Accept: text/html), it returns a full HTML verification page
3. The page's client-side JS fetches verification data from `/v1/verify/{id}` (JSON) and capture metadata from `/v1/captures/{id}` (also public, ID-as-secret model)
4. The page renders: verified/unverified banner, capture metadata, screenshot, verification checks, cryptographic details, and a CLI verify command

**The right test for this job:** Verify that `/v1/verify/{captureId}` serves the public verification page without authentication, that the page loads and renders a verification result (verified or failed), and that the signature validation data is present. This is the "evidence sharing" journey -- the user copies a URL and sends it to an opposing party, regulator, or colleague.

**Specific assertions to include:**
- `GET /v1/verify/{captureId}` with `Accept: text/html` returns 200 with HTML
- `GET /v1/verify/{captureId}` with `Accept: application/json` returns 200 with `verified: true`, `checks`, `signing` fields
- The JSON response includes `Access-Control-Allow-Origin: *` (enables embedding in third-party tools)
- No auth headers or cookies are required in either request
- A nonexistent capture ID returns 404 (not a different error that leaks info)

**Rename the test** from "Share link generation" to "Public evidence verification" or "Third-party verification" to match the actual user job.

### (c) Missing User Journeys

The proposed six tests have significant coverage gaps. Mapping against the actual route table and user jobs reveals three missing journeys that exercise critical "moments of truth":

**1. Account Key Management (HIGH PRIORITY -- missing entirely)**

After initial signup, the second most important self-serve journey is key rotation. The account API supports:
- `GET /v1/account/keys` -- list active keys
- `POST /v1/account/keys` -- create new key (max 5, admin scope forbidden)
- `DELETE /v1/account/keys/{keyHash}` -- revoke key (last-key guard prevents lockout)

This journey covers: creating a second key, verifying both work for captures, revoking the original, verifying the revoked key is rejected, and verifying the last-key guard (cannot revoke your only key).

**Why this matters from a JTBD perspective:** "When I suspect my API key has been compromised, I want to rotate it without downtime, so I can maintain security without losing access." This is a must-be feature (Kano) -- its failure is catastrophic (permanent lockout or security breach). The last-key guard is a safety constraint (Norman) that prevents a user error that cannot be undone.

**2. Web UI Dashboard Flow (MEDIUM PRIORITY -- partially overlapping with Test 1)**

The `/ui` endpoint serves an HTML dashboard that uses session auth (not API key) for capture submission. The dual-auth system (`verifyAuth` at line 30 of index.js) means the same capture endpoint works via both session cookies (web UI) and API keys (programmatic). A test should verify that a session-authenticated user can submit a capture through the web-facing route without providing an API key header.

**Why this matters:** This is likely the primary interface for non-developer users. If dual-auth breaks, the web UI silently fails while the API continues working -- a silent degradation that would go undetected by API-only tests.

**3. Webhook Lifecycle (ALREADY PROPOSED as Test 4 -- but needs adjustment)**

Test 4 proposes webhook delivery retry, which is correct. But the prerequisite -- webhook CRUD -- is not tested:
- `POST /v1/webhooks` -- create webhook (requires API key auth)
- `GET /v1/webhooks` -- list webhooks
- `DELETE /v1/webhooks/{id}` -- delete webhook
- `POST /v1/webhooks/{id}/ping` -- test delivery

The test should start with webhook creation, verify it fires on capture completion, then clean up.

### (d) Priority Ranking by "Moment of Truth" Impact

Ranking tests by how close they are to the moments where user trust is built or destroyed, and noting which are feasible within a 5-minute budget:

| Priority | Test | Moment of Truth | Time Estimate | Cut? |
|----------|------|-----------------|---------------|------|
| **P0** | **Signup -> First Capture -> Verify** (Test 1, extended) | "Does this product actually work?" First value delivery. If this fails, nothing else matters. | 60-90s | NEVER CUT |
| **P1** | **Public Evidence Verification** (Test 6, reframed) | "Can I share proof with someone who doesn't have an account?" This is the core value proposition -- evidence that a third party can independently verify. | 15-20s | Keep |
| **P1** | **Account Key Rotation** (NEW) | "Can I rotate my keys without getting locked out?" Security hygiene, must-be feature. | 20-30s | Keep |
| **P2** | **Quota Enforcement** (Test 5) | "What happens when I hit a limit?" Error UX defines trust. The 429 response with `limitType: quota` and upgrade guidance is a designed experience. | 15-20s | Keep if time |
| **P2** | **Batch Capture** (Test 2) | "Can I capture multiple URLs efficiently?" Power-user workflow. 207 multi-status response is non-trivial to get right. | 30-40s | Keep if time |
| **P3** | **Webhook Delivery + Retry** (Test 4) | Integration feature for automation users. Important but secondary to core capture-verify loop. | 40-60s | Cut first |
| **DROP** | **Scheduled Captures** (Test 3) | Feature does not exist. Explicitly in Parking Lot with `[consider]` status and no activation trigger met. Do not test. | N/A | Drop |

**Total estimated time for P0+P1+P2:** 140-200 seconds (well within 5 minutes)
**Total with P3:** 180-260 seconds (still fits, but tight)

**Recommendation:** Implement P0 + P1 first. These three tests cover the complete new-user journey from signup through evidence sharing and key management. Add P2 tests if time permits. Drop Test 3 (scheduled captures) entirely. Test 4 (webhooks) is the first to cut if the budget is tight.

### Reframed Test List (Recommended)

1. **Golden Path: Signup -> ToS -> First Key -> Capture -> Poll -> Verify -> Download WACZ** (P0)
2. **Public Evidence Verification: Unauthenticated verify page loads, validates signature, CORS headers present** (P1)
3. **Account Key Rotation: Create second key -> verify both work -> revoke first -> verify revoked key rejected -> last-key guard** (P1)
4. **Quota Enforcement: Exhaust quota -> 429 with limitType/quota metadata -> reset guidance present** (P2)
5. **Batch Capture: POST /v1/captures/batch -> 207 multi-status -> poll individual statuses** (P2)
6. **Webhook Lifecycle: Create webhook -> capture triggers delivery -> retry on 5xx -> cleanup** (P3, cut-eligible)

## Proposed Tasks

1. **Rewrite Test 1 to include ToS acceptance and show-once key semantics.** The test should assert: (a) `/ui?flow=welcome` redirect for new users, (b) `POST /v1/account/tos` before account endpoints work, (c) `GET /v1/account/first-key` returns key, (d) second call returns 404, (e) full capture-verify-download chain.

2. **Replace Test 6 (share link) with Public Evidence Verification test.** Test both HTML and JSON content negotiation on `/v1/verify/{id}`. Assert no auth required, CORS `*` header present, verification result includes checks array and signing data.

3. **Add Account Key Rotation test (new).** Exercise the full CRUD lifecycle: list keys, create key, verify it works for capture auth, revoke original, verify revoked key returns 401, attempt to revoke last key and assert 409.

4. **Drop Test 3 (scheduled captures) from the plan entirely.** The feature is in the parking lot with condition "When a user requests recurring capture" -- condition not met. Including it in the test plan creates a false commitment to build it.

5. **Adjust Test 5 (quota enforcement) response assertions.** The 429 response includes structured `limitType: 'quota'` and `quota: { limit, used, resource, resetsAt }` fields (line 646-654 of index.js). The test should assert these specific fields, not just the status code -- they are the UX of the error.

6. **If Test 4 (webhooks) is kept, start it with webhook CRUD.** The test currently assumes a webhook exists. It should create one first via `POST /v1/webhooks`, then trigger a capture, then verify delivery. This tests the full integration lifecycle.

## Risks and Concerns

1. **GitHub OAuth in E2E is the hardest part.** The signup flow redirects to `github.com/login/oauth/authorize`. A real Playwright test cannot authenticate against GitHub without either (a) a test GitHub account with stored credentials, (b) mocking the GitHub OAuth endpoints, or (c) bypassing OAuth entirely by seeding a session directly. Option (c) is the pragmatic choice for E2E but means the OAuth redirect itself is never tested browser-side. This is an acceptable tradeoff -- the OAuth exchange is covered by unit tests in `test/oauth.test.js`. The E2E test should focus on what happens *after* a session exists.

2. **Show-once key semantics create test ordering fragility.** The first-key KV entry has a 1-hour TTL and is deleted on first read. If tests run in parallel or are retried, the first-key retrieval may fail. Tests should either seed their own KV entries or use a fresh tenant per run.

3. **Capture completion time is the budget wildcard.** A single capture involves headless browser rendering, which can take 5-30 seconds. If the test captures a real external URL (like `example.com`), network latency and rendering time dominate the budget. Consider using a locally-served test page to make capture time deterministic.

4. **The verification page JS fetches two endpoints concurrently.** The HTML verify page's script (verify-page.js lines 767-780) does `Promise.all([fetch(verifyUrl), fetch(retrievalUrl)])`. If the E2E test loads this page in a browser, it exercises the full client-side rendering path. If it only tests the JSON API, it misses the HTML page's JS behavior. Recommend: Test 2 (public verification) should load the page in Playwright and assert DOM elements, not just API responses.

5. **Quota enforcement test requires tenant state manipulation.** To hit a quota limit, you either need to make 100 real captures (infeasible in 5 minutes) or seed the `usage_counters` D1 table with a count near the limit. The test setup needs direct D1 access or an admin endpoint to set usage.

## Additional Agents Needed

None -- the planning questions are fully within UX strategy scope. Implementation details (Playwright test code, fixture setup, CI integration) are for the test-minion and implementation agents.
