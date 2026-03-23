# Domain Plan Contribution: api-design-minion

## Recommendations

### 1. Separate `/v1/account/*` surface -- do NOT reuse `/v1/admin/keys`

The admin API (`/v1/admin/keys`) and the new self-serve account API serve fundamentally different trust domains:

| Dimension | Admin API | Account API |
|-----------|-----------|-------------|
| Auth mechanism | `ADMIN_KEY` (infrastructure secret, Bearer token) | Session cookie (HttpOnly, issued via OAuth) |
| Authorization model | Operator-level: can manage ANY tenant | User-level: can only manage YOUR tenant |
| tenantId source | Explicit in request body (`"tenantId": "acme"`) | Implicit from session (derived from authenticated user) |
| Scope control | Can grant any scope including `admin` | Should NOT grant `admin` scope (self-serve users get `capture` + `read`) |
| Existing consumers | Operator scripts, 1Password-based workflows | Browser-based web UI |

**Reusing the same path with different auth** creates confusion and security risk:
- A single `/v1/admin/keys` endpoint that behaves differently depending on whether the caller sends a Bearer token or a cookie is hard to reason about, hard to document, and easy to misconfigure.
- The admin API's `tenantId` field is required in the request body. The account API should NEVER accept a `tenantId` -- it must be derived from the session. Mixing these on the same endpoint requires conditional validation that invites privilege escalation bugs.
- operationId conventions break down: `createAdminKey` and `createAccountKey` are semantically different operations with different request/response shapes.

**Recommendation: `/v1/account/keys`** as a separate namespace. Clean separation, no backward compatibility concerns with existing admin API, and no auth-confusion surface.

### 2. OAuth endpoints live outside `/v1/` -- use `/auth/*`

OAuth flow endpoints are not versioned API resources. They are browser-interactive redirects with specific HTTP semantics (302 redirects, cookie setting, HTML responses). Placing them under `/v1/` would imply they are part of the JSON API contract, which they are not.

```
GET  /auth/github           -- initiate OAuth (302 -> GitHub)
GET  /auth/github/callback  -- handle callback (set cookie, 302 -> /ui)
POST /auth/logout           -- destroy session (clear cookie, 204)
GET  /auth/session          -- return current session info (JSON, for UI)
```

**Rationale for `/auth/session`**: The UI needs a lightweight way to check whether the current session cookie is valid and get the user's display name and tenant ID without making a full API call. This avoids coupling session validation to any specific data endpoint. It also provides the tenant context the UI needs to render the account settings page.

Response shape for `GET /auth/session`:
```json
{
  "authenticated": true,
  "user": {
    "githubId": 12345,
    "githubLogin": "octocat",
    "tenantId": "gh-octocat",
    "tosAcceptedAt": "2026-03-23T10:00:00Z"
  }
}
```

When unauthenticated (no cookie or expired session):
```json
{
  "authenticated": false
}
```

This returns 200 in both cases. The UI checks `authenticated` to decide whether to show the login gate or the app shell. Using 200 (not 401) keeps this endpoint simple -- it is an informational query, not a protected resource.

### 3. Account API endpoint design

```
GET    /v1/account/keys            -- list caller's API keys
POST   /v1/account/keys            -- create a new key for caller's tenant
DELETE /v1/account/keys/:keyHash   -- revoke one of caller's keys
GET    /v1/account/usage           -- caller's own usage for current period
```

All `/v1/account/*` routes:
- Require a valid session cookie (no Bearer token accepted)
- Derive `tenantId` from the session -- the request body NEVER contains `tenantId`
- Are scoped to the authenticated user's tenant -- no cross-tenant access possible by construction
- Return `401` if the session cookie is absent, invalid, or expired
- Return `403` if the user has not accepted ToS (see below)

#### POST /v1/account/keys

Request body:
```json
{
  "name": "my-integration",
  "scopes": ["capture", "read"]
}
```

