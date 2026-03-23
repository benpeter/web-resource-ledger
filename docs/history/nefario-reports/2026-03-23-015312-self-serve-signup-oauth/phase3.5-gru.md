# Gru Architecture Review -- Self-Serve Signup via GitHub OAuth

**Verdict: ADVISE**

The plan is architecturally sound and proportionate to the task. The technology
choices are well-reasoned for a Cloudflare Worker environment. I found one
enforcement gap that should be fixed before execution, plus a handful of
advisory notes that can be addressed during or after implementation.

---

## Critical Finding (fix before execution)

### ToS backend enforcement is specified but never implemented

The Decisions section (line 898) states: "The ToS gate in the UI is a soft
block that the backend enforces via 403 on account endpoints when
tosAcceptedAt is null."

However, **none of the task specifications implement this backend enforcement.**
Task 5 (router integration) checks session validity and CSRF but has no
`tosAcceptedAt` guard. Task 4 (account handlers) also has no ToS check. The
only ToS-related handler is `handleAccountAcceptTos` itself.

This means a user who bypasses the UI (e.g., via curl with a valid session
cookie) can create and manage API keys without accepting ToS. The frontend
gate alone is insufficient for a legal compliance control.

**Fix:** Add a ToS check to the `/v1/account/*` auth gate in Task 5. After
`verifySession()` succeeds, if `session.tosAcceptedAt` is null and the path
is not `/v1/account/tos`, return 403 with a clear message. This is ~5 lines
in the router and ensures server-side enforcement. The `verifySession()`
return shape already includes `githubId` for the user lookup, and the
`GET /auth/session` endpoint already returns `tosAcceptedAt`, so the data
is available.

Alternatively, include `tosAcceptedAt` in the session result from
`verifySession()` (it already queries `github_users` for the login).

---

## Technology Assessment

### D1 for sessions -- Ring: Adopt

Correct choice. D1 sessions with HMAC-signed cookies give server-side
revocation (JWT does not), minimal latency on the Workers platform, and
no external dependency. The hash-before-store pattern matches the existing
`api_keys` table. Session table growth risk is low -- the opportunistic
`deleteExpiredSessions()` via `ctx.waitUntil()` is sufficient for the
expected user volume. A cron trigger can be added later if needed (YAGNI
applied correctly).

### KV for OAuth state -- Ring: Adopt

KV with built-in TTL is the right tool for ephemeral, single-use state.
The eventual consistency concern is a non-issue: the user interacts with
GitHub's authorization page for seconds to minutes, far exceeding KV's
replication window (typically under 60 seconds globally). No cleanup code
needed. Good call.

### Custom header CSRF (`X-WRL-CSRF: 1`) -- Ring: Adopt

This is well-reasoned and proportionate. The defense-in-depth is:
1. `SameSite=Lax` blocks the cookie on cross-origin POST
2. Custom header triggers CORS preflight, which the server does not satisfy
3. `__Host-` prefix prevents cookie injection from subdomains

The synchronizer token alternative would add a D1 read per mutation, KV or
cookie state for the token, and multi-tab synchronization complexity -- all
for marginal security benefit in this specific architecture where the three
layers above already cover the attack surface. The plan's analysis is correct.

### PKCE for a confidential client -- Ring: Trial (worth including)

