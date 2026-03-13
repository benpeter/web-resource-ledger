# 0003: URL Validation Outcome

## What Was Produced

Two files:

- `src/url-validation.js` — 428 lines. Exports `validateUrl`, `isPrivateIP`,
  and `parseIPv4`. The module is self-contained: no runtime dependencies beyond
  `node:dns`.
- `test/url-validation.test.js` — 472 lines. 108 tests, all passing.

## Exports

| Export | Signature | Purpose |
|--------|-----------|---------|
| `validateUrl` | `(rawUrl, resolvers?) → Promise<Result>` | Main entry point; full validation pipeline |
| `isPrivateIP` | `(ipString) → boolean` | IPv4 and IPv6 private/reserved range check |
| `parseIPv4` | `(hostname) → string\|null` | WHATWG-normalized IPv4 parsing |

`Result` is a discriminated union:
- `{ ok: true, url: string, ip: string }` — normalized URL and first public IP
- `{ ok: false, status: number, detail: string }` — rejection with HTTP status

## Validation Pipeline

1. Length check: reject > 2048 characters (400)
2. WHATWG URL constructor parse: reject malformed URLs (400)
3. Scheme allowlist: http/https only (400)
4. Credentials: reject username/password in URL (422)
5. Direct IP detection: if hostname is an IP, check blocklist immediately
6. DNS resolution: parallel A + AAAA lookup via injected resolvers
7. IP classification: check every resolved address; reject if any is private (422)
8. Double-encoding: scan pathname + query for `%25XX` patterns (422)
9. Return `{ ok: true, url: parsed.href, ip }` with normalized URL

## Test Coverage

108 tests across 12 describe blocks:

| Block | Tests |
|-------|-------|
| valid URLs (positive cases) | 6 |
| URL length limit | 2 |
| URL parsing | 3 |
| scheme allowlist | 13 (11 rejected schemes + 2 allowed) |
| embedded credentials | 2 |
| IPv4 address obfuscation | 14 |
| IPv6 private ranges | 10 |
| parseIPv4 (unit) | 12 |
| isPrivateIP — IPv4 blocklist completeness | 30 (14 ranges × first+last + 2 public) |
| isPrivateIP — IPv6 ranges | 12 |
| DNS resolution | 11 |
| double-encoded paths | 6 |
| error message safety | 2 |

## Bug Found During Testing

`parseIPv6ToBigInt` initially did not handle the dotted-decimal IPv4-mapped
form (`::ffff:127.0.0.1`). The `::` expansion code split the right-hand side
into groups, leaving `127.0.0.1` as the last element. `parseInt('127.0.0.1', 16)`
silently truncates at the `.`, producing `0x127 = 295` instead of the correct
`0x7f000001`. The resulting BigInt was wrong, so `::ffff:127.0.0.1` bypassed
the IPv4-mapped check entirely.

Fix: detect a trailing dotted-decimal segment in the right-hand groups after
`::` expansion and convert it to two 16-bit hex strings using
`ipv4DottedToTwoGroups()` before the BigInt conversion. The fix also covers the
non-abbreviated case (`::ffff:7f00:1` uses the hex-group path; the bug was
specific to the dotted-decimal + `::` combination).

Both forms are now covered by dedicated test cases and blocked correctly.

## Known Limitations

**TOCTOU gap**: Browser Rendering re-resolves DNS independently at render time.
The `ip` field in the success result is informational only. An attacker with
control over a DNS server and favorable timing could change the A record between
validation and render. Mitigations (double-resolution, TTL heuristics) were
considered and rejected as YAGNI for MVP — see `decisions.md` entry 3.

**Untestable vectors at unit level** (documented in test file):
- DNS rebinding: requires controlled DNS with TTL manipulation
- Cloud metadata DNS aliases (e.g. `metadata.google.internal`): only resolve
  inside cloud VPCs
- CNAME chain resolution: covered if the DNS resolver follows chains to final
  A/AAAA records, but custom resolver stubs must not short-circuit CNAME resolution

## Deferred Acceptance Criteria

Two acceptance criteria from Issue #2 are not met by this module and are
explicitly deferred to Step 3:

- **"DNS-to-loopback redirect blocked"**: requires following a redirect from a
  public URL to a loopback destination — out of scope for single-URL validation
- **"Redirect to private IP after initial validation blocked"**: same reason

These are tracked in the Step 3 issue. The test file includes a comment block
documenting this explicitly.

## Next

Step 3 wires `validateUrl` into the capture endpoint's request handler. The
redirect orchestrator will call `validateUrl` once per hop (max 5), using the
result's `ip` field for DNS pinning when Browser Rendering supports it.

The result object API was designed to make the caller integration trivial:

```js
const r = await validateUrl(rawUrl);
if (!r.ok) return problemResponse(r.status, r.detail);
// r.url is safe to pass to Browser Rendering
```
