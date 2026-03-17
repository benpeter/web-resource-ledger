# API Design Specialist Contribution

## Summary

Design the request/response contracts for the three admin key management endpoints (`POST /v1/admin/keys`, `GET /v1/admin/keys`, `DELETE /v1/admin/keys/{keyHash}`), ensuring consistency with existing WRL v1 patterns: RFC 9457 problem responses via `application/problem+json`, `application/json` success bodies, Bearer auth, cursor-based pagination, and the established operationId naming convention.

---

## Recommendations

### 1. POST /v1/admin/keys -- Create a key

**Request:**

```
POST /v1/admin/keys
Authorization: Bearer {ADMIN_KEY}
Content-Type: application/json

{
  "tenantId": "acme-corp",
  "scopes": ["capture"],
  "name": "production-capture-key"
}
```

Field contracts:
- `tenantId` (string, required): Must match `/^[a-z0-9_-]{1,64}$/` (same regex as `TENANT_ID_RE` in auth.js and kv.js). This is enforced server-side; the admin caller picks the tenant identifier.
- `scopes` (array of strings, required, non-empty): Each element must be one of `"capture"`, `"read"`, `"admin"`. At least one scope required. Duplicates silently deduplicated. The `"capture"` scope implicitly grants `"read"` -- this is enforced at authorization time, not at storage time (store exactly what was requested; the implication is a runtime rule).
- `name` (string, required): Human-readable label, 1-128 characters, `/^[\x20-\x7E]{1,128}$/` (printable ASCII). Used in audit logs and GET listings. Must be non-empty.

**Response (201 Created):**

```json
{
  "key": "wrl_live_dGhpcyBpcyBhIHRlc3Qga2V5IGZvciBkZW1v",
  "keyHash": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2",
  "tenantId": "acme-corp",
  "scopes": ["capture"],
  "name": "production-capture-key",
  "createdAt": "2026-03-17T14:30:00.000Z"
}
```

Field semantics:
- `key` (string): The raw API key with `wrl_live_` prefix, base64url-encoded 256-bit random value. **Displayed exactly once.** This is the only response that ever contains the raw key. The response body explicitly calls this out with no additional "warning" field -- the contract itself is the documentation.
- `keyHash` (string): SHA-256 hex digest of the raw key. This is the stable identifier used in GET listings and DELETE paths. 64 hex characters.
- `tenantId`, `scopes`, `name`, `createdAt`: Echo back the stored values.

No `Location` header is needed because the key's canonical resource path uses `keyHash`, which is already in the response body. However, for strict REST convention, include `Location: /v1/admin/keys/{keyHash}` -- but note there is no individual GET endpoint for a single key. I recommend **not** adding a `Location` header since there is no `GET /v1/admin/keys/{keyHash}` endpoint (YAGNI). If one is needed later, add it then.

**Error responses:**
- 400: Missing required fields, invalid tenantId format, invalid scope values, empty scopes array, name too long or empty. Use the existing `problemResponse(400, detail)` pattern with specific detail messages per validation failure (one at a time, first-failure-wins, consistent with how `handleCreateCapture` validates).
- 401: Missing or malformed Authorization header. Same WWW-Authenticate: Bearer pattern.
- 403: Valid key but not an admin key. Detail: `"This operation requires admin scope."` (see section 5 below).
- 415: Content-Type not application/json. Same pattern as capture endpoint.
- 429: Admin rate limit exceeded. Detail: `"Rate limit exceeded. Try again later."` with `Retry-After: 60`.

**operationId:** `createAdminKey`

### 2. GET /v1/admin/keys -- List keys

**Request:**

```
GET /v1/admin/keys?tenant=acme-corp&limit=20&cursor=eyJrdiI6...
Authorization: Bearer {ADMIN_KEY}
```

