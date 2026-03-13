## Domain Plan Contribution: test-minion

### Recommendations

#### (a) DNS in Miniflare: Use Dependency Injection, Not node:dns

Cloudflare Workers support `node:dns` via `nodejs_compat`, but with critical limitations: `dns.lookup()` and `dns.resolve()` throw "Not implemented". Only `dns.promises.resolve4()` and `dns.promises.resolve6()` work, and they execute real DNS-over-HTTPS queries against 1.1.1.1, each counting as a subrequest.

For testing, real DNS queries are unacceptable -- they make tests slow, flaky, and unable to simulate private-IP resolution. The module MUST accept an injected resolver function:

```js
// Production: uses dns.promises.resolve4 / resolve6
// Tests: inject a stub that returns controlled IP arrays
export async function validateUrl(url, { resolve4, resolve6 } = defaultResolvers) { ... }
```

This follows the existing codebase pattern -- `responses.test.js` imports functions directly for pure unit testing. The URL validation module should be testable the same way: import the function, inject stubs, assert results. No SELF.fetch needed for the core validation logic.

#### (b) Resolver Injection Design for Testability

The resolver should be a simple options object with two async functions:

```js
const defaultResolvers = {
  resolve4: (hostname) => dns.promises.resolve4(hostname),
  resolve6: (hostname) => dns.promises.resolve6(hostname),
};
```

Tests inject stubs that return specific IPs:

```js
const loopbackResolver = {
  resolve4: async () => ['127.0.0.1'],
  resolve6: async () => ['::1'],
};
```

This is the simplest approach that works. No mock frameworks needed, no complex DI containers. Just function parameters with defaults.

For the fetch-with-redirect-validation path, the module should also accept an injected `fetcher` function (defaulting to global `fetch`) so tests can control redirect behavior without `fetchMock`. However, `fetchMock` from `cloudflare:test` is available and works well for this -- the choice depends on how the module is structured.

#### (c) Redirect Chain Testing: Two Complementary Approaches

**Approach 1 -- Unit test the validation logic directly (preferred for most cases):**

The redirect-following logic should be a separate function that takes a URL, fetches with `redirect: 'manual'`, reads the `Location` header, validates the destination, and repeats. Test this by injecting a mock fetcher:

```js
const mockFetcher = async (url) => {
  if (url === 'https://legit.com/page') {
    return new Response(null, { status: 302, headers: { Location: 'http://127.0.0.1/secret' } });
  }
};
const result = await validateUrlWithRedirects('https://legit.com/page', { fetcher: mockFetcher, ...resolvers });
expect(result.blocked).toBe(true);
expect(result.reason).toContain('private IP');
```

This is fast, deterministic, and tests the exact logic we care about.

**Approach 2 -- Integration test via fetchMock (for the DNS-to-loopback and redirect-to-private-IP cases):**

Use `fetchMock` from `cloudflare:test` to set up mock responses, then call the worker endpoint via `SELF.fetch`. This validates the full request path including the worker's use of the validation module:

```js
import { fetchMock, SELF } from 'cloudflare:test';

beforeAll(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});

it('blocks redirect to private IP', async () => {
  fetchMock
    .get('https://evil.com')
    .intercept({ path: '/redirect' })
    .reply(302, null, { headers: { Location: 'http://169.254.169.254/metadata' } });
  // Then call SELF.fetch with a URL that triggers the redirect validation
});
```

Note: `fetchMock` from `cloudflare:test` is based on undici's MockAgent. It intercepts `fetch()` calls within the test runner Worker. It does NOT intercept `fetch()` calls from the Worker-under-test unless the test is structured to call the validation function directly within the test worker context.

**Recommendation:** Prioritize Approach 1 (direct unit tests with injected dependencies) for the core validation logic. Add a small number of Approach 2 integration tests that validate the worker endpoint correctly wires up the validation module.

#### (d) Test Organization: Parameterized Tests Grouped by Attack Category

Use `it.each` for the bypass vectors, grouped into `describe` blocks by attack category. This gives the best auditability -- a security reviewer can scan the describe block names to see which categories are covered, and each parameterized case shows the specific vector tested.

Proposed structure for `test/url-validation.test.js`:

