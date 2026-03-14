# Outcome: First Deployment and Live Testing

## What Was Done

First production deployment of the Worker to Cloudflare, followed by
end-to-end validation against two real-world URLs.

### Infrastructure Provisioned

| Resource | Identifier |
|----------|-----------|
| R2 bucket | `wrl-captures` |
| KV namespace | `b5cd6168cd32485dba7a90558e5fad29` |
| KV namespace (preview) | `d7d4739a73074b9793889046e59c9323` |
| Worker | `wrl` at `wrl.benpeter.workers.dev` |

### Secrets Set

- `CAPTURE_API_KEY` -- 256-bit random hex key for capture submission auth
- `SIGNING_KEY` -- Ed25519 PKCS#8 private key for WACZ bundle signing

### Test Captures

| URL | Capture ID | Result |
|-----|-----------|--------|
| `https://schamdan.de/speisekarte` | `cap_ab59b6c8bc7e467e9bd6a37d38c89986` | Complete, all artifacts |
| `https://www.sueddeutsche.de` | `cap_ee5221cc5fe24a6f9deb49ddbea711bf` | Complete, all artifacts + WACZ |

The first sueddeutsche.de attempt was captured without WACZ (signing key
not yet provisioned). The second attempt (after setting `SIGNING_KEY`)
produced a 6.5 MB signed WACZ bundle.

## Bug Found and Fixed

**Cloudflare DNS CNAME contamination**: `dns.promises.resolve4()` and
`resolve6()` on the Workers runtime return CNAME records alongside actual
IP addresses. The SSRF check's fail-closed logic treated the unparseable
CNAME string as a private IP, blocking all CDN-fronted domains.

Discovered when `www.sueddeutsche.de` (CloudFront-fronted) returned 422
"Host resolves to a private IP address". Temporary debug logging revealed
the blocked "IP" was `d37f4yd25mfj02.cloudfront.net.`.

Fix: filter DNS results to actual IP addresses before classification.
Two tests added covering the CNAME filtering and the CNAME-only edge case.

## Files Changed

| File | Change |
|------|--------|
| `src/url-validation.js` | Filter CNAME entries from DNS results |
| `test/url-validation.test.js` | +2 tests (CNAME filtering, CNAME-only rejection) |
| `wrangler.toml` | Real KV namespace IDs replacing placeholders |

## Test Results

232/232 tests pass (230 existing + 2 new). No regressions.

## What Deviated from Expectations

1. **R2 requires explicit activation** -- not enabled by default on
   Cloudflare accounts. Required dashboard activation before `wrangler r2
   bucket create` would work.

2. **OAuth token scope** -- initial `wrangler login` token didn't include
   R2 permissions. Required logout/login cycle after R2 activation.

3. **WACZ silently skipped** -- `buildWacz()` returns `null` when
   `SIGNING_KEY` is absent (graceful degradation by design). The first
   captures completed without WACZ bundles, which was correct behavior but
   easy to overlook.

4. **DNS CNAME contamination** -- undocumented Cloudflare runtime behavior.
   Not reproducible in local tests (workerd test runner doesn't exhibit it).

## Backlog Changes

No new backlog items. No items resolved. The DNS CNAME issue was fixed
in this phase rather than deferred.
