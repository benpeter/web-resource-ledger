# Domain Plan Contribution: edge-minion

## Recommendations

### 1. Route Integration with Existing Router

The current router in `src/index.js` is a flat `[method, pattern, handler]` tuple array with regex matching. Admin routes fit cleanly into this pattern with no structural changes.

**Add three route tuples** to the `routes` array, placed after the signing-key routes and before the closing bracket (keeping "most specific first" convention, though admin paths don't overlap existing routes):

```js
['POST',   /^\/v1\/admin\/keys$/, handleAdminCreateKey],
['GET',    /^\/v1\/admin\/keys$/, handleAdminListKeys],
['DELETE', /^\/v1\/admin\/keys\/([a-f0-9]{64})$/, handleAdminRevokeKey],
```

The DELETE regex constrains the path parameter to exactly 64 hex characters (SHA-256 hex digest), which is correct for the full-hash-as-identifier design from the synthesis. This provides input validation at the routing layer itself -- malformed key hashes never reach the handler.

**Import the handlers** from a new `src/admin.js` module:

```js
import { handleAdminCreateKey, handleAdminListKeys, handleAdminRevokeKey } from './admin.js';
```

**No changes to the CORS preflight block.** The synthesis explicitly states "Server-to-server, no CORS" for admin endpoints. The existing CORS handling is scoped to `POST /v1/captures` and should remain untouched.

### 2. ADMIN_RATE_LIMITER Binding and Rate-Before-Auth Flow

**wrangler.toml additions (two new blocks):**

Production (follows existing numbering: 1001, 1002, 1003, so next is 1004):

```toml
[[unsafe.bindings]]
name = "ADMIN_RATE_LIMITER"
type = "ratelimit"
namespace_id = "1004"
simple = { limit = 5, period = 60 }
```

Staging (follows existing numbering: 2001, 2002, 2003, so next is 2004):

```toml
[[env.staging.unsafe.bindings]]
name = "ADMIN_RATE_LIMITER"
type = "ratelimit"
namespace_id = "2004"
simple = { limit = 5, period = 60 }
```

**`src/rate-limits.js` addition:**

```js
export const RATE_LIMITS = {
  capture: { limit: 10, period: 60 },
  verify:  { limit: 60, period: 60 },
  admin:   { limit: 5,  period: 60 },
};
```

**Rate-before-auth flow in admin handlers.** This is the critical ordering difference from capture endpoints. Each admin handler must enforce rate limiting as step 1, before any auth check or KV lookup. The pattern inside `src/admin.js`:

```js
export async function handleAdminCreateKey(request, env, ctx) {
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
  const cip = await computeCip(env, clientIp);

  // Step 1: Rate limit BEFORE auth -- throttle pre-auth abuse
  if (env.ADMIN_RATE_LIMITER) {
    const { success } = await env.ADMIN_RATE_LIMITER.limit({ key: clientIp });
    if (!success) {
      ctx.waitUntil(log(env, 4, 'security', {
        event: 'security.rate_limit', limiter: 'admin', cip,
      }) ?? Promise.resolve());
      return problemResponse(429, 'Rate limit exceeded. Try again later.', {
        'Retry-After': '60',
      });
    }
  }

  // Step 2: Auth check (admin auth -- see below)
  // ...
}
```

**Note:** Rate limit log events at the admin level intentionally omit `tenantId` because auth has not yet run. The `cip` (hashed IP) is the only correlation key available at this point. This is correct and expected.

**Extend `getRateLimitGroup()` in `src/index.js`:**

```js
function getRateLimitGroup(method, pathname) {
  if (pathname === '/v1/captures') return 'capture';
  if (pathname.startsWith('/v1/verify/') || pathname.startsWith('/.well-known/signing-key')) return 'verify';
  if (pathname.startsWith('/v1/admin/')) return 'admin';
  return null;
}
```

This ensures `X-RateLimit-Limit: 5` is set on admin response headers via the existing header-setting logic at lines 97-100 of `src/index.js`.

### 3. File Organization: src/admin.js

Create `src/admin.js` as a single module for all three admin handlers. This mirrors how `src/auth.js` is a self-contained module for auth logic.

**Exported functions (handler signatures match the router contract):**

```js
// src/admin.js
export async function handleAdminCreateKey(request, env, ctx, match) { ... }
export async function handleAdminListKeys(request, env, ctx, match) { ... }
export async function handleAdminRevokeKey(request, env, ctx, match) { ... }
```

The `match` parameter follows the existing convention (regex match result), though only `handleAdminRevokeKey` uses `match[1]` (the 64-char hex key hash from the URL).

**Internal helper (not exported) for admin auth:**

```js
async function verifyAdminAuth(request, env) { ... }
```

This returns a discriminated result:
- `{ ok: true, isSuper: true }` for ADMIN_KEY env var auth (global superadmin)
- `{ ok: true, isSuper: false, tenantId: string }` for KV key with admin scope
- `{ ok: false, response: Response }` for auth failures

The `isSuper` flag controls whether the handler operates globally (list all keys) or within a tenant scope. This avoids a separate "scope check" layer -- the auth result directly encodes the authorization boundary.

**Dependencies to import in `src/admin.js`:**

```js
import { problemResponse, jsonResponse } from './responses.js';
import { log } from './log.js';
import { computeCip } from './ip-hash.js';
```

Plus whatever KV helpers are needed for key storage (likely new functions in `src/kv.js` or a new `src/kv-keys.js` if preferred).

### 4. Key Generation

**Implementation using Web Crypto API (available in Workers):**

```js
function generateApiKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  // base64url encoding: standard base64 with +→- /→_ and no padding
  const b64 = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  return `wrl_live_${b64}`;
}
```

Result format: `wrl_live_` prefix + 43 chars of base64url = 52 chars total. Example: `wrl_live_dGhpcyBpcyBhIHRlc3Qga2V5IHZhbHVlIHdpdGgg`.

**Key hashing for storage lookup:**

```js
async function hashKey(rawKey) {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(rawKey));
  return [...new Uint8Array(hashBuffer)]
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
```

**KV storage key format:** `apikey:{sha256hex}` where `sha256hex` is 64 lowercase hex chars.

**KV value shape:**

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

The `createdBy` field distinguishes superadmin-created keys (`"admin-key"`) from tenant-admin-created keys (`"tenant:{tenantId}"` or a key name reference).

**Security constraints on the POST response:**
- The raw key is returned exactly once in the `201 Created` response body.
- It is NEVER stored in KV (only the SHA-256 hash is stored).
- It MUST NOT be logged by the `log()` function or any middleware.
- Response headers: `Cache-Control: private, no-store`.

### 5. GET /v1/admin/keys -- Tenant-Scoped Listing

**Two operating modes based on auth result:**

1. **ADMIN_KEY (superadmin):** List all keys across all tenants. Optional `?tenant=` query parameter to filter by tenant.
2. **KV admin-scoped key:** List only keys belonging to the authenticated key's `tenantId`. The `?tenant=` parameter is ignored (or returns 403 if it specifies a different tenant).

**Implementation approach -- secondary index in KV:**

The synthesis mentions a `tenant-keys:{tenantId}` secondary index (array of key hashes per tenant). This is the right pattern for single-digit keys per tenant:

```js
// On key creation, update the tenant index
async function addKeyToTenantIndex(kv, tenantId, keyHash) {
  const indexKey = `tenant-keys:${tenantId}`;
  const existing = await kv.get(indexKey, 'json') || [];
  existing.push(keyHash);
  await kv.put(indexKey, JSON.stringify(existing));
}
```

Then listing is: read the index, fetch each key record, filter out revoked if requested. With single-digit keys per tenant, this is 1 + N KV reads where N is small.

For superadmin listing all tenants: maintain a `tenant-keys:_all` index or iterate known tenant indexes. Given the "2-3 tenants" scale, a simple approach is to maintain a `tenants` KV key listing all tenant IDs, then fan out to each tenant's index. But this adds complexity. Simpler: use `kv.list({ prefix: 'apikey:' })` to scan all keys, then fetch each. With single-digit tenants and single-digit keys each, this is under 20 KV reads total. Acceptable.

**Response shape (never expose raw key or full hash as the primary identifier):**

```json
{
  "data": [
    {
      "keyHash": "a1b2c3...64chars",
      "name": "production-crawler",
      "tenantId": "acme",
      "scopes": ["capture", "read"],
      "createdAt": "2026-03-17T12:00:00.000Z",
      "createdBy": "admin-key",
      "revoked": false,
      "prefix": "wrl_live_dGhp..."
    }
  ]
}
```

The `prefix` field shows the first ~12 characters of the original key (the `wrl_live_` prefix plus a few base64url chars) for human identification. This is a display hint, not a security credential. Alternatively, omit `prefix` entirely and rely on `name` for identification.

**No pagination needed.** With single-digit keys per tenant and 2-3 tenants, the maximum key count is ~30. KV list with prefix handles this in a single call. The response is a flat array, no cursor. Add pagination later if key count grows.

**Cache-Control:** `private, no-store` on all admin list responses. These contain security-sensitive metadata and must never be cached.

### 6. DELETE /v1/admin/keys/{keyHash} -- Soft-Delete Revocation

**Implementation:**

```js
export async function handleAdminRevokeKey(request, env, ctx, match) {
  // match[1] is the 64-char hex key hash, validated by regex
  const keyHash = match[1];

  // ... rate limit, auth checks ...

  // Step: Read the key record
  const record = await env.KV.get(`apikey:${keyHash}`, 'json');
  if (!record) {
    return problemResponse(404, 'API key not found.');
  }

  // Step: Tenant scope check (non-superadmin can only revoke own tenant's keys)
  if (!auth.isSuper && record.tenantId !== auth.tenantId) {
    return problemResponse(404, 'API key not found.');
    // Return 404, not 403, to prevent tenant enumeration
  }

  // Step: Already revoked -- idempotent
  if (record.revoked) {
    return jsonResponse({ keyHash, revoked: true, revokedAt: record.revokedAt }, 200, {
      'Cache-Control': 'private, no-store',
    });
  }

  // Step: 409 safeguard -- prevent revoking the last admin key for a tenant
  // (synthesis specifies this)
  // Check if this is an admin-scoped key and it's the last non-revoked admin key
  if (record.scopes.includes('admin')) {
    // Count non-revoked admin keys for this tenant
    // ... fetch tenant index, count admin-scoped non-revoked keys ...
    // If count === 1, return 409
  }

  // Step: Soft-delete
  record.revoked = true;
  record.revokedAt = new Date().toISOString();
  record.revokedBy = auth.isSuper ? 'admin-key' : `tenant:${auth.tenantId}`;
  await env.KV.put(`apikey:${keyHash}`, JSON.stringify(record));

  // Step: Log
  ctx.waitUntil(log(env, 4, 'admin', {
    event: 'admin.key_revoke',
    keyHash: keyHash.slice(0, 16),  // truncate for log readability
    tenantId: record.tenantId,
    keyName: record.name,
    cip,
  }) ?? Promise.resolve());

  return jsonResponse({ keyHash, revoked: true, revokedAt: record.revokedAt }, 200, {
    'Cache-Control': 'private, no-store',
  });
}
```

**Important security detail:** When a non-superadmin tries to revoke a key belonging to another tenant, return 404 (not 403). This prevents tenant enumeration -- an attacker cannot probe key hashes to determine which tenant they belong to.

**KV eventual consistency note:** After revocation, the key may remain valid for up to ~60 seconds at edge POPs that haven't received the update. This is documented in the synthesis as an accepted residual risk.

### 7. wrangler.toml Changes Summary

The only wrangler.toml changes from edge-minion's scope are the two rate limiter bindings. The full diff:

```toml
# After the GLOBAL_CAPTURE_LIMITER block (line 32):
[[unsafe.bindings]]
name = "ADMIN_RATE_LIMITER"
type = "ratelimit"
namespace_id = "1004"
simple = { limit = 5, period = 60 }

# After the staging GLOBAL_CAPTURE_LIMITER block (line 81):
[[env.staging.unsafe.bindings]]
name = "ADMIN_RATE_LIMITER"
type = "ratelimit"
namespace_id = "2004"
simple = { limit = 5, period = 60 }
```

Additionally, **ADMIN_KEY must be set as a wrangler secret** (not in wrangler.toml -- this is iac-minion's scope but noted here for completeness):

```bash
wrangler secret put ADMIN_KEY
wrangler secret put ADMIN_KEY --env staging
```

### 8. Auth Module Evolution (verifyApiKey rewrite)

The current `src/auth.js` must be rewritten to support dual-mode auth: KV-first lookup with env-var fallback. The new flow:

```
1. Extract Bearer token from Authorization header (unchanged)
2. SHA-256 hash the token
3. KV lookup: kv.get("apikey:{hash}")
4. If found and not revoked: return { ok: true, tenantId, scopes, keyName }
5. If not found: fall back to CAPTURE_API_KEY env-var comparison (backward compat)
6. If env-var match: return { ok: true, tenantId: 'default', scopes: ['capture', 'read'], keyName: null }
7. If no match: return { ok: false, response: 401 }
```

The return type gains `scopes` (array of strings) and `keyName` (string or null). This is a breaking change to the auth result shape that all callers (`handleCreateCapture`, `handleListCaptures`) must adapt to. The adaptation is minimal -- they currently destructure `{ tenantId }` and would add `{ tenantId, scopes }`.

**Scope enforcement happens in each handler, not in auth.** The auth module resolves identity; the handler checks authorization. This keeps the auth module focused and testable:

```js
// In handleCreateCapture:
const auth = await verifyApiKey(request, env);
if (!auth.ok) return auth.response;
if (!auth.scopes.includes('capture')) {
  return problemResponse(403, "This API key does not have the 'capture' scope required for this operation.");
}
```

### 9. Admin Auth: Separate from Capture Auth

Admin endpoints need a distinct auth path that checks for ADMIN_KEY or admin-scoped KV keys. Two implementation options:

**Option A: Separate `verifyAdminAuth()` function in `src/admin.js`.**
Calls `verifyApiKey()` first (KV lookup), checks for admin scope. If not found, checks ADMIN_KEY env var separately. Simpler, self-contained.

**Option B: Extend `verifyApiKey()` with a scope parameter.**
`verifyApiKey(request, env, { requiredScope: 'admin' })` returns 403 on scope mismatch. Centralizes auth. But overloads the function.

**Recommendation: Option A.** Admin auth has distinct logic (ADMIN_KEY env var is a separate credential, not a KV key). Keeping it in `src/admin.js` makes the admin module self-contained and avoids complicating the general-purpose auth module with admin-specific concerns.

```js
async function verifyAdminAuth(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { ok: false, response: problemResponse(401, 'Authorization header is required', { 'WWW-Authenticate': 'Bearer' }) };
  }
  const token = authHeader.slice('Bearer '.length);

  // Check 1: ADMIN_KEY env var (superadmin)
  if (env.ADMIN_KEY) {
    const enc = new TextEncoder();
    const a = enc.encode(token);
    const b = enc.encode(env.ADMIN_KEY);
    if (a.byteLength === b.byteLength && await crypto.subtle.timingSafeEqual(a, b)) {
      return { ok: true, isSuper: true, tenantId: null, scopes: ['admin'] };
    }
  }

  // Check 2: KV key with admin scope
  const hash = await hashKey(token);
  const record = await env.KV.get(`apikey:${hash}`, 'json');
  if (record && !record.revoked && record.scopes.includes('admin')) {
    return { ok: true, isSuper: false, tenantId: record.tenantId, scopes: record.scopes };
  }

  // Neither matched
  return { ok: false, response: problemResponse(401, 'Invalid API key', { 'WWW-Authenticate': 'Bearer' }) };
}
```

**Important:** The ADMIN_KEY check uses timing-safe comparison (same pattern as existing auth.js). The KV lookup uses hash-then-lookup, eliminating timing side-channels.

## Proposed Tasks

### Task 1: Add ADMIN_RATE_LIMITER binding to wrangler.toml and rate-limits.js

**What:** Add the rate limiter binding for both prod and staging environments, and update the rate limit constants.

**Deliverables:**
- `wrangler.toml`: Two new `[[unsafe.bindings]]` / `[[env.staging.unsafe.bindings]]` entries with namespace_id 1004/2004, limit 5, period 60
- `src/rate-limits.js`: Add `admin: { limit: 5, period: 60 }` to the RATE_LIMITS object

**Dependencies:** None. Can be done first; the binding exists harmlessly before any code uses it.

**Effort:** Trivial (config change).

### Task 2: Create src/admin.js with three handler stubs and admin auth

**What:** Create the admin module with handler function signatures matching the router contract, internal `verifyAdminAuth()`, and key generation/hashing helpers. Wire the rate-limit-before-auth flow.

**Deliverables:**
- `src/admin.js` with exported `handleAdminCreateKey`, `handleAdminListKeys`, `handleAdminRevokeKey`
- Internal `verifyAdminAuth()` with ADMIN_KEY + KV dual-mode auth
- Internal `generateApiKey()` and `hashKey()` helpers
- Rate limit check as step 1 in every handler, using `env.ADMIN_RATE_LIMITER`
- `Cache-Control: private, no-store` on all responses
- Log events: `admin.key_create`, `admin.key_revoke` at severity 4, `security.rate_limit` with `limiter: 'admin'`

**Dependencies:** Task 1 (binding exists). Also depends on KV storage functions for key records (can be built inline or in kv.js).

**Effort:** Medium. This is the bulk of the new code.

### Task 3: Wire admin routes into src/index.js

**What:** Add admin routes to the routes array, import handlers from src/admin.js, extend getRateLimitGroup().

**Deliverables:**
- Three route tuples added to `routes` array
- Import statement for admin handlers
- Updated `getRateLimitGroup()` to return `'admin'` for `/v1/admin/*` paths
- No CORS changes

**Dependencies:** Task 2 (handlers exist to import).

**Effort:** Small (a few lines in index.js).

### Task 4: Rewrite verifyApiKey() for KV-first + env-var fallback

**What:** Modify `src/auth.js` to support KV-based key lookup with the existing CAPTURE_API_KEY as fallback. Return shape gains `scopes` and `keyName` fields.

**Deliverables:**
- Updated `verifyApiKey()` with KV-first lookup, env-var fallback
- Return shape: `{ ok: true, tenantId, scopes, keyName }` on success
- Backward-compatible: CAPTURE_API_KEY fallback returns `scopes: ['capture', 'read']`, `keyName: null`
- Updated callers in `handleCreateCapture` and `handleListCaptures` to destructure new fields
- Scope enforcement in `handleCreateCapture` (requires `capture` scope)
- Scope enforcement in `handleListCaptures` (requires `read` scope, since `capture` implies `read`)

**Dependencies:** KV storage format for key records (from Task 2).

**Effort:** Medium. The auth rewrite is security-sensitive and needs thorough testing.

### Task 5: KV storage functions for API key records

**What:** Add functions to kv.js (or new src/kv-keys.js) for key record CRUD and tenant indexing.

**Deliverables:**
- `putKeyRecord(kv, keyHash, record)` -- store key metadata
- `getKeyRecord(kv, keyHash)` -- retrieve key metadata
- `listKeysByTenant(kv, tenantId)` -- read tenant-keys index, fan out to records
- `listAllKeys(kv)` -- for superadmin listing
- `addToTenantIndex(kv, tenantId, keyHash)` -- update tenant-keys secondary index
- Tenant index format: `tenant-keys:{tenantId}` -> JSON array of key hashes

**Dependencies:** None for the KV functions themselves.

**Effort:** Small-medium. Follows existing kv.js patterns.

### Task 6: Add tenantId to rate limit log events in existing handlers

**What:** After auth provides tenantId, enrich post-auth rate limit log entries.

**Deliverables:**
- `handleCreateCapture`: Add `tenantId` to per-IP and global rate limit log events (only when auth has succeeded -- rate limit fires after auth in capture flow)
- `handleListCaptures`: Same enrichment
- Note: admin endpoint rate limit events correctly omit `tenantId` (rate limit fires before auth)

**Dependencies:** Task 4 (auth returns tenantId from KV).

**Effort:** Trivial (add one field to existing log calls).

## Risks and Concerns

### Risk 1: Rate Limit Ordering Asymmetry

Admin endpoints use rate-limit-before-auth; capture endpoints use auth-before-rate-limit. This asymmetry is intentional and correct (per the advisory synthesis), but it creates two distinct patterns in the codebase that future contributors must understand. The admin handlers own their rate limiting inline; the capture handlers delegate to middleware-style checks after auth. **Mitigation:** Comment both patterns clearly. The admin handler comments should explain WHY rate limiting is first ("throttle pre-auth brute-force attempts").

### Risk 2: KV Read-Modify-Write Race on Tenant Index

The `tenant-keys:{tenantId}` secondary index uses a read-modify-write pattern (read array, push, write). Two concurrent key creation requests for the same tenant could lose a write. At 2-3 tenants with infrequent key operations and the 5/min rate limit, this is extremely unlikely. **Mitigation:** Accepted residual risk. The primary key record (`apikey:{hash}`) is the source of truth; the index is a listing optimization. If an index entry is lost, the key still works for auth; it just doesn't appear in `GET /v1/admin/keys` until the next write. An operator can re-list via `kv.list({ prefix: 'apikey:' })` as a recovery path. Document this in the evolution log.

### Risk 3: `hashKey()` Duplication

The `hashKey()` helper is needed in both `src/admin.js` (for key creation and admin auth) and `src/auth.js` (for KV-first key lookup). Avoid copy-pasting. Extract it to a shared utility -- either in `src/auth.js` (exported) or a new `src/crypto-utils.js`. The function is 4 lines and has no dependencies beyond Web Crypto, so placement is a style choice.

### Risk 4: ADMIN_KEY Not Set in Staging

If an operator deploys R12 code without running `wrangler secret put ADMIN_KEY --env staging`, the admin endpoints return 401 for all requests (no ADMIN_KEY to match, no KV admin keys exist yet). This is a safe failure mode (closed by default), but it could be confusing during first deployment. **Mitigation:** The health endpoint could include an `adminConfigured: false` field when ADMIN_KEY is absent, similar to how auth.js returns 503 when CAPTURE_API_KEY is absent. However, exposing whether ADMIN_KEY is configured is an information disclosure risk. Better to document the deployment sequence clearly in OPERATIONS.md.

### Risk 5: Eventual Consistency Window on Key Creation

After `POST /v1/admin/keys` creates a key in KV, the key may not be readable at all edge POPs for up to ~60 seconds. An operator who creates a key and immediately tries to use it from a different geographic location might get 401. **Mitigation:** Document this in the API response: include a note like `"note": "Key may take up to 60 seconds to propagate globally."` in the 201 response body.

## Additional Agents Needed

None beyond the current team. The edge-minion scope is fully covered by the tasks above. The auth rewrite (Task 4) overlaps with security-minion's domain -- coordinate on the exact `verifyApiKey()` return shape and scope enforcement pattern to avoid conflicting implementations.
