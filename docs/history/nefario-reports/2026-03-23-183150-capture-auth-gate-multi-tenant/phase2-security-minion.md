# Domain Plan Contribution: security-minion

## Recommendations

### (a) Where the auth check should live

**Recommendation: Route-level auth gate in the `fetch()` handler, not inside individual handlers.**

The codebase already establishes this pattern for two route groups:

1. **Admin routes** (lines 372-395 of index.js): pathname prefix check (`/v1/admin/`), rate limit, then `verifyAdminKey()` -- all before the route table dispatch.
2. **Account routes** (lines 407-443): pathname prefix check (`/v1/account/` or `/v1/billing/`), rate limit, then `verifySession()` -- again before dispatch.

The capture-read routes should follow this same pattern. The auth gate should be a new block in `fetch()` that matches the relevant pathname patterns:

- `GET /v1/captures/{id}` (metadata)
- `GET /v1/captures/{id}/status` (polling)
- `GET /v1/captures/{id}/artifacts/*` (artifact download)
- `GET /v1/captures` (listing -- already auth-gated inside the handler)

This is safer than per-handler auth for three reasons:

1. **Defense in depth against omission.** A new handler added to the route table that matches `/v1/captures/` inherits the auth gate automatically. Per-handler auth requires every contributor to remember to add it. The admin and account patterns prove this works.
2. **Single audit point.** One location to verify auth is enforced, one location to review, one location to test.
3. **Fail-closed by default.** If the gate rejects, the handler never executes. No risk of a handler accidentally leaking data before reaching its auth check.

**Critical exception**: `GET /v1/verify/{id}` must be excluded from the gate. The verify route uses a different pathname prefix (`/v1/verify/`) so a prefix-based gate on `/v1/captures/` naturally excludes it. This is already the case architecturally.

**Share token bypass**: The auth gate must check for a `?token=` query parameter before requiring Bearer auth. If a valid share token is present, it should resolve the allowed captureId and tenantId, then attach those to the request context (via `env._shareToken` or similar) so the handler can enforce that only the scoped capture is returned. The gate must reject share tokens that target a different captureId than the one in the URL path.

**Implementation sketch for the fetch() gate:**

```
const isCaptureReadRoute = pathname.startsWith('/v1/captures/') || pathname === '/v1/captures';
if (isCaptureReadRoute && request.method === 'GET') {
  // 1. Check for share token in query string
  // 2. If no share token, require Bearer auth via verifyAuth()
  // 3. Attach auth result (tenantId, authMethod, captureId scope) to env
  // 4. Handlers enforce tenantId match on the DB record
}
```

The write endpoints (`POST /v1/captures`, `POST /v1/captures/batch`) already have auth inside the handler. Those can stay as-is since they call `verifyAuth()` as their first meaningful step and are not affected by the new read-gate.

### (b) Share token format: opaque random vs. HMAC-signed payload

**Recommendation: Opaque random token stored in D1.**

This is a clear choice. Here is the trade-off analysis:

**Option 1: Opaque random token (D1 lookup) -- RECOMMENDED**

- 256-bit (32 bytes) cryptographically random, encoded as base64url (43 chars) with a `stk_` prefix for grep-ability and namespace clarity
- Stored in a `share_tokens` D1 table keyed by SHA-256 hash of the raw token (same pattern as API keys and session IDs -- hash-before-store is already an established convention in this codebase)
- Lookup: hash the presented token, query D1, check expiry/revocation

Advantages:
- **Revocable.** A tenant can revoke a share token instantly by updating a row. HMAC tokens cannot be revoked without a blocklist (which is just a worse version of a lookup table).
- **Auditable.** D1 records when the token was created, by whom, for which capture, and when it expires. HMAC tokens embed this in the payload but leave no server-side audit trail.
- **No key management complexity.** HMAC requires a signing secret (yet another secret to rotate, another failure mode if misconfigured). The codebase already has too many secrets (SIGNING_KEY, SESSION_SECRET, ADMIN_KEY, CAPTURE_API_KEY). Adding another is unnecessary.
- **Consistent with existing patterns.** API keys use hash-in-D1 lookup. Session tokens use hash-in-D1 lookup. Share tokens should too.
- **No cryptographic timing attacks.** Lookup is a database query, not a comparison. No need for constant-time HMAC verification.
- **Simpler to reason about.** The security properties are obvious: "if it's in the DB and not expired/revoked, it's valid."