Key differences from `POST /v1/admin/keys`:
- No `tenantId` field (derived from session)
- `scopes` is restricted: only `["capture"]`, `["read"]`, or `["capture", "read"]` are valid. `"admin"` scope is NOT available through self-serve. This is enforced at the handler level, not just documented.
- `createdBy` is set to `"github:<githubId>"` (e.g., `"github:12345"`), not `"admin"`. This provides audit trail for who created the key.

Response (201 Created):
```json
{
  "key": "wrl_live_...",
  "keyHash": "abc123...",
  "tenantId": "gh-octocat",
  "scopes": ["capture", "read"],
  "name": "my-integration",
  "createdAt": "2026-03-23T10:00:00Z",
  "warning": "Store this key now. It cannot be retrieved after this response."
}
```

Same "shown once" semantics as the admin API. `Cache-Control: private, no-store`.

#### GET /v1/account/keys

Response (200):
```json
{
  "data": [
    {
      "keyHash": "abc123...",
      "scopes": ["capture", "read"],
      "name": "my-integration",
      "createdAt": "2026-03-23T10:00:00Z",
      "createdBy": "github:12345"
    }
  ]
}
```

Same shape as admin list, but automatically filtered to the session's `tenantId`. The `tenantId` field can be omitted from each item since it is always the caller's own tenant (reducing noise), or included for consistency -- I lean toward including it for consistency with the admin response shape, which makes SDK code reusable.

#### DELETE /v1/account/keys/:keyHash

Same behavior as admin revoke, but:
- Only keys belonging to the session's tenant can be revoked
- A DELETE targeting a keyHash that belongs to a different tenant returns `404` (not `403`, to avoid leaking key existence across tenants)
- Last-key guard: same logic as admin (prevent revoking the last `admin`-scoped key), though self-serve users should not have `admin`-scoped keys. Consider also guarding against revoking the LAST key entirely (leaving the tenant with no keys at all), since a self-serve user cannot create keys via the admin API.

#### GET /v1/account/usage

Same shape as `GET /v1/admin/usage?tenant=X`, but `tenant` is implicit from the session. No query parameter needed.

### 4. Auth disambiguation: how the router knows which auth to use

The current router in `src/index.js` uses a simple prefix check:

```js
if (pathname.startsWith('/v1/admin/')) {
  // verify ADMIN_KEY
}
```

Extend this pattern with an equivalent block for account routes:

```js
if (pathname.startsWith('/v1/account/')) {
  // verify session cookie
}
```

This keeps auth routing dead simple:

| Path prefix | Auth mechanism | Auth function |
|-------------|----------------|---------------|
| `/v1/admin/` | Bearer token (ADMIN_KEY) | `verifyAdminKey()` |
| `/v1/account/` | Session cookie | `verifySession()` (new) |
| `/v1/captures`, `/v1/webhooks`, etc. | Bearer token (API key) | `verifyApiKey()` |
| `/auth/*` | None (public) or cookie (logout) | Inline in handler |

No route ever accepts multiple auth mechanisms. This eliminates token-confusion risk entirely. A session cookie on a `/v1/captures` request is ignored. A Bearer token on a `/v1/account/keys` request is rejected. The auth path is determined by the URL prefix, not by which credentials are present.

**New function: `verifySession(request, env)`**

Add to `src/auth.js`. Returns:
```js
// Success
{ ok: true, tenantId: 'gh-octocat', githubId: 12345, githubLogin: 'octocat', authMethod: 'session' }
// Failure
{ ok: false, response: Response, reason: 'session_expired' | 'session_not_found' | 'no_cookie' }
```

The `authMethod: 'session'` field integrates with the existing logging convention (admin endpoints log `authMethod: 'admin_key'`, API key endpoints log `authMethod: 'kv'` or `authMethod: 'legacy'`).

### 5. CSRF protection for session-authenticated mutations

Session cookies are automatically sent by the browser on every same-origin request. This makes POST and DELETE endpoints vulnerable to CSRF unless mitigated.

