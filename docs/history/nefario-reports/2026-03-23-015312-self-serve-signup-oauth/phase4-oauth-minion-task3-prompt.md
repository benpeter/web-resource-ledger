You are oauth-minion. Implement the GitHub OAuth flow and session management for WRL.

## Context
Read these files to understand the existing codebase patterns:
- `src/index.js` -- router structure, how routes are registered, how auth is checked
- `src/auth.js` -- existing `verifyApiKey()` and `verifyAdminKey()` patterns, `hashApiKey()`
- `src/admin.js` -- existing handler patterns (request parsing, logging, response format)
- `src/db.js` -- data access functions (Task 2 adds GitHub user and session functions)
- `src/log.js` -- logging pattern
- `src/ip-hash.js` -- `computeCip()` for anonymized IP logging
- `src/responses.js` -- `problemResponse()` and `jsonResponse()` helpers
- `wrangler.toml` -- existing bindings and secrets

## Files to Create

**`src/session.js`** -- Session cookie management:
- `verifySession(request, env)` -- Reads `__Host-wrl_session` cookie, verifies HMAC signature, looks up session in D1 via `getSession()`, checks expiry. Returns same shape as `verifyApiKey()`: `{ ok: true, tenantId, githubId, githubLogin, tosAcceptedAt, authMethod: 'session' }` or `{ ok: false, response, reason }`. The `getSession()` function JOINs github_users, so githubLogin and tosAcceptedAt come from the same D1 query -- no second query needed.
- `createSessionCookie(env, sessionId)` -- Creates the HMAC-signed cookie string: `__Host-wrl_session={sessionId}.{hmac_hex}; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`
- `clearSessionCookie()` -- Returns a Set-Cookie header that clears the session cookie (Max-Age=0)
- HMAC uses `crypto.subtle.sign('HMAC', key, data)` with `env.SESSION_SECRET` (hex-encoded 32+ bytes). Import the key once per request using `crypto.subtle.importKey`.
- Session ID generation: `crypto.getRandomValues(new Uint8Array(32))`, base64url-encoded.
- Session ID is hashed with SHA-256 before D1 storage (reuse `hashApiKey()` from auth.js -- it's a general SHA-256 hex function).

**IMPORTANT**: `verifySession` MUST return `tosAcceptedAt` in its result object. The router uses this to enforce a 403 gate on /v1/account/* routes when ToS is not accepted.

**`src/oauth.js`** -- OAuth route handlers:

`handleAuthLogin(request, env, ctx)` -- GET /auth/login:
1. Generate state = 32 random bytes, base64url
2. Generate code_verifier = 64 random bytes, base64url
3. code_challenge = BASE64URL(SHA256(code_verifier))
4. Store in KV: key `oauth_state:{state}`, value JSON `{ codeVerifier, createdAt }`, TTL 600 seconds
5. Redirect 302 to `https://github.com/login/oauth/authorize?client_id={GITHUB_CLIENT_ID}&redirect_uri={callback_url}&state={state}&scope=read:user&code_challenge={code_challenge}&code_challenge_method=S256`
6. Log `oauth.login_start` event via `ctx.waitUntil(log(env, 3, 'oauth', { event: 'oauth.login_start', cip: await computeCip(env, clientIp), provider: 'github' }) ?? Promise.resolve())`
7. The callback URL is `{origin}/auth/callback` where origin is derived from the request URL

`handleAuthCallback(request, env, ctx)` -- GET /auth/callback:
1. Extract `code` and `state` from query params. If missing, redirect to `/ui?error=missing_params`
2. Read and delete KV entry `oauth_state:{state}`. If missing/expired: redirect to `/ui?error=invalid_state`
3. Exchange code for token: POST `https://github.com/login/oauth/access_token` with `{ client_id, client_secret, code, redirect_uri, code_verifier }`. Accept: application/json. Timeout: 5 seconds.
4. If token exchange fails: redirect to `/ui?error=token_exchange_failed`
5. Fetch user identity: GET `https://api.github.com/user` with Bearer token. Timeout: 5 seconds.
6. If user fetch fails: redirect to `/ui?error=github_api_error`
7. DISCARD the GitHub access token (let it be garbage collected -- never store it)
8. Look up `findGitHubUser(db, githubId)`:
   - If found: existing user. Update `github_login` via `updateGitHubLogin()`. Create session. Redirect to `/ui`
   - If not found: new user. Create github_users record with tos_accepted_at = NULL. Create the tenant. Create the session. The ToS gate in the UI will block access until accepted.
9. For new users: call `createGitHubUser(db, { githubId, githubLogin, tenantId: 'gh-' + githubId })`. Generate first API key using the same logic as admin.js `handleAdminCreateKey` (reuse `createApiKeyRecord` from db.js). Store the first key's raw value in KV with key `first_key:{tenantId}` and TTL 3600 (1 hour).
10. Create session: generate session ID, hash it, call `createSession()`, create HMAC-signed cookie.
11. Opportunistic cleanup: `ctx.waitUntil(deleteExpiredSessions(db))`
12. Redirect to `/ui?flow=welcome` (new user) or `/ui` (returning user).
13. Log events inline (do NOT defer to a separate observability task):
    - `oauth.callback_success` (severity 3): `{ cip, provider: 'github', githubUserId, tenantId, isNewUser, sessionIdPrefix }`
    - `oauth.callback_fail` (severity 5): `{ cip, provider: 'github', reason }` (on any failure path)
    - `oauth.session_create` (severity 3): `{ cip, tenantId, githubUserId, sessionIdPrefix, expiresAt }`
    - `oauth.tenant_create` (severity 3): `{ cip, tenantId, githubUserId, provider: 'github' }` (new user only)

`handleAuthLogout(request, env, ctx)` -- POST /auth/logout:
1. Verify session via `verifySession()`. If no valid session, still return 200 (idempotent).
2. Delete session from D1 via `deleteSession()`
3. Clear cookie via `clearSessionCookie()`
4. Return 200 JSON `{ ok: true }`
5. Log `oauth.logout` (severity 3): `{ cip, tenantId, sessionIdPrefix }`

`handleAuthSession(request, env, ctx)` -- GET /auth/session:
1. Verify session via `verifySession()`.
2. If no session: return 200 `{ authenticated: false }`
3. If session valid: return 200 `{ authenticated: true, user: { githubId, githubLogin, tenantId, tosAcceptedAt, tosVersion } }`. The data comes from verifySession() which JOINs github_users.
4. This endpoint is how the UI checks auth state on boot.

`handleFirstKey(request, env, ctx)` -- GET /v1/account/first-key:
1. Verify session. If invalid: 401.
2. Read KV key `first_key:{tenantId}`. If found: return the raw key as JSON `{ key, warning: "Store this key now. It will not be shown again." }` with `Cache-Control: private, no-store`.
3. **DELETE the KV entry immediately after reading** (`ctx.waitUntil(env.KV.delete('first_key:' + tenantId))`). The key is shown once, then gone. This limits the exposure window -- a compromised session cannot re-read the key.
4. If not found: return 404 `{ detail: "No first key available. Create a new key in account settings." }`

`handleFirstKeyAck(request, env, ctx)` -- POST /v1/account/first-key/ack:
1. Verify session. If invalid: 401.
2. Delete KV key `first_key:{tenantId}` (idempotent -- may already be deleted by first read).
3. Return 200 `{ ok: true }`

## GitHub Fetch Injection
The functions that call GitHub API must accept a `fetch` parameter so tests can inject a stub:

```js
function githubFetch(env) {
  return env._githubFetch || fetch;
}
```

Tests set `env._githubFetch = stubGitHubFetch(...)`. Production uses the global `fetch`.

## Observability -- log.js JSDoc Update
Also update `src/log.js`: add `'oauth'` to the valid subsystems list in the JSDoc comment. Add to the NEVER LOG section: raw GitHub access tokens, raw session cookie values, OAuth authorization codes, raw state parameter values. This is a small change -- just update the JSDoc, do NOT restructure the file.

## Session Reject Logging
In `verifySession()`, on failure paths, log: `oauth.session_reject` (severity 4): `{ cip, sessionIdPrefix, reason }`. Use `ctx` if available, or skip logging if no context (verifySession doesn't have ctx -- use a fire-and-forget fetch to the log endpoint, or simply don't log in verifySession since it runs on every request and logging failures would add noise. Better approach: return the reason in the result and let the caller log it).

## Secrets Required (document in code comments)
- `GITHUB_CLIENT_ID` -- can be a [vars] entry (public)
- `GITHUB_CLIENT_SECRET` -- must be a Wrangler secret
- `SESSION_SECRET` -- must be a Wrangler secret (32+ random bytes, hex-encoded)

## Security Requirements
- NEVER store the GitHub access token
- NEVER log the GitHub access token, authorization codes, or raw session cookie values
- Session IDs are hashed (SHA-256) before D1 storage
- State parameters are single-use (deleted from KV after consumption)
- PKCE code_verifier is stored in KV alongside state (same entry)
- The `__Host-` cookie prefix enforces Secure, no Domain, Path=/
- First-key KV entry is deleted on first read (not retained for TTL duration)

## Logging Pattern
Follow existing pattern: `ctx.waitUntil(log(env, severity, 'oauth', { event, ...fields }) ?? Promise.resolve())`
Use `computeCip(env, clientIp)` for IP anonymization.
Log `sessionIdPrefix` (first 8 chars of session id_hash) for correlation.
Log `githubUserId` (integer) -- never log github_login in structured fields.

## Deliverables
- `src/oauth.js` -- OAuth route handlers
- `src/session.js` -- Session verification and cookie management
- Modified `src/log.js` -- JSDoc update only

## What NOT to do
- Do NOT modify `src/auth.js` (existing Bearer token auth stays untouched)
- Do NOT modify `src/admin.js`
- Do NOT store the GitHub access token anywhere
- Do NOT use JWT for sessions
- Do NOT implement CSRF tokens (custom header approach is used instead)
- Do NOT add oauth.session_validate logging (fires on every request, too noisy)
