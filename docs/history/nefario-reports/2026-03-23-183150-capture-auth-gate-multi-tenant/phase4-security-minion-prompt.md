## Task: Implement capture retrieval auth gate, share tokens, and tenant isolation

You are implementing the security-critical core of the capture auth gate feature for the Web Resource Ledger (WRL) Cloudflare Worker. This is a single cohesive change: D1 migration, share token module, auth gate in fetch(), share endpoint, tenant isolation in handlers, and comprehensive tests.

### Context

WRL is a Cloudflare Worker (vanilla JS, no TypeScript) using D1 (SQLite), R2, KV, and Vitest with `@cloudflare/vitest-pool-workers` for testing.

**Current state**: Capture retrieval endpoints (`GET /v1/captures/{id}`, `/status`, `/artifacts/*`) are unauthenticated -- the capture ID acts as an access secret. The verify endpoint (`GET /v1/verify/{id}`) is public by design and must stay that way.

**Target state**: All capture retrieval endpoints require tenant authentication (API key or session). Share tokens allow tenants to grant read-only access to specific captures. Cross-tenant access returns 404 (not 403) to prevent enumeration.

### Codebase orientation

- `src/index.js`: Main worker. The `fetch()` handler (line ~370) has auth gate blocks for admin routes (lines 372-395) and account routes (lines 407-443). Follow this same pattern for capture-read routes. Route table starts at line 57. Key handlers:
  - `handleGetCapture` (line 1379): returns capture metadata with artifact URLs
  - `handleGetCaptureArtifact` (line 1459): serves artifact binary from R2
  - `handleCaptureStatus` (line 1679): returns capture status for polling
  - `handleVerifyCapture` (line 1529): public verification -- DO NOT gate this
  - `handleListCaptures` (line 1128): already authenticated via `verifyAuth()`
- `src/auth.js`: `verifyApiKey()` does SHA-256 hash lookup in D1 `api_keys` table. `hashApiKey()` hashes raw keys. This is the pattern to follow for share tokens.
- `src/db.js`: All D1 access. `getCapture(db, captureId)` does `SELECT * FROM captures WHERE id = ?`. `listCaptures(db, tenantId, ...)` is already tenant-scoped. Pattern: `rowToCapture()` transforms rows.
- `src/responses.js`: `problemResponse(status, detail, headers, extras)` and `jsonResponse(body, status, headers)`.
- `src/log.js`: `log(env, level, category, data)` for structured logging.
- `test/fixtures.js`: `seedApiKey(db, rawKey, { tenantId, scopes, ... })`, `createTestSession(db, env, ...)`, `cleanDb(db)`, `TEST_TENANT_KEY = 'wrl_live_' + 'a'.repeat(43)`.
- `test/capture-retrieval.test.js`: Current tests assert "no auth required" -- you will rewrite this file.
- `migrations/`: Sequential SQL files (0001-0009). Next is 0010.
- `verifyAuth(request, env, options)` in index.js (line 35): Dual auth -- tries session cookie first, falls back to API key. Returns `{ ok, tenantId, authMethod, keyName, keyHashPrefix }`.
- Existing `getCapture()` is used by both retrieval handlers AND the verify handler. DO NOT modify `getCapture()` to require tenantId -- the verify endpoint needs the tenant-agnostic version. Instead, check tenant ownership in the auth gate or handler after the DB lookup.

### What to implement

#### 1. D1 Migration: `migrations/0010_share_tokens.sql`

```sql
CREATE TABLE share_tokens (
  token_hash   TEXT NOT NULL PRIMARY KEY CHECK (length(token_hash) = 64),
  capture_id   TEXT NOT NULL REFERENCES captures(id),
  tenant_id    TEXT NOT NULL REFERENCES tenants(id),
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at   TEXT
);

CREATE INDEX idx_share_tokens_capture ON share_tokens (capture_id, created_at DESC);
CREATE INDEX idx_share_tokens_tenant ON share_tokens (tenant_id, created_at DESC);
CREATE INDEX idx_share_tokens_expires_at ON share_tokens (expires_at) WHERE expires_at IS NOT NULL;
```

