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

Four handlers, all session-authenticated (cookie, NOT Bearer token). The router (Task 5) handles session verification and passes the session via `env._session`. All handlers read `env._session.tenantId`, `env._session.githubId`, etc.

**`handleAccountListKeys(request, env, ctx, match)`** -- GET /v1/account/keys:
- Read tenantId from `env._session.tenantId`
- Call `listApiKeyRecords(db, tenantId)` (same as admin, but tenantId from session)
- Return `{ data: [...] }` with masked keys (keyHash, name, scopes, createdAt, createdBy -- no raw key)
- Set `Cache-Control: private, no-store`
- Log `oauth.key_list` (severity 3): `{ cip, tenantId, count, authMethod: 'session' }`

**`handleAccountCreateKey(request, env, ctx, match)`** -- POST /v1/account/keys:
- Parse JSON body: `{ name, scopes }`. Validate name with `/^[a-zA-Z0-9 _.:-]{1,128}$/`.
- Scopes restricted: only `['capture']`, `['read']`, or `['capture', 'read']`. Reject `'admin'` scope with 403.
- Check key count: list keys for tenant, compare against max (default 5, configurable via tenant config `maxKeys`). Return 409 if at limit. Log `oauth.key_limit_reached` (severity 4): `{ cip, tenantId, currentCount, maxKeys }`
- Generate key using same pattern as admin.js: random bytes -> base64url -> `wrl_live_` prefix -> hash -> store.
- Set `createdBy` to `'github:{githubId}'` (from session).
- Return 201 with raw key (shown once), keyHash, tenantId, scopes, name, createdAt, warning.
- Set `Cache-Control: private, no-store`
- Log `oauth.key_create` (severity 3): `{ cip, tenantId, keyHashPrefix: keyHash.slice(0, 8), scopes, keyName: name, authMethod: 'session' }`

**`handleAccountRevokeKey(request, env, ctx, match)`** -- DELETE /v1/account/keys/:keyHash:
- Extract keyHash from URL path (match[1])
- Call `getApiKeyRecord(db, keyHash)`. If not found OR belongs to different tenant: return 404 (not 403, prevents info leakage)
- Check last-key guard: if this is the tenant's only active key, return 409 with message: "Cannot revoke your only API key. Create a new key first."
- Call `revokeApiKeyRecord(db, keyHash)`
- Return 200 with revoked record
- Log `oauth.key_revoke` (severity 3): `{ cip, tenantId, keyHashPrefix: keyHash.slice(0, 8), keyName, scopes, authMethod: 'session' }`

**`handleAccountAcceptTos(request, env, ctx, match)`** -- POST /v1/account/tos:
- Parse JSON body: `{ tosVersion }` (the version string, e.g., "2026-03-23")
- Call `acceptTos(db, githubId, tosVersion)` from session
- Return 200 `{ ok: true, tosAcceptedAt: new Date().toISOString() }`
- Log `oauth.tos_accept` (severity 3): `{ cip, tenantId, githubUserId, tosVersion }`

## CSRF Protection
All POST and DELETE handlers must check for the `X-WRL-CSRF` header. This check should be done by the router (Task 5), but include a defensive check in the handlers too: `if (!request.headers.has('X-WRL-CSRF'))` -> 403 "CSRF header X-WRL-CSRF is required for mutations".

## Response Format
- Follow exactly the same envelope and error patterns as admin.js
- Use `problemResponse()` for errors (RFC 9457)
- Use `jsonResponse()` for success
- All responses set `Cache-Control: private, no-store`

## Deliverables
- `src/account.js`

## What NOT to do
- Do NOT handle auth verification in handlers (router does it, session in env._session)
- Do NOT accept a tenantId in the request body (always from session)
- Do NOT allow `'admin'` scope in self-serve key creation
- Do NOT modify admin.js or db.js
- Do NOT create usage/billing endpoints (out of scope for this phase)
