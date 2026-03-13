# Task 1: Implement URL Validation Module

You are implementing `src/url-validation.js` for a Cloudflare Worker that
will use Browser Rendering to capture web pages. This module is the SSRF
prevention boundary -- the single control between untrusted user URLs and
a headless Chromium instance.

## What to build

Create `src/url-validation.js` with one primary export:

```js
export async function validateUrl(rawUrl, { resolve4, resolve6 } = defaultResolvers)
```

The function returns a result object (NEVER throws for validation failures):

```js
// Success
{ ok: true, url: 'https://example.com/page', ip: '93.184.216.34' }

// Rejection
{ ok: false, status: 400, detail: "..." }  // malformed input
{ ok: false, status: 422, detail: "..." }  // policy violation
```

The `ok` discriminant matches Fetch API `Response.ok` convention. The
resolved `ip` is only present on success -- structurally prevents use of
an IP from a failed validation. The `status` and `detail` fields plug
directly into the existing `problemResponse(status, detail)` from
`src/responses.js` with zero transformation.

Caller integration (3 lines, zero decisions):
```js
const result = await validateUrl(urlString);
if (!result.ok) return problemResponse(result.status, result.detail);
// use result.url and result.ip
```

Also export two helpers for direct unit testing:
- `isPrivateIP(ipString)` — checks against blocklist (both IPv4 and IPv6)
- `parseIPv4(hostname)` — parses all IPv4 encoding variants

## Validation pipeline (execute in this exact order)

1. **Length check**: Reject if `rawUrl.length > 2048` (status 400, detail:
   "URL exceeds 2048 character limit")
2. **Parse with WHATWG URL constructor**: `new URL(rawUrl)`. If it throws,
   reject (status 400, detail: "URL is not valid"). Do NOT reflect the raw
   URL in the error message (CWE-209).
