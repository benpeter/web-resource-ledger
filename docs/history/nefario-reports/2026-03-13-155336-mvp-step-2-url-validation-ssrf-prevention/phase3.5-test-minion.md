ADVISE

- [test-minion]: IP range boundary tests only cover the last address of each range; the first address (network address) is untested, leaving a common off-by-one in subnet mask logic undetected.
  SCOPE: `test/url-validation.test.js` — `describe('private IP blocklist completeness')` parameterized table
  CHANGE: Add a second column to the `it.each` table that tests the first address of every range (e.g., `10.0.0.0` for `10.0.0.0/8`, `172.16.0.0` for `172.16.0.0/12`, `100.64.0.0` for `100.64.0.0/10`, etc.) in addition to the last address already planned.
  WHY: Subnet mask logic bugs almost always manifest at boundaries. Testing only the last address of a range verifies that one address is blocked but does not exercise the mask-bit-width logic that determines whether the network address itself is caught. A wrong mask (e.g., `/9` instead of `/8`) still blocks `10.255.255.255` but passes `10.0.0.0` — exactly the boundary where real SSRF payloads start.
  TASK: Task 2

- [test-minion]: The `parseIPv4` describe block is absent from the planned test structure; the function is exported and security-critical but receives no direct unit tests, relying entirely on end-to-end `validateUrl` calls to exercise it.
  SCOPE: `test/url-validation.test.js` — missing `describe('parseIPv4')` block
  CHANGE: Add a dedicated `describe('parseIPv4')` block that tests the function directly: each encoding variant (hex, octal, decimal, mixed, shorthand, bare zero) should assert the normalized dotted-decimal output, and a set of non-IP hostnames (e.g., `example.com`, `localhost`, `[::1]`) should assert `null` return.
  WHY: `parseIPv4` is a pure function with no async dependencies — unit-testing it directly produces much faster, more precise failure messages than diagnosing through `validateUrl`. If the octal parser is wrong, a direct `parseIPv4` test fails immediately with the bad output; a `validateUrl` test only tells you "the URL was not blocked," requiring manual tracing to identify which parsing step failed. The function is exported precisely to enable this.
  TASK: Task 2

- [test-minion]: The `isPrivateIP` describe block tests only IPv4 addresses; no direct `isPrivateIP` tests cover IPv6 ranges (loopback `::1`, ULA `fc00::1`, link-local `fe80::1`, IPv4-mapped `::ffff:10.0.0.1`).
  SCOPE: `test/url-validation.test.js` — `describe('private IP blocklist completeness')`
  CHANGE: Extend the `isPrivateIP` parameterized table (or add a sibling `it.each`) that calls `isPrivateIP` directly with IPv6 strings covering at least `::1`, `fc00::1`, `fd00::1`, `fe80::1`, `ff02::1`, `::ffff:127.0.0.1`, and a public IPv6 address (e.g., `2606:2800:220:1:248:1893:25c8:1946`) expected to return `false`.
  WHY: IPv6 classification is handled by the same `isPrivateIP` export but the planned table only contains IPv4 addresses. The IPv6 describe block in `describe('IPv6 private ranges')` tests `validateUrl` end-to-end with the URL constructor involved; it does not verify that `isPrivateIP('::1')` itself returns `true`. If IPv6 detection is broken inside `isPrivateIP`, the end-to-end IPv6 tests still exercise the code path but the isolation is lost — a bug in the URL-parsing layer would mask the IP-classification bug and vice versa.
  TASK: Task 2

- [test-minion]: Double-encoding tests cover only `%252F` (slash) and `%252E` (dot); there is no test for `%2500` (null byte) or `%252e%252e` (directory traversal via double-encoded dot-dot), which are common WAF evasion patterns.
  SCOPE: `test/url-validation.test.js` — `describe('double-encoded paths')`
  CHANGE: Extend the double-encoding `it.each` to include at minimum `%2500` (null byte smuggling) and a double-encoded dot-dot sequence. If the implementation's check is purely `%25` followed by hex digits, this is already covered — but the test should make the intent explicit so a future refactor that narrows the pattern does not silently regress.
  WHY: Path traversal via `%252e%252e%252f` is a classic SSRF escalation pattern after the host check passes. Testing only slash and dot double-encoding leaves the null-byte and dot-dot vectors in the "untestable" bucket when they are actually straightforwardly testable with the same mechanism.
  TASK: Task 2

- [test-minion]: The "valid URLs" positive cases do not include a test that the returned `url` field is the re-serialized `parsed.href`, not the original raw input — only `ip` is called out in the test plan.
  SCOPE: `test/url-validation.test.js` — `describe('valid URLs (positive cases)')`
  CHANGE: The existing `it('returns normalized URL in result')` test should explicitly send a URL that differs after WHATWG normalization (e.g., `HTTP://Example.COM/Path?A=1` normalizes to `http://example.com/Path?A=1`) and assert that `result.url` equals the normalized form, not the input. This validates the re-serialization guarantee that the plan calls out as a security property.
  WHY: The plan document and the module spec both state "use `parsed.href`, not the original input" as a security decision (prevents parser differentials between Node and Chromium). If the test does not exercise a case where these differ, the assertion `expect(result.url).toBe(input)` would pass even if the implementation incorrectly returns the raw input, leaving this security property untested.
  TASK: Task 2

- [test-minion]: No test covers the resolver injection failure mode where `resolve4` succeeds with a public IP but `resolve6` throws — the pass-through case is planned, but the parallel `Promise.all` failure handling when one resolver throws (vs. returns empty array) is a distinct code path that is not addressed.
  SCOPE: `test/url-validation.test.js` — `describe('DNS resolution')`
  CHANGE: Add a test stub where `resolve4` returns a public IP array and `resolve6` throws an error, asserting the result is `ok: true`. Separately add one where `resolve4` throws and `resolve6` returns a public IPv6 — both directions of partial failure should be explicit tests.
  WHY: The planned suite has `it('passes when resolve6 fails but resolve4 returns public IP')` and its mirror, but the plan's resolver stubs show only a simple throw. The implementation must distinguish "threw" from "returned empty array" because those can arise from different error conditions (`ENOTFOUND` vs. the resolver returning `[]` for a domain with no AAAA record). Both code paths need to be exercised to confirm the `Promise.allSettled`-style handling works correctly in both directions.
  TASK: Task 2

- [test-minion]: The scheme allowlist `it.each` table does not include `gopher:` or `ldap:`, which are historically exploited for SSRF in proxied environments and should appear in the catalog even if not separately tested in the implementation.
  SCOPE: `test/url-validation.test.js` — `describe('scheme allowlist')` `it.each` table
  CHANGE: Add `['gopher:', 'gopher://evil.com/']` and `['ldap:', 'ldap://evil.com/']` to the scheme rejection table. Since the implementation uses a simple allowlist (`http:` and `https:` only), these are blocked automatically — the test cost is one additional row in the existing `it.each`.
  WHY: The test suite is described as the project's primary security catalog. A security reviewer scanning test names should see that classic SSRF schemes are explicitly documented as blocked. The current list stops at `about:` but omits two schemes that appear in every SSRF writeup. The allowlist approach means adding these rows cannot break the implementation — they only add catalog coverage.
  TASK: Task 2
