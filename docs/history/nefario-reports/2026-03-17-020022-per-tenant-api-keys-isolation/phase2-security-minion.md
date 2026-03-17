## Domain Plan Contribution: security-minion

### Recommendations

#### (a) Key storage format: what `kv.get("apikey:{sha256}")` returns

The KV record stored under `apikey:{hex(SHA-256(rawKey))}` should contain:

```json
{
  "tenantId": "acme",
  "scopes": ["capture", "read"],
  "name": "production-capturer",
  "createdAt": "2026-03-17T00:00:00.000Z",
  "createdBy": "default",
  "revoked": false
}
```

**Field rationale:**

- `tenantId` (string, required): matches `TENANT_ID_RE` (`/^[a-z0-9_-]{1,64}$/`). This is the isolation boundary -- every downstream KV operation uses this to scope data access.
- `scopes` (string array, required): enumerated set, not freeform. Valid values: `"capture"`, `"read"`, `"admin"`. Never store as a comma-separated string -- arrays prevent injection of extra scopes via delimiter confusion.
- `name` (string, required): human-readable label for the key. Operators need to distinguish keys in revocation scenarios ("which key is compromised?"). Max 128 chars, validated against `/^[a-zA-Z0-9 _.-]{1,128}$/` to prevent injection if ever rendered.
- `createdAt` (ISO 8601 string, required): audit trail. Essential for incident response ("when was this key created relative to the suspicious activity?").
- `createdBy` (string, required): the tenantId of the key that was used to create this key. Provides provenance chain for forensics.
- `revoked` (boolean, required): soft-delete flag. See (f) for revocation mechanics.

**What NOT to include:**

- Do NOT store the raw key or any reversible encoding of it. The SHA-256 hash is the lookup key; the raw key is returned exactly once at creation time and never stored.
- Do NOT store `expiresAt`. Key expiration adds complexity without clear value for this system's threat model (operator-managed keys, not end-user tokens). If needed later, it can be added as a non-breaking field. YAGNI.
- Do NOT store `lastUsedAt`. KV writes on every request for usage tracking is an anti-pattern on Cloudflare KV (eventually consistent, write-heavy). If usage tracking is needed, use Coralogix logs.

**Secondary index for listing keys per tenant:**

