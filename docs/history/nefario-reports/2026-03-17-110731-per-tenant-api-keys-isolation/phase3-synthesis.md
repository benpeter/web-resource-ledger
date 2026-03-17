# Phase 3: Synthesis -- Per-Tenant API Keys and Tenant Isolation

## Conflict Resolutions

### Conflict 1: Revoked key visibility in GET /v1/admin/keys

**api-design-minion** says: exclude revoked keys by default, require `?include=revoked` to see them. Rationale: primary use case is "show me active keys"; revoked keys are noise.

**devx-minion** says: include revoked keys by default with `revokedAt` field present. Rationale: gives operators a complete view of key lifecycle; at single-digit key counts, noise is not a problem.

**Resolution: Exclude revoked by default (api-design-minion wins).** At any scale, the default view should answer the most common question ("what keys are active?") without filtering. The `?include=revoked` parameter is trivial to implement and trivial to use. Operators who want the full view opt in; operators auditing active access do not need to remember to filter. This matches Stripe's pattern, which operators already know.

### Conflict 2: Name uniqueness enforcement

**ux-strategy-minion** flagged this for discussion: enforcing unique names per tenant creates friction during key rotation (must revoke old key before reusing the name, or invent a temporary name).

**devx-minion** recommends: enforce uniqueness among active (non-revoked) keys per tenant. Return 409 with actionable message.

