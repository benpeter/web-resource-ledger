Combined task from GitHub issues #33, #34, and #35:

## Issue #33: R3: CORS for capture POST

Outcome: Browser-based clients can POST to `/v1/captures` from permitted origins
without CORS blocking the response (including error responses).

Success criteria:
- `OPTIONS /v1/captures` returns correct preflight response with configurable origins
- CORS response headers applied to all `POST /v1/captures` responses (200, 401, 400, 429, 503)
- Allowed origins configurable via environment variable
- Browsers do not hide real error codes behind CORS errors

## Issue #34: R4: HSTS preload submission

Outcome: The `Strict-Transport-Security` header is upgraded to include the
`preload` directive, making WRL eligible for submission to the HSTS preload list.

Success criteria:
- HSTS header includes `preload` directive alongside `max-age` and `includeSubDomains`
- `max-age` meets HSTS preload minimum requirement (≥31536000)
- Header served on all responses
- Post-merge: domain submitted to hstspreload.org

## Issue #35: R5: X-RateLimit-Limit header

Outcome: Clients can inspect the rate limit ceiling from response headers without
consulting documentation.

Success criteria:
- `X-RateLimit-Limit` header present on all responses from rate-limited endpoints
- Reports per-IP ceiling only (not global capacity)
- Value matches configured rate limit
- 503 responses from global limiter do NOT carry this header

## Orchestration directives

- Combined all three issues in one PR (small, well-scoped, header-level changes)
- R3, R4, R5 are the remaining Act 1 security hardening items
- Evolution directory: 0019-cors-hsts-ratelimit
