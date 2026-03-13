## Delegation Plan

**Team name**: mvp-step-2-url-validation
**Description**: Build a tested URL validation module (`src/url-validation.js`) that blocks known SSRF bypass vectors for the Cloudflare Worker, with comprehensive test suite covering all acceptance criteria.

### Task 1: Implement URL validation module

- **Agent**: security-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: yes
- **Gate reason**: This is the sole security control between untrusted input and Browser Rendering. The API contract (result object shape, validation pipeline order, IP blocklist completeness) locks in constraints for the test suite and all future callers. Hard to reverse (API contract), high blast radius (Task 2 depends on it entirely).
- **Prompt**: |
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
    8. **Double-encoding detection**: Check the path component for
       double-encoded sequences (`%25` followed by hex digits). Reject if
       found (status 422, detail: "URL contains double-encoded characters").
    9. **Return success**: `{ ok: true, url: parsed.href, ip: firstPublicIP }`.
       Use `parsed.href` (the re-serialized URL), not the original input, to
       ensure what we validated is exactly what downstream consumers receive.

    ## IP address parsing (CRITICAL -- most bypass vectors target this)

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

    Algorithm: Follow the WHATWG URL spec "IPv4 parser" (section 3.5). Each
    part can be decimal (default), hex (0x prefix), or octal (0 prefix).
    If fewer than 4 parts, the last part fills remaining octets.

    For IPv6: The WHATWG URL constructor normalizes IPv6 addresses in brackets
    (`[::1]` -> hostname `::1`). After URL parsing, check if the original had
    brackets or if `parsed.hostname` looks like IPv6. Parse and classify.
    Handle IPv4-mapped IPv6 (`::ffff:127.0.0.1` -> extract and check the
    IPv4 portion).

    ## Private/reserved IP blocklist (export as `BLOCKED_RANGES`)

    Export the blocklist as a constant array for auditability and independent
    testing. Each entry: `[prefix, maskBits]` for IPv4 or the equivalent for
    IPv6. JSDoc on every range explaining WHY it is blocked.

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

    ## JSDoc and security comments

    Every exported function gets JSDoc naming the attack vector(s) it prevents.
    Internal helper functions get `// SECURITY:` inline comments in the same
    style as `src/index.js` line 22 (CWE reference where applicable).

    Rule of thumb: if removing a check would create a vulnerability, the check
    needs a comment explaining which vulnerability. If the check is obvious
    from the code, keep the comment to one line.

    ## What NOT to do

    - Do NOT implement redirect chain following. This module validates a single
      URL. Redirect orchestration is Step 3's job. The module will be called
      once per hop by the caller.
    - Do NOT integrate with the capture endpoint or `src/index.js`. No route
      changes. This module is imported by future code, not wired in yet.
    - Do NOT create standalone security documentation files. Tests are the
      security catalog. YAGNI.
    - Do NOT implement TTL-based heuristics or double-resolution for DNS
      rebinding. Document the TOCTOU gap; don't over-engineer the mitigation.
    - Do NOT throw errors for validation failures. Always return the result
      object.
    - Do NOT include resolved IPs in rejection detail messages. This leaks
      network topology.
    - Do NOT use any external dependencies. The module uses only `node:dns`
      (via nodejs_compat) and the built-in `URL` constructor.

    ## Codebase context

    - Plain JavaScript, ESM modules, no TypeScript
    - Cloudflare Worker with `nodejs_compat` flag
    - Existing files: `src/index.js` (router), `src/responses.js` (RFC 9457)
    - Test framework: vitest with `@cloudflare/vitest-pool-workers`
    - Project philosophy: YAGNI, KISS, lean and mean (see CLAUDE.md)

    ## File to create

    `src/url-validation.js` -- ONE file containing the complete module.

    ## Deliverables

    1. `src/url-validation.js` with:
       - Module-level threat model comment
       - `BLOCKED_RANGES` exported constant with JSDoc per range
       - `parseIPv4(hostname)` -- parses all IPv4 encoding variants
       - `isPrivateIP(ipString)` -- checks against blocklist (both IPv4 and IPv6)
       - `validateUrl(rawUrl, { resolve4, resolve6 })` -- the main export
       - Security JSDoc and inline comments throughout

    ## Success criteria

    - `validateUrl('https://example.com')` with a resolver returning `['93.184.216.34']`
      returns `{ ok: true, url: 'https://example.com/', ip: '93.184.216.34' }`
    - `validateUrl('http://0x7f000001/')` returns `{ ok: false, status: 422, ... }`
      (IP parsed from hostname, no DNS needed)
    - `validateUrl('javascript:alert(1)')` returns `{ ok: false, status: 400, ... }`
    - `validateUrl('http://user:pass@evil.com/')` returns `{ ok: false, status: 422, ... }`
    - No rejection message contains an actual IP address

