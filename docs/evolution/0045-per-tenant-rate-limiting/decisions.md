# Decisions: Per-Tenant Rate Limiting

## D1: Three-layer architecture (CF binding + KV counter + IP guard)

**Chosen**: CF binding as hard ceiling (100/60s) → KV counter for per-tenant
enforcement (default 10/60s) → separate IP guard binding (50/60s)

**Over**: Single CF binding with tenant key (no custom overrides possible),
pure KV-only counting (no hard backstop if KV is slow)

**Why**: CF bindings are compile-time — you can't change the limit per tenant.
KV counters enable per-tenant overrides from config, but KV reads can be
eventually consistent. The CF binding ceiling catches runaway usage even if
KV is stale. The IP guard prevents a single IP from consuming an entire
tenant's quota.

## D2: Single rate limit group for all authenticated endpoints

**Chosen**: All authenticated endpoints (POST /v1/captures, POST
/v1/captures/batch, GET /v1/captures) share one `capture` rate limit group.

**Over**: Separate `read` and `capture` groups (lucy and margo both
recommended against this in Phase 3.5 review)

**Why**: No demonstrated need for separate limits. Adding groups adds
complexity to the admin config schema and the mental model. A tenant
hitting their capture limit also gets their list calls blocked, which is
the correct back-pressure signal.

## D3: Legacy auth stays on IP-only rate limiting

**Chosen**: `authMethod === 'legacy'` (X-Capture-Key header) uses existing
CF binding with clientIp key — unchanged behavior.

**Over**: Migrating legacy auth to per-tenant KV counters

**Why**: Legacy auth uses tenantId `default`, so all legacy users share one
bucket. Per-tenant limiting on a shared bucket would create a DoS vector
where one legacy user exhausts the limit for all. IP-based limiting is the
correct model for shared-tenant auth.

## D4: Batch endpoint checks entire batch upfront

**Chosen**: KV counter is consumed for `count = urls.length` in a single
check before processing any URLs.

**Over**: Per-URL KV counter checks in the loop

**Why**: Prevents bypass where a client submits many small batches faster
than the window can track. One upfront check is also cheaper (1 KV read
instead of N).

## D5: X-RateLimit-* headers over IETF draft RateLimit fields

**Chosen**: Keep `X-RateLimit-Limit`, `X-RateLimit-Remaining`,
`X-RateLimit-Reset` headers.

**Over**: IETF draft `RateLimit` header (draft-ietf-httpapi-ratelimit-headers)

**Why**: KISS. The X-RateLimit-* headers are universally understood by API
clients and documented everywhere. The IETF draft is still evolving and
uses a different format. Switching adds no value for current consumers.

## D6: `limitType` field in 429 for tenant vs IP discrimination

**Chosen**: Add `limitType: 'tenant'` to the problem+json 429 response body
for tenant rate limits. IP guard 429s stay opaque (no extra field).

**Over**: Using the RFC 9457 `type` URI field, separate error codes, or
different detail messages only

**Why**: Machine-readable discrimination lets API clients distinguish "your
tenant quota is exhausted" from "your IP is being throttled" and respond
differently (e.g., wait vs switch IP). Using a custom extension field
avoids overloading the RFC 9457 `type` URI.

## D7: `setTenantConfig` is pure write (no read-before-write merge)

**Chosen**: PUT /v1/admin/tenants/{id}/config replaces the entire config
document.

**Over**: PATCH semantics with merge

**Why**: Simpler, no race conditions. The admin sends the complete desired
state. Avoids read-modify-write races when two admins update simultaneously.

## D8: Counter exceeded check uses `(current + count) > limit`

**Chosen**: `exceeded = (current + count) > limit`

**Over**: `exceeded = current >= limit` (original single-request check)

**Why**: Generalizes correctly for batch (count > 1). With count=1, this
is equivalent to `current >= limit`. The check blocks at the boundary:
limit=10, current=10 → (10+1) > 10 → true. Allows exactly `limit`
requests per window.
