# Domain Plan Contribution: test-minion

## Recommendations

### 1. Mock Strategy for GitHub OAuth Token Exchange

The GitHub OAuth flow involves three external touchpoints: (a) redirect to `github.com/login/oauth/authorize`, (b) token exchange POST to `github.com/login/oauth/access_token`, and (c) user identity GET to `api.github.com/user`. These cannot be tested end-to-end inside miniflare.

**Recommended approach: inject a `fetch` wrapper at the module boundary, not at `globalThis.fetch`.**

The Worker code that calls GitHub should accept a `fetch` function parameter (or use `env.GITHUB_FETCH` as a binding). In production this is the global `fetch`; in tests it is a stub that returns canned GitHub API responses. This is the same pattern as the existing `stubRenderer` in `test/fixtures.js` -- the capture pipeline injects a renderer, and tests substitute a stub.

Concrete mock shape for `test/fixtures.js`:

```js
export function stubGitHubFetch({ accessToken, userId, login, email } = {}) {
  return async (url, opts) => {
    // Token exchange
    if (url === 'https://github.com/login/oauth/access_token') {
      return new Response(JSON.stringify({
        access_token: accessToken || 'gho_test_token_123',
        token_type: 'bearer',
        scope: '',
      }), { headers: { 'Content-Type': 'application/json' } });
    }
    // User identity
    if (url === 'https://api.github.com/user') {
      return new Response(JSON.stringify({
        id: userId || 12345,
        login: login || 'testuser',
        email: email || 'testuser@example.com',
      }), { headers: { 'Content-Type': 'application/json' } });
    }
    throw new Error(`Unexpected fetch in test: ${url}`);
  };
}
```

Provide variants for error paths: `stubGitHubFetchTokenError()` (returns `{ error: 'bad_verification_code' }`), `stubGitHubFetchNetworkError()` (throws), `stubGitHubFetchRateLimit()` (returns 403 with rate-limit headers).

**Do NOT mock `globalThis.fetch`.** That approach is fragile -- it bleeds into other calls (D1, R2, KV all use fetch internally in miniflare). The injection pattern keeps the mock scope tight.

### 2. Cookie/Session Testing in Miniflare

`SELF.fetch()` in miniflare does not automatically handle cookies across requests (there is no browser cookie jar). This is actually an advantage for testing -- each request explicitly includes or omits the `Cookie` header, giving full control over session state.

**Pattern for session-authenticated requests:**

```js
// Step 1: Exercise OAuth callback to get a Set-Cookie
const callbackRes = await SELF.fetch(
  'https://worker.test/auth/github/callback?code=test&state=valid-state',
  { headers: { 'CF-Connecting-IP': ip }, redirect: 'manual' }
);
const setCookie = callbackRes.headers.get('Set-Cookie');
const sessionCookie = setCookie.split(';')[0]; // e.g., "wrl_session=abc123"

// Step 2: Use the cookie on subsequent requests
const keysRes = await SELF.fetch('https://worker.test/v1/account/keys', {
  headers: { Cookie: sessionCookie, 'CF-Connecting-IP': ip },
});
```

**Critical: use `redirect: 'manual'`** on the callback request. The OAuth callback will return a 302 redirect. Without `redirect: 'manual'`, miniflare follows the redirect and you lose the `Set-Cookie` header from the 302 response.

**Session fixture helper** (add to `test/fixtures.js`):

```js
export async function createTestSession(db, { tenantId, githubUserId, githubLogin } = {}) {
  // Directly insert a session row into D1, bypassing the OAuth flow.
  // For tests that need a valid session but are NOT testing the OAuth flow itself.
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 3600_000).toISOString();
  await db.prepare(
    'INSERT INTO sessions (id, tenant_id, github_user_id, github_login, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(sessionId, tenantId || 'gh-12345', githubUserId || 12345, githubLogin || 'testuser', new Date().toISOString(), expiresAt).run();
  return `wrl_session=${sessionId}`;
}
```