**Resolution: Do NOT enforce name uniqueness for MVP (ux-strategy-minion's concern wins).** Names are labels for human recall, not identifiers. The `keyHash` is the identifier. Enforcing uniqueness creates real friction during key rotation and adds implementation complexity (scan all keys for name collision before creating). At single-digit key counts, duplicate names are unlikely and can be resolved by the operator via list + rename in a future release. YAGNI. If name collision becomes a real problem, add enforcement later.

### Conflict 3: Effective vs. requested scopes in POST response

**devx-minion** recommends: return effective scopes in POST response (e.g., `["capture", "read"]` when `["capture"]` was requested). "No surprises at enforcement time."

**api-design-minion** recommends: store exactly what was requested; enforce implication at runtime. Return what was stored.

**Resolution: Store and return exactly what was requested (api-design-minion wins).** The scope implication is a policy rule that could change. Returning expanded scopes conflates storage with policy. The auth layer's `hasScope()` function handles the implication transparently. If an operator wonders why their `capture` key can read, the answer is in the API docs, not a magic response transformation.

### Conflict 4: Lucy's gating condition

**lucy** flagged that the R12 backlog item says "gated on multi-user decision -- do not build until a second user is real or imminent." No explicit statement that the gate has been satisfied.

**Resolution: Surface this at the first approval gate.** The user initiated this orchestration including a full advisory with design decisions, which implies intent to build. However, per lucy's recommendation, the execution plan's first approval gate must include an explicit gating condition confirmation. Planning can proceed; code execution must not start until the user confirms.

### Conflict 5: `wrl_test_` prefix for staging keys

**ux-strategy-minion** recommends adding `wrl_test_` prefix for staging.

**Resolution: Defer to backlog (YAGNI).** Environment detection in Workers requires additional bindings. The current scope is already large. Add to backlog as a parking lot item.

### Conflict 6: Warning field in POST response

**ux-strategy-minion** and **devx-minion** both recommend a `warning` field in the POST response body.

**api-design-minion** did not include it, noting "the contract itself is the documentation."

**Resolution: Include the `warning` field.** Both UX and DevX independently recommended it. This is a security-critical moment (one-time key display) where over-communication prevents incidents. The field is a string constant, not dynamic -- negligible implementation cost. The raw key loss scenario has no recovery path, making prevention disproportionately valuable.

---

## Delegation Plan

**Team name**: per-tenant-api-keys
**Description**: Implement per-tenant API key authentication with KV-based key lookup, admin key management API, scope enforcement, dual-mode legacy fallback, and migration runbook. Phase 0037 of WRL evolution.

### Task 1: Auth module rewrite -- KV-based key lookup + admin auth + scope enforcement

- **Agent**: edge-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: yes
- **Gate reason**: This is the security-critical core. The auth module is the trust boundary for the entire API. The dual-mode fallback, scope checking logic, and admin auth separation are hard to reverse once downstream code depends on them. 6+ tasks depend on this module's function signatures and return shapes.
- **Prompt**: |
    ## Task: Rewrite auth module for KV-based key lookup, admin auth, and scope enforcement

    You are implementing the core auth module changes for WRL's per-tenant API key system. This is the most security-critical task in the plan.

    ### Context

    The current `src/auth.js` has a single `verifyApiKey(request, env)` function that compares a Bearer token against the `CAPTURE_API_KEY` env var using timing-safe comparison. It returns `{ ok: true, tenantId: 'default' }` on success.

    The new auth system has two separate auth paths:
    1. **Tenant auth** (`verifyApiKey`): KV-based key lookup for capture/read endpoints, with legacy `CAPTURE_API_KEY` fallback
    2. **Admin auth** (`verifyAdminKey`): Infrastructure secret comparison for `/v1/admin/*` endpoints

    These MUST be separate functions. Admin routes call `verifyAdminKey`. Tenant routes call `verifyApiKey`. The legacy `CAPTURE_API_KEY` must NEVER grant admin access.

    ### What to implement in `src/auth.js`

    **1. `hashApiKey(rawKey)` -- exported utility**
    - SHA-256 hash of the raw key string, returned as lowercase hex
    - Uses `crypto.subtle.digest('SHA-256', ...)`
    - Compute once per request, reuse for KV lookup and logging
    - Export this function (tests and the admin API will import it)

    **2. `hasScope(grantedScopes, requiredScope)` -- exported utility**
    - Returns true if `grantedScopes` includes `requiredScope`
    - Special rule: `capture` implies `read` (if requiredScope is 'read' and grantedScopes includes 'capture', return true)
    - `admin` does NOT imply `capture` or `read`
    - Keep the implication logic in this one function

    **3. `verifyApiKey(request, env, { requiredScope = 'capture' } = {})` -- rewrite**

    Auth resolution order:
    1. Extract Bearer token from Authorization header (same header parsing as today)
    2. Hash the token with SHA-256 to hex
    3. Look up `apikey:{sha256hex}` in `env.KV`
    4. If found and NOT revoked:
       - Validate `tenantId` from record against TENANT_ID_RE
       - Check scope via `hasScope(record.scopes, requiredScope)` -- return 403 if insufficient
       - Return `{ ok: true, tenantId, scopes: record.scopes, keyName: record.name, authMethod: 'kv' }`
    5. If found and revoked: return 401 "Invalid API key" (same as not found -- do not reveal revocation to caller). DO NOT fall through to legacy.
    6. If NOT found in KV (null): fall back to timing-safe comparison against `CAPTURE_API_KEY` env var
       - If matches: log `security.legacy_auth_used` at severity 4 (warn) and return `{ ok: true, tenantId: 'default', scopes: ['capture', 'read'], keyName: null, authMethod: 'legacy' }`
       - Hardcode scopes and tenantId. These MUST NOT come from any external input.
    7. If neither matches: return 401

    Misconfiguration guard: if BOTH `env.KV` has no apikey records AND `env.CAPTURE_API_KEY` is absent, return 503 "Service is not configured". However, if KV is available (even with no keys yet) and CAPTURE_API_KEY exists, auth can still work via the fallback.

    On failure, return enriched object:
    ```javascript
    {
      ok: false,
      response: problemResponse(...),
      reason: 'key_not_found' | 'key_revoked' | 'scope_insufficient' | 'missing_header' | 'invalid_scheme' | 'service_not_configured',
      // Only when key was found but rejected:
      keyName: record?.name,
      keyHashPrefix: sha256hex?.slice(0, 8),
      tenantId: record?.tenantId,
    }
    ```

    **4. `verifyAdminKey(request, env)` -- new function**
    - Misconfiguration guard: if `!env.ADMIN_KEY`, return `{ ok: false, response: problemResponse(503, 'Admin API is not configured') }`
    - Extract Bearer token (same header parsing)
    - Timing-safe compare against `env.ADMIN_KEY` (same pattern as current CAPTURE_API_KEY comparison)
    - On match: return `{ ok: true, authMethod: 'admin_key' }`
    - On mismatch: return `{ ok: false, response: problemResponse(401, 'Invalid admin key', { 'WWW-Authenticate': 'Bearer' }), reason: 'invalid_admin_key' }`
    - This function does NOT check KV. It does NOT fall back to anything. It is a pure infrastructure secret check.

    ### Files to modify
    - `src/auth.js` -- the entire rewrite lives here

    ### CLAUDE.md conventions (mandatory)
    - **Fail loudly**: Every auth path must either log the outcome or return a distinguishable error. No silent catch blocks. The `reason` field MUST distinguish "key not found in KV" from "KV lookup error" from "key revoked" from "scope insufficient" from "legacy fallback used". Per CLAUDE.md: "the system must distinguish 'service unavailable' from 'misconfigured'."
    - **300ms latency budget**: SHA-256 hash is computed once (sub-ms on Workers). KV lookup is a single `await env.KV.get()`. No serial KV calls in the auth hot path.
    - **No silent fallback**: When legacy auth is used, log `security.legacy_auth_used` at severity 4 so operators can track migration progress.

    ### What NOT to do
    - Do NOT modify `src/index.js` (route registration and handler changes are a separate task)
    - Do NOT modify `src/kv.js` (KV CRUD functions are a separate task)
    - Do NOT add KV-stored admin-scoped keys (tenant admin). Only `ADMIN_KEY` env var for MVP.
    - Do NOT add `wrl_test_` prefix detection
    - Do NOT add audit-grade logging (R13 scope)
    - Do NOT cache KV results in-Worker (KV's built-in 60s edge cache handles this)

    ### Security constraints
    - The raw Bearer token MUST NEVER appear in logs, error responses, or KV records
    - `verifyAdminKey` and `verifyApiKey` are separate functions -- do not merge them
    - Legacy fallback only triggers when KV lookup returns null (not on revoked keys)
    - Admin auth on admin endpoints is completely separate from tenant auth

    ### Reference files
    - Current auth: `src/auth.js` (full rewrite, but preserve the header comment style)
    - Responses: `src/responses.js` (use `problemResponse()`)
    - Logging: `src/log.js` (use `log(env, severity, subsystem, data)`)
    - KV: `src/kv.js` (will have new functions; for now just use `env.KV.get()` directly)

- **Deliverables**: Rewritten `src/auth.js` with `hashApiKey`, `hasScope`, `verifyApiKey`, `verifyAdminKey`
- **Success criteria**:
  - `verifyApiKey` resolves KV-based keys with tenant isolation and scope checking
  - `verifyAdminKey` is a separate function checking only `ADMIN_KEY` env var
  - Legacy fallback works for `CAPTURE_API_KEY` with hardcoded scopes/tenantId
  - All failure paths return enriched objects with `reason` field
  - No raw key material in any log or error response
  - `hashApiKey` and `hasScope` are exported for use by other modules

### Task 2: KV data layer -- API key CRUD functions

- **Agent**: data-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |
    ## Task: Add API key CRUD functions to kv.js

    Add four functions to `src/kv.js` for managing API key records in KV. These functions centralize all KV access for key records, following the same pattern used for capture records.

    ### KV key schema

    Key: `apikey:{sha256hex}` where sha256hex is exactly 64 lowercase hex characters.

    Value (JSON):
    ```json
    {
      "tenantId": "acme-corp",
      "scopes": ["capture"],
      "name": "production-capture",
      "createdAt": "2026-03-17T14:30:00.000Z",
      "createdBy": "admin",
      "revoked": false,
      "revokedAt": null
    }
    ```

    ### Functions to implement

    **1. `createApiKeyRecord(kv, sha256hex, record)`**
    - Writes `apikey:{sha256hex}` with the full record object
    - Validates sha256hex matches `/^[a-f0-9]{64}$/` -- throw if invalid
    - Checks for existing non-revoked key at that hash (collision guard). If found, return `{ created: false, reason: 'hash_collision' }`
    - On success, return `{ created: true }`
    - The record object is passed as-is (validation happens in the admin API handler, not here)

    **2. `getApiKeyRecord(kv, sha256hex)`**
    - Reads and returns the parsed JSON record, or null if not found
    - Validates sha256hex format
    - Uses `kv.get(key, 'json')` for direct parsing

    **3. `revokeApiKeyRecord(kv, sha256hex)`**
    - Reads existing record. If not found, return `{ revoked: false, reason: 'not_found' }`
    - If already revoked, return `{ revoked: true, record: existingRecord }` (idempotent)
    - Sets `revoked: true` and `revokedAt: new Date().toISOString()`, writes back
    - Return `{ revoked: true, record: updatedRecord }`

    **4. `listApiKeyRecords(kv, { tenantId, includeRevoked = false } = {})`**
    - `kv.list({ prefix: 'apikey:' })` to get all key hashes
    - `Promise.all()` to fetch all records in parallel
    - Filter out null records (defensive)
    - If `tenantId` provided, filter by it
    - If `!includeRevoked`, filter out `revoked: true` records
    - Return array of `{ keyHash, ...record }` objects, sorted by `createdAt` ascending
    - No secondary index needed (key count is single-digit to low double-digit)

    ### KV prefix registry

    Add a prefix registry comment at the top of `kv.js` (alongside existing documentation):

    ```javascript
    // KV key prefix registry -- all prefixes must be unique and documented here.
    // Adding a new prefix? Check for overlaps with existing prefixes.
    //   capture:{captureId}                        -- primary capture records
    //   tenant:{tenantId}:ts:{ISO}:{captureId}     -- tenant listing index
    //   signing-key:{keyId}                        -- archived signing keys
    //   apikey:{sha256hex}                         -- API key records (64 hex chars)
    ```

    ### Files to modify
    - `src/kv.js` -- add four functions and prefix registry comment

    ### What NOT to do
    - Do NOT add a secondary index for key records (YAGNI -- key count is small)
    - Do NOT add TTL/expiration to key records (keys persist indefinitely)
    - Do NOT modify existing capture-related functions
    - Do NOT enforce name uniqueness (resolved as not needed for MVP)

    ### Reference
    - Current KV module: `src/kv.js` -- follow the existing export pattern and JSDoc style
    - The sha256hex format is exactly 64 lowercase hex characters `[a-f0-9]{64}`

- **Deliverables**: Updated `src/kv.js` with `createApiKeyRecord`, `getApiKeyRecord`, `revokeApiKeyRecord`, `listApiKeyRecords`, prefix registry comment
- **Success criteria**:
  - All four functions work with real KV (miniflare-backed in tests)
  - Hash format validated on all operations
  - Collision guard on create
  - Idempotent revocation
  - Sorted listing with optional tenant filter and revoked filter

### Task 3: Admin API handlers + route registration + rate limiter + wrangler.toml

- **Agent**: edge-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1, Task 2
- **Approval gate**: no
- **Prompt**: |
    ## Task: Implement admin API endpoints, register routes, add rate limiter binding

    Implement the three admin key management endpoints and integrate them into the Worker's routing and rate limiting infrastructure.

    ### Admin endpoints to implement

    Create a new file `src/admin.js` with three handler functions:

    **1. `handleAdminCreateKey(request, env, ctx, matches)`**

    Processing order: Content-Type check -> parse body -> validate fields -> generate key -> hash -> store in KV -> return 201

    Request validation:
    - Content-Type must be application/json (415 if not)
    - Body must be valid JSON (400 if not)
    - `tenantId` (string, required): must match `/^[a-z0-9_-]{1,64}$/`
    - `scopes` (array, required, non-empty): each must be one of 'capture', 'read', 'admin'
    - `name` (string, required, 1-128 chars): printable ASCII `/^[\x20-\x7E]{1,128}$/`
    - First validation failure wins (return one error at a time, same pattern as handleCreateCapture)

    Key generation:
    - `crypto.getRandomValues(new Uint8Array(32))` for 256-bit random
    - Base64url encode (no padding)
    - Prefix with `wrl_live_`
    - SHA-256 hash the full key string (including prefix) using `hashApiKey` from auth.js
    - Store in KV via `createApiKeyRecord` from kv.js with `createdBy: 'admin'`

    Response (201):
    ```json
    {
      "key": "wrl_live_...",
      "keyHash": "a1b2c3d4...",
      "tenantId": "acme-corp",
      "scopes": ["capture"],
      "name": "prod-primary",
      "createdAt": "2026-03-17T14:30:00.000Z",
      "warning": "Store this key now. It cannot be retrieved after this response."
    }
    ```
    Set `Cache-Control: private, no-store` on the response.

    Log `admin.key_create` at severity 3 with: tenantId, keyName, scopes, keyHashPrefix (first 8 hex chars), cip, authMethod.
    NEVER log the raw key.

    **2. `handleAdminListKeys(request, env, ctx, matches)`**

    Query params:
    - `tenant` (optional): filter by tenantId
    - `limit` (optional, default 20, max 100): same validation as listCaptures
    - `cursor` (optional): opaque pagination cursor (same pattern as listCaptures)
    - `include` (optional): if value is 'revoked', include revoked keys

    Use `listApiKeyRecords` from kv.js for the data fetch. Apply pagination in-memory (key count is small enough).

    Response (200):
    ```json
    {
      "data": [{ "keyHash": "...", "tenantId": "...", "scopes": [...], "name": "...", "createdAt": "...", "createdBy": "admin" }],
      "pagination": { "cursor": null, "hasMore": false, "limit": 20 }
    }
    ```
    Revoked keys (when included) have additional `revoked: true` and `revokedAt` fields.
    Set `Cache-Control: private, no-store`.

    Log `admin.key_list` at severity 6 with: resultCount, cip, authMethod.

    **3. `handleAdminRevokeKey(request, env, ctx, matches)`**

    Path param: `keyHash` (64 hex chars, captured by route regex)
    Use `revokeApiKeyRecord` from kv.js.
    - If not found: return 404 "API key not found." Log `admin.key_revoke_fail` at severity 4.
    - If revoked (including idempotent re-revoke): return 200 with final record state. Log `admin.key_revoke` at severity 3.

    Response (200):
    ```json
    {
      "keyHash": "...",
      "tenantId": "...",
      "scopes": [...],
      "name": "...",
      "createdAt": "...",
      "revoked": true,
      "revokedAt": "..."
    }
    ```
    Set `Cache-Control: private, no-store`.

    ### Route registration in `src/index.js`

    Add three routes to the `routes` array (before the fallback):
    ```javascript
    ['POST',   /^\/v1\/admin\/keys$/, handleAdminCreateKey],
    ['GET',    /^\/v1\/admin\/keys$/, handleAdminListKeys],
    ['DELETE', /^\/v1\/admin\/keys\/([a-f0-9]{64})$/, handleAdminRevokeKey],
    ```

    Import `handleAdminCreateKey`, `handleAdminListKeys`, `handleAdminRevokeKey` from `./admin.js`.
    Import `verifyAdminKey` from `./auth.js`.

    **Admin auth wrapper in the main fetch handler**: For admin routes, call `verifyAdminKey(request, env)` instead of `verifyApiKey`. The admin routes must NOT call `verifyApiKey` and must NOT accept the legacy `CAPTURE_API_KEY`.

    Admin rate limiting: check `env.ADMIN_RATE_LIMITER` BEFORE auth (rate limit fires before credential check to prevent brute force). Use the same IP-keyed pattern as existing rate limiters with `if (env.ADMIN_RATE_LIMITER)` guard for local dev.

    **No CORS on admin routes.** Do not add CORS headers. Do not add OPTIONS handler for `/v1/admin/*`.

    ### Rate limiter changes

    Update `src/rate-limits.js`:
    ```javascript
    export const RATE_LIMITS = {
      capture: { limit: 10, period: 60 },
      verify:  { limit: 60, period: 60 },
      admin:   { limit: 5,  period: 60 },
    };
    ```

    Update `getRateLimitGroup()` in `src/index.js`:
    ```javascript
    if (pathname.startsWith('/v1/admin/')) return 'admin';
    ```

    ### wrangler.toml changes

    Add ADMIN_RATE_LIMITER binding in production (after GLOBAL_CAPTURE_LIMITER):
    ```toml
    [[unsafe.bindings]]
    name = "ADMIN_RATE_LIMITER"
    type = "ratelimit"
    namespace_id = "1004"
    simple = { limit = 5, period = 60 }
    ```

    Add ADMIN_RATE_LIMITER in staging (after staging GLOBAL_CAPTURE_LIMITER):
    ```toml
    [[env.staging.unsafe.bindings]]
    name = "ADMIN_RATE_LIMITER"
    type = "ratelimit"
    namespace_id = "2004"
    simple = { limit = 5, period = 60 }
    ```

    ### Scope enforcement on existing endpoints

    In `src/index.js`, modify the existing endpoint handlers:
    - `handleCreateCapture`: call `verifyApiKey(request, env, { requiredScope: 'capture' })` (was just `verifyApiKey(request, env)`)
    - `handleListCaptures`: call `verifyApiKey(request, env, { requiredScope: 'read' })`
    - `handleCaptureStatus`, `handleGetCapture`, `handleGetCaptureArtifact`: call `verifyApiKey(request, env, { requiredScope: 'read' })`

    ### Log enrichment for existing events

    After auth succeeds on tenant endpoints, the auth result now includes `keyName`, `authMethod`, and `scopes`. Pass these through to log events:
    - All post-auth events in `src/index.js` that currently log `tenantId` should also log `keyName` and `authMethod`
    - Pass `keyName` and `authMethod` through to `performCapture()` in `src/capture.js` (add parameters)
    - Update all capture pipeline log events in `src/capture.js` to include `keyName`
    - For auth failure events (`security.auth_fail`): replace bare `status` field with `reason` from auth result, include `keyName`/`keyHashPrefix`/`tenantId` when available
    - Rate limit events after auth (in handleCreateCapture, handleListCaptures): include `tenantId`, `keyName`, `authMethod`
    - Add `security.legacy_auth_used` warn event (severity 4, subsystem 'security') when legacy fallback is used -- the auth module fires this internally, but the handler should also know (via authMethod field)

    Admin log events use subsystem `'admin'`.

    ### Files to modify
    - `src/admin.js` (NEW) -- admin endpoint handlers
    - `src/index.js` -- route registration, admin auth wrapper, scope enforcement, log enrichment
    - `src/capture.js` -- add keyName/authMethod parameters to performCapture, enrich log events
    - `src/rate-limits.js` -- add admin entry
    - `wrangler.toml` -- add ADMIN_RATE_LIMITER bindings

    ### What NOT to do
    - Do NOT add CORS for admin routes
    - Do NOT add OPTIONS handler for admin routes
    - Do NOT route admin requests through verifyApiKey
    - Do NOT add KV-stored admin-scoped keys (only ADMIN_KEY env var for MVP)
    - Do NOT add pagination secondary index for keys
    - Do NOT log the raw API key anywhere

    ### Error messages (RFC 9457 pattern via `problemResponse()`)
    - 400: `"Field 'tenantId' is required"`, `"Field 'tenantId' must be 1-64 lowercase alphanumeric characters, hyphens, or underscores"`, etc. (first failure wins)
    - 401: `"Invalid admin key"` (with WWW-Authenticate: Bearer)
    - 403: `"This operation requires 'capture' scope."` (for scope enforcement on tenant endpoints)
    - 404: `"API key not found."` (on DELETE, do not echo the hash)
    - 415: `"Content-Type must be application/json"`
    - 429: `"Rate limit exceeded. Try again later."` with Retry-After: 60
    - 503: `"Admin API is not configured"` (when ADMIN_KEY missing)

    ### Reference files
    - `src/auth.js` -- imports hashApiKey, hasScope, verifyApiKey, verifyAdminKey (from Task 1)
    - `src/kv.js` -- imports createApiKeyRecord, revokeApiKeyRecord, listApiKeyRecords (from Task 2)
    - `src/responses.js` -- problemResponse, jsonResponse
    - `src/log.js` -- log(env, severity, subsystem, data)
    - `src/index.js` -- existing route pattern and handler structure
    - `src/capture.js` -- performCapture signature

- **Deliverables**: New `src/admin.js`, updated `src/index.js`, `src/capture.js`, `src/rate-limits.js`, `wrangler.toml`
- **Success criteria**:
  - Three admin endpoints respond correctly with proper auth, rate limiting, and error handling
  - Scope enforcement on existing capture/list endpoints
  - Log enrichment with keyName/authMethod on all post-auth events
  - Admin rate limiter binding in both production and staging
  - No CORS on admin routes
  - Cache-Control: private, no-store on all admin responses

### Task 4: Test suite -- auth tests, admin API tests, vitest config

- **Agent**: test-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1, Task 2, Task 3
- **Approval gate**: no
- **Prompt**: |
    ## Task: Write comprehensive test suite for auth rewrite and admin API

    Write tests for the new auth module and admin API endpoints. All KV is real (miniflare-backed) -- never mock KV.

    ### vitest.config.js updates

    Add these miniflare bindings:
    ```javascript
    ADMIN_KEY: 'test-admin-key-for-vitest',
    ```

    The `ADMIN_RATE_LIMITER` binding will be picked up from wrangler.toml automatically.

    ### Shared test helper: `test/fixtures.js` additions

    Add to the existing `test/fixtures.js`:
    ```javascript
    import { hashApiKey } from '../src/auth.js';

    export const TEST_ADMIN_KEY = 'test-admin-key-for-vitest';
    export const TEST_TENANT_KEY = 'wrl_live_' + 'a'.repeat(43);

    export async function seedApiKey(kv, rawKey, {
      tenantId = 'default',
      scopes = ['capture', 'read'],
      name = 'test-key',
      revoked = false,
      revokedAt = null,
    } = {}) {
      const keyHash = await hashApiKey(rawKey);
      await kv.put(`apikey:${keyHash}`, JSON.stringify({
        tenantId,
        scopes,
        name,
        createdAt: new Date().toISOString(),
        createdBy: 'test',
        revoked,
        revokedAt,
      }));
      return keyHash;
    }
    ```

    Import `hashApiKey` from the auth module -- single source of truth for the hash algorithm.

    ### `test/auth.test.js` -- rewrite

    Restructure into four describe blocks. Use `import { env } from 'cloudflare:test'` for real KV (same pattern as test/kv.test.js).

    ```
    describe('verifyApiKey -- KV-based key lookup')
      - valid key with capture scope succeeds
      - valid key with read scope returns ok for read-required endpoint
      - capture scope implies read (key with only 'capture' passes read check)
      - unknown key returns 401
      - revoked key returns 401 (same as not found -- no info leak)
      - key with insufficient scope returns 403 naming the required scope
      - response includes keyName and authMethod on success
      - tenantId from KV record is validated against TENANT_ID_RE

    describe('verifyApiKey -- dual-mode legacy fallback')
      - legacy CAPTURE_API_KEY still works when no KV key matches
      - legacy key returns tenantId: 'default' and scopes: ['capture', 'read']
      - legacy key does NOT grant admin scope
      - when both KV and legacy could match, KV wins
      - revoked key does NOT fall through to legacy (deny, not fallback)
      - authMethod is 'legacy' on fallback, 'kv' on KV match

    describe('verifyAdminKey -- admin infrastructure credential')
      - valid ADMIN_KEY returns { ok: true }
      - invalid ADMIN_KEY returns 401
      - missing ADMIN_KEY returns 503
      - CAPTURE_API_KEY does NOT work on admin auth
      - KV tenant key does NOT work on admin auth

    describe('verifyApiKey -- existing behavior (preserved)')
      - missing Authorization header returns 401
      - non-Bearer scheme returns 401
      - empty token returns 401
      - RFC 9457 response shape (type, status, title, detail)
      - key never echoed in error responses
      - misconfigured environment returns 503
    ```

    Each describe block seeds KV state in `beforeEach` and cleans up apikey:* keys.

    ### `test/admin-keys.test.js` -- new file

    Uses `SELF.fetch()` pattern (same as test/capture-integration.test.js).

    ```
    describe('POST /v1/admin/keys -- create key')
      - returns 201 with raw key (wrl_live_ prefix)
      - response includes keyHash (64 hex chars), tenantId, scopes, name, createdAt, warning
      - raw key is NOT present in subsequent GET response
      - requires ADMIN_KEY authorization (401 without)
      - CAPTURE_API_KEY returns 401 on admin endpoint
      - validates required fields (400 for missing tenantId, scopes, name)
      - validates tenantId format (400 for invalid)
      - validates scope values (400 for invalid scope)
      - returns 415 for non-JSON content type

    describe('GET /v1/admin/keys -- list keys')
      - returns all non-revoked keys
      - returns revoked keys when ?include=revoked
      - excludes revoked keys by default
      - raw key is NEVER in list response
      - supports ?tenant filter
      - requires ADMIN_KEY authorization
      - response shape matches { data: [...], pagination: {...} }

    describe('DELETE /v1/admin/keys/{keyHash} -- revoke key')
      - returns 200 with final revoked state
      - idempotent: revoking already-revoked key returns 200
      - returns 404 for unknown keyHash
      - revoked key fails subsequent auth (within same test = immediate)
      - requires ADMIN_KEY authorization

    describe('Admin API -- round-trip lifecycle')
      - Create key -> use key for POST /v1/captures -> revoke key -> verify 401
      - This is the critical end-to-end flow

    describe('Admin API -- rate limiting')
      - Admin rate limiter is independent from capture rate limiter
      - Admin rate limit returns 429 with Retry-After: 60

    describe('Scope enforcement on tenant endpoints')
      - KV key with read scope cannot POST /v1/captures (403)
      - KV key with capture scope CAN GET /v1/captures (capture implies read)
      - KV key with admin scope cannot POST /v1/captures (403)
    ```

    ### `test/kv.test.js` -- add API key record tests

    Add a new describe block to the existing file:
    ```
    describe('API key records')
      - createApiKeyRecord stores and retrieves correctly
      - getApiKeyRecord returns null for nonexistent key
      - revokeApiKeyRecord sets revoked flag and revokedAt
      - revokeApiKeyRecord is idempotent
      - revokeApiKeyRecord returns not_found for nonexistent key
      - listApiKeyRecords returns all active keys
      - listApiKeyRecords filters by tenantId
      - listApiKeyRecords excludes revoked by default
      - listApiKeyRecords includes revoked when requested
      - createApiKeyRecord detects hash collision (existing non-revoked key)
    ```

    ### Security-critical adversarial tests (distribute across files)
    - Legacy CAPTURE_API_KEY on admin endpoint returns 401 (NOT 200) -- in admin-keys.test.js
    - Revoked KV key returns 401 (NOT falls through to legacy) -- in auth.test.js
    - Admin key on capture endpoint gets 401/403 (admin is not capture) -- in admin-keys.test.js or capture-integration
    - Malicious tenantId in KV record (fails TENANT_ID_RE) returns 500 -- in auth.test.js
    - Key hash prefix is 8 chars in failure logs for found-but-rejected keys -- in auth.test.js

    ### Files to modify
    - `vitest.config.js` -- add ADMIN_KEY binding
    - `test/fixtures.js` -- add seedApiKey helper, test constants
    - `test/auth.test.js` -- restructure and add KV-based, legacy fallback, admin auth tests
    - `test/kv.test.js` -- add API key record describe block
    - `test/admin-keys.test.js` (NEW) -- admin API endpoint tests

    ### What NOT to do
    - Do NOT mock KV (use real miniflare-backed KV everywhere)
    - Do NOT modify test/integration/ browser tests
    - Do NOT add performance benchmarks (out of scope)

    ### Reference files
    - `test/capture-integration.test.js` -- example of SELF.fetch() test pattern
    - `test/kv.test.js` -- example of cloudflare:test KV usage
    - `test/auth.test.js` -- existing auth tests (preserve backwards-compatible behavior)
    - `test/fixtures.js` -- existing shared helpers

- **Deliverables**: Updated `vitest.config.js`, `test/fixtures.js`, `test/auth.test.js`, `test/kv.test.js`, new `test/admin-keys.test.js`
- **Success criteria**:
  - All tests use real miniflare KV (no mocks)
  - Round-trip lifecycle test passes (create -> use -> revoke -> verify 401)
  - Security adversarial tests pass
  - Existing auth tests still pass (dual-mode fallback validates legacy behavior)
  - All tests pass with `npm test`

### Task 5: OpenAPI spec + documentation updates

- **Agent**: software-docs-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 3
- **Approval gate**: no
- **Prompt**: |
    ## Task: Update OpenAPI spec, OPERATIONS.md, README.md, SECURITY.md, and backlog

    Update all documentation to reflect the per-tenant API key system. This ships in the same PR as the code changes.

    ### 1. OpenAPI spec (`openapi.yaml`)

    **Version bump**: 0.4.0 -> 0.5.0

    **New security scheme** -- add `adminAuth` alongside existing `bearerAuth`:
    ```yaml
    components:
      securitySchemes:
        bearerAuth:
          type: http
          scheme: bearer
          description: >
            Tenant API key. Provisioned via the admin API (POST /v1/admin/keys).
            Scoped to a single tenant with capture and/or read permissions.
        adminAuth:
          type: http
          scheme: bearer
          description: >
            Admin infrastructure key. Set via wrangler secret put ADMIN_KEY.
            Grants access to key management endpoints. Does not grant tenant
            capture or read access.
    ```

    **New `admin` tag**: Group the three admin endpoints.

    **New schemas**:
    - `AdminKeyCreateRequest`: tenantId, scopes, name (with format constraints)
    - `AdminKeyCreated`: key, keyHash, tenantId, scopes, name, createdAt, warning
    - `AdminKeySummary`: keyHash, tenantId, scopes, name, createdAt, createdBy, optional revoked/revokedAt
    - `AdminKeyRevoked`: keyHash, tenantId, scopes, name, createdAt, revoked, revokedAt
    - `AdminKeyListResponse`: data (array of AdminKeySummary), pagination (reuse existing Pagination schema)

    **New response component**: `Problem403` for scope-based authorization failure.

    **Three new paths**:
    - `POST /v1/admin/keys` (operationId: createAdminKey, security: adminAuth, tag: admin)
    - `GET /v1/admin/keys` (operationId: listAdminKeys, security: adminAuth, tag: admin, params: tenant, limit, cursor, include)
    - `DELETE /v1/admin/keys/{keyHash}` (operationId: revokeAdminKey, security: adminAuth, tag: admin)

    Each path needs: summary, description (include curl example), request/response schemas with examples, error responses (400, 401, 403, 404, 415, 429, 503 as applicable).

    For DELETE, document: "Revocation takes effect within 60 seconds due to distributed edge caching."
    For POST, document: "The raw key is returned exactly once. It cannot be retrieved after this response."

    Update existing `bearerAuth` description to mention KV-based tenant keys.

    ### 2. OPERATIONS.md

    **Secret Surfaces table**: Add row for `ADMIN_KEY`:
    - Variable: `ADMIN_KEY`
    - Purpose: Admin infrastructure key for key management API
    - Set via: `wrangler secret put ADMIN_KEY`
    - Required: After multi-tenant migration

    **New section: "Multi-Tenant Key Migration"** -- place between Secret Surfaces and GitHub Environment Setup.

    Structure as three phases (per ux-strategy-minion's operator mental model):

    **Phase 1: Deploy the new code (nothing breaks)**
    - Operator question: "Can I deploy this without affecting anything?"
    - Answer: Yes. Dual-mode fallback means existing CAPTURE_API_KEY continues to work.
    - Action: merge PR, let CD deploy
    - Verify: existing curl commands still work
    - If something goes wrong: revert PR, redeploy. CAPTURE_API_KEY still works.

    **Phase 2: Set up the admin API (new capability, nothing breaks)**
    - Operator question: "How do I start using the new system?"
    - Action 1: `wrangler secret put ADMIN_KEY` (staging first, then production)
    - Action 2: `curl -X POST .../v1/admin/keys` to create first key for default tenant
    - Include complete curl examples with `$ADMIN_KEY` variable and `| jq .`
    - Include "save the key" example: `| jq -r .key > /tmp/wrl-key-default.txt`
    - Verify: use the new key to submit a capture
    - Verify: use the new key to list captures
    - If something goes wrong: admin API broken? revert PR. Key broken? revoke and create new one.

    **Phase 3: Retire legacy key (cleanup, only after confidence)**
    - Operator question: "When is it safe to remove the legacy key?"
    - Check: run Coralogix query `authMethod:"legacy" AND event:"capture.start"` -- must be zero for 7+ days
    - Action 1: update all client configs to use new tenant key
    - Action 2: `wrangler secret delete CAPTURE_API_KEY`
    - Verify: captures work with new key. Old key returns 401.
    - If something goes wrong: re-set CAPTURE_API_KEY via wrangler secret put

    Note about key creation propagation: "Newly created keys are usable immediately from any Cloudflare location. Revoked keys may remain valid for up to 60 seconds due to edge caching."

    **Update GitHub environment secrets tables** (both production and staging):
    - Add `ADMIN_KEY` row

    ### 3. README.md

    - Update step 4 (Configure capture API key): add note that this becomes a legacy fallback when using per-tenant keys
    - Add new step for ADMIN_KEY provisioning (after the other secrets)
    - Update Usage section to mention tenant keys and admin API for key provisioning
    - Update roadmap: mark R12 as complete in Act 2

    ### 4. SECURITY.md

    Add to the scope of security issues:
    - "Admin API key compromise or bypass"
    - "Tenant data isolation escape (cross-tenant data access)"

    ### 5. docs/backlog.md

    - Mark R12 as DONE
    - Update parking lot items gated on R12 (per-tenant rate limiting condition now met, API key rotation now possible)
    - Note in the Backlog changes section of outcome.md what changed

    ### Files to modify
    - `openapi.yaml`
    - `OPERATIONS.md`
    - `README.md`
    - `SECURITY.md`
    - `docs/backlog.md`

    ### What NOT to do
    - Do NOT modify TERMS.md (existing language is sufficient)
    - Do NOT modify CONTENT-POLICY.md
    - Do NOT add detailed dual-mode explanation in README (keep it simple; OPERATIONS.md has the detail)
    - Do NOT add audit logging documentation (R13 scope)

    ### Reference
    - Current openapi.yaml for existing patterns, schema style, $ref usage
    - Current OPERATIONS.md for section structure and style
    - Current README.md for setup step structure
    - Current SECURITY.md for scope format

- **Deliverables**: Updated `openapi.yaml` (v0.5.0), `OPERATIONS.md` (migration runbook), `README.md`, `SECURITY.md`, `docs/backlog.md`
- **Success criteria**:
  - OpenAPI spec has all three admin endpoints with full schemas and examples
  - Migration runbook has three phases with copy-pasteable curl commands
  - All cross-references between docs remain valid
  - Backlog updated with R12 completion

### Task 6: Evolution log -- phase 0037

- **Agent**: software-docs-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |
    ## Task: Create evolution log structure for phase 0037

    Create the evolution log directory and prompt.md for phase 0037. This must be done before implementation starts (per CLAUDE.md rule).

    ### Create directory and files

    Create `docs/evolution/0037-per-tenant-api-keys/prompt.md` with the exact task description from the issue/prompt that initiated this phase. This should capture:
    - The outcome statement
    - Success criteria
    - Scope (in/out)
    - Design decisions from the advisory
    - Migration plan requirements

    Read the task prompt from `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-BWG9Hx/per-tenant-api-keys-isolation/prompt.md` and use it as the basis for `prompt.md`.

    Create placeholder `docs/evolution/0037-per-tenant-api-keys/decisions.md` with a header and note that decisions will be captured during implementation.

    ### Update evolution index

    Add entry to `docs/evolution/README.md`:
    ```
    | 0037 | per-tenant-api-keys | Per-tenant API keys with KV-based lookup, admin API, scope enforcement, dual-mode legacy fallback |
    ```

    ### Files to create/modify
    - `docs/evolution/0037-per-tenant-api-keys/prompt.md` (NEW)
    - `docs/evolution/0037-per-tenant-api-keys/decisions.md` (NEW, placeholder)
    - `docs/evolution/README.md` (update index)

    ### What NOT to do
    - Do NOT create outcome.md yet (that comes after implementation)
    - Do NOT create process.md yet (that comes after PR creation)

- **Deliverables**: Evolution log directory with prompt.md, placeholder decisions.md, updated README.md index
- **Success criteria**: Phase 0037 exists in the evolution log with the correct prompt captured before code changes begin

---

### Cross-Cutting Coverage

- **Testing** (test-minion): Covered by Task 4. All new code gets comprehensive tests using real miniflare KV. Round-trip lifecycle test validates end-to-end flow. Security adversarial tests cover critical attack vectors.
- **Security** (security-minion): Security requirements are baked into Task 1 (auth module) and Task 3 (admin handlers). Separate verifyAdminKey function, timing-safe comparison, no raw key logging, dual-mode fallback with hardcoded scopes, misconfiguration guards. Architecture review (Phase 3.5) will have security-minion validate the final implementation plan.
- **Usability -- Strategy** (ux-strategy-minion): Covered by conflict resolutions and Task 3 error messages. Three-phase migration runbook follows operator mental model. Natural-language 403 messages name required scope. Idempotent DELETE. Warning field in POST response.
- **Usability -- Design** (ux-design-minion): NOT included. No user-facing UI in this task -- admin API is purely curl/script-driven. No visual interface to review.
- **Documentation** (software-docs-minion): Covered by Task 5 (OpenAPI, OPERATIONS.md runbook, README, SECURITY, backlog) and Task 6 (evolution log). user-docs-minion NOT included separately -- the operator documentation (OPERATIONS.md runbook) is the user doc for this feature, handled by software-docs-minion.
- **Observability** (observability-minion): Covered by Task 1 (auth result enrichment with keyName/authMethod/reason) and Task 3 (admin subsystem log events, post-auth log enrichment). All observability-minion recommendations are integrated into the execution prompts. No separate observability task needed.
- **Accessibility** (accessibility-minion): NOT included. No web-facing HTML or UI. Purely API changes.
- **SEO** (seo-minion): NOT included. No web-facing content changes.
- **Site speed** (sitespeed-minion): NOT included. No web-facing performance impact. Auth latency is validated by gru (within 300ms budget) and enforced via CLAUDE.md convention.

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - observability-minion: The plan produces 6+ new log event types across two subsystems (security, admin) with a new auth result structure. Coordinated observability review ensures event names, severity levels, and field schemas are consistent before implementation. References Tasks 1 and 3.
- **Not selected**: ux-design-minion (no UI), accessibility-minion (no HTML), sitespeed-minion (no web-facing changes), user-docs-minion (OPERATIONS.md runbook covers operator docs)

### Conflict Resolutions

See top of this document. Six conflicts resolved:
1. Revoked key visibility: exclude by default (api-design-minion)
2. Name uniqueness: do not enforce (ux-strategy-minion concern)
3. Effective vs requested scopes in POST response: return as-requested (api-design-minion)
4. Gating condition: surface at first approval gate (lucy)
5. wrl_test_ prefix: defer to backlog (YAGNI)
6. Warning field: include (ux-strategy-minion + devx-minion)

### Risks and Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| R12 gating condition not satisfied | High | First approval gate requires explicit user confirmation |
| ADMIN_KEY absent between deploy and secret provisioning | High | Misconfiguration guard (503) is first check in admin handler. Tested explicitly. |
| Scope confusion between verifyAdminKey and verifyApiKey | High | Structural separation as different functions. Test: CAPTURE_API_KEY on admin endpoint returns 401. |
| KV eventual consistency: revoked key valid for up to 60s | Medium | Accepted per design. Documented in API spec and runbook. |
| Legacy fallback masks migration status | Medium | `security.legacy_auth_used` warn event + `authMethod` field on all events. Coralogix query in runbook. |
| Three specialists produced overlapping admin API recommendations | Medium | Deduplicated in synthesis. api-design-minion's contract wins on schema; ux-strategy-minion on operator journey; devx-minion on curl ergonomics. |
| Auth KV lookup adds latency to every authenticated request | Low | 10-40ms acceptable. KV native 60s edge cache handles hot path. Gru confirmed no custom caching needed. |
| Raw API key in POST response body could be logged by intermediary | Low | Cache-Control: no-store. Never logged in Coralogix. Documented in response. |

### Execution Order

```
Batch 1 (parallel):
  Task 1: Auth module rewrite (edge-minion)          [APPROVAL GATE]
  Task 2: KV data layer (data-minion)
  Task 6: Evolution log setup (software-docs-minion)

  --- Gate: Task 1 approval ---

Batch 2 (after Task 1 + Task 2):
  Task 3: Admin API + routes + wrangler.toml (edge-minion)

Batch 3 (after Task 3):
  Task 4: Tests (test-minion)
  Task 5: Documentation (software-docs-minion)
```

Gate positions:
1. **After Task 1**: Auth module design review (MUST gate -- hard to reverse, 3+ dependents)
2. *No other gates* -- remaining tasks are additive and follow directly from the approved auth contract

### Verification Steps

After all tasks complete:
1. `npm test` passes (all existing + new tests green)
2. `npm run lint` passes (if lint is configured)
3. Round-trip lifecycle test: create key -> capture -> list -> revoke -> verify 401
4. Legacy CAPTURE_API_KEY still works on capture/list endpoints
5. CAPTURE_API_KEY returns 401 on admin endpoints
6. Missing ADMIN_KEY returns 503 on admin endpoints
7. OpenAPI spec validates (`npx @redocly/cli lint openapi.yaml` or similar)
8. Evolution log 0037 has prompt.md
9. docs/backlog.md shows R12 as done
