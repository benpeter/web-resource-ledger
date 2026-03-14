# Decisions: First Deployment and Live Testing

## 1. Infrastructure provisioning approach

**Decision**: Manual `wrangler` commands, real KV/R2 IDs committed to
`wrangler.toml`. No IaC tooling.

**Alternatives considered**:
- Terraform with Cloudflare provider -- rejected as premature. Adds state
  backend, provider pinning, and a separate apply step for two resources.
  Violates KISS.
- Provisioning shell script (`scripts/provision.sh`) -- rejected as
  over-engineering for a one-off operation. A script that runs once is
  documentation pretending to be automation.

**Multi-tenancy note**: When multi-tenancy arrives, the first question is
the tenant isolation model. Shared infrastructure with tenant-keyed data
(e.g. `tenant-abc:capture:xyz` key prefixes) scales to hundreds of tenants
with zero new provisioning. Per-tenant KV namespaces and R2 buckets would
justify Terraform -- but only when compliance, billing isolation, or data
residency demands it. YAGNI until then.

**Why this doesn't paint us into a corner**: Terraform can import
wrangler-created resources. Binding names (`BUCKET`, `KV`) are stable
contracts. The data plane doesn't care how the control plane was invoked.

## 2. KV namespace IDs in wrangler.toml

**Decision**: Commit real namespace IDs directly to `wrangler.toml`.

KV namespace IDs and R2 bucket names are not secrets -- they're identifiers.
Wrangler doesn't support environment variable interpolation in binding
fields (`id`, `bucket_name`), so there's no clean way to externalize them.
Committing them is the standard Cloudflare Workers pattern.

## 3. CNAME filtering in DNS results

**Decision**: Filter DNS resolver results to actual IP addresses before
SSRF classification.

**Discovery**: Cloudflare's `node:dns` resolver on the Workers runtime
returns CNAME records (e.g. `d37f4yd25mfj02.cloudfront.net.`) mixed in
with IP addresses from `resolve4()` and `resolve6()`. The SSRF check's
fail-closed design treated unparseable strings as private IPs, blocking
all CDN-fronted domains (discovered with `www.sueddeutsche.de` which
fronts through CloudFront).

**Fix**: Filter results with simple pattern checks (`/^\d+\.\d+\.\d+\.\d+$/`
for IPv4, `:` presence for IPv6) before feeding into `isPrivateIP()`. If
filtering leaves zero IPs, reject as "could not resolve hostname" --
preserving the fail-closed posture for genuinely unresolvable hosts.

**Security impact**: No reduction in SSRF protection. CNAMEs are not
routable addresses -- they were never useful for the private-range check.
The actual resolved IPs are still checked against all blocked ranges.
