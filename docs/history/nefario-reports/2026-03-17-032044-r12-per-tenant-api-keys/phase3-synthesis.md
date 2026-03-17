# Phase 3: Synthesis -- R12 Per-Tenant API Keys

## Conflict Resolutions

### Conflict 1: DELETE return code (204 vs 200)

**api-spec-minion** recommends 204 (no body, idempotent REST convention).
**ux-strategy-minion** recommends 200 with confirmation body (`{keyHash, name, revokedAt}`) for operator safety -- a fat-fingered hash with silent 204 is undetectable.

**Resolution: 200 with confirmation body.** Operator safety wins over REST purism. This is a security-critical admin operation where confirmation of *what* was revoked matters more than idempotency semantics. The project's engineering philosophy ("Intuitive, Simple & Consistent -- in that priority order") supports the UX-strategy position. For an already-revoked key, also return 200 with `revoked: true` and the existing `revokedAt`. For a non-existent hash, return 404 with actionable detail.

### Conflict 2: scope_violation event shape

**observability-minion** recommends folding scope_violation into `security.auth_fail` with `reason: 'scope_violation'` and including `requiredScope` / `grantedScopes` fields. The advisory said a separate `security.scope_violation` event at severity 5.

**Resolution: Fold into `security.auth_fail`.** Single event with `reason: 'scope_violation'` plus the scope detail fields. Rationale: (a) one log entry per failure is simpler and cheaper, (b) `auth_fail` is already severity 5, (c) existing Coralogix queries on `event: 'security.auth_fail'` automatically capture scope violations without rule changes. The `reason` field enables fine-grained filtering. However, scope enforcement happens in the *handler* via `requireScope()`, not in `verifyApiKey()`. So the 403 log must be emitted from the handler call site (alongside the existing auth_fail pattern), not from inside auth.js. The `requireScope()` helper returns the 403 response but does not log -- the handler is responsible for logging scope violations.

### Conflict 3: keyId format (16-hex prefix vs full hash)

**api-spec-minion** uses `keyId` as 16-hex prefix of SHA-256 for URL parameters and display.
**security-minion** and **edge-minion** use the full 64-char hex hash for KV lookup and DELETE path.

**Resolution: Use full 64-char hash as the identifier everywhere.** The DELETE path is `DELETE /v1/admin/keys/{keyHash}` with regex `[a-f0-9]{64}`. List responses include the full `keyHash`. Rationale: (a) 16-char prefix has collision risk with many keys (birthday paradox at 2^32 = ~4B keys, but why design in a known weakness?), (b) the hash is not secret (cannot reverse to raw key), (c) one identifier format everywhere is simpler than mapping between display ID and storage ID, (d) the `name` field provides human-readable identification. The api-spec-minion's schemas will be updated to use `keyHash` (64-hex pattern) instead of `keyId` (16-hex pattern).

### Conflict 4: label/name field required vs optional

**ux-strategy-minion** wants `label` (or `name`) required on key creation for operator safety.
**api-spec-minion** has `name` as optional.

**Resolution: Require `name` field.** ux-strategy's argument is compelling -- without a label, the key list is a wall of anonymous hashes, making revocation decisions guesswork. This is not YAGNI overhead; it is a single string field that prevents operational errors. Field name: `name` (consistent with security-minion's `keyName` in auth return and log events). Validation: 1-128 chars, pattern `/^[a-zA-Z0-9 _.:-]{1,128}$/` (security-minion's spec, slightly more permissive than ux-strategy's 64-char limit -- 128 is fine for human labels). The `name` field value is safe to log per the `log.js` invariant because the pattern excludes injection characters.

### Conflict 5: lastUsedAt tracking

**ux-strategy-minion** flagged this as useful for compromise triage but potentially expensive.

**Resolution: Defer.** A KV write on every authenticated request adds latency and cost for a field that is not needed at MVP scale (2-3 tenants, single-digit keys). This is textbook YAGNI -- add it when an operator actually needs it. Defer to backlog.

---

## Delegation Plan

**Team name**: r12-tenant-keys
**Description**: Replace single static CAPTURE_API_KEY with KV-based multi-tenant key system, add admin API for key provisioning, enforce per-tenant capture isolation, update OpenAPI spec, update documentation and migration runbook.

### Task 1: Auth rewrite -- multi-path verifyApiKey + requireScope

