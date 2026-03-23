# Phase 3: Synthesis -- Self-Serve Signup via GitHub OAuth

## Delegation Plan

**Team name**: self-serve-oauth
**Description**: Add GitHub OAuth self-serve signup, session-based auth, and account key management to the WRL Worker, alongside the existing admin API.

---

### Conflict Resolutions

**Conflict 1: OAuth state storage -- KV (oauth-minion) vs D1 (data-minion)**

Chosen: KV with TTL
Over: D1 `oauth_states` table
Why: OAuth state is ephemeral by design (10-minute lifetime, single-use, high-churn). KV's built-in TTL expiration handles cleanup automatically with zero application code. D1 would require either lazy cleanup queries or a cron trigger, adding complexity for a table that should always be near-empty. The oauth-minion's argument that KV is purpose-built for this access pattern is compelling. The data-minion's consistency concern is irrelevant -- by the time the callback fires (seconds later, after user interaction with GitHub), KV eventual consistency has settled. This also avoids a migration table for something that never persists beyond 10 minutes.

**Conflict 2: CSRF approach -- synchronizer token (security-minion) vs custom header check (api-design-minion)**

Chosen: Custom header check (`X-WRL-CSRF: 1`) + `SameSite=Lax`
Over: Per-session synchronizer token stored in D1
Why: The custom header approach provides equivalent protection to a synchronizer token for this specific architecture. Both prevent cross-origin POST/DELETE because: (1) SameSite=Lax blocks the cookie on cross-origin POST, and (2) the custom header triggers a CORS preflight that the server does not satisfy for `/v1/account/*`. The key insight from api-design-minion: custom headers cannot be set by cross-origin forms or simple requests, which is the same protection synchronizer tokens provide. The custom header approach has zero server-side state, zero additional D1 reads, and zero token synchronization issues across tabs. The security-minion's subdomain concern (`__Host-` cookie prefix already mitigates cookie setting from subdomains; the custom header blocks cross-origin requests from subdomains too since they require CORS preflight). We drop the `csrf_token` column from the sessions table -- this removes complexity from schema, session creation, and the frontend (no token to fetch/store/send). The `ip_hash` column is also dropped to keep sessions minimal (YAGNI -- forensic logging via Coralogix already captures `cip`).

---

### Task 1: D1 Migration -- `0004_github_oauth.sql`
- **Agent**: data-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: none
- **Approval gate**: yes
- **Gate reason**: Schema is a one-way door. The table structure, column types, and foreign key relationships are baked into all downstream tasks. Getting this wrong means a migration.
- **Gate rationale**: |
    Chosen: Two new tables (github_users, sessions) with id_hash PK pattern on sessions, github_id INTEGER PK on github_users, tenant_id format `gh-{numeric_id}`
    Over: (1) Adding columns to tenants table (rejected: tenants is a billing entity, not an identity entity), (2) Using github_login in tenant ID (rejected: usernames are mutable and recyclable), (3) Storing raw session IDs in D1 (rejected: hash-before-store pattern matches api_keys)
    Why: Separate identity table enables future providers without schema changes. Numeric github_id is immutable. Hash-before-store on sessions limits breach blast radius.
- **Prompt**: |
    You are data-minion. Create the D1 migration file `migrations/0004_github_oauth.sql` for the WRL self-serve OAuth feature.

    ## Context
    The WRL Worker uses D1 (SQLite) for all metadata. Existing tables: tenants, captures, api_keys, signing_keys, usage_counters, webhooks. All foreign keys reference `tenants(id)` which is TEXT matching `/^[a-z0-9_-]{1,64}$/`.

    Existing migrations: 0001_initial_schema.sql, 0002_usage_counters.sql, 0003_webhooks.sql.

    Read the existing migrations in `/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/tender-painting-lollipop/migrations/` to match style and conventions.

    ## Tables to Create

    **github_users** -- maps GitHub OAuth identity to a WRL tenant:
    - `github_id` INTEGER NOT NULL PRIMARY KEY -- GitHub's stable numeric user ID
    - `github_login` TEXT NOT NULL -- mutable display name, refreshed on each login
    - `tenant_id` TEXT NOT NULL REFERENCES tenants(id) -- the WRL tenant this user owns
    - `tos_accepted_at` TEXT -- ISO 8601 timestamp of ToS acceptance (NULL until accepted)
    - `tos_version` TEXT -- version identifier of accepted ToS (e.g., "2026-03-23")
    - `created_at` TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    - `updated_at` TEXT
    - UNIQUE INDEX on tenant_id (one tenant per GitHub user, one GitHub user per tenant)

    **sessions** -- server-side session records for cookie-based auth:
    - `id_hash` TEXT NOT NULL PRIMARY KEY CHECK (length(id_hash) = 64) -- SHA-256 of session cookie value
    - `github_id` INTEGER NOT NULL REFERENCES github_users(github_id)
    - `tenant_id` TEXT NOT NULL REFERENCES tenants(id) -- denormalized for hot-path query
    - `created_at` TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    - `expires_at` TEXT NOT NULL
    - INDEX on (github_id, created_at) for "all sessions for user" queries
    - INDEX on (expires_at) for cleanup queries

    ## Design Decisions (already settled)
    - `id_hash` uses SHA-256 of session ID, same hash-before-store pattern as api_keys. The cookie holds the raw session token; D1 stores only the hash.
    - No `csrf_token` column -- CSRF is handled via custom header check (`X-WRL-CSRF: 1`), no server state needed.
    - No `ip_hash` column -- IP forensics via Coralogix `cip`, not D1.
    - No `github_login` in sessions -- fetched from github_users via JOIN only when needed.
    - OAuth state parameters are stored in KV (not D1) -- no `oauth_states` table.
    - Tenant IDs for self-serve users follow format `gh-{github_numeric_id}` (e.g., `gh-12345678`).
    - `tos_version` stored from day one for future re-consent support.

    ## Constraints
    - Use PRAGMA foreign_keys = ON at the top
    - Include clear comments explaining each table's purpose
    - Match the style of existing migrations (read them first)

    ## Deliverables
    - `migrations/0004_github_oauth.sql`

    ## What NOT to do
    - Do NOT create an oauth_states table (state goes in KV)
    - Do NOT modify any existing table
    - Do NOT add columns to the tenants table
    - Do NOT add a csrf_token or ip_hash column to sessions
- **Deliverables**: `migrations/0004_github_oauth.sql`
- **Success criteria**: Migration creates github_users and sessions tables with correct types, constraints, indexes, and foreign keys. Passes `wrangler d1 migrations apply --local`.

---

