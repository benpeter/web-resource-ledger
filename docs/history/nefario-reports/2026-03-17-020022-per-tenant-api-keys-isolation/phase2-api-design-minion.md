## Domain Plan Contribution: api-design-minion

### Recommendations

#### (a) Admin Endpoint Design

Three endpoints under `/v1/admin/keys`, following existing conventions (Bearer auth, RFC 9457 errors, `application/json` content type). A new `admin` tag in the OpenAPI spec groups these operations.

**`POST /v1/admin/keys` -- Create a key**

- operationId: `createAdminKey`
- Authentication: Bearer token with `admin` scope
- Request body:

```json
{
  "tenantId": "acme",
  "name": "production-capture",
  "scopes": ["capture", "read"]
}
```

Field constraints:
- `tenantId`: required, string, pattern `^[a-z0-9_-]{1,64}$` (matches existing `TENANT_ID_RE`)
- `name`: required, string, 1-128 chars, alphanumeric + hyphens + underscores. Human-readable label for the key. Must be unique within the tenant (prevents operational confusion when two keys have the same name).
- `scopes`: required, non-empty array of strings from enum `["capture", "read", "admin"]`

Response (201 Created):

```json
{
  "id": "key_a1b2c3d4e5f6a7b8",
  "tenantId": "acme",
  "name": "production-capture",
  "scopes": ["capture", "read"],
  "key": "wrl_live_a3f8...long-random-string",
  "createdAt": "2026-03-17T10:00:00.000Z"
}
```

Design notes:
- `id` is a short, opaque identifier (first 16 hex chars of the SHA-256 hash of the raw key) used for listing and revocation. It is NOT the full hash stored in KV -- it is a display-safe prefix. The full hash is an internal implementation detail.
- `key` is the raw API key, shown exactly once. The response body is the only place the caller ever sees it. The server stores only the SHA-256 hash. This follows the Stripe/GitHub model where the token is displayed once at creation.
- The key format `wrl_live_` prefix (or `wrl_test_` for staging) makes keys identifiable in logs and secret scanners without revealing the secret itself. 4-char prefix + underscore + environment + underscore + 40 hex chars = predictable format.
- No `Location` header for the created resource because the key ID is embedded in the response body and `GET /v1/admin/keys/{keyId}` would not return the raw key anyway.

**`GET /v1/admin/keys` -- List keys**

- operationId: `listAdminKeys`
- Authentication: Bearer token with `admin` scope
- No query parameters needed initially (key count is single-digit per tenant, low tens across the service). Pagination can be added later if the volume somehow grows.

Response (200):

```json
{
  "data": [
    {
      "id": "key_a1b2c3d4e5f6a7b8",
      "tenantId": "acme",
      "name": "production-capture",
      "scopes": ["capture", "read"],
      "createdAt": "2026-03-17T10:00:00.000Z"
    }
  ]
}
```

Design notes:
- Response envelope uses `data` array, consistent with `GET /v1/captures` list response.
- No `pagination` field initially. If added later, it follows the same `{ cursor, hasMore, limit }` shape from the captures list.
- The raw `key` value is NEVER returned in list responses. It was shown once at creation and is irrecoverable.
- Lists ALL keys across all tenants (admin has global visibility). This is a deliberate choice: the admin scope is a service-operator role, not a tenant-scoped role. The operator needs to see all keys to manage the service. If tenant-scoped admin is ever needed (RBAC, out of scope), that would be a different scope.

**`DELETE /v1/admin/keys/{keyId}` -- Revoke a key**

- operationId: `deleteAdminKey`
- Authentication: Bearer token with `admin` scope
- Path parameter: `keyId` (pattern: `^key_[a-f0-9]{16}$`)

Response (204 No Content) -- no body, consistent with REST semantics for successful deletion.

Error cases:
- 404: Key not found (use static message "API key not found" -- do not echo the keyId)
- 409 Conflict: Attempting to revoke the last admin-scoped key. This prevents lockout. The detail message should be "Cannot revoke the last key with admin scope."