- **Agent**: edge-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: yes (auto-approved)
- **Gate reason**: Auth is the security foundation. All downstream tasks depend on this return shape. Hard to reverse if wrong.
- **Prompt**: |

    ## Task: Rewrite src/auth.js for multi-path authentication with scope enforcement

    You are implementing R12 per-tenant API keys for the Web Resource Ledger Worker. This task rewrites `src/auth.js` to support three authentication paths: KV-based key lookup, ADMIN_KEY env-var, and CAPTURE_API_KEY fallback.

    ### Current state

    `src/auth.js` currently:
    - Accepts only `CAPTURE_API_KEY` env-var comparison
    - Returns `{ ok: true, tenantId: string }` or `{ ok: false, response: Response }`
    - Uses timing-safe comparison via `crypto.subtle.timingSafeEqual`
    - Exports `verifyApiKey(request, env)`
    - Has `TENANT_ID_RE = /^[a-z0-9_-]{1,64}$/` (keep this)

    ### New auth flow (6-step, exact ordering is security-critical)

    ```
    verifyApiKey(request, env)
      0. Misconfiguration guard: if (!env.KV && !env.ADMIN_KEY && !env.CAPTURE_API_KEY) → 503
      1. Extract Bearer token from Authorization header
         - Missing header → 401 + WWW-Authenticate: Bearer, reason: 'missing_header'
         - Non-Bearer scheme → 401 + WWW-Authenticate: Bearer, reason: 'invalid_scheme'
         - Empty token after "Bearer " → 401, reason: 'invalid_scheme'
      2. SHA-256 the token, hex-encode → keyHash
         const keyHash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(token)))].map(b => b.toString(16).padStart(2, '0')).join('');
      3. KV lookup (only if env.KV is bound):
         - try { record = await env.KV.get(`apikey:${keyHash}`, 'json') } catch → return 500 "Authentication service error" (FAIL CLOSED)
         - Record found AND revoked === true → 401 "Invalid API key" + WWW-Authenticate, reason: 'key_revoked'. STOP. Do NOT fall through.
         - Record found AND not revoked → validate tenantId, expand scopes (capture implies read), return success
         - Record not found → continue to step 4
      4. ADMIN_KEY env-var check:
         - timing-safe compare token vs env.ADMIN_KEY
         - match → { ok: true, tenantId: null, scopes: ['admin'], keyName: 'ADMIN_KEY', authMethod: 'env-admin', keyHash: null }
         - NOTE: ADMIN_KEY gets ONLY ['admin'], NOT capture/read. It is an infrastructure credential.
      5. CAPTURE_API_KEY env-var fallback:
         - timing-safe compare token vs env.CAPTURE_API_KEY
         - match → { ok: true, tenantId: 'default', scopes: ['capture', 'read'], keyName: 'CAPTURE_API_KEY', authMethod: 'env-capture', keyHash: null }
         - Log deprecation: console.warn('CAPTURE_API_KEY env-var fallback used -- provision KV-based keys via the admin API')
      6. No match → 401 "Invalid API key", reason: 'key_not_found'
    ```

    ### CRITICAL security invariant
    A revoked KV key (step 3) MUST NOT fall through to step 4 or 5. The `return` after revocation check prevents a revoked key from authenticating via env-var fallback. This is the single most important line in the auth flow.

    ### New return shape

    Success:
    ```js
    { ok: true, tenantId: string | null, scopes: string[], keyName: string, authMethod: string, keyHash: string | null }
    ```

    Failure:
    ```js
    { ok: false, response: Response, reason: string, keyName?: string }
    ```

    The `reason` field uses a controlled vocabulary. Define and export:
    ```js
    export const AUTH_FAIL_REASONS = {
      MISSING_HEADER: 'missing_header',
      INVALID_SCHEME: 'invalid_scheme',
      KEY_NOT_FOUND: 'key_not_found',
      KEY_REVOKED: 'key_revoked',
      MISCONFIGURED: 'misconfigured',
    };
    ```

    `keyName` on failure is present only when the key was identified before failure (e.g., revoked key -- `keyName` comes from the KV record). For missing_header, invalid_scheme, key_not_found, keyName is absent.

    `keyHash` on success is the SHA-256 hex of the token (for KV keys) or null (for env-var paths). This is needed by the admin revocation handler to prevent self-revocation.

    ### Scope expansion (capture implies read)
    After reading scopes from KV record, before returning:
    ```js
    const scopes = [...record.scopes];
    if (scopes.includes('capture') && !scopes.includes('read')) {
      scopes.push('read');
    }
    ```
    This MUST happen in verifyApiKey(), not in handlers. Centralizing prevents a handler from forgetting.

    ### requireScope helper (new export)
    ```js
    export function requireScope(auth, scope) {
      if (!auth.scopes.includes(scope)) {
        return problemResponse(403,
          `This API key does not have the '${scope}' scope required for this operation`);
      }
      return null;
    }
    ```

    ### timingSafeMatch helper (internal, not exported)
    ```js
    async function timingSafeMatch(provided, expected) {
      const enc = new TextEncoder();
      const a = enc.encode(provided);
      const b = enc.encode(expected);
      if (a.byteLength !== b.byteLength) return false;
      return crypto.subtle.timingSafeEqual(a, b);
    }
    ```
    Used for both ADMIN_KEY and CAPTURE_API_KEY comparisons. The length-mismatch early return is acceptable (key length is not a secret).

    ### hashKey helper (export it for use by admin.js)
    ```js
    export async function hashKey(rawKey) {
      const enc = new TextEncoder();
      const digest = await crypto.subtle.digest('SHA-256', enc.encode(rawKey));
      return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
    }
    ```

    ### What NOT to do
    - Do NOT change the existing TENANT_ID_RE regex
    - Do NOT add scope enforcement to this module beyond `requireScope()` -- scope checks happen in handlers
    - Do NOT log anything from auth.js -- logging is the caller's responsibility
    - Do NOT import from admin.js or create circular dependencies
    - Do NOT remove the `// tva` comment

    ### Files to modify
    - `src/auth.js` -- full rewrite of verifyApiKey(), add requireScope(), hashKey(), AUTH_FAIL_REASONS, timingSafeMatch()

    ### Deliverables
    - Rewritten `src/auth.js` with the 6-step flow
    - Exported: `verifyApiKey`, `requireScope`, `hashKey`, `AUTH_FAIL_REASONS`, `TENANT_ID_RE`
    - JSDoc updated with new return shape

- **Deliverables**: Rewritten `src/auth.js` with multi-path auth, scope enforcement helper, hash utility
- **Success criteria**: Module exports verifyApiKey, requireScope, hashKey, AUTH_FAIL_REASONS. verifyApiKey follows the exact 6-step ordering. Revoked keys never fall through to env-var paths. KV errors return 500 (fail closed).