Query parameters:
- `tenant` (string, optional): Filter by tenantId. When omitted, returns keys for all tenants (the caller holds ADMIN_KEY, so cross-tenant visibility is expected). Use `tenant` not `tenantId` as the query parameter name -- query params conventionally use shorter names.
- `limit` (integer, optional, default 20, max 100, min 1): Same validation as `listCaptures`. Values above 100 silently clamped; values below 1 or non-integers return 400.
- `cursor` (string, optional): Opaque pagination cursor from previous response. Same base64url-wrapped KV cursor pattern as `listCaptures`.

**Do NOT support filtering by scope.** Key count per deployment will be single-digit to low double-digit. Scope filtering adds implementation complexity for no real benefit at this scale. If the admin needs to find keys with specific scopes, they can filter client-side. YAGNI.

**Response (200 OK):**

```json
{
  "data": [
    {
      "keyHash": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2",
      "tenantId": "acme-corp",
      "scopes": ["capture"],
      "name": "production-capture-key",
      "createdAt": "2026-03-17T14:30:00.000Z",
      "createdBy": "admin"
    }
  ],
  "pagination": {
    "cursor": null,
    "hasMore": false,
    "limit": 20
  }
}
```

Field semantics:
- `keyHash`: The SHA-256 hex identifier. **Never** include the raw key or any prefix of it.
- `tenantId`, `scopes`, `name`, `createdAt`: Direct from KV record.
- `createdBy`: String identifying who created the key (always `"admin"` for now -- the ADMIN_KEY holder. Future: could distinguish individual admin users).
- `revoked`: **Not present by default.** See section 6 below.

Use the same `{ data, pagination }` envelope as `CaptureListResponse`. Same `Pagination` schema (`cursor`, `hasMore`, `limit`). This is critical for consistency -- any client that knows how to paginate captures already knows how to paginate keys.

**Error responses:** 400 (invalid params), 401, 403, 429. Same patterns.

**operationId:** `listAdminKeys`

**Cache-Control:** `private, no-store` (same as `listCaptures` -- tenant-scoped data).

### 3. DELETE /v1/admin/keys/{keyHash} -- Revoke a key

**Request:**

```
DELETE /v1/admin/keys/a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2
Authorization: Bearer {ADMIN_KEY}
```

Path parameter:
- `keyHash` (string, required): SHA-256 hex digest, must match `/^[a-f0-9]{64}$/`.

**Response (200 OK, not 204):**

I recommend 200 with a body rather than 204 No Content, diverging slightly from pure REST convention. Rationale: the operation is a soft-delete (sets `revoked: true`), not a physical removal. Returning the final state of the key record confirms what happened and is more useful for audit logging by the caller. This is consistent with how Stripe handles deletions (`{ "id": "...", "deleted": true }`).

```json
{
  "keyHash": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2",
  "tenantId": "acme-corp",
  "scopes": ["capture"],
  "name": "production-capture-key",
  "createdAt": "2026-03-17T14:30:00.000Z",
  "revoked": true,
  "revokedAt": "2026-03-17T15:45:00.000Z"
}
```

**Idempotency:** Deleting an already-revoked key returns 200 with the same body (already revoked). This is the correct idempotent behavior for DELETE -- the postcondition "key is revoked" is satisfied regardless of prior state.

**Error responses:**
- 401: Missing/malformed auth.
- 403: Valid key but not admin.
- 404: No key record exists for this hash. Detail: `"API key not found."` Use existing static-message pattern (do not echo the hash back).
- 429: Admin rate limit exceeded.

**operationId:** `revokeAdminKey`

Note: the operationId is `revokeAdminKey` not `deleteAdminKey` because the HTTP method is DELETE but the semantic action is revocation (soft-delete). The operationId should describe what actually happens so SDK methods are clear: `client.admin.keys.revoke(keyHash)` reads better than `client.admin.keys.delete(keyHash)` when the key record persists.

### 4. Scope implication: "capture implies read"

**Store exactly what was requested; enforce the implication at runtime.**

The KV record stores `scopes: ["capture"]` exactly as provided in the POST request. The auth middleware enforces the rule that `capture` implies `read` when checking authorization. This means:

- A key created with `scopes: ["capture"]` is stored with `scopes: ["capture"]`.
- When `GET /v1/captures` checks scope, the auth layer sees `["capture"]` and allows it because `capture` implies `read`.
- `GET /v1/admin/keys` returns `scopes: ["capture"]` -- what was actually stored.

This is the correct design because:
1. The stored scopes are a fact about what was requested. The implication rule is a policy that could change.
2. If the rule is ever revoked (capture no longer implies read), no data migration is needed.
3. Clients see exactly what they asked for, which is least surprising.

The auth module should implement a helper like:

```javascript
function hasScope(grantedScopes, requiredScope) {
  if (grantedScopes.includes(requiredScope)) return true;
  // capture implies read
  if (requiredScope === 'read' && grantedScopes.includes('capture')) return true;
  return false;
}
```

This keeps the implication logic in one place. Every authorization check calls `hasScope(keyRecord.scopes, 'read')` rather than manually checking for `capture` as a fallback.

### 5. 403 responses naming the required scope

Per the advisory decision: "403 responses name the required scope (scope model is public)."

The detail message in 403 problem responses should name the specific scope needed. Format:

```json
{
  "type": "about:blank",
  "status": 403,
  "title": "Forbidden",
  "detail": "This operation requires 'capture' scope."
}
```

The pattern is: `"This operation requires '{scope}' scope."` where `{scope}` is one of `capture`, `read`, `admin`.

This is safe because:
- The scope model is explicitly public (advisory decision).
- The detail message is human-readable per RFC 9457 convention.
- Clients should switch on `status` (403), not parse the detail string -- but the detail helps developers debug quickly.
- The 403 title `"Forbidden"` is already in the titles map in `responses.js`.

For endpoints requiring `read` scope, the message says `'read' scope` even though a `capture`-scoped key would also be allowed (via the implication rule). The message names the minimum required scope, not all sufficient scopes. This avoids confusing messages like "requires 'read' or 'capture' scope" and keeps it simple.

### 6. Revoked keys in GET responses

**Exclude revoked keys by default. Require `?include=revoked` to see them.**

Rationale:
- The primary use case for `GET /v1/admin/keys` is "show me what keys are active." Including revoked keys by default pollutes the listing with noise.
- An explicit opt-in filter is safer than opt-out. An operator listing keys to audit active access should not need to remember to filter.
- This is the pattern used by Stripe (`GET /v1/api_keys?status=active` is the default view).

Implementation:
- `GET /v1/admin/keys` -- returns only non-revoked keys.
- `GET /v1/admin/keys?include=revoked` -- returns all keys, with revoked keys having `revoked: true` and `revokedAt` fields present.

The `include=revoked` parameter is a simple boolean presence check, not a complex filter syntax. If the param is present (any value, including `?include=revoked` with no `=` or `?include=revoked=true`), include revoked keys. If absent, exclude them.

When revoked keys appear in the response, the object shape gains two fields:
- `revoked` (boolean): `true` for revoked keys, absent (not `false`) for active keys. This follows the existing WRL pattern of conditional fields (like `completedAt` only present on complete captures).
- `revokedAt` (string, date-time): ISO 8601 timestamp. Present only when `revoked` is true.

### Additional design notes

**New tag:** Add an `admin` tag to the OpenAPI spec for the three new endpoints. This groups them separately from `captures`, `verification`, and `signing`.

**Security scheme:** The admin endpoints use the same `bearerAuth` security scheme as capture endpoints, but the auth module must distinguish between admin keys and tenant keys. The ADMIN_KEY env var is checked first for admin endpoints. The OpenAPI spec should document this in the description but use the same `bearerAuth` reference (one scheme, different credentials depending on endpoint).

**Admin rate limiter:** The advisory specifies a dedicated `ADMIN_RATE_LIMITER` binding at 5/min, rate check *before* auth. This means:
- Rate limiting on admin endpoints uses IP-based limiting (same as other endpoints).
- The rate check happens before the Bearer token is validated, preventing key-guessing brute force from bypassing rate limits.
- The `X-RateLimit-Limit` header reports `5` on admin endpoint responses.
- `Retry-After: 60` on 429 responses (consistent with capture endpoint).