The plan adds PKCE (S256), which is correct. GitHub added PKCE support in
[July 2025](https://github.blog/changelog/2025-07-14-pkce-support-for-oauth-and-github-app-authentication/).
While WRL is a confidential client (the `client_secret` is server-side in a
Worker secret), PKCE adds defense-in-depth against authorization code
interception. The implementation cost is minimal: ~10 extra lines for
`code_verifier` generation, `code_challenge` computation, and passing both
through KV. OAuth 2.1 will require PKCE for all clients. Including it now
is forward-compatible and costs almost nothing.

### Tenant ID format `gh-{numeric_id}` -- Good long-term decision

The plan correctly chose GitHub's immutable numeric user ID over the mutable
login name. Tenant IDs are embedded in R2 keys, KV counters, D1 foreign keys,
and capture records -- changing them later is a multi-table data migration.
The format matches `TENANT_ID_RE` (`/^[a-z0-9_-]{1,64}$/`) and the D1 CHECK
constraint (`id GLOB '[a-z0-9_-]*'`). The `gh-` prefix is readable enough
in logs and clearly distinguishes self-serve tenants from operator-provisioned
ones.

One consideration: if a second identity provider is added later (e.g.,
`gl-` for GitLab), the `github_users` table needs to be renamed or
generalized. The plan acknowledges this with "Separate identity table
enables future providers without schema changes." The table name is slightly
misleading for that goal, but the schema itself is sound -- only the table
name would need updating, not the structure.

---

## Advisory Notes (non-blocking)

### 1. `env._session` as request-scoped state carrier

The plan passes the authenticated session to handlers via `env._session`.
This works but is unconventional -- `env` is the Worker bindings object,
not a request context. A safer pattern would be to use a `Map` or
`WeakMap` keyed by `request`, or simply call `verifySession()` from each
handler (it is idempotent and the D1 query is cheap).

The `env._session` approach has a subtle risk: if a Worker runtime ever
reuses the `env` object across concurrent requests (not currently the case
in Cloudflare Workers, where each fetch gets its own isolate invocation),
this would be a session confusion vulnerability. In practice, Workers
guarantee request isolation today, so this is safe. But it is worth a
code comment explaining why.

**Recommendation:** Acceptable as-is. Add a comment in index.js:
`// Safe: Workers guarantee one fetch() invocation per env instance`

### 2. First-key KV TTL vs. user experience

The 1-hour TTL on `first_key:{tenantId}` is reasonable, but consider:
a user who signs up, leaves, and returns 2 hours later sees no key and
must go to settings to create one. The plan's welcome screen handles
this gracefully (404 -> "create in settings"). This is fine.

The `POST /v1/account/first-key/ack` endpoint deletes the KV entry
explicitly, but the key also auto-expires via TTL. This is correct
(belt and suspenders). No issue.

### 3. Session expiry and cookie Max-Age alignment

The plan specifies `Max-Age=604800` (7 days) for the cookie and
`expires_at` in the D1 session row. Ensure these are set to the same
value during session creation. A mismatch (e.g., cookie expires before
D1 row) would cause silent auth failures that are hard to debug. The
server should be the authority -- cookie `Max-Age` should match or
exceed the D1 `expires_at`.

### 4. Rate limiter naming conflict

The plan adds `AUTH_RATE_LIMITER` with `namespace_id = "1006"` (production)
and `"2006"` (staging). There is already an `ADMIN_RATE_LIMITER` with
`namespace_id = "1004"` / `"2004"`. These are distinct bindings with
distinct namespace IDs, which is correct. The naming is clear. No issue.

### 5. Missing `connect-src` for GitHub in CSP

The OAuth flow navigates to GitHub via `<a>` tag (full page navigation),
not via `fetch()`. CSP `connect-src 'self'` does not block navigation.
The UI's API calls are all to the same origin (`/auth/session`,
`/v1/account/*`). No CSP changes needed. The plan correctly avoids
modifying the CSP.

### 6. Scope of Task 7 (frontend)

Task 7 is the largest task in the plan: 4 new files + 3 modified files,
including a major refactor of `ui-auth.js` (dual-auth boot flow). This
is the most likely task to need iteration or produce bugs. The approval
gate is correctly placed here.

Consider splitting the `ui-auth.js` refactor (dual-auth boot, `apiFetch()`
changes) from the new views (`ui-login.js`, `ui-welcome.js`, `ui-tos.js`,
`ui-settings.js`) if the frontend minion struggles with the combined scope.
The plan allows this since Task 7's internal structure is modular.

---

## Simpler Alternatives Considered

I evaluated whether simpler alternatives were overlooked:

**Cloudflare Access (Zero Trust):** Would eliminate custom OAuth code
entirely. However, it requires a Cloudflare Access subscription, locks the
auth flow to Cloudflare's UI, and cannot auto-provision WRL tenants on first
login. Not viable for a self-serve product flow.

**Auth0 / WorkOS / Clerk:** External auth-as-a-service. Adds a dependency,
latency (external token exchange), and cost. The OAuth flow here is simple
(single provider, no RBAC, no MFA). Building it in-Worker is proportionate
and avoids external dependencies. Correct call.

**Signed JWT instead of D1 sessions:** Eliminates the D1 read on every
authenticated request. However, JWTs cannot be revoked server-side without
a blocklist (which re-introduces server state). The plan correctly rejected
this. D1 reads are fast (~1ms within a colo) and the session table is tiny.

**No first-key KV dance:** Could display the key directly in the callback
redirect HTML. But this leaks the key into browser history if the redirect
URL contains it, and server-rendered responses from a redirect are not
standard practice. The KV + dedicated endpoint approach is clean.

None of the simpler alternatives are better for this use case.

---

## Summary

| Aspect | Assessment |
|--------|-----------|
| D1 sessions + HMAC cookie | Sound. Matches existing auth patterns. |
| KV for OAuth state | Sound. Correct use of TTL for ephemeral data. |
| Custom header CSRF | Sound. Proportionate for the architecture. |
| PKCE on confidential client | Good defense-in-depth. Low cost. |
| Tenant ID `gh-{numeric_id}` | Correct. Immutable, regex-compatible. |
| Schema design | Clean. Follows existing conventions. |
| Task decomposition | Well-structured. Dependencies are correct. |
| Gate placement | Correct. Schema and OAuth core are gated. |
| ToS backend enforcement | **GAP.** Frontend-only gate is insufficient. Fix in Task 5. |
| `env._session` pattern | Acceptable with comment. Not a blocking issue. |

**Conditions for re-evaluation:** None. Fix the ToS enforcement gap in the
Task 5 prompt and proceed.
