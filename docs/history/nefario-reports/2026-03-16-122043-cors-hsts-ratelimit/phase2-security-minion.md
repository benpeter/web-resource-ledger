## Domain Plan Contribution: security-minion

### Recommendations

#### R3: CORS for capture POST endpoint

**(1) Env var format: comma-separated, not JSON.**

Use `CORS_ORIGINS` as a comma-separated string (e.g., `https://example.com,https://app.example.com`). Rationale:
- Cloudflare Workers `[vars]` are plain strings. JSON inside a TOML string requires escaping, which is error-prone and ugly in `wrangler secret put`.
- Comma-separated is the dominant convention for origin allowlists (Express cors, Fastly, Nginx).
- Parse at startup: `env.CORS_ORIGINS ? env.CORS_ORIGINS.split(',').map(s => s.trim()).filter(Boolean) : []`.
- Each value MUST be validated as a full origin (`https://host` or `https://host:port`) -- never a bare hostname, never a pattern with wildcards, never a path.

**(2) Access-Control-Allow-Headers and Access-Control-Allow-Methods.**

For the OPTIONS preflight response on `POST /v1/captures`:
- `Access-Control-Allow-Methods: POST` -- only the method actually used. Do not include GET, PUT, DELETE, etc.
- `Access-Control-Allow-Headers: Content-Type, Authorization` -- these are the two headers the POST endpoint actually reads. `Content-Type: application/json` triggers a preflight (it is not a CORS-safelisted value), and `Authorization: Bearer ...` is always preflight-triggering.
- Do NOT include a blanket `Access-Control-Allow-Headers: *`. Wildcard is not supported for credentialed requests and would be overly permissive even for non-credentialed ones.

**(3) CORS headers on the POST response: yes, mandatory.**

The browser enforates CORS on the actual response, not just the preflight. If the POST response lacks `Access-Control-Allow-Origin`, the browser will block the JavaScript from reading the response body (the 202 JSON with the capture ID and status URL). Both the OPTIONS preflight and the POST response MUST include:
- `Access-Control-Allow-Origin: <matched-origin>` (echo the specific origin, never `*` for credentialed requests)
- `Vary: Origin` (required when the response varies by Origin header -- without this, shared caches could serve the wrong CORS headers to a different origin)

**(4) Empty/missing allowlist behavior: strict deny.**

When `CORS_ORIGINS` is empty or absent:
- OPTIONS requests to `/v1/captures` should return `204 No Content` with NO `Access-Control-Allow-Origin` header. The browser will treat this as a denied preflight and block the cross-origin request.
- POST responses should NOT include any `Access-Control-Allow-Origin` header.
- This is the correct "default closed" behavior per the issue spec.
- Important: never fall back to `*` when the allowlist is empty. That would invert the security model.

**(5) Access-Control-Max-Age: 7200 seconds (2 hours).**

- `Access-Control-Max-Age: 7200` is a good balance. It reduces preflight traffic without caching stale CORS policy for too long.
- Chrome caps at 7200 anyway. Firefox caps at 86400. Safari at 604800. So 7200 is the practical maximum for Chrome.
- This value goes on the OPTIONS response only.

**(6) Existing GET wildcard: acceptable, no security regression.**

The GET endpoints (`/v1/captures/{id}`, `/v1/verify/{id}`, `/.well-known/signing-key`, etc.) currently use `Access-Control-Allow-Origin: *`. This is correct and safe because:
- These are public, unauthenticated endpoints. Wildcard CORS on public read-only data is the standard pattern (same as any public API).
- `Access-Control-Allow-Origin: *` explicitly cannot be combined with `Access-Control-Allow-Credentials: true` -- the browser will reject it. So there is no credential leakage risk.
- The new restrictive POST CORS and the existing permissive GET CORS can coexist without conflict. They operate on different routes.
- One nuance: `GET /v1/captures` (list captures) is authenticated and does NOT currently set `Access-Control-Allow-Origin: *`. That is correct -- it should stay that way. If browser extensions need list access in the future, it should be added to the origin allowlist alongside the POST endpoint.

**Implementation architecture:**

The CORS logic should be a single function called from the router, NOT scattered across individual handlers. Recommended approach:

```
// Pseudocode for the router in fetch()
if (request.method === 'OPTIONS') {
  return handleCorsPreflightIfApplicable(request, env);
}
// ... normal routing ...
// After handler returns response, apply CORS to POST response:
if (request.method === 'POST' && isCorsRequest(request)) {
  applyCorsHeaders(request, response, env);
}
```

The OPTIONS handler must be registered BEFORE the normal route matching, because the current route table only has `['POST', ...]` -- an OPTIONS request to the same path would fall through to the 404 catch-all.

**Origin validation must be exact string match.** The `Origin` header value from the browser is compared against the allowlist entries. No regex, no subdomain matching, no protocol stripping. `https://app.example.com` matches only `https://app.example.com`.

#### R4: HSTS preload submission

Current header (line 55 of `src/index.js`):
```
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

Required change:
```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

Security notes:
- `max-age=63072000` (2 years) is the minimum required by hstspreload.org. The current value of 31536000 (1 year) is insufficient for preload submission.
- The `preload` directive is a commitment: once on the preload list, removing HSTS requires a multi-month delisting process. Ensure every subdomain of the domain supports HTTPS before submitting.
- This change has no code risk -- it is a single string constant change with immediate effect.
- The existing security-headers test checks `max-age >= 31536000`. Update it to check `>= 63072000` and assert `preload` is present.

#### R5: X-RateLimit-Limit response header

Add `X-RateLimit-Limit` to all rate-limited endpoint responses. Based on `wrangler.toml`:

