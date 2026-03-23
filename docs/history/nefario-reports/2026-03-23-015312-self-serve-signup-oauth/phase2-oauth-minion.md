# Domain Plan Contribution: oauth-minion

## Recommendations

### 1. GitHub OAuth Authorization Code Flow -- Exact Sequence

The Worker implements a standard OAuth 2.0 authorization code flow with GitHub as the identity provider. GitHub supports PKCE (S256 method) as of July 2025. The Worker is a confidential client (it holds the `GITHUB_CLIENT_SECRET` server-side), so PKCE is defense-in-depth here, not strictly required. However, the implementation SHOULD include PKCE anyway -- it costs nothing and aligns with OAuth 2.1 best practice.

**Endpoints to add to the Worker:**

| Route | Purpose |
|-------|---------|
| `GET /auth/login` | Generates state + PKCE, sets cookie, redirects to GitHub |
| `GET /auth/callback` | Exchanges code for token, fetches user, creates/loads tenant, issues session cookie |
| `POST /auth/logout` | Clears session cookie, returns 200 |

**Flow:**

```
1. Browser hits GET /auth/login
2. Worker generates:
   - state = 32 random bytes, base64url-encoded
   - code_verifier = 43-128 char random string (A-Z, a-z, 0-9, -, ., _, ~)
   - code_challenge = BASE64URL(SHA256(code_verifier))
3. Worker stores { state, code_verifier } in a short-lived KV entry:
   - Key: oauth_state:{state}
   - Value: JSON { code_verifier, created_at }
   - TTL: 600 seconds (10 minutes)
4. Worker responds 302 to:
   https://github.com/login/oauth/authorize
     ?client_id=GITHUB_CLIENT_ID
     &redirect_uri=https://api.webresourceledger.com/auth/callback
     &state={state}
     &scope=read:user
     &code_challenge={code_challenge}
     &code_challenge_method=S256
5. User authenticates at GitHub, consents, gets redirected to:
   https://api.webresourceledger.com/auth/callback?code=XXX&state=YYY
6. Worker validates state:
   - Reads oauth_state:{state} from KV
   - If missing or expired: 403 "Invalid or expired OAuth state"
   - Deletes the KV entry (single-use)
7. Worker exchanges code for access token:
   POST https://github.com/login/oauth/access_token
   Content-Type: application/json
   Accept: application/json
   Body: { client_id, client_secret, code, redirect_uri, code_verifier }
   Response: { access_token, token_type, scope }
8. Worker fetches GitHub user identity:
   GET https://api.github.com/user
   Authorization: Bearer {access_token}
   Accept: application/vnd.github+json
   Response: { id, login, avatar_url, name, email, ... }
9. Worker creates or loads tenant (see "Tenant Auto-Provisioning" below)
10. Worker issues session cookie (see "Session Storage" below)
11. Worker DISCARDS the GitHub access token -- does NOT store it
12. Worker responds 302 to /ui (or /ui/account on first login)
```

### 2. Session Storage: HMAC-Signed Cookie (NOT D1, NOT JWT)

**Recommendation: HMAC-signed cookie with D1 session lookup.**

Evaluated three options:

| Option | Pros | Cons |
|--------|------|------|
| Encrypted/signed cookie (self-contained) | No DB lookup per request | Cannot revoke sessions server-side; payload size limits |
| JWT in cookie | Stateless validation | Same revocation problem; JWT parsing overhead; no refresh rotation needed |
| **D1 session row + signed session ID cookie** | Server-side revocation; minimal cookie size; auditable | One DB read per authenticated request |

**Winner: D1 session table + HMAC-signed session ID cookie.** Rationale:
- The Worker already has D1 and uses it on every authenticated request (API key lookup). Adding one more read for session validation is negligible.
- Server-side sessions allow immediate revocation (logout, abuse response, password change equivalent).
- Cookie contains only the session ID (opaque, not user data), HMAC-signed to prevent tampering.
- No need for JWT libraries or encrypted cookie complexity.

