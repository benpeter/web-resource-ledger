# Task 2: Implement Comprehensive Test Suite

You are writing the test suite for `src/url-validation.js`, a URL
validation module that prevents SSRF attacks in a Cloudflare Worker.
This test file is the project's primary security documentation -- the
test names form a catalog of blocked attack vectors.

## What to build

Create `test/url-validation.test.js` with comprehensive tests covering
all SSRF bypass vectors from the acceptance criteria and beyond.

## Module API (what you are testing)

```js
import { validateUrl, isPrivateIP, parseIPv4 } from '../src/url-validation.js';

// validateUrl signature:
async function validateUrl(rawUrl, { resolve4, resolve6 } = defaultResolvers)
// Returns: { ok: true, url: string, ip: string }
//      or: { ok: false, status: number, detail: string }

// isPrivateIP signature:
function isPrivateIP(ipString) -> boolean

// parseIPv4 signature:
function parseIPv4(hostname) -> string | null
// Returns normalized dotted-decimal or null if not an IP
```

**NOTE:** `BLOCKED_RANGES` is NOT exported (it is module-internal per margo's
advisory). Test blocklist completeness through `isPrivateIP` behavior, not
by importing the constant directly.

## Resolver injection pattern

For unit tests, inject stub resolvers instead of using real DNS:

```js
const publicResolver = {
  resolve4: async () => ['93.184.216.34'],
  resolve6: async () => ['2606:2800:220:1:248:1893:25c8:1946'],
};

const loopbackResolver = {
  resolve4: async () => ['127.0.0.1'],
  resolve6: async () => ['::1'],
};

const failingResolver = {
  resolve4: async () => { throw new Error('ENOTFOUND'); },
  resolve6: async () => { throw new Error('ENOTFOUND'); },
};
```

## Test structure (organize as security catalog)

Use `describe` blocks by attack category, `it.each` for parameterized
bypass vectors, individual `it()` for distinct code paths. A security
reviewer reading ONLY the test names (not the bodies) should understand
the full scope of what is blocked.

### Required describe blocks and cases:

