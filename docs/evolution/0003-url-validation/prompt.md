# 0003: URL Validation and SSRF Prevention

Build a tested URL validation module that blocks SSRF bypass vectors. Single
URL per call; invoked per-hop by a redirect orchestrator in Step 3.

## Source

GitHub Issue #2: MVP Step 2 — SSRF-Safe URL Validation

## Description

Implement `src/url-validation.js` as a standalone, tested module that
validates caller-supplied URLs before they are passed to Browser Rendering
(headless Chromium). The module must fail closed on any input it cannot
safely classify as pointing to a public, non-reserved IP address.

## Requirements (this phase)

- **Scheme allowlist**: accept only `http:` and `https:`; reject all others
  (javascript:, data:, file:, ftp:, ws:, wss:, chrome:, about:, gopher:, ldap:, …)
- **Reject embedded credentials**: block URLs with userinfo (user@ or user:pass@)
- **IPv4 encoding variants**: detect and block hex (`0x7f000001`), octal
  (`0177.0.0.1`), decimal integer (`2130706433`), shorthand (`127.1`), and
  mixed-notation forms
- **IPv6 private ranges**: block loopback (::1), ULA (fc00::/7, fd00::/8),
  link-local (fe80::/10), multicast (ff00::/8), unspecified (::), documentation
  (2001:db8::/32), and discard (100::/64)
- **IPv4-mapped IPv6**: block both dotted-decimal form (`::ffff:127.0.0.1`)
  and hex-group form (`::ffff:7f00:1`)
- **DNS pre-resolution**: resolve hostname before passing URL to Chromium;
  check all returned A and AAAA records
- **Double-encoding detection**: reject `%25XX` sequences in path and query
  string (CWE-116)
- **URL normalization**: return the WHATWG-normalized URL (`parsed.href`),
  not the raw input
- **Result object API**: return `{ ok: true, url, ip }` on success or
  `{ ok: false, status, detail }` on failure; never throw for validation errors
- **Unit test suite**: cover all attack categories with injected DNS resolvers

## Deferred to Step 3 (redirect orchestration)

The following items from Issue #2 are intentionally out of scope for this phase.
They require redirect chain logic that this module does not implement.

- **DNS pinning**: resolve once, pass the resolved IP to Browser Rendering so
  Chromium connects to the pre-verified address
- **Redirect chain re-validation**: call `validateUrl` at each hop; max 5 hops
- Acceptance criterion: "DNS-to-loopback redirect blocked" (requires following
  a redirect from a public URL to a loopback destination)
- Acceptance criterion: "Redirect to private IP after initial validation blocked"
  (requires following a redirect from a public URL to a private IP destination)

## Acceptance Criteria (this phase)

- Hex/octal/decimal-integer IPv4 encoding blocked
- IPv6-mapped IPv4 in dotted-decimal form (`::ffff:127.0.0.1`) blocked
- IPv6-mapped IPv4 in hex-group form (`::ffff:7f00:1`) blocked
- IPv6 ULA (`fc00::/7`) blocked
- DNS-to-loopback on a single hop blocked (hostname resolving to 127.0.0.1)
- Embedded credentials (`user:pass@host`) blocked
- Double-encoded path segments (`%252F`, `%2500`) blocked
- Double-encoded query string values blocked
