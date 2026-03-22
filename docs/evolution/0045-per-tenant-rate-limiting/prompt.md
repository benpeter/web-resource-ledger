# Phase 0045: Per-Tenant Rate Limiting

## Source

GitHub Issue: #94 (R21: Per-tenant rate limiting)

## Task Description

Authenticated API endpoints are rate-limited per tenant (by tenantId) instead of per IP. IP-based limits remain as a secondary guard against abuse. Tenants receive rate limit headers and can have custom limits via KV metadata.

## Success Criteria

- Authenticated endpoints (POST /v1/captures, GET /v1/captures) use tenantId as the rate limit key
- Unauthenticated endpoints and requests without valid auth continue to use IP-based limiting
- IP-based rate limiting remains active as a secondary ceiling (prevents a single IP from consuming a tenant's entire quota)
- `X-RateLimit-Remaining` header is returned on rate-limited endpoints showing remaining requests in the current window
- Default per-tenant limits are configurable via wrangler.toml or Worker secrets (not hardcoded)
- Tenant-specific overrides can be stored in KV key metadata (e.g., `tenant:{tenantId}:rate-limit`)
- 429 responses include a `Retry-After` header
- Rate limit changes take effect without redeployment (KV-based overrides)

## Scope

- In: Per-tenant rate limit key for authenticated endpoints, IP secondary guard, X-RateLimit-Remaining header, KV-based tenant overrides, default config
- Out: Per-endpoint differentiated limits (all authenticated endpoints share one tenant limit for now), billing-tier-based limits (deferred to R26), rate limit analytics dashboard

## Constraints

- Depends on R12 (per-tenant API keys) which is done -- tenantId is available in the auth middleware
- Cloudflare rate limiting bindings use a string key; switching from IP to tenantId is the core change
- Must not regress existing IP-based rate limiting for unauthenticated traffic