**Session table schema:**

```sql
CREATE TABLE sessions (
  id          TEXT NOT NULL PRIMARY KEY,  -- 32 random bytes, base64url
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  github_id   INTEGER NOT NULL,
  github_login TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  last_seen_at TEXT
);

CREATE INDEX idx_sessions_tenant ON sessions (tenant_id);
CREATE INDEX idx_sessions_expires ON sessions (expires_at);
```

**Cookie format:**

```
Set-Cookie: __Host-wrl_session={sessionId}.{hmac_hex}; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800
```

- `__Host-` prefix enforces: `Secure` flag, no `Domain` attribute, `Path=/`
- `SameSite=Lax` (not `Strict`) because the OAuth callback is a cross-site redirect from GitHub -- `Strict` would reject the cookie on the callback redirect
- `HttpOnly` prevents JavaScript access (XSS mitigation)
- `Max-Age=604800` (7 days) -- sessions expire server-side too
- HMAC uses `crypto.subtle.sign('HMAC', key, sessionId)` with a `SESSION_SECRET` Worker secret

**Session validation on each request:**

```
1. Extract cookie value
2. Split into sessionId and hmac
3. Verify HMAC (timing-safe via crypto.subtle.verify)
4. If invalid: 401
5. Lookup session in D1 by sessionId
6. If not found or expires_at < now: 401 (clear cookie)
7. Return { tenantId, githubId, githubLogin }
8. Optionally update last_seen_at (fire-and-forget via ctx.waitUntil)
```

### 3. State Parameter Security (CSRF Protection)

The state parameter MUST be:
- **Cryptographically random**: 32 bytes from `crypto.getRandomValues()`
- **Single-use**: Stored in KV with TTL, deleted after validation
- **Server-validated**: Worker checks KV, not a cookie (prevents client-side forgery)

**Why KV and not D1 for state?** State entries are ephemeral (10-minute TTL) and high-churn. KV's built-in TTL expiration handles cleanup automatically. D1 would require a periodic cleanup job to purge expired state entries.

**Why not store state in a cookie?** The Worker is stateless between requests. Storing state in a signed cookie and comparing on callback is an option, but it couples CSRF protection to cookie security. KV with TTL is simpler, self-cleaning, and independently verifiable.

### 4. PKCE Implementation Details

GitHub now supports PKCE with S256 (as of July 2025). The implementation:

- **code_verifier**: 64 bytes from `crypto.getRandomValues()`, base64url-encoded (gives 86 characters, well within the 43-128 char spec range)
- **code_challenge**: `BASE64URL(SHA256(code_verifier))`
- **code_challenge_method**: Always `S256` (GitHub does not support `plain`)
- **Storage**: The `code_verifier` is stored alongside state in the KV entry (`oauth_state:{state}`) and sent to GitHub's token endpoint during code exchange
- **Never reuse**: Each login attempt generates a fresh verifier

Even though this is a confidential client (has client_secret), PKCE prevents authorization code interception attacks in the redirect chain (open WiFi, compromised browser extensions, etc.).

### 5. GitHub Access Token Handling

**The GitHub access token MUST be discarded after retrieving user identity.** Do NOT store it.

Rationale:
- WRL only needs the user's GitHub ID and username to establish identity
- The access token grants `read:user` scope on the user's GitHub account -- storing it creates an unnecessary attack surface
- If WRL's D1 database were compromised, stored GitHub tokens would be a high-value target
- The user can re-authenticate with GitHub at any time (OAuth is designed for this)

The token exchange and user info fetch should happen in the same request handler (the callback). After extracting `{ id, login, avatar_url }` from the GitHub API response, the token is let go (garbage collected with the request handler scope). It is never written to D1, KV, or logs.

### 6. Cookie Attributes Deep Dive

