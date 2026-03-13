# Domain Plan Contribution: security-minion

## Recommendations

### (a) Cloudflare-Specific Internal IPs and Metadata Endpoints

Cloudflare Workers do **not** expose a traditional cloud metadata endpoint
like AWS `169.254.169.254`. However, blocking the link-local range
`169.254.0.0/16` is still mandatory because:

1. The Browser Rendering headless browser runs in a separate environment from
   the Worker. We do not control what network interfaces are visible to the
   Chromium instance. If Cloudflare's sandboxing changes or has edge cases,
   link-local could reach infrastructure services.
2. Defense-in-depth: blocking metadata-adjacent ranges costs nothing and
   protects against future infrastructure changes.

**Cloudflare-specific ranges to block in addition to the issue's list:**

| CIDR | Reason |
|------|--------|
| `100.64.0.0/10` | CGNAT/shared address space (RFC 6598). Cloudflare uses subsets of this range internally: `100.64.0.0/12` for source IPs, `100.80.0.0/16` for gateway resolved IPs, `100.96.0.0/12` for WARP device IPs, `100.112.0.0/16` for private load balancers. Block the entire `/10` superblock. |
| `0.0.0.0/8` | "This network" (RFC 1122). `http://0` resolves to localhost on Linux. The Chromium sandbox likely runs Linux. |
| `192.0.0.0/24` | IETF protocol assignments (RFC 6890) |
| `192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24` | Documentation ranges (TEST-NET-1/2/3). Not routable, but should not be fetchable. |
| `198.18.0.0/15` | Benchmarking (RFC 2544). Could be used internally by Cloudflare. |
| `240.0.0.0/4` | Reserved/future use. No legitimate target. |
| `255.255.255.255/32` | Broadcast |
| `::` | Unspecified IPv6 address |
| `2001:db8::/32` | IPv6 documentation range |
| `fe80::/10` | IPv6 link-local (already in issue list, confirming) |
| `ff00::/8` | IPv6 multicast |

The complete blocked set should be: issue list + all the above. Keep the
blocklist as an exported constant array of `[prefix, maskBits]` tuples so
it is auditable and testable independently.

### (b) Scheme Blocking -- Yes, Explicitly Required

The WHATWG `URL` constructor rejects some schemes as unparseable, but **not
all dangerous ones**. Critical analysis:

| Scheme | `new URL()` accepts? | Risk | Action |
|--------|---------------------|------|--------|
| `http:` | Yes | Intended | Allow |
| `https:` | Yes | Intended | Allow |
| `javascript:` | Yes (`new URL("javascript:alert(1)")` succeeds) | Code execution in browser context via `page.goto()` | **Block** |
| `data:` | Yes | Can encode HTML/JS payloads; Chromium navigates data: URLs | **Block** |
| `blob:` | Yes (parses with origin) | Browser-context resource access | **Block** |
| `file:` | Yes | Local filesystem read on the Chromium sandbox host | **Block** |
| `ftp:` | Yes | Legacy protocol, no legitimate use case | **Block** |
| `ws:` / `wss:` | Yes | WebSocket; could probe internal services | **Block** |
| `chrome:` / `chrome-devtools:` | Depends on browser | Internal browser pages | **Block** |
| `view-source:` | Chromium-specific | Source disclosure | **Block** |
| `about:` | Yes | Internal browser pages (about:blank, etc.) | **Block** |

**Recommendation**: Use an allowlist, not a blocklist. Only `http:` and
`https:` are permitted. Reject everything else. This is simpler, safer, and
future-proof against new schemes.

```js
const ALLOWED_SCHEMES = new Set(['http:', 'https:']);
if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
  // reject
}
```

### (c) Validation Order -- Yes, Order Matters Critically

The correct order is designed to reject cheaply and early, and to ensure
that later checks operate on normalized data that cannot be re-interpreted
differently by downstream consumers.

**Recommended validation pipeline (each step rejects on failure):**

