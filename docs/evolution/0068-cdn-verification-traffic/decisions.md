# Decisions: CDN for Verification Traffic (R38)

## D1: Workers Cache API vs. External CDN

**Chosen**: Cloudflare Workers Cache API (`caches.default`)
**Over**: Fastly CDN layer, Cloudflare Page Rules, Cloudflare Cache Rules
**Why**: Workers already run on Cloudflare's edge -- the Cache API gives per-colo
caching without additional services, DNS changes, or billing. The constraint in
the issue explicitly called this out. Fastly would add a second vendor for no
measurable benefit. Page Rules / Cache Rules are zone-level config that can't
express "cache only verified captures" logic.

## D2: URL-based purge vs. Cache-Tag purge

**Chosen**: Zone-level purge-by-URL (`{ files: [...] }`)
**Over**: Cache-Tag purge (`{ tags: [...] }`)
**Why**: Cache-Tag purge requires Cloudflare Enterprise plan. The zone is on the
Free plan. Discovered by querying the Cloudflare API for zone details.
URL-based purge works on all plans and is actually more explicit -- the response
shows exactly which URLs were purged.

**Consequence**: Removed all Cache-Tag response headers that had been added
(they were inert on Free plan). The semantic target system (`signing-keys`,
`capture:cap_{id}`, `all`) expands to concrete URLs internally.

## D3: Cache ordering -- quarantine before cache

**Chosen**: Quarantine D1 lookup BEFORE cache check
**Over**: Cache check first, then quarantine
**Why**: A quarantined capture must never be served from cache. If cache check
came first, a verified capture that was later quarantined would still be served
from the cache until TTL expiry. The quarantine check adds one D1 query per
request (even cache hits), but correctness trumps performance here.

## D4: stale-while-revalidate for signing keys

**Chosen**: `stale-while-revalidate=300` (5 minutes)
**Over**: Original value of `86400` (24 hours)
**Why**: During key rotation, a 24-hour SWR window means clients could use a
stale signing key for up to 24 hours after purge. 5 minutes provides a
reasonable buffer for edge propagation while limiting stale key exposure.
Combined with the 3600s max-age and cache purge, key rotation completes
within minutes.

## D5: Verify subdomain routing

**Chosen**: Host-based allowlist in the Worker (`url.hostname.startsWith('verify')`)
**Over**: Separate Worker per subdomain, Cloudflare route patterns
**Why**: Single Worker handles all subdomains. The allowlist is 5 regex patterns
covering verification paths, health, and artifacts. Non-allowed paths return 404
with a helpful message pointing to the API subdomain. This keeps the deployment
simple (one Worker, one wrangler.toml) while providing subdomain isolation.

## D6: Cache key normalization for content negotiation

**Chosen**: Synthetic `?_fmt=json|html` query parameter on cache key URL
**Over**: Separate cache entries by Accept header, Vary header
**Why**: Workers Cache API doesn't implement HTTP Vary semantics. Two requests
with different Accept headers to the same URL would overwrite each other in
cache. The synthetic parameter creates distinct cache keys for JSON and HTML
responses.

## D7: Server-Timing header for observability

**Chosen**: W3C Server-Timing header (`cache;desc="HIT"`, `origin;dur=N`, `total;dur=N`)
**Over**: Custom X- headers only, no timing headers
**Why**: Server-Timing is a standard header that browser DevTools render natively.
It provides cache status and latency data without requiring Coralogix access.
Also added X-WRL-Cache for programmatic consumers (simpler to parse than
Server-Timing).
