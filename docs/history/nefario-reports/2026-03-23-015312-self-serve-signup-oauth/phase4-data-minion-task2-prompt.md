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
- `getSession(db, idHash)` -- SELECT sessions JOIN github_users ON sessions.github_id = github_users.github_id WHERE id_hash = ?. Returns `{ idHash, githubId, tenantId, githubLogin, tosAcceptedAt, createdAt, expiresAt }` or null. The JOIN avoids a second D1 query for user display info. Does NOT check expiry (caller checks -- they need the record for logging even when expired).
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