### Task 2: db.js Functions -- GitHub Users, Sessions, OAuth State
- **Agent**: data-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |
    You are data-minion. Add data access functions to `src/db.js` for GitHub users and sessions.

    ## Context
    Read `src/db.js` to understand existing patterns: camelCase return shapes, parameter validation, JSDoc, `db.batch()` for atomicity.

    Read `src/auth.js` to see the existing `hashApiKey()` function (SHA-256 hex). Sessions use the same hash pattern.

    The migration (Task 1) creates tables `github_users` and `sessions`. OAuth state is stored in KV, not D1.

    ## Functions to Add

    **GitHub users:**
    - `findGitHubUser(db, githubId)` -- SELECT by github_id. Returns `{ githubId, githubLogin, tenantId, tosAcceptedAt, tosVersion, createdAt }` or null.
    - `createGitHubUser(db, { githubId, githubLogin, tenantId, tosAcceptedAt, tosVersion })` -- INSERT into github_users AND `INSERT OR IGNORE INTO tenants`. Use `db.batch()` for atomicity (same pattern as `createCapture`). Returns the inserted record.
    - `updateGitHubLogin(db, githubId, githubLogin)` -- UPDATE github_login and updated_at. Called on every OAuth login to keep display name current.
    - `acceptTos(db, githubId, tosVersion)` -- UPDATE tos_accepted_at = now and tos_version WHERE tos_accepted_at IS NULL. Idempotent.

    **Sessions:**
    - `createSession(db, { idHash, githubId, tenantId, expiresAt })` -- INSERT into sessions.
    - `getSession(db, idHash)` -- SELECT by id_hash. Returns `{ idHash, githubId, tenantId, createdAt, expiresAt }` or null. Does NOT check expiry (caller checks -- they need the record for logging even when expired).
    - `deleteSession(db, idHash)` -- DELETE by id_hash.
    - `deleteExpiredSessions(db)` -- `DELETE FROM sessions WHERE expires_at < datetime('now')`. Returns count of deleted rows.
    - `deleteSessionsForUser(db, githubId)` -- DELETE all sessions for a github_id.

    ## Conventions
    - Follow the exact style of existing functions in db.js
    - camelCase return shapes (e.g., `row.github_id` -> `githubId`)
    - JSDoc on every function
    - Parameter validation where appropriate
    - Export all new functions

    ## Impact on Existing Code
    - The `api_keys.created_by` field is TEXT with no format constraint. Self-serve key creation will use `'github:{githubId}'` (e.g., `'github:12345'`). No schema change needed -- just a convention. Document this in a JSDoc comment.
    - Export `TENANT_ID_RE` is already exported -- no changes needed.

    ## Deliverables
    - Modified `src/db.js` with new functions appended (do not reorganize existing code)

    ## What NOT to do
    - Do NOT modify any existing function
    - Do NOT add OAuth state functions (state is in KV)
    - Do NOT create new files -- all functions go in db.js
- **Deliverables**: Modified `src/db.js` with 9 new functions
- **Success criteria**: All functions follow existing db.js patterns. JSDoc complete. Exports added to module.

---

### Task 3: OAuth Routes and Session Auth -- `src/oauth.js` and `src/session.js`
- **Agent**: oauth-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: Task 1, Task 2
- **Approval gate**: yes
- **Gate reason**: OAuth flow implementation is the core of this feature with security implications. The callback handler orchestrates tenant provisioning, session creation, and first API key generation in a single request. Incorrect implementation could leak GitHub tokens, allow CSRF, or create orphan tenants.
- **Gate rationale**: |
    Chosen: Three auth routes (/auth/login, /auth/callback, /auth/logout) + GET /auth/session info endpoint + verifySession() in session.js; KV for state/PKCE; HMAC-signed cookie with D1 session lookup
    Over: (1) JWT session token (rejected: cannot revoke server-side), (2) Encrypted self-contained cookie (rejected: payload size limits, no revocation), (3) State in cookie (rejected: couples CSRF to cookie security)
    Why: D1 sessions enable server-side revocation. KV state is self-cleaning via TTL. Separate session.js keeps auth.js untouched (existing admin/API key auth is not modified).