Disadvantages:
- D1 read per token validation (sub-millisecond on Cloudflare, not meaningful)
- Table grows over time (mitigated by periodic cleanup of expired tokens)

**Option 2: HMAC-signed payload -- NOT RECOMMENDED**

Format would be: `stk_{base64url(captureId + expiresAt + nonce)}.{hmac}`

Advantages:
- Stateless validation (no DB read)
- No storage growth

Disadvantages:
- **Not revocable** without maintaining a revocation list, which defeats the stateless advantage
- Requires a new signing secret (or reuse of SESSION_SECRET, which conflates security domains)
- Token size grows with payload (capture ID + expiry + nonce + HMAC = long URLs)
- Must handle HMAC key rotation (old tokens signed with old key)
- Cannot add metadata after creation (e.g., access count, last-used timestamp)
- Complexity disproportionate to the problem -- D1 lookup is fast enough

**The D1 cost argument is a non-issue.** The auth gate already does a D1 lookup for API key verification on every request. One additional D1 read for share token validation is negligible. The system already pays this cost for every authenticated call.

### Token format specification

```
stk_<43 chars of base64url>
```

- Prefix: `stk_` (share token, grep-friendly, collision-free with `cap_`, `whk_`, `sch_`)
- Body: 32 bytes of `crypto.getRandomValues()`, encoded as base64url without padding
- Total length: 47 characters
- URL-safe: yes (base64url uses `-_` instead of `+/`, no padding `=`)
- Entropy: 256 bits (2^256 possible values)

### D1 schema for share_tokens

```sql
CREATE TABLE share_tokens (
  token_hash   TEXT NOT NULL PRIMARY KEY CHECK (length(token_hash) = 64),
  capture_id   TEXT NOT NULL REFERENCES captures(id),
  tenant_id    TEXT NOT NULL REFERENCES tenants(id),
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at   TEXT,          -- NULL = permanent (no expiry)
  revoked      INTEGER NOT NULL DEFAULT 0 CHECK (revoked IN (0, 1)),
  revoked_at   TEXT,
  label        TEXT           -- optional human-readable label
);

CREATE INDEX idx_share_tokens_capture ON share_tokens (capture_id, revoked);
CREATE INDEX idx_share_tokens_tenant  ON share_tokens (tenant_id, revoked, created_at);
```

**Key design decisions:**

- `token_hash` is SHA-256 of the raw token (64 hex chars) -- same as API keys. Raw token is never stored.
- `expires_at NULL` means permanent. This is simpler and safer than a magic far-future date.
- `capture_id` is a foreign key. One token grants access to exactly one capture. If multi-capture tokens are needed later, a junction table can be added without breaking existing tokens.
- `tenant_id` is denormalized (could be derived from capture_id JOIN) for query efficiency and to support fast "list my share tokens" without a join.
- No `scopes` column. Share tokens grant read-only access. Period. No need for scope escalation vectors.

### (c) Expired vs. revoked token behavior

**Recommendation: Both return 401, not 410.**

The issue spec suggests 410 Gone for expired tokens. I recommend against this for security reasons:

**410 Gone leaks information.** A 410 tells an attacker "this was a valid token at some point." A 401 says "this token is not valid" without revealing whether it ever was. This is the same principle behind returning 404 (not 403) for cross-tenant access -- avoid revealing the existence of resources to unauthorized parties.

However, the issue explicitly specifies 410 for expired tokens as a design requirement. If the product decision is to provide a better UX for legitimate users receiving a link with an expired token, then the compromise is:

- **Expired tokens**: 410 Gone with body `{"detail": "Share token has expired"}`. This is acceptable because the token was intentionally shared, so the recipient knowing it existed is not a secret.
- **Revoked tokens**: 401 Unauthorized, identical to "token not found." Revocation is a deliberate security action; the revoker may not want the recipient to know the token was explicitly killed.
- **Never-existed tokens**: 401 Unauthorized.

The distinction matters because revocation is a security response (compromised token, abusive recipient), while expiry is a planned lifecycle event.

**Implementation:**

```javascript
// In the auth gate:
if (!record) return 401; // not found
if (record.revoked) return 401; // same as not found -- no information leakage
if (record.expires_at && new Date(record.expires_at) < now) return 410; // expired
```

**Rate limiting on share token validation:** Share token lookup must be rate-limited per IP (reuse the verify rate limiter or a dedicated one). Without this, an attacker can brute-force share tokens. Even at 256-bit entropy, rate limiting is defense-in-depth.