```
1. Parse with WHATWG URL constructor
2. Scheme allowlist check (http/https only)
3. Strip and reject embedded credentials (userinfo)
4. Hostname normalization and validation
5. Port validation (reject non-standard ports if desired, or allow 80/443/any)
6. DNS resolution (resolve hostname to IP addresses)
7. IP classification (reject private/reserved/loopback)
8. Return validated result object {url, hostname, resolvedIPs, port, scheme}
```

**Why this order:**

- **Step 1 first**: The URL constructor performs WHATWG normalization
  (lowercases scheme and hostname, resolves percent-encoding in hostname,
  normalizes IPv6, converts backslashes to forward slashes in special
  schemes). All subsequent checks operate on the normalized form, eliminating
  parser differential attacks.
- **Step 2 before anything else**: Rejects `javascript:`, `data:`, `file:`
  before we waste time on hostname analysis. Cost: O(1).
- **Step 3 before DNS**: Embedded credentials (`user:pass@host`) must be
  stripped before hostname extraction. The WHATWG URL parser correctly
  separates userinfo from hostname, but the presence of credentials is itself
  a red flag for SSRF (e.g., `http://user@169.254.169.254/`). Reject, do
  not silently strip.
- **Step 4 before DNS**: Validate hostname is not empty, not an IP literal
  that would bypass DNS resolution. If the hostname is already an IP address,
  skip DNS and go straight to IP classification. This is important because
  `new URL('http://0x7f000001/')` will have `hostname` of `0x7f000001` --
  we must parse this as an IP and classify it.
- **Step 6 before Step 7**: DNS resolution must happen before IP
  classification. Resolve both A and AAAA records. **All** returned IPs must
  pass classification, not just the first one.
- **Step 7 is the final gate**: Every resolved IP is checked against the
  blocklist. If any IP is private/reserved, the entire URL is rejected.

**Critical detail on hostname normalization (Step 4)**: The WHATWG `URL`
parser does NOT normalize all IP encoding tricks the same way across
environments. Specifically:

- `new URL('http://0x7f000001/')` -- `hostname` may be `0x7f000001` (string)
  rather than `127.0.0.1` in some implementations. The module MUST include
  its own IP address parsing that handles hex, octal, decimal, and mixed
  encodings independently of the URL parser.
- `new URL('http://2130706433/')` -- same issue with decimal IPs.
- `new URL('http://0177.0.0.1/')` -- octal notation.

**Recommendation**: After URL parsing, attempt to parse `hostname` as an IP
address using a dedicated function that handles all encoding variants. If it
parses as an IP, classify it immediately (skip DNS). If it does not parse as
an IP, treat it as a hostname and proceed to DNS.

### (d) DNS Rebinding Threat Model in Cloudflare Workers Context

**The threat**: An attacker registers a domain with a DNS server they control.
On the first query (during our validation), it returns a safe public IP. On
the second query (when Browser Rendering navigates to it), it returns
`127.0.0.1` or a private IP. Our validation passed, but the browser fetches
a private resource.

**Cloudflare-specific considerations:**

1. `fetch()` in Workers blocks direct IP access entirely. You cannot call
   `fetch('http://127.0.0.1/')` from a Worker -- Cloudflare rejects it with
   "Direct IP access not allowed." This provides a partial platform-level
   defense for Worker `fetch()` calls.

2. **Browser Rendering is a different story.** The headless Chromium instance
   runs in a separate sandbox environment. `page.goto()` performs its own DNS
   resolution. There is **no documented mechanism** to pass a pre-resolved IP
   to `page.goto()`. Chromium will resolve the hostname independently,
   creating a classic TOCTOU gap.

3. Browser Rendering does NOT appear to accept IP addresses directly in
   `page.goto()` either (Chromium may or may not block this -- it depends on
   the sandbox configuration, which we do not control).

**DNS pinning strategy given these constraints:**

Since we cannot force Browser Rendering to use our pre-resolved IP, pure DNS
pinning (resolve-then-pass-IP) is **not possible** with this architecture.
Instead, the defense must be layered:

- **Layer 1 (validation module)**: Resolve DNS, check all IPs, reject if any
  are private. This catches the common case and all static private-IP
  hostnames.