**Key format validation in path:** The `{keyHash}` path parameter must be validated as a 64-character hex string. Use regex in the route pattern: `/^\/v1\/admin\/keys\/([a-f0-9]{64})$/`. Invalid formats get the standard 404 ("The requested resource does not exist.") -- do not return a specific "invalid hash format" error, as that would distinguish "invalid format" from "valid format but not found," which is unnecessary information disclosure.

**No CORS on admin endpoints.** Admin endpoints are called from server contexts (scripts, CLI wrappers), never from browsers. Do not add CORS headers. Do not add OPTIONS preflight handlers.

---

## Proposed Tasks

1. **Define OpenAPI schemas for admin endpoints** -- Add `AdminKeyCreate` (request body), `AdminKeyCreated` (201 response), `AdminKeySummary` (list item), `AdminKeyListResponse` (paginated list) schemas to `components/schemas`. Add `Problem403` to `components/responses`. Add `admin` tag. *Estimated: api-spec-minion task after contract is approved.*

2. **Implement POST /v1/admin/keys handler** -- Parse and validate request body (tenantId, scopes, name), generate 256-bit key with `wrl_live_` prefix, SHA-256 hash, write to KV as `apikey:{sha256hex}`, return 201 with raw key. Must enforce Content-Type, admin auth, admin rate limit (before auth).

3. **Implement GET /v1/admin/keys handler** -- List KV keys with prefix `apikey:`, fetch each record, apply tenant filter if `?tenant=` present, exclude revoked unless `?include=revoked`, paginate using same cursor pattern as listCaptures. Return `{ data, pagination }`.

4. **Implement DELETE /v1/admin/keys/{keyHash} handler** -- Read KV record, set `revoked: true` and `revokedAt`, write back, return 200 with final state. Idempotent for already-revoked keys. 404 for nonexistent keys.

5. **Refactor auth module for KV-based key lookup** -- Replace `CAPTURE_API_KEY` comparison with: (a) extract Bearer token, (b) SHA-256 hash it, (c) `kv.get("apikey:{hash}")`, (d) check revoked, (e) return `{ ok: true, tenantId, scopes }`. Maintain `CAPTURE_API_KEY` as legacy fallback for `default` tenant during migration.

6. **Add scope checking to existing endpoints** -- `POST /v1/captures` requires `capture` scope. `GET /v1/captures` requires `read` scope (satisfied by either `read` or `capture` via implication). Admin endpoints require `admin` scope (or ADMIN_KEY env var). Implement `hasScope()` helper.

7. **Add admin auth helper** -- Separate function for admin endpoint authentication that checks ADMIN_KEY env var first, then falls through to KV lookup requiring `admin` scope. This keeps the admin auth path distinct from tenant auth.

8. **Register admin routes in index.js** -- Add three route entries to the `routes` array, with the admin rate limiter and no CORS handling.

---

## Risks and Concerns

### Risk 1: KV list performance for GET /v1/admin/keys

KV `list()` with prefix `apikey:` returns all keys (active and revoked). At small scale (tens of keys) this is fine. At hundreds+ of keys, the N+1 pattern (list keys, then get each record) becomes slow. **Mitigation:** This is explicitly not a concern for the current scale (advisory says key count is low). If it becomes an issue, add a secondary index (`admin-keys:{tenantId}:{keyHash}`) similar to the tenant capture index. Do not build this now (YAGNI).

### Risk 2: Eventual consistency on revocation

KV has 60s eventual consistency. A revoked key may remain valid for up to 60 seconds. The advisory explicitly accepts this. **The API contract should not promise instant revocation.** Document this in the OpenAPI description for DELETE: "Revocation takes effect within 60 seconds due to distributed propagation."

### Risk 3: Key enumeration via timing on GET /v1/admin/keys

GET /v1/admin/keys is protected by admin auth and rate limiting (5/min). The risk surface is limited to someone who already has admin access. **No additional mitigation needed.**