```
describe('URL validation')

  describe('valid URLs (positive cases)')
    it('accepts http:// URL with public IP resolution')
    it('accepts https:// URL with public IP resolution')
    it('returns normalized URL in result')
      // [ADVISORY: test-minion] Use input that differs post-normalization
      // (e.g. HTTP://Example.COM/Path?A=1 normalizes to http://example.com/Path?A=1)
      // Assert result.url equals normalized form, NOT the input
    it('returns first resolved IP in result')
    it('accepts URL with path and query string')
    it('accepts URL at exactly 2048 characters')

  describe('URL length limit')
    it('rejects URL exceeding 2048 characters')

  describe('URL parsing')
    it('rejects unparseable URL')
    it('rejects empty string')
    it('rejects relative URL without scheme')

  describe('scheme allowlist')
    it.each([
      ['javascript:', 'javascript:alert(1)'],
      ['data:', 'data:text/html,<script>alert(1)</script>'],
      ['file:', 'file:///etc/passwd'],
      ['ftp:', 'ftp://evil.com/file'],
      ['blob:', 'blob:http://evil.com/uuid'],
      ['ws:', 'ws://evil.com/socket'],
      ['wss:', 'wss://evil.com/socket'],
      ['chrome:', 'chrome://settings'],
      ['about:', 'about:blank'],
      // [ADVISORY: test-minion] Classic SSRF schemes for security catalog completeness
      ['gopher:', 'gopher://evil.com/'],
      ['ldap:', 'ldap://evil.com/'],
    ])('rejects %s scheme: %s', ...)
    it('allows http: scheme')
    it('allows https: scheme')

  describe('embedded credentials')
    it('rejects URL with username: http://user@host')
    it('rejects URL with username and password: http://user:pass@host')

  describe('IPv4 address obfuscation')
    it.each([
      ['dotted decimal loopback',     'http://127.0.0.1/',        '127.0.0.1'],
      ['hex-encoded loopback',        'http://0x7f000001/',       '127.0.0.1'],
      ['octal-encoded loopback',      'http://0177.0.0.1/',      '127.0.0.1'],
      ['decimal-encoded loopback',    'http://2130706433/',       '127.0.0.1'],
      ['mixed hex/octal',             'http://0x7f.0.0.01/',     '127.0.0.1'],
      ['shorthand loopback',          'http://127.1/',            '127.0.0.1'],
      ['bare zero (0.0.0.0)',         'http://0/',                '0.0.0.0'],
      ['hex zero',                    'http://0x0/',              '0.0.0.0'],
      ['dotted hex parts',            'http://0x7f.0x0.0x0.0x1/','127.0.0.1'],
      ['RFC 1918 10.x',              'http://0xa000001/',        '10.0.0.1'],
      ['RFC 1918 192.168.x',         'http://0xc0a80001/',       '192.168.0.1'],
      ['RFC 1918 172.16.x',          'http://0xac100001/',       '172.16.0.1'],
      ['CGNAT range',                'http://0x64400001/',       '100.64.0.1'],
      ['link-local',                 'http://0xa9fe0001/',       '169.254.0.1'],
    ])('blocks %s: %s (parsed as %s)', ...)

  describe('IPv6 private ranges')
    it.each([
      ['loopback ::1',               'http://[::1]/'],
      ['IPv4-mapped loopback',       'http://[::ffff:127.0.0.1]/'],
      ['IPv4-mapped private',        'http://[::ffff:10.0.0.1]/'],
      // [ADVISORY: security-minion] hex-group IPv4-mapped — critical bypass vector
      ['IPv4-mapped loopback hex-group', 'http://[::ffff:7f00:1]/'],
      ['ULA fc00::',                 'http://[fc00::1]/'],
      ['ULA fd00::',                 'http://[fd00::1]/'],
      ['link-local fe80::',          'http://[fe80::1]/'],
      ['multicast ff02::',           'http://[ff02::1]/'],
      ['unspecified ::',             'http://[::]/'],
      ['documentation 2001:db8::',   'http://[2001:db8::1]/'],
    ])('blocks %s: %s', ...)

  describe('parseIPv4')
    // [ADVISORY: test-minion] Direct unit tests for the security-critical function
    it.each([
      ['dotted decimal',   '127.0.0.1',    '127.0.0.1'],
      ['hex integer',      '0x7f000001',   '127.0.0.1'],
      ['octal',            '0177.0.0.1',   '127.0.0.1'],
      ['decimal integer',  '2130706433',   '127.0.0.1'],
      ['shorthand',        '127.1',        '127.0.0.1'],
      ['bare zero',        '0',            '0.0.0.0'],
      ['hex zero',         '0x0',          '0.0.0.0'],
      ['mixed hex/octal',  '0x7f.0.0.01', '127.0.0.1'],
    ])('parses %s: %s -> %s', (name, input, expected) => {
      expect(parseIPv4(input)).toBe(expected);
    })
    it.each([
      ['domain name',    'example.com'],
      ['localhost',      'localhost'],
      ['IPv6',           '::1'],
      ['empty string',   ''],
    ])('returns null for non-IPv4: %s', (name, input) => {
      expect(parseIPv4(input)).toBeNull();
    })

  describe('isPrivateIP — IPv4 blocklist completeness')
    // [ADVISORY: test-minion] Test BOTH first and last address of each range
    it.each([
      // [range,              first address,      last address]
      ['0.0.0.0/8',          '0.0.0.0',          '0.255.255.255'],
      ['10.0.0.0/8',         '10.0.0.0',         '10.255.255.255'],
      ['100.64.0.0/10',      '100.64.0.0',       '100.127.255.255'],
      ['127.0.0.0/8',        '127.0.0.0',        '127.255.255.255'],
      ['169.254.0.0/16',     '169.254.0.0',      '169.254.255.255'],
      ['172.16.0.0/12',      '172.16.0.0',       '172.31.255.255'],
      ['192.0.0.0/24',       '192.0.0.0',        '192.0.0.255'],
      ['192.0.2.0/24',       '192.0.2.0',        '192.0.2.255'],
      ['192.168.0.0/16',     '192.168.0.0',      '192.168.255.255'],
      ['198.18.0.0/15',      '198.18.0.0',       '198.19.255.255'],
      ['198.51.100.0/24',    '198.51.100.0',     '198.51.100.255'],
      ['203.0.113.0/24',     '203.0.113.0',      '203.0.113.255'],
      ['240.0.0.0/4',        '240.0.0.0',        '255.255.255.254'],
      ['255.255.255.255/32', '255.255.255.255',   '255.255.255.255'],
    ])('blocks %s range (first: %s, last: %s)', (range, first, last) => {
      expect(isPrivateIP(first)).toBe(true);
      expect(isPrivateIP(last)).toBe(true);
    })

    it('allows public IP 8.8.8.8', () => {
      expect(isPrivateIP('8.8.8.8')).toBe(false);
    })
    it('allows public IP 93.184.216.34', () => {
      expect(isPrivateIP('93.184.216.34')).toBe(false);
    })

  describe('isPrivateIP — IPv6 ranges')
    // [ADVISORY: test-minion] Direct isPrivateIP tests for IPv6 (not through validateUrl)
    it.each([
      ['loopback ::1',              '::1',              true],
      ['ULA fc00::1',               'fc00::1',          true],
      ['ULA fd00::1',               'fd00::1',          true],
      ['link-local fe80::1',        'fe80::1',          true],
      ['multicast ff02::1',         'ff02::1',          true],
      ['IPv4-mapped 127.0.0.1',     '::ffff:127.0.0.1', true],
      ['IPv4-mapped 10.0.0.1',      '::ffff:10.0.0.1',  true],
      // hex-group form
      ['IPv4-mapped hex 7f00:1',    '::ffff:7f00:1',    true],
      ['documentation 2001:db8::1', '2001:db8::1',      true],
      ['unspecified ::',            '::',               true],
      ['discard 100::1',            '100::1',           true],
      // Public IPv6 should NOT be blocked
      ['public IPv6',               '2606:2800:220:1:248:1893:25c8:1946', false],
    ])('isPrivateIP(%s) = %s', (name, ip, expected) => {
      expect(isPrivateIP(ip)).toBe(expected);
    })

  describe('DNS resolution')
    // [ADVISORY: margo] Use 2-3 representative private IPs for DNS path,
    // not re-testing every range (blocklist completeness tested via isPrivateIP)
    it('blocks hostname resolving to loopback 127.0.0.1')
    it('blocks hostname resolving to RFC 1918 10.x')
    it('blocks hostname resolving to IPv6 ULA fc00::')
    it('blocks when ANY resolved IP is private (mixed results)')
    it('passes when all resolved IPs are public')
    it('rejects when both resolve4 and resolve6 fail')
    it('rejects when both resolvers return empty arrays')
    // [ADVISORY: test-minion] Both directions of partial failure
    it('passes when resolve6 fails but resolve4 returns public IP')
    it('passes when resolve4 fails but resolve6 returns public IP')
    // [ADVISORY: test-minion] Throws vs empty array distinction
    it('passes when resolve4 returns public IP and resolve6 throws')
    it('passes when resolve6 returns public IPv6 and resolve4 throws')

  describe('double-encoded paths')
    it('rejects double-encoded slash in path: %252F')
    it('rejects double-encoded dot in path: %252E')
    // [ADVISORY: test-minion] Additional patterns
    it('rejects double-encoded null byte: %2500')
    it('rejects double-encoded dot-dot traversal: %252e%252e')
    // [ADVISORY: security-minion] Query string double-encoding
    it('rejects double-encoded slash in query string: ?q=%252F')
    it('allows single-encoded characters (not double-encoded)')

  describe('error message safety')
    it('rejection detail for private IP does not contain the actual IP')
    it('rejection detail for unparseable URL does not reflect the raw input')

  describe('untestable vectors (documented)')
    // Block comment documenting vectors that require integration/staging:
    // - DNS rebinding (requires controlled DNS with TTL manipulation)
    // - TOCTOU gap (Browser Rendering re-resolves DNS independently)
    // - Cloud metadata DNS aliases (only resolve inside cloud networks)
    // [ADVISORY: security-minion] CNAME chain following:
    // - CNAME chains that ultimately resolve to private IPs: the resolvers
    //   return only final A/AAAA records, so CNAME bypasses are covered by
    //   the IP check, but only if the DNS resolver follows the chain to
    //   completion. Custom resolver stubs in production must not
    //   short-circuit CNAME resolution.
    // [ADVISORY: lucy] Redirect-chain acceptance criteria deferred:
    // - "DNS-to-loopback redirect blocked" and "Redirect to private IP
    //   after initial validation blocked" are acceptance criteria from
    //   Issue #2 that require redirect orchestration (Step 3). This module
    //   validates single URLs; redirect chain re-validation is deferred.
```

