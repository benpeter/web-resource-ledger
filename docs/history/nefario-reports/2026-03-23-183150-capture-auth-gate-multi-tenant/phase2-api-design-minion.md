# Domain Plan Contribution: api-design-minion

## Recommendations

### (a) POST /v1/captures/{id}/share -- Request and Response Design

**Request body:**

```json
{
  "expiresIn": 86400
}
```

Use `expiresIn` (integer, seconds) rather than `expiresAt` (ISO timestamp). Rationale:

- **Clock skew immunity.** Clients do not need synchronized clocks. `expiresAt` with a timestamp in the past is a confusing error case. Duration-in-seconds is unambiguous.
- **Consistency.** The existing API already uses seconds for similar concepts (`Retry-After` headers, rate limit reset values).
- **Simplicity.** One field, one type, one meaning. No need for the server to reconcile `expiresIn` vs `expiresAt` vs `permanent` as competing fields.

**Rules:**
- `expiresIn` is optional. When omitted, the token does not expire (permanent share).
- When present, must be a positive integer. Minimum: 300 (5 minutes). Maximum: 31536000 (365 days). Reject values outside this range with 400.
- Do NOT add a `permanent: true` flag. Omitting `expiresIn` is the permanent case. A boolean `permanent` field creates ambiguity when both `permanent: true` and `expiresIn: 3600` are sent. One field, one behavior.

**Response (201 Created):**

```json
{
  "token": "wrl_share_<43 URL-safe random chars>",
  "shareUrl": "https://wrl.benpeter.workers.dev/v1/captures/cap_abc123?token=wrl_share_...",
  "expiresAt": "2026-03-24T12:00:00.000Z"
}
```

- `token`: The raw share token value. Prefixed `wrl_share_` for greppability and to distinguish from API keys (`wrl_live_`). 256+ bits of entropy from `crypto.getRandomValues`, base64url-encoded.
- `shareUrl`: Full absolute URL the tenant can hand to a third party. Includes the token as a query parameter. Eliminates consumer guesswork about how to use the token.
- `expiresAt`: ISO 8601 timestamp. `null` when permanent. Server-computed (not echoing client input).

**Why 201 and not 200:** A share token is a created resource (a new record in the database). 201 is semantically correct. No `Location` header needed because the share token is not itself a resource with its own URL.

**Auth:** Requires tenant authentication (API key with `read` scope or session). The tenant must own the capture. Cross-tenant share creation returns 404 (same as retrieval -- no information leak about capture existence).

**Capture must exist and be complete:** Return 404 if the capture does not exist, is not owned by the tenant, or is not in `complete` status. Do not allow sharing pending or failed captures.

### (b) Share Token Delivery on Retrieval Endpoints

**Parameter name: `token`**

Pass the share token as a query parameter: `?token=wrl_share_...`

This is the right choice for several reasons:

1. **Shareability.** The entire URL can be copy-pasted, bookmarked, or sent via email/chat. No client needs to understand HTTP headers.
2. **Consistency with the issue spec.** The issue already calls out `?token=xxx`.
3. **WACZ download compatibility.** The verify CLI fetches `/v1/captures/{id}/artifacts/wacz` as a plain HTTP GET. Query parameters flow through without any code changes on the CLI side -- the tenant just hands over the full `shareUrl` and the CLI appends `/artifacts/wacz`.
4. **CDN/caching safety.** The `Cache-Control: private, no-store` headers on capture metadata endpoints already prevent caching token-bearing responses. Artifact endpoints use `public, immutable` -- but since the share token only gates the D1 lookup (not the R2 fetch), the cache key naturally varies by query string.

**Parameter name rationale:** `token` is short, obvious, and standard. Alternatives considered and rejected:
- `share_token`: verbose; the `wrl_share_` prefix already identifies it
- `access_token`: overloaded OAuth semantics; confusing alongside `Authorization: Bearer`
- `key`: ambiguous with API keys

**Auth resolution order in retrieval handlers:**

```
1. Check for ?token= query parameter -> share token path
2. Check for Authorization header or session cookie -> tenant auth path (existing verifyAuth)
3. Neither present -> 401
```