- **Layer 2 (short validation-to-use window)**: Minimize the time between
  validation and `page.goto()`. DNS rebinding requires the TTL to expire
  between our check and the browser's resolution. If we validate and
  immediately navigate, the attacker's DNS server must respond with a
  different IP within milliseconds. Low-TTL rebinding is detectable: if the
  DNS response has TTL < 5 seconds, treat it as suspicious and reject. (Note:
  this requires the DNS resolution API to expose TTL, which may not be
  available -- see edge-minion consultation.)
- **Layer 3 (network-level defense, future)**: Cloudflare's Browser Rendering
  sandbox likely blocks access to `127.0.0.0/8` and `169.254.0.0/16` at the
  network level. We should NOT rely on this, but it provides defense-in-depth.
- **Layer 4 (double resolution)**: Resolve DNS twice with a short delay
  between. If the results differ, reject. This is a mitigation, not a
  prevention -- a sophisticated attacker can serve the same safe IP for
  multiple queries and only rebind after a longer delay. But it catches
  naive rebinding attacks. **YAGNI consideration**: This adds complexity.
  For MVP, Layers 1-2 are sufficient. Document Layer 4 as a future
  enhancement.

**MVP recommendation**: Implement Layer 1 (resolve and check) and document
the TOCTOU limitation as a known residual risk. The Browser Rendering sandbox
provides implicit Layer 3. Layer 2 (TTL checking) should be implemented if
the DNS API exposes TTL data; otherwise, document it as a future enhancement.
Layer 4 is YAGNI for MVP.

### (e) Redirect Chain Validation Architecture

**Recommendation: Provide a per-hop validation function, not a redirect-following module.**

Rationale:

1. **Separation of concerns**: The URL validation module validates URLs. It
   should not also be an HTTP client. Following redirects requires making
   HTTP requests, handling timeouts, managing connections -- all of which
   belong in the caller (the capture endpoint).

2. **Browser Rendering handles its own redirects**: When `page.goto(url)` is
   called, Chromium follows redirects internally. The validation module cannot
   intercept these hops. What the module CAN do is provide a `validateUrl()`
   function that the caller invokes:
   - Once before `page.goto()` for the initial URL
   - Via Puppeteer navigation event listeners for each redirect hop

3. **TOCTOU risk comparison**:
   - **Module follows redirects itself**: The module makes a `fetch()` with
     `redirect: 'manual'`, validates each hop, then returns the final URL
     for `page.goto()`. TOCTOU risk: the server could return different
     redirects to our `fetch()` vs. the browser's request. **The module's
     redirect chain is not the browser's redirect chain.** This approach
     provides false confidence.
   - **Per-hop validation via Puppeteer events**: The caller listens to
     `page.on('request')` or `page.on('response')` events and calls
     `validateUrl()` for each navigation. TOCTOU risk: the browser has
     already started loading the redirect target by the time we validate it.
     We can abort via `page.close()` or `request.abort()` but some data may
     have been fetched.
   - **Pre-flight fetch + browser navigation**: Do BOTH. Pre-flight with
     `fetch(url, {redirect: 'manual'})` to discover the redirect chain, validate
     each hop, then also validate via Puppeteer events as a safety net.

4. **MVP recommendation**: The validation module exports `validateUrl(url, resolveHostname)` --
   a pure function (with injected DNS resolver) that validates a single URL.
   The capture endpoint (Step 3) is responsible for:
   - Calling `validateUrl()` on the initial URL
   - Pre-flight fetching with `redirect: 'manual'` to discover redirects
   - Calling `validateUrl()` on each redirect location
   - Setting up Puppeteer request interception as a defense-in-depth layer
   - Aborting navigation if any hop fails validation

   This keeps the validation module pure, testable, and auditable. Redirect
   chain orchestration is the caller's responsibility.

**Module API shape recommendation:**

```js
/**
 * @param {string} rawUrl - User-supplied URL string
 * @param {Function} resolveHostname - Async function: hostname -> {ipv4: string[], ipv6: string[]}
 * @returns {Promise<{url: URL, resolvedIPs: string[]}>}
 * @throws {ValidationError} with machine-readable code and human-readable message
 */
export async function validateUrl(rawUrl, resolveHostname) { ... }
```