```
describe('URL validation')
  describe('scheme validation')
    it('rejects non-http/https schemes')

  describe('IP address obfuscation')
    it.each([
      ['hex-encoded',   'http://0x7f000001/',          '127.0.0.1'],
      ['octal',         'http://0177.0.0.1/',          '127.0.0.1'],
      ['decimal',       'http://2130706433/',           '127.0.0.1'],
      ['ipv6-mapped',   'http://[::ffff:127.0.0.1]/',  '127.0.0.1'],
      ['ipv6-ula',      'http://[fc00::1]/',            'fc00::1'],
    ])('blocks %s IP: %s', async (label, url, expectedIp) => { ... })

  describe('DNS resolution')
    it('blocks hostname resolving to loopback')
    it('blocks hostname resolving to private RFC 1918 range')
    it('blocks hostname resolving to link-local 169.254.x.x')
    it('blocks hostname resolving to IPv6 loopback ::1')

  describe('credential stripping')
    it('blocks embedded credentials: http://user@169.254.169.254/')

  describe('path encoding')
    it('blocks double-encoded paths: %252F..%252F')

  describe('redirect chain validation')
    it('blocks DNS-to-loopback redirect')
    it('blocks redirect to private IP after initial validation')
    it('allows redirect to valid public IP')
    it('enforces maximum redirect depth')
```

Key design choices:
- `it.each` for the IP obfuscation cases because they test the same code path with different encodings. This is the textbook use case for parameterization -- same behavior, varied input.
- Separate `it()` for DNS, redirect, and credential cases because they test fundamentally different code paths. Parameterizing across different mechanisms would obscure what each test is validating.
- Each test name reads as a security requirement: "blocks hex-encoded IP", "blocks redirect to private IP". A failing test name immediately tells a reviewer which vector is broken.
- The `label` parameter in `it.each` produces readable test output like `blocks hex-encoded IP: http://0x7f000001/`.

#### (e) Vectors That Need Integration or Staging-Level Testing

Three categories of bypass are untestable or only partially testable in unit tests:

**1. DNS Rebinding (requires real timing and DNS TTL manipulation)**
In a DNS rebinding attack, a hostname resolves to a public IP on first query, then to a private IP on subsequent queries. The attacker controls a DNS server that returns different results over time. This cannot be simulated with static resolver stubs -- the stubs always return the same value. The mitigation (resolve once, pin the IP, fetch using the resolved IP) can be unit-tested for correctness, but the actual race condition requires an integration test with a controlled DNS server. **Flag this for integration testing.**

**2. Time-of-check-to-time-of-use (TOCTOU) gaps**
Even if you validate the IP before fetching, DNS results can change between validation and fetch. The only real mitigation in Workers is to resolve the DNS yourself, validate the IP, and then connect to the IP directly (which Workers may not support for arbitrary IPs). This is an architectural concern more than a test concern. **Flag this as a known limitation to document.**

**3. Cloud metadata service access via DNS aliases**
Services like `metadata.google.internal` or AWS `169.254.169.254` are reachable only from within cloud networks. Unit tests can verify that these IPs are blocked, but cannot verify that the DNS resolution of cloud-internal hostnames is handled correctly because those hostnames only resolve inside the cloud. **Covered by DNS resolution unit tests (inject resolver returning 169.254.169.254) but flag for production smoke test.**

**Fully testable in unit tests (no caveats):**
- All IP obfuscation formats (hex, octal, decimal, IPv6-mapped, IPv6 ULA)
- Embedded credentials
- Double-encoded paths
- Redirect chain following with injected fetcher
- Private IP range checking

### Proposed Tasks

**Task 1: Define the module's testable API surface**
- What: Agree on the function signature for `validateUrl()` including the resolver/fetcher injection points. The API must be designed for testability from the start.
- Deliverable: Documented function signature in the implementation plan.
- Dependencies: Security minion's recommendations on what the validation checks should be.

**Task 2: Write the IP obfuscation and private range unit tests**
- What: Create `test/url-validation.test.js` with parameterized tests for all IP encoding bypass vectors and private IP range detection. These tests drive the implementation of the URL parsing and IP normalization logic.
- Deliverable: `test/url-validation.test.js` with describe blocks for scheme validation, IP obfuscation (`it.each`), credential stripping, and path encoding. All tests should fail initially (TDD red phase).
- Dependencies: Task 1 (agreed API surface).

