## Security Review: r8-auth-identity-r1-list-captures

**Verdict: APPROVE**

The plan correctly addresses the primary security concerns for this scope. My earlier recommendations (dual-layer tenantId validation, field stripping, cursor validation, cache headers) are all present. Specific confirmations and one residual note:

### Confirmed adequate

**KV key injection (HIGH risk in plan):** Dual-layer validation is correctly specified -- regex in `verifyApiKey()` at the auth boundary AND defensive re-validation in `tenantPrefix()` in `kv.js` with fail-closed throw. This is the right architecture. The regex `/^[a-z0-9_-]{1,64}$/` is appropriately restrictive.

**tenantId isolation:** The auth boundary returns `{ ok: true, tenantId: 'default' }` and the error path explicitly must NOT include `tenantId`. Confirmed in the Task 1 spec. The plan threads tenantId from auth through KV operations without any point where user-supplied input could substitute for it -- `tenantId` comes from auth result only, not from request parameters.

**CaptureSummary field stripping:** The plan explicitly lists fields to strip: `ip`, `artifacts.*` R2 keys, `wacz.key`. The SECURITY comment is called out in the Task 2 prompt. This matches the existing pattern in `handleGetCapture` (line 143-144 of index.js).

**Cursor forgery:** The wrapped KV-native cursor approach (`{"kv":"<native-cursor>"}`) is correct. KV's native cursor is opaque and server-generated; wrapping it in a base64url envelope means clients cannot forge a cursor that enumerates keys outside their tenant prefix -- the tenant prefix is applied server-side from the auth result, not from the cursor. Invalid cursors (base64 decode or JSON parse failure) return 400.

**Access model escalation (per-ID to per-tenant listing):** The list endpoint is behind the same `verifyApiKey()` check as POST. The tenant boundary is enforced: `listCaptures(env.KV, auth.tenantId, ...)` uses the auth-derived tenantId, not a caller-supplied one.

**Rate limiting:** The plan reuses `CAPTURE_RATE_LIMITER` for the list endpoint. This is acceptable at current scale. One note: the existing rate limiter keys on `CF-Connecting-IP`, which is per-IP, not per-token. A single API key shared across multiple IPs could exceed the per-IP limit, and a single IP using multiple API keys shares one bucket. This is a known limitation of the current limiter design, not introduced by this PR. Acceptable for MVP.

**Information leakage in list responses:** Returning 200 with empty array (never 404) is correct -- it prevents confirming or denying the existence of captures when none match. The `Cache-Control: private, no-store` header prevents caching of authenticated list responses.

**Pre-auth / post-auth log separation:** The spec correctly prohibits tenantId in pre-auth log calls (`security.auth_fail`, `security.rate_limit`, `security.capacity_limit`). This prevents tenant identity from leaking into logs that might be correlated with unauthenticated request patterns.

### One residual note (not a blocker)

**Scan budget and `hasMore` semantics under status filter:** When the 500-key scan budget is exhausted with a status filter active, the plan returns `hasMore: true`. This is correct behavior, but it means a caller with `?status=failed` could issue repeated paginated requests that each consume up to 500 KV reads before returning fewer than `limit` results. At single-operator scale this is acceptable. Flag it as a known cost profile when D1 migration (R12) is scoped.

No blocking issues. The implementation prompt is specific enough that the security properties are determined by the spec text, not left to the implementing agent's judgment.
