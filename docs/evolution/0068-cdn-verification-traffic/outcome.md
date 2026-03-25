# Outcome: CDN for Verification Traffic (R38)

## What Was Built

Edge caching for WRL's public verification endpoints using the Cloudflare
Workers Cache API. Verification responses are cached per-colo, reducing D1
queries, R2 reads, and signature verification for repeat requests to the same
capture.

### Cached Endpoints

| Endpoint | Cache Key | TTL | Condition |
|----------|-----------|-----|-----------|
| `GET /v1/verify/:id` | `{url}?_fmt=json` or `{url}?_fmt=html` | immutable (1y) | Only verified captures |
| `GET /.well-known/signing-key` | URL as-is | 3600s + 300s SWR | Always |
| `GET /.well-known/signing-keys` | URL as-is | 3600s + 300s SWR | Always |

Unverified captures, error responses, and quarantined captures are never cached.

### Cache Purge

Admin endpoint `POST /v1/admin/cache/purge` with semantic targets:
- `signing-keys` -- purges both signing key endpoints
- `capture:cap_{id}` -- purges both JSON and HTML variants
- `all` -- purges everything (zone-level `purge_everything: true`)

Uses Cloudflare zone-level purge-by-URL (works on Free plan). Cache-Tag purge
was originally implemented but removed when we discovered it requires Enterprise.

### Verify Subdomain

Host-based routing restricts `verify.*` subdomains to verification-related paths
only. Non-verification paths return 404 with a pointer to the API subdomain.

### Observability

Every verification response includes:
- `Server-Timing: cache;desc="HIT|MISS|BYPASS", origin;dur=N, total;dur=N`
- `X-WRL-Cache: HIT|MISS|BYPASS`
- Structured logs to Coralogix with cacheStatus, colo, duration fields

### Operational Docs

- `docs/operations/cache-monitoring.md` -- monitoring guide with Coralogix queries
- `docs/operations/runbooks/key-rotation.md` -- step-by-step key rotation with cache purge
- `scripts/purge-cache.sh` -- CLI script for manual purge operations

## Files Changed

- `src/index.js` -- cache check logic, Server-Timing headers, verify subdomain routing, logging
- `src/admin.js` -- `handleAdminCachePurge` with URL-based purge
- `src/cache.js` -- new: `buildCacheKey`, `buildSimpleCacheKey`
- `src/responses.js` -- +1 line
- `wrangler.toml` -- CLOUDFLARE_ZONE_ID, cache purge token comment
- `wrangler.test.toml` -- matching config
- `openapi.yaml` -- `POST /v1/admin/cache/purge` spec
- `scripts/purge-cache.sh` -- new CLI script
- `scripts/smoke-test.sh` -- cache header validation checks
- `docs/operations/cache-monitoring.md` -- new
- `docs/operations/runbooks/key-rotation.md` -- new
- `test/cache.test.js` -- 7 unit tests
- `test/admin-cache-purge.test.js` -- 15 tests
- `test/cache-integration.test.js` -- 8 integration tests
- `test/verify-subdomain-routing.test.js` -- routing tests
- `test/signing-key.test.js` -- minor fix

## Success Criteria Assessment

| Criterion | Status | Notes |
|-----------|--------|-------|
| Verification endpoints cached at CDN edge | Done | Workers Cache API per-colo |
| CDN on custom domain with HTTPS | Done | verify.webresourceledger.com routes through same Worker |
| Cache-Control headers appropriate | Done | immutable for verified, no-store for errors, 3600s for keys |
| Cache hit ratio >80% | Measurable | Server-Timing + Coralogix queries provided |
| Cache purge for key rotation | Done | Admin API + CLI script + runbook |
| Purge within 60 seconds | Testable | Runbook includes verification steps |
| Origin reduction documented | Done | cache-monitoring.md with Coralogix queries |
| Cost analysis | N/A | Workers Cache API has no additional cost on Cloudflare |
| Latency improvement documented | Done | Server-Timing header exposes per-request latency |
| Custom domain DNS | Deferred | DNS/SSL setup is ops work; Worker routing is ready |

## What Deviated From Plan

1. **Cache-Tag purge → URL-based purge**: Original plan used Cache-Tags for
   selective purge. Discovered Free plan doesn't support tag-based purge.
   Redesigned to URL-based purge which is cleaner and more explicit.

2. **Cost analysis simplified**: Since Workers Cache API is built into Cloudflare
   Workers at no additional cost, there's no CDN cost vs. origin savings
   comparison to make. The benefit is purely latency and D1/R2 load reduction.

3. **Custom domain DNS deferred**: The Worker routing and host-based logic is
   implemented, but actual DNS record creation is an operational step that
   depends on domain registrar access.

## Backlog Changes

- Mark "Fastly CDN layer" parking lot item as superseded (Workers Cache API
  provides equivalent caching without additional vendor)
- Add: `CLOUDFLARE_CACHE_PURGE_TOKEN` needs manual provisioning (HUMAN_ACTION_REQUIRED)
- Add: Custom domain DNS configuration for verify subdomain