The resolver is injected for testability (mock in tests, real DNS in
production). The return value includes resolved IPs so the caller can log
them for audit trails. The function throws on validation failure -- callers
cannot accidentally use an invalid URL because there is no URL to use.

---

## Proposed Tasks

### Task 1: IP Address Parsing and Classification

**What**: Implement `isPrivateIP(ipString)` and `parseIPFromHostname(hostname)`
functions that handle all encoding variants.

**Deliverables**:
- A function that parses hex (`0x7f000001`), octal (`0177.0.0.1`), decimal
  (`2130706433`), mixed-notation, and shorthand (`127.1`) IPv4 addresses,
  plus all IPv6 formats (full, compressed, IPv4-mapped, IPv6 ULA, link-local).
- A function that checks a parsed IP against the complete blocklist
  (issue list + Cloudflare-specific ranges + additional reserved ranges).
- The blocklist as an exported constant for auditability.
- JSDoc on every range explaining why it is blocked (with RFC numbers).

**Dependencies**: None. This is a pure function with no platform dependencies.

### Task 2: URL Parsing, Normalization, and Scheme Validation

**What**: Implement the first four steps of the validation pipeline (parse,
scheme check, credential rejection, hostname normalization).

**Deliverables**:
- WHATWG URL parsing with error handling
- Scheme allowlist (`http:`, `https:` only)
- Credential detection and rejection (non-empty `username` or `password` in
  parsed URL)
- Hostname extraction with IP address detection (if hostname is an IP in any
  encoding, parse and classify it without DNS)
- Double-encoding detection on the path component

**Dependencies**: Task 1 (IP classification).

### Task 3: DNS Resolution and Full Validation Pipeline

**What**: Wire DNS resolution into the pipeline and implement the complete
`validateUrl()` function.

**Deliverables**:
- The `validateUrl(rawUrl, resolveHostname)` function with the full pipeline
- Resolver injection pattern for testability
- Resolution of both A and AAAA records
- Rejection if **any** resolved IP is private/reserved
- A `ValidationError` class (or plain error with `code` property) with
  specific error codes for each failure type (invalid-url, blocked-scheme,
  credentials-present, private-ip, dns-failure)
- Export the validation function and error codes

**Dependencies**: Tasks 1 and 2. Depends on edge-minion's findings about
which DNS API is available in Workers.

### Task 4: Comprehensive Test Suite

**What**: Test every bypass vector and edge case.

**Deliverables**: (Defer to test-minion for structure, but ensure coverage of):
- All 9 bypass vectors from the issue
- All additional IP encoding variants (hex, octal, decimal, mixed, shorthand)
- Cloudflare-specific blocked ranges (100.64.0.0/10)
- `0.0.0.0`, `0`, `0x0` as localhost equivalents
- IPv6: `::1`, `::ffff:127.0.0.1`, `fc00::1`, `fe80::1`, `::`
- Scheme rejection: `javascript:`, `data:`, `file:`, `ftp:`, `blob:`, `ws:`
- Credential rejection: `http://user@host`, `http://user:pass@host`
- Unicode edge cases: fullwidth dots (`127。0。0。1`), if the URL parser
  normalizes them
- Empty hostname, missing scheme, relative URLs
- Valid URLs that should pass (positive test cases)
- DNS resolver returning mixed public/private IPs (must reject)
- DNS resolver returning only public IPs (must pass)
- DNS failure handling

**Dependencies**: Tasks 1-3.

---

## Risks and Concerns

### Risk 1: TOCTOU Gap Between Validation and Browser Navigation (HIGH)

**Description**: The validation module resolves DNS and checks IPs. Then
`page.goto()` resolves DNS independently. An attacker with a controlled DNS
server can return different IPs for each resolution.

**Likelihood**: 3/5 (requires attacker-controlled DNS, but trivial to set up)
**Impact**: 5/5 (full SSRF -- access to internal services from the browser sandbox)

