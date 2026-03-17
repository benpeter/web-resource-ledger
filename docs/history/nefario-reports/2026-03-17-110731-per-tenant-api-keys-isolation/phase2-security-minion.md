# Security Minion -- Planning Contribution

## Specialist

security-minion

## Planning Question

Implementation sequence and security constraints for per-tenant API key migration, covering dual-mode fallback, timing-safe comparison, deployment ordering, admin authorization, and KV key pattern injection risks.

---

## Recommendations

### 1. Dual-mode auth fallback: legacy key must not escalate to admin scope

The `CAPTURE_API_KEY` env var currently grants `{ ok: true, tenantId: 'default' }`. During migration, this must remain the ONLY thing it grants. The implementation must enforce a strict precedence:

**Auth resolution order:**

1. Hash the provided Bearer token with SHA-256.
2. Look up `apikey:{sha256hex}` in KV.
3. If found and not revoked, return `{ ok: true, tenantId, scopes }` from the KV record.
4. If NOT found in KV, fall back to timing-safe comparison against `CAPTURE_API_KEY` env var.
5. If the legacy comparison matches, return `{ ok: true, tenantId: 'default', scopes: ['capture', 'read'] }` -- hardcoded scopes, never `admin`.
6. If neither matches, return 401.

**Critical constraint:** The fallback path (step 4-5) must hardcode `scopes: ['capture', 'read']` and `tenantId: 'default'`. These values must NOT come from any external input. The legacy key is a capture-and-read key for the default tenant, period. No amount of header manipulation or request crafting should be able to promote it.

**Why this order matters:** KV lookup first means that if someone provisions a KV-based key that happens to match the legacy key's hash, the KV record's scopes take precedence. This is correct behavior -- once the legacy key is "onboarded" into KV as a proper tenant key, the KV record is authoritative. But during the transition window (before that onboarding), the fallback catches it.

**Removal gate:** The fallback branch should be removed in a follow-up PR once the operator has confirmed all clients use KV-provisioned keys. Document this in the migration runbook with an explicit "remove legacy fallback" step and a log event (`security.legacy_auth_used`) that makes it observable when the fallback is still being hit.

### 2. Timing-safe comparison approach for KV-based hash lookup

The current code uses `crypto.subtle.timingSafeEqual` to compare the raw Bearer token against the env var. With KV-based lookup, the security model changes fundamentally:

**KV lookup is inherently timing-safe for the key comparison itself.** The attacker provides a token; we hash it with SHA-256 and look up the hash in KV. The attacker cannot observe whether the hash "almost matched" a stored key -- either the key exists in KV or it does not. SHA-256 is a one-way function, so learning that `sha256(token)` is not in KV reveals nothing about what hashes are stored. There is no byte-by-byte comparison to time.

**Where timing safety still matters:**

- **Legacy fallback path:** When the KV lookup returns null and we fall back to comparing against `CAPTURE_API_KEY`, the existing `timingSafeEqual` pattern must be preserved exactly as-is. An attacker who knows the system has a fallback path could probe it specifically.

- **Revocation check:** After a KV hit, checking `record.revoked === true` is a boolean comparison that does not leak information. No timing concern here.

- **Scope check:** After auth succeeds, checking `scopes.includes('capture')` is not timing-sensitive because the scopes are server-controlled data, not attacker-controlled.

**Implementation guidance:** Hash the token using `crypto.subtle.digest('SHA-256', ...)` and convert to hex for the KV key. Do NOT use a keyed HMAC for this -- the hash is a lookup key, not an integrity proof. Using SHA-256 (no key) means the lookup works without needing another secret. The security property comes from KV acting as the oracle: either the hash exists or it does not.

```javascript
async function hashApiKey(rawKey) {
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(rawKey));
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
```

### 3. Deployment ordering constraints

This is the most security-critical operational question. The wrong ordering creates windows where either (a) all requests are rejected (denial of service) or (b) admin endpoints are accessible without authorization.

**Correct sequence:**

```
Step 1: Deploy code with dual-mode auth + admin endpoints  [safe: legacy key still works]
Step 2: Set ADMIN_KEY secret via wrangler secret put        [safe: admin endpoints now protected]
Step 3: Verify admin auth works (GET /v1/admin/keys returns 200)
Step 4: Provision first tenant key via POST /v1/admin/keys  [safe: KV auth now has a key]
Step 5: Verify KV-based auth works (use new key for capture)
Step 6: Remove CAPTURE_API_KEY secret                       [only after verifying step 5]
```

