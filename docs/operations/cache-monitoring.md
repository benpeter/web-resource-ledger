# Cache Monitoring

## Overview

WRL uses the Cloudflare Workers Cache API (`caches.default`) to cache verification endpoint responses at edge colos. This reduces origin load (D1 queries, signature verification) and improves latency for repeat requests.

## Cached Endpoints

| Endpoint | Cache Key | TTL | Condition |
|----------|-----------|-----|-----------|
| `GET /v1/verify/:id` | `{url}?_fmt=json` or `{url}?_fmt=html` | `immutable` (1y) | Only verified captures |
| `GET /.well-known/signing-key` | URL as-is | 3600s + 300s SWR | Always |
| `GET /.well-known/signing-keys` | URL as-is | 3600s + 300s SWR | Always |

Unverified captures, error responses, and quarantined captures are never cached.

## Observability

### Server-Timing Header

Every verification response includes a `Server-Timing` header:

```
Server-Timing: cache;desc="HIT", total;dur=12
Server-Timing: cache;desc="MISS", origin;dur=45, total;dur=52
```

Fields:
- `cache;desc="HIT|MISS|BYPASS"` — cache status
- `origin;dur=N` — origin latency in ms (only on MISS)
- `total;dur=N` — total request duration in ms

### Structured Logs

Cache events are logged to Coralogix:

```json
{
  "event": "verify.request",
  "cacheStatus": "hit",
  "colo": "FRA",
  "durationMs": 12,
  "captureId": "cap_abc123..."
}
```

For signing key endpoints:
```json
{
  "event": "signing_key.request",
  "cacheStatus": "miss",
  "colo": "FRA",
  "durationMs": 45
}
```

### Key Metrics to Monitor

1. **Cache hit ratio**: `count(cacheStatus="hit") / count(*)` per endpoint
   - Target: >80% for verification, >90% for signing keys
   - Alert if hit ratio drops below 50% for 15 minutes

2. **Origin latency (p50/p95)**: filter by `cacheStatus="miss"`
   - Baseline: p50 <50ms, p95 <200ms
   - Alert if p95 exceeds 500ms for 5 minutes

3. **Cache BYPASS rate**: should be near-zero for GET endpoints
   - BYPASS occurs only on rate-limited requests
   - Alert if BYPASS rate exceeds 10% for 10 minutes

## Coralogix Queries

### Cache Hit Ratio (last 1h)

```
source logs
| filter event == "verify.request"
| summarize
    total = count(),
    hits = count_if(cacheStatus == "hit"),
    misses = count_if(cacheStatus == "miss")
| extend hitRatio = hits * 100.0 / total
```

### Cache Status by Colo

```
source logs
| filter event =~ "verify|signing_key"
| summarize count() by colo, cacheStatus
| sort by colo asc, count_ desc
```

### Origin Latency Distribution (misses only)

```
source logs
| filter event == "verify.request" && cacheStatus == "miss"
| summarize
    p50 = percentile(originDurationMs, 50),
    p95 = percentile(originDurationMs, 95),
    p99 = percentile(originDurationMs, 99)
```

## Manual Verification

### Check Cache Status via curl

```bash
# First request (likely MISS)
curl -sI https://verify.webresourceledger.com/.well-known/signing-key | grep -i server-timing

# Second request from same colo (should be HIT)
curl -sI https://verify.webresourceledger.com/.well-known/signing-key | grep -i server-timing
```

### Force Cache Miss

The Workers Cache API doesn't support `Cache-Control: no-cache` bypass from clients. To force a miss:
1. Purge the cache: `./scripts/purge-cache.sh signing-keys`
2. The next request will be a MISS

### Verify Cache Purge

```bash
# Before purge — should show HIT
curl -sI https://verify.webresourceledger.com/.well-known/signing-key | grep -i server-timing

# Purge
./scripts/purge-cache.sh signing-keys

# After purge — should show MISS
curl -sI https://verify.webresourceledger.com/.well-known/signing-key | grep -i server-timing
```

## Cache Purge

See [Key Rotation Runbook](runbooks/key-rotation.md) for the signing key purge procedure.

Admin endpoint: `POST /v1/admin/cache/purge`

Purge targets:
- `signing-keys` — purges both `/.well-known/signing-key` and `/.well-known/signing-keys`
- `capture:cap_{id}` — purges both JSON and HTML variants of a specific capture
- `all` — purges everything (use sparingly)

## Troubleshooting

### Low Cache Hit Ratio

1. Check if traffic is spread across many unique capture IDs (cold cache for long tail)
2. Check colo distribution — small colos may have cold caches
3. Check if recent deploys triggered cache invalidation
4. Check if purge events are frequent (admin logs: `event=admin.cache_purge`)

### Unexpected BYPASS

BYPASS occurs when:
- The request was rate-limited (we skip cache for rate-limited requests to avoid caching rate limit responses)
- The Worker is running in preview mode

### Cache Serving Stale After Key Rotation

1. Verify purge was executed: check admin logs for `admin.cache_purge`
2. Verify purge was successful: check for `status=success` in logs
3. Re-purge if needed: `./scripts/purge-cache.sh signing-keys`
4. Wait up to 30s for global propagation