---

### Task 2: Admin module -- key management handlers and routing

- **Agent**: edge-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1
- **Approval gate**: yes (auto-approved)
- **Gate reason**: New API surface with security-sensitive key generation and tenant isolation. High blast radius -- all admin functionality depends on this.
- **Prompt**: |

    ## Task: Create src/admin.js with key management handlers and wire routes in src/index.js

    You are implementing the admin API for R12 per-tenant API keys. This task creates the admin module and wires it into the router.

    ### Dependencies
    Task 1 (auth rewrite) is complete. You can import from `src/auth.js`:
    - `verifyApiKey(request, env)` -- returns `{ ok, tenantId, scopes, keyName, authMethod, keyHash }` on success
    - `requireScope(auth, scope)` -- returns 403 Response or null
    - `hashKey(rawKey)` -- SHA-256 hex of a string
    - `AUTH_FAIL_REASONS` -- reason constants

    ### File: src/admin.js (NEW)

    Create this file with three exported handlers and internal helpers.

    **Key generation:**
    ```js
    function generateApiKey() {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      const b64 = btoa(String.fromCharCode(...bytes))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
      return `wrl_live_${b64}`;
    }
    ```
    Result: `wrl_live_` prefix + 43 chars base64url = 52 chars total.

    **KV storage schema:**
    - Primary key: `apikey:{sha256hex}` → JSON record
    - Secondary index: `tenant-keys:{tenantId}` → JSON array of key hashes
    - Record shape:
    ```json
    {
      "tenantId": "acme",
      "scopes": ["capture", "read"],
      "name": "production-crawler",
      "createdAt": "2026-03-17T12:00:00.000Z",
      "createdBy": "admin-key",
      "revoked": false
    }
    ```
    - `createdBy`: for ADMIN_KEY (env-admin) auth, use `"ADMIN_KEY"`. For KV admin key auth, use the key's name.

    **Handler 1: handleAdminCreateKey(request, env, ctx, match)**

    Processing order (CRITICAL -- rate limit BEFORE auth on admin endpoints):
    1. Rate limit check: `env.ADMIN_RATE_LIMITER.limit({ key: clientIp })`
       - Log rate limit events at severity 4, subsystem 'security': `{ event: 'security.rate_limit', limiter: 'admin', cip }`
       - Rate limit logs intentionally omit tenantId (auth hasn't run yet)
    2. Content-Type check: must be application/json
    3. Auth check: `verifyApiKey(request, env)` then `requireScope(auth, 'admin')`
       - On auth fail: log `{ event: 'security.auth_fail', status, reason: auth.reason, ...(auth.keyName ? { keyName: auth.keyName } : {}), cip }`
       - On scope fail (requireScope returns non-null): log `{ event: 'security.auth_fail', reason: 'scope_violation', requiredScope: 'admin', grantedScopes: auth.scopes, tenantId: auth.tenantId, keyName: auth.keyName, cip }` at severity 5, subsystem 'security'
    4. Parse JSON body
    5. Input validation:
       - `name`: REQUIRED, string, 1-128 chars, pattern `/^[a-zA-Z0-9 _.:-]{1,128}$/`
         - Missing: 400 "Field 'name' is required. Provide a name to identify this key."
         - Invalid: 400 "Field 'name' must be 1-128 characters matching [a-zA-Z0-9 _.:-]"
       - `scopes`: REQUIRED, array, non-empty, each element in `['capture', 'read', 'admin']`
         - Missing: 400 "Field 'scopes' is required"
         - Invalid element: 400 "Unknown scope 'foo'. Valid scopes: capture, read, admin"
         - Empty array: 400 "Field 'scopes' must contain at least one scope"
       - `tenantId`: REQUIRED when authMethod is 'env-admin'. Pattern: `/^[a-z0-9_-]{1,64}$/`.
         - When authMethod is NOT 'env-admin' (tenant-scoped admin key): tenantId comes from auth.tenantId. If body includes tenantId different from auth.tenantId, return 403 "Cannot create keys for another tenant".
         - Missing for env-admin: 400 "Field 'tenantId' is required"
         - Invalid format: 400 "Field 'tenantId' must be 1-64 lowercase alphanumeric characters, hyphens, or underscores"
       - Reject any fields not in the allowlist (tenantId, scopes, name)
    6. Generate key, compute hash, write to KV:
       - Write `apikey:{hash}` record
       - Update `tenant-keys:{tenantId}` secondary index (read array, push hash, write back)
    7. Log: severity 4, subsystem 'admin', `{ event: 'admin.key_create', tenantId, keyName: body.name, scopes, keyHash: keyHash.slice(0, 16), cip }`
       - SECURITY: Do NOT log the raw key or the full hash in log events. Truncate hash to 16 chars for log readability.
       - SECURITY: Do NOT log the response body (it contains the raw key)
    8. Return 201:
       ```json
       {
         "key": "wrl_live_...",
         "keyHash": "a1b2c3d4...64chars",
         "tenantId": "acme",
         "scopes": ["capture", "read"],
         "name": "production-crawler",
         "createdAt": "2026-03-17T12:00:00.000Z"
       }
       ```
       Headers: `Cache-Control: private, no-store`

    **Handler 2: handleAdminListKeys(request, env, ctx, match)**

    Processing order:
    1. Rate limit check (ADMIN_RATE_LIMITER, before auth)
    2. Auth check + scope check ('admin')
    3. Determine target tenant:
       - If `auth.authMethod === 'env-admin'` (superadmin): tenantId from query param `?tenantId=...`
         - If no tenantId param: 400 "Query parameter 'tenantId' is required for superadmin key listing"
         - Validate tenantId format against TENANT_ID_RE
       - Else (tenant-scoped admin): use `auth.tenantId`. IGNORE any tenantId query param (IDOR prevention).
    4. Read `tenant-keys:{targetTenantId}` from KV → array of hashes
       - If key doesn't exist: return `{ data: [] }`
    5. For each hash, read `apikey:{hash}` → record
       - Skip nulls (orphaned index entries)
    6. Return 200:
       ```json
       {
         "data": [
           {
             "keyHash": "a1b2c3d4...64chars",
             "name": "production-crawler",
             "tenantId": "acme",
             "scopes": ["capture", "read"],
             "createdAt": "2026-03-17T12:00:00.000Z",
             "createdBy": "ADMIN_KEY",
             "revoked": false
           }
         ]
       }
       ```
       Headers: `Cache-Control: private, no-store`
       No pagination (key count expected to remain small). Response never includes raw key material.

    **Handler 3: handleAdminRevokeKey(request, env, ctx, match)**

    Processing order:
    1. Rate limit check (ADMIN_RATE_LIMITER, before auth)
    2. Auth check + scope check ('admin')
    3. Extract keyHash from URL: `match[1]` (64-char hex, validated by regex in route)
    4. Self-revocation guard: if `keyHash === auth.keyHash` → 409 "Cannot revoke the key used to authenticate this request"
    5. Read `apikey:{keyHash}` from KV
       - Not found → 404 "API key not found"
    6. Tenant scope check:
       - If auth.authMethod !== 'env-admin' AND record.tenantId !== auth.tenantId → 404 "API key not found" (not 403 -- prevents tenant enumeration)
    7. Already revoked → 200 with `{ keyHash, name: record.name, revoked: true, revokedAt: record.revokedAt }`
    8. Last-admin-key guard: if record.scopes includes 'admin':
       - Read `tenant-keys:{record.tenantId}`, count non-revoked keys with admin scope
       - If this is the only one → 409 "Cannot revoke the last admin key for this tenant"
    9. Soft-delete: set `revoked: true`, `revokedAt: new Date().toISOString()`, `revokedBy: auth.authMethod === 'env-admin' ? 'ADMIN_KEY' : auth.keyName`
       - Write back to `apikey:{keyHash}`
    10. Log: severity 4, subsystem 'admin', `{ event: 'admin.key_revoke', keyHash: keyHash.slice(0, 16), tenantId: record.tenantId, keyName: record.name, cip }`
    11. Return 200: `{ keyHash, name: record.name, revoked: true, revokedAt: record.revokedAt }`
        Headers: `Cache-Control: private, no-store`

    **Import dependencies for src/admin.js:**
    ```js
    import { problemResponse, jsonResponse } from './responses.js';
    import { verifyApiKey, requireScope, hashKey } from './auth.js';
    import { log } from './log.js';
    import { computeCip } from './ip-hash.js';
    ```

    ### File: src/index.js (MODIFY)

    1. Add import:
    ```js
    import { handleAdminCreateKey, handleAdminListKeys, handleAdminRevokeKey } from './admin.js';
    ```

    2. Add three route tuples to the `routes` array, after the signing-keys routes and before the closing bracket:
    ```js
    ['POST',   /^\/v1\/admin\/keys$/, handleAdminCreateKey],
    ['GET',    /^\/v1\/admin\/keys$/, handleAdminListKeys],
    ['DELETE', /^\/v1\/admin\/keys\/([a-f0-9]{64})$/, handleAdminRevokeKey],
    ```

    3. Update `getRateLimitGroup()`:
    ```js
    function getRateLimitGroup(method, pathname) {
      if (pathname === '/v1/captures') return 'capture';
      if (pathname.startsWith('/v1/verify/') || pathname.startsWith('/.well-known/signing-key')) return 'verify';
      if (pathname.startsWith('/v1/admin/')) return 'admin';
      return null;
    }
    ```

    4. Do NOT add CORS handling for admin endpoints. They are server-to-server only.

    ### File: src/rate-limits.js (MODIFY)

    Add admin entry:
    ```js
    export const RATE_LIMITS = {
      capture: { limit: 10, period: 60 },
      verify:  { limit: 60, period: 60 },
      admin:   { limit: 5,  period: 60 },
    };
    ```

    ### What NOT to do
    - Do NOT create separate verifyAdminAuth() function -- use the unified verifyApiKey() + requireScope('admin'). The auth module already handles ADMIN_KEY, KV keys, and CAPTURE_API_KEY in one flow.
    - Do NOT add CORS for admin endpoints
    - Do NOT add pagination to list endpoint (unnecessary at expected scale)
    - Do NOT implement lastUsedAt tracking (deferred)
    - Do NOT duplicate hashKey() -- import it from auth.js
    - Do NOT log raw API keys ever

    ### Deliverables
    - New `src/admin.js` with three exported handlers
    - Modified `src/index.js` with admin routes and updated getRateLimitGroup
    - Modified `src/rate-limits.js` with admin rate limit entry

- **Deliverables**: `src/admin.js` (new), modified `src/index.js`, modified `src/rate-limits.js`
- **Success criteria**: All three admin endpoints are routable. Key creation generates wrl_live_ prefixed keys. Revocation sets revoked:true. List returns metadata without raw keys. Rate limiting fires before auth. Tenant isolation enforced via auth.tenantId.

---

### Task 3: Scope enforcement on existing handlers + observability enrichment

- **Agent**: edge-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |

    ## Task: Add scope enforcement and keyName/reason logging to existing handlers

    Task 1 (auth rewrite) is complete. `verifyApiKey()` now returns `{ ok, tenantId, scopes, keyName, authMethod, keyHash }` on success and `{ ok, response, reason, keyName? }` on failure. `requireScope(auth, scope)` returns a 403 Response or null.

    ### Changes to src/index.js

    **handleCreateCapture:**
    After the existing auth check (step 2), add scope enforcement:
    ```js
    // Step 2: Auth check
    const auth = await verifyApiKey(request, env);
    if (!auth.ok) {
      ctx.waitUntil(log(env, 5, 'security', {
        event: 'security.auth_fail',
        status: auth.response.status,
        reason: auth.reason,
        ...(auth.keyName ? { keyName: auth.keyName } : {}),
        cip,
      }) ?? Promise.resolve());
      return auth.response;
    }
    const { tenantId } = auth;

    // Step 2a: Scope check (NEW)
    const denied = requireScope(auth, 'capture');
    if (denied) {
      ctx.waitUntil(log(env, 5, 'security', {
        event: 'security.auth_fail',
        status: 403,
        reason: 'scope_violation',
        requiredScope: 'capture',
        grantedScopes: auth.scopes,
        tenantId: auth.tenantId,
        keyName: auth.keyName,
        cip,
      }) ?? Promise.resolve());
      return denied;
    }
    ```

    Scope check goes AFTER auth but BEFORE rate limit. A 403 should not consume a rate limit token.

    **handleListCaptures:**
    Same pattern: add `requireScope(auth, 'read')` after auth check, before rate limit.

    **Observability enrichment -- add `keyName` to all post-auth log events:**

    In `handleCreateCapture`:
    - Line 144 (security.rate_limit capture_per_ip): add `tenantId, keyName: auth.keyName`
    - Line 153 (security.capacity_limit): add `tenantId, keyName: auth.keyName`
    - Line 177 (security.ssrf_block): add `keyName: auth.keyName` (tenantId already present)

    In `handleListCaptures`:
    - Line 221 (security.rate_limit): add `tenantId: auth.tenantId, keyName: auth.keyName`
    - Line 228 (security.capacity_limit): add `tenantId: auth.tenantId, keyName: auth.keyName`
    - Line 263 (list.error): add `keyName: auth.keyName`
    - Line 292 (list.success): add `keyName: auth.keyName`

    **Thread keyName through performCapture:**
    Update the call on line 192:
    ```js
    ctx.waitUntil(performCapture(env, result.url, result.ip, captureId, tenantId, cip, auth.keyName));
    ```

    Add `import { requireScope } from './auth.js';` at the top of index.js.

    ### Changes to src/capture.js

    Add `keyName` parameter to `performCapture()`:
    ```js
    export async function performCapture(env, url, ip, captureId, tenantId, cip, keyName, renderer = null) {
    ```

    Add `keyName` to ALL log events inside performCapture (there are ~10 log calls). Each log call that currently includes `tenantId` should also include `keyName`. The existing tests pass `undefined` for keyName via the renderer mock pattern, so this is backward-compatible.

    ### What NOT to do
    - Do NOT change the auth-before-rate-limit ordering on capture/list endpoints (only admin endpoints use rate-limit-before-auth)
    - Do NOT modify the `log()` function itself
    - Do NOT add keyName to unauthenticated endpoint log events (verify, signing-key)
    - Do NOT change the performCapture renderer parameter position (keyName goes before renderer)

    ### Deliverables
    - Modified `src/index.js` with scope enforcement and enriched logging
    - Modified `src/capture.js` with keyName parameter threaded through all log calls

- **Deliverables**: Modified `src/index.js`, modified `src/capture.js`
- **Success criteria**: POST /v1/captures requires 'capture' scope. GET /v1/captures requires 'read' scope. All post-auth log events include keyName. performCapture receives and logs keyName.

---

### Task 4: Infrastructure -- wrangler.toml + vitest config

- **Agent**: iac-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |

    ## Task: Add ADMIN_RATE_LIMITER binding and ADMIN_KEY test binding

    ### File: wrangler.toml

    Add ADMIN_RATE_LIMITER binding for both production and staging.

    **Production** -- add after the GLOBAL_CAPTURE_LIMITER block (after line 33):
    ```toml
    [[unsafe.bindings]]
    name = "ADMIN_RATE_LIMITER"
    type = "ratelimit"
    namespace_id = "1004"
    simple = { limit = 5, period = 60 }
    ```

    **Staging** -- add after the staging GLOBAL_CAPTURE_LIMITER block (after line 81):
    ```toml
    [[env.staging.unsafe.bindings]]
    name = "ADMIN_RATE_LIMITER"
    type = "ratelimit"
    namespace_id = "2004"
    simple = { limit = 5, period = 60 }
    ```

    **Update the secrets comment** on line 51 to include ADMIN_KEY:
    Change:
    ```
    # Secrets (CAPTURE_API_KEY, SIGNING_KEY, CORALOGIX_SEND_KEY, IP_HASH_SEED) are set via:
    ```
    To:
    ```
    # Secrets (CAPTURE_API_KEY, ADMIN_KEY, SIGNING_KEY, CORALOGIX_SEND_KEY, IP_HASH_SEED) are set via:
    ```

    ### File: vitest.config.js

    Add `ADMIN_KEY` to the miniflare.bindings section:
    ```js
    bindings: {
      CAPTURE_API_KEY: 'test-api-key-for-vitest',
      ADMIN_KEY: 'test-admin-key-for-vitest',
      SIGNING_KEY: testSigningKey,
      // ... rest unchanged
    },
    ```

    ### What NOT to do
    - Do NOT modify any GitHub Actions workflows
    - Do NOT add ADMIN_KEY to wrangler.toml [vars] section (it's a secret, set via `wrangler secret put`)
    - Do NOT change any other bindings or their namespace IDs
    - Do NOT remove any existing bindings

    ### Deliverables
    - Modified `wrangler.toml` with two new rate limiter bindings and updated secrets comment
    - Modified `vitest.config.js` with ADMIN_KEY binding

- **Deliverables**: Modified `wrangler.toml`, modified `vitest.config.js`
- **Success criteria**: Both environments have ADMIN_RATE_LIMITER with namespace_id 1004/2004, limit 5, period 60. vitest config has ADMIN_KEY binding.

---

### Task 5: OpenAPI spec -- admin endpoints and scope documentation

- **Agent**: api-spec-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |

    ## Task: Update openapi.yaml with admin endpoints, scope documentation, and version bump

    Add the complete admin API surface to the OpenAPI spec, following all existing conventions (inline security headers on every response, ProblemDetail for all errors, realistic examples, operationId naming).

    ### Changes Overview

    1. **Version bump**: `info.version` from `0.4.0` to `0.5.0`

    2. **New tag**: Add `admin` tag with description `API key management (operator-only)` after the `signing` tag

    3. **New response component**: `Problem403`
       - description: "Forbidden -- valid API key but insufficient scope for this operation."
       - Same header pattern as Problem401
       - Body: `application/problem+json` with `$ref: ProblemDetail`
       - Example: `{ type: "about:blank", status: 403, title: "Forbidden", detail: "This API key does not have the 'admin' scope required for this operation" }`

    4. **New schemas** (add to `components/schemas`):

       **ApiKeyScope** -- string enum: `[capture, read, admin]`
       Description: "Permission scope for an API key. 'capture' implies 'read'. 'admin' grants key management access."

       **CreateKeyRequest**:
       - required: [tenantId, scopes, name]
       - tenantId: string, pattern `^[a-z0-9_-]{1,64}$`
       - scopes: array of ApiKeyScope, minItems: 1, uniqueItems: true
       - name: string, maxLength: 128, pattern `^[a-zA-Z0-9 _.:-]{1,128}$`, description: "Human-readable label for the key. Required. Returned in list responses to identify keys."

       **CreateKeyResponse**:
       - required: [key, keyHash, tenantId, scopes, name, createdAt]
       - key: string, pattern `^wrl_live_[A-Za-z0-9_-]{43}$`, description: "Raw API key. Shown exactly once. Store it securely."
       - keyHash: string, pattern `^[a-f0-9]{64}$`, description: "SHA-256 hex hash. Use this to reference the key in DELETE operations."
       - tenantId: string
       - scopes: array of ApiKeyScope
       - name: string
       - createdAt: string, format: date-time

       **ApiKeySummary**:
       - required: [keyHash, tenantId, scopes, name, createdAt, revoked]
       - keyHash: string, pattern `^[a-f0-9]{64}$`
       - name: string
       - tenantId: string
       - scopes: array of ApiKeyScope
       - createdAt: string, format: date-time
       - createdBy: string
       - revoked: boolean
       - revokedAt: string, format: date-time (present when revoked is true)

       **KeyListResponse**:
       - required: [data]
       - data: array of ApiKeySummary

       **RevokeKeyResponse**:
       - required: [keyHash, name, revoked, revokedAt]
       - keyHash: string, pattern `^[a-f0-9]{64}$`
       - name: string
       - revoked: boolean (always true)
       - revokedAt: string, format: date-time

    5. **New paths**:

       **POST /v1/admin/keys** (operationId: `createApiKey`):
       - tags: [admin]
       - security: [{bearerAuth: []}]
       - description: "Creates a new API key for the specified tenant. The raw key is returned exactly once. Requires `admin` scope."
       - requestBody: CreateKeyRequest
       - responses: 201 (CreateKeyResponse), 400, 401, 403, 415, 429, 500
       - 201 headers: standard security headers + `Cache-Control: private, no-store`

       **GET /v1/admin/keys** (operationId: `listApiKeys`):
       - tags: [admin]
       - security: [{bearerAuth: []}]
       - description: "Lists API keys for the tenant. Never returns raw key values. Requires `admin` scope. Returns all keys without pagination (key count is expected to remain small)."
       - parameters: tenantId query param (string, optional, required only for superadmin)
       - responses: 200 (KeyListResponse), 401, 403, 429, 500
       - 200 headers: standard security headers + `Cache-Control: private, no-store`

       **DELETE /v1/admin/keys/{keyHash}** (operationId: `revokeApiKey`):
       - tags: [admin]
       - security: [{bearerAuth: []}]
       - description: "Revokes an API key (soft-delete). Returns confirmation of what was revoked. Requires `admin` scope."
       - parameters: keyHash path param (string, pattern `^[a-f0-9]{64}$`)
       - responses: 200 (RevokeKeyResponse), 401, 403, 404, 409, 429, 500
       - 200 headers: standard security headers + `Cache-Control: private, no-store`
       - 409 examples: self-revocation ("Cannot revoke the key used to authenticate this request") and last-admin-key ("Cannot revoke the last admin key for this tenant")

    6. **Update existing endpoints**:
       - `POST /v1/captures`: add "Requires `capture` scope." to description. Add 403 response ref.
       - `GET /v1/captures`: add "Requires `read` scope (implied by `capture`)." to description. Add 403 response ref.

    7. **Conventions to follow** (from existing spec):
       - All six security headers on every response (Referrer-Policy, X-Content-Type-Options, X-Frame-Options, Strict-Transport-Security, Link, no TermsLink on admin though -- use the same pattern)
       - ProblemDetail schema for all errors
       - Realistic example values
       - operationId: camelCase, verb-first
       - No CORS headers on admin endpoints

    ### What NOT to do
    - Do NOT create a separate `adminAuth` security scheme -- use existing `bearerAuth`
    - Do NOT add pagination to the list endpoint
    - Do NOT add a `lastUsedAt` field
    - Do NOT restructure existing spec (no multi-file split)

    ### Deliverables
    - Modified `openapi.yaml` with all admin endpoints, schemas, and scope documentation

- **Deliverables**: Modified `openapi.yaml`
- **Success criteria**: `npm run lint:api` passes. All admin endpoints documented. Version is 0.5.0. 403 responses added to capture endpoints.

---

### Task 6: Documentation -- OPERATIONS.md runbook, README, CONTRIBUTING

- **Agent**: software-docs-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |

    ## Task: Update documentation with migration runbook, setup instructions, and dev config

    ### File: OPERATIONS.md

    Add a new top-level section `## Per-Tenant API Key Migration (R12)` with these subsections:

    **Overview**: R12 replaces single shared CAPTURE_API_KEY with per-tenant API keys in KV. Dual-mode fallback ensures backward compatibility. No downtime or pipeline changes required.

    **Pre-merge**: Nothing required. Dual-mode fallback makes deploy safe.

    **Post-deploy: Set ADMIN_KEY**:
    ```bash
    openssl rand -hex 32
    wrangler secret put ADMIN_KEY
    wrangler secret put ADMIN_KEY --env staging
    ```
    Use different values for production and staging.

    **Post-deploy: Provision first tenant key**:
    ```bash
    curl -X POST https://wrl.benpeter.workers.dev/v1/admin/keys \
      -H "Authorization: Bearer $ADMIN_KEY" \
      -H "Content-Type: application/json" \
      -d '{"tenantId": "default", "name": "primary", "scopes": ["capture", "read"]}'
    ```
    Note: save the returned key -- shown only once.

    **Verification**: Test with new tenant key, list keys, confirm captures attributed correctly.

    **Update GitHub environment secrets**: Update WRL_PROD_CAPTURE_API_KEY and WRL_STAGING_CAPTURE_API_KEY to new tenant key values.

    **CAPTURE_API_KEY removal (when safe)**: Only after all callers migrated, logs confirm zero fallback traffic. Commands to remove.

    **Rollback**: Revert commit, KV keys are harmless orphans, ADMIN_KEY ignored by old code.

    Also update:
    - **Secret Surfaces table**: add ADMIN_KEY row (Worker runtime, used for admin API auth)
    - **Manual Deploy secret list**: add `wrangler secret put ADMIN_KEY`
    - **GitHub Environment Setup tables**: add ADMIN_KEY to both production and staging

    ### File: README.md

    - **Renumber setup steps**: current steps 5-9 become 6-10. Insert new step 5 for ADMIN_KEY.
    - **New step 5**: "Configure admin key" -- explain purpose, generate command, wrangler secret put, .dev.vars entry.
    - **Usage section**: add brief paragraph about multi-tenant capability via admin API.
    - **Update status note**: change "single-operator deployment" to reflect multi-tenant capability.
    - **Roadmap**: mark "per-tenant keys" as complete in Act 2.
    - **Fix any cross-reference anchors** that break from renumbering (OPERATIONS.md links to README steps).

    ### File: CONTRIBUTING.md

    Update .dev.vars template to add:
    ```ini
    ADMIN_KEY=<any random string, used to authenticate admin API calls>
    ```
    Place after CAPTURE_API_KEY in the Required block.

    Update staging secrets list to add:
    ```bash
    wrangler secret put ADMIN_KEY --env staging
    ```

    ### What NOT to do
    - Do NOT write the evolution log (that is handled separately by the orchestrator)
    - Do NOT modify openapi.yaml (that is Task 5)
    - Do NOT include operational commands to actually set secrets (this is documentation only)
    - Do NOT reference lastUsedAt (deferred feature)

    ### Deliverables
    - Modified `OPERATIONS.md` with migration runbook and updated reference tables
    - Modified `README.md` with new setup step, usage update, status update, roadmap update
    - Modified `CONTRIBUTING.md` with updated .dev.vars template and secrets list

- **Deliverables**: Modified `OPERATIONS.md`, `README.md`, `CONTRIBUTING.md`
- **Success criteria**: Runbook is self-contained and covers pre-merge through rollback. README step numbering is consistent. Cross-references between docs are updated.

---

### Cross-Cutting Coverage

- **Testing**: Covered by Phase 6 (post-execution test phase). Test matrix defined by test-minion: 83 test cases across auth rewrite, KV operations, admin endpoints, and tenant isolation. auth.test.js full rewrite, new admin.test.js, extended kv.test.js.
- **Security**: Security-minion's recommendations are fully integrated into Task 1 (auth flow ordering, timing-safe comparison, revocation invariant, KV error fail-closed) and Task 2 (tenant isolation, self-revocation guard, IDOR prevention). The auth flow ordering is the plan's security foundation.
- **Usability -- Strategy**: ux-strategy-minion's recommendations integrated: required `name` field (Conflict 4 resolved in favor), 200 with confirmation body on DELETE (Conflict 1 resolved in favor), actionable error messages with scope names, 404 on missing DELETE target. `lastUsedAt` deferred (Conflict 5).
- **Usability -- Design**: Not applicable. Admin API is server-to-server (curl/API), no UI. No browser-facing components produced.
- **Documentation**: Covered by Task 6 (OPERATIONS.md runbook, README, CONTRIBUTING) and Phase 8 (post-execution documentation review).
- **Observability**: Integrated into Task 2 (admin.key_create, admin.key_revoke at severity 4, admin subsystem) and Task 3 (keyName enrichment on 19+ existing log calls, reason field on auth_fail, scope_violation folded into auth_fail). The log() function requires zero changes.

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - observability-minion: Plan produces 3+ new log event types and enriches 19+ existing events. Coordinated logging strategy across auth, admin, and capture subsystems warrants review. (Tasks 1-3)
- **Not selected**: ux-design-minion (no UI), accessibility-minion (no UI), sitespeed-minion (no web-facing pages), user-docs-minion (operator docs only, covered by software-docs-minion)

### Conflict Resolutions

All five conflicts from the specialist contributions have been resolved:

1. **DELETE 204 vs 200**: 200 with confirmation body (ux-strategy wins, operator safety)
2. **scope_violation event**: Fold into auth_fail with reason field (observability wins, simplicity)
3. **keyId format**: Full 64-char SHA-256 hash everywhere (security wins, no collision risk)
4. **name field required**: Required (ux-strategy wins, operator safety)
5. **lastUsedAt**: Deferred (YAGNI wins, KV write cost)

### Risks and Mitigations

1. **KV read failure on auth bypass** (HIGH): If `env.KV.get()` throws during auth, the catch block must return 500, not fall through to env-var paths. Implemented in Task 1 with explicit try/catch and fail-closed behavior. Test matrix covers this (case #28-29).

2. **Tenant isolation IDOR** (HIGH): Admin handlers must use `auth.tenantId` for tenant scoping, never `body.tenantId` or query params, except when `auth.authMethod === 'env-admin'`. Implemented in Task 2 with explicit authMethod checks. Test matrix covers cross-tenant access (cases #61, #74, #81-83).

3. **CAPTURE_API_KEY premature removal** (MEDIUM): Runbook makes removal a separate, deferred step with explicit prerequisites. Dual-mode fallback code stays in place indefinitely.

4. **tenant-keys index race condition** (LOW): Read-modify-write on `tenant-keys:{tenantId}` could lose a key from the index under concurrent creation. At single-digit keys and 5/min rate limit, extremely unlikely. Primary `apikey:{hash}` record is source of truth; index is for listing convenience. Documented as known limitation.

5. **KV eventual consistency on revocation** (LOW): Revoked key may remain valid for up to ~60 seconds at edge POPs. Documented in runbook. Acceptable at WRL's scale.

6. **performCapture parameter sprawl** (LOW): Now 8 positional parameters. Observe-minion suggests bundling into an authContext object. Acceptable for now; will refactor if R13 adds more. Not in scope for R12.

### Execution Order

```
Batch 1 (parallel, no dependencies):
  Task 1: Auth rewrite (src/auth.js)
  Task 4: Infrastructure (wrangler.toml, vitest.config.js)
  Task 5: OpenAPI spec (openapi.yaml)
  Task 6: Documentation (OPERATIONS.md, README.md, CONTRIBUTING.md)

  APPROVAL GATE (auto-approved): Task 1 deliverables
  Agent: edge-minion | Blocked tasks: Task 2, Task 3
  DECISION: Auth module rewrite with multi-path KV/env-var auth flow
  Confidence: HIGH (design settled by advisory, security-minion's exact flow)

Batch 2 (parallel, depends on Task 1):
  Task 2: Admin module (src/admin.js, src/index.js routes, src/rate-limits.js)
  Task 3: Scope enforcement + observability (src/index.js handlers, src/capture.js)

  APPROVAL GATE (auto-approved): Task 2 deliverables
  Agent: edge-minion | Blocked tasks: Phase 5 (code review)
  DECISION: Admin API implementation with key generation, tenant isolation, and rate limiting
  Confidence: HIGH (design settled by advisory)

Post-execution phases (sequential):
  Phase 5: Code review (code-review-minion, lucy, margo)
  Phase 6: Test execution (auth.test.js rewrite, new admin.test.js, existing suite regression)
  Phase 8: Documentation review (software-docs-minion, user-docs-minion)
```

### External Skills

No external skills detected in project.

### Verification Steps

1. **Auth flow**: Verify all six auth paths work (KV key, revoked KV key, ADMIN_KEY, CAPTURE_API_KEY, invalid key, no auth configured)
2. **Admin CRUD**: Create key → list keys → revoke key → verify revoked key returns 401
3. **Tenant isolation**: Create keys for two tenants, verify cross-tenant access is denied
4. **Existing tests pass**: `npm test` passes with zero failures (dual-mode fallback works)
5. **API spec validates**: `npm run lint:api` passes
6. **Rate limiting**: Admin endpoints return 429 after 5 requests per minute
7. **Observability**: Log events include keyName, reason, and scope fields where specified
