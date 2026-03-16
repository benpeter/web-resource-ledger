# Outcome: 0019-cors-hsts-ratelimit

## What was built

### R3: CORS for capture POST (#33)

- **src/index.js**: OPTIONS handler added for `/v1/captures` (path-specific, returns 204). CORS response headers (`Access-Control-Allow-Origin`, `Access-Control-Allow-Methods`, `Access-Control-Allow-Headers`, `Access-Control-Max-Age`) injected in global response pipeline for all POST `/v1/captures` and OPTIONS responses. Allowed origins read from `CORS_ORIGINS` env var (comma-separated list); requests from non-listed origins get no CORS headers (browser blocks them as intended).
- **wrangler.toml**: `CORS_ORIGINS` var added to `[vars]` block with placeholder value.
- **test/cors.test.js**: New test file with 15 cases covering: preflight happy path, preflight from unlisted origin, preflight missing Origin, allowed-origin POST, cross-origin POST (401 carries CORS headers), cross-origin POST (400 carries CORS headers), cross-origin POST (429 carries CORS headers), non-CORS POST unaffected, OPTIONS on non-CORS path unaffected, `Cache-Control: no-store` on preflight response, `Access-Control-Max-Age: 7200`, and others.

### R4: HSTS preload (#34)

- **src/index.js**: `Strict-Transport-Security` header updated to add `; preload` directive. Full value: `max-age=31536000; includeSubDomains; preload`.
- **test/security-headers.test.js**: HSTS assertion updated to expect `preload` directive.

### R5: X-RateLimit-Limit (#35)

- **src/rate-limits.js**: New module exporting rate limit config constants (`PER_IP_LIMIT`, `GLOBAL_LIMIT`, `WINDOW_SECONDS`). Single sync point for all rate limit values used in the Worker.
- **src/index.js**: `X-RateLimit-Limit` header added to global response pipeline for rate-limited endpoints. Reports `PER_IP_LIMIT`. Global limiter 503 responses do not carry the header.
- **test/capture-integration.test.js**, **test/list-captures.test.js**, **test/verify-integration.test.js**, **test/signing-key.test.js**, **test/health.test.js**: `X-RateLimit-Limit` assertions added to expected headers across 5 existing test files.

### OpenAPI

- **openapi.yaml**: Bumped to version 0.3.0. CORS headers (`Access-Control-Allow-Origin`, `Access-Control-Allow-Methods`, `Access-Control-Allow-Headers`, `Access-Control-Max-Age`) added as response header components. OPTIONS operation added for `/v1/captures`. HSTS header value updated to include `preload`. `X-RateLimit-Limit` header added to rate-limited endpoint responses. `vitest.config.js`: test file list updated to include `cors.test.js`.

## Test results

434 tests pass across 21 test files (15 new CORS tests + net additions to 5 existing files).

## Operator action required

After the PR merges and the updated header is confirmed live in production:

1. Submit domain to [hstspreload.org](https://hstspreload.org) -- this is a one-way operation. Verify the `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload` header is served correctly on the apex domain before submitting.

## What deviated from the plan

None. All three issues implemented as specified. No scope changes during execution.

## Backlog changes

- ~~#33 **R3: CORS for capture POST**~~ -- DONE
- ~~#34 **R4: HSTS preload submission**~~ -- DONE (header change complete; domain submission is a post-merge manual step)
- ~~#35 **R5: X-RateLimit-Limit header**~~ -- DONE