Design notes:
- DELETE is idempotent. Deleting an already-revoked key returns 404 (the resource no longer exists). This is simpler than tracking revocation state.
- The 409 safeguard against revoking the last admin key is critical. Without it, the operator can lock themselves out of the admin API permanently. This does NOT apply to the bootstrap key from `ADMIN_KEY` env var (if that design is chosen by security-minion), only to KV-stored keys.

#### (b) Existing Endpoint Contract Stability

**Confirmation: the v1 API contract remains unbroken.**

Analysis of each existing endpoint:

1. **`POST /v1/captures`** -- No contract change. The request body (`{ url }`) and response schema (`CaptureAccepted`) are unchanged. The only internal change is that `verifyApiKey()` now does KV lookup instead of env var comparison, and it now checks that the key has `capture` scope. From the caller's perspective, they send the same Bearer token and get the same response. A read-only key receiving 403 is new behavior but does not break existing callers (existing callers have `capture` scope).

2. **`GET /v1/captures`** -- No contract change. Already scoped by tenant (R8). The `listCaptures()` function already takes `auth.tenantId` from the verified key. A read-only key should be able to list (see section e).

3. **`GET /v1/captures/{id}`** -- No contract change. See section (c) below.

4. **`GET /v1/captures/{id}/status`** -- No contract change. Currently unauthenticated (status polling by capture ID). R12 does not change this.

5. **`GET /v1/captures/{id}/artifacts/*`** -- No contract change. Currently unauthenticated. R12 does not change this.

6. **`GET /v1/verify/{captureId}`** -- No contract change. Public, unauthenticated.

The one new behavior observable to existing callers: if the existing static key is migrated into KV with `["capture", "read", "admin"]` scopes, all existing calls continue to work. The only new HTTP status code existing callers might encounter is 403 (Forbidden) for scope violations, but this only affects NEW keys created with limited scopes, never the migrated first-tenant key.

#### (c) Capture Retrieval and Tenant Isolation

**Recommendation: `GET /v1/captures/{id}` remains unauthenticated. Capture ID continues to act as the access secret.**

Rationale:
- The current model treats capture IDs as capability tokens (128-bit entropy, unguessable). This is documented in the OpenAPI spec: "Capture ID also serves as the access secret for per-capture access."
- Adding auth to this endpoint would break the v1 contract (currently no `401` response documented for this path).
- The use case for unauthenticated capture access is legitimate: sharing a capture URL with a third party who does not have an API key (e.g., sending a capture link to a client, embedding in a report).
- Tenant isolation is enforced at the data plane: captures are tagged with `tenantId` at creation, and the list endpoint filters by tenant. A caller with tenant A's key cannot discover tenant B's capture IDs through the list endpoint. Direct access by capture ID is a knowledge-based access control -- you can only access what you know exists.

The status endpoint (`GET /v1/captures/{id}/status`) and artifact endpoints follow the same model -- no change.

**Where tenant isolation IS enforced:**
- `GET /v1/captures` (list) -- already scoped by `auth.tenantId` via the `tenant:{tenantId}:ts:` KV prefix. Only tenant's own captures appear.
- `POST /v1/captures` -- the created capture is tagged with the authenticated tenant's ID.

**Where tenant isolation is NOT enforced (by design):**
- `GET /v1/captures/{id}` -- access by capture ID, no auth required
- `GET /v1/captures/{id}/status` -- polling by capture ID, no auth required
- `GET /v1/captures/{id}/artifacts/*` -- artifact download by capture ID, no auth required
- `GET /v1/verify/{id}` -- public verification

This is the correct split. The list endpoint is the enumeration surface and must be tenant-scoped. The individual capture endpoints are capability-based and do not need tenant checks.

#### (d) Error Responses for Scope Violations

One new HTTP status code: **403 Forbidden**.

This is used when a key is authenticated (valid key, valid tenant) but lacks the required scope for the requested operation. This is distinct from 401 (key is invalid or missing).

The `responses.js` titles map already has `403: 'Forbidden'`, so no infrastructure change is needed.

**New problem details:**

