## Domain Plan Contribution: security-minion

### Recommendations

#### 1. Auth flow ordering in `verifyApiKey()`

The rewritten `verifyApiKey()` must follow this exact ordering. Each step has a security rationale; reordering creates vulnerabilities.

```
verifyApiKey(request, env)
  1. Extract Bearer token from Authorization header
     - Missing header → 401 + WWW-Authenticate: Bearer
     - Non-Bearer scheme → 401 + WWW-Authenticate: Bearer
     - Empty token after "Bearer " → 401

  2. SHA-256 the token, hex-encode → keyHash
     const keyHash = hexEncode(await crypto.subtle.digest('SHA-256', enc.encode(token)))

  3. KV lookup: env.KV.get(`apikey:${keyHash}`, 'json')
     - Record found AND revoked === true → 401 "Invalid API key"
       STOP. Do NOT fall through to env-var path.
       Rationale: revocation must be authoritative. If an operator
       revokes a key in KV, the env-var fallback must not resurrect it.
     - Record found AND revoked !== true → validate tenantId format,
       return { ok: true, tenantId: record.tenantId, scopes: record.scopes,
                keyName: record.name, authMethod: 'kv' }
     - Record not found → continue to step 4

  4. ADMIN_KEY env-var check (superadmin path):
     if env.ADMIN_KEY is set:
       timing-safe compare token against env.ADMIN_KEY
       if match → return { ok: true, tenantId: null, scopes: ['admin'],
                           keyName: 'ADMIN_KEY', authMethod: 'env-admin' }
       Rationale: tenantId is null because ADMIN_KEY is cross-tenant.
       The admin handlers accept tenantId from the request body when
       authMethod is 'env-admin'. scopes is ['admin'] only — ADMIN_KEY
       does NOT get capture/read (it is an infrastructure credential,
       not a tenant credential).

  5. CAPTURE_API_KEY env-var fallback (migration path):
     if env.CAPTURE_API_KEY is set:
       timing-safe compare token against env.CAPTURE_API_KEY
       if match → return { ok: true, tenantId: 'default',
                           scopes: ['capture', 'read'],
                           keyName: 'CAPTURE_API_KEY',
                           authMethod: 'env-capture' }
       Rationale: the advisory says CAPTURE_API_KEY gets capture+read
       but NOT admin. Admin access is via ADMIN_KEY. This is the
       settled design from the synthesis: "CAPTURE_API_KEY is a tenant
       credential, ADMIN_KEY is an infrastructure credential."

  6. No match anywhere → 401 "Invalid API key"
```

**Critical invariant:** A revoked KV key (step 3) MUST NOT fall through to step 4 or 5. If it did, an attacker with a revoked key that happens to match `ADMIN_KEY` or `CAPTURE_API_KEY` would bypass revocation. This is not a realistic collision scenario (different key formats), but the invariant prevents a class of bugs if key format assumptions change.

**Why ADMIN_KEY before CAPTURE_API_KEY:** ADMIN_KEY is the more privileged credential. Checking it first means if someone accidentally sets both env vars to the same value, the more restrictive interpretation (admin-only, no capture/read) applies. This is fail-secure: the operator realizes admin operations work but captures don't, and fixes the misconfiguration.

**New return shape:**

```js
// Success:
{ ok: true, tenantId: string | null, scopes: string[], keyName: string, authMethod: string }

// Failure:
{ ok: false, response: Response }
```

The `keyName` field is for observability logging (which key was used). It must NEVER contain the raw key value. For KV keys, it's the `name` field from the record. For env-var paths, it's the env-var name string literal.

The `authMethod` field ('kv', 'env-admin', 'env-capture') enables:
- Deprecation warnings when `env-capture` is used
- Admin handler logic that distinguishes cross-tenant superadmin from tenant-scoped admin
- Observability enrichment

#### 2. Timing-safe comparison analysis

**KV path (step 3): No timing-safe comparison needed.** The SHA-256 hash is computed before the KV lookup. The hash computation takes constant time for same-length inputs (all keys are 44 chars after base64url encoding with `wrl_live_` prefix = ~52 chars total). The KV lookup is a key-value fetch with no byte-by-byte comparison exposed to the caller.