**Task 3: Write DNS resolution unit tests**
- What: Add tests for hostname-to-IP resolution with injected resolver stubs. Cover loopback, RFC 1918, link-local, and IPv6 private ranges. Include a test for resolution failure (DNS error should block, not allow).
- Deliverable: DNS resolution describe block in `test/url-validation.test.js`.
- Dependencies: Task 1.

**Task 4: Write redirect chain validation tests**
- What: Add tests for redirect following with injected mock fetcher. Cover: redirect to private IP blocked, redirect chain depth limit, redirect to public IP allowed, DNS-to-loopback via redirect.
- Deliverable: Redirect chain describe block in `test/url-validation.test.js`.
- Dependencies: Task 1.

**Task 5: Add integration tests for worker endpoint wiring**
- What: Add 2-3 integration tests in a separate file (`test/url-validation-integration.test.js` or within an existing integration test file) that hit the worker endpoint via `SELF.fetch` and verify the validation module is correctly wired into the request handling path. Use `fetchMock` from `cloudflare:test` to mock outbound requests.
- Deliverable: Integration test file verifying the worker rejects URLs with SSRF vectors via the actual HTTP endpoint.
- Dependencies: Tasks 2-4 complete (unit tests passing), worker endpoint implementation wired up.

**Task 6: Document untestable vectors**
- What: Add a comment block or dedicated section in the test file documenting which bypass vectors require integration/staging testing: DNS rebinding, TOCTOU, cloud metadata DNS aliases.
- Deliverable: Documented section in test file and/or in `docs/evolution/` outcome.
- Dependencies: None.

### Risks and Concerns

**Risk 1: node:dns behavior differences between Miniflare and production workerd**
The `nodejs_compat` DNS implementation in Workers uses DNS-over-HTTPS via 1.1.1.1. Miniflare may or may not faithfully emulate this. If the module uses `dns.promises.resolve4()` as the default resolver, production and test environments could behave differently. Mitigation: the injected resolver pattern isolates tests from DNS implementation details entirely. For production, consider an integration smoke test that does a real resolution.

**Risk 2: URL constructor behavior differences**
The `new URL()` constructor in workerd may parse obfuscated IPs differently than in Node.js or browsers. For example, `new URL('http://0x7f000001/')` -- does workerd normalize the hex IP to `127.0.0.1` in the hostname, or does it preserve it as-is? The validation logic depends heavily on how URL parsing works. **The implementation must test URL constructor behavior in the Miniflare environment first**, not assume Node.js behavior.

**Risk 3: fetchMock limitations for redirect testing**
The `fetchMock` from `cloudflare:test` uses undici's MockAgent. It may not support all redirect scenarios (e.g., multi-hop redirects, cross-origin redirects). If the redirect validation uses `redirect: 'manual'` (which it should), the mock just needs to return 3xx responses with Location headers, which MockAgent supports well. But verify this works in Miniflare before committing to the approach.

**Risk 4: False sense of security from passing tests**
URL validation SSRF prevention is security-critical. Passing unit tests with injected stubs prove the logic is correct but do not prove the module is secure in production. The gap between "logic is correct" and "deployed system is secure" includes DNS caching, workerd fetch behavior, CDN-level redirects, and runtime environment differences. This risk cannot be eliminated by unit tests alone -- it needs production-like integration testing eventually.

**Risk 5: IPv6 parsing complexity**
IPv6 addresses have many valid representations (compressed, expanded, mixed notation). The test suite should include edge cases beyond the acceptance criteria: `::1`, `0:0:0:0:0:0:0:1`, `[::1]`, `[0000:0000:0000:0000:0000:ffff:7f00:0001]`. Missing a representation means missing a bypass vector. Recommend adding a broader set of IPv6 variations as parameterized test cases.

### Additional Agents Needed

None. The current team (security-minion for threat vectors, edge-minion for Cloudflare runtime specifics, test-minion for test strategy, software-docs-minion for documentation) covers the necessary expertise. The security minion should provide the definitive list of IP ranges to block and any additional bypass vectors beyond the acceptance criteria.
