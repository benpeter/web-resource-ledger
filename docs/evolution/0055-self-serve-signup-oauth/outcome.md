# Phase 0055: Self-Serve Signup (OAuth) — Outcome

## What was built

GitHub OAuth 2.0 self-serve signup for WRL. Users can sign in with GitHub,
automatically receive a tenant and first API key, manage their keys through
an account settings page, and maintain login state via session cookies. The
existing admin API for operator-managed tenants is completely unchanged.

### New files

| File | Purpose |
|------|---------|
| `migrations/0004_github_oauth.sql` | D1 migration: `github_users` and `sessions` tables |
| `src/session.js` | Session verification, cookie creation/clearing, HMAC-SHA256 signing |
| `src/oauth.js` | GitHub OAuth flow (login, callback, logout, session check, first-key) |
| `src/account.js` | Account API handlers (key list, create, revoke, ToS acceptance) |
| `src/ui/ui-login.js` | Login screen with GitHub OAuth + API key fallback |
| `src/ui/ui-welcome.js` | First-key display with copy-to-clipboard |
| `src/ui/ui-tos.js` | Terms of Service acceptance gate |
| `src/ui/ui-settings.js` | Account settings: key CRUD, account info |

### Modified files

| File | Changes |
|------|---------|
| `src/db.js` | 9 new functions: github_users + sessions CRUD, getSession with JOIN |
| `src/index.js` | 10 new routes, auth gates for `/v1/account/*` and `/auth/*`, CSRF + ToS enforcement |
| `src/log.js` | JSDoc: added 'oauth' subsystem, "NEVER LOG" items |
| `src/ui/ui-auth.js` | Dual-auth boot (session first, API key fallback), apiFetch with CSRF |
| `src/ui/ui-shell.js` | Import 4 new view modules, `#/settings` route |
| `src/ui/ui-css.js` | Styles for login, welcome, ToS, settings, loading spinner |
| `wrangler.toml` | AUTH_RATE_LIMITER binding, GITHUB_CLIENT_ID var |
| `wrangler.test.toml` | Regenerated from wrangler.toml (no queue consumers) |
| `vitest.config.js` | Test env vars for GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, SESSION_SECRET |
| `test/fixtures.js` | stubGitHubFetch, seedGithubUser, createTestSession helpers |

### Key metrics

- 8 new source files, 10 modified files
- 10 new API routes (4 auth + 6 account)
- 6 git commits on `nefario/self-serve-signup-oauth` branch
- All 859 existing tests pass (no regressions)

## Success criteria assessment

| Criterion | Status |
|-----------|--------|
| OAuth 2.0 authorization code flow with GitHub | Done — PKCE (S256) included for defense-in-depth |
| First-time login auto-creates tenant | Done — `gh-{numeric_id}` format (immutable GitHub ID) |
| First API key displayed once | Done — KV entry deleted on first read |
| Session cookie (HttpOnly, Secure, SameSite=Lax) | Done — `__Host-wrl_session` with HMAC-SHA256 |
| Account settings: list active keys | Done — table with name, date, scopes, revoke button |
| Account settings: create keys (limit 5) | Done — inline form with scope selection |
| Account settings: revoke keys with confirmation | Done — inline confirmation, last-key guard |
| ToS acceptance recorded in D1 | Done — backend enforcement (403 if not accepted) |
| Existing admin API unchanged | Done — no changes to admin routes or handlers |
| OAuth state prevents CSRF | Done — single-use state in KV with 600s TTL |
| Logout clears session cookie | Done — POST /auth/logout deletes D1 session + clears cookie |

## Deviations from plan

1. **Operator tenant linking deferred** (D9): The "link existing operator
   tenant to GitHub user" feature was deferred to the backlog. The data model
   supports it (github_users.tenant_id can point to any tenant), and manual
   D1 SQL is available for edge cases. Tenant ID formats are disjoint
   (`gh-*` vs operator IDs) so no collision risk.

2. **Task 9 absorbed** (D7): The standalone observability task was absorbed
   into Tasks 3 and 4 since those prompts already specified every log event.

3. **Frontend completion**: Task 7 (frontend) required intervention after the
   agent ran out of context. The orchestrator completed the remaining UI files
   and modifications directly.

## Backlog changes

- **Mark done**: R24 (Self-serve signup OAuth) — Issue #103
- **Move from parking lot**: "OAuth for web UI" parking lot item is now resolved
- **Add to parking lot**: Operator tenant linking (link existing operator-managed
  tenants to GitHub users)
- **Add to parking lot**: E2E Playwright browser tests for OAuth flow
- **Add to parking lot**: Additional OAuth providers (Google, email/password)