**Recommended approach: Double-submit cookie pattern with `SameSite=Lax`**

Layer 1 -- `SameSite=Lax` cookie attribute:
- Prevents the browser from sending the session cookie on cross-origin POST requests (form submissions from other sites)
- Effective against the most common CSRF vector (hidden form auto-submission)
- Not sufficient alone: `SameSite=Lax` allows cookies on top-level navigations (GET), and some browsers have had implementation bugs

Layer 2 -- Custom request header check:
- Require all session-authenticated mutations (POST, DELETE) to include a custom header: `X-WRL-CSRF: 1`
- The VALUE does not matter (even `1` is fine). What matters is that the header EXISTS.
- Browsers enforce CORS preflight for custom headers. A cross-origin POST with `X-WRL-CSRF` triggers a preflight OPTIONS request. Since the server does not include `Access-Control-Allow-Headers: X-WRL-CSRF` for `/v1/account/*` routes, the preflight fails and the browser never sends the real request.
- This is the simplest CSRF protection that works: no tokens to manage, no server-side state, no synchronization issues. It leverages the browser's own CORS enforcement.

**Implementation in the router**:
```js
if (pathname.startsWith('/v1/account/')) {
  const session = await verifySession(request, env);
  if (!session.ok) { response = session.response; }

  // CSRF check for mutations
  if (!response && (request.method === 'POST' || request.method === 'DELETE')) {
    if (!request.headers.has('X-WRL-CSRF')) {
      response = problemResponse(403, 'CSRF header X-WRL-CSRF is required for mutations');
    }
  }
}
```

The UI's `apiFetch` wrapper adds `X-WRL-CSRF: 1` to all non-GET requests when the user is session-authenticated.

**Why NOT a CSRF token?**: CSRF tokens (synchronizer pattern) require server-side state (store the token, validate on POST). For a Cloudflare Worker with D1, this adds a DB read on every mutation just for CSRF validation. The custom-header approach achieves the same protection with zero server-side state and zero additional latency.

### 6. ToS acceptance gate

Account API endpoints (except `GET /auth/session`) should return `403` if the user has not accepted the Terms of Service. This creates a clear contract:

```json
{
  "type": "https://api.webresourceledger.com/errors/tos-not-accepted",
  "status": 403,
  "title": "Forbidden",
  "detail": "You must accept the Terms of Service before using this API.",
  "tosUrl": "https://github.com/benpeter/web-resource-ledger/blob/main/TERMS.md"
}
```

The UI handles this by redirecting to a ToS acceptance view. Once accepted (POST to a ToS endpoint or as part of the OAuth callback flow), the 403 goes away.

**Where ToS acceptance lives in the API**:
- Option A: Separate endpoint `POST /auth/tos-accept`
- Option B: Part of the first-login flow in `/auth/github/callback` (accept during signup)

I recommend **Option B**: the ToS acceptance is a checkbox on the first-login consent screen, recorded at tenant creation time. This avoids a separate endpoint and a separate UI view. The `tosAcceptedAt` timestamp in `GET /auth/session` confirms acceptance. The 403 gate on `/v1/account/*` is a defense-in-depth check -- in practice, no user should hit it because the UI handles the flow.

### 7. Rate limiting for new endpoints

| Endpoint group | Rate limit | Key |
|----------------|-----------|-----|
| `/auth/github`, `/auth/github/callback` | 10/60s | Per IP |
| `/auth/logout` | 10/60s | Per session |
| `/v1/account/*` | 30/60s | Per tenant (same KV counter approach as capture endpoints) |

The OAuth endpoints need IP-based rate limiting to prevent authorization code brute-force. Use a new CF rate limiter binding (`AUTH_RATE_LIMITER`).

The account endpoints use per-tenant limits consistent with the existing pattern. 30/60s is generous for key management operations (listing, creating, revoking keys are infrequent).

### 8. Response consistency and operationId conventions

New operationId naming follows the existing pattern:

