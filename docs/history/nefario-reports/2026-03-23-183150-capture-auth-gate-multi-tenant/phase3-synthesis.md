## Delegation Plan

**Team name**: capture-auth-gate
**Description**: Add tenant authentication to capture retrieval endpoints, implement share tokens for delegated access, and update all documentation to reflect the new access model.

### Task 1: Auth gate, share tokens, tenant isolation, and tests
- **Agent**: security-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: yes
- **Gate reason**: This task establishes the security model for all capture access. The auth gate placement, share token validation logic, and tenant isolation behavior lock in constraints that every downstream task depends on. Hard to reverse once deployed; high blast radius (Task 2 and Task 3 both depend on these API contracts).
- **Gate rationale**: |
    Chosen: Route-level auth gate in fetch() with opaque D1-stored share tokens (wrl_share_ prefix, 256-bit random, SHA-256 hash storage)
    Over: (1) Per-handler auth checks (risk of omission on new handlers); (2) HMAC-signed ephemeral tokens (non-revocable, adds signing secret complexity, dual-token confusion)
    Why: Route-level gate follows established admin/account patterns in the codebase (fail-closed by default). Opaque tokens follow the existing hash-before-store pattern used by api_keys and sessions. Single token mechanism (no HMAC) keeps the security model simple and consistent.
