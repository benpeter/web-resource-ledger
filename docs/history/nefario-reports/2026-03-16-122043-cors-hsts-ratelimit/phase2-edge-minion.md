# Edge Minion -- Plan Contribution

## Planning Question: Rate Limit Ceiling Configuration

### Recommendation: Option 2 -- Single config object in source code

**Rationale**: The Cloudflare rate limiter `[[unsafe.bindings]]` with `simple = { limit, period }` is a declarative binding -- the runtime only exposes `limit()`, not the configured ceiling. The values need to be readable in handler code to emit `X-RateLimit-Limit`. Of the two viable options:

1. **Duplicate in `[vars]`**: Creates a maintenance hazard. Two sources of truth for the same value (wrangler.toml binding vs wrangler.toml vars). When someone changes the rate limiter binding from `limit = 10` to `limit = 20`, they must remember to update the var too. The binding and the var live in different sections of the file, and in both production and staging blocks. That is four places to keep in sync. This will drift.

2. **Single config object in source code** (recommended): Define a `RATE_LIMITS` constant in a dedicated module (e.g., `src/rate-limits.js`). This becomes the single source of truth for the *display* ceiling. The wrangler.toml binding values are the enforcement source of truth (Cloudflare enforces them), and the JS constant is the *documentation* source of truth (what we tell the client). A code comment next to the constant explicitly states: "Keep in sync with wrangler.toml rate limiter bindings." This pattern is simple, grep-able, and has one sync point per environment instead of four.

The config object would look like:

```js
// Rate limit ceilings for X-RateLimit-Limit response headers.
// These MUST match the `simple.limit` values in wrangler.toml rate limiter bindings.
// The rate limiter binding enforces the limit; this constant reports it to clients.
export const RATE_LIMITS = {
  capture: { limit: 10, period: 60 },
  verify:  { limit: 60, period: 60 },
  global:  { limit: 200, period: 60 },
};
```

### Which ceiling to report: per-IP, not global

The `X-RateLimit-Limit` header should reflect the **per-IP limit** for the endpoint being called, not the global capacity limit. Reasons:

1. **Client utility**: The header exists so API clients can discover their rate budget. A client cannot meaningfully act on a global capacity number -- they have no control over other clients' behavior. The per-IP limit is actionable: the client knows exactly how many requests *they* can make.

2. **Security**: Exposing the global capacity ceiling (`200/min`) tells an attacker exactly how many requests it takes to saturate the service. The per-IP limit is already implicitly discoverable through experimentation, so it leaks nothing new.

3. **RFC draft-ietf-httpapi-ratelimit-headers alignment**: The draft standard defines `RateLimit-Limit` as the maximum number of requests the client is allowed in the current window. "The client" -- not "all clients combined." Per-IP is the correct semantic.

4. **When both per-IP and global fire**: If the global limiter trips (503 "Service is at capacity"), that response should NOT carry `X-RateLimit-Limit` at all. The 503 response already has `Retry-After: 10`. Adding `X-RateLimit-Limit: 200` on a 503 would confuse clients who just made their 3rd request. Reserve the header for 429 responses and successful responses on rate-limited endpoints.

**Implementation specifics**:
- On successful responses from rate-limited handlers: `X-RateLimit-Limit: 10` (capture), `X-RateLimit-Limit: 60` (verify)
- On 429 from per-IP limiter: `X-RateLimit-Limit: 10` or `60` depending on endpoint
- On 503 from global limiter: no `X-RateLimit-Limit` header (different failure mode)

---

## Issue #33: CORS for capture POST endpoint

### Recommendations

1. **CORS handling must happen in the main fetch handler, before routing.** An OPTIONS preflight never carries Authorization, so it will fail auth checks if it reaches `handleCreateCapture`. The preflight handler must intercept OPTIONS requests to `/v1/captures` and return 204 with CORS headers *before* the routing loop runs (or as a dedicated route entry at the top of the table).

2. **Origin allowlist from env var.** Define `CORS_ALLOWED_ORIGINS` in `[vars]` as a comma-separated string. Parse it once at the start of the fetch handler. Empty string or absent = no cross-origin access (secure default). This is the right layer for this config -- it changes per environment (staging may allow `localhost:*`).