| Attribute | Value | Rationale |
|-----------|-------|-----------|
| `__Host-` prefix | Required | Binds cookie to exact origin, requires Secure, forbids Domain |
| `Secure` | Required | Only sent over HTTPS (always true for Workers custom domains) |
| `HttpOnly` | Required | Prevents JavaScript access, mitigates XSS |
| `SameSite` | `Lax` | Must be Lax, not Strict -- the OAuth callback is a cross-site navigation from github.com |
| `Path` | `/` | Session cookie applies to all paths (API and UI) |
| `Max-Age` | `604800` | 7 days browser-side; server-side expiry is authoritative |

**Why SameSite=Lax and not Strict?**
The OAuth flow ends with GitHub redirecting the user to `/auth/callback`. This is a top-level cross-site navigation. With `SameSite=Strict`, the browser would not send the cookie on this navigation, which matters if we need to read any pre-existing session state. More importantly, after the callback sets the session cookie and redirects to `/ui`, the `Strict` cookie would not be sent on that first page load (it's still "cross-site" from the browser's perspective until the user performs an in-site navigation). `Lax` avoids this usability issue while still preventing CSRF on non-safe methods (POST, DELETE, etc.).

### 7. Tenant Auto-Provisioning Flow

On callback, after fetching the GitHub user:

```
1. Look up tenant by github_id in a new github_users mapping table
2. If found:
   - Load existing tenant
   - Create new session
   - Redirect to /ui
3. If not found (first login):
   - Check ToS acceptance (this may happen in the UI before the OAuth redirect)
   - Generate tenant_id: "gh-{github_login}" (lowercase, sanitized to match TENANT_ID_RE)
   - Handle collision: if tenant_id exists, append "-{random4chars}"
   - Insert into tenants table
   - Insert into github_users mapping table
   - Generate first API key (same logic as admin.js handleAdminCreateKey)
   - Create new session
   - Store first_api_key in the session row (or a one-time flash) for display
   - Redirect to /ui/welcome (shows the API key once)
```

**New table needed:**

```sql
CREATE TABLE github_users (
  github_id    INTEGER NOT NULL PRIMARY KEY,
  tenant_id    TEXT NOT NULL REFERENCES tenants(id),
  github_login TEXT NOT NULL,
  avatar_url   TEXT,
  created_at   TEXT NOT NULL,
  tos_accepted_at TEXT NOT NULL
);

CREATE INDEX idx_github_users_tenant ON github_users (tenant_id);
```

### 8. Session-Based Auth Integration with Existing API Auth

The existing `verifyApiKey()` function handles Bearer token auth for API endpoints. Session cookie auth is needed only for the web UI endpoints. Recommended approach:

```
function verifySession(request, env) {
  // Extract and validate __Host-wrl_session cookie
  // Return { ok: true, tenantId, githubId, githubLogin }
  // or { ok: false, response }
}
```

This is a **separate auth path**, not a modification to `verifyApiKey()`. Route-level decisions:
- `/v1/*` API routes: continue using `verifyApiKey()` (Bearer token)
- `/v1/admin/*` routes: continue using `verifyAdminKey()`
- `/ui/*` and `/auth/*` routes: use `verifySession()` (cookie)
- `/account/*` API routes (new): use `verifySession()` for key management

### 9. Secrets Required

| Secret | Purpose | How to set |
|--------|---------|-----------|
| `GITHUB_CLIENT_ID` | OAuth app client ID | `wrangler secret put` (or wrangler.toml var since not secret) |
| `GITHUB_CLIENT_SECRET` | OAuth app client secret | `wrangler secret put` |
| `SESSION_SECRET` | HMAC key for session cookie signing | `wrangler secret put` (32+ random bytes, hex-encoded) |

`GITHUB_CLIENT_ID` can be a plain `[vars]` entry since it's public. `GITHUB_CLIENT_SECRET` and `SESSION_SECRET` must be Wrangler secrets.

## Proposed Tasks