| Endpoint | operationId |
|----------|-------------|
| `GET /v1/account/keys` | `listAccountKeys` |
| `POST /v1/account/keys` | `createAccountKey` |
| `DELETE /v1/account/keys/:keyHash` | `revokeAccountKey` |
| `GET /v1/account/usage` | `getAccountUsage` |
| `GET /auth/session` | `getSession` |
| `POST /auth/logout` | `logout` |

Response envelope follows the existing `{ data: [...] }` pattern for lists. Error responses continue to use RFC 9457 Problem Details (`application/problem+json`), which is already implemented in `src/responses.js`.

All account endpoints set `Cache-Control: private, no-store` (same as admin endpoints).

### 9. Backward compatibility: zero changes to existing API

The existing admin API and API-key-authenticated endpoints are completely unaffected:

- `/v1/admin/*` continues to use `verifyAdminKey` (ADMIN_KEY Bearer token)
- `/v1/captures`, `/v1/webhooks`, etc. continue to use `verifyApiKey` (API key Bearer token)
- No existing endpoint changes auth mechanism, request shape, or response shape
- The new `/v1/account/*` and `/auth/*` routes are purely additive
- Operator-provisioned tenants continue to work exactly as before

The only interaction point is in the data model: when a GitHub user signs up and their tenant is auto-provisioned, the tenant row is created in the same `tenants` table. API keys created via `/v1/account/keys` are stored in the same `api_keys` table with the same schema. The `createdBy` field distinguishes admin-created vs self-serve-created keys.

## Proposed Tasks

### Task 1: Design and implement `verifySession()` auth function
Add `verifySession(request, env)` to `src/auth.js`. This function:
- Reads the session cookie (name: `wrl_session`)
- Looks up the session in D1 (session table, designed by data-minion)
- Validates expiry
- Returns `{ ok: true, tenantId, githubId, githubLogin, authMethod: 'session' }` or `{ ok: false, response, reason }`
- Follows the same pattern as `verifyApiKey` and `verifyAdminKey`

**Depends on**: data-minion's session table schema

### Task 2: Add `/v1/account/*` routes and auth gate to router
Extend the router in `src/index.js`:
- Add prefix check for `/v1/account/` that calls `verifySession()`
- Add CSRF header check for POST/DELETE methods
- Add ToS acceptance check (403 if not accepted)
- Add rate limiter binding (`ACCOUNT_RATE_LIMITER` or reuse existing)
- Register the four new routes: list keys, create key, revoke key, usage

### Task 3: Implement account key CRUD handlers
New file `src/account.js` with:
- `handleAccountListKeys` -- list keys for session's tenantId
- `handleAccountCreateKey` -- create key (no tenantId in body, no admin scope)
- `handleAccountRevokeKey` -- revoke key (tenant-scoped, 404 for wrong tenant)
- `handleAccountGetUsage` -- usage for session's tenantId

These handlers reuse the existing DB functions from `src/db.js` (same `createApiKeyRecord`, `listApiKeyRecords`, `revokeApiKeyRecord`, `getUsage`). The difference is in auth and input validation, not in data access.

### Task 4: Implement `/auth/*` endpoints
New file `src/oauth.js` with:
- `handleAuthGitHub` -- generate state param, store in KV/D1, redirect to GitHub
- `handleAuthGitHubCallback` -- exchange code for token, fetch user identity, create/link tenant, create session, set cookie, redirect to /ui
- `handleAuthLogout` -- delete session from D1, clear cookie, return 204
- `handleAuthSession` -- return current session info

**Depends on**: oauth-minion's flow design, data-minion's schema

### Task 5: Add CSRF header to UI `apiFetch`
Modify `src/ui/ui-auth.js` to include `X-WRL-CSRF: 1` header on all POST and DELETE requests when using session-based auth.

### Task 6: Add rate limiter binding for auth endpoints
Add `AUTH_RATE_LIMITER` to `wrangler.toml` (both production and staging). 10/60s per IP, for the `/auth/github` and `/auth/github/callback` endpoints.