Key design decisions (already settled):
- `token_hash` is SHA-256 of the raw token (64 hex chars), same as api_keys pattern
- `expires_at NULL` means permanent
- `tenant_id` denormalized for listing without JOIN
- No scopes column -- share tokens are read-only by design
- **NO revoked/revoked_at columns** -- revocation is out of scope for this issue
- **NO label column** -- YAGNI, can be added later if needed

#### 2. Share token module: `src/share-tokens.js` (new file)

Create a new module with these functions:

- `generateShareToken()`: Generate 32 bytes via `crypto.getRandomValues`, encode as base64url (no padding), prepend `wrl_share_` prefix. Return the raw token string.
- `hashShareToken(rawToken)`: SHA-256 hash, return 64-char lowercase hex. Reuse the pattern from `hashApiKey()` in auth.js.
- `createShareToken(db, { tokenHash, captureId, tenantId, expiresAt })`: INSERT into share_tokens. Return the created row.
- `getShareTokenByHash(db, tokenHash)`: SELECT by PK. Return raw row or null. Does NOT check expiry (caller does that).
- `deleteExpiredShareTokens(db)`: DELETE WHERE expires_at IS NOT NULL AND expires_at < now. For cleanup cron.

**NOT included** (out of scope per issue):
- No `revokeShareToken` function
- No `listShareTokensForCapture` function
- No per-capture token limit
- No label parameter

#### 3. Auth gate in `fetch()` for capture-read routes

Add a new block in `fetch()` AFTER the account-route gate (after line 443) and BEFORE the route dispatch (line 445). Pattern follows the admin and account gate blocks exactly.

```javascript
// Auth gate for capture GET routes (retrieval, status, artifacts)
const isCaptureGetRoute = (
  request.method === 'GET' && (
    pathname.startsWith('/v1/captures/') || pathname === '/v1/captures'
  )
);
// CRITICAL: /v1/verify/ must NOT be gated -- verify is public by design
if (!response && isCaptureGetRoute) {
  const shareToken = url.searchParams.get('token');

  if (shareToken) {
    // Share token auth path
    const tokenHash = await hashShareToken(shareToken);
    const tokenRecord = await getShareTokenByHash(env.DB, tokenHash);

    if (!tokenRecord) {
      response = problemResponse(401, 'Invalid or missing authentication');
    } else if (tokenRecord.expires_at && new Date(tokenRecord.expires_at) < new Date()) {
      // Expired tokens return 410 (per spec -- token was intentionally shared)
      response = problemResponse(410, 'Share token has expired');
    } else {
      // Valid share token -- attach to env for handler use
      env._captureAuth = {
        tenantId: tokenRecord.tenant_id,
        authMethod: 'share_token',
        scopedCaptureId: tokenRecord.capture_id,
      };
    }
  } else {
    // Standard tenant auth (API key or session)
    const auth = await verifyAuth(request, env, { requiredScope: 'read' });
    if (!auth.ok) {
      response = problemResponse(401, 'Authentication required. Use an API key or generate a share link.');
    } else {
      env._captureAuth = {
        tenantId: auth.tenantId,
        authMethod: auth.authMethod,
        scopedCaptureId: null, // tenant can access all their captures
      };
    }
  }
}
```

Important details:
- Share token and API key auth are mutually exclusive. If `?token=` is present, do NOT also check Authorization header.
- The verify endpoint uses pathname `/v1/verify/` which does NOT start with `/v1/captures/`, so the prefix check naturally excludes it.
- POST endpoints (capture creation, batch) are NOT affected -- they already have auth inside the handler.
- The `handleListCaptures` handler already calls `verifyAuth()` internally. With the new gate, `env._captureAuth` will also be set. Either let the handler use `env._captureAuth.tenantId` or keep its internal auth call -- both work. Prefer using `env._captureAuth` for consistency and remove the internal auth call.
- Share tokens should NOT grant access to the list endpoint (only to the specific capture). If the share token path is hit and the route is `/v1/captures` (list), return 401.
- Never log the raw share token. Log only `tokenHash.slice(0, 8)` for correlation.
- **env._captureAuth does NOT store the raw token**. Handlers that need the raw token for URL propagation should extract it directly from `url.searchParams.get('token')` in their own scope.
- **Variable name**: use `isCaptureGetRoute` (not `isCaptureReadRoute`)

#### 4. Tenant isolation in capture-read handlers