### Risk 4: ADMIN_KEY rotation

If the `ADMIN_KEY` wrangler secret is rotated, all admin operations are locked out until redeployed. There is no second admin key or backup path. **Mitigation:** Document in the migration runbook that `ADMIN_KEY` should be stored in a secure location outside the deployment. Consider supporting multiple admin keys in future if needed (but not now -- YAGNI).

### Risk 5: No pagination index for admin keys

Unlike captures which have a `tenant:{id}:ts:{ISO}:{captureId}` secondary index, API keys are listed by scanning the `apikey:` prefix. KV `list()` returns keys in lexicographic order (by SHA-256 hash), not chronological order. This means the listing order is effectively random. **Recommendation:** Accept this for now. Key listings are for admin auditing, not user-facing browsing. If chronological order matters later, add a secondary index. **Alternative considered:** Adding a `admin-keys:ts:{createdAt}:{keyHash}` index. Rejected as YAGNI -- the key count is small enough that unordered listing is acceptable.

### Risk 6: Schema naming collision

The new schemas (`AdminKeyCreate`, `AdminKeySummary`, etc.) need distinct names that don't collide with existing schemas. The `Admin` prefix provides clear namespacing. No collision risk with current schemas (`CaptureId`, `CaptureRecord`, `CaptureSummary`, etc.).

---

## Additional Agents Needed

- **security-minion**: Should review the final auth flow design, particularly: (a) the ADMIN_KEY comparison path (timing-safe?), (b) the KV key lookup path (is SHA-256 of the raw key sufficient as the lookup key, or should we use HMAC with a server-side secret?), (c) the scope checking logic (can `hasScope` be bypassed?), (d) rate-limit-before-auth on admin endpoints as brute-force protection.

- **api-spec-minion**: After this design is approved, they should author the OpenAPI spec additions (schemas, paths, examples, error responses) following the conventions documented here. The existing spec is thorough and well-structured; the new admin section should match its quality level.

---

## Appendix: Complete endpoint summary

| Endpoint | Method | Auth | Rate Limiter | operationId | Success | Tag |
|---|---|---|---|---|---|---|
| `/v1/admin/keys` | POST | ADMIN_KEY or admin-scoped key | ADMIN_RATE_LIMITER (5/min, before auth) | createAdminKey | 201 | admin |
| `/v1/admin/keys` | GET | ADMIN_KEY or admin-scoped key | ADMIN_RATE_LIMITER (5/min, before auth) | listAdminKeys | 200 | admin |
| `/v1/admin/keys/{keyHash}` | DELETE | ADMIN_KEY or admin-scoped key | ADMIN_RATE_LIMITER (5/min, before auth) | revokeAdminKey | 200 | admin |

## Appendix: Schema reference for new types

**AdminKeyCreateRequest:**
```
{
  tenantId: string (required, pattern: ^[a-z0-9_-]{1,64}$),
  scopes: string[] (required, non-empty, items: enum [capture, read, admin]),
  name: string (required, 1-128 chars, printable ASCII)
}
```

**AdminKeyCreated (201 response):**
```
{
  key: string (wrl_live_ prefix, base64url, one-time display),
  keyHash: string (64 hex chars, SHA-256 of key),
  tenantId: string,
  scopes: string[],
  name: string,
  createdAt: string (date-time)
}
```

**AdminKeySummary (list item):**
```
{
  keyHash: string (64 hex chars),
  tenantId: string,
  scopes: string[],
  name: string,
  createdAt: string (date-time),
  createdBy: string,
  revoked?: true (present only when revoked, only with ?include=revoked),
  revokedAt?: string (date-time, present only when revoked)
}
```

**AdminKeyRevoked (DELETE response):**
```
{
  keyHash: string (64 hex chars),
  tenantId: string,
  scopes: string[],
  name: string,
  createdAt: string (date-time),
  revoked: true,
  revokedAt: string (date-time)
}
```

**AdminKeyListResponse:**
```
{
  data: AdminKeySummary[],
  pagination: Pagination (reuse existing schema)
}
```