### (d) Threat model for share token enumeration

**256 bits is vastly more than adequate.**

At 256 bits of entropy, there are 2^256 possible token values. Even if an attacker can make 1 billion guesses per second (impossible against a rate-limited HTTP endpoint), they would need 2^256 / 10^9 seconds, which is approximately 3.7 x 10^67 years. The universe is approximately 4.3 x 10^17 seconds old.

**The real threats are not brute force.** They are:

| Threat | Likelihood | Impact | Mitigation |
|--------|-----------|--------|------------|
| **Token leakage via URL (HTTP Referer)** | Medium | High | Set `Referrer-Policy: no-referrer` on all responses (already done, line 488). Also: tokens in query strings appear in server logs, browser history, and shared screen recordings. Document this as an accepted risk with mitigation guidance ("use time-limited tokens for sharing"). |
| **Token leakage via URL sharing** | Medium | Medium | Time-limited tokens are the primary mitigation. The tenant chose to share, so the blast radius is bounded to one capture. |
| **Token leakage via server logs** | Low | High | Never log raw share tokens. Log only `token_hash` prefix (first 8 chars). The auth gate must follow the same hash-prefix-only logging pattern used for API keys. |
| **Denial of service via token creation spam** | Low | Medium | Rate-limit token creation per tenant. Cap maximum active tokens per capture (e.g., 50). Enforce in the creation endpoint. |
| **Token reuse after intended expiry** | Low | Medium | Server-side expiry check (not client-side). Expiry is checked on every request, not at creation time only. Clock skew is not a concern on Cloudflare Workers (single time source). |
| **Enumeration of valid captures via token probing** | Very Low | Low | 256-bit entropy makes enumeration infeasible. Rate limiting adds defense in depth. Response codes do not distinguish "bad token" from "no token" (both 401). |
| **Token in browser URL bar visible to shoulder surfing** | Low | Low | `stk_` prefix is not self-documenting enough to be recognized as sensitive. Token length (47 chars) makes visual memorization impractical. Not a significant risk. |

**One risk that needs explicit design attention: the URL bar problem.**

Share tokens travel as query parameters: `/v1/captures/cap_abc123?token=stk_xyz...`. This means:

1. They appear in browser history
2. They appear in HTTP server access logs (Cloudflare, any CDN, any reverse proxy)
3. They may appear in `Referer` headers if the user navigates from the shared page (mitigated by existing `no-referrer` policy)
4. They persist in the URL bar and can be copy-pasted accidentally

This is acceptable for the use case (sharing a link to a specific capture) and is consistent with how other services handle share links (Google Docs, Figma, etc.). Time-limited tokens bound the exposure window. The documentation (SECURITY.md) should call this out explicitly.

### (e) CLI verify tool and backward compatibility

**Recommendation: The verification endpoint response should include a `shareUrl` field, AND the CLI should accept a `--token` flag.**

Here is the reasoning:

**Current state:** The CLI tool (`packages/verify/lib/key-resolver.js`, `fetchWaczFromCaptureUrl()`) fetches `GET /v1/captures/{captureId}/artifacts/wacz` with no auth. Once the auth gate is in place, this breaks.

**The verification endpoint (`/v1/verify/{id}`) remains unauthenticated** and performs server-side verification (reading the WACZ from R2 internally). So CLI users who just want to check if a capture is valid can use the verify endpoint directly without any auth. The CLI already supports this path.

**The problem is independent verification.** The CLI's `fetchWaczFromCaptureUrl` downloads the WACZ so the user can verify it locally (offline verification, trust-nothing model). This requires artifact access, which now requires auth.

**Solution (two-pronged):**

1. **`POST /v1/captures/{id}/share` response includes the raw token.** When a tenant creates a share token, they get back the token value. They can construct the share URL themselves or hand the token to the CLI user.

2. **`GET /v1/captures/{id}` response (authenticated) includes a `shareUrl` field** for each artifact URL. Example:
   ```json
   {
     "id": "cap_abc123",
     "artifacts": {
       "wacz": "https://api.wrl.com/v1/captures/cap_abc123/artifacts/wacz"
     },
     "wacz": {
       "url": "https://api.wrl.com/v1/captures/cap_abc123/artifacts/wacz",
       "size": 12345
     },
     "verifyUrl": "https://api.wrl.com/v1/verify/cap_abc123"
   }
   ```
   The artifact URLs in the authenticated response do NOT include share tokens. The tenant constructs shareable URLs by appending `?token=stk_...` themselves.

