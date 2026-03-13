# 0003: URL Validation Decisions

Key decisions made during this phase, with rationale and rejected alternatives.

## 1. Result object vs throw

- **Decision**: `validateUrl` returns a discriminated result object
  (`{ ok: true, url, ip }` / `{ ok: false, status, detail }`) and never throws
  for validation failures.
- **Why**: The resolved IP is only present on the success branch, making the
  structural safety invariant visible to callers without runtime checks. Aligns
  with the `problemResponse` convention already in the codebase. A caller
  integration is three lines: `const r = await validateUrl(url); if (!r.ok)
  return problemResponse(r.status, r.detail);`. Mirrors the Fetch API `ok`
  convention, which is already familiar to JS developers.
- **Rejected**: Throwing a `ValidationError` subclass. Forces callers into
  try/catch, obscures the conditional `ip` field, and breaks the pattern
  established by `problemResponse` in `src/responses.js`.

## 2. Single-URL validation, not redirect chain follower

- **Decision**: `validateUrl` validates exactly one URL per call. It does not
  follow redirects. The redirect orchestrator (Step 3) calls it once per hop.
- **Why**: Clear separation of concerns — this module answers "is this one URL
  safe?" not "is this redirect chain safe?". Browser Rendering follows its own
  redirects independently; a validation layer that also follows redirects would
  create false confidence (the browser might encounter hops we never saw).
  YAGNI: the redirect orchestrator is a Step 3 concern.
- **Rejected**: Building redirect chain following into this module. Would couple
  URL validation to HTTP client logic, complicate the API, and duplicate work
  that belongs to the orchestration layer.

## 3. Accept TOCTOU gap; document as known limitation

- **Decision**: DNS is resolved once during validation. The time-of-check to
  time-of-use (TOCTOU) gap — Browser Rendering re-resolving DNS independently
  at render time — is documented in the module header and in `outcome.md` but
  not mitigated.
- **Why**: Browser Rendering does not accept a pre-resolved IP for connection
  (Chromium opens its own sockets). Double-resolution heuristics (resolving
  twice and comparing) add latency and complexity without eliminating the race.
  The Cloudflare Worker sandbox and Chromium's network isolation layer provide
  a backstop. For MVP, the honest approach is to document the limitation rather
  than pretend it is solved.
- **Rejected**: Double-resolution check (resolve twice, reject if different
  result). TTL-based heuristics. Both add complexity with uncertain security
  gains and no way to test effectively at unit level.

## 4. Extended IP blocklist (defense in depth)

- **Decision**: Block 14 IPv4 ranges and 8 IPv6 ranges, including rarely-attacked
  ranges (TEST-NET-1/2/3, benchmarking range, discard prefix, broadcast).
- **Why**: Adding ranges costs nothing — each entry is one line. Defense in depth
  is free here. The ranges are documented with RFC references so future
  maintainers know why each entry exists.
- **Rejected**: Minimal blocklist (only RFC 1918 + loopback + link-local). Leaves
  vectors like CGNAT (100.64.0.0/10) and "this network" (0.0.0.0/8) open, even
  though exploitation is unlikely. With zero cost to block them, there is no
  reason not to.

## 5. DNS resolver injection for testability

- **Decision**: `validateUrl(url, { resolve4, resolve6 })` accepts injected
  resolver functions. Tests pass stub resolvers; production uses
  `dns.promises.resolve4/6`.
- **Why**: The simplest testability pattern — no mocking framework, no module
  stubbing. The test suite can exercise all DNS-path code paths (resolution
  failure, empty results, private IP, mixed public/private) with three lines per
  stub. Production behavior unchanged.
- **Rejected**: `dns.promises` mocked at module level (requires a mocking
  framework, harder to read). Separate `DnsResolver` class (over-engineered for
  two functions).

## 6. Delegate IPv4 encoding normalization to URL constructor

- **Decision**: `parseIPv4` wraps `new URL('http://' + hostname).hostname` and
  checks whether the result is dotted-decimal. All WHATWG-specified encoding
  variants (hex, octal, decimal integer, shorthand, mixed) normalize for free.
- **Why**: The WHATWG URL spec mandates this normalization; browsers already
  implement it correctly. A hand-rolled parser would be 40-60 lines and would
  need its own test suite. Delegation to a spec-compliant implementation is
  simpler and more correct.
- **Rejected**: Hand-rolled IPv4 parser. Would be longer, harder to maintain,
  and would inevitably miss encoding variants that the URL constructor handles
  by spec.

## 7. Prefer IPv4 over IPv6 for the returned informational IP

- **Decision**: When both A and AAAA records resolve successfully, the returned
  `ip` field contains the first IPv4 address.
- **Why**: IPv4 is easier to read and log. The field is explicitly informational
  (subject to TOCTOU; Browser Rendering independently re-resolves). The choice
  has no security implications.
- **Rejected**: Prefer IPv6 (less familiar in logs). Return all IPs (API bloat
  for an informational-only field).

## 8. Keep BLOCKED_RANGES constants internal (not exported)

- **Decision**: `IPV4_BLOCKED_RANGES` and `IPV6_BLOCKED_RANGES` are module-private.
  Callers access the check through `isPrivateIP()`.
- **Why**: The raw range arrays are implementation details. Exporting them would
  create an implicit API contract, forcing semver consideration for any future
  range additions. Callers have no legitimate need to inspect the list directly.
- **Rejected**: Exporting the arrays for inspection in tests. Tests validate
  behavior via `isPrivateIP()` and `validateUrl()`, not via the raw data
  structure. This is the correct level of abstraction.