Share token and tenant auth are mutually exclusive resolution paths. If `?token=` is present, do NOT also check `Authorization`. This prevents confusing interactions (e.g., token grants access but API key belongs to a different tenant).

**Token propagation to sub-resources:** When a share token grants access to `GET /v1/captures/{id}`, the response body's `artifacts` URLs must include the same `?token=` parameter. This is critical -- if the metadata response returns `artifacts.screenshot: ".../artifacts/screenshot"` without the token, the client gets a 401 when following the link. The `shareUrl` in `handleGetCapture` must thread the token through to all artifact URLs.

### (c) GET /v1/captures/{id} Response Shape -- Share Metadata

**Keep it lean. Do not include share token metadata in the capture response.**

Rationale:

1. **Separation of concerns.** The capture resource represents the captured web page and its artifacts. Share tokens are an access control mechanism, not a property of the capture itself.
2. **Security.** Listing active share tokens (with their raw values or expiry times) in the capture response exposes access control state to anyone with read access. A compromised read-only API key could enumerate all share URLs.
3. **Performance.** An additional D1 query per capture retrieval to list share tokens adds latency to the hot path for zero benefit in the common case.
4. **YAGNI.** The issue scope explicitly excludes share token revocation and analytics. A share token listing endpoint can be added later if needed (e.g., `GET /v1/captures/{id}/shares`) without changing the capture response shape.

**If share management endpoints are needed later**, add them as a sub-resource:
- `GET /v1/captures/{id}/shares` -- list active share tokens (tenant-authed)
- `DELETE /v1/captures/{id}/shares/{tokenId}` -- revoke a specific share token

This follows the existing pattern (captures have sub-resources: `/status`, `/artifacts/{type}`).

### (d) Cross-Tenant Access: 404 vs 403 -- Intentional Ambiguity

**Return 404 for both "does not exist" and "you don't have access". This is deliberate and should be documented as such.**

The existing handlers already return 404 for missing captures. The auth gate adds a new case: capture exists but belongs to a different tenant. Both must return identical 404 responses.

**Why this is correct:**
- **Enumeration resistance.** If cross-tenant access returned 403, an attacker could enumerate all valid capture IDs in the system by scanning for 403 vs 404. Capture IDs are 128-bit random, so brute-force enumeration is infeasible, but defense-in-depth says don't leak information unnecessarily.
- **Industry standard.** GitHub returns 404 for private repos you can't access. Stripe returns 404 for resources belonging to other accounts. This pattern is well-understood.
- **Simple mental model for clients.** "404 means you can't get this capture" -- no need to distinguish sub-cases.

**Documentation approach:** The API documentation should say:

> Returns `404 Not Found` if the capture does not exist or is not accessible with the provided credentials. For security, the API does not distinguish between these cases.

This is not "hiding" the behavior -- it is explicitly documenting the intentional ambiguity. Clients should not try to distinguish the two cases programmatically.

**Implementation detail:** The error response body must be identical in both cases. Use the same static string: `"Capture not found"`. Do NOT include the capture ID, tenant ID, or any other contextual information that would differ between the two cases. The current code already does this correctly (`problemResponse(404, 'Capture not found')`).

### (e) Status Polling Endpoint Auth Design

The status endpoint (`GET /v1/captures/{id}/status`) has a unique constraint: it is polled immediately after `POST /v1/captures` while the capture is still `pending`. The tenant who created the capture needs access from the moment of creation.

**Recommended approach: Same auth as retrieval endpoints, no special handling needed.**

The status endpoint should use the same dual-path auth (share token OR tenant API key/session) as the other retrieval endpoints. This works naturally because:

1. **The creating tenant always has access.** The tenant who called `POST /v1/captures` already has an API key or session. They use the same credentials to poll `/status`. No special flow needed.
2. **Status URL is returned with the capture response.** The `handleCreateCapture` handler returns `statusUrl` in the 202 response. This URL should NOT include a share token -- it is for the creating tenant's use.
3. **Share tokens can also be used for status polling.** If a tenant creates a share token (even for a pending capture -- see note below), the share URL can be used to poll status. This enables use cases like "create capture, immediately share the status polling URL with a colleague."