**Why step 1 is safe without step 2:** The admin endpoints must return 503 (not 200) when `ADMIN_KEY` is not set, just like the current auth returns 503 when `CAPTURE_API_KEY` is absent. This is the "misconfiguration guard" pattern already established in `auth.js:38`. The admin route handler must check for `ADMIN_KEY` presence and fail closed (503) before doing anything else.

**Critical: Admin endpoints must not be accessible with the legacy key.** The route handler for `/v1/admin/*` must check `ADMIN_KEY` authorization independently from the tenant auth path. The legacy `CAPTURE_API_KEY` must never be accepted on admin endpoints, not even as a fallback.

**Dangerous alternative (rejected):** Setting `ADMIN_KEY` before deploying the code. If the code doesn't know about `ADMIN_KEY` yet, the secret just sits unused -- no harm. But if you accidentally deploy code that reads `ADMIN_KEY` without the misconfiguration guard, you'd have a window. The safe sequence is: code first (with proper guards), then secrets.

**Rate limiter binding:** The `ADMIN_RATE_LIMITER` binding must be added to `wrangler.toml` in the same PR as the admin endpoints. If the binding is missing at deploy time, the admin endpoints must still work (rate limiting degrades gracefully), but they should log a warning. Do not make rate limiting a hard gate for admin operations.

### 4. Admin API authorization design

Two distinct authorization mechanisms, separated by purpose:

**`ADMIN_KEY` (env var) -- infrastructure-level superadmin:**

- Compared using the same timing-safe pattern as the current `CAPTURE_API_KEY`
- Grants cross-tenant admin access (can provision keys for any tenant)
- NOT stored in KV -- it is an infrastructure secret, like `SIGNING_KEY`
- Must use a distinct auth header scheme or the same Bearer scheme (Bearer is fine -- the handler knows it is an admin endpoint)

**KV-stored admin-scoped keys -- tenant-level admin:**

The prompt mentions KV-stored admin keys are "tenant-scoped." This is fine but adds complexity. For MVP, I recommend:

- `ADMIN_KEY` env var is the ONLY way to access `/v1/admin/*` endpoints
- Tenant-scoped admin keys (e.g., a tenant admin who can manage their own keys) are a future feature
- This keeps the implementation simple: admin endpoints check `ADMIN_KEY`, data endpoints check KV

If tenant-scoped admin keys are in scope for this PR, the auth resolution must distinguish:

```
/v1/admin/keys          -- requires ADMIN_KEY (infrastructure admin)
/v1/admin/tenants/X/... -- could accept X's admin-scoped key (tenant admin, future)
```

**The authorization check for admin endpoints should be:**

```javascript
async function verifyAdminKey(request, env) {
  if (!env.ADMIN_KEY) {
    return { ok: false, response: problemResponse(503, 'Admin service is not configured') };
  }
  // Extract Bearer token (same header parsing as verifyApiKey)
  // Timing-safe compare against env.ADMIN_KEY
  // Return { ok: true } on match, { ok: false, response: 401 } on mismatch
}
```

**Do NOT route admin requests through the tenant auth path.** The admin auth check should be a separate function, not a "special case" inside `verifyApiKey`. Mixing them creates confusion about what scopes apply and risks the legacy fallback granting admin access through a code path that "seemed unreachable."

### 5. KV key pattern injection/bypass risks for `apikey:{sha256hex}`

**Current KV key prefixes in use:**

| Prefix | Purpose |
|--------|---------|
| `capture:{captureId}` | Primary capture records |
| `tenant:{tenantId}:ts:{ISO}:{captureId}` | Tenant listing index |
| `signing-key:{keyId}` | Archived signing keys |
| `apikey:{sha256hex}` | **NEW: API key records** |

**Collision risk analysis:**

The `apikey:` prefix is safe from collision with existing prefixes because:
- `capture:`, `tenant:`, and `signing-key:` all start with different strings
- SHA-256 hex output is exactly 64 characters of `[0-9a-f]`, which cannot contain `:` or any other delimiter

**Attack vectors to consider:**

1. **Crafted key that hashes to a capture record key:** Impossible. `sha256hex` is 64 hex chars. `capture:cap_[a-f0-9]{32}` has a different prefix. Even if the hash somehow contained the string "capture:", the full KV key would be `apikey:capture:...` which is harmless.

2. **Prefix overlap between `apikey:` and future KV usage:** Document the prefix allocation in `kv.js` header comment. All future KV key patterns must check against this registry.

