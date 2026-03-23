# Margo Review: Self-Serve Signup via GitHub OAuth

## Verdict: ADVISE

The plan is well-scoped for the feature requirements and avoids most common over-engineering traps. The conflict resolutions are sound (KV for ephemeral state, custom header CSRF, no JWT sessions). Several deferred-correctly decisions (admin linking endpoint, landing page CTA, cron cleanup) show good YAGNI discipline. The concerns below are non-blocking but worth addressing before or during execution.

---

## Findings

### 1. Task 9 (Observability) should be absorbed into Tasks 3 and 4, not a separate task

**What**: Task 9 is a standalone task for an observability-minion to review oauth.js and account.js and add log calls that Task 3 and Task 4 already specify inline in their prompts.

**Why accidental**: The Task 3 prompt explicitly lists every log event (login_start, callback_success, callback_fail, session_create, logout, tenant_create, tos_accept). Task 4 likewise specifies key_create, key_revoke. Task 9's deliverables are "verify these are present, add if missing" -- which means either (a) they are already present from Tasks 3/4 and Task 9 is pure overhead, or (b) Tasks 3/4 will skip logging and Task 9 patches it in, which fragments ownership of each handler.

**Simpler alternative**: Delete Task 9. The log.js JSDoc update (adding 'oauth' to valid subsystems) is a two-line change that Task 3's agent can do directly. The logging calls are already specified in the Task 3 and Task 4 prompts. If verification is needed, that is a code review concern at the gate after Task 3, not a separate execution task.

**Impact**: Reduces task count from 9 to 8. Removes one batch (Batch 4 becomes just Task 4). Eliminates the coordination risk of a second agent modifying files that Task 3/4 agents just wrote.

### 2. first-key endpoint pair adds avoidable complexity

**What**: Two dedicated endpoints (`GET /v1/account/first-key` and `POST /v1/account/first-key/ack`) plus KV storage for a one-time key display.

**Why accidental**: The first API key is generated during the OAuth callback (Task 3, step 9) using the same `createApiKeyRecord` function as all other keys. The raw key value must be displayed once. The plan stores it in KV with TTL so the welcome screen can fetch it. But the welcome screen is rendered in the same request flow -- user completes OAuth, gets redirected to `/ui?flow=welcome`, and the UI boots and calls the endpoint. This is a roundtrip through KV for data that was just generated seconds ago.

**Simpler alternative**: Return the raw key in the `/auth/session` response (or a dedicated field) only when the session is brand new and the key hasn't been acknowledged. The session record in D1 could include a `first_key_raw` column (cleared on ack), or more simply: the callback could set a short-lived KV entry keyed by session ID hash (not tenant ID) and the `/auth/session` endpoint could include it in the response when present. This collapses two endpoints into zero new endpoints -- the existing `/auth/session` serves double duty.

However, the current approach is functional and not egregiously complex. The two endpoints are small, the KV TTL is self-cleaning, and the separation of concerns is clean. **This is an advisement, not a block.** If the team prefers the explicit endpoint approach for clarity, that is a defensible choice. Just be aware it adds two routes, two handlers, and one more KV key pattern to the surface area.

### 3. ToS enforcement gap -- backend does not enforce the gate

**What**: The plan says "The ToS gate in the UI is a soft block that the backend enforces via 403 on account endpoints when tosAcceptedAt is null." But no task prompt instructs any handler to check `tosAcceptedAt`. Task 4's `handleAccountListKeys`, `handleAccountCreateKey`, and `handleAccountRevokeKey` prompts do not mention checking ToS status. Task 5's router auth gate checks session validity but has no ToS check.

**Why this matters**: This is not a complexity concern but a correctness gap that would result in the ToS gate being UI-only (bypassable with curl). The plan's own success criteria say "New user without ToS acceptance cannot access account endpoints (403)."

**Fix**: Add a ToS check to the router auth gate in Task 5 (after session verification, before dispatching to handler): if `session.tosAcceptedAt` is null and the route is not `/v1/account/tos`, return 403. This is three lines of code in the router, not a new task. Mention it explicitly in the Task 5 prompt.