**Refinement on share creation timing:** My recommendation in (a) says share creation should require `complete` status. On reflection, this is too restrictive for the status polling use case. **Allow share token creation for captures in any non-terminal-failure state (`pending` or `complete`).** The share token grants read access to whatever the capture's current state is. If the capture is pending, the shared user sees `{"status": "pending"}`. If it later fails, they see the failure. This is the simplest and most flexible design.

**The 202 response should NOT change.** The current response shape:

```json
{
  "id": "cap_abc123",
  "statusUrl": "https://wrl.../v1/captures/cap_abc123/status",
  "note": "Use GET /v1/captures to list and search your captures."
}
```

This is for the authenticated tenant. The `statusUrl` does not need a token because the tenant will use their API key. If they want to share the status URL, they call `POST /v1/captures/{id}/share`.

## Proposed Tasks

### Task 1: D1 Migration for Share Tokens Table

Create migration `0010_share_tokens.sql`:

```sql
CREATE TABLE share_tokens (
  id          TEXT NOT NULL PRIMARY KEY,
  capture_id  TEXT NOT NULL REFERENCES captures(id),
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TEXT,
  created_at  TEXT NOT NULL,
  revoked     INTEGER NOT NULL DEFAULT 0 CHECK (revoked IN (0, 1))
);

CREATE INDEX idx_share_tokens_capture ON share_tokens (capture_id, revoked);
CREATE INDEX idx_share_tokens_hash ON share_tokens (token_hash);
```

Key design choices:
- `token_hash`: SHA-256 of the raw token, not the raw token itself. Same pattern as `api_keys.key_hash`. The raw token is never stored.
- `id`: Internal identifier (e.g., `shr_<hex>`). Used for future revocation endpoint.
- `tenant_id`: Denormalized for query convenience (could join through captures, but direct lookup is faster for auth checks).
- `expires_at`: Nullable. NULL means permanent.
- `revoked`: Future-proofing for revocation. Not exposed in v1 API but the column exists.

### Task 2: Implement POST /v1/captures/{id}/share Handler

- Add route: `['POST', /^\/v1\/captures\/(cap_[a-f0-9]{32})\/share$/, handleCreateShare]`
- Auth: `verifyAuth(request, env, { requiredScope: 'read' })`
- Validate capture exists, belongs to tenant, is in `pending` or `complete` status
- Generate 256-bit random token, prefix `wrl_share_`, base64url-encode
- Hash token, store in `share_tokens` table
- Return 201 with `{ token, shareUrl, expiresAt }`

### Task 3: Add Auth Gate to Retrieval Handlers

Modify these handlers to require authentication:
- `handleGetCapture` -- add tenant auth + share token check
- `handleGetCaptureArtifact` -- add tenant auth + share token check
- `handleCaptureStatus` -- add tenant auth + share token check
- `handleListCaptures` -- already has tenant auth (no share token path; listing is tenant-scoped)

Each handler should:
1. Check for `?token=` query parameter
2. If present: look up `share_tokens` by hash, verify not expired/revoked, verify `capture_id` matches
3. If absent: call `verifyAuth()`, verify `record.tenantId === auth.tenantId`
4. On any failure: return 404 (not 401 or 403)

Extract this into a shared helper (e.g., `verifyCaptureAccess(request, env, captureId)`) to avoid duplicating the logic across four handlers.

### Task 4: Thread Share Token Through Artifact URLs

When a share token grants access, `handleGetCapture` must append `?token=<token>` to all artifact URLs and the `verifyUrl` in the response body. This ensures the recipient can follow links without additional auth.

### Task 5: Keep Verify Endpoint Public

`handleVerifyCapture` at `GET /v1/verify/{id}` must remain unauthenticated. This is by design -- verification is a public integrity check. The verify endpoint calls `performVerification` which reads from D1 and R2 directly (not through the auth-gated capture endpoints).

However, the **verify CLI** (`@w-r-l/verify`) fetches artifacts at `/v1/captures/{id}/artifacts/wacz`. After the auth gate, this will break for captures the CLI user does not own. The fix: when a user runs `wrl-verify https://wrl.../v1/captures/cap_abc123`, the CLI should accept a share URL that includes `?token=...` and propagate that token to the WACZ fetch URL. This is a CLI change, not a server change.

