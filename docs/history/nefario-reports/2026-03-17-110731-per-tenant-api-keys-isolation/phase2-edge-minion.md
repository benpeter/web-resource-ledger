# Edge Minion -- Planning Contribution

## Specialist: edge-minion
## Phase: Planning (Phase 2)
## Question Context: Admin rate limiter bindings, route interaction with existing limiters, CORS, security headers, namespace IDs

---

## Recommendations

### 1. wrangler.toml changes for ADMIN_RATE_LIMITER

Production and staging each need a new `unsafe.bindings` entry. The existing convention uses namespace IDs 1001-1003 (production) and 2001-2003 (staging). Continuing the sequence:

**Production** (add after the `GLOBAL_CAPTURE_LIMITER` block):

```toml
[[unsafe.bindings]]
name = "ADMIN_RATE_LIMITER"
type = "ratelimit"
namespace_id = "1004"
simple = { limit = 5, period = 60 }
```

**Staging** (add after the staging `GLOBAL_CAPTURE_LIMITER` block):

```toml
[[env.staging.unsafe.bindings]]
name = "ADMIN_RATE_LIMITER"
type = "ratelimit"
namespace_id = "2004"
simple = { limit = 5, period = 60 }
```

Namespace IDs 1004 and 2004 follow the established pattern cleanly. No KV namespace changes needed -- the admin key records (`apikey:{sha256hex}`) live in the existing `KV` binding alongside capture records.

No other wrangler.toml changes are required for this feature. The `ADMIN_KEY` secret is provisioned via `wrangler secret put ADMIN_KEY` (and `--env staging` for staging), not in the toml file.

### 2. Admin route interaction with existing rate limiters

The admin endpoints (`/v1/admin/keys`) need a **separate, dedicated** rate limiter (`ADMIN_RATE_LIMITER`) and must NOT share the existing per-IP capture or verify limiters. Rationale:

- **Different threat model.** The existing limiters protect compute-heavy operations (browser rendering, WACZ verification). Admin endpoints are lightweight KV operations but are high-value targets for brute-force attacks against the admin key.
- **Different rate profile.** 5 requests/minute is appropriate for key provisioning. Sharing the capture limiter (10/min) would be too generous for admin and would also mean a burst of admin calls could exhaust the capture budget for that IP, or vice versa.
- **Different keying.** The existing limiters key on `CF-Connecting-IP`. The admin limiter should also key on IP, but it runs **before** auth (as the advisory specifies). This means the rate check comes first, then the admin key check. This is the correct order: it prevents an attacker from probing the admin key at high rates even with invalid keys.

The request processing order for admin routes should be:

```
1. Rate limit check (ADMIN_RATE_LIMITER, keyed on IP)
2. Content-Type check (for POST)
3. Admin auth check (ADMIN_KEY comparison or KV-stored admin-scoped key)
4. Route handler logic
```

The global capture limiter (`GLOBAL_CAPTURE_LIMITER`) should NOT apply to admin routes. It exists to protect browser/R2 capacity, and admin endpoints do not exercise either resource.

### 3. CORS handling for admin endpoints

**No CORS for admin routes.** Admin endpoints are strictly server-to-server (or operator-to-server via curl/CLI). Reasons:

- Admin keys should never appear in browser-accessible JavaScript. Enabling CORS on admin endpoints would implicitly endorse browser-based admin access, which is a security anti-pattern.
- The existing CORS configuration is scoped to `POST /v1/captures` only (both preflight and response headers). Admin routes should not be added to this scope.
- No `OPTIONS` handler is needed for `/v1/admin/keys*`.
- No `Access-Control-Allow-Origin` header on admin responses.

If a browser hits an admin endpoint, the response will still be returned (CORS is enforced by browsers, not servers), but the browser will block the response from reaching JavaScript. This is the correct behavior.

### 4. Security headers for admin responses

Admin responses should inherit the same global security headers that all responses already get (lines 102-107 in `index.js`):

- `Referrer-Policy: no-referrer`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `Link: <...TERMS.md>; rel="terms-of-service"`

These are already applied to every response in the post-handler block. No additional security headers are needed specifically for admin routes.

Additionally, admin responses should include:

- `Cache-Control: private, no-store` -- admin responses must never be cached by CDN or browser. Key listings and creation responses contain sensitive data. This should be set by each admin handler, not globally (since non-admin routes have different caching needs).
- **No** `Access-Control-Allow-Origin` header (see point 3).

One extra consideration: the `POST /v1/admin/keys` response that returns the raw key exactly once should also avoid any caching intermediary. The `no-store` directive handles this, but the implementation should also ensure the response body is not logged by the observability layer (the raw key is the secret -- only the hash should appear in logs).

### 5. Separate rate limit group for X-RateLimit-Limit headers

**Yes.** Admin routes need their own entry in the `RATE_LIMITS` map (in `src/rate-limits.js`) and a corresponding branch in the `getRateLimitGroup()` function (in `src/index.js`).

Updated `rate-limits.js`:

```js
export const RATE_LIMITS = {
  capture: { limit: 10, period: 60 },
  verify:  { limit: 60, period: 60 },
  admin:   { limit: 5,  period: 60 },
};
```

Updated `getRateLimitGroup()` in `index.js`:

```js
function getRateLimitGroup(method, pathname) {
  if (pathname === '/v1/captures') return 'capture';
  if (pathname.startsWith('/v1/verify/') || pathname.startsWith('/.well-known/signing-key')) return 'verify';
  if (pathname.startsWith('/v1/admin/')) return 'admin';
  return null;
}
```