After the auth gate sets `env._captureAuth`, each handler must enforce ownership:

**handleGetCapture** (line 1379):
- After `getCapture(env.DB, captureId)` returns `record`:
- If `env._captureAuth.scopedCaptureId` (share token): verify `captureId === env._captureAuth.scopedCaptureId`. If mismatch, return 404.
- Verify `record.tenantId === env._captureAuth.tenantId`. If mismatch, return 404.
- Use the SAME `problemResponse(404, 'Capture not found')` -- identical to "does not exist" response.
- When accessed via share token (`env._captureAuth.authMethod === 'share_token'`), append `?token=<rawToken>` to all artifact URLs and verifyUrl in the response body. Extract the raw token from `url.searchParams.get('token')` (NOT from env._captureAuth).

**handleGetCaptureArtifact** (line 1459):
- Same tenant/scope check after `getCapture()`.
- No URL modification needed (this returns binary data, not JSON with URLs).

**handleCaptureStatus** (line 1679):
- Same tenant/scope check after `getCapture()`.
- When accessed via share token: if status is 'complete', the `captureUrl` in the response should include the share token as a query parameter. Extract from `url.searchParams.get('token')`.

**handleListCaptures** (line 1128):
- Remove the internal `verifyAuth()` call. Use `env._captureAuth.tenantId` instead.
- If `env._captureAuth.authMethod === 'share_token'`, return 401 -- share tokens do not grant list access.

#### 5. Share token creation endpoint

Add route: `['POST', /^\/v1\/captures\/(cap_[a-f0-9]{32})\/share$/, handleCreateShare]`

This endpoint requires tenant auth (API key or session), NOT share tokens. Add it AFTER the auth gate check -- the gate handles GET requests on `/v1/captures/*`. For POST to `/v1/captures/{id}/share`, you need auth inside the handler (same pattern as POST /v1/captures for capture creation).

**handleCreateShare(request, env, ctx, match)**:
1. Authenticate via `verifyAuth(request, env, { requiredScope: 'read' })`. A 'capture' scope also implies 'read'.
2. Parse request body: `{ "expiresIn": 86400 }`. Optional field.
3. Validate `expiresIn`: if present, must be integer, minimum 300 (5 min), maximum 31536000 (365 days). Return 400 if invalid.
4. Look up the capture: `getCapture(env.DB, captureId)`. Return 404 if not found or if `record.tenantId !== auth.tenantId`.
5. Allow share creation for captures in `pending` or `complete` status (not `failed`). Return 404 for failed captures.
6. Generate token: `generateShareToken()`. Hash it: `hashShareToken(rawToken)`.
7. Compute expiresAt: if `expiresIn` provided, `new Date(Date.now() + expiresIn * 1000).toISOString()`. Otherwise null.
8. Store: `createShareToken(env.DB, { tokenHash, captureId, tenantId: auth.tenantId, expiresAt })`.
9. Return 201:
```json
{
  "token": "wrl_share_...",
  "shareUrl": "https://wrl.benpeter.workers.dev/v1/captures/cap_abc123?token=wrl_share_...",
  "expiresAt": "2026-03-24T12:00:00.000Z"
}
```
The `shareUrl` must use the request's origin for the base URL.

#### 6. Wire expired token cleanup into cron

In the scheduled handler (wherever `deleteExpiredSessions` is called), add a call to `deleteExpiredShareTokens`.

#### 7. Update source code comments

Grep `src/index.js` for any comments referencing "no authentication" or "ID as secret" on capture retrieval. Update them to reflect the new auth model.

#### 8. Tests

**Rewrite `test/capture-retrieval.test.js`**:
- Add `beforeEach` that seeds two tenants (A and B) with API keys and captures.
- Test authenticated owner access: tenant A retrieves own capture with API key -> 200.
- Test authenticated owner with session cookie -> 200.
- Test unauthenticated access -> 401.
- Test cross-tenant access: tenant B tries tenant A's capture -> 404 (NOT 403).
- Test all sub-routes with cross-tenant isolation: status, screenshot, html, wacz.
- Test that error response is identical for cross-tenant (404) and non-existent capture (404).
- Test legacy auth (`authMethod: 'legacy'`, `tenantId: 'default'`) can still access captures owned by `default`.
- Test that handleGetCapture response includes artifact URLs with `?token=` when accessed via share token.