### Task 1: D1 Migration -- Add sessions and github_users tables
- New migration file `0004_oauth_sessions.sql`
- Creates `sessions` table with indexes
- Creates `github_users` table with indexes
- Both tables have foreign keys to `tenants(id)`

### Task 2: Implement OAuth state and PKCE management via KV
- KV key pattern: `oauth_state:{state}`
- Value: JSON `{ code_verifier, created_at }`
- TTL: 600 seconds
- Functions: `createOAuthState(env)` returns `{ state, code_challenge }`, `consumeOAuthState(env, state)` returns `{ code_verifier }` or null

### Task 3: Implement GET /auth/login endpoint
- Generates state + PKCE via Task 2
- Redirects to `https://github.com/login/oauth/authorize` with all required params
- No cookie needed on this request

### Task 4: Implement GET /auth/callback endpoint
- Validates state parameter against KV
- Exchanges authorization code for access token (POST to GitHub, include code_verifier)
- Fetches user info from `GET https://api.github.com/user`
- Creates or loads tenant + github_user records (D1 batch)
- Creates session record in D1
- Issues `__Host-wrl_session` cookie
- Redirects to `/ui` or `/ui/welcome` (first login)
- Discards GitHub access token

### Task 5: Implement session cookie verification
- `verifySession(request, env)` function in a new `src/session.js` module
- HMAC verification using `crypto.subtle`
- D1 session lookup with expiry check
- Returns `{ ok, tenantId, githubId, githubLogin }` matching the existing auth result pattern

### Task 6: Implement POST /auth/logout endpoint
- Validates session cookie
- Deletes session row from D1
- Clears cookie (Max-Age=0)
- Returns 200

### Task 7: Implement account API endpoints (session-authenticated)
- `GET /account/keys` -- list API keys for session's tenant (masked, last 4 chars of hash + name + created_at)
- `POST /account/keys` -- create new API key (enforce configurable limit, e.g., 5 per tenant)
- `DELETE /account/keys/:keyHash` -- revoke API key (confirmation handled client-side)
- These reuse existing `db.js` functions (`listApiKeyRecords`, `createApiKeyRecord`, `revokeApiKeyRecord`)

### Task 8: Add OAuth routes to index.js router
- `GET /auth/login` -> handleLogin
- `GET /auth/callback` -> handleCallback
- `POST /auth/logout` -> handleLogout
- `GET /account/keys` -> handleAccountListKeys (session auth)
- `POST /account/keys` -> handleAccountCreateKey (session auth)
- `DELETE /account/keys/:keyHash` -> handleAccountRevokeKey (session auth)

### Task 9: Rate limiting for auth endpoints
- `/auth/login`: 20 req/min per IP (prevent redirect flooding)
- `/auth/callback`: 10 req/min per IP (prevent code exchange abuse)
- `/account/*`: 30 req/min per session (prevent key creation spam)
- Can reuse existing rate limiter pattern or add new `unsafe.bindings`

### Task 10: Session cleanup
- Expired sessions accumulate in D1. Options:
  - (a) Cron trigger (preferred): Cloudflare Workers Cron triggers can run `DELETE FROM sessions WHERE expires_at < datetime('now')` periodically
  - (b) Probabilistic cleanup: On each session validation, 1% chance of running cleanup query
  - Recommend (a) with a daily cron trigger

## Risks and Concerns

### Risk 1: KV Eventual Consistency for OAuth State
**Severity: Medium**
KV is eventually consistent. In rare cases, a state entry written in `GET /auth/login` might not be immediately readable in `GET /auth/callback` if the callback hits a different edge location milliseconds later. Mitigation: The OAuth flow involves user interaction with GitHub (several seconds minimum), making this window practically irrelevant. The 600-second TTL provides ample time. If paranoia demands it, retry the KV read once with a short delay.