- **Prompt**: |
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
    - `verifySession(request, env)` -- Reads `__Host-wrl_session` cookie, verifies HMAC signature, looks up session in D1 via `getSession()`, checks expiry. Returns same shape as `verifyApiKey()`: `{ ok: true, tenantId, githubId, githubLogin, authMethod: 'session' }` or `{ ok: false, response, reason }`. The `githubLogin` comes from a JOIN or separate query to `github_users`.
    - `createSessionCookie(env, sessionId)` -- Creates the HMAC-signed cookie string: `__Host-wrl_session={sessionId}.{hmac_hex}; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`
    - `clearSessionCookie()` -- Returns a Set-Cookie header that clears the session cookie (Max-Age=0)
    - HMAC uses `crypto.subtle.sign('HMAC', key, data)` with `env.SESSION_SECRET` (hex-encoded 32+ bytes). Import the key once per request using `crypto.subtle.importKey`.
    - Session ID generation: `crypto.getRandomValues(new Uint8Array(32))`, base64url-encoded.
    - Session ID is hashed with SHA-256 before D1 storage (reuse `hashApiKey()` from auth.js -- it's a general SHA-256 hex function).

    **`src/oauth.js`** -- OAuth route handlers:

    `handleAuthLogin(request, env, ctx)` -- GET /auth/login:
    1. Generate state = 32 random bytes, base64url
    2. Generate code_verifier = 64 random bytes, base64url
    3. code_challenge = BASE64URL(SHA256(code_verifier))
    4. Store in KV: key `oauth_state:{state}`, value JSON `{ codeVerifier, createdAt }`, TTL 600 seconds
    5. Redirect 302 to `https://github.com/login/oauth/authorize?client_id={GITHUB_CLIENT_ID}&redirect_uri={callback_url}&state={state}&scope=read:user&code_challenge={code_challenge}&code_challenge_method=S256`
    6. Log `oauth.login_start` event
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
       - If not found: new user. The UI will handle ToS acceptance before we create the tenant. Store the GitHub user info in the session temporarily by redirecting to `/ui?flow=tos&ghid={githubId}&ghlogin={githubLogin}` -- NO. Better approach: Create the github_users record with tos_accepted_at = NULL. Create the tenant. Create the session. The ToS gate in the UI will block access until accepted. This avoids passing sensitive data in URLs.
    9. For new users: call `createGitHubUser(db, { githubId, githubLogin, tenantId: 'gh-' + githubId })`. Generate first API key using the same logic as admin.js `handleAdminCreateKey` (reuse `createApiKeyRecord` from db.js). Store the first key's raw value in KV with key `first_key:{tenantId}` and TTL 3600 (1 hour) for one-time retrieval.
    10. Create session: generate session ID, hash it, call `createSession()`, create HMAC-signed cookie.
    11. Opportunistic cleanup: `ctx.waitUntil(deleteExpiredSessions(db))`
    12. Redirect to `/ui?flow=welcome` (new user) or `/ui` (returning user). The query param tells the UI which view to show.
    13. Log appropriate events: `oauth.callback_success`, `oauth.session_create`, `oauth.tenant_create` (new user)

    `handleAuthLogout(request, env, ctx)` -- POST /auth/logout:
    1. Verify session via `verifySession()`. If no valid session, still return 200 (idempotent).
    2. Delete session from D1 via `deleteSession()`
    3. Clear cookie via `clearSessionCookie()`
    4. Return 200 JSON `{ ok: true }`
    5. Log `oauth.logout` event

    `handleAuthSession(request, env, ctx)` -- GET /auth/session:
    1. Verify session via `verifySession()`.
    2. If no session: return 200 `{ authenticated: false }`
    3. If session valid: fetch github_users record for display info. Return 200 `{ authenticated: true, user: { githubId, githubLogin, tenantId, tosAcceptedAt, tosVersion } }`
    4. This endpoint is how the UI checks auth state on boot.

    `handleFirstKey(request, env, ctx)` -- GET /v1/account/first-key:
    1. Verify session. If invalid: 401.
    2. Read KV key `first_key:{tenantId}`. If found: return the raw key as JSON `{ key, warning: "Store this key now. It cannot be retrieved after this response." }` with `Cache-Control: private, no-store`.
    3. If not found: return 404 `{ detail: "No first key available. Create a new key in account settings." }`
    4. Do NOT delete the KV entry on read -- it has a 1-hour TTL and the user may refresh.

    `handleFirstKeyAck(request, env, ctx)` -- POST /v1/account/first-key/ack:
    1. Verify session. If invalid: 401.
    2. Delete KV key `first_key:{tenantId}`.
    3. Return 200 `{ ok: true }`

    ## GitHub Fetch Injection
    The functions that call GitHub API must accept a `fetch` parameter so tests can inject a stub. Use a module-level helper:

    ```js
    function githubFetch(env) {
      return env._githubFetch || fetch;
    }
    ```

    Tests set `env._githubFetch = stubGitHubFetch(...)`. Production uses the global `fetch`.

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

    ## Logging Pattern
    Follow existing pattern: `ctx.waitUntil(log(env, severity, 'oauth', { event, ...fields }) ?? Promise.resolve())`
    Use `computeCip(env, clientIp)` for IP anonymization.
    Log `sessionIdPrefix` (first 8 chars of session id_hash) for correlation.
    Log `githubUserId` (integer) -- never log github_login in structured fields.

    ## Deliverables
    - `src/oauth.js` -- OAuth route handlers
    - `src/session.js` -- Session verification and cookie management

    ## What NOT to do
    - Do NOT modify `src/auth.js` (existing Bearer token auth stays untouched)
    - Do NOT modify `src/admin.js`
    - Do NOT store the GitHub access token anywhere
    - Do NOT use JWT for sessions
    - Do NOT implement CSRF tokens (custom header approach is used instead)
    - Do NOT add the `link-github` admin endpoint (deferred to backlog)
- **Deliverables**: `src/oauth.js`, `src/session.js`
- **Success criteria**: OAuth flow handles login, callback (new + returning user), logout, session info, and first-key retrieval. Session verification returns the same contract shape as verifyApiKey. GitHub token is never persisted.

---

### Task 4: Account Key Management -- `src/account.js`
- **Agent**: api-design-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: Task 2, Task 3
- **Approval gate**: no
- **Prompt**: |
    You are api-design-minion. Implement the self-serve account API for key management.

    ## Context
    Read these files:
    - `src/admin.js` -- the existing admin key handlers (your handlers mirror this pattern but with session auth and restricted scope)
    - `src/db.js` -- `createApiKeyRecord`, `listApiKeyRecords`, `revokeApiKeyRecord`, `getUsage`, `computePeriod`
    - `src/auth.js` -- `hashApiKey()` for key generation
    - `src/responses.js` -- `jsonResponse()`, `problemResponse()`
    - `src/session.js` (from Task 3) -- `verifySession()`
    - `src/log.js` and `src/ip-hash.js` -- logging pattern

    ## File to Create: `src/account.js`

    Four handlers, all session-authenticated (cookie, NOT Bearer token):

    **`handleAccountListKeys(request, env, ctx, match)`** -- GET /v1/account/keys:
    - Verify session (already done by router, session passed via request context or re-verify)
    - Call `listApiKeyRecords(db, tenantId)` (same as admin, but tenantId from session)
    - Return `{ data: [...] }` with masked keys (keyHash, name, scopes, createdAt, createdBy -- no raw key)
    - Set `Cache-Control: private, no-store`

    **`handleAccountCreateKey(request, env, ctx, match)`** -- POST /v1/account/keys:
    - Parse JSON body: `{ name, scopes }`. Validate name with `/^[a-zA-Z0-9 _.:-]{1,128}$/`.
    - Scopes restricted: only `['capture']`, `['read']`, or `['capture', 'read']`. Reject `'admin'` scope with 403.
    - Check key count: list keys for tenant, compare against max (default 5, configurable via tenant config `maxKeys`). Return 409 if at limit.
    - Generate key using same pattern as admin.js: random bytes -> base64url -> `wrl_live_` prefix -> hash -> store.
    - Set `createdBy` to `'github:{githubId}'` (from session).
    - Return 201 with raw key (shown once), keyHash, tenantId, scopes, name, createdAt, warning.
    - Set `Cache-Control: private, no-store`
    - Log `oauth.key_create`

    **`handleAccountRevokeKey(request, env, ctx, match)`** -- DELETE /v1/account/keys/:keyHash:
    - Extract keyHash from URL path (match[1])
    - Call `getApiKeyRecord(db, keyHash)`. If not found OR belongs to different tenant: return 404 (not 403, prevents info leakage)
    - Check last-key guard: if this is the tenant's only active key, return 409 with message: "Cannot revoke your only API key. Create a new key first."
    - Call `revokeApiKeyRecord(db, keyHash)`
    - Return 200 with revoked record
    - Log `oauth.key_revoke`

    **`handleAccountAcceptTos(request, env, ctx, match)`** -- POST /v1/account/tos:
    - Parse JSON body: `{ tosVersion }` (the version string, e.g., "2026-03-23")
    - Call `acceptTos(db, githubId, tosVersion)` from session
    - Return 200 `{ ok: true, tosAcceptedAt: new Date().toISOString() }`
    - Log `oauth.tos_accept`

    ## CSRF Protection
    All POST and DELETE handlers must check for the `X-WRL-CSRF` header. This check should be done by the router (see Task 5), but if the router does not check, the handlers must. Check: `if (!request.headers.has('X-WRL-CSRF'))` -> 403 "CSRF header X-WRL-CSRF is required for mutations".

    ## Response Format
    - Follow exactly the same envelope and error patterns as admin.js
    - Use `problemResponse()` for errors (RFC 9457)
    - Use `jsonResponse()` for success
    - All responses set `Cache-Control: private, no-store`

    ## Deliverables
    - `src/account.js`

    ## What NOT to do
    - Do NOT handle auth verification in handlers (router does it)
    - Do NOT accept a tenantId in the request body (always from session)
    - Do NOT allow `'admin'` scope in self-serve key creation
    - Do NOT modify admin.js or db.js
    - Do NOT create usage/billing endpoints (out of scope for this phase)
- **Deliverables**: `src/account.js`
- **Success criteria**: Four handlers matching admin.js patterns. Scope restriction enforced. Last-key guard works. CSRF header checked on mutations.

---

### Task 5: Router Integration -- Wire New Routes into `src/index.js`
- **Agent**: api-design-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: Task 3, Task 4
- **Approval gate**: no
- **Prompt**: |
    You are api-design-minion. Wire the new OAuth, session, and account routes into the WRL router.

    ## Context
    Read `src/index.js` carefully -- the entire file. Understand:
    - The routes array pattern (method, regex, handler)
    - How admin auth is checked (prefix-based, before route matching)
    - How rate limiting works (getRateLimitGroup, CF bindings)
    - How security headers are appended to every response

    ## Changes to `src/index.js`

    **1. New imports:**
    ```js
    import { handleAuthLogin, handleAuthCallback, handleAuthLogout, handleAuthSession, handleFirstKey, handleFirstKeyAck } from './oauth.js';
    import { handleAccountListKeys, handleAccountCreateKey, handleAccountRevokeKey, handleAccountAcceptTos } from './account.js';
    import { verifySession } from './session.js';
    ```

    **2. New routes (add to routes array, BEFORE the 404 fallthrough):**
    ```
    GET  /auth/login                    -> handleAuthLogin
    GET  /auth/callback                 -> handleAuthCallback
    POST /auth/logout                   -> handleAuthLogout
    GET  /auth/session                  -> handleAuthSession
    GET  /v1/account/first-key          -> handleFirstKey
    POST /v1/account/first-key/ack      -> handleFirstKeyAck
    GET  /v1/account/keys               -> handleAccountListKeys
    POST /v1/account/keys               -> handleAccountCreateKey
    DELETE /v1/account/keys/([a-f0-9]{64}) -> handleAccountRevokeKey
    POST /v1/account/tos                -> handleAccountAcceptTos
    ```

    **3. Auth gate for `/v1/account/*` routes (parallel to the admin auth block):**
    Add a new block after the admin auth block, before route matching:
    ```js
    const isAccountRoute = pathname.startsWith('/v1/account/');
    if (!response && isAccountRoute) {
      // Rate limit: per-IP using AUTH_RATE_LIMITER
      if (env.AUTH_RATE_LIMITER) {
        const { success } = await env.AUTH_RATE_LIMITER.limit({ key: clientIp });
        if (!success) {
          response = problemResponse(429, 'Rate limit exceeded. Try again later.', { 'Retry-After': '60' });
        }
      }

      // Session auth
      if (!response) {
        const session = await verifySession(request, env);
        if (!session.ok) {
          response = session.response;
        } else {
          // CSRF check for mutations
          if (request.method === 'POST' || request.method === 'DELETE') {
            if (!request.headers.has('X-WRL-CSRF')) {
              response = problemResponse(403, 'CSRF header X-WRL-CSRF is required for mutations');
            }
          }
          // Attach session to request for handlers (via a WeakMap or env._session)
          if (!response) {
            env._session = session;
          }
        }
      }
    }
    ```

    **4. Auth rate limit for `/auth/*` routes:**
    Add rate limiting for auth endpoints (before route matching):
    ```js
    const isAuthRoute = pathname.startsWith('/auth/');
    if (!response && isAuthRoute && env.AUTH_RATE_LIMITER) {
      const { success } = await env.AUTH_RATE_LIMITER.limit({ key: clientIp });
      if (!success) {
        response = problemResponse(429, 'Rate limit exceeded. Try again later.', { 'Retry-After': '60' });
      }
    }
    ```

    **5. Update getRateLimitGroup to include account routes:**
    ```js
    if (pathname.startsWith('/v1/account/')) return 'account';
    if (pathname.startsWith('/auth/')) return 'auth';
    ```

    **6. Session context passing:**
    The handlers in account.js need the authenticated session. Use `env._session` as a request-scoped property. The handlers read `env._session.tenantId`, `env._session.githubId`, etc. This is the same pattern as passing auth results through env -- temporary and request-scoped.

    ## Critical: Do NOT Change
    - The existing admin auth block (prefix check for `/v1/admin/`)
    - The existing route handlers or their signatures
    - The existing security headers block at the end
    - The existing CORS handling
    - Any existing import

    ## Deliverables
    - Modified `src/index.js`

    ## What NOT to do
    - Do NOT create a "try cookie, fall back to Bearer" auth function
    - Do NOT modify the admin auth block
    - Do NOT modify any existing route handler
    - Do NOT add CORS headers for account/auth routes (same-origin only)
- **Deliverables**: Modified `src/index.js`
- **Success criteria**: New routes registered. Auth gate checks session for /v1/account/* and rate limits for /auth/*. CSRF header enforced on mutations. Existing routes completely untouched.

---

### Task 6: Wrangler Config -- Rate Limiter and Vars
- **Agent**: iac-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |
    You are iac-minion. Add the new rate limiter binding and environment variable to `wrangler.toml`.

    ## Context
    Read `wrangler.toml`. Note the existing rate limiter bindings (CAPTURE_RATE_LIMITER through CAPTURE_IP_GUARD, namespace_ids 1001-1005 for production, 2001-2005 for staging).

    ## Changes

    **1. Add AUTH_RATE_LIMITER binding (production):**
    ```toml
    [[unsafe.bindings]]
    name = "AUTH_RATE_LIMITER"
    type = "ratelimit"
    namespace_id = "1006"
    simple = { limit = 10, period = 60 }
    ```

    **2. Add AUTH_RATE_LIMITER binding (staging):**
    ```toml
    [[env.staging.unsafe.bindings]]
    name = "AUTH_RATE_LIMITER"
    type = "ratelimit"
    namespace_id = "2006"
    simple = { limit = 10, period = 60 }
    ```

    **3. Add GITHUB_CLIENT_ID to [vars] (production):**
    ```toml
    GITHUB_CLIENT_ID = ""
    ```
    Leave empty -- will be set during deployment. It's a public value but we don't know it yet.

    **4. Add GITHUB_CLIENT_ID to [env.staging.vars]:**
    ```toml
    GITHUB_CLIENT_ID = ""
    ```

    **5. Add comment documenting new secrets:**
    Add a comment near the existing secrets documentation:
    ```toml
    # OAuth secrets (set via wrangler secret put):
    #   GITHUB_CLIENT_SECRET -- GitHub OAuth App client secret
    #   SESSION_SECRET       -- HMAC key for session cookie signing (32+ random bytes, hex)
    ```

    ## Deliverables
    - Modified `wrangler.toml`

    ## What NOT to do
    - Do NOT modify any existing binding
    - Do NOT add the GITHUB_CLIENT_SECRET or SESSION_SECRET to [vars] (they are secrets)
    - Do NOT add any queues, D1, R2, or KV bindings
- **Deliverables**: Modified `wrangler.toml`
- **Success criteria**: AUTH_RATE_LIMITER binding added for both production and staging with sequential namespace_ids. GITHUB_CLIENT_ID placeholder in vars.

---

### Task 7: Frontend -- Login Screen, Welcome, ToS, Settings, Auth Refactor
- **Agent**: frontend-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 3, Task 4, Task 5
- **Approval gate**: yes
- **Gate reason**: This is the most significant UI change since launch -- four new views, dual-auth refactor, and navigation changes. The auth gate layout and first-key UX directly affect user conversion.
- **Gate rationale**: |
    Chosen: "Sign in with GitHub" as primary CTA with visible (not collapsed) API key fallback; first-key on dedicated /ui?flow=welcome screen with copy-to-clipboard; ToS as checkbox gate before account access; settings page scoped to API key management only
    Over: (1) Collapsing the API key input behind a disclosure (rejected: operator users shouldn't hunt), (2) Passing first key in redirect URL (rejected: leaks in browser history), (3) Full account settings page with profile editing (rejected: YAGNI)
    Why: Primary CTA satisfices new users. Visible fallback doesn't alienate existing operator users. Dedicated welcome screen focuses attention on key copy-to-clipboard. Narrow settings scope prevents scope creep.
- **Prompt**: |
    You are frontend-minion. Implement the new frontend views and auth refactoring for WRL self-serve OAuth.

    ## Context
    Read ALL existing UI files to understand patterns:
    - `src/ui/ui-shell.js` -- HTML template assembly, how JS/CSS modules are inlined
    - `src/ui/ui-auth.js` -- current auth gate, `bootApp()`, `apiFetch()`, `renderAuthGate()`, `renderAppShell()`
    - `src/ui/ui-css.js` -- CSS module
    - `src/ui/ui-submit.js` -- submit view pattern (render + mount)
    - `src/ui/ui-detail.js` -- detail view pattern
    - `src/ui/ui-poll.js` -- polling pattern
    - `src/design-system.js` -- design system tokens

    The UI is vanilla JS with no framework. Each view exports a JS string constant that gets inlined into the HTML template. Views use a DOM construction pattern with render (return HTML string) and mount (attach event listeners) phases.

    ## New Files to Create

    **`src/ui/ui-login.js`** -- Login screen:
    - Exports `LOGIN_JS` string constant
    - "Sign in with GitHub" as `<a href="/auth/login">` (not a button -- it navigates)
    - GitHub mark SVG inlined (the Octicon mark, minimal ~200 bytes)
    - `.btn--github` styling: dark background (#24292e), white text
    - "Already have an API key?" section visible (not collapsed), visually subordinate
    - The API key input reuses the current `renderAuthGate` pattern (password input + Connect button)
    - Functions: `renderLogin()`, `mountLogin()`

    **`src/ui/ui-welcome.js`** -- First-key display:
    - Exports `WELCOME_JS` string constant
    - Calls `GET /v1/account/first-key` on mount
    - Displays key in read-only `<input type="text">` (easier to select than `<pre>`)
    - "Copy" button using `navigator.clipboard.writeText()` with fallback to `document.execCommand('copy')`
    - Button text changes to "Copied!" for 2 seconds, then reverts
    - `aria-live="polite"` region announces copy action to screen readers
    - Warning styled as caution alert using design system `--color-warning-bg`
    - "Continue to Dashboard" button calls `POST /v1/account/first-key/ack` then navigates to `#/captures`
    - No navigation chrome on this screen -- full focus on the key
    - If first-key endpoint returns 404, show message: "No pending key. You can create new keys in Account settings." with link to #/settings
    - Functions: `renderWelcome()`, `mountWelcome()`

    **`src/ui/ui-tos.js`** -- ToS acceptance gate:
    - Exports `TOS_JS` string constant
    - Shown when `GET /auth/session` returns `tosAcceptedAt: null`
    - Checkbox (unchecked by default): "I agree to the Terms of Service and Content Policy"
    - "Terms of Service" and "Content Policy" are links opening in new tabs
    - "Accept" button (disabled until checkbox checked)
    - "Cancel" button clears session (POST /auth/logout) and returns to login
    - On accept: POST /v1/account/tos with tosVersion "2026-03-23"
    - Functions: `renderTos()`, `mountTos()`

    **`src/ui/ui-settings.js`** -- Account settings (API key management):
    - Exports `SETTINGS_JS` string constant
    - Section: Account info (read-only): GitHub username, tenant ID, member since
    - Section: API Keys with limit indicator ("2 of 5 keys")
    - Key list using `.table` component: name, created date, scopes badges, [Revoke] button
    - "Create new key" button opens inline form: name input + scope checkboxes (capture, read) + Create button
    - After creating: show raw key inline with copy-to-clipboard (same pattern as welcome)
    - Revoke: inline confirmation ("Revoke 'my-key'? This cannot be undone. [Cancel] [Confirm]")
    - Last-key guard: if only 1 key, disable Revoke button with tooltip "Cannot revoke your only key"
    - Functions: `renderSettings()`, `mountSettings()`

    ## Modifications to Existing Files

    **`src/ui/ui-auth.js`** -- Major refactor:

    1. `bootApp()` changes:
       - Call `GET /auth/session` (with `credentials: 'same-origin'`)
       - If `{ authenticated: true }`: set `_authMethod = 'session'`, store user context
         - If `tosAcceptedAt` is null: render ToS gate
         - If URL has `?flow=welcome`: render welcome view
         - Else: render app shell
       - If `{ authenticated: false }`: check sessionStorage for API key
         - If key present: validate with existing flow, set `_authMethod = 'apikey'`
         - If no key: render login screen (not old auth gate)
       - Show a loading state during boot checks (prevent flash)

    2. `apiFetch()` changes:
       - If `_authMethod === 'session'`:
         - Set `credentials: 'same-origin'` (sends cookie automatically)
         - Do NOT add Authorization header
         - Add `X-WRL-CSRF: 1` header on POST and DELETE requests
       - If `_authMethod === 'apikey'`:
         - Current behavior (Bearer header from sessionStorage)
       - On 401 response:
         - Session auth: redirect to login screen (session expired)
         - API key auth: clear sessionStorage, render auth gate (current behavior)

    3. `renderAppShell()` changes:
       - Session auth users: nav shows "Captures | Settings | {username} | Sign out"
       - API key auth users: nav shows "Captures | Disconnect" (unchanged)
       - "Sign out" calls POST /auth/logout, then renders login screen

    4. Hash router additions:
       - `#/settings` -> renderSettings() + mountSettings()
       - Handle `?flow=welcome` query param on initial boot

    **`src/ui/ui-shell.js`** -- Import new JS modules:
    - Import `LOGIN_JS`, `WELCOME_JS`, `TOS_JS`, `SETTINGS_JS`
    - Inline them in the HTML template (same pattern as existing modules)

    **`src/ui/ui-css.js`** -- New styles:
    - `.btn--github` -- dark background (#24292e), white text, GitHub mark alignment
    - `.login-divider` -- "Already have an API key?" separator
    - `.welcome-key` -- monospace key display, high visual weight
    - `.welcome-warning` -- caution alert styling (uses `--color-warning-bg`)
    - `.tos-gate` -- full-screen gate layout
    - `.settings-keys` -- key list table styles
    - `.settings-create` -- inline create form styles
    - `.settings-confirm` -- inline revocation confirmation
    - `.copied-feedback` -- "Copied!" button state
    - `.scope-badge` -- small badge for scope display
    - All responsive, all using design system tokens, all reduced-motion safe

    ## Copy-to-Clipboard Pattern
    Create a reusable function:
    ```js
    function copyToClipboard(text, button) {
      navigator.clipboard.writeText(text).then(function() {
        var original = button.textContent;
        button.textContent = 'Copied!';
        button.setAttribute('aria-label', 'Copied to clipboard');
        setTimeout(function() {
          button.textContent = original;
          button.removeAttribute('aria-label');
        }, 2000);
      }).catch(function() {
        // Fallback: select the input text
        var input = button.previousElementSibling;
        if (input && input.select) { input.select(); }
      });
    }
    ```

    ## Error Handling
    - OAuth errors arrive as query params: `/ui?error=...`
    - Parse on boot: if `error` param present, show error message on login screen
    - Error messages: "GitHub authorization was cancelled." (denied), "Sign-in failed. Please try again." (generic), "Connection failed. Check your network." (network)
    - Every error shows a "Try again" link pointing to `/auth/login`

    ## Key Constraints
    - Vanilla JS only -- no frameworks, no build step
    - All JS is inlined in the HTML template (string constants)
    - Follow existing DOM construction patterns exactly
    - CSP is `script-src 'unsafe-inline'` -- inline JS works
    - The "Sign in with GitHub" button is an `<a>` tag, not a form (CSP `form-action 'none'` is set)
    - `credentials: 'same-origin'` for cookie-based requests (same origin)

    ## Deliverables
    - `src/ui/ui-login.js` (new)
    - `src/ui/ui-welcome.js` (new)
    - `src/ui/ui-tos.js` (new)
    - `src/ui/ui-settings.js` (new)
    - `src/ui/ui-auth.js` (modified)
    - `src/ui/ui-shell.js` (modified)
    - `src/ui/ui-css.js` (modified)

    ## What NOT to do
    - Do NOT use any framework or library
    - Do NOT use localStorage or persist raw keys
    - Do NOT modify the CSP
    - Do NOT add landing page CTAs (deferred)
    - Do NOT create a full profile editing page (settings is keys only)
    - Do NOT use a modal for revocation confirmation (use inline)
    - Do NOT remove the existing API key auth path (it must continue working)
- **Deliverables**: 4 new UI files, 3 modified UI files
- **Success criteria**: Dual-auth boot flow works (session cookie or API key). Login screen shows GitHub button prominently and API key input as secondary. Welcome view displays key with copy-to-clipboard. ToS gate blocks access until accepted. Settings page manages keys. Navigation reflects auth mode.

---

### Task 8: Test Fixtures and Vitest Config Updates
- **Agent**: test-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |
    You are test-minion. Update the test infrastructure for OAuth and session testing.

    ## Context
    Read these files:
    - `test/fixtures.js` -- existing test helpers (`cleanDb`, `seedApiKey`, etc.)
    - `test/apply-migrations.js` -- migration application for tests
    - `vitest.config.js` -- miniflare bindings
    - `test/admin-keys.test.js` -- existing test patterns to match

    ## Changes

    **1. `test/fixtures.js` -- Add new helpers:**

    `stubGitHubFetch(opts)` -- Returns a fetch function that stubs GitHub API calls:
    - Token exchange: returns `{ access_token, token_type, scope }`
    - User identity: returns `{ id, login, email }`
    - Throws on unexpected URLs
    - Accepts override opts: `{ accessToken, userId, login, email }`
    - Error variants: `stubGitHubFetchTokenError()`, `stubGitHubFetchNetworkError()`

    `createTestSession(db, env, opts)` -- Shortcut for tests that need a valid session:
    - Creates a github_users record and tenant
    - Creates a session row (hashed session ID)
    - Returns `{ cookie, tenantId, githubId, sessionId, idHash }` where `cookie` is the signed `__Host-wrl_session=...` string ready to pass as Cookie header
    - Requires access to `env.SESSION_SECRET` for HMAC signing

    `seedGithubUser(db, opts)` -- Inserts a github_users row with defaults

    **2. `test/fixtures.js` -- Update `cleanDb()`:**
    Add DELETE statements for new tables in correct FK order:
    1. `DELETE FROM sessions` (references github_users)
    2. `DELETE FROM github_users` (references tenants)
    3. ...existing deletes...

    **3. `vitest.config.js` -- Add new bindings:**
    ```js
    GITHUB_CLIENT_ID: 'test-github-client-id',
    GITHUB_CLIENT_SECRET: 'test-github-client-secret',
    SESSION_SECRET: 'a]'.repeat(32), // 64-char hex for test HMAC key
    ```
    The SESSION_SECRET needs to be valid hex that `crypto.subtle.importKey` accepts.

    ## Deliverables
    - Modified `test/fixtures.js`
    - Modified `vitest.config.js`

    ## What NOT to do
    - Do NOT write any test files yet (those are in Phase 6)
    - Do NOT modify any existing test file
    - Do NOT mock globalThis.fetch
- **Deliverables**: Modified `test/fixtures.js`, modified `vitest.config.js`
- **Success criteria**: `cleanDb()` cleans new tables in correct FK order. `createTestSession()` produces valid session cookies. `stubGitHubFetch()` returns realistic GitHub API responses.

---

### Task 9: Observability -- Structured Logging for OAuth Subsystem
- **Agent**: observability-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: Task 3, Task 4
- **Approval gate**: no
- **Prompt**: |
    You are observability-minion. Add structured logging for the new OAuth subsystem.

    ## Context
    Read `src/log.js` to understand the logging infrastructure. The `log()` function sends structured events to Coralogix. Subsystems: `capture`, `security`, `admin`, `webhook`, `usage`, `signing`.

    Read the oauth.js and account.js handlers (Tasks 3 and 4) to see where log calls are needed.

    ## Changes

    **1. `src/log.js` -- Update JSDoc:**
    - Add `'oauth'` to the valid subsystems list in the JSDoc comment
    - Add to the NEVER LOG section: raw GitHub access tokens, raw session cookie values, OAuth authorization codes, raw state parameter values

    **2. Review and add log calls in `src/oauth.js` (if not already present from Task 3):**

    Verify these events are logged (add if missing):
    - `oauth.login_start` (severity 3): `{ cip, provider: 'github' }`
    - `oauth.callback_success` (severity 3): `{ cip, provider: 'github', githubUserId, tenantId, isNewUser, sessionIdPrefix }`
    - `oauth.callback_fail` (severity 5): `{ cip, provider: 'github', reason }`
    - `oauth.session_create` (severity 3): `{ cip, tenantId, githubUserId, sessionIdPrefix, expiresAt }`
    - `oauth.session_reject` (severity 4): `{ cip, sessionIdPrefix, reason }` -- in verifySession() on failure
    - `oauth.logout` (severity 3): `{ cip, tenantId, sessionIdPrefix }`
    - `oauth.tenant_create` (severity 3): `{ cip, tenantId, githubUserId, provider: 'github' }`
    - `oauth.tos_accept` (severity 3): `{ cip, tenantId, githubUserId, tosVersion }`

    **3. Review and add log calls in `src/account.js` (if not already present from Task 4):**
    - `oauth.key_create` (severity 3): `{ cip, tenantId, keyHashPrefix, scopes, keyName, authMethod: 'session' }`
    - `oauth.key_revoke` (severity 3): `{ cip, tenantId, keyHashPrefix, keyName, scopes, authMethod: 'session' }`
    - `oauth.key_list` (severity 3): `{ cip, tenantId, count, authMethod: 'session' }`
    - `oauth.key_limit_reached` (severity 4): `{ cip, tenantId, currentCount, maxKeys }`

    **4. `src/session.js` -- Add auth method to session result:**
    Verify that `verifySession()` returns `authMethod: 'session'` so existing downstream log calls that include `authMethod` automatically get the correct value.

    **5. Add `sessionIdPrefix` computation:**
    When logging session-related events, compute `sessionIdPrefix = idHash.slice(0, 8)` (first 8 chars of the SHA-256 hash of the session ID). This is a correlation key, not a security value.

    **6. DO NOT log `oauth.session_validate`:**
    Add a comment in session.js: `// NOTE: session_validate is intentionally NOT logged -- fires on every authenticated request. See observability spec.`

    ## Pattern
    Every log call follows:
    ```js
    ctx.waitUntil(log(env, severity, 'oauth', { event: 'oauth.xxx', ...fields }) ?? Promise.resolve());
    ```

    Never log raw tokens, codes, session cookies, or client secrets.
    Always use `computeCip(env, clientIp)` for IP fields.
    Log `githubUserId` (integer), never `githubLogin` (string).

    ## Deliverables
    - Modified `src/log.js` (JSDoc update)
    - Verified/added log calls in `src/oauth.js`
    - Verified/added log calls in `src/account.js`
    - Verified `authMethod: 'session'` in session.js return

    ## What NOT to do
    - Do NOT add session_validate logging
    - Do NOT log github_login in structured fields
    - Do NOT refactor existing event names
    - Do NOT create a Coralogix alert configuration (that's operational, not code)
- **Deliverables**: Modified `src/log.js`, verified log calls in oauth.js and account.js
- **Success criteria**: All 12 event types are logged at correct severity. No sensitive data in log fields. `authMethod: 'session'` propagates correctly.

---

### Cross-Cutting Coverage

- **Testing**: Phase 6 (post-execution) handles test execution. Task 8 prepares fixtures. Test strategy defined by test-minion specialist contribution. No dedicated execution task needed.
- **Security**: Security concerns are embedded in Tasks 3 (OAuth flow, session security), 4 (scope restriction, CSRF), and 5 (route-level auth isolation). Phase 3.5 architecture review includes mandatory security-minion review.
- **Usability -- Strategy**: UX strategy recommendations are embedded in Task 7 (auth gate layout, first-key screen, ToS gate design, settings scope). Phase 3.5 includes mandatory ux-strategy-minion review.
- **Usability -- Design**: Task 7 creates user-facing UI. Phase 3.5 will include discretionary ux-design-minion review.
- **Documentation**: Phase 8 (post-execution) handles documentation. software-docs-minion will assess what needs updating.
- **Observability**: Task 9 handles structured logging. No runtime services need distributed tracing (single Worker).

---

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - ux-design-minion: Tasks 7 produces four new UI views with visual hierarchy decisions (login screen CTA prominence, first-key warning treatment, settings table layout). Design review ensures accessible interaction patterns.
    Review focus: Visual hierarchy of dual-auth gate, first-key warning treatment, settings key list interaction patterns.
  - accessibility-minion: Task 7 produces web-facing HTML that end users interact with (login, welcome, settings). Screen reader and keyboard navigation review needed for new interactive elements (copy button, inline confirmation, checkbox gate).
    Review focus: ARIA attributes on copy-to-clipboard feedback, keyboard navigation through settings key CRUD, ToS checkbox/button focus management.
- **Not selected**:
  - observability-minion: Already has a dedicated execution task (Task 9). Review would be redundant.
  - sitespeed-minion: The new views are lightweight inline JS/CSS with no external resources. Performance budget is not at risk.
  - user-docs-minion: No end-user documentation exists yet. Phase 8 assessment will determine if docs are needed.

---

### Decisions

- **Tenant ID format for self-serve users**
  Chosen: `gh-{github_numeric_id}` (e.g., `gh-12345678`)
  Over: `gh-{github_login}` (e.g., `gh-octocat`) as proposed by oauth-minion
  Why: GitHub usernames are mutable and recyclable. The tenant ID is embedded in R2 keys, KV rate limit counters, and capture records -- changing it later requires a data migration. The numeric GitHub ID is immutable. Human-readability is provided by `github_login` in the `github_users` table and session data.

- **First-key delivery mechanism**
  Chosen: Server stores raw key in KV with TTL, frontend fetches via dedicated endpoint
  Over: (1) Passing key in redirect URL query param (rejected: leaks in browser history and server logs), (2) Embedding key in session record (rejected: session is long-lived, key exposure should be time-bounded)
  Why: KV with 1-hour TTL is self-cleaning. Dedicated endpoint (`/v1/account/first-key`) allows the frontend to re-fetch on refresh without losing the key. Explicit ack (`/v1/account/first-key/ack`) lets the user dismiss intentionally.

- **ToS acceptance timing**
  Chosen: Create github_users record with tos_accepted_at = NULL on first login, enforce ToS gate in UI
  Over: (1) ToS screen before OAuth redirect (rejected: complicates flow, user hasn't authenticated yet), (2) ToS acceptance as part of callback handler (rejected: mixes protocol concerns with legal concerns)
  Why: Creating the tenant immediately on callback simplifies the flow -- one redirect, one session creation. The ToS gate in the UI is a soft block that the backend enforces via 403 on account endpoints when tosAcceptedAt is null. The session itself is valid (user can GET /auth/session) but account operations are blocked until ToS is accepted.

- **Landing page signup CTA**
  Chosen: Out of scope (deferred)
  Over: Adding a "Get started free" CTA to the landing page hero
  Why: ux-strategy-minion flagged this as a funnel gap, but the meta-plan explicitly excludes landing page changes. Users can reach self-serve signup via `/ui` directly or via docs. A landing page CTA is a Phase 8 backlog item.

- **Admin GitHub-tenant linking endpoint**
  Chosen: Deferred to backlog
  Over: Including `POST /v1/admin/tenants/:tenantId/link-github` in this phase
  Why: YAGNI for initial launch. The linking scenario (operator pre-links a GitHub user to an existing tenant) is an edge case that can be handled manually via D1 SQL if needed. The data model supports it -- a row in github_users with a non-`gh-` tenant_id. The admin endpoint can be added when an operator actually needs it.

---

### Risks and Mitigations

1. **KV eventual consistency for OAuth state** (MEDIUM): State written during login might not be readable at callback if the requests hit different edge locations. Mitigation: OAuth flow involves multi-second user interaction with GitHub, making the consistency window irrelevant in practice. The 600-second TTL provides ample buffer.

2. **GitHub API availability during callback** (MEDIUM): Two sequential HTTP calls to GitHub. Mitigation: 5-second timeout on each. User-friendly error redirect with "try again" link. Authorization code is single-use so no automatic retry.

3. **Session table growth** (LOW): Expired sessions accumulate. Mitigation: `deleteExpiredSessions()` called opportunistically on login/logout via `ctx.waitUntil()`. `idx_sessions_expires` index makes cleanup efficient. Cron trigger deferred (YAGNI).

4. **First-key loss** (MEDIUM, UX): User closes tab before copying. Mitigation: Key stays in KV for 1 hour (survives tab close + reopen). Settings page allows creating replacement keys. Welcome screen mentions this recovery path.

5. **Tenant merge not supported** (HIGH for linked users): If a user signs up before the operator links them, they get a separate tenant. Mitigation: Document limitation. Operator should link before user's first login. Manual D1 update available for edge cases. Automated merge is a backlog item.

6. **Auth boundary drift** (HIGH if it happens): Future routes might accidentally accept wrong auth type. Mitigation: Strict prefix-to-auth-method mapping enforced in router. Phase 5 code review will verify isolation. Test suite (Phase 6) includes cross-auth-method rejection tests.

---

### Execution Order

```
Batch 1 (parallel):
  Task 1: D1 Migration (data-minion)          [GATE]
  Task 6: Wrangler Config (iac-minion)

Batch 2 (parallel, after Task 1 clears gate):
  Task 2: db.js Functions (data-minion)
  Task 8: Test Fixtures (test-minion)

Batch 3 (sequential, after Task 2):
  Task 3: OAuth Routes + Session Auth (oauth-minion)  [GATE]

Batch 4 (parallel, after Task 3):
  Task 4: Account Key Management (api-design-minion)
  Task 9: Observability (observability-minion)

Batch 5 (after Task 3 + Task 4):
  Task 5: Router Integration (api-design-minion)

Batch 6 (after Task 5):
  Task 7: Frontend (frontend-minion)            [GATE]
```

Gate positions:
- After Task 1 (schema) -- MUST gate, hard to reverse
- After Task 3 (OAuth + session) -- MUST gate, core auth implementation
- After Task 7 (frontend) -- MUST gate, user-visible changes

Total gates: 3 (within budget of 3-5)

---

### Verification Steps

After all tasks complete:
1. **Admin API regression**: Run existing `test/admin-keys.test.js` unchanged -- all must pass
2. **OAuth flow**: Deploy to staging. Navigate to `/auth/login`. Complete GitHub OAuth. Verify session cookie set. Verify tenant created in D1. Verify first key displayed.
3. **Session auth**: After login, verify `GET /auth/session` returns user info. Verify `/v1/account/keys` returns keys. Verify POST/DELETE require `X-WRL-CSRF` header.
4. **Auth isolation**: Verify session cookie is ignored on `/v1/captures`. Verify Bearer token is rejected on `/v1/account/keys`.
5. **ToS gate**: New user without ToS acceptance cannot access account endpoints (403). After acceptance, access granted.
6. **Logout**: POST /auth/logout clears session. Subsequent requests return 401.
7. **Rate limiting**: Verify `/auth/login` and `/auth/callback` are rate-limited at 10/60s per IP.
8. **Key management**: Create key via settings, verify shown once. Revoke key, verify cannot revoke last key.
