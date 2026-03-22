# Outcome: Per-Tenant Rate Limiting

## What was built

Per-tenant rate limiting for all authenticated API endpoints, replacing
IP-based limiting for KV-auth tenants while preserving IP-based limiting
for legacy auth and unauthenticated endpoints.

### Core changes

1. **Three-layer rate limit architecture** (src/index.js, src/rate-limits.js)
   - CF binding ceiling: CAPTURE_RATE_LIMITER raised to 100/60s (hard backstop)
   - KV counter: per-tenant enforcement at 10/60s default with custom overrides
   - IP guard: new CAPTURE_IP_GUARD binding at 50/60s (abuse prevention)
   - `checkCaptureRateLimit()` helper encapsulates the three layers

2. **KV counter with batch support** (src/kv.js)
   - `rateLimitCounter()` accepts `count` parameter for batch increment
   - `getTenantConfig()` / `setTenantConfig()` for tenant configuration
   - `getEffectiveLimit()` merges tenant overrides with defaults, capped at ceiling
   - `rateLimitWindowId()` computes sliding window ID

3. **Handler updates** (src/index.js)
   - `handleCreateCapture`: dual-layer check, X-RateLimit-* headers on response
   - `handleBatchCapture`: upfront batch-size check (count=N), body parse
     moved before rate limiting
   - `handleListCaptures`: dual-layer check, X-RateLimit-* headers on response
   - Response pipeline: only sets X-RateLimit-Limit on unauthenticated endpoints
     (doesn't overwrite handler-set headers)

4. **MCP rate limiting** (src/mcp.js)
   - Added KV counter check after CF binding ceiling
   - Skips IP guard (no CF-Connecting-IP in MCP requests)
   - Returns dynamic Retry-After based on window reset

5. **429 differentiation** (src/responses.js)
   - `problemResponse()` accepts `extra` parameter for custom body fields
   - Tenant 429s include `limitType: 'tenant'` for machine-readable discrimination
   - IP guard 429s stay opaque (same as before)

6. **Admin endpoints** (src/index.js)
   - `GET /v1/admin/tenants/{tenantId}/config` — read tenant configuration
   - `PUT /v1/admin/tenants/{tenantId}/config` — set rate limit overrides
   - Rate limit overrides take effect without redeployment (KV-based)

7. **Response headers** (on success and 429 responses for KV-auth tenants)
   - `X-RateLimit-Limit`: effective limit for the tenant
   - `X-RateLimit-Remaining`: remaining requests in current window
   - `X-RateLimit-Reset`: seconds until window resets

### Configuration files

- `wrangler.toml`: CAPTURE_IP_GUARD binding (50/60s), CAPTURE_RATE_LIMITER
  raised to 100/60s, both prod and staging
- `src/rate-limits.js`: default limits, IP guard limits, ceiling constant,
  `getEffectiveLimit()` helper

## Test results

675 tests pass, 2 skipped (pre-existing skips for miniflare rate limit
testing limitations). Test infrastructure updated to seed tenant config
with higher limits for batch tests and clean up `rl:` prefix keys.

## What deviated from plan

- No deviations from the synthesized plan. All 4 tasks completed as specified.
- The 9 advisories from Phase 3.5 review were incorporated during synthesis
  (before execution), so no mid-execution adjustments needed.

## Backlog changes

- Moved "Per-tenant rate limiting" from Parking Lot to Done
- Added "Per-endpoint differentiated limits" to Parking Lot (deferred from
  issue scope — all authenticated endpoints share one `capture` group for now)
- Added "Billing-tier-based limits" to Parking Lot (explicitly out of scope
  per issue #94)
