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
- Token exchange (POST to github.com/login/oauth/access_token): returns `{ access_token, token_type, scope }`
- User identity (GET api.github.com/user): returns `{ id, login, email }`
- Throws on unexpected URLs
- Accepts override opts: `{ accessToken, userId, login, email }`
- Error variants: `stubGitHubFetchTokenError()`, `stubGitHubFetchNetworkError()`
- The token exchange stub must accept any body fields without validation (it only checks the URL). GitHub OAuth Apps ignore the code_verifier field if sent -- the stub should be equally permissive.

`createTestSession(db, env, opts)` -- Shortcut for tests that need a valid session:
- Creates a github_users record and tenant
- Creates a session row (hashed session ID)
- Returns `{ cookie, tenantId, githubId, sessionId, idHash }` where `cookie` is the signed `__Host-wrl_session=...` string ready to pass as Cookie header
- Requires access to `env.SESSION_SECRET` for HMAC signing
- **CRITICAL**: Read `src/session.js` and mirror its `createSessionCookie` signing implementation exactly. The HMAC algorithm, key import format, and signed payload encoding must match session.js precisely, otherwise all session-authenticated tests will 401.

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
SESSION_SECRET: 'deadbeef'.repeat(8), // 64-char valid hex for test HMAC key
```
The SESSION_SECRET MUST be valid hex (only chars 0-9, a-f). `'deadbeef'.repeat(8)` produces a 64-char hex string that `crypto.subtle.importKey` will accept. Do NOT use `'a]'` or any non-hex characters.

## Deliverables
- Modified `test/fixtures.js`
- Modified `vitest.config.js`

## What NOT to do
- Do NOT write any test files yet (those are in Phase 6)
- Do NOT modify any existing test file other than fixtures.js
- Do NOT mock globalThis.fetch