Store `tenant-keys:{tenantId}:{sha256prefix}` with value `""` to enable listing all keys belonging to a tenant (needed for the admin API's "list keys" endpoint and for key rotation workflows). The `sha256prefix` is the first 16 hex chars of the full hash -- enough for uniqueness within a tenant while keeping index keys short. The full hash is in the key name of the primary record.

Actually, simpler: store a `tenant-keys:{tenantId}` record containing an array of key hashes. Tenant key counts will be single-digit. A single KV read retrieves the full list. This avoids the list-then-fetch fan-out pattern and keeps operations O(1).

```json
// KV key: "tenant-keys:acme"
// KV value:
["a1b2c3d4e5f6...full-sha256-hex"]
```

This array is updated (read-modify-write) when keys are created or revoked. Race conditions are acceptable at this scale (single-digit keys per tenant, provisioning is an infrequent operation).

---

#### (b) Static `CAPTURE_API_KEY` transition strategy

**Recommendation: Dual-path lookup with KV-first, env-var fallback.**

The `verifyApiKey()` function should:

1. Extract the Bearer token from the Authorization header (unchanged).
2. Compute `SHA-256(token)` and look up `apikey:{hex(hash)}` in KV.
3. If found and `revoked === false`: return `{ ok: true, tenantId, scopes }`.
4. If found and `revoked === true`: return 401. Do not fall through to env var.
5. If not found in KV: fall back to timing-safe comparison against `env.CAPTURE_API_KEY`. If match, return `{ ok: true, tenantId: 'default', scopes: ['capture', 'read', 'admin'] }`.

**Why this order matters:**

- KV-first means new tenant keys work immediately with no env var changes.
- The env-var fallback ensures zero downtime during migration. The existing static key continues to work until the operator provisions it in KV.
- Once the static key is provisioned in KV, the env var becomes dead code. It can be removed in a later cleanup PR. No rush.
- The revocation check before fallback prevents a scenario where a key is revoked in KV but still accepted via the env-var path. This is critical: if an operator revokes a key, the revocation must be authoritative.

**Migration script: not needed for day-one.**

The static key does NOT need to be pre-loaded into KV. The fallback path handles it. When the operator is ready to manage the `default` tenant's keys via the admin API, they can create a new key for the `default` tenant and optionally remove the `CAPTURE_API_KEY` env var. This is a deliberate operator action, not an automated migration.

**Security note on the fallback path:**

The env-var fallback grants `['capture', 'read', 'admin']` scopes -- full access including admin. This is necessary because the static key is currently the only credential and the operator needs it to bootstrap the admin API. Once the operator provisions a dedicated admin key and separate capture/read keys via the admin API, they should remove the `CAPTURE_API_KEY` env var to eliminate this implicit full-access path. Document this in the operator guide.

---

#### (c) Read/write scoping

**Three scopes, no more:**

| Scope | Grants | Endpoints |
|-------|--------|-----------|
| `capture` | Create captures | `POST /v1/captures` |
| `read` | List and retrieve captures | `GET /v1/captures`, `GET /v1/captures/{id}`, `GET /v1/captures/{id}/status`, `GET /v1/captures/{id}/artifacts/*` |
| `admin` | Manage API keys for the same tenant | `POST /v1/admin/keys`, `GET /v1/admin/keys`, `DELETE /v1/admin/keys/{keyHash}` |

**Design decisions:**

- `capture` implies the ability to read the status of captures you created (via the `statusUrl` returned in the 202). The status and artifact endpoints currently use capture-ID-as-secret (no auth required). This design should remain unchanged -- it allows sharing a capture URL with third parties who don't have API keys. Scoping only applies to the authenticated list endpoint.
- A key with `["capture", "read"]` is the standard operational key. A key with `["capture", "read", "admin"]` is the operator's management key. A key with `["read"]` is a read-only integration key (dashboards, monitoring).
- `admin` scope is tenant-scoped: an admin key for tenant `acme` can only manage keys for tenant `acme`. There is no cross-tenant admin. This is a deliberate constraint -- cross-tenant operations would require a separate superadmin concept that is out of scope.

**Scope checking in handlers:**

`verifyApiKey()` should return scopes in the success result:

```js
{ ok: true, tenantId: 'acme', scopes: ['capture', 'read'] }
```

Each handler checks the required scope immediately after calling `verifyApiKey()`. This is a one-liner, not a middleware:

```js
const auth = await verifyApiKey(request, env);
if (!auth.ok) return auth.response;
if (!auth.scopes.includes('capture')) {
  return problemResponse(403, 'Insufficient scope for this operation');
}
```

**Why 403 and not 401:** The key is valid (authentication succeeded) but lacks the required permission (authorization failed). Using 403 correctly distinguishes "who are you?" from "you can't do that." The 403 response must NOT include `WWW-Authenticate` (that's only for 401). The 403 response must NOT name the missing scope -- that would leak the scope model to attackers probing for privilege escalation vectors.

Wait -- actually, naming the required scope in a 403 is acceptable here because the scope model is not secret (it's documented in the API spec) and it helps legitimate operators debug misconfigured keys. The tradeoff favors usability: `"Insufficient scope: 'capture' required"` is safe to return. An attacker who has a valid key already knows the scope model.

Revised: the 403 detail message should say `"API key does not have the required scope for this operation"` without naming the specific scope. The operator knows what scope is needed from the API documentation. This avoids creating an oracle that confirms which scopes exist to an attacker with a stolen read-only key.

---

#### (d) Admin API bootstrap (chicken-and-egg)

**The bootstrap problem:** How does the first admin key get into KV if the admin API requires an admin key?

**Solution: The `CAPTURE_API_KEY` env-var fallback path (from section b) solves this.**

1. On a fresh deployment, `CAPTURE_API_KEY` is set as a Wrangler secret (as today).
2. The env-var fallback grants `['capture', 'read', 'admin']` scopes to this key.
3. The operator calls `POST /v1/admin/keys` with `Authorization: Bearer {CAPTURE_API_KEY}` to create the first tenant key in KV with explicit scopes.
4. The operator creates additional keys as needed, including a dedicated admin key.
5. The operator removes the `CAPTURE_API_KEY` secret (via `wrangler secret delete CAPTURE_API_KEY`) to close the implicit full-access path.

**There is no separate `ADMIN_KEY` env var.** Adding a second env var doubles the configuration surface and creates confusion about which key does what. The single env var serves as the bootstrap credential, and the admin API is the steady-state management interface.

**Critical security constraint:** The admin API must be tenant-scoped from day one. An admin key for tenant `default` can create/list/revoke keys only for tenant `default`. To onboard a second tenant (`acme`), the `default` tenant's admin must be able to create the first key for tenant `acme`. This requires a narrow cross-tenant privilege.

Actually, re-reading the requirements: "A second operator can use WRL with their own API key." This implies a single WRL deployment serving multiple tenants. Someone has to provision tenant `acme`'s first key. Two options:

**Option A: The env-var fallback is the superadmin.** While `CAPTURE_API_KEY` is set, it can create keys for any tenant. Once removed, no cross-tenant key creation is possible -- new tenants require the operator to re-set the env var temporarily.

**Option B: Add a `tenant-admin` scope and a `super-admin` scope.** `tenant-admin` manages keys within one tenant; `super-admin` manages keys across tenants. This adds complexity.

**Recommendation: Option A.** It aligns with YAGNI and the project's philosophy. The env var is the "break glass" superadmin credential. It is present only when needed (during tenant onboarding) and removed afterward. This is operationally simple and avoids scope explosion. The tradeoff is that onboarding a new tenant requires a `wrangler secret put` round-trip, which is acceptable for single-digit tenants.

Document the bootstrap sequence clearly:

```
1. wrangler secret put CAPTURE_API_KEY    # set bootstrap key
2. POST /v1/admin/keys { tenantId: "acme", scopes: ["capture", "read", "admin"], name: "acme-admin" }
3. wrangler secret delete CAPTURE_API_KEY  # remove bootstrap key
```

**Security implications of this design:**

- The env-var key has implicit cross-tenant admin access. This is acceptable because: (a) it's a secret known only to the Wrangler deployment operator, (b) it's intended to be ephemeral, and (c) the alternative (hardcoded superadmin in KV) has the same trust level.
- When `CAPTURE_API_KEY` is absent and no KV keys exist, the system returns 503 ("Service is not configured") -- fail closed, not fail open.
- Audit logging must capture admin operations (key creation, revocation) with the acting key's hash and tenantId. This is how you detect a compromised bootstrap key being used to provision rogue tenants.

---

#### (e) Key generation

**Server-generated, returned exactly once.**

The admin API generates the key:

```js
// 32 bytes = 256 bits of entropy
const rawBytes = crypto.getRandomValues(new Uint8Array(32));
// Encode as URL-safe base64 (44 chars, no padding)
const rawKey = btoa(String.fromCharCode(...rawBytes))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
```

The SHA-256 hash of `rawKey` (the string, not the bytes) is computed and stored in KV. The raw key is returned in the `POST /v1/admin/keys` response body and never stored or logged.

**Why server-generated, not client-provided:**

1. **Entropy guarantee:** The server controls the RNG. Client-provided keys may have insufficient entropy (human-chosen, sequential, derived from weak PRNGs).
2. **Uniform key format:** All keys have identical length and character set, which simplifies validation and prevents format-based information leakage.
3. **No key-already-exists check needed:** With 256 bits of server-generated randomness, hash collision probability is negligible. Client-provided keys would require a check-then-insert race.
4. **Simpler API contract:** One less field to validate in the request body.

**Response format for key creation:**

```json
{
  "key": "dGhpcyBpcyBhIDMyLWJ5dGUga2V5IGV4YW1wbGU",
  "keyHash": "a1b2c3d4...full-sha256-hex",
  "tenantId": "acme",
  "scopes": ["capture", "read"],
  "name": "production-capturer",
  "createdAt": "2026-03-17T00:00:00.000Z"
}
```

The `key` field appears only in this response. The `keyHash` is the identifier used for revocation and listing (it is safe to display since it cannot be reversed to the raw key).

**CRITICAL:** The `key` field must NEVER appear in logs. The logging layer must strip or redact any response body from admin endpoints before sending to Coralogix.

---

#### (f) Key compromise response: revocation

**Soft-delete via `revoked` flag:**

```
DELETE /v1/admin/keys/{keyHash}
Authorization: Bearer {admin-key}
```

This sets `revoked: true` on the key record in KV. It does NOT delete the KV entry.

**Why soft-delete, not hard-delete:**

1. **Audit trail preservation:** A hard-deleted key leaves no evidence it ever existed. When investigating a breach, you need to see that key X existed, was created on date Y, had scopes Z, and was revoked on date W.
2. **Prevent re-registration:** If the key record is deleted, a hypothetical future bug or race condition could allow the same key hash to be re-registered. The `revoked: true` tombstone prevents this.
3. **Eventual consistency safety:** KV is eventually consistent. A hard delete that hasn't propagated to all edge locations would allow continued access. A `revoked: true` write has the same propagation characteristics, but at least the record exists at all locations -- it's the value that may be stale, not the presence.

**Revocation checking in `verifyApiKey()`:**

```js
const record = await kv.get(`apikey:${keyHash}`, 'json');
if (!record || record.revoked) {
  return { ok: false, response: problemResponse(401, 'Invalid API key', ...) };
}
```

The check is `!record || record.revoked` -- both missing and revoked keys produce identical 401 responses. An attacker cannot distinguish "key never existed" from "key was revoked" from "wrong key." This prevents enumeration.

**KV eventual consistency caveat:**

Cloudflare KV has a propagation delay of up to 60 seconds for writes. After revocation, the compromised key may continue to work for up to 60 seconds at edge locations that haven't received the update. This is an accepted residual risk for this system. Mitigations:

- Rate limiting (per-IP) is the secondary control that limits damage during the consistency window.
- Audit logging captures all authenticated requests, so post-revocation usage is detectable.
- If sub-minute revocation is ever needed, the system would need to move to Durable Objects or an external auth service. Not warranted for MVP.

Document this 60-second window in the operator guide so it's a known limitation, not a surprise.

**Revocation also updates the tenant-keys index:**

When a key is revoked, the `tenant-keys:{tenantId}` array is NOT modified (the hash remains in the list). The listing endpoint checks `revoked` on each key record and either filters them out or marks them as revoked in the response. This avoids a read-modify-write race on revocation.

---

#### (g) Timing-safe comparison with SHA-256 lookup

**The hash-then-lookup pattern eliminates the timing channel. No timing-safe comparison is needed for the KV lookup.**

Here is why:

1. The current timing attack works because `timingSafeEqual(provided, secret)` compares the raw key byte-by-byte. An attacker can infer key bytes from response time variations.
2. In the new design, `verifyApiKey()` computes `SHA-256(providedKey)` and does a KV `get()`. The SHA-256 computation time depends only on input length (constant for fixed-format keys), not on how many bytes match the stored key. The KV lookup is a key-value fetch -- it either finds the key or doesn't. There is no byte-by-byte comparison.
3. The KV lookup returns in variable time due to cache locality, network conditions, etc., but this noise is not correlated with the key value. An attacker cannot extract key bits from KV lookup timing.

**However, the env-var fallback path still needs timing-safe comparison.** The fallback compares the raw provided key against `CAPTURE_API_KEY`. This path retains the existing `crypto.subtle.timingSafeEqual` logic.

**Implementation:**

```js
// KV path: no timing-safe comparison needed
const hash = hex(await crypto.subtle.digest('SHA-256', enc.encode(provided)));
const record = await env.KV.get(`apikey:${hash}`, 'json');
if (record && !record.revoked) {
  return { ok: true, tenantId: record.tenantId, scopes: record.scopes };
}

// Env-var fallback: timing-safe comparison required (existing code)
if (env.CAPTURE_API_KEY) {
  // ... existing timingSafeEqual logic ...
}
```

**Subtlety: the early return when a KV record is found does NOT create a timing channel.** An attacker who submits a random key gets a KV miss (fast) and then falls through to the env-var comparison (slower). An attacker who submits a revoked key gets a KV hit (same speed as valid) and returns 401 without reaching the env-var path (faster than a miss). This timing difference reveals whether a key hash exists in KV, but:

- The key hash is a SHA-256 preimage. Knowing a hash exists in KV provides no information about the raw key.
- An attacker would need to submit the exact raw key to generate the correct hash. If they have the raw key, they don't need a timing oracle.

So the timing difference between KV-hit-revoked and KV-miss is harmless.

---

#### (h) Scope enforcement boundaries

**Recommendation: `verifyApiKey()` returns scopes; each handler checks.**

This is the simplest pattern that fits the existing architecture. The codebase has no middleware layer -- routes dispatch directly to handler functions. Adding a middleware abstraction solely for scope checking would violate KISS and YAGNI.

**Pattern:**

```js
// In verifyApiKey() return type:
{ ok: true, tenantId: string, scopes: string[] }

// In each handler, immediately after auth:
const auth = await verifyApiKey(request, env);
if (!auth.ok) return auth.response;
if (!auth.scopes.includes('capture')) {
  return problemResponse(403, 'API key does not have the required scope for this operation');
}
```

**Why this is better than a middleware pattern:**

1. **Explicit over implicit:** Each handler declares exactly what scope it needs. There's no spooky action at a distance where a route table entry determines authorization.
2. **Matches existing code structure:** The codebase already has `const auth = await verifyApiKey(request, env); if (!auth.ok) return auth.response;` in every handler that requires auth. Adding one more line is minimal friction.
3. **Easy to audit:** A security reviewer can grep for `scopes.includes` and verify every authenticated endpoint checks the right scope. With middleware, you'd have to cross-reference route definitions with middleware configuration.
4. **No framework needed:** A middleware layer would be the first step toward a framework. The project philosophy explicitly avoids this.

**Helper function (optional, for DRY):**

If the boilerplate bothers the implementer, a thin helper is acceptable:

```js
export function requireScope(auth, scope) {
  if (!auth.scopes.includes(scope)) {
    return problemResponse(403, 'API key does not have the required scope for this operation');
  }
  return null; // authorized
}
```

Usage: `const denied = requireScope(auth, 'capture'); if (denied) return denied;`

This keeps the check explicit and in the handler, avoids a middleware abstraction, and reduces the scope check to a one-liner.

**Scope-to-endpoint mapping (for implementation reference):**

| Handler | Required scope |
|---------|---------------|
| `handleCreateCapture` | `capture` |
| `handleListCaptures` | `read` |
| `handleCaptureStatus` | none (capture-ID-as-secret, unauthenticated) |
| `handleGetCapture` | none (capture-ID-as-secret, unauthenticated) |
| `handleGetCaptureArtifact` | none (capture-ID-as-secret, unauthenticated) |
| `handleVerifyCapture` | none (public verification) |
| `handleGetSigningKey(s)` | none (public) |
| `POST /v1/admin/keys` | `admin` |
| `GET /v1/admin/keys` | `admin` |
| `DELETE /v1/admin/keys/{hash}` | `admin` |

The unauthenticated endpoints remain unchanged. Tenant isolation for these endpoints is enforced by the unguessability of the capture ID (128 bits of randomness), not by key scoping.

---

### Proposed Tasks

**Task 1: Extend `verifyApiKey()` with KV lookup and scope return**

- Modify `verifyApiKey()` to accept `env.KV` and perform hash-then-lookup.
- Return `{ ok: true, tenantId, scopes }` on success.
- Retain env-var fallback with timing-safe comparison, returning implicit `['capture', 'read', 'admin']` scopes.
- Revoked keys return 401 (indistinguishable from invalid keys).
- Dependencies: KV namespace binding (already exists in `wrangler.toml`).
- Deliverable: Updated `src/auth.js` with comprehensive tests in `test/auth.test.js` covering KV hit, KV miss + env fallback, revoked key, missing KV + missing env (503).

**Task 2: Add scope enforcement to existing handlers**

- Add scope check to `handleCreateCapture` (requires `capture`).
- Add scope check to `handleListCaptures` (requires `read`).
- Unauthenticated endpoints unchanged.
- Dependencies: Task 1 (scopes returned from `verifyApiKey`).
- Deliverable: Updated `src/index.js` handlers with 403 responses for insufficient scope.

**Task 3: Implement admin API endpoints**

- `POST /v1/admin/keys` -- create a new key (server-generated, 256-bit). Request body: `{ tenantId, scopes, name }`. Response: raw key (once), key hash, metadata. When `CAPTURE_API_KEY` fallback is active, `tenantId` in the request body can be any valid tenant (cross-tenant bootstrap). When authenticated via a KV key with `admin` scope, `tenantId` must match the key's own tenant.
- `GET /v1/admin/keys` -- list keys for the authenticated tenant. Returns key hashes, names, scopes, createdAt, revoked status. Never returns raw keys.
- `DELETE /v1/admin/keys/{keyHash}` -- revoke a key (soft-delete). Only within the authenticated tenant. Cannot revoke the key being used for the request (prevent self-lockout).
- Dependencies: Task 1 (auth with scopes), KV key storage format.
- Deliverable: New routes in `src/index.js`, new `src/admin.js` module, tests.

**Task 4: Rate-limit and security-harden admin endpoints**

- Apply aggressive per-IP rate limiting to admin endpoints (separate rate limiter, lower ceiling -- e.g., 5 requests/minute).
- Audit-log all admin operations to Coralogix (key created, key revoked, scope details, acting key hash).
- Validate all admin request body fields (tenantId format, scope allowlist, name format).
- Dependencies: Task 3.
- Deliverable: Rate limiter binding in `wrangler.toml`, audit log calls in admin handlers.

**Task 5: Operator documentation and bootstrap guide**

- Document the bootstrap sequence (set env var, provision keys, remove env var).
- Document the key revocation procedure and the 60-second consistency window.
- Document scope meanings and recommendations (which scopes for which use case).
- Dependencies: Tasks 1-4 complete.
- Deliverable: Update to README or operator guide.

---

### Risks and Concerns

**Risk 1: KV eventual consistency creates a revocation delay window.**

- Impact: A revoked key continues to work for up to 60 seconds at some edge locations.
- Likelihood: Certain (this is how KV works).
- Mitigation: Accept as a known limitation. Per-IP rate limiting bounds the damage. Audit logs capture post-revocation usage. Document for operators.
- Residual risk: LOW. The 60-second window is short, and an attacker who already has the key can cause limited damage given per-IP rate limits.

**Risk 2: Bootstrap key (`CAPTURE_API_KEY`) left in production after tenant onboarding.**

- Impact: An implicit superadmin credential persists indefinitely, granting cross-tenant admin access.
- Likelihood: Medium-High (operators forget cleanup steps).
- Mitigation: Log a warning on every request that falls through to the env-var path: `"CAPTURE_API_KEY env-var fallback used -- consider provisioning a KV-based key and removing the env var."` This warning in Coralogix logs will remind the operator.
- Alternative mitigation: Add a health check field `{ "authMode": "env-var-fallback" }` that the operator's monitoring can alert on.

**Risk 3: Admin API becomes an IDOR target.**

- Impact: Tenant A's admin key could be used to list/revoke Tenant B's keys if tenant scoping is implemented incorrectly.
- Likelihood: Low if the design is followed (admin scope is tenant-scoped by construction), but implementation bugs happen.
- Mitigation: The admin handlers must extract tenantId from the authenticated key record, never from request parameters (except during bootstrap). Add explicit test cases: "admin key for tenant A cannot list keys for tenant B." This is the most important test in the suite.

**Risk 4: Raw key logged accidentally.**

- Impact: Key compromise via log exposure. Coralogix logs are retained for weeks/months.
- Likelihood: Medium (developer adds logging without thinking about the admin response body).
- Mitigation: The `POST /v1/admin/keys` response must be constructed carefully. The `log()` calls in the handler must explicitly exclude the response body. Consider adding a code comment: `// SECURITY: Never log the response body from this handler -- it contains the raw API key.`

**Risk 5: Self-lockout via key revocation.**

- Impact: Operator revokes their only admin key, loses ability to manage keys. Recovery requires re-setting `CAPTURE_API_KEY` env var via Wrangler.
- Likelihood: Low but non-zero.
- Mitigation: The `DELETE /v1/admin/keys/{keyHash}` handler should refuse to revoke the key being used for the current request. Error: `"Cannot revoke the key used to authenticate this request."` This prevents the most common lockout scenario. The `CAPTURE_API_KEY` env var remains the ultimate recovery path.

**Risk 6: SHA-256 hash used as KV key could collide.**

- Impact: Two different raw keys map to the same KV key, causing one to silently overwrite the other.
- Likelihood: Negligible (2^-128 birthday probability for 256-bit hashes at expected key counts).
- Mitigation: None needed. This is a theoretical concern, not a practical one. For defense-in-depth, the key creation endpoint could check for an existing record at the computed hash and reject with 409 Conflict, but this is optional and should not block the implementation.

**Risk 7: Tenant isolation bypass via capture-ID-as-secret endpoints.**

- Impact: A capture ID from tenant A could be accessed by anyone (including tenant B) via the unauthenticated `GET /v1/captures/{id}` endpoint.
- Likelihood: Certain -- this is the current design (capture ID is the bearer secret for public verification).
- Mitigation: This is BY DESIGN. The capture ID is 128 bits of randomness, making it unguessable. The unauthenticated endpoints serve the public verification use case. The tenant-scoped list endpoint (`GET /v1/captures` with auth) ensures tenants only discover their own captures. An operator who wants to share a capture simply shares the capture URL. Document that capture IDs are effectively access tokens and should be treated as sensitive.

---

### Additional Agents Needed

**edge-minion** -- already involved per the planning question ("edge-minion will address rate limiting changes separately"). Confirm they cover:
- Per-tenant rate limiting (in addition to per-IP) once tenant identity is available in the auth result.
- Separate rate limiter binding for admin endpoints with a lower ceiling.

**None additional beyond what's already planned.** The auth/scope/key-management design is self-contained from a security perspective. The implementation is straightforward Workers + KV code that doesn't require specialized infrastructure (iac-minion) or OAuth flows (oauth-minion).