**ADMIN_KEY env-var path (step 4): Timing-safe comparison required.** This compares the raw token against a secret env var. Use the existing `crypto.subtle.timingSafeEqual` pattern.

**CAPTURE_API_KEY env-var path (step 5): Timing-safe comparison required.** Same reasoning as ADMIN_KEY.

**Length-mismatch early return on env-var paths:** The existing code returns 401 immediately when byte lengths differ, with a comment that key length is not a secret. This is acceptable because:
- Key length is a deployment-time constant, not a per-request secret
- An attacker learning the key is 44 chars vs 32 chars gains negligible advantage
- The alternative (padding to equal length) adds complexity without security benefit

Preserve the existing length-mismatch logic for both env-var paths.

**Implementation for env-var timing-safe check (extracted helper):**

```js
async function timingSafeMatch(provided, expected) {
  const enc = new TextEncoder();
  const a = enc.encode(provided);
  const b = enc.encode(expected);
  if (a.byteLength !== b.byteLength) return false;
  return crypto.subtle.timingSafeEqual(a, b);
}
```

This helper is used by both ADMIN_KEY and CAPTURE_API_KEY checks. Keep it internal to `auth.js`.

#### 3. 403 scope-insufficient response: exact wording

Per the advisory synthesis (conflict resolution #3): **name the required scope**. The scope model is public (documented in the API spec). Withholding it only frustrates operators.

**Exact format using existing `problemResponse`:**

```js
problemResponse(403, "This API key does not have the 'capture' scope required for this operation")
```

Variations per endpoint:
- `handleCreateCapture`: `"This API key does not have the 'capture' scope required for this operation"`
- `handleListCaptures`: `"This API key does not have the 'read' scope required for this operation"`
- Admin endpoints: `"This API key does not have the 'admin' scope required for this operation"`

**Security notes on the 403 response:**
- No `WWW-Authenticate` header (that's for 401 only -- RFC 9110 section 15.5.4)
- The `capture` implies `read` rule is enforced in `verifyApiKey()` at scope resolution time, not in the handler. If a key has `scopes: ['capture']`, the returned scopes array includes both `['capture', 'read']`. This means the handler scope check is always a simple `includes()`.

**Helper function for scope enforcement:**

```js
export function requireScope(auth, scope) {
  if (!auth.scopes.includes(scope)) {
    return problemResponse(403,
      `This API key does not have the '${scope}' scope required for this operation`);
  }
  return null;
}
```

Usage in handlers:

```js
const auth = await verifyApiKey(request, env);
if (!auth.ok) return auth.response;
const denied = requireScope(auth, 'capture');
if (denied) return denied;
```

**Scope expansion (capture implies read):** Implement this in `verifyApiKey()` after reading the KV record, before returning. This is a security-critical normalization -- if done in each handler instead, one handler might forget and fail open.

```js
// After reading scopes from KV record:
const scopes = [...record.scopes];
if (scopes.includes('capture') && !scopes.includes('read')) {
  scopes.push('read');
}
```

#### 4. Security boundaries for admin endpoints: ordering

Admin endpoints MUST follow this exact processing order:

```
1. Rate limit check (ADMIN_RATE_LIMITER, 5/min per IP)
   BEFORE auth. Rationale: throttle brute-force key guessing
   before burning a KV read on each attempt. At 5/min, an
   attacker gets 5 KV reads per minute, not thousands.

2. Auth check (verifyApiKey)
   Returns scopes and tenantId.

3. Scope check (requireScope(auth, 'admin'))
   403 if the key lacks admin scope.

4. Body parse (for POST only)
   request.json() with try/catch.

5. Input validation
   Validate tenantId format, scope allowlist, name format.

6. Business logic
   Create/list/revoke key.
```

**Why rate limit before auth on admin endpoints but auth before rate limit on capture endpoints:**

The existing capture endpoint does auth → rate limit. This is acceptable because:
- Capture rate limit is 10/min per IP, which is reasonable
- Auth failure is cheap (single env-var comparison in current code; single KV read + optional env-var in new code)
- Per-IP rate limiting already bounds the KV read cost from invalid key floods

Admin endpoints are different:
- 5/min is aggressively low -- the intent is to make brute-force infeasible
- The rate limit is the first line of defense against pre-auth abuse
- There is no legitimate use case for >5 admin API calls per minute from a single IP
- If auth came first, an attacker could still burn KV reads at whatever rate the Worker can handle before hitting the rate limit

**Do NOT change the existing capture/list endpoint ordering.** The advisory synthesis (edge-minion section) explicitly says: "For capture endpoints, current auth-before-rate-limit ordering is acceptable." Changing it would be a gratuitous behavior change.

#### 5. Revoked key handling

**Return 401 "Invalid API key" with `WWW-Authenticate: Bearer`.** Identical response to "key not found" and "wrong key."

```js
const record = await env.KV.get(`apikey:${keyHash}`, 'json');
if (record && record.revoked) {
  // SECURITY: Same response as invalid key -- no enumeration.
  // Do NOT fall through to env-var path.
  return { ok: false, response: problemResponse(401, 'Invalid API key',
    { 'WWW-Authenticate': 'Bearer' }) };
}
```

**Why this matters:** If revoked keys returned a different status (e.g., 403 "Key revoked"), an attacker could distinguish:
- "This key hash exists in KV but is revoked" (confirms the key was once valid)
- "This key hash does not exist in KV" (random guess)

This is a key enumeration oracle. Even though the SHA-256 preimage is hard to reverse, the oracle confirms whether a guessed key was ever valid -- useful for an attacker who has partial key material (e.g., from a truncated log line).

**STOP after revocation check:** The `return` statement after detecting `record.revoked` prevents fallthrough to the env-var paths. This is the single most critical line in the auth flow. If this `return` is accidentally removed, a revoked KV key could authenticate via the env-var fallback.

#### 6. CAPTURE_API_KEY dual-mode fallback

**Position:** Step 5 in the auth flow, AFTER KV lookup and AFTER ADMIN_KEY check.

**Scopes granted:** `['capture', 'read']` -- no admin. Per the advisory synthesis: "CAPTURE_API_KEY is a tenant credential, ADMIN_KEY is an infrastructure credential."

**Tenant assigned:** `'default'` (hardcoded, same as today).

**Timing-safe comparison:** Required. Uses the same `timingSafeMatch` helper as the ADMIN_KEY path.

**Deprecation logging:** When the CAPTURE_API_KEY fallback is used, the handler should log a deprecation warning:

```js
// After successful CAPTURE_API_KEY match:
console.warn('CAPTURE_API_KEY env-var fallback used -- provision KV-based keys via the admin API');
```

This warning appears in Workers logs and is the operator's reminder to migrate.

**Misconfiguration guard:** If BOTH `CAPTURE_API_KEY` and `ADMIN_KEY` are absent AND no KV key matches, return 401 (not 503). The 503 "Service is not configured" should only appear when the system has NO auth mechanism at all:

```js
// After all paths exhausted:
// 503 only if there is literally no auth configured
if (!env.ADMIN_KEY && !env.CAPTURE_API_KEY) {
  // Check if any KV keys exist (optional, but expensive -- skip for now)
  // The KV lookup already happened and missed. If env vars are also absent,
  // the system has no way to authenticate anyone.
  return { ok: false, response: problemResponse(503, 'Service is not configured') };
}
// Otherwise, the key is simply wrong
return { ok: false, response: problemResponse(401, 'Invalid API key',
  { 'WWW-Authenticate': 'Bearer' }) };
```

Wait -- this introduces a timing oracle: the response differs based on whether env vars are set. However, the 503 vs 401 distinction reveals only "is the service configured?", not any key material. An attacker who can reach the endpoint already knows the service is running. The 503 is for the operator to notice the misconfiguration. This is acceptable.

Actually, simplify: keep the current misconfiguration guard at the TOP of the function. Check that at least one auth mechanism exists before doing any work:

```js
// Step 0: Misconfiguration guard (fail closed)
if (!env.KV && !env.ADMIN_KEY && !env.CAPTURE_API_KEY) {
  return { ok: false, response: problemResponse(503, 'Service is not configured') };
}
```

The `env.KV` check covers the case where KV is bound (keys may or may not exist, but auth is possible). If KV is bound, the system can authenticate via KV keys even without env vars. This is the steady-state after migration.

#### 7. Key enumeration prevention on admin list endpoint

The `GET /v1/admin/keys` endpoint returns key metadata but MUST NOT expose:
- The raw API key (never stored, never available)
- The full SHA-256 hash used as the KV key

**What to expose in list responses:**

```json
{
  "data": [
    {
      "keyHash": "a1b2c3d4e5f6...full-64-char-hex",
      "name": "production-capturer",
      "scopes": ["capture", "read"],
      "createdAt": "2026-03-17T00:00:00.000Z",
      "createdBy": "default",
      "revoked": false
    }
  ]
}
```

Wait -- the advisory synthesis says: "Use the full hash for API operations (DELETE /v1/admin/keys/{keyHash}), but display the key_ prefixed short ID in list responses for human readability."

But it also says: "The full hash is needed for unambiguous KV lookup during revocation."

**Reconciled approach:** Expose the full hash in list responses. The full SHA-256 hex is the identifier for revocation (`DELETE /v1/admin/keys/{keyHash}`). The hash is not secret -- it cannot be reversed to the raw key. Exposing it in list responses avoids the ambiguity of short IDs and keeps the API simple. The `key_` prefix display ID mentioned in the advisory is a nice-to-have but adds complexity without security value. Defer it.

**Tenant scoping on list:**

```js
// When authenticated via KV key with 'admin' scope:
//   List only keys for auth.tenantId
//   Read from tenant-keys:{auth.tenantId}

// When authenticated via ADMIN_KEY env var:
//   List keys for the tenantId specified in query param
//   GET /v1/admin/keys?tenantId=acme
//   If no tenantId param, return 400 "Query parameter 'tenantId' is required"
```

**IDOR prevention:** The tenantId used for listing MUST come from the authenticated key's record, NOT from a query parameter, UNLESS the caller is authenticated via ADMIN_KEY. This is the core tenant isolation boundary.

```js
async function handleListKeys(request, env, ctx) {
  const auth = await verifyApiKey(request, env);
  if (!auth.ok) return auth.response;
  const denied = requireScope(auth, 'admin');
  if (denied) return denied;

  let targetTenantId;
  if (auth.authMethod === 'env-admin') {
    // Superadmin: tenantId from query param
    targetTenantId = new URL(request.url).searchParams.get('tenantId');
    if (!targetTenantId) {
      return problemResponse(400, "Query parameter 'tenantId' is required for superadmin key listing");
    }
    if (!TENANT_ID_RE.test(targetTenantId)) {
      return problemResponse(400, "Query parameter 'tenantId' is invalid");
    }
  } else {
    // Tenant-scoped admin: list only own tenant's keys
    targetTenantId = auth.tenantId;
  }

  // Fetch from tenant-keys:{targetTenantId}
  // ...
}
```

### Proposed Tasks (specific implementation tasks with deliverables)

#### Task 1: Rewrite `src/auth.js` with multi-path auth

**Deliverables:**
- `verifyApiKey(request, env)` rewritten with the 6-step flow above
- `timingSafeMatch(provided, expected)` internal helper
- `requireScope(auth, scope)` exported helper
- Scope expansion logic (`capture` implies `read`)
- `TENANT_ID_RE` validation on all returned tenantIds
- Updated JSDoc with new return shape

**Function signature:**
```js
/**
 * @param {Request} request
 * @param {{ KV?: KVNamespace, ADMIN_KEY?: string, CAPTURE_API_KEY?: string }} env
 * @returns {Promise<
 *   { ok: true, tenantId: string | null, scopes: string[], keyName: string, authMethod: string }
 *   | { ok: false, response: Response }
 * >}
 */
export async function verifyApiKey(request, env)
```

**Key security invariants to test:**
1. Revoked KV key → 401, does NOT fall through to env-var paths
2. KV key for tenant A → tenantId is A, cannot be overridden
3. ADMIN_KEY match → tenantId is null, scopes is `['admin']` only
4. CAPTURE_API_KEY match → tenantId is 'default', scopes is `['capture', 'read']`
5. `capture` scope in KV record → returned scopes include both `capture` and `read`
6. No auth mechanism configured → 503
7. Wrong key with all mechanisms available → 401
8. KV error (network failure) → should it return 500 or fall through to env vars? **Recommendation: return 500.** A KV read failure is not the same as "key not found." Falling through to env-var on KV error would bypass revocation checks for KV-managed keys. Fail closed.

#### Task 2: Add scope enforcement to existing handlers

**Deliverables:**
- `handleCreateCapture`: add `requireScope(auth, 'capture')` after auth
- `handleListCaptures`: add `requireScope(auth, 'read')` after auth
- Update log events to include `auth.keyName` and `auth.authMethod`
- Unauthenticated endpoints: no changes

**Ordering in handlers (critical):**
```
handleCreateCapture:
  1. Content-Type check (existing, unchanged)
  2. Auth check (verifyApiKey — now returns scopes)
  3. Scope check (requireScope 'capture') ← NEW
  4. Rate limit check (existing, unchanged)
  5. Body parse (existing, unchanged)
  ...rest unchanged

handleListCaptures:
  1. Auth check (verifyApiKey — now returns scopes)
  2. Scope check (requireScope 'read') ← NEW
  3. Rate limit check (existing, unchanged)
  ...rest unchanged
```

**Note:** Scope check goes AFTER auth but BEFORE rate limit. A 403 scope violation should not consume a rate limit token — the caller's key is valid, just misconfigured. Consuming rate limit tokens for scope violations would let an attacker exhaust a legitimate user's rate limit budget by sending requests with a stolen read-only key to the capture endpoint.

#### Task 3: Implement `src/admin.js` admin key management module

**Deliverables:**
- `generateApiKey()` — 256-bit server-generated key with `wrl_live_` prefix, base64url body
- `createKey(kv, { tenantId, scopes, name, createdBy })` — generates key, computes SHA-256, writes `apikey:{hash}` and updates `tenant-keys:{tenantId}` index
- `listKeys(kv, tenantId)` — reads `tenant-keys:{tenantId}`, fetches each key record, returns metadata (no raw keys)
- `revokeKey(kv, keyHash, tenantId)` — sets `revoked: true`, validates tenant ownership

**Key generation:**
```js
function generateApiKey() {
  const rawBytes = crypto.getRandomValues(new Uint8Array(32));
  const b64 = btoa(String.fromCharCode(...rawBytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return `wrl_live_${b64}`;
}
```

**SHA-256 hashing (must match verifyApiKey):**
```js
async function hashKey(rawKey) {
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(rawKey));
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}
```

**Input validation for key creation:**
- `tenantId`: required, matches `TENANT_ID_RE`
- `scopes`: required, array, each element in `['capture', 'read', 'admin']`, non-empty
- `name`: required, string, 1-128 chars, matches `/^[a-zA-Z0-9 _.:-]{1,128}$/`
- Reject unexpected fields (allowlist validation)

**Self-revocation prevention:**
```js
// In revokeKey handler:
if (keyHash === authKeyHash) {
  return problemResponse(409, 'Cannot revoke the key used to authenticate this request');
}
```

This requires passing the authenticated key's hash to the revocation handler. Since `verifyApiKey()` computes the hash in step 2, add `keyHash` to the success return:

```js
{ ok: true, tenantId, scopes, keyName, authMethod, keyHash }
```

For env-var auth methods, `keyHash` is null (they are not KV keys and cannot be revoked via the API).

#### Task 4: Admin endpoint handlers and routing in `src/index.js`

**Deliverables:**
- Three new routes: `POST /v1/admin/keys`, `GET /v1/admin/keys`, `DELETE /v1/admin/keys/{keyHash}`
- Rate limit → auth → scope → body parse ordering
- No CORS on admin endpoints (server-to-server only)
- Log admin operations at severity 4 with `admin` subsystem

**Route patterns:**
```js
['POST',   /^\/v1\/admin\/keys$/, handleCreateKey],
['GET',    /^\/v1\/admin\/keys$/, handleListKeys],
['DELETE', /^\/v1\/admin\/keys\/([a-f0-9]{64})$/, handleRevokeKey],
```

The DELETE path param is validated by regex: exactly 64 hex chars (SHA-256 hex digest length). No other format is accepted.

**Response for POST /v1/admin/keys (key creation):**
```json
{
  "key": "wrl_live_dGhpcyBpcyBhIDMyLWJ5dGUga2V5",
  "keyHash": "a1b2c3d4...64-hex-chars",
  "tenantId": "acme",
  "scopes": ["capture", "read"],
  "name": "production-capturer",
  "createdAt": "2026-03-17T00:00:00.000Z"
}
```

**SECURITY:** The `log()` call for this handler MUST NOT log the response body. Log only: `{ event: 'admin.key_create', tenantId, keyName, scopes, keyHash, cip }`.

#### Task 5: Admin rate limiter binding

**Deliverables:**
- New `ADMIN_RATE_LIMITER` binding in `wrangler.toml` (namespace 1004/2004)
- 5/min per IP
- Update `RATE_LIMITS` export in `src/rate-limits.js`
- Wire into admin handlers before auth check

### Risks and Concerns

**Risk 1: KV read failure silently falls through to env-var path.**

If `env.KV.get()` throws (network error, binding misconfiguration), the catch block must NOT fall through to the env-var comparison. This would bypass revocation checks for all KV-managed keys during outages. The function must return 500 on KV errors, not 401. The only exception: if `env.KV` is not bound at all (undefined), the function should skip the KV path entirely and proceed to env-var checks — this covers the case where the KV binding hasn't been added yet.

**Implementation:**
```js
if (env.KV) {
  let record;
  try {
    record = await env.KV.get(`apikey:${keyHash}`, 'json');
  } catch (err) {
    // KV read failure — fail closed, do NOT fall through
    return { ok: false, response: problemResponse(500, 'Authentication service error') };
  }
  if (record && record.revoked) { /* 401 */ }
  if (record && !record.revoked) { /* success */ }
  // record is null — key not in KV, continue to env-var paths
}
```

**Risk 2: `tenant-keys:{tenantId}` read-modify-write race on key creation.**

Two concurrent `POST /v1/admin/keys` requests for the same tenant could lose one key from the index. At single-digit keys per tenant and 5/min admin rate limit, this is exceedingly unlikely. The primary `apikey:{hash}` record is written atomically regardless — the index is for listing convenience only. If a key is missing from the index, it still authenticates correctly; it just won't appear in `GET /v1/admin/keys` listings.

**Mitigation:** Document as a known limitation. If it becomes a problem, switch to KV list prefix pattern (`tenant-keys:{tenantId}:{hash}` with empty value).

**Risk 3: Scope expansion (`capture` implies `read`) applied inconsistently.**

If scope expansion is done in handlers instead of in `verifyApiKey()`, a new handler might forget and fail open for read operations when the key only has `capture` scope. Centralizing it in `verifyApiKey()` makes it a single point of truth.

**Risk 4: ADMIN_KEY timing-safe comparison leaks key existence.**

The ordering (KV lookup → ADMIN_KEY check → CAPTURE_API_KEY check) means a request that misses KV and misses ADMIN_KEY takes longer than one that misses KV and hits ADMIN_KEY. This reveals whether ADMIN_KEY is set. However:
- Whether the admin endpoint exists is already public (it returns 404 or 405 when not found)
- Whether admin auth is configured is not a useful secret
- The timing difference does not reveal the key value

**Risk 5: Admin handler IDOR if `tenantId` is taken from request body instead of auth record.**

This is the #1 implementation risk. The admin handlers MUST use `auth.tenantId` for tenant scoping, except when `auth.authMethod === 'env-admin'` (superadmin). A single misplaced `body.tenantId` in a tenant-scoped context creates a full tenant isolation bypass.

**Mandatory test cases:**
- KV admin key for tenant `acme` calling `GET /v1/admin/keys?tenantId=other` → the `tenantId` query param is IGNORED, response shows only `acme` keys
- KV admin key for tenant `acme` calling `POST /v1/admin/keys { tenantId: "other" }` → 403 (cannot create keys for another tenant)
- ADMIN_KEY env var calling `POST /v1/admin/keys { tenantId: "other" }` → succeeds (superadmin)

### Additional Agents Needed

- **iac-minion**: Add `ADMIN_RATE_LIMITER` binding to `wrangler.toml` (both production and staging). Add `ADMIN_KEY` to the secrets documentation. Namespace IDs 1004 (production) and 2004 (staging) per the advisory.
- **test-minion**: Build comprehensive test suite for the new auth flow, especially the security-critical invariants listed in Task 1 (revocation bypass prevention, tenant isolation on admin endpoints, scope expansion correctness, KV error handling).