**New `test/share-token.test.js`**:
- Token creation: authenticated tenant creates share token for own capture -> 201 with token, shareUrl, expiresAt.
- Token creation for non-owned capture -> 404.
- Token creation without auth -> 401.
- Token creation with expiresIn -> correct expiresAt in response.
- Token creation without expiresIn -> expiresAt is null (permanent).
- Token usage: valid token in `?token=` grants access to GET /v1/captures/{id} -> 200.
- Token usage on artifacts -> 200.
- Token usage on status -> 200.
- Token scoping: share token for capture A cannot access capture B -> 404.
- Token cannot be used for list endpoint -> 401.
- Expired token -> 410.
- Invalid/malformed token -> 401.
- Empty `?token=` -> 401.

**Verify backward compat**: Add explicit assertion in `test/verify-integration.test.js` header comment that the verify endpoint must remain unauthenticated. Run existing verify tests -- they must pass unchanged.

**Update `test/fixtures.js`**:
- Add `TEST_TENANT_KEY_B = 'wrl_live_' + 'b'.repeat(43)` for cross-tenant tests.
- Add `seedShareToken(db, { captureId, tenantId, rawToken, expiresAt })` helper.
- Update `cleanDb()` to include `DELETE FROM share_tokens` (add before `DELETE FROM captures` due to FK).

**Update E2E test** `test/e2e/capture-verify.spec.js`: Add Authorization header to retrieval steps 3 and 4.

**Update `test/capture-integration.test.js`**: Add auth headers to any unauthenticated status polls.

### What NOT to do

- Do NOT modify the verify endpoint (`GET /v1/verify/{id}`) in any way. It must remain public and unauthenticated.
- Do NOT add HMAC-signed ephemeral tokens. One token type only: opaque D1-stored share tokens.
- Do NOT add a `waczUrl` field to the verify endpoint response. The verify endpoint returns verification results only.
- Do NOT modify `getCapture()` in db.js to require tenantId. The verify handler needs tenant-agnostic access.
- Do NOT add `autoShare` tenant configuration or auto-generate share tokens for existing captures. That is out of scope.
- Do NOT add a `--token` flag to the CLI. CLI changes are in Task 2.
- Do NOT update README.md, SECURITY.md, or openapi.yaml. Documentation is in Task 3.
- Do NOT add share token metadata (list of tokens) to the GET /v1/captures/{id} response. YAGNI.
- Do NOT add a revocation endpoint. Revocation is explicitly out of scope for this issue.
- Do NOT add label, revoked, or revoked_at columns to the schema. YAGNI.
- Do NOT add per-capture token limits. Rate limiting handles abuse.

### Token format specification

- Prefix: `wrl_share_`
- Body: 32 bytes of `crypto.getRandomValues()`, encoded as base64url without padding
- Total: `wrl_share_` (10 chars) + 43 chars base64url = 53 characters
- Entropy: 256 bits
- URL-safe: yes (base64url uses `-_` instead of `+/`, no padding `=`)
- Storage: SHA-256 hash of full token string (including prefix), 64 hex chars

### Expired token behavior (settled)

- Expired tokens: 410 Gone with `{"detail": "Share token has expired"}`. Acceptable because the token was intentionally shared.
- Invalid/not-found tokens: 401 Unauthorized.

### Security checklist

- [ ] Raw share tokens are NEVER stored in D1 (hash-before-store)
- [ ] Raw share tokens are NEVER logged (log hash prefix only, 8 chars)
- [ ] Cross-tenant access returns 404, not 403, with IDENTICAL response body
- [ ] Share token validation is a single D1 PK lookup (no scan)
- [ ] Expired tokens checked server-side on every request
- [ ] Share token for capture A cannot access capture B (scope enforcement)
- [ ] `verifyAuth()` return includes `{ requiredScope: 'read' }` for retrieval

When you finish your task, mark it completed with TaskUpdate and send a message to the team lead with:
- File paths with change scope and line counts (e.g., "src/auth.ts (new OAuth flow, +142 lines)")
- 1-2 sentence summary of what was produced
- If this task has an approval gate: the approach you chose, what alternative(s) you considered but rejected, and a brief reason for each rejection