| Situation | Status | Detail |
|-----------|--------|--------|
| Read-only key calls `POST /v1/captures` | 403 | "This API key does not have the 'capture' scope required for this operation." |
| Non-admin key calls `POST /v1/admin/keys` | 403 | "This API key does not have the 'admin' scope required for this operation." |
| Non-admin key calls `DELETE /v1/admin/keys/{id}` | 403 | "This API key does not have the 'admin' scope required for this operation." |
| Non-admin key calls `GET /v1/admin/keys` | 403 | "This API key does not have the 'admin' scope required for this operation." |
| Revoke last admin key | 409 | "Cannot revoke the last key with admin scope." |

Design notes:
- The 403 detail message names the missing scope. This is actionable: the caller knows which scope to request from their admin. It does not leak other information about the key (no tenantId, no key name).
- The `type` field remains `about:blank` per existing convention. Clients switch on `status` (403), not `type`.
- 403 responses do NOT include `WWW-Authenticate` header (that is only for 401).
- A new `Problem403` response component should be added to the OpenAPI spec for reuse.

#### (e) Scoping Interaction with List Endpoint

**Recommendation: `GET /v1/captures` requires `read` scope (not `capture`).**

Scope-to-endpoint mapping:

| Scope | Grants |
|-------|--------|
| `read` | `GET /v1/captures` (list), `GET /v1/captures/{id}` (but that endpoint is unauthed anyway) |
| `capture` | `POST /v1/captures` (implies `read` -- see below) |
| `admin` | `POST /v1/admin/keys`, `GET /v1/admin/keys`, `DELETE /v1/admin/keys/{id}` |

**`capture` scope implies `read`**: A key with `["capture"]` can both create captures and list them. This is a usability decision -- it would be confusing if a key that can create captures cannot list them. The alternative (requiring `["capture", "read"]` explicitly) adds no security value and increases operational friction. Implementation: the scope check for `GET /v1/captures` should be `scopes.includes('read') || scopes.includes('capture')`.

A key with `["read"]` only can list captures (and directly access individual captures by ID, though that is unauthed). It cannot create new captures. This supports the use case of a monitoring system that checks capture status without being able to trigger new captures.

`admin` does NOT imply `capture` or `read`. Admin keys are for key management, not capture operations. If an operator wants a key that does everything, they assign all three scopes: `["capture", "read", "admin"]`. This follows the principle of least privilege and prevents accidental creation of god-keys when only key management was intended.

#### (f) Admin Endpoint Rate Limiting (API Contract)

**Recommendation: Admin endpoints return the same rate limit headers as capture endpoints, but with separate limits.**

Headers on admin endpoint responses:
- `X-RateLimit-Limit`: Maximum allowed requests per window (e.g., 10/minute for admin)
- `Retry-After`: Present on 429 responses, in seconds

The admin rate limit should be tight: key provisioning is a low-frequency operation. 10 requests per minute per IP is reasonable. This prevents brute-force key discovery attempts against the admin API. Edge-minion should advise on whether this requires a separate Cloudflare rate limiter binding or can reuse an existing one.

429 responses from admin endpoints follow the same RFC 9457 schema as existing 429 responses. No new error format needed.

Admin endpoints should NOT share the `CAPTURE_RATE_LIMITER` binding -- capturing and key management are operationally independent. An operator provisioning keys should not be rate-limited by capture traffic, and vice versa.

### Proposed Tasks

**Task 1: Add admin tag and 403 response component to OpenAPI spec**
- Add `admin` tag with description "API key management"
- Add `Problem403` response component (mirrors existing `Problem401` structure)
- Add `ApiKeyCreated`, `ApiKeySummary` schemas to components
- Deliverable: Updated `openapi.yaml` with new components (no paths yet)
- Dependencies: None

**Task 2: Add admin endpoint paths to OpenAPI spec**
- Add `POST /v1/admin/keys` path with `createAdminKey` operationId
- Add `GET /v1/admin/keys` path with `listAdminKeys` operationId
- Add `DELETE /v1/admin/keys/{keyId}` path with `deleteAdminKey` operationId
- Add 403 responses to `POST /v1/captures` and `GET /v1/captures` paths
- Deliverable: Complete OpenAPI spec for R12 admin surface
- Dependencies: Task 1, security-minion's scope model (to confirm scope names)

