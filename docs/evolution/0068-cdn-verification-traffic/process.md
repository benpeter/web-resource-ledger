# Process: CDN for Verification Traffic (R38)

## TL;DR

Five-task execution across three sessions (context continuations) to add edge
caching for WRL's verification endpoints. Key discovery: Cache-Tag purge
requires Enterprise plan, forcing a redesign from tag-based to URL-based purge.
The implementation adds per-colo caching via Workers Cache API, a cache purge
admin endpoint, verify subdomain routing, Server-Timing observability headers,
and operational documentation. 17 files changed, +1318/-34 lines, 30+ new tests.

## Planning Phase

### Team Selection (Phase 1)

The meta-plan identified 4 specialists for planning:
- **edge-minion** -- CDN caching patterns, Cache API usage, cache key design
- **security-minion** -- cache poisoning risks, quarantine ordering, purge auth
- **observability-minion** -- cache hit ratio measurement, Server-Timing headers
- **iac-minion** -- custom domain DNS, wrangler config, infrastructure provisioning

The key tension was between edge-minion (who wanted aggressive caching) and
security-minion (who insisted on quarantine-before-cache ordering and cautious
cache invalidation).

### Architecture Review (Phase 3.5)

Reviewers: security, test, ux-strategy, lucy, margo (mandatory).

Notable advisories:
- **security-minion**: Insisted quarantine check must precede cache check. This
  means every request pays a D1 query cost even on cache hits, but prevents
  serving cached verified responses for quarantined captures.
- **margo**: Questioned whether the admin purge endpoint was over-engineered.
  The semantic target system (`signing-keys`, `capture:cap_{id}`, `all`) was
  retained because it makes the purge API usable without knowing internal
  cache key formats.
- **test-minion**: Recommended testing cache header behavior, not just cache
  hit/miss (since Workers Cache API state doesn't persist across test requests).

## Execution Phase

### Task 1: Cache key utilities and base caching (edge-minion)

Straightforward: `buildCacheKey()` with `?_fmt=json|html` synthetic parameter
for content negotiation, `buildSimpleCacheKey()` for signing key endpoints.
Unit tests confirmed the cache key normalization logic.

### Task 2: Verify endpoint caching (edge-minion)

The largest task. Modified `handleVerifyCapture`, `handleGetSigningKey`, and
`handleGetSigningKeys` in index.js. Key implementation details:
- Cache check after rate limit AND quarantine check (security requirement)
- Only verified captures cached (unverified, error, quarantined = bypass)
- Server-Timing header added via `withInstrumentHeaders()` closure per handler
- Structured logging with cacheStatus, colo, duration for every response path

### Task 3: Verify subdomain routing (edge-minion)

Host-based allowlist for `verify.*` subdomains. Five regex patterns covering
verification, health, and artifact paths. Non-matching paths return 404.

### Task 4: Admin cache purge (edge-minion)

**This is where the major pivot happened.** The original plan used Cache-Tag
purge with `{ tags: [...] }`. During implementation, we discovered the zone
is on Cloudflare's Free plan by querying the zones API:

```
GET https://api.cloudflare.com/client/v4/zones/{zone_id}
→ plan.name: "Free Website"
```

Cache-Tag purge requires Enterprise. The implementation was redesigned to use
URL-based purge (`{ files: [...] }`), which works on all plans. This required:
- Removing all Cache-Tag response headers (inert on Free plan)
- Creating `resolveVerifyOrigin()` to map admin hosts to verify hosts
- Creating `buildPurgePayload()` to expand semantic targets to URLs
- Reordering validation (body before config check) after test failures

The zone ID was also discovered to be a placeholder. Used the zones API to
find the real zone ID (`9b1b321a3921da4741063f25d6935a74`).

### Task 5: E2E validation and monitoring

Created integration tests for Server-Timing and Cache-Control headers. Added
cache validation checks to the smoke test. Wrote operational documentation
(cache-monitoring.md, key-rotation.md). The `scripts/purge-cache.sh` CLI
wraps the admin endpoint with 1Password credential retrieval.

## Human Interventions

This orchestration ran in autonomous mode across three sessions (context
window continuations). No human gate decisions -- Lucy agent handled all
gates per the autonomous execution protocol.

Key autonomous decisions:
- Team approval: accepted as proposed
- Execution plan approval: accepted with "Run all" post-execution
- All approval gates: auto-approved by Lucy

## Post-Execution Verification

- **Code review**: APPROVE with minor ADVISE (duplicate timing header closures
  are acceptable per-handler repetition)
- **Tests**: 27 tests passed in partial runs (cache: 7, admin-cache-purge: 15,
  health: 5). Full test suite (60 files) hung due to pre-existing
  vitest-pool-workers workerd startup issue. Individual test file runs
  confirmed passing.
- **OpenAPI lint**: Valid, 0 errors (12 pre-existing warnings)
- **Documentation**: All SHOULD items addressed (monitoring doc, runbook, CLI
  script, OpenAPI spec). No MUST items outstanding.

## Where to Read More

- Synthesis and specialist contributions: `docs/history/nefario-reports/` (if
  scratch files were preserved from the initial session)
- Cache monitoring queries: `docs/operations/cache-monitoring.md`
- Key rotation procedure: `docs/operations/runbooks/key-rotation.md`
- Design decisions: `docs/evolution/0068-cdn-verification-traffic/decisions.md`
