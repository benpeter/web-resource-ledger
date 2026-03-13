## Domain Plan Contribution: edge-minion

### Recommendations

#### (a) DNS Resolution APIs: Use `node:dns` with `dns.promises.resolve4()` / `resolve6()`

With `nodejs_compat` enabled (already in `wrangler.toml`), the `node:dns` module is available and uses DNS-over-HTTPS to Cloudflare's 1.1.1.1 under the hood. The following APIs are **supported**:

- `dns.promises.resolve4(hostname)` -- returns array of IPv4 addresses
- `dns.promises.resolve6(hostname)` -- returns array of IPv6 addresses
- `dns.promises.resolveCname(hostname)` -- for CNAME chain resolution

The following are **NOT supported** (throw "Not implemented"):

- `dns.lookup()` -- the one most Node.js code uses by default
- `dns.lookupService()`
- `dns.resolve()` -- the generic variant; specific variants like `resolve4` work

**Recommendation**: Use `dns.promises.resolve4()` and `dns.promises.resolve6()` directly. No need for DNS-over-HTTPS via `fetch('https://1.1.1.1/dns-query')` -- the `node:dns` module already wraps that cleanly. Each DNS call counts as one subrequest toward the Worker's quota (50 on free plan, 10,000 on paid).

#### (b) Browser Rendering Cannot Accept Pre-Resolved IPs -- DNS Pinning Strategy

Browser Rendering uses Cloudflare's Puppeteer fork. The browser navigates via `page.goto(url)` which performs its own DNS resolution inside the Chromium instance. There is **no API to pass a pre-resolved IP** to the browser or to control its DNS resolution.

This means DNS pinning in the traditional sense (resolve once, connect to that IP) is **not possible with Browser Rendering**. The browser will re-resolve DNS independently.

**Recommended approach**: Accept this as a known TOCTOU gap and mitigate through defense in depth:

1. **Pre-validate in the Worker**: Resolve DNS, check IPs against private ranges, reject if any IP is private. This catches the obvious SSRF attempts.
2. **Accept the re-resolution gap**: The Browser Rendering Chromium instance runs inside Cloudflare's infrastructure, not inside a customer VPC. It cannot reach private networks or cloud metadata endpoints from there. The blast radius of a DNS rebinding attack is limited to what Cloudflare's browser fleet can reach -- which is the public internet only.
3. **Document the limitation**: The DNS check is a best-effort pre-flight validation. The real SSRF boundary is Cloudflare's network isolation of the Browser Rendering environment.

Do NOT attempt workarounds like setting a `Host` header with the hostname and fetching via IP -- Workers cannot fetch by raw IP address at all (returns error).

#### (c) CPU Time and Wall-Clock Limits Are Not a Concern

- **CPU time**: 30s default on paid plan (configurable up to 5 min). DNS resolution via DoH is network I/O, which does **not** count toward CPU time.
- **Wall-clock time**: No limit for HTTP-triggered Workers (as long as client stays connected).
- **Subrequest budget**: Each DNS call = 1 subrequest. Worst case for URL validation: 2 DNS calls (A + AAAA) for initial URL + 2 per redirect hop x 5 hops = 12 subrequests. Well within both free (50) and paid (10,000) limits.

The redirect chain following also uses subrequests (1 fetch per hop), adding 5 more = 17 total subrequests worst case. No risk of hitting limits.

#### (d) Cloudflare-Internal IP Ranges and Metadata Services

Workers operate on Cloudflare's edge network, **not** inside a traditional cloud VPC. Key facts:

- **No cloud metadata service** (169.254.169.254) is accessible from Workers. There is no AWS/GCP-style metadata endpoint.
- **Workers cannot fetch raw IP addresses** -- `fetch('http://10.0.0.1/')` fails outright. The runtime requires hostnames.
- **Workers cannot connect to localhost/127.0.0.1** without explicit VPC Service bindings (which require Cloudflare Tunnel setup).

However, the URL validation module should still block private IPs in the DNS resolution results because:

1. A public hostname could resolve to a private IP (DNS rebinding).
2. Defense in depth -- the Worker's fetch restrictions are an implementation detail that could change.
3. The private IP blocklist serves double duty: it protects against SSRF if this code is ever ported to a different runtime.

**Block these ranges in resolved IPs**:

- `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16` (RFC 1918)
- `127.0.0.0/8` (loopback)
- `169.254.0.0/16` (link-local, includes cloud metadata)
- `0.0.0.0/8` (current network)
- `100.64.0.0/10` (carrier-grade NAT / shared address space)
- `::1/128`, `fc00::/7`, `fe80::/10`, `::ffff:0:0/96` (IPv6 equivalents)

#### (e) `fetch()` with `redirect: 'manual'` Works as Expected

Workers support the standard `redirect` option on fetch:

- `redirect: 'follow'` -- automatically follows redirects (default when you create a new Request).
- `redirect: 'manual'` -- returns the 3xx response with `Location` header intact, no automatic following.
- `redirect: 'error'` -- throws on redirect.

**Important nuance**: The *incoming* request on a FetchEvent has `redirect: 'manual'` by default. But outbound `fetch()` calls you make follow the standard behavior: `'follow'` unless overridden.