### Task 6: Update SECURITY.md

Document the new access model:
- Share token threat model (token leakage, expiry, enumeration)
- Intentional 404 ambiguity for cross-tenant access
- Share token vs API key security properties
- Token storage (hash-only, same as API keys)

## Risks and Concerns

### Risk 1: Verify CLI Breaking Change

**Severity: High.** The `@w-r-l/verify` CLI fetches `/v1/captures/{id}/artifacts/wacz` without authentication. After the auth gate, this will return 401/404 for non-public captures. The issue acknowledges this: "Must not break the npx @w-r-l/verify CLI tool."

**Mitigation:** Two-step approach:
1. Update the CLI to accept share URLs with `?token=` and propagate the token to artifact fetches. Release as a minor version bump.
2. On the server side, the verify endpoint (`/v1/verify/{id}`) remains public and does its own R2 fetch internally, so `wrl-verify` still works when given a verify URL rather than a capture URL.

**Residual concern:** Users who have bookmarked or scripted direct artifact URLs (without tokens) will be broken. This is inherent in adding an auth gate and cannot be avoided. The share token mechanism provides the migration path.

### Risk 2: Share Token in URL Query String -- Server Logs

Share tokens in query strings will appear in server access logs, CDN logs, and potentially browser history. This is a known trade-off.

**Mitigations:**
- Tokens are high-entropy (256 bits), so log exposure does not enable guessing other tokens
- Time-limited tokens reduce the window of exposure
- The `Referrer-Policy: no-referrer` header (already set on all responses) prevents token leakage via Referer headers to linked resources
- Server-side: do not log the raw `?token=` value. Log the token hash prefix (first 8 chars of SHA-256) for correlation, same as API keys.

### Risk 3: Share Token Enumeration

An attacker could try to guess share tokens by brute-forcing `?token=` values. With 256 bits of entropy, this is computationally infeasible. However, the server should still rate-limit failed token lookups to prevent abuse of D1 query capacity.

**Mitigation:** The existing per-IP rate limiters on capture endpoints provide sufficient protection. No additional rate limiting needed specifically for share token validation.

### Risk 4: Expired Token UX -- 410 Gone vs 404

The issue spec says expired tokens should return `410 Gone`. I recommend against this. A 410 response confirms that a valid share token once existed for this capture, which leaks information. Use `404 Not Found` for expired tokens, same as invalid tokens. If the client needs to distinguish "expired" from "never valid," the client already knows the `expiresAt` from when the share token was created.

**Recommendation:** Return 404 for all share token failures (invalid, expired, revoked). Document that clients should track `expiresAt` locally if they need expiry awareness.

**Alternative if 410 is required:** If the product decision is that 410 provides important UX value (e.g., "this link has expired, ask the owner for a new one"), then use 410 only for expired tokens, and accept the minor information leak. The 410 response body should not include any capture metadata.

### Risk 5: CORS on Share Token Endpoints

The current artifact endpoints return `Access-Control-Allow-Origin: *`. After adding the auth gate, share-token-authenticated requests will still work cross-origin because the token is in the query string (not a custom header). No CORS changes needed for share token access.

However, the `POST /v1/captures/{id}/share` endpoint creates a new resource and requires `Authorization: Bearer`. This endpoint needs CORS preflight handling if it will be called from browser JS. Given that share creation is a tenant management action (likely done from the WRL dashboard or server-side scripts), CORS support is probably not needed initially.

## Additional Agents Needed

1. **security-minion**: Review the share token threat model, especially token-in-URL-query-string risks, and validate that 404-for-everything is sufficient against enumeration. Review whether `revoked` column needs immediate API support or can be deferred.

2. **test-minion**: Design test cases for the auth gate -- especially edge cases like: share token for wrong capture ID, expired token, token + API key both present, cross-tenant 404, status polling with share token during pending state, artifact URL token propagation.

3. **devx-minion**: Evaluate the CLI (`@w-r-l/verify`) changes needed to accept share URLs with `?token=` parameters. Determine if this is a breaking change for the CLI or a backward-compatible addition.