### 4. PKCE adds complexity for a confidential client

**What**: Task 3 implements PKCE (code_verifier, code_challenge, S256) for the GitHub OAuth flow.

**Why potentially accidental**: PKCE is designed for public clients (SPAs, mobile apps) where the client_secret cannot be kept confidential. WRL is a Cloudflare Worker -- a confidential server-side client that holds `GITHUB_CLIENT_SECRET` in Wrangler secrets. The authorization code exchange already requires the client_secret, which is the traditional protection against code interception. PKCE on top of a confidential client is belt-and-suspenders.

**Counterargument**: GitHub supports PKCE and it is low-cost (one extra hash computation, one extra field in KV). OAuth 2.1 draft recommends PKCE for all clients. The code_verifier is stored in the same KV entry as the state parameter, so storage cost is zero.

**Assessment**: The implementation cost is genuinely low (a few extra lines in the login and callback handlers). I note it because it is technically YAGNI for a confidential client, but the marginal complexity is small enough that removing it would save almost nothing. **No action needed** -- just documenting the reasoning so future readers understand it is a defense-in-depth choice, not a requirement.

### 5. `handleAuthSession` query could be folded into session verification

**What**: `verifySession()` in session.js looks up the session in D1. Then `handleAuthSession` in oauth.js calls `verifySession()` and then does a second query to `findGitHubUser()` for display info. Every page load that checks auth state hits D1 twice.

**Simpler alternative**: Have `verifySession()` JOIN github_users in its session lookup query (it already returns `githubId` and `tenantId` which come from the sessions table; adding `githubLogin` and `tosAcceptedAt` from a JOIN is one modified query). This eliminates the second D1 hit on every authenticated request and simplifies `handleAuthSession` to a thin wrapper that returns the session data.

The Task 3 prompt already hints at this: "The `githubLogin` comes from a JOIN or separate query to `github_users`." The JOIN is clearly simpler.

### 6. Task count is proportional

**What**: 9 tasks for: migration, data layer, OAuth flow, account API, router wiring, infrastructure config, frontend (4 new views + auth refactor), test fixtures, and observability.

**Assessment**: With Task 9 absorbed (finding 1), this becomes 8 tasks. The request scope is substantial: OAuth flow, session management, tenant auto-provisioning, key CRUD UI, ToS gate, dual-auth router. 8 tasks for this is proportional. The tasks decompose along natural file boundaries (one agent per file or module), which minimizes merge conflicts. The gates (3) are well-placed at one-way doors. No scope creep detected -- the plan explicitly defers landing page CTAs, admin linking, and additional OAuth providers.

---

## Complexity Budget Tally

| Item | Type | Cost |
|------|------|------|
| D1 migration (2 tables) | Essential | 0 (already using D1) |
| KV for OAuth state | Essential | 0 (already using KV) |
| KV for first-key storage | Accidental (minor) | 0.5 |
| PKCE | Defense-in-depth | 0.5 |
| 2 new source files (oauth.js, session.js) | Essential | 0 (new feature) |
| 1 new source file (account.js) | Essential | 0 (new feature) |
| 4 new UI files | Essential | 0 (new views) |
| AUTH_RATE_LIMITER binding | Essential | 0.5 |
| HMAC session signing | Essential | 0 (security requirement) |
| Total accidental | | ~1.5 |

The accidental complexity total is low. The plan is well-proportioned.

---

## Summary of Recommended Changes

1. **Absorb Task 9 into Tasks 3 and 4** -- eliminate standalone observability task (saves one task, one coordination point)
2. **Add ToS enforcement to Task 5 router gate** -- three lines of code, prevents UI-only gate bypass
3. **Use JOIN in verifySession()** -- specify in Task 3 prompt that the D1 query should join github_users to avoid double-query on every auth check
4. **Consider simplifying first-key delivery** -- optional, current approach is acceptable

None of these are blocking. The plan can proceed as-is with these adjustments applied to the task prompts before delegation.