3. **CORS headers on both preflight AND actual POST response.** The browser checks CORS headers on the preflight (OPTIONS) response AND the actual POST response. Both must include:
   - `Access-Control-Allow-Origin`: the requesting origin (if in allowlist), NOT `*` (because the endpoint requires `Authorization`)
   - `Access-Control-Allow-Methods: POST` (on preflight)
   - `Access-Control-Allow-Headers: Content-Type, Authorization` (on preflight)
   - `Access-Control-Max-Age: 86400` (24h preflight cache, on preflight)
   - `Vary: Origin` on the POST response (because the ACAO value varies by requesting origin)

4. **Why not `Access-Control-Allow-Origin: *`**: The capture POST requires `Authorization: Bearer <token>`. Per the CORS spec, `Access-Control-Allow-Origin: *` does NOT work with credentialed requests (requests with `Authorization` header). The browser will reject the response. You must echo back the specific origin from the allowlist.

5. **Do NOT add CORS to the existing GET endpoints that already use `Access-Control-Allow-Origin: *`.** Those are public read endpoints (verify, signing-key, artifacts) that work correctly with wildcard. The issue scope explicitly says "Existing retrieval GET endpoints (already using `*`) are unaffected."

6. **Preflight response should be 204 No Content**, not 200. This is conventional and avoids the browser parsing an empty body.

### Proposed Tasks

- Add `CORS_ALLOWED_ORIGINS` to `[vars]` in wrangler.toml (production and staging)
- Add an early-exit for `OPTIONS` method on `/v1/captures` path in the main fetch handler
- On POST `/v1/captures` responses, add CORS headers when the request Origin is in the allowlist
- Add `Vary: Origin` to POST responses (the ACAO value depends on which origin made the request)
- Tests: allowed origin gets ACAO echo, disallowed origin gets no ACAO, missing Origin header gets no ACAO, preflight returns correct method/header lists, preflight Max-Age is set

### Risks and Concerns