This ensures admin 429 responses include `X-RateLimit-Limit: 5` and admin 2xx/4xx responses include the same header for client awareness. The header value MUST match the `simple.limit` in `wrangler.toml` (5), keeping the existing convention where the JS constant mirrors the binding config.

### 6. Namespace IDs summary

| Binding | Production | Staging |
|---------|-----------|---------|
| `CAPTURE_RATE_LIMITER` | 1001 | 2001 |
| `VERIFY_RATE_LIMITER` | 1002 | 2002 |
| `GLOBAL_CAPTURE_LIMITER` | 1003 | 2003 |
| `ADMIN_RATE_LIMITER` (new) | **1004** | **2004** |

The 1xxx/2xxx convention cleanly separates production from staging. Sequential numbering within each block (1001-1004, 2001-2004) is easy to audit.

---

## Proposed Tasks

1. **Add `ADMIN_RATE_LIMITER` binding to `wrangler.toml`** -- both production (namespace_id 1004) and staging (namespace_id 2004), with `limit = 5, period = 60`. Place after the existing `GLOBAL_CAPTURE_LIMITER` entries in each section.

2. **Add `admin` entry to `RATE_LIMITS` in `src/rate-limits.js`** -- `{ limit: 5, period: 60 }`.

3. **Update `getRateLimitGroup()` in `src/index.js`** -- add `if (pathname.startsWith('/v1/admin/')) return 'admin';` before the `return null` fallback.

4. **Register admin routes in the `routes` array** -- three new entries:
   - `['POST', /^\/v1\/admin\/keys$/, handleAdminCreateKey]`
   - `['GET',  /^\/v1\/admin\/keys$/, handleAdminListKeys]`
   - `['DELETE', /^\/v1\/admin\/keys\/([a-f0-9]{64})$/, handleAdminRevokeKey]`

   Note: the DELETE pattern captures the SHA-256 hex hash (64 hex chars). This avoids any need to decode or validate key format beyond the regex.

5. **Implement admin handlers with correct middleware order** -- rate limit (IP) -> content-type (POST only) -> admin auth -> handler logic. Each handler sets `Cache-Control: private, no-store`.

6. **Ensure no CORS handling for admin routes** -- no changes to `getAllowedOrigin()`, no CORS headers on admin responses, no OPTIONS handler for `/v1/admin/*`.

7. **Test that admin rate limiting is independent** -- verify that hitting the admin limiter does not affect capture/verify budgets and vice versa. This follows from separate namespace IDs but should be validated.

---

## Risks and Concerns

### Risk: Rate limiter binding absence in local dev

The existing code guards all rate limiter calls with `if (env.CAPTURE_RATE_LIMITER)` etc. The admin handler must follow the same pattern (`if (env.ADMIN_RATE_LIMITER)`). In local dev with `wrangler dev`, rate limiter bindings may not be available (they are `unsafe.bindings`). Skipping the rate limit check in local dev is acceptable -- the same pattern already exists for all other limiters.

### Risk: Admin rate limit before auth leaks timing information

The advisory says rate check comes before auth. This means an unauthenticated client can probe whether the admin endpoint exists and observe when they hit the rate limit. This is acceptable -- the endpoint existence is public knowledge (documented API), and the rate limit protects the auth check from brute force. The important thing is that rate-limited responses (429) must not differ in structure between "you were rate-limited but would have been authorized" and "you were rate-limited and would have been unauthorized". The current `problemResponse(429, ...)` approach handles this correctly since it returns the same body regardless.

### Risk: Namespace ID conflicts

If other Cloudflare features (e.g., another Worker or rate limit rule added via dashboard) happen to use namespace IDs 1004 or 2004, there would be a conflict. In practice, `unsafe.bindings` rate limiter namespace IDs are scoped to the Worker, so collisions are only possible within the same `wrangler.toml`. The sequential numbering makes it easy to verify there are no duplicates.

### Risk: Admin responses leaking the raw key in logs

When `POST /v1/admin/keys` returns the raw key, the observability layer (Coralogix logging) must NOT log the response body or the raw key value. The log event for key creation should include only the key hash, tenant ID, scopes, and name -- never the raw key. This is a security-minion concern but has edge implications because the log call structure is in the handler code.

### Risk: CORS confusion if future admin UI is built

The advisory explicitly scopes admin access as API-only (no web UI). If a future admin UI is built, it would need its own CORS configuration. This should be a separate, deliberate decision -- not retroactively added by enabling CORS on admin routes now. Document this constraint in the migration runbook or admin API documentation.

---

## Additional Agents Needed

- **security-minion**: Should review the admin auth implementation (ADMIN_KEY comparison, KV-stored admin-scoped key lookup) for timing-safe comparison, key rotation handling, and the interaction between global `ADMIN_KEY` and per-tenant admin-scoped keys. Also should validate that the raw key is never logged.
- **observability-minion**: Should define the exact log event schema for the `admin` subsystem (`admin.key_create`, `admin.key_revoke`, `admin.key_list`) including which fields to include and which to exclude (raw key).
- **api-design-minion**: Should confirm the DELETE route pattern (`/v1/admin/keys/{sha256hex}`) and the response schemas for all three admin endpoints, especially the one-time key return on POST.

No iac-minion involvement needed -- the wrangler.toml changes are straightforward binding additions within the existing structure, and the `ADMIN_KEY` secret is provisioned via the standard `wrangler secret put` workflow already documented for other secrets.