| Endpoint | Rate limiter | Limit value |
|----------|-------------|-------------|
| `POST /v1/captures` | `CAPTURE_RATE_LIMITER` | 10 |
| `GET /v1/captures` | `CAPTURE_RATE_LIMITER` | 10 |
| `GET /v1/verify/{id}` | `VERIFY_RATE_LIMITER` | 60 |
| `GET /.well-known/signing-key` | `VERIFY_RATE_LIMITER` | 60 |
| `GET /.well-known/signing-keys` | `VERIFY_RATE_LIMITER` | 60 |

Security notes:
- The header value should come from a config constant in code, NOT from the rate limiter binding itself (which does not expose its config). Hard-code the values as named constants that mirror `wrangler.toml`.
- Only `X-RateLimit-Limit` -- no `X-RateLimit-Remaining` or `X-RateLimit-Reset`. These would leak rate limiter state that aids timing-based evasion (an attacker can probe remaining budget and burst right before reset).
- The header should appear on ALL responses from rate-limited endpoints, including successful ones, 429s, and error responses. This is the "discovery" use case.
- The 429 response already includes `Retry-After`, which is sufficient for backoff. `X-RateLimit-Limit` adds budget discovery.
- The global capacity limiter (`GLOBAL_CAPTURE_LIMITER`) should NOT be exposed via headers. It is an internal capacity protection mechanism, not a per-client budget. Exposing it would leak operational capacity information.

### Proposed Tasks

1. **Add CORS origin allowlist parsing** -- New env var `CORS_ORIGINS` (comma-separated). Parse function with validation: must be `https://` origins (no trailing slash, no path, no wildcard). Add to `vitest.config.js` miniflare bindings for test origins.

2. **Add OPTIONS preflight handler** -- Before route matching in `fetch()`, intercept `OPTIONS` requests to `/v1/captures`. Return 204 with `Access-Control-Allow-Origin`, `Access-Control-Allow-Methods: POST`, `Access-Control-Allow-Headers: Content-Type, Authorization`, `Access-Control-Max-Age: 7200`. Apply all security headers (HSTS, X-Content-Type-Options, etc.) to the OPTIONS response too.

3. **Add CORS headers to POST /v1/captures response** -- After the handler returns, if the request has an `Origin` header that matches the allowlist, add `Access-Control-Allow-Origin: <origin>` and `Vary: Origin` to the response. If origin does not match or allowlist is empty, do not add CORS headers.

4. **Update HSTS header to preload-ready** -- Change max-age to 63072000, add `preload` directive. Update security-headers test to assert new values.

5. **Add X-RateLimit-Limit header** -- Define rate limit constants. Add header to all responses from rate-limited handlers. Test that the header appears on 200, 429, and error responses.

6. **CORS test suite** -- Tests for: (a) allowed origin gets correct preflight response, (b) disallowed origin gets no CORS headers, (c) missing Origin header gets no CORS headers, (d) empty allowlist means no CORS on POST, (e) GET wildcard CORS unaffected, (f) preflight caching header present, (g) Vary: Origin on POST response, (h) POST response without matching origin has no CORS headers.

7. **HSTS test updates** -- Assert `max-age=63072000`, `includeSubDomains`, and `preload` are all present.

8. **X-RateLimit-Limit test suite** -- Assert header present on rate-limited endpoints, absent on non-rate-limited endpoints (e.g., `GET /health`), correct value per endpoint.

### Risks and Concerns

**RISK: CORS header injection via Origin header reflection.** The implementation echoes the `Origin` header value back in `Access-Control-Allow-Origin`. If the allowlist check is bypassed or implemented incorrectly (e.g., substring match instead of exact match), an attacker-controlled origin could be reflected. Mitigation: exact string match against the parsed allowlist array. Never use `.includes()` on the allowlist string directly -- always compare against the split array entries.

**RISK: Vary header omission causing cache poisoning.** Without `Vary: Origin`, a CDN or browser cache could cache a CORS-enabled response and serve it for a different origin (or vice versa). This is a real attack vector on Cloudflare Workers if the worker sits behind a CDN cache. Mitigation: always include `Vary: Origin` on any response where CORS headers are conditionally applied based on the Origin.

**RISK: HSTS preload is a long-term commitment.** Once submitted and accepted into the Chromium preload list, removal takes months. Ensure the domain and all subdomains support HTTPS before submitting. This is an operational decision, not a code risk.

**RISK: Rate limit constant drift from wrangler.toml.** If someone changes the rate limiter `simple.limit` in `wrangler.toml` but forgets to update the code constant, the header will report a wrong value. Mitigation: add a code comment cross-referencing the wrangler.toml values, and consider a test that imports or reads both sources. Pragmatically, for a single-operator project, the comment is sufficient.

**LOW RISK: OPTIONS method on other paths.** The implementation should only handle OPTIONS for paths that need preflight (currently just `/v1/captures` for POST). An OPTIONS to any other path should return the normal 404. Do not add a global OPTIONS catch-all -- that would be overly permissive and could mask routing bugs.

**NO RISK: GET wildcard CORS coexistence.** As analyzed above, the existing `Access-Control-Allow-Origin: *` on GET endpoints is safe and does not conflict with the restrictive POST CORS. No changes needed to GET endpoints.

### Additional Agents Needed

- **edge-minion** (or equivalent Cloudflare Workers specialist): To verify the implementation handles Cloudflare Workers-specific behavior correctly -- particularly around `Vary` header interaction with Cloudflare's cache layer, and whether the Workers runtime sets any default CORS headers that could conflict.
- **test-minion**: To implement the CORS test matrix covering all origin/method/header combinations, including negative tests for cache poisoning vectors (`Vary: Origin` correctness).
