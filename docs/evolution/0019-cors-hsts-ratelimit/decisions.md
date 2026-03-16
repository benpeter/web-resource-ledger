# Decisions: 0019-cors-hsts-ratelimit

## D1: CORS env var name -- `CORS_ORIGINS` vs `CORS_ALLOWED_ORIGINS`

**Options considered:**
1. `CORS_ALLOWED_ORIGINS` -- explicit, self-describing
2. `CORS_ORIGINS` -- terse, matches project naming convention

**Decision:** `CORS_ORIGINS`.

**Rationale:** The project uses short, unambiguous variable names throughout (`SIGNING_KEY`, not `ED25519_SIGNING_KEY_PKCS8`; `KV`, not `KV_NAMESPACE`). "CORS" already implies an allowlist -- there is no use case for a CORS denylist. Spelling it out adds length without adding meaning.

## D2: CORS header application scope -- route-local vs global response pipeline

**Options considered:**
1. Apply CORS headers only inside the OPTIONS handler and POST route handler
2. Apply CORS headers in the global response pipeline for all `/v1/captures` POST and OPTIONS responses

**Decision:** Option 2. CORS headers injected in the global response pipeline for matching requests.

**Rationale:** A 401 that omits `Access-Control-Allow-Origin` causes browsers to surface a CORS error instead of the authentication error, making debugging opaque to the caller. By applying CORS headers globally on all responses to POST `/v1/captures` (and OPTIONS), error responses -- 401, 400, 429, 503 -- carry the correct headers and the real status code is visible. Route-local application would require threading CORS headers through every early-exit path (auth check, validation, rate limit) and would be brittle to future additions.

## D3: Rate limit config -- `src/rate-limits.js` module vs `[vars]` in wrangler.toml

**Options considered:**
1. Export a config object from `src/rate-limits.js` -- one sync point (recommended by edge-minion)
2. Add display values as `[vars]` in wrangler.toml -- explicit, config-file-driven (recommended by ux-strategy-minion, citing operator discoverability)
3. Hardcode the ceiling value directly in the response header construction

**Decision:** Option 1. Single config module in `src/rate-limits.js`.

**Rationale:** edge-minion's argument: wrangler.toml `[vars]` would create four sync points -- the wrangler.toml definition, the staging override, the Worker binding read, and the actual rate limiter configuration. A shared module is one sync point. ux-strategy-minion's discoverability argument is valid for operator-facing config, but the rate limit ceiling is an implementation constraint that belongs in code, not operator config. Hardcoding (Option 3) was rejected outright: values would diverge from the actual limiter on any future adjustment.

## D4: Access-Control-Max-Age value -- 7200 vs 86400

**Options considered:**
1. 86400 (24 hours) -- common default
2. 7200 (2 hours) -- Chrome's effective cap

**Decision:** 7200.

**Rationale:** Chrome silently caps `Access-Control-Max-Age` at 7200 seconds regardless of the declared value. Advertising 86400 would be a misleading header -- clients observing the header would expect 24-hour preflight caching but get 2-hour caching in Chrome. Using the effective maximum avoids the discrepancy. `Cache-Control: no-store` added to OPTIONS responses to prevent CDN-layer caching of preflight responses, which could serve stale origin allowlists.

## D5: No global capacity exposure in X-RateLimit-Limit

**Options considered:**
1. Report per-IP ceiling only (100 requests/minute)
2. Report both per-IP and global ceilings
3. Add X-RateLimit-Remaining and X-RateLimit-Reset headers alongside X-RateLimit-Limit

**Decision:** Per-IP ceiling only. No X-RateLimit-Remaining or X-RateLimit-Reset. Global capacity (200/min) not disclosed. 503 responses from the global limiter do NOT carry X-RateLimit-Limit.

**Rationale:** The global limiter protects against distributed load across all clients -- exposing its ceiling would allow adversaries to coordinate requests just below the threshold. Per-IP ceiling is the client-relevant number. X-RateLimit-Remaining and X-RateLimit-Reset were rejected: the Cloudflare rate limiter does not expose remaining count or reset timestamp via its binding API, so implementing them would require approximation or a separate counter, adding complexity for unclear benefit (YAGNI). 503s from the global limiter intentionally omit the header to avoid leaking the global threshold.

## D6: Existing GET wildcard CORS unchanged

**Decision:** No changes to `Access-Control-Allow-Origin: *` on GET endpoints.

**Rationale:** Public read endpoints (GET `/v1/captures`, GET `/v1/captures/:id`, GET `/.well-known/signing-keys`, GET `/verify`, GET `/health`) serve unauthenticated, public data. Wildcard CORS on read-only endpoints is correct and carries no risk. Restricting it to configured origins would break legitimate use cases (verification pages, third-party tooling) without security benefit.

## Rejected alternatives

- **JSON env var for CORS origins**: A comma-separated string (`https://app.example.com,https://other.example.com`) is robust enough for an allowlist and matches wrangler secret behavior. JSON parsing adds failure modes (malformed JSON silently breaks CORS) for no gain.
- **Subdomain/wildcard matching in CORS** (`*.example.com`): Security footgun. A compromised subdomain becomes a CORS bypass. The allowlist must be explicit origins.
- **X-RateLimit-Remaining and X-RateLimit-Reset**: Cloudflare's rate limiter binding does not expose these values. Approximation is not acceptable for a header that clients rely on for backoff logic.
- **Separate env vars for rate limit display values**: Four sync points vs one module. YAGNI -- the ceiling is an implementation constant, not operator config.