## Conventions to follow

Match the existing test style from `test/responses.test.js` and
`test/health.test.js`:
- Import from vitest: `import { describe, it, expect } from 'vitest'`
- Import module under test directly
- Descriptive test names that read as security requirements
- `async` test functions for all `validateUrl` tests
- Use `expect(result.ok).toBe(false)` for rejections, not `.toThrow()`
- Check `result.status` matches expected HTTP status (400 vs 422)

## What NOT to do

- Do NOT create integration tests that hit the worker endpoint via SELF.fetch.
  This module is not wired into any route yet. That is Step 3.
- Do NOT use `fetchMock` or `cloudflare:test` utilities. These are pure
  unit tests with injected stubs.
- Do NOT create a separate test file. Everything goes in
  `test/url-validation.test.js`.
- Do NOT test redirect chain following. This module validates single URLs.
- Do NOT skip the "error message safety" tests. They are a security
  requirement, not optional.
- Do NOT import `BLOCKED_RANGES` — it is not exported. Test blocklist
  completeness through `isPrivateIP` behavior.

## Codebase context

- Vitest with `@cloudflare/vitest-pool-workers` (Miniflare pool)
- Config: `vitest.config.js` uses `defineWorkersConfig`
- Existing tests: `test/responses.test.js`, `test/health.test.js`
- Plain JavaScript, ESM modules

## File to create

`test/url-validation.test.js` -- ONE file containing all tests.

## Deliverables

1. `test/url-validation.test.js` with all describe blocks and test cases
   listed above, plus any additional edge cases you identify.

## Success criteria

- All tests in the acceptance criteria are present and pass:
  hex/octal/decimal IP blocking, IPv6-mapped IPv4 (including hex-group form),
  IPv6 ULA, DNS-to-loopback, embedded credentials, double-encoded paths
- `npx vitest run` passes with zero failures
- Test names form a readable security catalog
- Error message safety tests verify no IP leakage in rejection details

When you finish your task, mark task #2 completed with TaskUpdate and
send a message to the team lead with:
- File paths with change scope and line counts
- 1-2 sentence summary of what was produced