- **Prompt**: |
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
      expires_at   TEXT,
      revoked      INTEGER NOT NULL DEFAULT 0 CHECK (revoked IN (0, 1)),
      revoked_at   TEXT,
      label        TEXT
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

    #### 2. Share token module: `src/share-tokens.js` (new file)

    Create a new module with these functions:

    - `generateShareToken()`: Generate 32 bytes via `crypto.getRandomValues`, encode as base64url (no padding), prepend `wrl_share_` prefix. Return the raw token string.
    - `hashShareToken(rawToken)`: SHA-256 hash, return 64-char lowercase hex. Reuse the pattern from `hashApiKey()` in auth.js.
    - `createShareToken(db, { tokenHash, captureId, tenantId, expiresAt, label })`: INSERT with per-capture limit check. Before INSERT, count active (non-revoked) tokens for the capture. If >= 20 (`MAX_SHARE_TOKENS_PER_CAPTURE`), reject. Return the created row.
    - `getShareTokenByHash(db, tokenHash)`: SELECT by PK. Return raw row or null. Does NOT check expiry/revocation (caller does that).
    - `revokeShareToken(db, tokenHash, tenantId)`: SET revoked=1, revoked_at=now WHERE token_hash=? AND tenant_id=?. Return boolean (found and revoked).
    - `listShareTokensForCapture(db, captureId, tenantId)`: Return all tokens for a capture owned by the tenant, ordered by created_at DESC. Include revoked tokens. Return `{ tokenHash: first8chars, captureId, createdAt, expiresAt, revoked, revokedAt, label }` -- never return full hash.
    - `deleteExpiredShareTokens(db)`: DELETE WHERE expires_at IS NOT NULL AND expires_at < now AND revoked = 0. For cleanup cron. Also delete revoked tokens older than 30 days.
    - Export `MAX_SHARE_TOKENS_PER_CAPTURE = 20`.

    #### 3. Auth gate in `fetch()` for capture-read routes

    Add a new block in `fetch()` AFTER the account-route gate (after line 443) and BEFORE the route dispatch (line 445). Pattern follows the admin and account gate blocks exactly.

    ```javascript
    // Auth gate for capture-read routes
    const isCaptureReadRoute = (
      request.method === 'GET' && (
        pathname.startsWith('/v1/captures/') || pathname === '/v1/captures'
      )
    );
    // CRITICAL: /v1/verify/ must NOT be gated -- verify is public by design
    if (!response && isCaptureReadRoute) {
      const shareToken = url.searchParams.get('token');

      if (shareToken) {
        // Share token auth path
        const tokenHash = await hashShareToken(shareToken);
        const tokenRecord = await getShareTokenByHash(env.DB, tokenHash);

        if (!tokenRecord) {
          response = problemResponse(401, 'Invalid or missing authentication');
        } else if (tokenRecord.revoked) {
          // Revoked tokens return 401 (same as not found -- no info leak)
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
            rawToken: shareToken, // needed for URL propagation in responses
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

    #### 4. Tenant isolation in capture-read handlers

    After the auth gate sets `env._captureAuth`, each handler must enforce ownership:

    **handleGetCapture** (line 1379):
    - After `getCapture(env.DB, captureId)` returns `record`:
    - If `env._captureAuth.scopedCaptureId` (share token): verify `captureId === env._captureAuth.scopedCaptureId`. If mismatch, return 404.
    - Verify `record.tenantId === env._captureAuth.tenantId`. If mismatch, return 404.
    - Use the SAME `problemResponse(404, 'Capture not found')` -- identical to "does not exist" response.
    - When accessed via share token (`env._captureAuth.authMethod === 'share_token'`), append `?token=<rawToken>` to all artifact URLs and verifyUrl in the response body. The recipient needs these URLs to work.

    **handleGetCaptureArtifact** (line 1459):
    - Same tenant/scope check after `getCapture()`.
    - No URL modification needed (this returns binary data, not JSON with URLs).

    **handleCaptureStatus** (line 1679):
    - Same tenant/scope check after `getCapture()`.
    - When accessed via share token: if status is 'complete', the `captureUrl` in the response should include the share token as a query parameter.

    **handleListCaptures** (line 1128):
    - Remove the internal `verifyAuth()` call. Use `env._captureAuth.tenantId` instead.
    - If `env._captureAuth.authMethod === 'share_token'`, return 401 -- share tokens do not grant list access.

    #### 5. Share token creation endpoint

    Add route: `['POST', /^\/v1\/captures\/(cap_[a-f0-9]{32})\/share$/, handleCreateShare]`

    This endpoint requires tenant auth (API key or session), NOT share tokens. Add it AFTER the auth gate check -- the gate handles GET requests on `/v1/captures/*`. For POST to `/v1/captures/{id}/share`, you need auth inside the handler (same pattern as POST /v1/captures for capture creation).

    **handleCreateShare(request, env, ctx, match)**:
    1. Authenticate via `verifyAuth(request, env, { requiredScope: 'read' })`. A 'capture' scope also implies 'read'.
    2. Parse request body: `{ "expiresIn": 86400, "label": "for legal team" }`. Both fields optional.
    3. Validate `expiresIn`: if present, must be integer, minimum 300 (5 min), maximum 31536000 (365 days). Return 400 if invalid.
    4. Look up the capture: `getCapture(env.DB, captureId)`. Return 404 if not found or if `record.tenantId !== auth.tenantId`.
    5. Allow share creation for captures in `pending` or `complete` status (not `failed`). Return 404 for failed captures.
    6. Generate token: `generateShareToken()`. Hash it: `hashShareToken(rawToken)`.
    7. Compute expiresAt: if `expiresIn` provided, `new Date(Date.now() + expiresIn * 1000).toISOString()`. Otherwise null.
    8. Store: `createShareToken(env.DB, { tokenHash, captureId, tenantId: auth.tenantId, expiresAt, label })`.
    9. If per-capture limit exceeded, return `problemResponse(422, 'Maximum share tokens per capture reached (20)')`.
    10. Return 201:
    ```json
    {
      "token": "wrl_share_...",
      "shareUrl": "https://wrl.benpeter.workers.dev/v1/captures/cap_abc123?token=wrl_share_...",
      "expiresAt": "2026-03-24T12:00:00.000Z"
    }
    ```
    The `shareUrl` must use the request's origin for the base URL.

    #### 6. Share token revocation endpoint

    Add route: `['DELETE', /^\/v1\/captures\/(cap_[a-f0-9]{32})\/share\/([a-f0-9]{16})$/, handleRevokeShare]`

    The URL parameter is the first 16 chars of the token_hash (enough to identify uniquely within a capture's tokens).

    **handleRevokeShare(request, env, ctx, match)**:
    1. Authenticate via `verifyAuth(request, env, { requiredScope: 'read' })`.
    2. Look up the capture, verify ownership (same as creation).
    3. Find the share token by prefix match: `SELECT * FROM share_tokens WHERE capture_id = ? AND tenant_id = ? AND token_hash LIKE ?||'%'`.
    4. If not found, return 404.
    5. Set revoked=1, revoked_at=now. Return 204.

    #### 7. Wire expired token cleanup into cron

    In `src/db.js`, add `deleteExpiredShareTokens` alongside `deleteExpiredSessions`. Call it from the scheduled handler (`src/scheduler.js` or wherever `deleteExpiredSessions` is called).

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
    - Token creation when at per-capture limit (20) -> 422.
    - Token usage: valid token in `?token=` grants access to GET /v1/captures/{id} -> 200.
    - Token usage on artifacts -> 200.
    - Token usage on status -> 200.
    - Token scoping: share token for capture A cannot access capture B -> 404.
    - Token cannot be used for list endpoint -> 401.
    - Expired token -> 410.
    - Revoked token -> 401 (indistinguishable from invalid).
    - Invalid/malformed token -> 401.
    - Empty `?token=` -> 401.
    - Token revocation: DELETE endpoint -> 204, then token no longer works.
    - Token revocation of non-owned token -> 404.

    **Verify backward compat**: Add explicit assertion in `test/verify-integration.test.js` header comment that the verify endpoint must remain unauthenticated. Run existing verify tests -- they must pass unchanged.

    **Update `test/fixtures.js`**:
    - Add `TEST_TENANT_KEY_B = 'wrl_live_' + 'b'.repeat(43)` for cross-tenant tests.
    - Add `seedShareToken(db, { captureId, tenantId, rawToken, expiresAt, label })` helper.
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

    ### Token format specification

    - Prefix: `wrl_share_`
    - Body: 32 bytes of `crypto.getRandomValues()`, encoded as base64url without padding
    - Total: `wrl_share_` (10 chars) + 43 chars base64url = 53 characters
    - Entropy: 256 bits
    - URL-safe: yes (base64url uses `-_` instead of `+/`, no padding `=`)
    - Storage: SHA-256 hash of full token string (including prefix), 64 hex chars

    ### Expired vs revoked token behavior (settled)

    - Expired tokens: 410 Gone with `{"detail": "Share token has expired"}`. Acceptable because the token was intentionally shared.
    - Revoked tokens: 401 Unauthorized, identical to "token not found". Revocation is a security action; don't reveal it.
    - Invalid/not-found tokens: 401 Unauthorized.

    ### Security checklist

    - [ ] Raw share tokens are NEVER stored in D1 (hash-before-store)
    - [ ] Raw share tokens are NEVER logged (log hash prefix only, 8 chars)
    - [ ] Cross-tenant access returns 404, not 403, with IDENTICAL response body
    - [ ] Share token validation is a single D1 PK lookup (no scan)
    - [ ] Expired tokens checked server-side on every request
    - [ ] Share token for capture A cannot access capture B (scope enforcement)
    - [ ] `verifyAuth()` return includes `{ requiredScope: 'read' }` for retrieval

  - **Deliverables**:
    - `migrations/0010_share_tokens.sql`
    - `src/share-tokens.js` (new module)
    - `src/index.js` (auth gate, share endpoint, tenant isolation in handlers)
    - `src/db.js` (deleteExpiredShareTokens, update exports)
    - `test/capture-retrieval.test.js` (rewritten)
    - `test/share-token.test.js` (new)
    - `test/fixtures.js` (multi-tenant helpers, cleanDb update)
    - `test/e2e/capture-verify.spec.js` (auth headers added)
  - **Success criteria**:
    - All new and rewritten tests pass (`npx vitest run`)
    - All existing tests pass unchanged (especially verify-integration.test.js, verify.test.js)
    - `GET /v1/captures/{id}` returns 401 without auth, 200 with valid tenant auth
    - Cross-tenant access returns 404 (indistinguishable from non-existent)
    - Share token creation returns 201 with token and shareUrl
    - Share token grants access to metadata and artifacts
    - Expired token returns 410, revoked returns 401
    - Verify endpoint remains fully unauthenticated

### Task 2: CLI update for share token support
- **Agent**: devx-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |
    ## Task: Update the @w-r-l/verify CLI to work with the capture auth gate

    The capture retrieval endpoints now require authentication. The CLI's `fetchWaczFromCaptureUrl()` function fetches `/v1/captures/{id}/artifacts/wacz` without auth, which will now return 401. You need to update the CLI to support share tokens.

    ### Context

    The CLI tool lives at `packages/verify/`. Key files:
    - `packages/verify/lib/key-resolver.js`: Contains `fetchWaczFromCaptureUrl(captureUrl)` (line 127) which constructs `{origin}/v1/captures/{captureId}/artifacts/wacz` and fetches it with no auth.
    - `packages/verify/lib/key-resolver.js`: `isWrlCaptureUrl(input)` matches `/v1/(captures|verify)/cap_<id>`.
    - `packages/verify/bin/wrl-verify.js`: CLI entry point.

    **Server-side verification still works without changes**: `GET /v1/verify/{id}` remains public and unauthenticated. The CLI can verify captures by pointing users at the verify URL. The server reads the WACZ from R2 internally -- no artifact download needed.

    **The problem is local/independent verification**: The CLI downloads the WACZ to verify it locally (trust-nothing model). This path now requires a share token.

    ### What to implement

    #### 1. Accept share URLs with `?token=` in `fetchWaczFromCaptureUrl`

    Update `fetchWaczFromCaptureUrl(captureUrl)` in `key-resolver.js` to:
    1. Parse the input URL.
    2. If it has a `?token=` query parameter, extract it.
    3. When constructing the WACZ artifact URL, append the same `?token=` parameter.
    4. This way, when a tenant shares `https://wrl.../v1/captures/cap_abc?token=wrl_share_...`, the CLI correctly passes the token to the artifact download.

    The change is small and backward-compatible:
    ```javascript
    export async function fetchWaczFromCaptureUrl(captureUrl) {
      const parsedUrl = new URL(captureUrl);
      const origin = parsedUrl.origin;
      const captureId = captureIdFromUrl(captureUrl);
      let waczUrl = `${origin}/v1/captures/${captureId}/artifacts/wacz`;

      // Propagate share token from input URL to artifact URL
      const shareToken = parsedUrl.searchParams.get('token');
      if (shareToken) {
        waczUrl += `?token=${encodeURIComponent(shareToken)}`;
      }

      process.stderr.write(`Fetching capture from ${waczUrl}\n`);
      // ... rest unchanged
    }
    ```

    Also update `isWrlCaptureUrl(input)` to handle URLs with query parameters (currently the regex requires the path to end with the capture ID -- query strings should be allowed).

    #### 2. Improve error message for 401

    In `fetchBytes()`, when the response is 401, provide an actionable error message:

    ```javascript
    if (response.status === 401) {
      throw new Error(
        `Authentication required to download artifacts from ${url}\n` +
        `Use a share URL that includes a token parameter, or download the WACZ\n` +
        `directly with your API key and verify the local file:\n` +
        `  npx @w-r-l/verify ./bundle.wacz --origin ${new URL(url).origin}`
      );
    }
    ```

    #### 3. Version bump

    Bump `packages/verify/package.json` version from current to next minor (e.g., 0.1.0 -> 0.2.0).

    #### 4. Update packages/verify/README.md

    Add a section explaining the auth gate change:
    - Share URLs work: `npx @w-r-l/verify "https://wrl.../v1/captures/cap_abc?token=wrl_share_..."`
    - Verify URLs still work (no token needed): `npx @w-r-l/verify "https://wrl.../v1/verify/cap_abc"`
    - Local file verification still works: `npx @w-r-l/verify ./bundle.wacz --origin https://wrl...`

    ### What NOT to do

    - Do NOT add a `--token` CLI flag. Token propagation via the URL is sufficient and keeps the CLI surface minimal.
    - Do NOT add HMAC-signed waczUrl to the verify endpoint response. The verify endpoint stays unchanged.
    - Do NOT add a `--api-key` flag. Tenants who want to verify their own captures download the WACZ separately and verify locally.
    - Do NOT modify any server-side code. This task is CLI-only.

    ### Tests

    Update `packages/verify/test/` (if tests exist) or add tests:
    - `isWrlCaptureUrl` accepts URLs with query parameters
    - `fetchWaczFromCaptureUrl` propagates `?token=` to artifact URL
    - `fetchWaczFromCaptureUrl` works without token (backward compat)

  - **Deliverables**:
    - `packages/verify/lib/key-resolver.js` (updated)
    - `packages/verify/package.json` (version bump)
    - `packages/verify/README.md` (updated)
  - **Success criteria**:
    - `isWrlCaptureUrl` accepts share URLs with `?token=` parameter
    - `fetchWaczFromCaptureUrl` propagates the token to artifact download URL
    - CLI still works for local file verification and verify URLs (backward compat)
    - Existing CLI tests pass

### Task 3: Documentation update (SECURITY.md, README, OpenAPI, backlog)
- **Agent**: software-docs-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |
    ## Task: Update all documentation to reflect the capture auth gate

    The capture retrieval endpoints now require tenant authentication, and share tokens provide delegated access. You need to update SECURITY.md, README.md, openapi.yaml, and the backlog to reflect the new access model.

    ### Context

    **What changed (Task 1 implemented these):**
    - `GET /v1/captures/{id}`, `/status`, `/artifacts/*` now require tenant auth (API key or session) or a valid share token (`?token=wrl_share_...`)
    - `POST /v1/captures/{id}/share` creates share tokens (returns token, shareUrl, expiresAt)
    - `DELETE /v1/captures/{id}/share/{tokenHashPrefix}` revokes a share token
    - Cross-tenant access returns 404 (not 403) to prevent enumeration
    - `GET /v1/verify/{id}` remains unauthenticated (unchanged)
    - Expired share tokens return 410 Gone; revoked and invalid tokens return 401
    - Share token format: `wrl_share_` prefix + 43 chars base64url (256-bit entropy)
    - Tokens stored as SHA-256 hash in D1 share_tokens table

    ### What to update

    #### 1. SECURITY.md

    The current file is at `SECURITY.md` (project root, 40 lines). Restructure the "Scope" section (lines 16-29):

    **Remove**: The "Known gap (single-tenant deployments)" paragraph on line 29. This gap is now closed.

    **Add these new subsections** within Scope:

    **Access Model** -- Three access paths:
    - Tenant authentication (Bearer token): required for all capture retrieval endpoints. Tenants can only see their own captures. Cross-tenant access returns 404 (not 403) to prevent enumeration.
    - Share tokens (query parameter `?token=wrl_share_...`): delegated read-only access to a specific capture and its artifacts. Cryptographically random (256-bit), time-limited or permanent. Scoped to a single capture.
    - Public verification (no auth): `GET /v1/verify/{id}` remains unauthenticated by design.

    **Share Token Design**:
    - 256-bit cryptographic randomness, base64url encoded, `wrl_share_` prefix
    - Stored as SHA-256 hash in D1 (raw token never stored, same as API keys)
    - Created via `POST /v1/captures/{id}/share` (requires tenant auth)
    - Expired tokens: 410 Gone. Revoked tokens: 401 (indistinguishable from invalid).
    - Grants: read access to capture metadata + all artifacts for that specific capture
    - Does NOT grant: list access, access to other captures, write operations

    **Threat Analysis**:
    - Mitigated: capture ID guessing (now returns 401), cross-tenant data access (tenant isolation), credential sharing via capture URL (share tokens decouple access from API keys)
    - Residual risks:
      - Share token in URL query string: visible in server logs, browser history, proxy logs. Mitigated by time-limited tokens, `Referrer-Policy: no-referrer` header.
      - Verify endpoint confirms capture existence without auth (intentional -- verification must be public for trust)
      - Token revocation via DELETE endpoint available; no automatic revocation on suspicious access patterns

    Keep the document concise (target 80-120 lines). Do not duplicate OpenAPI content.

    #### 2. README.md

    The current file has multiple "capture ID acts as the access secret" references that must be updated. Key locations:

    - **Line 68-71** (Step 2 polling): Remove "No auth required -- the capture ID acts as the access secret." Add `Authorization: Bearer $WRL_API_KEY` to the curl example.
    - **Line 76** (Step 3 retrieval): Add `-H "Authorization: Bearer $WRL_API_KEY"` to the curl example.
    - **Line 89**: Replace "The capture ID grants full access to all artifacts without authentication -- treat it as a secret. Anyone with the ID can view the capture." with text about share tokens for sharing.
    - **Line 103** (Finding and sharing): Replace "The capture ID in any URL works without authentication. Share verification URLs freely." with updated sharing guidance.

    **Add a "Sharing captures" subsection** after Step 4 showing:
    ```bash
    # Generate a share link (requires your API key)
    curl -X POST https://api.webresourceledger.com/v1/captures/cap_a1b2c3d4.../share \
      -H "Authorization: Bearer $WRL_API_KEY" \
      -H "Content-Type: application/json" \
      -d '{"expiresIn": 604800}'
    ```
    Response: `{ "token": "wrl_share_...", "shareUrl": "https://...", "expiresAt": "..." }`

    Explain the two sharing methods:
    - **Verification link** (public, no token needed): share the `verifyUrl` -- anyone can verify authenticity
    - **Full access link** (share token): share the `shareUrl` -- recipient can access all artifacts

    **Grep for all "ID as secret" references** and update exhaustively. Search patterns: `access.*secret`, `ID.*acts.*secret`, `no.*auth.*required.*capture`, `without authentication`.

    #### 3. openapi.yaml

    Update `docs/openapi.yaml`:

    **Add security scheme** to `components/securitySchemes`:
    ```yaml
    shareToken:
      type: apiKey
      in: query
      name: token
      description: Share token granting read-only access to a specific capture
    ```

    **Update retrieval endpoints** (`/v1/captures/{captureId}`, `/v1/captures/{captureId}/status`, `/v1/captures/{captureId}/artifacts/{name}`):
    - Change `security: []` to `security: [{ bearerAuth: [] }, { shareToken: [] }]`
    - Add 401 response: `Unauthorized -- valid API key, session, or share token required`
    - Add 410 response on share token endpoints: `Gone -- share token has expired`
    - Update descriptions to remove "capture ID acts as the access secret" language

    **Add new endpoint** `POST /v1/captures/{captureId}/share`:
    - Request body schema: `{ expiresIn: integer (optional, 300-31536000), label: string (optional) }`
    - Response 201 schema: `{ token: string, shareUrl: string, expiresAt: string|null }`
    - Security: `bearerAuth`

    **Add new endpoint** `DELETE /v1/captures/{captureId}/share/{tokenHashPrefix}`:
    - Response 204 (no body)
    - Security: `bearerAuth`

    **Keep verify endpoint** (`/v1/verify/{captureId}`) with `security: []` -- unchanged.

    #### 4. Backlog update

    Update `docs/backlog.md`:
    - Mark done: "Evaluate auth requirement for GET /v1/captures/{id} post-multi-tenant"
    - Add parking lot: "Share token analytics (access counts, last-used tracking)" and "Auto-share tenant configuration (auto-generate share token on capture completion)"

    #### 5. Source code comments

    Grep `src/index.js` for any comments referencing "no authentication" or "ID as secret" on capture retrieval. Update them. Key locations:
    - Any comment near `handleGetCapture` about auth not being required
    - Any comment near `handleCaptureStatus` about the access model

    #### 6. Docs site content

    Check `site/content/index.md` for "capture ID acts as the access secret" references and update. This is a separate deployment but should be coordinated in the same PR.

    ### What NOT to do

    - Do NOT modify any JavaScript implementation code (src/*.js). Documentation only.
    - Do NOT add documentation for features not yet implemented (autoShare, share token analytics).
    - Do NOT remove the verify endpoint's public access documentation -- it stays public.
    - Do NOT write CLI documentation -- Task 2 handles packages/verify/README.md.

  - **Deliverables**:
    - `SECURITY.md` (restructured)
    - `README.md` (updated examples and sharing section)
    - `docs/openapi.yaml` (new endpoints, updated security)
    - `docs/backlog.md` (updated)
    - `site/content/index.md` (updated if "ID as secret" references found)
    - Source code comments in `src/index.js` (updated)
  - **Success criteria**:
    - No remaining references to "capture ID acts as the access secret" anywhere in the repo
    - SECURITY.md has Access Model, Share Token Design, and Threat Analysis sections
    - openapi.yaml has shareToken security scheme and new share endpoints
    - README curl examples include auth headers for retrieval
    - Backlog updated with done items and new parking lot items

### Cross-Cutting Coverage

- **Testing**: Covered in Task 1 (comprehensive test rewrite and new test file). Phase 6 will run tests post-execution.
- **Security**: Task 1 is assigned to security-minion. The entire feature is security-critical; the auth gate, token design, and tenant isolation are all handled in Task 1.
- **Usability -- Strategy**: Addressed in synthesis decisions. The share URL includes the full ready-to-send URL (not just the token). Permanent tokens are the default (no forced expiry choice). The verify endpoint remains the zero-friction public verification path. ux-strategy-minion's recommendations are incorporated into the API design.
- **Usability -- Design**: Not applicable -- no UI components in this plan. The Web UI share button is explicitly deferred (YAGNI for API-first launch).
- **Documentation**: Task 3 covers SECURITY.md, README, OpenAPI, and backlog. Phase 8 will additionally review documentation completeness.
- **Observability**: Not adding new runtime services. The auth gate uses existing logging patterns (`log(env, level, category, data)`). Share token validation failures should be logged at security level. No new metrics or tracing needed.

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - api-design-minion: The share endpoint API contract (POST /share, response shape, query parameter convention) is load-bearing for all three tasks.
    Review focus: Consistency of the share token API with existing endpoint patterns, response shapes, and error codes.
- **Not selected**:
  - ux-design-minion: No UI components produced in this plan.
  - accessibility-minion: No web-facing UI changes.
  - sitespeed-minion: No web-facing runtime changes affecting performance.
  - observability-minion: Uses existing logging patterns, no new services.
  - user-docs-minion: Documentation handled by software-docs-minion in Task 3; user-facing docs can be reviewed in Phase 8.

### Decisions

- **CLI backward compatibility approach**
  Chosen: Share token propagation via URL query parameter (the CLI detects `?token=` in the input URL and forwards it to artifact downloads)
  Over: (1) HMAC-signed ephemeral waczUrl in verify endpoint response (devx-minion proposal); (2) `--token` CLI flag (security-minion proposal)
  Why: HMAC tokens add a second token mechanism (complexity, secret rotation), turn the verify endpoint into a download vector, and the devx-minion themselves flagged the risk of two token types confusing developers. The `--token` flag breaks the zero-config experience for the primary use case (share URL already contains the token). URL propagation is the simplest approach: the tenant generates a share URL, gives it to someone, they paste it into `npx @w-r-l/verify` -- done.

- **Expired token response code**
  Chosen: 410 Gone for expired share tokens
  Over: 404 for all token failures (api-design-minion recommendation)
  Why: The issue spec explicitly requires 410. The information leaked (that a token once existed) is acceptable because the token was intentionally shared. The 410 response helps legitimate users: "this link has expired, ask the owner for a new one" vs. the uninformative 404. Revoked tokens still return 401 (security action -- no info leak).

- **Token prefix**
  Chosen: `wrl_share_` prefix for share tokens
  Over: `stk_` prefix (security-minion proposal)
  Why: `wrl_share_` is consistent with the existing `wrl_live_` prefix for API keys. Both data-minion and api-design-minion recommended this. The prefix also makes it trivial for the auth gate to route tokens to the correct lookup table without trying both.

- **Share creation on pending captures**
  Chosen: Allow share token creation for `pending` and `complete` captures
  Over: Restrict to `complete` only (api-design-minion's initial recommendation, later revised)
  Why: api-design-minion revised their own position after considering the status polling use case -- a tenant may want to share a capture link immediately after submission so a colleague can poll for completion. Failed captures are excluded (nothing useful to share).

### Risks and Mitigations

1. **CRITICAL: Existing captures become immediately inaccessible after deployment.** All unauthenticated `GET /v1/captures/{id}` calls will get 401. Bookmarked URLs, scripted integrations, and the CLI will break.
   - *Mitigation*: This is a pre-GA breaking change. The project is in early development with known users. Deploy atomically (migration + auth gate + share endpoint in one PR). Document in release notes. Tenants create share tokens for captures they need to keep accessible. No grace period needed at current scale.

2. **HIGH: CLI verify tool breakage.** `npx @w-r-l/verify <capture-url>` will get 401 on artifact download.
   - *Mitigation*: Task 2 updates the CLI to propagate `?token=` from share URLs. Server-side verification via `/v1/verify/{id}` continues to work without any changes. The CLI can still verify local files. Release CLI update alongside the auth gate.

3. **MEDIUM: Share token in URL query string visible in logs.** Tokens appear in server logs, browser history, and proxy logs.
   - *Mitigation*: Time-limited tokens bound exposure window. `Referrer-Policy: no-referrer` already set. Server-side logging must hash/prefix-only the token. Documented as accepted risk in SECURITY.md threat analysis.

4. **MEDIUM: Token table growth.** Share tokens accumulate over time.
   - *Mitigation*: Expired token cleanup in existing cron handler. Per-capture limit of 20 active tokens. Backlog item for periodic purge of old revoked tokens.

5. **LOW: Legacy auth backward compatibility.** The `CAPTURE_API_KEY` legacy auth path returns `tenantId: 'default'`. All existing captures belong to the `default` tenant.
   - *Mitigation*: The auth gate uses `verifyAuth()` which already handles legacy auth. Legacy users with `tenantId: 'default'` can access captures owned by `default`. Test explicitly.

### Execution Order

```
Batch 1 (parallel: none -- single critical path):
  Task 1: Auth gate + share tokens + tenant isolation + tests
    [APPROVAL GATE after Task 1]

Batch 2 (parallel):
  Task 2: CLI update (blocked by Task 1)
  Task 3: Documentation (blocked by Task 1)
```

### Verification Steps

After all tasks complete:
1. Run full test suite: `npx vitest run` -- all tests must pass including rewritten capture-retrieval tests
2. Verify unauthenticated GET /v1/captures/{id} returns 401
3. Verify authenticated GET /v1/captures/{id} returns 200 with correct tenant's capture
4. Verify cross-tenant access returns 404 (not 403)
5. Verify GET /v1/verify/{id} still works without any auth
6. Verify share token creation, usage, expiry (410), and revocation (401)
7. Verify share token URL propagation in handleGetCapture response (artifact URLs include ?token=)
8. Grep for "access.*secret" and "no.*auth.*required.*capture" -- zero hits outside test comments
9. Verify CLI accepts share URLs with ?token= and propagates to artifact download