## Risks and Concerns

### Risk 1: Last-key self-revocation trap
If a self-serve user revokes their only API key, they cannot create a new one via the API (the account endpoints use session auth, so they can still create keys via the web UI). However, the "shown once" pattern means they cannot recover the revoked key. The UI should warn before revoking the last key, and the API should either block it (409 Conflict) or include a warning in the response.

**Recommendation**: Block revoking the last active key for a self-serve tenant via the account API (return 409 with clear message). The admin API can still revoke it for operator intervention.

### Risk 2: Token confusion if both auth paths exist on UI
The current UI stores an API key in sessionStorage and sends it as Bearer token. The new OAuth flow uses a cookie. If both auth paths coexist in the UI, the UI must know which mode it is in and never mix them (e.g., sending both a Bearer token AND a cookie on the same request). The router design above eliminates server-side confusion (path determines auth), but the UI needs a clean state machine: either you are in "API key mode" (legacy, sessionStorage) or "OAuth mode" (cookie).

**Recommendation to frontend-minion**: The UI should detect the auth mode on load: if a session cookie exists (check via `GET /auth/session`), use cookie-based mode. If no session exists, show the login screen with both "Sign in with GitHub" and "Enter API key" options. Do not allow both modes simultaneously.

### Risk 3: CORS and the account API
The account endpoints use cookies, not Bearer tokens. Browsers handle cookies automatically for same-origin requests (the UI and API are both at `api.webresourceledger.com`). No CORS configuration is needed for the account API because the UI and API are same-origin. However, if in the future the UI moves to a different subdomain (e.g., `app.webresourceledger.com`), CORS with `credentials: include` would be needed. For now, same-origin is simpler and correct.

### Risk 4: Session cookie and existing Bearer-token UI coexistence during migration
During the transition period, existing users who have been manually given API keys may still want to use the "paste your API key" flow. The API design supports this: the `/v1/captures` endpoints continue to accept Bearer tokens regardless of whether the caller also has a session cookie. The two auth paths are completely independent (different URL prefixes, different auth functions). No migration is needed for existing API key users.

### Risk 5: GitHub user ID to tenant ID mapping is a one-way door
The tenant ID format for self-serve users (e.g., `gh-octocat` or `gh-12345`) is baked into API keys, capture records, and usage counters. Changing this format later requires a data migration. The data-minion should carefully consider whether to use the GitHub numeric ID (stable but opaque: `gh-12345`) or the GitHub login/username (human-readable but mutable: `gh-octocat`). I recommend the numeric ID for stability, with the login stored separately for display purposes.

## Additional Agents Needed

All agents from the metaplan are appropriate. From the API design perspective, the most critical dependencies are:

1. **data-minion** (BLOCKING): The session table schema and tenant-linking strategy directly determine the `verifySession()` return shape and the account handler logic. API design cannot be finalized until the data model is settled.

2. **oauth-minion** (BLOCKING): The cookie attributes (name, expiry, SameSite, Secure, HttpOnly) and the session lifecycle (creation in callback, destruction in logout) are protocol decisions that the API design builds on.

3. **security-minion** (SHOULD REVIEW): The CSRF protection strategy (custom header vs token) and the scope restriction (no `admin` scope for self-serve) need security review. The "last key" revocation guard logic also has security implications.

4. **frontend-minion** (INFORMATIONAL): The UI needs to know: (a) `GET /auth/session` is the way to check auth state, (b) `X-WRL-CSRF: 1` header is required on all mutations to `/v1/account/*`, (c) the "shown once" key display uses the same 201 response body as the admin API.

5. **test-minion**: The account endpoints share DB functions with the admin endpoints. Tests should verify tenant isolation (account handler cannot access another tenant's keys), scope restriction (cannot create admin-scoped keys), and CSRF enforcement (mutations without `X-WRL-CSRF` return 403).