- **Preflight caching at the edge**: `Access-Control-Max-Age: 86400` is a browser-side preflight cache. The CDN edge should NOT cache OPTIONS responses (they have no body worth caching and the ACAO varies by origin). Ensure the OPTIONS 204 response includes `Cache-Control: no-store` to prevent edge caching.
- **Origin header spoofing**: CORS is a browser enforcement mechanism, not a server-side security boundary. The API key is the real security gate. CORS prevents accidental cross-origin calls from untrusted browser pages; it does not protect against curl/scripts. Do not treat the allowlist as an access control mechanism.
- **Comma-separated env var parsing**: Trim whitespace around entries. Reject entries with wildcards (no `*.example.com` -- that's a footgun). Validate each entry looks like a URL origin (`https://...`).

---

## Issue #34: HSTS preload submission

### Recommendations

1. **One-line change.** Current header value in `src/index.js` line 55:
   ```
   max-age=31536000; includeSubDomains
   ```
   Change to:
   ```
   max-age=63072000; includeSubDomains; preload
   ```
   The max-age bump from 1 year to 2 years is required by hstspreload.org (minimum is 31536000, but 63072000 is the recommended value and what the checker expects).

2. **Update the existing security headers test.** The test at `test/security-headers.test.js` line 60 checks `max-age >= 31536000`. Update to assert the exact value `63072000` and assert `preload` is present in the HSTS string.

3. **hstspreload.org submission is a manual step after merge.** The domain must serve the header with `preload` before submitting. Document this as a post-merge action item in the PR description. Verify at https://hstspreload.org/?domain=<your-domain> that the checker passes before submitting.

4. **Mixed content audit**: The issue mentions "no mixed-content issues on any served page." This Worker serves only JSON API responses and one HTML page (verify-page). Neither loads external subresources. No mixed-content risk. No action needed beyond the header change.

### Proposed Tasks

- Change HSTS header value in `src/index.js`
- Update `test/security-headers.test.js` to assert exact max-age and preload directive
- Add post-merge checklist item to PR for hstspreload.org submission

### Risks and Concerns

- **Preload is permanent** (practically). Once a domain is on the preload list, removal takes months and requires shipping a browser update. This is the correct call for a production API that should never serve over plain HTTP, but it should be a conscious decision. The issue explicitly requests it.
- **Subdomain coverage**: `includeSubDomains` is already present. All subdomains will be forced to HTTPS. Verify no subdomains need plain HTTP (unlikely for this project, but worth confirming).

---

## Issue #35: X-RateLimit-Limit response header

### Recommendations

(See the detailed analysis in the Planning Question section above.)

1. **Create `src/rate-limits.js`** with the `RATE_LIMITS` config object.
2. **Add the header at the handler level, not the global middleware.** The global response header block at the end of `fetch()` does not know which rate limiter applied. Each handler already knows its limiter. Add the header in the response construction within each rate-limited handler:
   - `handleCreateCapture` / `handleListCaptures`: use `RATE_LIMITS.capture.limit`
   - `handleVerifyCapture` / `handleGetSigningKey` / `handleGetSigningKeys`: use `RATE_LIMITS.verify.limit`

3. **Attach the header to ALL responses from rate-limited handlers, not just 429s.** The purpose is discoverability -- clients learn their budget from successful responses too. The header appears on 200, 202, 400, 401, 415, 429 -- any response that came from a handler behind a rate limiter.

4. **Implementation pattern**: Rather than adding header-setting code to every handler, consider a small wrapper function:

   ```js
   function withRateLimit(response, limitName) {
     response.headers.set('X-RateLimit-Limit', String(RATE_LIMITS[limitName].limit));
     return response;
   }
   ```

   But given the project's KISS philosophy and that each handler already returns in multiple places (early exits for auth failures, validation errors, etc.), the simplest approach is to set the header in the global response middleware section. This requires passing which limiter group applied through handler execution. An even simpler approach: add the header to the response object in a post-handler step, keyed off the matched route. Define a route-to-limiter mapping alongside the routes table.

5. **Do not emit the header on the 503 global capacity response.** As argued above, `X-RateLimit-Limit` with the global ceiling on a 503 is misleading to per-IP clients.

### Proposed Tasks

- Create `src/rate-limits.js` with `RATE_LIMITS` constant
- Add `X-RateLimit-Limit` header to responses from all rate-limited handlers
- Skip the header on 503 responses from the global limiter
- Tests: verify header value matches config for capture endpoints, verify endpoints, signing-key endpoints; verify header absent on non-rate-limited endpoints (health, GET capture by ID); verify header present on both success and 429 responses

### Risks and Concerns

- **Drift between wrangler.toml and JS config**: This is the primary risk. Mitigations: (1) code comment with explicit "keep in sync" instruction, (2) a test that imports `RATE_LIMITS` and asserts the values match expectations (this catches accidental edits to the JS without updating the binding or vice versa, at least within the test environment where both are visible).
- **Header naming convention**: The issue says `X-RateLimit-Limit`. The emerging IETF standard (draft-ietf-httpapi-ratelimit-headers) uses `RateLimit-Limit` (no `X-` prefix). The `X-` prefix is deprecated per RFC 6648 but widely recognized. Stick with `X-RateLimit-Limit` as the issue specifies -- it matches what GitHub, Stripe, and most major APIs use. Can migrate to the standardized name later when the RFC is finalized.

---

## Cross-Cutting Risks

1. **Test environment rate limiter behavior**: The `[[unsafe.bindings]]` rate limiters work in the vitest cloudflare pool but may behave differently than production. Rate limit tests should use distinct `CF-Connecting-IP` values per test to avoid cross-test interference (this pattern is already established in `capture-integration.test.js`).

2. **Header ordering**: The global security headers are set at lines 52-57 of `src/index.js`, after the handler returns. If a handler sets `X-RateLimit-Limit` on its response, and the global block also sets it, the global block would overwrite it. The global block should NOT set rate limit headers -- leave that to handlers. No conflict expected with the current design, but worth noting.

3. **CORS + rate limit interaction**: A preflight OPTIONS request to `/v1/captures` should NOT consume a rate limit token. The OPTIONS handler must return before any rate limit check runs. This is naturally achieved by the early-exit pattern recommended above.

## Additional Agents Needed

- **security-minion**: Review the CORS allowlist parsing for injection risks, confirm the HSTS preload commitment is appropriate, validate that `X-RateLimit-Limit` does not leak sensitive capacity information.
- No other agents needed. These are all edge-layer changes within the existing Worker.