3. **The CLI accepts a `--token` flag.** `fetchWaczFromCaptureUrl` appends `?token=<value>` to the artifact URL when a token is provided:
   ```bash
   wrl-verify https://api.wrl.com/v1/captures/cap_abc123 --token stk_abc...
   ```

4. **The `/v1/verify/{id}` JSON response should NOT include a share token or artifact download URL.** The verify endpoint is public and unauthenticated -- embedding a share token in its response would leak the token to anyone who knows the capture ID. The verify endpoint returns verification results only.

**Backward compatibility:** Existing CLI users who were using the capture URL for local verification will need to either:
- Use the `--token` flag with a share token provided by the tenant
- Use the verify endpoint for server-side verification (no download needed)
- Use their own API key via `--api-key` flag (new, for tenants verifying their own captures)

This is a breaking change for the "download WACZ without auth" flow. The issue acknowledges this with "share tokens provide backward compatibility" -- meaning the tenant creates a share token and gives it to anyone who needs to download artifacts.

## Proposed Tasks

### Task 1: D1 migration for share_tokens table
- Create `migrations/0010_share_tokens.sql`
- Schema as specified in (b) above
- Add DB functions in `db.js`: `createShareToken()`, `getShareTokenByHash()`, `listShareTokens()`, `revokeShareToken()`
- **Security constraint**: raw token must never be stored; only SHA-256 hash

### Task 2: Auth gate in fetch() for capture-read routes
- Add a new block in `fetch()` between the account-route gate and the route dispatch
- Match `GET` requests to `/v1/captures/*` (but NOT `/v1/verify/*`)
- Check for `?token=` query parameter first; if present, validate share token
- If no share token, require Bearer auth via `verifyAuth(request, env, { requiredScope: 'read' })`
- Attach auth result to `env._captureAuth` with `{ tenantId, authMethod, scopedCaptureId }`
- For share tokens: `scopedCaptureId` is the single capture the token grants access to
- For API key/session auth: `scopedCaptureId` is null (tenant can access all their captures)

### Task 3: Tenant isolation in capture-read handlers
- `handleGetCapture`: after DB lookup, verify `record.tenantId === env._captureAuth.tenantId`; if not, return 404 (not 403)
- `handleGetCaptureArtifact`: same tenant check
- `handleCaptureStatus`: same tenant check
- `handleListCaptures`: already scoped by tenantId (passes `auth.tenantId` to `listCaptures()`) -- verify this still works with the new gate
- For share tokens: also verify `captureId === env._captureAuth.scopedCaptureId`
- **Critical**: cross-tenant access MUST return 404, never 403 or any response that distinguishes "exists but not yours" from "does not exist"

### Task 4: Share token creation endpoint
- `POST /v1/captures/{id}/share` -- requires tenant auth (API key or session)
- Request body: `{ "expiresIn": 3600 }` (seconds, optional; omit for permanent)
- Verify the capture belongs to the authenticated tenant before creating the token
- Generate 32-byte random token, hash with SHA-256, store hash in D1
- Return raw token exactly once: `{ "token": "stk_...", "expiresAt": "...", "captureId": "cap_..." }`
- Rate limit: reuse capture rate limiter or a dedicated one
- Cap: maximum 50 active (non-revoked, non-expired) tokens per capture

### Task 5: Share token revocation
- `DELETE /v1/captures/{id}/share/{tokenHash}` -- requires tenant auth
- Sets `revoked = 1, revoked_at = now` in D1
- Returns 204 on success, 404 if token not found or belongs to different tenant

### Task 6: CLI --token flag
- Add `--token` option to the verify CLI
- When present, append `?token=<value>` to artifact download URLs
- Update `fetchWaczFromCaptureUrl` to accept an optional token parameter
- Document in CLI help text

### Task 7: SECURITY.md update
- Remove "Known gap (single-tenant deployments)" paragraph
- Document the new access model: tenant auth required for capture reads, share tokens for delegation
- Document share token threat model (enumeration infeasibility, URL leakage accepted risk, expiry/revocation semantics)
- Document that `/v1/verify/{id}` remains unauthenticated by design