3. **Malicious JSON in KV value:** The API key record value (`{ tenantId, scopes, name, createdAt, createdBy, revoked }`) is written exclusively by the admin API. The `tenantId` stored in the record must be validated against `TENANT_ID_RE` at write time (admin key provisioning), not just at read time. Defense-in-depth: validate again at read time before using it in KV key construction for tenant-scoped operations.

4. **Key name injection via admin API:** The `name` field in the key record is a human label. It must be length-limited and must never be used in KV key construction, log interpolation without sanitization, or HTML rendering. Treat it as untrusted input even though it comes from the admin.

5. **SHA-256 collision (two different API keys mapping to the same hash):** Computationally infeasible. SHA-256 collision resistance is 2^128. Not a practical concern.

6. **Enumeration via KV list:** An attacker with `capture` scope should not be able to `kv.list({ prefix: 'apikey:' })`. This is enforced architecturally: the worker code is the only accessor of KV, and no endpoint exposes raw KV list operations to non-admin callers. The `GET /v1/admin/keys` endpoint (which does list api keys) is admin-protected.

**Recommendation:** Add a prefix registry comment at the top of `kv.js`:

```javascript
// KV key prefix registry -- all prefixes must be unique and documented here.
// Adding a new prefix? Check for overlaps with existing prefixes.
//   capture:{captureId}                        -- primary capture records
//   tenant:{tenantId}:ts:{ISO}:{captureId}     -- tenant listing index
//   signing-key:{keyId}                        -- archived signing keys
//   apikey:{sha256hex}                         -- API key records
```

---

## Proposed Tasks

### Task 1: Implement `verifyAdminKey` as a separate auth function

Create a dedicated `verifyAdminKey(request, env)` function that checks `ADMIN_KEY` env var with timing-safe comparison. Do NOT merge this into `verifyApiKey`. The two functions serve different trust boundaries.

- Misconfiguration guard: 503 if `ADMIN_KEY` is absent
- Bearer scheme extraction: same pattern as existing auth
- Timing-safe compare: reuse the `timingSafeEqual` pattern
- Return shape: `{ ok: true }` or `{ ok: false, response }` (no tenantId needed for infrastructure admin)
- Tests: mirror the existing `auth.test.js` structure

### Task 2: Implement SHA-256 key hashing and KV lookup in `verifyApiKey`

Refactor `verifyApiKey` to:
1. Hash the Bearer token with SHA-256 to hex
2. Look up `apikey:{sha256hex}` in KV
3. Validate KV record (not null, not revoked, has required fields)
4. Validate `tenantId` from record against `TENANT_ID_RE`
5. Validate requested scope against record's scopes
6. Fall back to `CAPTURE_API_KEY` timing-safe compare if KV miss
7. Hardcode `scopes: ['capture', 'read']` and `tenantId: 'default'` on legacy fallback
8. Log `security.legacy_auth_used` when fallback is hit
9. Return enriched result: `{ ok: true, tenantId, scopes, keyName }`

The function signature should expand to accept required scope:

```javascript
export async function verifyApiKey(request, env, { requiredScope = 'capture' } = {})
```

### Task 3: Implement admin API endpoints with dedicated auth

Route `/v1/admin/*` endpoints through `verifyAdminKey`, not `verifyApiKey`. Endpoints:

- `POST /v1/admin/keys` -- generate 256-bit key, `wrl_live_` prefix, base64url, store SHA-256 hash in KV, return raw key exactly once
- `GET /v1/admin/keys` -- list all key records (without raw keys)
- `DELETE /v1/admin/keys/{keyHash}` -- set `revoked: true`

Security requirements for key generation:
- Use `crypto.getRandomValues(new Uint8Array(32))` for key material
- Return the raw key in the response body ONCE -- it is never stored
- Store only the SHA-256 hash as the KV key
- Validate all input fields (tenantId against `TENANT_ID_RE`, name length-limited, scopes against allowlist)

### Task 4: Add scope checking to existing endpoints

After auth succeeds, check that the returned scopes include the required scope:

- `POST /v1/captures` -- requires `capture` scope
- `GET /v1/captures` -- requires `read` scope (capture implies read)
- Admin endpoints -- separate auth path (ADMIN_KEY)
- Public endpoints (verify, signing keys, health) -- no auth required (unchanged)

Return 403 with the required scope name: `"This action requires the 'capture' scope."`

### Task 5: Add ADMIN_RATE_LIMITER binding to wrangler.toml

Add the rate limiter binding for both production and staging environments. Configure at 5 requests/minute as specified. Apply rate limit check BEFORE auth on admin endpoints (rate limit is per-IP, not per-key -- this prevents credential stuffing on the admin endpoint).