### Risk 2: GitHub API Availability During Callback
**Severity: Medium**
The callback handler makes two sequential HTTP calls to GitHub (token exchange + user info). If GitHub is slow or down, the user gets an error after authenticating. Mitigation: Set aggressive timeouts (5 seconds each) and return a user-friendly error page with a "try again" link that re-initiates the flow. Do NOT retry automatically (the authorization code is single-use).

### Risk 3: Tenant ID Collisions
**Severity: Low**
If two GitHub users have logins that normalize to the same tenant ID (e.g., after lowercasing), or if a GitHub user's login matches an operator-provisioned tenant, the collision handler must not silently merge them. Mitigation: The `github_users` table is keyed by `github_id` (integer, globally unique), not by tenant_id. The tenant_id generation includes a collision check with random suffix fallback.

### Risk 4: Session Fixation
**Severity: Low**
If an attacker can set a session cookie before the user authenticates, they could hijack the session after authentication. Mitigation: The callback always creates a NEW session (never reuses an existing session ID from a cookie). The session ID is generated server-side with `crypto.getRandomValues()`.

### Risk 5: CSRF on Logout and Account Mutation Endpoints
**Severity: Medium**
`POST /auth/logout` and `DELETE /account/keys/:keyHash` are state-changing and need CSRF protection beyond `SameSite=Lax`. `SameSite=Lax` protects POST requests from cross-site contexts, but a CSRF token is defense-in-depth. Options:
- (a) Check `Origin` or `Referer` header matches `api.webresourceledger.com` for all POST/DELETE on session-auth routes
- (b) Implement a per-session CSRF token
- Recommend (a) as the simpler approach -- the UI and API share an origin, so `Origin` header validation is reliable.

### Risk 6: SESSION_SECRET Rotation
**Severity: Low, but plan for it**
If `SESSION_SECRET` is compromised, all session cookies can be forged. Unlike API keys (which are hashed in D1), the session secret is a single shared HMAC key. Mitigation: Support key rotation by accepting an array of secrets (try current first, fall back to previous). This can be deferred to post-MVP but the signing/verification code should be structured to allow it.

### Risk 7: GitHub User Renames
**Severity: Low**
GitHub users can change their login name. The `github_users.github_login` field may become stale. Mitigation: Update `github_login` and `avatar_url` on every login. The `github_id` (integer) is the stable identifier, not the login string.

### Risk 8: Existing Admin API Must Not Be Affected
**Severity: High if broken**
The admin API (`/v1/admin/*`) uses `verifyAdminKey()` which checks the `ADMIN_KEY` env secret. The new session auth is a completely separate code path. There is no risk of interference as long as:
- No changes are made to `verifyAdminKey()` or `verifyApiKey()`
- The new `/account/*` routes do NOT reuse the `/v1/admin/*` prefix
- The new `github_users` and `sessions` tables do not alter the existing `tenants` or `api_keys` tables (additive migration only)

## Additional Agents Needed

### 1. Database/Backend Minion (or implementation agent)
For the D1 migration design, the `db.js` functions for session CRUD and github_users CRUD, and the tenant auto-provisioning transaction logic. The OAuth minion has specified the schema and flow, but the actual `db.js` additions need to follow the existing module's patterns (centralized DAL, no raw `env.DB.prepare()` outside `db.js`).

### 2. Frontend/UI Minion
For the account settings page (list/create/revoke keys), the "first API key" welcome page, the ToS acceptance UI, and the login button on the auth gate. The existing UI is vanilla JS with DOM construction (no framework) -- the new pages must follow the same pattern.

### 3. Security Review
After implementation, a security-focused review should verify:
- HMAC session signing correctness (timing-safe comparison)
- State parameter cannot be reused (KV deletion is atomic)
- GitHub access token is genuinely not persisted (grep for `access_token` in storage calls)
- Cookie attributes are correct in all environments (staging vs. production)
- No open redirect in the callback (redirect target is hardcoded, not from query params)
- Rate limits are sufficient to prevent auth endpoint abuse