**Task 3: Implement admin endpoint route handlers in index.js**
- Add route entries for the three admin endpoints
- Implement `handleCreateKey`, `handleListKeys`, `handleDeleteKey` handlers
- Scope check at the top of each handler: verify `admin` in `auth.scopes`
- Deliverable: Working admin endpoint handlers
- Dependencies: Security-minion's `verifyApiKey()` rewrite (must return scopes), KV key storage functions from kv.js

**Task 4: Add 403 scope check to `POST /v1/captures`**
- After `verifyApiKey()` succeeds, check `auth.scopes` includes `capture`
- Return 403 if scope is missing
- Deliverable: Scope-enforced capture creation
- Dependencies: Security-minion's `verifyApiKey()` rewrite

**Task 5: Add scope check to `GET /v1/captures`**
- After `verifyApiKey()` succeeds, check `auth.scopes` includes `read` or `capture`
- Return 403 if neither scope is present
- Deliverable: Scope-enforced capture listing
- Dependencies: Security-minion's `verifyApiKey()` rewrite

**Task 6: Key format and ID generation**
- Define key format: `wrl_live_` + 40 hex chars (from `crypto.getRandomValues`)
- Define key ID format: `key_` + first 16 hex chars of SHA-256(raw key)
- The key prefix (`wrl_live_` vs `wrl_test_`) is determined by an env var or convention, not hardcoded
- Deliverable: Key generation utility function
- Dependencies: Agreement with security-minion on key format and hash scheme

### Risks and Concerns

**Risk 1: Key ID collision in display prefix**
Using the first 16 hex chars of SHA-256 as the key ID gives 64 bits of entropy. With single-digit keys, collision probability is negligible. But the design should explicitly handle the (vanishingly unlikely) case where two keys produce the same 16-char prefix. Recommendation: at creation time, check if the key ID already exists. If it does, reject with 409 Conflict and regenerate (let the caller retry). This costs one KV read and eliminates the edge case.

**Risk 2: Admin lockout**
The 409 safeguard on `DELETE /v1/admin/keys/{keyId}` prevents revoking the last admin key. But this only works if the system correctly counts admin keys. The count must include the bootstrap env-var key if the fallback design retains it. If the env var is removed after migration and all KV-stored admin keys are revoked, the operator is locked out. Security-minion and iac-minion should coordinate on whether the env var fallback is permanent or transitional.

**Risk 3: Scope naming coordination**
The scope names (`capture`, `read`, `admin`) must be identical between this API design and security-minion's auth module. If security-minion chooses different names (e.g., `write` instead of `capture`, or `list` instead of `read`), the OpenAPI spec and handler code will be wrong. Recommendation: lock scope names early in the planning phase before parallel implementation begins.

**Risk 4: CORS for admin endpoints**
Admin endpoints should NOT have CORS headers. They are server-to-server only. The current CORS handling in `index.js` is scoped to `POST /v1/captures` -- verify that admin routes do not accidentally inherit CORS response headers from the global response pipeline. The current code only sets CORS on `POST /v1/captures`, so this should be safe, but it warrants a test.

**Risk 5: Key display in list endpoint across tenants**
The `GET /v1/admin/keys` list shows keys for ALL tenants. If a future use case requires tenant-scoped admin (a tenant admin who can only manage their own keys), this design would need a breaking change. The current issue explicitly excludes RBAC beyond read/write, so this is acceptable for now, but worth flagging.

**Risk 6: No key rotation mechanism**
The design provides create and revoke but no rotate (atomic create-new + revoke-old). Rotation requires two API calls with a window where both keys are valid. This is acceptable for the current scale (single-digit keys, manual operator management), but a `POST /v1/admin/keys/{keyId}/rotate` endpoint may be needed later. Not in R12 scope.

### Additional Agents Needed

None. The current team (security-minion, api-design-minion, edge-minion, iac-minion, observability-minion) covers all aspects of this feature. The api-spec-minion would normally author the OpenAPI spec from this design, but that can be handled during execution by the implementing agent following this design document.
