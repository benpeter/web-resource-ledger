# Domain Plan Contribution: security-minion

## Threat Analysis Context

The current system has a clean security model: stateless Bearer token auth (SHA-256 hashed API keys in D1, timing-safe comparison for ADMIN_KEY), no cookies, no sessions, no browser-origin concerns. Adding GitHub OAuth and session cookies introduces a fundamentally new attack surface -- browser-mediated authentication, persistent server-side state, and cross-site concerns that did not previously exist.

This analysis is structured around the seven specific threats identified in the planning question, plus additional threats discovered during code review.

---

## Recommendations

### 1. CSRF on Session-Authenticated Mutations

**Verdict: SameSite=Lax is necessary but NOT sufficient for all mutation endpoints.**

SameSite=Lax protects against cross-site POST (forms, fetch from other origins) by not sending the cookie on cross-site requests. This covers the common CSRF attack vectors. However:

- **SameSite=Lax allows cookies on top-level GET navigations from other sites.** If any GET endpoint has side effects (it shouldn't, but defense in depth), SameSite=Lax does not protect it.
- **Subdomains matter.** `api.webresourceledger.com` and any other `*.webresourceledger.com` subdomain are same-site. If the landing page at `webresourceledger.com` or `docs.webresourceledger.com` is ever compromised (XSS), an attacker on that subdomain can forge cross-origin requests that carry the session cookie because they are same-site. This is the single biggest CSRF risk in this architecture.

**Recommendation**: Use SameSite=Lax as the baseline, but add a synchronizer token (CSRF token) for all state-mutating session-authenticated endpoints (POST, DELETE). The CSRF token should be:
- Generated server-side, stored in the session record in D1
- Delivered to the UI as a meta tag or JSON response on session validation
- Required as a custom header (`X-CSRF-Token`) on all mutating requests
- Validated server-side before processing the mutation

The custom header approach (`X-CSRF-Token`) is preferable because browsers enforce that custom headers cannot be set by cross-origin requests unless CORS explicitly allows them. Since `api.webresourceledger.com` does not configure CORS for the UI routes, cross-origin JavaScript cannot set custom headers on requests to the session-authenticated endpoints. This is the "double-submit" defense: cookie (session) + custom header (CSRF token).

**Implementation note**: The existing admin API (`/v1/admin/*`) uses Bearer token auth, which is immune to CSRF (tokens are not auto-attached by browsers). Do NOT change the admin API auth mechanism. The CSRF concern applies ONLY to session-cookie-authenticated routes.

### 2. Session Fixation and Hijacking

**Session fixation**: An attacker obtains a valid session ID before the victim authenticates, then tricks the victim into using that session. Mitigated by:
- **Generating a new session ID after successful OAuth callback.** Never reuse a session ID across authentication state transitions. The callback handler must create a fresh session after verifying the GitHub token exchange, not reuse any pre-existing session.
- **Binding the session to the GitHub user ID in D1.** The session record must contain the user identity -- a session without an authenticated user has no value.

**Session hijacking**: Attacker steals a valid session cookie. Mitigated by:
- **HttpOnly**: Prevents JavaScript access (protects against XSS-based theft).
- **Secure**: Cookie only sent over HTTPS (already enforced by HSTS with preload).
- **SameSite=Lax**: Prevents cross-site sending (as discussed above).
- **Short-lived sessions**: Set session expiry to a reasonable window (e.g., 7 days). Do NOT make sessions permanent. Store the expiry in D1 and validate on every request.
- **Cryptographically random session IDs**: Use `crypto.getRandomValues(new Uint8Array(32))` and encode as base64url. This gives 256 bits of entropy -- sufficient to prevent brute force.
- **Session revocation on logout**: The POST /auth/logout endpoint must delete the session record from D1, not just clear the cookie. Cookie clearing is client-side; server-side revocation is the ground truth.

**Additional hardening**:
- Store a hash of CF-Connecting-IP in the session record at creation. If the IP changes mid-session, log a warning (do not hard-block -- mobile users switch IPs). This provides forensic signal.
- Implement an absolute session lifetime (e.g., 30 days) even if the user is active. Force re-authentication after that.

### 3. GitHub Client Secret in Worker Secrets

The GitHub OAuth `client_secret` is a high-value credential. If leaked, an attacker can exchange authorization codes for access tokens, impersonating the WRL application.

**Storage**: Store as a Wrangler secret (`wrangler secret put GITHUB_CLIENT_SECRET`). This is the correct approach -- it lands in Worker environment variables encrypted at rest and is only accessible at runtime. Also store in 1Password WRL vault for operational recovery.

**Exposure risk vectors**:
- **Error responses**: Never include the client_secret in error messages, logs, or stack traces. The token exchange with GitHub should use a try/catch that logs a generic message on failure.
- **Source code**: Never hardcode. The `wrangler.toml` `[vars]` section must NOT contain the secret (it currently correctly uses secrets for CAPTURE_API_KEY and SIGNING_KEY -- follow the same pattern).
- **GitHub token exchange request**: The POST to `https://github.com/login/oauth/access_token` includes the client_secret in the request body. This goes over HTTPS to GitHub's servers, so it's encrypted in transit. Acceptable.

**Rotation**: GitHub allows regenerating the client secret. Document the rotation procedure in OPERATIONS.md. If the secret is compromised, rotation invalidates all in-flight authorization codes but does NOT invalidate existing sessions (sessions are decoupled from GitHub tokens after identity extraction).

### 4. Token Confusion Between Session Cookies and API Bearer Tokens

This is the most architecturally significant threat. The Worker will now accept two fundamentally different auth mechanisms on the same origin:

- **API routes** (`/v1/captures`, `/v1/captures/batch`, etc.): Bearer token auth via `Authorization` header
- **Account routes** (proposed `/v1/account/keys`, etc.): Session cookie auth
- **Admin routes** (`/v1/admin/*`): Bearer token auth via ADMIN_KEY

**The danger**: If a route inadvertently accepts the wrong auth type, security boundaries collapse. Example: if `/v1/account/keys` also accepted a Bearer token from any tenant's API key, an API key holder could manage keys for a different tenant.

**Mandatory architectural rule -- auth method isolation by route prefix**:

| Route prefix | Auth mechanism | Auth function |
|---|---|---|
| `/v1/captures*`, `/v1/verify*`, `/v1/webhooks*` | Bearer API key | `verifyApiKey()` |
| `/v1/admin/*` | Bearer ADMIN_KEY | `verifyAdminKey()` |
| `/v1/account/*` or `/account/*` | Session cookie | `verifySession()` (new) |
| `/auth/*` | None (public) or session cookie (logout) | N/A or `verifySession()` |

**Implementation requirements**:
- Create a new `verifySession()` function in `src/auth.js` that ONLY reads cookies, never the Authorization header.
- The existing `verifyApiKey()` and `verifyAdminKey()` must ONLY read the Authorization header, never cookies. Verify this is true (confirmed: `extractBearerToken` only reads `request.headers.get('Authorization')`).
- Route-level auth binding must be explicit. Do NOT create a "try cookie, fall back to Bearer" auth function. Each route gets exactly one auth method.
- The auth result from `verifySession()` should return `{ ok: true, tenantId, githubUserId, authMethod: 'session' }` to maintain the existing auth result contract.

**Cookie name**: Use a specific prefix like `__Host-wrl_session`. The `__Host-` prefix enforces that the cookie is Secure, has no Domain attribute, and Path is `/`. This prevents subdomain attacks (a compromised `docs.webresourceledger.com` cannot set or read `__Host-` cookies for `api.webresourceledger.com`).

### 5. Rate Limiting on OAuth Endpoints

OAuth endpoints are public-facing and susceptible to abuse:

**Authorization endpoint (GET /auth/github)**: Generates a state parameter, stores it, and redirects to GitHub. An attacker can spam this to fill up D1 with state records.
- Rate limit: Use the existing ADMIN_RATE_LIMITER binding pattern (IP-keyed) or create a new one. Recommend 10 requests per 60 seconds per IP.
- TTL cleanup: State records should have a short TTL (5-10 minutes). Either use a `created_at` column and ignore expired states in the callback, or run a periodic cleanup. Given D1, a `created_at` check in the callback is simplest.

**Callback endpoint (GET /auth/github/callback)**: Exchanges the authorization code with GitHub and creates a session. This is the most expensive endpoint (makes an outbound HTTP request to GitHub).
- Rate limit: 10 requests per 60 seconds per IP. Same binding as above works.
- Abuse scenario: An attacker with many IPs could use this as a GitHub API amplification proxy. Mitigate by validating the state parameter BEFORE making the token exchange request. If the state is invalid or expired, reject immediately without hitting GitHub's API.

**Logout endpoint (POST /auth/logout)**: Low cost, but rate limit for hygiene. 10/60s per IP.

**Account endpoints (key CRUD)**: These are authenticated (session required). Rate limit per tenant, similar to existing per-tenant capture rate limits. Recommend 20/60s per tenant for key listing, 5/60s for key creation (to prevent API key farming), 5/60s for key revocation.

**New rate limiter binding needed in wrangler.toml**:
```toml
[[unsafe.bindings]]
name = "AUTH_RATE_LIMITER"
type = "ratelimit"
namespace_id = "1006"
simple = { limit = 10, period = 60 }
```

### 6. "First Key Shown Once" Pattern Safety

The existing admin API already follows this pattern (see `admin.js` line 143-151: raw key returned in the 201 response body with a `warning` field). This is a well-established pattern (Stripe, GitHub, AWS all do this).

**Security considerations**:
- **Transport**: The key is returned over HTTPS. The response has `Cache-Control: private, no-store` (admin.js uses `ADMIN_CACHE` headers). Apply the same headers to the self-serve key creation response.
- **Response body**: The raw key appears in the HTTP response body exactly once. It is NOT stored anywhere in plaintext -- only the SHA-256 hash is persisted in D1.
- **UI handling**: The frontend must NOT persist the raw key to `localStorage`, `sessionStorage`, or any persistent storage. It should be held in a JavaScript variable only for the duration of the key-reveal UI interaction. After the user dismisses the dialog or navigates away, the variable should be nulled.
- **Copy-to-clipboard**: Use `navigator.clipboard.writeText()` which is secure (requires same-origin and secure context). Do NOT use the deprecated `document.execCommand('copy')` approach.
- **First login flow**: The auto-generated first key should be displayed in the post-OAuth-callback landing page. The response from the callback sets the session cookie AND renders the key-reveal UI. The key is generated server-side, stored (hashed) in D1, and the raw value is included in the response body (rendered into the HTML or returned as JSON that the frontend fetches). Either approach works; the important thing is that the raw key is transmitted exactly once over HTTPS and never persisted in plaintext.

**Risk: User closes tab before copying.** This is a UX problem, not a security problem. The user can create a new key from account settings. Document this clearly in the UI ("This key will not be shown again. If you lose it, create a new one."). Do NOT implement a "show key again" feature -- that would require storing the raw key, which violates the security model.

### 7. GitHub Access Token Lifecycle

After the OAuth callback exchanges the authorization code for a GitHub access token, that token grants API access to the user's GitHub account (at minimum, read their profile).

**Recommendation: Discard immediately after identity extraction.**

The WRL application only needs the GitHub user's ID and username. It does not need ongoing GitHub API access. The token should be:
1. Used to call `GET https://api.github.com/user` to retrieve `id`, `login`, and optionally `avatar_url` and `name`.
2. Discarded. Do not store it in D1, do not store it in the session, do not store it anywhere.

**Why discard**: If WRL's D1 is ever compromised (data breach), stored GitHub tokens would give the attacker access to every user's GitHub account. This is a massive amplification of blast radius. Since WRL does not need ongoing GitHub access, storing the token is all risk and no benefit.

**What if we need GitHub data later?** If a future feature requires GitHub API access (e.g., fetching org membership for RBAC), re-authenticate the user via OAuth at that time. Do not stockpile tokens "just in case." This follows YAGNI.

**Token scope**: When registering the GitHub OAuth App, request no additional scopes. The default scope grants read-only access to the user's public profile, which is all WRL needs.

---

## Additional Threats Discovered During Code Review

### 8. Session Cookie and the GET /v1/captures/{id} Auth Gap

SECURITY.md documents a known gap: `GET /v1/captures/{id}` and artifact endpoints do not require authentication -- the capture ID acts as the access secret. With session cookies now present on the origin, this changes the threat model:

- Previously, an attacker needed to know the capture ID. No cookies, no ambient auth.
- With session cookies, a CSRF attack could potentially trigger actions on authenticated endpoints. However, the GET endpoints have no side effects, so CSRF is not directly applicable.
- **The real risk**: If a user is authenticated with a session cookie, and the captures list (`GET /v1/captures`) is session-authenticated, then XSS on any same-origin page could exfiltrate the capture list AND all capture details. Currently, the API key in sessionStorage provides a (weak) isolation boundary -- an attacker needs the key in sessionStorage to call the API.

**Recommendation**: Plan for how the UI will work in the session-authenticated world. Will `GET /v1/captures` accept session cookies? If so, XSS on the verification page (which renders third-party HTML) becomes a vector for exfiltrating a user's capture history. This should be a distinct threat in the threat model.

### 9. OAuth State Parameter Storage and Validation

The state parameter prevents CSRF on the OAuth flow itself. Implementation requirements:
- Generate state as `crypto.getRandomValues(new Uint8Array(32))` encoded as base64url.
- Store in D1 with a `created_at` timestamp. Do NOT store in a cookie (cookie fixation risk).
- On callback, validate: state exists in D1, is not expired (TTL 5-10 min), and has not been used before. Delete after successful use (one-time use).
- Bind the state to the IP address at creation time. If the callback comes from a different IP, log a warning (do not hard-block).

### 10. Tenant Auto-Provisioning Abuse

A malicious actor could repeatedly sign up with different GitHub accounts to create many tenants, consuming D1 storage and receiving API keys for abuse (spam captures, etc.).

**Mitigations**:
- IP-based rate limiting on the OAuth flow (addressed in point 5).
- GitHub account age check: Consider rejecting GitHub accounts created very recently (e.g., within 24 hours). This is a soft signal, not a hard gate -- call `GET /api/github.com/user` and check `created_at`.
- Per-tenant defaults: New self-serve tenants should get conservative rate limits (lower than operator-provisioned tenants). The existing per-tenant rate limit system supports this via D1 tenant config.
- Monitoring: Log all tenant auto-provisions to Coralogix. Alert on unusual creation velocity.

### 11. Content-Security-Policy Update for OAuth Redirects

The current CSP on the UI page is:
```
default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
```

Note `form-action 'none'` -- this would block form-based redirects to GitHub. The OAuth flow uses a GET redirect (window.location navigation), not a form submit, so `form-action 'none'` is fine. But verify that the "Sign in with GitHub" button uses `window.location.href = '/auth/github'` (a same-origin navigation), not a form POST.

The `connect-src 'self'` directive is correct -- all API calls from the UI go to the same origin.

No CSP changes are needed for the OAuth flow itself, since the OAuth redirect is a full page navigation (not a fetch/XHR), and the callback returns to the same origin.

---

## Proposed Tasks

### T-SEC-1: Implement `verifySession()` auth function (CRITICAL)
Create `verifySession(request, env)` in `src/auth.js` that:
- Reads ONLY the `__Host-wrl_session` cookie (never the Authorization header)
- Looks up the session ID in D1
- Validates expiry, returns `{ ok: true, tenantId, githubUserId, authMethod: 'session' }`
- Returns `{ ok: false, response: 401 }` on invalid/expired/missing session
- Must be used exclusively for account routes; must never be used for API routes

### T-SEC-2: CSRF token generation and validation (HIGH)
- Add a `csrf_token` column to the sessions table (generated at session creation)
- Deliver the CSRF token to the frontend via a session-info endpoint or embedded in the UI HTML
- Validate `X-CSRF-Token` header on all session-authenticated POST/DELETE endpoints
- Reject requests with missing or mismatched CSRF tokens with 403

### T-SEC-3: Session cookie hardening (HIGH)
- Cookie name: `__Host-wrl_session`
- Attributes: `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, no `Domain` (enforced by `__Host-` prefix)
- Session ID: 256-bit cryptographically random, base64url encoded
- D1 session record: session_id_hash (SHA-256 of session ID), github_user_id, tenant_id, csrf_token, created_at, expires_at, ip_hash
- Session lifetime: 7 days sliding, 30 days absolute maximum
- Hash the session ID before storing in D1 (same pattern as API keys)

### T-SEC-4: OAuth state parameter implementation (HIGH)
- 256-bit random state, stored in D1 with created_at and ip_hash
- 10-minute TTL, one-time use (delete on successful callback)
- Validate state BEFORE making the GitHub token exchange request
- Reject expired or missing state with 400, not redirect

### T-SEC-5: GitHub token discard-after-use (MEDIUM)
- After extracting user identity from GitHub API, null the access token variable
- Do NOT store the GitHub access token in D1, session, or any persistent storage
- Log the identity extraction event (without the token) to Coralogix

### T-SEC-6: Auth rate limiter binding (MEDIUM)
- Add `AUTH_RATE_LIMITER` binding to wrangler.toml (both production and staging)
- 10/60s per IP on `/auth/*` endpoints
- Apply BEFORE any outbound requests (state lookup, GitHub token exchange)
- Separate rate limiter for account key creation: 5/60s per tenant

### T-SEC-7: Route-level auth isolation enforcement (CRITICAL)
- Document and enforce the auth-method-to-route-prefix mapping in index.js
- Add a code comment or assertion that prevents accidentally mixing auth methods
- Auth method used must be logged in every request's structured log entry
- Test: verify that session cookies are ignored on API routes, and Bearer tokens are ignored on account routes

### T-SEC-8: Self-serve tenant default rate limits (MEDIUM)
- New tenants created via OAuth should receive conservative default rate limits
- Store default config in tenant record at creation time
- Lower than operator-provisioned defaults (suggest: capture 5/60s vs current default 10/60s)
- Operator can upgrade via admin API

### T-SEC-9: Security logging for OAuth events (MEDIUM)
- Log to Coralogix: oauth_login_success, oauth_login_failure, session_created, session_expired, session_logout, account_key_created, account_key_revoked, tenant_auto_provisioned, tos_accepted
- Include: cip (hashed IP), github_user_id, tenant_id, auth_method
- Never log: GitHub access token, session cookie value, raw API key, client_secret

---

## Risks and Concerns

### RISK-1: Subdomain Cookie Scope (HIGH)
`api.webresourceledger.com`, `webresourceledger.com`, and `docs.webresourceledger.com` are all same-site. XSS on any of these subdomains could be used to forge same-site requests that carry the session cookie. The `__Host-` cookie prefix mitigates this for cookie setting, but does not prevent the browser from sending an existing cookie on requests triggered from a compromised subdomain.

**Mitigation**: CSRF token (T-SEC-2) is the defense. Also: keep the attack surface on the landing page and docs site minimal (they are static sites with no user input handling, which is good).

### RISK-2: Token Confusion if Auth Boundaries Drift (HIGH)
Over time, developers may add routes that blur the auth-method-to-route-prefix mapping. A single route that accepts "either cookie or Bearer token" creates a confused deputy vulnerability.

**Mitigation**: T-SEC-7 (strict enforcement). Consider adding a lint rule or test that verifies each route uses exactly one auth method.

### RISK-3: D1 as Session Store -- Performance (MEDIUM)
Every session-authenticated request requires a D1 read to validate the session. D1 reads are typically <5ms within the same region, but this adds latency to every UI request.

**Mitigation**: Acceptable for MVP. If latency becomes an issue, consider a short-lived KV cache (TTL 60s) of validated sessions, with D1 as the source of truth. Do NOT use a signed JWT as the session token (JWTs cannot be revoked server-side without a lookup, negating the performance benefit).

### RISK-4: GitHub Account Linking Confusion (MEDIUM)
The spec says "handle the case where a GitHub user has previously been provisioned as an operator tenant." This is tricky: how does the system know that GitHub user 12345 is the same person as operator tenant "acme-corp"? It can't know automatically.

**Recommendation**: Do NOT auto-link. Instead: (1) GitHub OAuth always creates a new tenant with ID derived from GitHub user (e.g., `gh-12345` or `gh-username`). (2) An operator who wants to link an existing tenant must use the admin API to create a record in a linking table, or the system provides a one-time link code. Auto-linking by username match is dangerous (GitHub usernames can be recycled).

### RISK-5: OAuth App Registration Security (LOW)
The GitHub OAuth App registration itself must be secured. The `Authorization callback URL` must be set to exactly `https://api.webresourceledger.com/auth/github/callback`. If this is misconfigured (e.g., wildcarded), an attacker could redirect authorization codes to their own server.

**Mitigation**: Document the exact callback URL in OPERATIONS.md. Verify it during staging deployment.

### RISK-6: "First Key Shown Once" Recovery Path (LOW -- UX, not security)
If a user loses their first key, they need to know they can create a new one. This is a UX concern, but failing to communicate it clearly could lead users to re-register with a different GitHub account, creating orphan tenants.

**Mitigation**: Clear messaging in the UI. "Create New Key" should be prominently available in account settings.

---

## Additional Agents Needed

- **oauth-minion**: To specify the exact GitHub OAuth flow implementation (authorization URL params, token exchange request format, error handling for denied/expired authorizations). The security constraints above define WHAT the flow must enforce; oauth-minion defines HOW to implement the flow correctly on Cloudflare Workers.
- **data-minion**: To design the D1 schema for sessions, OAuth identity, and state. Security constraints: session IDs must be hashed before storage (like API keys), sessions need expiry columns, state table needs TTL. The schema must support the `__Host-` cookie prefix requirement (session ID is the cookie value, SHA-256 hash is the D1 key).
- **test-minion**: To define test cases for auth isolation (verify cookie auth is rejected on API routes, verify Bearer auth is rejected on account routes), CSRF token validation, session expiry, and OAuth state parameter one-time-use.