**Recommended pattern for redirect chain validation**:

```javascript
async function followRedirects(url, maxHops = 5) {
  const visited = new Set();
  let current = url;

  for (let hop = 0; hop < maxHops; hop++) {
    if (visited.has(current)) throw new Error('Redirect loop detected');
    visited.add(current);

    // Validate URL + DNS at each hop
    await validateUrl(current);

    const response = await fetch(current, { redirect: 'manual' });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('Location');
      if (!location) throw new Error('Redirect without Location header');
      // Resolve relative redirects against current URL
      current = new URL(location, current).href;
      continue;
    }

    return { finalUrl: current, status: response.status, hops: hop };
  }

  throw new Error(`Exceeded maximum redirects (${maxHops})`);
}
```

Each hop's `fetch()` counts as one subrequest. Combined with DNS resolution per hop, budget is comfortable.

---

### Proposed Tasks

#### Task 1: Implement DNS resolution with private IP blocking

**What**: Create `src/url-validation.js` with functions to resolve a hostname via `dns.promises.resolve4()` and `dns.promises.resolve6()`, then check all returned IPs against a private/reserved range blocklist.

**Deliverables**:
- `resolveAndValidate(hostname)` function returning validated IP addresses
- Private IP range checker (both IPv4 and IPv6)
- Clear error types distinguishing "DNS failed" from "resolved to private IP"

**Dependencies**: None. Uses built-in `node:dns` module.

#### Task 2: Implement URL scheme and structure validation

**What**: Validate the input URL before DNS resolution: scheme must be `http` or `https`, hostname must be present, no IP-literal hostnames (reject `http://127.0.0.1/` and `http://[::1]/` before DNS step).

**Deliverables**:
- `validateUrlStructure(urlString)` function
- Reject non-http(s) schemes, IP literals, empty hostnames
- Return parsed URL object on success

**Dependencies**: None.

#### Task 3: Implement redirect chain follower with per-hop validation

**What**: Follow redirects using `fetch()` with `redirect: 'manual'`, validating each hop's URL structure and DNS resolution before following.

**Deliverables**:
- `followRedirectChain(url, maxHops)` function
- Per-hop URL validation (scheme, DNS, private IP check)
- Loop detection via visited-URL set
- Return final URL, hop count, and validation metadata

**Dependencies**: Tasks 1 and 2.

#### Task 4: Document the Browser Rendering DNS pinning limitation

**What**: Add a clear comment/doc block in the validation module explaining that Browser Rendering performs independent DNS resolution, the TOCTOU gap this creates, and why it is acceptable (Cloudflare network isolation).

**Deliverables**:
- JSDoc or inline documentation in `src/url-validation.js`
- Decision record content for `docs/evolution/` noting this is a known, accepted limitation

**Dependencies**: None.

---

### Risks and Concerns

1. **DNS rebinding TOCTOU gap with Browser Rendering**: The Worker resolves DNS and validates IPs, then Browser Rendering re-resolves DNS independently. An attacker could return a public IP on first resolution, then a private IP on second. **Mitigation**: Cloudflare's Browser Rendering runs in network-isolated infrastructure with no access to customer private networks or cloud metadata. The practical exploit surface is minimal, but this should be documented as a known limitation.

2. **IPv6 complexity**: IPv6 private range checking is more complex than IPv4. Mapped addresses (`::ffff:10.0.0.1`) could bypass naive IPv4-only checks. **Mitigation**: Always check both `resolve4()` and `resolve6()` results. Include `::ffff:0:0/96` (IPv4-mapped IPv6) in the blocklist. Parse IPv6 addresses carefully.

3. **DNS resolution adding latency**: Each `resolve4()` + `resolve6()` call is a DoH subrequest (~10-50ms each). With 5 redirect hops, that is 10-20 DNS calls adding 100-1000ms total. **Mitigation**: This is wall-clock time, not CPU time, so it does not count against limits. The latency is acceptable for a validation step that runs before an expensive Browser Rendering operation (which takes seconds). Consider parallelizing `resolve4` and `resolve6` calls with `Promise.all()`.

4. **`resolve6()` may return empty results**: Many domains do not have AAAA records. An empty result from `resolve6()` is not an error -- only fail if both `resolve4()` and `resolve6()` return no results.

5. **Subrequest counting under free plan**: 50 subrequest limit per request. URL validation + redirect following + the actual Browser Rendering work could consume the budget. On the free plan, this would be tight. On the paid plan (10,000 limit), it is a non-issue. **Recommendation**: Design for paid plan limits; document free plan constraints.

6. **Workers cannot fetch by raw IP**: Even after DNS resolution, you cannot use the resolved IP directly in `fetch()`. The redirect chain follower must always fetch by hostname (which is the desired behavior for validation -- it just means DNS pinning for the fetch step itself is not possible either).

### Additional Agents Needed

None. The current team (edge-minion, security-minion, test-minion, software-docs-minion) covers the required expertise. The security-minion should define the exact private IP blocklist and any additional SSRF vectors; edge-minion has provided the runtime constraints that inform those decisions.