Most tests should use `createTestSession` to get a cookie string directly. Only the OAuth flow tests themselves should exercise the full callback-to-cookie path.

### 3. Test File Organization

Create **three new test files** mirroring the existing pattern:

| File | Scope | Auth method tested |
|------|-------|--------------------|
| `test/oauth.test.js` | OAuth redirect, callback, token exchange, session creation, logout, error paths | GitHub OAuth flow |
| `test/session-auth.test.js` | Session verification, cookie parsing, expiry, missing/invalid cookies | Session cookie |
| `test/account-keys.test.js` | Self-serve key CRUD (list, create, revoke), first-key semantics, key limit enforcement | Session cookie |

This mirrors the existing separation: `auth.test.js` (token extraction and verification), `admin-keys.test.js` (admin key CRUD via SELF.fetch).

### 4. Test Plan by Feature Area

#### 4a. OAuth Flow Tests (`test/oauth.test.js`)

**Redirect initiation (GET /auth/github):**
- Returns 302 to `github.com/login/oauth/authorize`
- URL includes correct `client_id`, `redirect_uri`, `scope`, and `state` parameters
- `state` parameter is stored in D1 (or signed/encrypted) for later verification
- Response sets no session cookie (auth not yet complete)

**Callback (GET /auth/github/callback):**
- Happy path: valid `code` + valid `state` -> 302 to `/ui` with `Set-Cookie` header
- Cookie attributes: `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, reasonable `Max-Age`
- New user: auto-creates tenant and first API key; response (or redirect target) includes the raw key for one-time display
- Returning user: creates session, does NOT create a new tenant or key
- Invalid `state` -> 403 (CSRF rejection), no session created
- Missing `code` -> 400
- GitHub returns error on token exchange -> appropriate error page/redirect, no session
- GitHub returns network error on token exchange -> 502, no session
- State parameter replay (used twice) -> second use rejected

**Logout (POST /auth/logout):**
- Valid session cookie -> clears the cookie (Set-Cookie with Max-Age=0), returns 200 or 302
- Session row deleted from D1
- Missing/invalid cookie -> still returns 200 (idempotent)
- GET /auth/logout -> 405 (method not allowed)

**GitHub error handling:**
- Token exchange returns `bad_verification_code` -> user-facing error
- Token exchange returns unexpected JSON shape -> 502
- User API returns 403 rate limit -> 502 with retry guidance
- User API returns unexpected shape (missing `id` field) -> 500

#### 4b. Session Auth Tests (`test/session-auth.test.js`)

**Session verification (unit tests of session middleware):**
- Valid session cookie -> extracts tenant ID and user info
- Expired session cookie -> 401
- Nonexistent session ID -> 401
- Missing Cookie header -> 401
- Malformed cookie value -> 401
- Session belonging to different tenant -> correct isolation

**Session security properties:**
- Session ID is cryptographically random (not sequential or predictable)
- Session ID format is opaque (UUID or similar, not containing tenant info)
- Cookie is not sent with `document.cookie` (HttpOnly verification -- test the Set-Cookie header attributes)

#### 4c. Account Key CRUD Tests (`test/account-keys.test.js`)

This file mirrors `test/admin-keys.test.js` but with session auth instead of Bearer admin key auth. The test structure should follow the same pattern: `SELF.fetch()` with explicit Cookie headers.

**POST /v1/account/keys (create):**
- Returns 201 with `wrl_live_` prefixed key
- Response includes `keyHash`, `scopes`, `name`, `createdAt`, `warning`
- Scopes are restricted to `['capture', 'read']` -- self-serve users cannot create admin-scoped keys
- Key is associated with the session's tenant (no tenantId in request body -- derived from session)
- Key limit enforcement: returns 409 when tenant exceeds max key count
- Missing session cookie -> 401
- Expired session -> 401
- Sets `Cache-Control: private, no-store`

**GET /v1/account/keys (list):**
- Returns 200 with `data` array of the session's tenant's keys
- Only shows the session tenant's keys (cross-tenant isolation)
- Keys are masked (last 4 chars only? or not shown at all -- depends on API design decision)
- Does not include revoked keys by default
- Includes revoked keys with `?include=revoked`
- Requires valid session

**DELETE /v1/account/keys/:keyHash (revoke):**
- Returns 200 with revoked record
- Is idempotent (second DELETE returns 200)
- Returns 404 for unknown keyHash
- Cannot revoke a key belonging to a different tenant -> 404 (not 403, to avoid information leakage)
- Last-key guard: should it prevent revoking the last key? (Design decision -- admin API has this for admin-scoped keys. For self-serve, the user can always create a new key, so probably no guard needed.)
- Requires valid session
- CSRF protection: if using CSRF tokens, verify the token is required

#### 4d. First-Key-Shown-Once Semantics

This is a UX concern with testable backend behavior:

- On first OAuth login (new user), the response (or redirect URL) includes the raw API key
- Subsequent logins do NOT resurface the first key
- The raw key is NEVER stored in D1 -- only the hash. The "shown once" is a property of the response, not a stored flag
- If the user creates additional keys via account settings, those are also shown once (in the 201 response) and then not retrievable

**Test approach:** This is inherently tested by the create-key endpoint returning the raw key in the 201 response body, and the list-keys endpoint NOT including raw keys. No additional "shown once" flag is needed in the database -- the one-time visibility is an artifact of when the key is returned (only at creation time).

Tests to write:
- `POST /v1/account/keys` returns `key` field in response body
- `GET /v1/account/keys` does NOT include `key` field (only `keyHash`, masked prefix, etc.)
- The OAuth callback for a new user returns the first key (in the redirect, or in a subsequent response)
- The OAuth callback for a returning user does NOT return any key

#### 4e. Admin API Regression Tests

The existing admin API must continue working unchanged. This is the highest-risk regression area.

**Approach: do NOT modify `test/admin-keys.test.js`.** Leave it completely untouched. If all existing tests pass after the OAuth implementation, backward compatibility is confirmed.

Additionally, add targeted cross-concern tests:

- Admin API still works when session cookies are absent (Bearer ADMIN_KEY auth is independent)
- Admin API rejects session cookies as auth (you cannot use a session cookie to access admin endpoints)
- Session-authenticated account API rejects Bearer ADMIN_KEY (and vice versa)
- Creating a tenant via admin API and then logging in via OAuth with the same GitHub user links correctly (this tests the tenant-linking logic)
- A key created via admin API is visible in the account API if the tenant is linked to a GitHub user

#### 4f. CSRF Protection Tests

If the implementation uses CSRF tokens for session-authenticated mutations:

- POST /v1/account/keys without CSRF token -> 403
- DELETE /v1/account/keys/:keyHash without CSRF token -> 403
- POST /auth/logout without CSRF token -> 403 (or exempt -- depends on design)
- CSRF token from one session cannot be used with a different session

If relying on SameSite=Lax alone (no explicit CSRF token):

- Verify Set-Cookie includes `SameSite=Lax`
- Document the limitation: SameSite=Lax does not protect against GET-based CSRF. Ensure all mutations use POST/DELETE (which Lax blocks in cross-origin context)

### 5. Integration Test Boundaries

The project philosophy requires "testing the real boundaries." For OAuth, the boundary is the GitHub API. However, testing against real GitHub OAuth in CI is impractical -- it requires a real GitHub App, a real user, and real browser interaction.

**What MUST hit real services (integration test, run separately):**
- Nothing in CI. The GitHub OAuth flow is inherently interactive (browser redirect).
- A manual integration test checklist should be documented in the evolution log: "deploy to staging, navigate to /auth/github, complete OAuth flow, verify session cookie, verify tenant creation, verify first key display."

**What should hit real miniflare (SELF.fetch, runs in CI):**
- Full OAuth callback -> session -> account key CRUD lifecycle (with mocked GitHub fetch)
- Full admin API lifecycle (existing tests, untouched)
- Cross-auth-method rejection (session cookie on admin endpoint, ADMIN_KEY on account endpoint)

**What can be unit-tested (direct function import):**
- Session verification logic
- Cookie parsing
- State parameter generation and verification
- Tenant-linking logic (given a GitHub user ID, find or create tenant)

### 6. Test Data: D1 Migration and Fixtures

The new D1 migration (e.g., `0004_oauth_sessions.sql`) will be automatically applied by the existing `test/apply-migrations.js` setup via `readD1Migrations()`. No changes to the test harness are needed for this.

**Additions to `test/fixtures.js`:**
- `createTestSession(db, opts)` -- inserts a session row, returns cookie string
- `seedGithubUser(db, opts)` -- inserts a GitHub identity linked to a tenant
- `cleanDb()` must be updated to include `DELETE FROM sessions` and `DELETE FROM github_users` (or whatever the new tables are named) in the correct FK order

**Update `vitest.config.js` bindings:**
- Add `GITHUB_CLIENT_ID: 'test-github-client-id'` and `GITHUB_CLIENT_SECRET: 'test-github-client-secret'` to miniflare bindings
- Add `SESSION_SECRET: 'test-session-secret-for-vitest'` if sessions are signed/encrypted

### 7. Rate Limiting on OAuth Endpoints

OAuth endpoints need rate limiting to prevent abuse, but the existing rate limiter bindings are scoped to capture/verify/admin groups.

- The OAuth callback should be rate-limited (prevent brute-force state/code guessing)
- Test that rapid repeated requests to `/auth/github/callback` trigger rate limiting
- This may require a new rate limiter binding in `wrangler.test.toml`

## Proposed Tasks

### Task 1: Add test fixtures for OAuth and sessions
**File**: `test/fixtures.js`
**Work**: Add `createTestSession()`, `seedGithubUser()`, `stubGitHubFetch()` (and error variants). Update `cleanDb()` to clean new tables. Add `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` to `vitest.config.js` bindings.
**Depends on**: D1 schema migration (data-minion's output)
**Effort**: Small

### Task 2: Write OAuth flow tests
**File**: `test/oauth.test.js`
**Work**: Tests for GET /auth/github (redirect), GET /auth/github/callback (happy path, errors, CSRF), POST /auth/logout. Uses `stubGitHubFetch` for GitHub API calls and `SELF.fetch` with `redirect: 'manual'` for the Worker endpoints.
**Depends on**: Task 1, OAuth endpoint implementation
**Effort**: Medium

### Task 3: Write session auth tests
**File**: `test/session-auth.test.js`
**Work**: Unit tests for session verification middleware: valid session, expired, missing, malformed, wrong tenant. Tests cookie attribute assertions on Set-Cookie headers.
**Depends on**: Task 1, session module implementation
**Effort**: Small-Medium

### Task 4: Write account key CRUD tests
**File**: `test/account-keys.test.js`
**Work**: SELF.fetch integration tests for POST/GET/DELETE /v1/account/keys with session auth. Mirrors the structure of `test/admin-keys.test.js`. Includes cross-tenant isolation, key limit enforcement, first-key-shown-once semantics, and CSRF protection.
**Depends on**: Task 1, account endpoint implementation
**Effort**: Medium

### Task 5: Add cross-auth-method security tests
**File**: `test/auth.test.js` (extend existing) or new `test/auth-isolation.test.js`
**Work**: Session cookie rejected on admin endpoints. ADMIN_KEY rejected on account endpoints. API key rejected on account endpoints. This is the "no auth confusion" safety net.
**Depends on**: Task 2, Task 4
**Effort**: Small

### Task 6: Verify admin API regression
**Work**: Run existing `test/admin-keys.test.js` unchanged after all OAuth code lands. No modifications to this file. If any test fails, it is a regression and must be investigated before merging.
**Depends on**: All implementation tasks
**Effort**: Zero (just running existing tests)

### Task 7: Add security headers and rate limit tests for new routes
**File**: Extend `test/security-headers.test.js` and add rate limit assertions
**Work**: Verify `/auth/github`, `/auth/github/callback`, `/auth/logout`, `/v1/account/keys` all include the standard security headers. Verify rate limiting works on OAuth callback endpoint.
**Depends on**: Route implementation
**Effort**: Small

## Risks and Concerns

### Risk 1: Cookie handling differences between miniflare and production
Miniflare's `SELF.fetch()` does not process cookies the way a browser does. Tests manually pass `Cookie` headers, which is correct for testing the server side. However, this means tests cannot verify the full browser cookie lifecycle (HttpOnly preventing JS access, Secure preventing non-HTTPS, SameSite blocking cross-origin). **Mitigation**: Assert on `Set-Cookie` header attributes in tests. Document a manual browser test checklist for the evolution log.

### Risk 2: GitHub fetch mock diverging from real GitHub API
The stub returns a fixed JSON shape. If GitHub changes their API response shape, the mock won't catch it. **Mitigation**: (a) Pin the expected response shape to GitHub's current documented API, (b) include a comment with the GitHub docs URL, (c) consider a staging integration test that hits real GitHub (manual, not CI).

### Risk 3: OAuth state parameter storage
If the state parameter is stored in D1, the test needs to seed a valid state before calling the callback endpoint. If the state is a signed/encrypted value (stateless), the test needs to generate a valid state using the same secret. **The test approach depends on the state parameter design choice -- this must be settled in the oauth-minion consultation before test code is written.**

### Risk 4: Tenant-linking logic complexity
The requirement to link a GitHub user to a pre-existing operator tenant is a non-trivial data operation. Tests must cover: (a) new user with no existing tenant, (b) GitHub user whose username matches an existing tenant ID, (c) explicit admin-initiated linking, (d) what happens if two GitHub users claim the same tenant. **This logic needs thorough unit tests with all edge cases enumerated.** The data-minion's schema design determines the test approach.

### Risk 5: Session expiry timing
Tests that check session expiry need to either (a) insert a session with an already-past `expires_at`, or (b) use Vitest's `vi.useFakeTimers()` to advance time. Option (a) is simpler and avoids timer mocking complexity. **Recommend option (a).**

### Risk 6: `cleanDb()` ordering
The new tables (sessions, github_users) will have foreign key relationships. `cleanDb()` must delete in the correct order: sessions first, then github_users (or oauth_identities), then any new tables, before the existing tables. Getting this wrong causes FK constraint violations in test teardown. **The migration must be finalized before the fixtures can be updated.**

## Additional Agents Needed

- **data-minion**: Must finalize the D1 schema before test fixtures can be written. The session table structure, GitHub identity storage, and tenant-linking mechanism all directly determine what `createTestSession()` and `seedGithubUser()` look like.

- **api-design-minion**: Must finalize whether account endpoints are at `/v1/account/keys` or reuse `/v1/admin/keys` with different auth. Must decide on CSRF strategy (SameSite-only vs explicit CSRF tokens). The test file structure and assertions depend on these decisions.

- **oauth-minion**: Must decide on state parameter implementation (D1-stored random value vs signed/encrypted stateless value). This determines how tests generate valid state for callback testing.

- **security-minion**: Should review the test plan for completeness of security scenarios. Specifically: token confusion tests (can a session cookie be misinterpreted as an API key?), session fixation tests (can an attacker set a session ID before the victim logs in?), and timing-safe session verification.