3. **Scheme allowlist**: Only `http:` and `https:` (check `parsed.protocol`).
   Reject everything else (status 400, detail: "URL scheme '<scheme>' is
   not allowed; use http or https"). This blocks `javascript:`, `data:`,
   `file:`, `ftp:`, `blob:`, `ws:`, `chrome:`, `about:`, etc.
4. **Reject embedded credentials**: If `parsed.username` or `parsed.password`
   is non-empty, reject (status 422, detail: "URLs with embedded credentials
   are not allowed").
5. **Hostname extraction and IP detection**: Extract `parsed.hostname`.
   Attempt to parse it as an IP address using a dedicated parser that
   handles ALL encoding variants (hex, octal, decimal, mixed notation,
   shorthand like `127.1`). If the hostname IS an IP address, skip DNS
   and go directly to step 7.
6. **DNS resolution**: Resolve the hostname using the injected resolvers.
   Call `resolve4(hostname)` and `resolve6(hostname)` in parallel with
   `Promise.all()`. Handle errors: if both fail, reject (status 422,
   detail: "Could not resolve hostname"). If one fails and the other
   succeeds, proceed with the successful results. If both return empty
   arrays, reject.
7. **IP classification**: Check EVERY resolved IP (or the directly-parsed
   IP from step 5) against the private/reserved blocklist. If ANY IP is
   private/reserved, reject (status 422, detail: "Host resolves to a
   private IP address"). NEVER include the actual IP in the rejection
   message -- this leaks network topology to attackers.
8. **Double-encoding detection**: Check BOTH `parsed.pathname` AND
   `parsed.search` (query string) for double-encoded sequences (`%25`
   followed by hex digits). Reject if found in either (status 422,
   detail: "URL contains double-encoded characters").
   **[ADVISORY: security-minion]** The query string must be checked because
   an attacker can smuggle double-encoded path traversal or injection
   sequences in query parameters. The simplest implementation: apply the
   `/%25[0-9a-fA-F]{2}/` pattern to `parsed.pathname + parsed.search`.
9. **Return success**: `{ ok: true, url: parsed.href, ip: firstPublicIP }`.
   Use `parsed.href` (the re-serialized URL), not the original input, to
   ensure what we validated is exactly what downstream consumers receive.
   **[ADVISORY: security-minion]** Return the first IPv4 address from
   resolve4 results if available, otherwise return the first IPv6 address
   from resolve6 results. Do NOT return a mix without a defined tiebreaker.
   Add a `// SECURITY:` comment at the return site noting that Browser
   Rendering will independently resolve DNS and may use a different address
   family. The returned IP is informational only (TOCTOU gap).

## IP address parsing (CRITICAL -- most bypass vectors target this)

**[ADVISORY: margo]** Before writing a bespoke WHATWG IPv4 parser, verify
whether `new URL('http://' + hostname).hostname` already normalizes
hex/octal/decimal/shorthand IPv4 to dotted decimal. If it does (and it
should -- the URL constructor follows the WHATWG spec), `parseIPv4` reduces
to: parse via URL constructor, check if the resulting hostname matches
`/^\d+\.\d+\.\d+\.\d+$/`, return it or null. The custom parser becomes
~5 lines instead of a hand-rolled algorithm. If the URL constructor does
NOT normalize a specific variant, document which variants need manual
handling and implement only those. This dramatically reduces complexity
and eliminates the biggest bug surface area.

Implement a `parseIPv4(hostname)` function that handles all WHATWG URL spec
IPv4 parsing variants. This is where most SSRF bypasses live.

Formats to handle:
- Dotted decimal: `127.0.0.1`
- Hex: `0x7f000001`, `0x7f.0x0.0x0.0x1`
- Octal: `0177.0.0.1`, `0177.0000.0000.0001`
- Decimal (single integer): `2130706433`
- Mixed: `0x7f.0.0.01`
- Shorthand: `127.1` (= 127.0.0.1), `10.1` (= 10.0.0.1)
- Bare zero: `0` (= 0.0.0.0)

For IPv6: The WHATWG URL constructor normalizes IPv6 addresses in brackets
(`[::1]` -> hostname `::1`). After URL parsing, check if the original had
brackets or if `parsed.hostname` looks like IPv6. Parse and classify.

**[ADVISORY: security-minion]** Handle IPv4-mapped IPv6 in BOTH forms:
- Dotted-decimal form: `::ffff:127.0.0.1` — extract the IPv4 portion
  after `::ffff:` and re-check against the IPv4 blocklist.
- **Hex-group form**: `::ffff:7f00:1` — the WHATWG URL constructor
  normalizes `[::ffff:7f00:1]` to hostname `::ffff:7f00:1` (NOT
  `::ffff:127.0.0.1`). The last 32 bits are encoded as two 16-bit hex
  groups (e.g., `7f00:0001` = 127.0.0.1). Extract the two groups,
  shift-combine them into a 32-bit integer, and run through the standard
  IPv4 private range check. Without this, `http://[::ffff:7f00:1]/` is a
  full SSRF bypass against localhost.

## Private/reserved IP blocklist

**[ADVISORY: margo]** Keep `BLOCKED_RANGES` as a module-internal constant.
Do NOT export it. There is no current consumer outside this module, and
exporting it locks the data structure as an API contract. Tests should
validate blocklist completeness through `isPrivateIP` behavior, not by
importing the constant directly. If a future audit need arises, exporting
is a one-word change.

Each entry: `[prefix, maskBits]` for IPv4 or the equivalent for IPv6.
JSDoc on every range explaining WHY it is blocked.

IPv4 ranges to block:
- `0.0.0.0/8` -- "this network" (RFC 1122). `http://0` = localhost on Linux.
- `10.0.0.0/8` -- RFC 1918 private
- `100.64.0.0/10` -- CGNAT / shared address space (RFC 6598). Cloudflare uses subsets internally.
- `127.0.0.0/8` -- loopback
- `169.254.0.0/16` -- link-local, includes cloud metadata endpoints
- `172.16.0.0/12` -- RFC 1918 private
- `192.0.0.0/24` -- IETF protocol assignments (RFC 6890)
- `192.0.2.0/24` -- TEST-NET-1 documentation (RFC 5737)
- `192.168.0.0/16` -- RFC 1918 private
- `198.18.0.0/15` -- benchmarking (RFC 2544)
- `198.51.100.0/24` -- TEST-NET-2 documentation (RFC 5737)
- `203.0.113.0/24` -- TEST-NET-3 documentation (RFC 5737)
- `240.0.0.0/4` -- reserved / future use
- `255.255.255.255/32` -- broadcast

IPv6 ranges to block:
- `::` (exact) -- unspecified
- `::1/128` -- loopback
- `::ffff:0:0/96` -- IPv4-mapped (extract and re-check IPv4 portion)
- `fc00::/7` -- unique local (ULA, includes fd00::/8)
- `fe80::/10` -- link-local
- `ff00::/8` -- multicast
- `2001:db8::/32` -- documentation range
- `100::/64` -- discard prefix (RFC 6666)

## DNS resolver injection

The default resolvers use `node:dns` (available via `nodejs_compat`):

```js
import dns from 'node:dns';

const defaultResolvers = {
  resolve4: (hostname) => dns.promises.resolve4(hostname),
  resolve6: (hostname) => dns.promises.resolve6(hostname),
};
```

Tests inject stubs that return controlled IP arrays. No mock framework
needed -- just function parameters with defaults.

Handle `resolve6` returning empty results gracefully (many domains lack
AAAA records). Only fail if BOTH resolvers return no results or error.

## Module-level threat model comment

Start the file with a 5-10 line block comment that establishes:
- What this module does (validates URLs before Browser Rendering)
- The trust boundary it enforces (untrusted caller input -> validated URL)
- Attack categories defended against (list categories, not every vector)
- Where the tests are (`test/url-validation.test.js`)
- The known TOCTOU limitation (Browser Rendering re-resolves DNS independently)

Follow the style of the existing block comment at the top of
`src/responses.js` (convention-setting, concise).

## Code signature

Include `// tva` in the file, placed where a comment looks natural (e.g.,
near the top-level imports or alongside the threat model header).

## JSDoc and security comments

Every exported function gets JSDoc naming the attack vector(s) it prevents.
Internal helper functions get `// SECURITY:` inline comments in the same
style as `src/index.js` line 22 (CWE reference where applicable).

Rule of thumb: if removing a check would create a vulnerability, the check
needs a comment explaining which vulnerability. If the check is obvious
from the code, keep the comment to one line.

## What NOT to do

- Do NOT implement redirect chain following. This module validates a single
  URL. Redirect orchestration is Step 3's job.
- Do NOT integrate with the capture endpoint or `src/index.js`. No route
  changes.
- Do NOT create standalone security documentation files. Tests are the
  security catalog. YAGNI.
- Do NOT implement TTL-based heuristics or double-resolution for DNS
  rebinding. Document the TOCTOU gap; don't over-engineer the mitigation.
- Do NOT throw errors for validation failures. Always return the result object.
- Do NOT include resolved IPs in rejection detail messages.
- Do NOT use any external dependencies. Only `node:dns` and built-in `URL`.
- Do NOT export `BLOCKED_RANGES`. Keep it module-internal.

## Codebase context

- Plain JavaScript, ESM modules, no TypeScript
- Cloudflare Worker with `nodejs_compat` flag
- Existing files: `src/index.js` (router), `src/responses.js` (RFC 9457)
- Test framework: vitest with `@cloudflare/vitest-pool-workers`
- Project philosophy: YAGNI, KISS, lean and mean (see CLAUDE.md)

### src/responses.js (for reference — match this comment style):
```js
// Detail message convention:
// - Name the specific resource: "Capture cap_abc123 not found"
// - State what is wrong and what to do: "URL scheme 'ftp' is not allowed; use http or https"
// - Human-readable, not machine-parseable (clients should switch on `status`)
// - Never leak internals (no stack traces, no storage keys, no reflected user input)

const titles = {
  400: 'Bad Request',
  // ...
};

export function problemResponse(status, detail, headers = {}) { ... }
export function jsonResponse(body, status = 200, headers = {}) { ... }
```

### src/index.js (for reference — match this security comment style):
```js
// SECURITY: Use static message -- never reflect request.method or url.pathname
// into error responses (CWE-209 information disclosure)
return problemResponse(404, 'The requested resource does not exist.');
```

## File to create

`src/url-validation.js` -- ONE file containing the complete module.

## Deliverables

1. `src/url-validation.js` with:
   - Module-level threat model comment
   - `// tva` code signature
   - `BLOCKED_RANGES` internal constant with JSDoc per range
   - `parseIPv4(hostname)` -- parses all IPv4 encoding variants (leverage URL constructor normalization where possible)
   - `isPrivateIP(ipString)` -- checks against blocklist (both IPv4 and IPv6, including hex-group IPv4-mapped IPv6)
   - `validateUrl(rawUrl, { resolve4, resolve6 })` -- the main export
   - Security JSDoc and inline comments throughout

## Success criteria

- `validateUrl('https://example.com')` with a resolver returning `['93.184.216.34']`
  returns `{ ok: true, url: 'https://example.com/', ip: '93.184.216.34' }`
- `validateUrl('http://0x7f000001/')` returns `{ ok: false, status: 422, ... }`
  (IP parsed from hostname, no DNS needed)
- `validateUrl('javascript:alert(1)')` returns `{ ok: false, status: 400, ... }`
- `validateUrl('http://user:pass@evil.com/')` returns `{ ok: false, status: 422, ... }`
- `validateUrl('http://[::ffff:7f00:1]/')` returns `{ ok: false, status: 422, ... }`
  (hex-group IPv4-mapped IPv6 bypass blocked)
- No rejection message contains an actual IP address

When you finish, mark task #1 completed with TaskUpdate and send a message to the team lead with:
- File paths with change scope and line counts
- 1-2 sentence summary of what was produced