### Task 6: Write migration runbook

Document the exact deployment sequence from Recommendation 3 in OPERATIONS.md. Include verification commands, rollback procedures, and the explicit "remove legacy fallback" step with the log query to confirm no clients are still using the old key.

---

## Risks and Concerns

### CRITICAL: Race condition between deploy and ADMIN_KEY provisioning

**Risk:** Between deploying the code (which adds admin route handlers) and setting `ADMIN_KEY` via wrangler, the admin endpoints exist but are not authorized. If the misconfiguration guard is missing or broken, anyone could call them.

**Mitigation:** The misconfiguration guard (503 when `ADMIN_KEY` is absent) is the ONLY protection during this window. It must be the FIRST check in the admin handler, before rate limiting, before request parsing, before anything. Test this explicitly: a test where `ADMIN_KEY` is undefined must return 503, not 200 or 404.

### HIGH: Scope confusion between verifyAdminKey and verifyApiKey

**Risk:** If admin endpoints accidentally call `verifyApiKey` instead of `verifyAdminKey`, the legacy `CAPTURE_API_KEY` fallback could grant admin access to the default tenant's capture key holder.

**Mitigation:** Structural separation. `verifyAdminKey` and `verifyApiKey` are different functions. Admin route handlers must import and call `verifyAdminKey`. Add a test that explicitly verifies: calling an admin endpoint with `CAPTURE_API_KEY` returns 401 (not 200, not 403).

### HIGH: KV eventual consistency allows 0-60s use of revoked keys

**Risk:** After revoking a key via `DELETE /v1/admin/keys/{keyHash}`, the key may still authenticate for up to 60 seconds due to KV eventual consistency.

**Mitigation:** This is accepted in the design (documented). The revocation response should include a warning: `"Key revoked. May remain active for up to 60 seconds due to eventual consistency."` For the security review, this is acceptable for the current threat model -- if immediate revocation becomes a requirement, a deny-list in Durable Objects would be needed.

### MEDIUM: Legacy fallback obscures the actual auth source in logs

**Risk:** During the migration period, `security.auth_fail` and `security.auth_success` events should distinguish between KV-based auth and legacy fallback auth. Without this distinction, the operator cannot confidently determine when all clients have migrated to KV-based keys.

**Mitigation:** Enrich log events with `authMethod: 'kv'` or `authMethod: 'legacy'`. The migration runbook should include a Coralogix query to filter for `authMethod:legacy` events before removing the `CAPTURE_API_KEY` secret.

### MEDIUM: Raw API key in POST response body

**Risk:** The `POST /v1/admin/keys` endpoint returns the raw API key in the response body. This is the only time the key is exposed. If the response is logged by an intermediary (CDN, proxy, debugging tool), the key is compromised.

**Mitigation:**
- Response must include `Cache-Control: no-store`
- Response must include `X-Content-Type-Options: nosniff`
- The raw key must never appear in Coralogix logs -- log only the key hash and name
- Consider adding a response header like `X-Sensitive: true` as a signal to intermediaries (informational, not enforced)
- Document in the admin API response that the key will not be shown again

### LOW: ADMIN_KEY rotation requires coordinated secret update

**Risk:** Rotating `ADMIN_KEY` requires `wrangler secret put` which takes effect on next request. There is no mechanism for two ADMIN_KEYs to be valid simultaneously during rotation.

**Mitigation:** Accept for MVP. The operator must update quickly and accept a brief window where the old key is invalid. If this becomes a problem, support comma-separated ADMIN_KEYs (check both) in a future PR.

---

## Additional Agents Needed

None beyond what is already in the planning session. The five-specialist advisory (security, api-design, edge, iac, observability) covers all necessary perspectives. The security analysis is complete for the planning phase.

One note for **test-minion** when implementation begins: the auth test suite needs specific adversarial tests:

1. Legacy `CAPTURE_API_KEY` on admin endpoint returns 401 (not 200)
2. Revoked KV key returns 401
3. KV key with `capture` scope on a `read`-only endpoint returns 200 (capture implies read)
4. KV key with `read` scope on a `capture` endpoint returns 403
5. `ADMIN_KEY` absent returns 503 on admin endpoints
6. Malicious `tenantId` in KV record (fails `TENANT_ID_RE` validation) returns 500
7. Legacy fallback is only hit when KV lookup returns null (not on revoked keys)
8. Key generation produces cryptographically random 256-bit values with correct prefix
