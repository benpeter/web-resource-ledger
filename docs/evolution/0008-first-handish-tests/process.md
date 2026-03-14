# Process: First Deployment and Live Testing

## TL;DR

First production deployment of WRL to Cloudflare. Provisioned R2, KV, and
two secrets via `wrangler`. Two live captures validated the full pipeline.
A DNS bug in the SSRF check blocked all CDN-fronted domains -- diagnosed
via runtime log tailing, root-caused to Cloudflare's `node:dns` returning
CNAME records mixed with IPs, fixed and deployed within 15 minutes.

## How it went

### Deployment (the boring part that went right)

Straightforward `wrangler login` + resource provisioning. The only friction
was sequencing: R2 must be activated in the Cloudflare dashboard before the
API accepts bucket creation calls, and the OAuth token needs a
logout/login cycle to pick up the new R2 scope. Once past that, `wrangler
deploy` worked first try.

Before provisioning, there was a brief advisory consultation with
iac-minion on whether R2 and KV should be managed via Terraform. The
recommendation was no -- a shell script wrapping two wrangler commands was
the maximum justified automation, and even that was arguably
over-engineering for a one-off. The pragmatic choice: run the commands,
commit the IDs, move on. Terraform becomes justified only when per-tenant
isolated namespaces are a confirmed requirement.

### First capture: schamdan.de

`POST /v1/captures` with `https://schamdan.de/speisekarte` returned 202
immediately. Status polled to `complete` within seconds. Metadata showed
screenshot, HTML, and headers artifacts. No WACZ bundle -- the signing key
hadn't been provisioned yet, and `buildWacz()` returns `null` by design
when `SIGNING_KEY` is absent. This graceful degradation worked exactly as
intended, but was easy to overlook if you didn't know to look for the
`wacz` field.

### Second capture: sueddeutsche.de -- the interesting failure

`POST /v1/captures` with `https://www.sueddeutsche.de` returned 422:
`"Host resolves to a private IP address"`. This was unexpected --
sueddeutsche.de is a major German news site fronted by CloudFront, clearly
not a private address.

#### Diagnosis

Local `dig` showed normal public IPs (108.138.x.x from CloudFront). The
SSRF check worked fine in the test suite. So the issue was specific to
Cloudflare's production runtime.

Added a temporary `console.log` to the SSRF rejection path that logged the
hostname, the blocked IP, and all resolved IPs. Deployed, tailed logs with
`wrangler tail --format json`, and re-fired the request.

The log revealed the problem immediately:

```
blocked_ip=d37f4yd25mfj02.cloudfront.net.
all_ips=["d37f4yd25mfj02.cloudfront.net.","99.86.91.38","99.86.91.17",...]
```

Cloudflare's `node:dns` `resolve4()` and `resolve6()` return CNAME records
alongside actual IP addresses. The CNAME string `d37f4yd25mfj02.cloudfront.net.`
was fed into `isPrivateIP()`, which couldn't parse it as IPv4 or IPv6, so
it returned `true` (fail closed -- the correct default for unrecognizable
input). This meant every CDN-fronted domain with a CNAME would be blocked.

This behavior isn't documented by Cloudflare. The workerd test runner
doesn't exhibit it (test resolvers are injected stubs), so it was invisible
until production.

#### Fix

Filter DNS results to actual IP addresses before classification:

```js
const isIPv4 = (s) => /^\d+\.\d+\.\d+\.\d+$/.test(s);
const isIPv6 = (s) => s.includes(':');
const allIPs = [...v4results, ...v6results].filter((s) => isIPv4(s) || isIPv6(s));
```

If filtering leaves zero IPs, reject as "could not resolve hostname" --
preserving fail-closed posture for genuinely unresolvable hosts. CNAMEs
are not routable addresses; discarding them loses no security signal.

Added two tests: one for the mixed CNAME+IP case (the CloudFront scenario),
one for the CNAME-only edge case (should reject, not pass). Both passed.
All 232 tests green. Deployed, re-tested sueddeutsche.de -- 202 accepted,
captured successfully.

#### Why this wasn't caught earlier

The SSRF check was thoroughly tested (108 tests covering IPv4 encoding
variants, IPv6 ranges, DNS failure modes, mixed results). But all DNS
tests use injected resolver stubs that return clean IP arrays -- exactly
what the `node:dns` documentation says they should. The CNAME
contamination is a Cloudflare runtime quirk that doesn't match the Node.js
API contract. No amount of unit testing would have caught this without
either a production deployment or a Cloudflare-specific integration test
environment.

This is exactly why you deploy early and test against real URLs.

### WACZ bundle validation

After the DNS fix, provisioned the `SIGNING_KEY` secret (generated Ed25519
PKCS#8, base64-encoded) and re-captured sueddeutsche.de. This time the
metadata response included the `wacz` field with a 6.5 MB signed bundle.

Downloaded and extracted the WACZ (it's a ZIP) to inspect contents:
5 WARC records (warcinfo, HTML resource at 3.5 MB, response headers
metadata, screenshot PNG at 2.7 MB), CDXJ index, datapackage.json with
SHA-256 hashes, and a signed datapackage-digest.json. Everything
structurally correct.

## Key observations

1. **Fail-closed SSRF is correct but needs real-world testing.** The
   design decision to treat unparseable input as private was right -- it
   prevented a potential bypass. But it also meant a Cloudflare runtime
   quirk became a blocking bug for a large class of legitimate URLs. The
   fix was surgical (5 lines) because the architecture was clean.

2. **Graceful degradation is invisible.** WACZ bundling silently skipping
   when `SIGNING_KEY` is absent is good design -- captures still complete
   with individual artifacts. But "it worked" can hide "it didn't do
   everything it should." The metadata response shape (presence/absence of
   `wacz` field) is the only signal.

3. **`wrangler tail` is the production debugger.** No structured logging,
   no observability stack -- a `console.log` and `wrangler tail --format
   json` was enough to root-cause and fix a production bug in one
   deploy-diagnose-fix cycle. At this stage, that's the right level of
   tooling.

## Human decisions

- **No IaC tooling**: Chose manual provisioning over Terraform or even a
  shell script. Two resources, one-off operation, YAGNI.
- **Debug logging deployed to production**: Temporary `console.log` added,
  deployed, used, removed in the fix commit. Pragmatic over process.
- **No process.md-style agent orchestration**: This was a hands-on session,
  not a nefario orchestration. The only agent consulted was iac-minion for
  the provisioning strategy advisory.