### Task 8: Tests
- Auth gate: verify 401 for missing auth on all capture-read endpoints
- Tenant isolation: verify 404 for cross-tenant access (not 403)
- Share token: creation, validation, expiry (410), revocation (401), scope enforcement (token for capture A cannot access capture B)
- Verify endpoint: confirm still unauthenticated
- Rate limiting: share token validation is rate-limited
- Token format: confirm 256-bit entropy, `stk_` prefix, URL-safe encoding

## Risks and Concerns

### CRITICAL: Existing captures are immediately inaccessible after deployment

Once the auth gate is deployed, every existing `GET /v1/captures/{id}` call without auth will get 401. This affects:

1. **The CLI verify tool** -- anyone doing local verification of a capture URL will break
2. **Bookmarked capture URLs** -- any saved links will stop working
3. **The Web UI** -- if the UI fetches captures via the API without session auth, it will break (verify it uses session cookies)

**Mitigation**: Deploy the share token creation endpoint first. Before enabling the auth gate, create share tokens for any captures that need to remain publicly accessible. Consider a grace period where the auth gate logs warnings but still allows unauthenticated access, then hard-enable after one deployment cycle.

Alternatively, if this is a clean break (acceptable because it's still pre-GA), just document it as a breaking change and move forward.

### HIGH: The verify endpoint reads artifacts internally -- no auth needed

The `/v1/verify/{id}` handler calls `performVerification()` which reads the WACZ from R2 directly (server-side). It never goes through the auth gate. This is correct and intentional -- verification is a public service. But verify that `performVerification()` does NOT call any endpoint that would be blocked by the new auth gate. Reading the code: it takes `{ DB, BUCKET, SIGNING_KEY }` directly and reads from R2 using `env.BUCKET.get()`. No HTTP calls. Confirmed safe.

### HIGH: Share token query parameter appears in access logs

Cloudflare Workers logs, any CDN logs, and any downstream analytics will contain the full URL including `?token=stk_...`. This is inherent to query-parameter-based token passing and is an accepted trade-off (consistent with how Google, Dropbox, and similar services handle share links). Mitigations:

- Time-limited tokens bound the exposure window
- `Referrer-Policy: no-referrer` prevents leakage to linked sites (already set)
- Server-side logs must redact or hash the token value before logging
- SECURITY.md must document this explicitly

### MEDIUM: Race condition between token creation and auth gate deployment

If the auth gate is deployed before the share token creation endpoint, tenants cannot create tokens to grant access to existing captures. The migration and new endpoints should be deployed atomically (single PR, single deploy).

### MEDIUM: The `handleGetCapture` response includes artifact URLs

Currently, `handleGetCapture` builds artifact URLs as absolute URLs:
```javascript
const artifactBase = `${base}/v1/captures/${captureId}/artifacts`;
artifacts.screenshot = `${artifactBase}/screenshot`;
```

When accessed via share token, these URLs will NOT include the share token. The recipient would get the capture metadata but then fail to download artifacts. Two options:

1. **Append `?token=...` to artifact URLs in the response when accessed via share token.** This is the pragmatic approach -- the response "just works."
2. **Leave URLs bare; require the client to append the token themselves.** Simpler server-side but worse UX.

**Recommendation**: Option 1. When the request was authenticated via share token, the handler should append `?token=<raw_token>` to all artifact URLs in the response body. This means the raw token must be available in the handler context (passed through from the auth gate via `env._captureAuth.rawToken`). This is safe because the token is already known to the recipient (they used it to access this endpoint).

### LOW: Token table growth

Share tokens accumulate in D1 over time. Expired tokens are still queried (to return 410). A periodic cleanup job should delete expired tokens older than N days (e.g., 30 days past expiry). This can be a scheduled task in the existing cron infrastructure. Not urgent for launch but should be a backlog item.

### LOW: Share token for pending/failed captures

Should share tokens be creatable for captures that are still pending or have failed? Recommendation: allow creation for any capture owned by the tenant, but the share token lookup in the auth gate should inherit the existing status checks in the handlers (pending captures return limited info, failed captures return error details). The auth gate itself should not filter by capture status.

## Additional Agents Needed

- **backend-minion**: Implement the D1 migration, db.js functions, auth gate logic, share token endpoints, and handler modifications
- **test-minion**: Write comprehensive tests for auth gate, tenant isolation (especially the 404-not-403 invariant), share token lifecycle, and CLI changes
- **cli-minion** (or backend-minion): Add `--token` flag to the verify CLI and update `fetchWaczFromCaptureUrl`
- **docs-minion**: Update SECURITY.md, API documentation, and any user-facing docs about the new auth model