**Mitigation**: Document as a known limitation for MVP. Layer defenses:
pre-flight validation + Puppeteer request interception in Step 3. Consider
TTL-based heuristics if the DNS API supports it. The Browser Rendering
sandbox provides implicit network-level blocking as a last resort.

### Risk 2: URL Parser Differential Between Node.js WHATWG URL and Chromium (MEDIUM)

**Description**: The validation module uses Node.js's `URL` class (WHATWG
spec). The Browser Rendering Chromium instance uses its own URL parser.
Subtle differences in how they handle malformed input could allow a URL that
validates safely to be interpreted differently by the browser.

**Likelihood**: 2/5 (both implement WHATWG, but edge cases exist -- especially
with backslash handling, percent-encoding normalization, and IPv4 in IPv6)
**Impact**: 4/5 (SSRF bypass)

**Mitigation**: Use the WHATWG URL constructor as the canonical parser, but
add independent IP parsing that does not rely on the URL constructor's
hostname normalization. Re-canonicalize the URL after parsing (reconstruct
from parsed components) to ensure what we validate is exactly what the
browser receives. The validation function should return `parsed.href` (the
re-serialized URL) rather than the original input string.

### Risk 3: DNS API Unavailability in Workers Runtime (MEDIUM)

**Description**: If `dns.resolve4()` / `dns.resolve6()` are not available
under `nodejs_compat`, the entire DNS pre-resolution strategy needs to change
to DNS-over-HTTPS (e.g., querying `1.1.1.1/dns-query`), which adds latency
and a new dependency.

**Likelihood**: 3/5 (Workers `nodejs_compat` does not guarantee all Node.js
APIs)
**Impact**: 3/5 (requires architectural change, not a security gap -- just
a different implementation)

**Mitigation**: The resolver injection pattern (`resolveHostname` parameter)
isolates this decision. The validation module does not care HOW DNS is
resolved -- it just receives IPs. The caller provides the resolver
appropriate to the runtime. Edge-minion's consultation should resolve this
question.

### Risk 4: Incomplete IPv4 Parsing Leading to Bypass (HIGH)

**Description**: IPv4 addresses have many encoding variants (hex, octal,
decimal, mixed, shorthand like `127.1`). If the IP parsing function misses
any variant, an attacker can encode a private IP in a format that passes
validation but is interpreted correctly by the browser.

**Likelihood**: 3/5 (the long tail of encoding variants is easy to miss)
**Impact**: 5/5 (direct SSRF bypass)

**Mitigation**: The IP parsing function must use the same algorithm as
WHATWG URL's "IPv4 parser" (spec section 3.5). This algorithm handles all
the encoding variants. Implement it from the spec, not from guesswork. Test
exhaustively against every variant from the HackTricks SSRF bypass list:
hex, octal, decimal, mixed, shorthand, with and without leading zeros.

### Risk 5: `page.goto()` Accepting Dangerous Schemes (MEDIUM)

**Description**: Even though we validate the URL before passing it to
`page.goto()`, if there is any code path where an unvalidated URL reaches
the browser (e.g., a redirect destination that bypasses our check), the
browser could navigate to `javascript:`, `data:`, or `file:` URLs.

**Likelihood**: 2/5 (requires a bug in the caller's redirect handling)
**Impact**: 4/5 (code execution in browser context, local file read)

**Mitigation**: Defense-in-depth via Puppeteer request interception. In
Step 3, set up `page.setRequestInterception(true)` and validate every
request's URL before allowing it. This catches redirects that bypass the
pre-flight check. The validation module should be usable for this purpose
(fast, synchronous scheme check exported separately from the full async
validation).

---

## Additional Agents Needed

None. The current consultation set (security-minion, test-minion, edge-minion,
ux-strategy-minion, software-docs-minion) covers all aspects. The critical
dependency is on **edge-minion** to confirm DNS API availability, which
determines the resolver implementation strategy.

One note: if edge-minion confirms that `dns` APIs are unavailable and
DNS-over-HTTPS is required, the DNS-over-HTTPS resolver implementation is
straightforward enough that it does not require a separate specialist -- it
is a `fetch()` call to `https://cloudflare-dns.com/dns-query` with
`application/dns-json` accept header.