- **Deliverables**: `src/url-validation.js` with all exports, JSDoc, security comments, and threat model header
- **Success criteria**: Module exports `validateUrl`, `isPrivateIP`, `parseIPv4`, and `BLOCKED_RANGES`. All functions follow the documented API contract. No external dependencies beyond `node:dns`.

### Task 2: Implement comprehensive test suite

- **Agent**: test-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |
    You are writing the test suite for `src/url-validation.js`, a URL
    validation module that prevents SSRF attacks in a Cloudflare Worker.
    This test file is the project's primary security documentation -- the
    test names form a catalog of blocked attack vectors.

    ## What to build

    Create `test/url-validation.test.js` with comprehensive tests covering
    all SSRF bypass vectors from the acceptance criteria and beyond.

    ## Module API (what you are testing)

    ```js
    import { validateUrl, isPrivateIP, parseIPv4, BLOCKED_RANGES }
      from '../src/url-validation.js';

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
          ['ULA fc00::',                 'http://[fc00::1]/'],
          ['ULA fd00::',                 'http://[fd00::1]/'],
          ['link-local fe80::',          'http://[fe80::1]/'],
          ['multicast ff02::',           'http://[ff02::1]/'],
          ['unspecified ::',             'http://[::]/'],
          ['documentation 2001:db8::',   'http://[2001:db8::1]/'],
        ])('blocks %s: %s', ...)

      describe('DNS resolution')
        it('blocks hostname resolving to loopback 127.0.0.1')
        it('blocks hostname resolving to RFC 1918 10.0.0.0/8')
        it('blocks hostname resolving to RFC 1918 172.16.0.0/12')
        it('blocks hostname resolving to RFC 1918 192.168.0.0/16')
        it('blocks hostname resolving to link-local 169.254.x.x')
        it('blocks hostname resolving to CGNAT 100.64.x.x')
        it('blocks hostname resolving to IPv6 loopback ::1')
        it('blocks hostname resolving to IPv6 ULA fc00::')
        it('blocks when ANY resolved IP is private (mixed results)')
        it('passes when all resolved IPs are public')
        it('rejects when both resolve4 and resolve6 fail')
        it('passes when resolve6 fails but resolve4 returns public IP')
        it('passes when resolve4 fails but resolve6 returns public IP')
        it('rejects when both resolvers return empty arrays')

      describe('double-encoded paths')
        it('rejects double-encoded slash: %252F')
        it('rejects double-encoded dot: %252E')

      describe('private IP blocklist completeness')
        it.each([
          ['0.0.0.0/8',       '0.1.2.3'],
          ['10.0.0.0/8',      '10.255.255.255'],
          ['100.64.0.0/10',   '100.127.255.255'],
          ['127.0.0.0/8',     '127.255.255.255'],
          ['169.254.0.0/16',  '169.254.255.255'],
          ['172.16.0.0/12',   '172.31.255.255'],
          ['192.0.0.0/24',    '192.0.0.255'],
          ['192.0.2.0/24',    '192.0.2.255'],
          ['192.168.0.0/16',  '192.168.255.255'],
          ['198.18.0.0/15',   '198.19.255.255'],
          ['198.51.100.0/24', '198.51.100.255'],
          ['203.0.113.0/24',  '203.0.113.255'],
          ['240.0.0.0/4',     '240.1.2.3'],
          ['255.255.255.255', '255.255.255.255'],
        ])('isPrivateIP blocks %s range (tested with %s)', ...)

        it('isPrivateIP allows public IP 8.8.8.8')
        it('isPrivateIP allows public IP 93.184.216.34')

      describe('error message safety')
        it('rejection detail for private IP does not contain the actual IP')
        it('rejection detail for unparseable URL does not reflect the raw input')

      describe('untestable vectors (documented)')
        // Block comment documenting vectors that require integration/staging:
        // - DNS rebinding (requires controlled DNS with TTL manipulation)
        // - TOCTOU gap (Browser Rendering re-resolves DNS independently)
        // - Cloud metadata DNS aliases (only resolve inside cloud networks)
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
      hex/octal/decimal IP blocking, IPv6-mapped IPv4, IPv6 ULA,
      DNS-to-loopback, embedded credentials, double-encoded paths
    - `npx vitest run` passes with zero failures
    - Test names form a readable security catalog (a reviewer can scan
      `describe`/`it` names and understand the full security boundary)
    - Error message safety tests verify no IP leakage in rejection details

- **Deliverables**: `test/url-validation.test.js` with comprehensive test coverage
- **Success criteria**: All acceptance criteria bypass vectors tested and passing. `npx vitest run` succeeds. Test names readable as security catalog.

### Task 3: Create evolution log entries

- **Agent**: software-docs-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1, Task 2
- **Approval gate**: no
- **Prompt**: |
    Create the evolution log entries for the URL validation phase in
    `docs/evolution/0003-url-validation/`. This is a CLAUDE.md requirement
    and is non-negotiable.

    ## Files to create

    ### 1. `docs/evolution/0003-url-validation/prompt.md`

    The task that initiated this phase. Write:

    ```
    # Phase 0003: URL Validation & SSRF Prevention

    Build a tested URL validation module (`src/url-validation.js`) that blocks
    known SSRF bypass vectors for the Cloudflare Worker.

    Source: GitHub issue #2

    ## Requirements

    - URL scheme allowlist (http/https only)
    - Reject embedded credentials and bare 0.0.0.0
    - DNS pre-resolution with private IP blocking (IPv4 + IPv6)
    - DNS pinning (resolve once, pass to Browser Rendering)
    - Redirect chain re-validation at each hop (max 5)
    - URL normalization and 2048-char limit
    - Unit test suite covering all bypass vectors

    ## Acceptance criteria

    Hex/octal/decimal IP blocking, IPv6-mapped IPv4, IPv6 ULA,
    DNS-to-loopback redirect, redirect to private IP, embedded credentials,
    double-encoded paths. All tests pass in Miniflare pool.
    ```

    ### 2. `docs/evolution/0003-url-validation/decisions.md`

    Key decisions made during this phase. Document each with the decision,
    alternatives considered, and rationale. Include:

    **Decision 1: Result object vs throw for validation failures**
    - Chosen: Result object with `ok` discriminant
    - Rejected: Throwing `ValidationError` (security-minion's initial proposal)
    - Rationale: (1) Resolved IP only available on success -- structurally
      prevents misuse. (2) Existing codebase pattern: `problemResponse()`
      returns, doesn't throw. (3) Caller integration is 3 lines with zero
      decisions. (4) `ok` matches Fetch API convention.

    **Decision 2: Single-URL validation, not redirect chain follower**
    - Chosen: Export a per-hop `validateUrl()` function
    - Rejected: Module that follows redirects with `fetch({redirect:'manual'})`
    - Rationale: (1) Separation of concerns: validation module validates,
      doesn't make HTTP requests. (2) Browser Rendering follows its own
      redirects -- our fetch chain != the browser's chain, creating false
      confidence. (3) YAGNI: redirect orchestration is Step 3's problem.

    **Decision 3: Accept TOCTOU gap with Browser Rendering DNS**
    - Chosen: Document as known limitation, rely on defense-in-depth
    - Rejected: Double-resolution, TTL heuristics, DNS-over-HTTPS pinning
    - Rationale: (1) Browser Rendering cannot accept pre-resolved IPs. (2)
      The Chromium sandbox runs in Cloudflare's network-isolated infrastructure.
      (3) YAGNI for MVP -- Layer 1 (resolve and check) + implicit Layer 3
      (sandbox network isolation) is sufficient.

    **Decision 4: Extended IP blocklist beyond issue requirements**
    - Chosen: Block 14+ IPv4 ranges and 8+ IPv6 ranges including CGNAT, TEST-NETs,
      benchmarking, documentation ranges
    - Rejected: Minimal list from the issue only
    - Rationale: Defense-in-depth. Costs nothing to block non-routable ranges.
      CGNAT `100.64.0.0/10` is especially important as Cloudflare uses
      subsets internally.

    **Decision 5: DNS resolver injection via options object**
    - Chosen: `{ resolve4, resolve6 }` options with `node:dns` defaults
    - Rejected: (a) Mock frameworks, (b) DNS-over-HTTPS via fetch
    - Rationale: (1) `dns.promises.resolve4/resolve6` confirmed available via
      `nodejs_compat`. (2) Injection is simplest testability pattern -- no mock
      framework needed. (3) Isolates module from DNS implementation changes.

    **Decision 6: No standalone security document**
    - Chosen: Tests as security catalog, JSDoc in source
    - Rejected: Standalone security controls inventory document
    - Rationale: YAGNI. No external auditors, no compliance requirements. Test
      names form a readable catalog. Creating a separate document duplicates
      the test suite and goes stale.

    ### 3. `docs/evolution/0003-url-validation/outcome.md`

    Write after reviewing the implemented code. Summarize:
    - What was built (module exports, test count, line counts)
    - What the validation pipeline looks like in practice
    - Any deviations from the plan
    - Known limitations (TOCTOU gap, untestable vectors documented in tests)
    - What comes next (Step 3 wires this into capture endpoint)

    ### 4. Update `docs/evolution/README.md`

    Add a row to the index table:

    ```
    | [0003-url-validation](0003-url-validation/) | URL validation module and SSRF prevention (Issue #2) |
    ```

    ## What NOT to do

    - Do NOT write the `process.md` file. The orchestrator writes that after
      the PR is created.
    - Do NOT create any files outside `docs/evolution/0003-url-validation/`
      and the README.md update.
    - Do NOT modify any source or test files.
    - Do NOT include the full specialist consultation text. Summarize
      decisions concisely.

    ## Codebase context

    - Evolution log pattern: see `docs/evolution/0001-kickoff/` and
      `docs/evolution/0002-scaffold/` for examples
    - CLAUDE.md requires all four files: prompt.md, decisions.md, outcome.md,
      process.md (process.md is handled separately)
    - Next sequence number: 0003

- **Deliverables**: `docs/evolution/0003-url-validation/prompt.md`, `decisions.md`, `outcome.md`, updated `docs/evolution/README.md`
- **Success criteria**: All evolution log files present with honest, specific content. README index updated.

### Cross-Cutting Coverage

- **Testing** (test-minion): Task 2 -- comprehensive unit test suite. Phase 6 post-execution handles running the tests.
- **Security** (security-minion): Task 1 -- the entire module IS a security control. security-minion is the primary agent for implementation. Phase 3.5 architecture review covers plan-level security review.
- **Usability -- Strategy** (ux-strategy-minion): Incorporated into Task 1 prompt. The result-object API contract, the 3-line caller integration, the `ok` discriminant, the `status`/`detail` mapping to `problemResponse()` -- all from ux-strategy-minion's recommendations. No separate task needed; the design is baked into the implementation prompt.
- **Usability -- Design** (ux-design-minion, accessibility-minion): NOT INCLUDED. No user-facing interface is produced. This is a backend module with a programmatic API.
- **Documentation** (software-docs-minion): Task 3 -- evolution log entries. In-code documentation (threat model comment, JSDoc, security comments) is specified in Task 1's prompt. No separate documentation task for code docs because they are integral to the implementation.
- **Observability** (observability-minion, sitespeed-minion): NOT INCLUDED. No runtime service or web-facing component is produced. The module is a library function. Logging of validation results is the caller's responsibility (Step 3).

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - None selected. Rationale below.
- **Not selected**: ux-design-minion (no UI), accessibility-minion (no UI), sitespeed-minion (no web-facing runtime), observability-minion (single library module, no coordinated services), user-docs-minion (no end-user-facing changes yet -- module is internal)

Discretionary reviewer evaluation:
  - ux-design-minion: No -- plan produces no UI components or visual layouts.
  - accessibility-minion: No -- plan produces no HTML or web-facing UI.
  - sitespeed-minion: No -- plan produces a library module, not runtime web code.
  - observability-minion: No -- plan produces 1 library module, not multiple runtime services requiring coordinated observability.
  - user-docs-minion: No -- module is internal; end users do not interact with it directly. User-facing changes come in Step 3.

### Conflict Resolutions

**Throw vs. Result Object** (security-minion vs. ux-strategy-minion):
- security-minion recommended throwing `ValidationError` on failure, arguing the caller cannot accidentally use an invalid URL because there is no URL to use.
- ux-strategy-minion recommended a result object with `ok` discriminant, arguing that thrown errors require callers to remember try/catch (failure mode: unhandled throw crashes request), while the result object forces structural inspection of the outcome.
- **Resolution**: Result object wins. Four reasons: (1) the resolved IP is structurally only available on success, (2) existing codebase convention follows return-not-throw (`problemResponse()`), (3) caller integration is 3 lines vs. try/catch/conditional, (4) `ok` matches Fetch API convention. The "pit of success" argument is decisive -- the correct usage path is also the easiest path.

**Redirect handling scope** (security-minion vs. edge-minion alignment):
- Both agreed the module should validate single URLs, not follow redirects.
- security-minion noted that the module's fetch redirect chain would not match the browser's redirect chain, creating false confidence.
- edge-minion confirmed `fetch({redirect:'manual'})` works in Workers but recommended it be the caller's responsibility.
- **Resolution**: No conflict -- both aligned. Module exports per-hop validation, caller orchestrates the chain in Step 3.

### Risks and Mitigations

1. **TOCTOU gap between validation and Browser Rendering (HIGH)**
   - Impact: Full SSRF if attacker controls DNS and times rebinding between validation and `page.goto()`
   - Mitigation: Document as known limitation. Browser Rendering sandbox runs in Cloudflare's network-isolated infrastructure (no access to customer private networks). Defense-in-depth in Step 3: Puppeteer request interception + pre-flight validation.
   - Owner: Documented in Task 1 (module comment), Task 3 (evolution log)

2. **Incomplete IPv4 parsing leading to bypass (HIGH)**
   - Impact: Direct SSRF bypass if any encoding variant is missed
   - Mitigation: Implement from WHATWG URL spec IPv4 parser algorithm. Exhaustive parameterized tests in Task 2 covering hex, octal, decimal, mixed, shorthand variants.
   - Owner: Task 1 (implementation), Task 2 (test coverage)

3. **URL parser differential between Node.js and Chromium (MEDIUM)**
   - Impact: URL that validates safely is interpreted differently by the browser
   - Mitigation: Use `parsed.href` (re-serialized URL) in the result, not original input. Independent IP parsing that doesn't rely on URL constructor hostname normalization.
   - Owner: Task 1 (implementation detail)

4. **IPv6 complexity and missed representations (MEDIUM)**
   - Impact: IPv6 bypass vector not caught
   - Mitigation: Test IPv4-mapped, ULA, link-local, multicast, documentation ranges. Check IPv4-mapped IPv6 by extracting and re-checking the IPv4 portion.
   - Owner: Task 2 (test coverage)

5. **Evolution log entry gets skipped (MEDIUM)**
   - Impact: Breaks project documentation requirement, has happened before
   - Mitigation: Explicit Task 3 dedicated to evolution log. Feedback memory flags this as a past failure. Task 3 runs after implementation but is not optional.
   - Owner: Task 3

### Execution Order

```
Batch 1 (sequential, gated):
  Task 1: Implement URL validation module [security-minion]
    --> APPROVAL GATE (API contract, blocklist, pipeline order)

Batch 2 (parallel after gate clears):
  Task 2: Implement test suite [test-minion]
  Task 3: Create evolution log entries [software-docs-minion]

Post-execution (automatic):
  Phase 5: Code review (code-review-minion, lucy, margo)
  Phase 6: Test execution (vitest run)
  Phase 8: Documentation check
```

### Verification Steps

1. Run `npx vitest run` -- all tests pass with zero failures
2. Verify `src/url-validation.js` exports: `validateUrl`, `isPrivateIP`, `parseIPv4`, `BLOCKED_RANGES`
3. Verify result object shape matches spec (success: `{ok, url, ip}`, failure: `{ok, status, detail}`)
4. Verify no rejection message contains an actual IP address (grep test assertions)
5. Verify `docs/evolution/0003-url-validation/` contains prompt.md, decisions.md, outcome.md
6. Verify `docs/evolution/README.md` includes 0003 entry
7. Verify module has no external dependencies (only `node:dns`)
8. Manual review: read the test names as a security catalog -- are all acceptance criteria vectors covered?
