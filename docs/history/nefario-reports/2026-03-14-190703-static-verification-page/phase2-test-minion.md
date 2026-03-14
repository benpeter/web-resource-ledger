## Domain Plan Contribution: test-minion

### Recommendations

#### Testing Layer Strategy: Both Unit and Integration, No E2E

The project should test this feature at two layers:

1. **Unit tests for the HTML generation module** -- the function that takes verification data and returns an HTML string. This is a pure function (data in, string out) and is the highest-value test target. Test it directly without Worker infrastructure.

2. **Integration tests for content negotiation at the HTTP level** -- using the existing `SELF.fetch()` pattern from `cloudflare:test`. These tests exercise the Accept header parsing, the routing branch, and the response headers (Content-Type, CSP, Cache-Control). This is where the existing verify-integration.test.js pattern applies perfectly.

3. **No E2E / browser tests for MVP** -- The page has no interactive state beyond a single fetch-and-render cycle. Playwright or browser-based testing is overkill at this stage. The HTML output is deterministic given fixed input data, so string-level assertions are sufficient. If the page later gains interactivity (e.g., re-verify button, shareable links), reconsider.

#### How to Test HTML Responses in Vitest with Cloudflare Workers

The existing test infrastructure (`SELF.fetch()`, `env`, `fetchMock` from `cloudflare:test`) supports this directly. The pattern is identical to how JSON responses are tested today, but instead of `await res.json()` you use `await res.text()` and assert against the HTML string.

For structured assertions on HTML content without a browser DOM, use **string matching and regex**. This is the right trade-off for this project:

- `expect(html).toContain('<title>Verification Result</title>')` -- simple presence checks
- `expect(html).toMatch(/data-verified="true"/)` -- check data attributes that the JS reads
- `expect(html).toContain(captureId)` -- verify dynamic data injection
- `expect(html).not.toContain(sensitiveField)` -- security: no leaks

Do NOT add a DOM parser dependency (jsdom, linkedom, happy-dom). The project philosophy is "lean and mean" with zero unnecessary dependencies. The vitest config uses `@cloudflare/vitest-pool-workers` which runs in workerd, not Node -- adding jsdom would fight the runtime. String assertions on a self-contained HTML template are more direct and less fragile than DOM queries.

#### Content Negotiation Edge Cases

The Accept header is surprisingly complex per RFC 9110. The following cases matter and should be tested:

| Accept Header Value | Expected Response | Why It Matters |
|---|---|---|
| (absent / no header) | JSON | Default behavior, backward compatible |
| `application/json` | JSON | Explicit JSON request |
| `text/html` | HTML | Primary use case -- browsers |
| `text/html, application/json` | HTML | Browser default includes both; HTML should win |
| `text/html;q=0.9, application/json;q=1.0` | JSON | Quality values: client prefers JSON |
| `*/*` | JSON | Wildcard should default to JSON (API-first) |
| `text/html, */*` | HTML | Browser default: explicit HTML plus wildcard |
| `text/plain` | JSON | Unknown type falls back to JSON (API default) |
| `application/xml` | JSON | Unsupported type falls back to JSON |
| (empty string) | JSON | Malformed, treat as absent |
| `text/html;q=0` | JSON | q=0 means "not acceptable" per RFC 9110 |

**Key design decision**: when `Accept: */*` is sent (common from curl, API clients), the response MUST be JSON. This preserves backward compatibility. Only an explicit `text/html` preference should trigger the HTML path. This is critical -- `curl https://api.example.com/v1/verify/cap_xxx` should still return JSON.

**Recommendation**: Do NOT implement full RFC 9110 quality-value parsing for MVP. A simple check is sufficient:

```
If Accept header contains "text/html" (and text/html is not q=0) -> HTML
Otherwise -> JSON
```

Test the simple heuristic, not a full conneg implementation. YAGNI. The edge cases worth testing are the ones in the table above.

#### Testing the `<noscript>` Fallback

The `<noscript>` content cannot be tested programmatically in a meaningful way without a browser. The `<noscript>` tag only activates when JavaScript is disabled, which is a browser-level behavior. In the vitest/workerd environment, there is no DOM and no JS execution context.

What CAN be tested:

1. **String presence**: `expect(html).toContain('<noscript>')` -- verify the tag exists
2. **Fallback content correctness**: Assert that the noscript block contains the verification data embedded by the server (the server-rendered static content). This is a string test on the HTML template output.
3. **No JS dependency for critical data**: If the noscript fallback shows verification status, that status must be embedded in the HTML string by the server, not filled in by client JS. Test that the server-rendered HTML contains the verification result directly.

What CANNOT be tested without a browser:

- Whether `<noscript>` content actually renders when JS is off
- Whether the JS-enhanced view properly replaces/augments the noscript content
- Layout and visual correctness of the noscript fallback

This is acceptable for MVP. The noscript path is a static HTML template with server-rendered data -- if the data is present in the string, it will render.

#### HTML String Generation: Unit Test Design

The HTML generation function should be a pure function:

```js
// src/verify-page.js (or similar)
export function renderVerifyPage(verificationResult) → string
```

Unit test this function directly, without Worker infrastructure:

```js
import { renderVerifyPage } from '../src/verify-page.js';

it('verified: true shows success indicator', () => {
  const html = renderVerifyPage({
    verified: true,
    capture: { id: 'cap_fff...', createdAt: '...', completedAt: '...' },
    signing: { bundleHash: 'sha256:abc...', ... },
    checks: [
      { name: 'artifactHashes', status: 'pass' },
      { name: 'bundleHash', status: 'pass' },
      { name: 'signature', status: 'pass' },
    ],
  });
  expect(html).toContain('Verified');
  expect(html).not.toContain('Not Verified');
});
```

This is fast, isolated, and tests the template logic without any Worker overhead. It also makes the template function easy to develop with rapid feedback.

#### Security-Specific Test Cases

These tests should be in the integration test file alongside the existing security tests in verify-integration.test.js:

1. **No XSS from capture data**: If any field in the verification result contains HTML metacharacters (`<`, `>`, `"`, `&`), they must be entity-encoded in the HTML output. Test with a crafted capture whose URL contains `<script>alert(1)</script>`.

2. **CSP header present on HTML responses**: The HTML response must include a `Content-Security-Policy` header. Test that it is present and contains at minimum `default-src 'none'; script-src 'self'` (or nonce-based -- depends on security-minion's recommendation). This is an integration test against the actual Worker response.

3. **Content-Type header is text/html**: Verify the HTML response has `Content-Type: text/html; charset=utf-8`, not `application/json`.

4. **JSON response retains application/json Content-Type**: Verify that adding content negotiation did not break the existing JSON response path.

5. **No sensitive data in HTML**: Same as existing verify security tests -- ip, R2 keys, capture URL should not appear in the HTML response.

### Proposed Tasks

#### Task 1: Unit Tests for HTML Generation Function

- **What**: Create `test/verify-page.test.js` with unit tests for the pure HTML rendering function.
- **Deliverables**: Test file with tests covering: verified/unverified states, all three check statuses (pass/fail/skip), noscript fallback content presence, XSS prevention (HTML entity encoding of dynamic data), missing/null fields in verification result.
- **Dependencies**: Depends on the HTML generation function existing as a separate module (not inline in index.js). This should be agreed upon during the edge-minion consultation. The function signature (input shape) is already known from the existing verification response in `handleVerifyCapture`.
- **Estimated test count**: 8-12 tests.

#### Task 2: Integration Tests for Content Negotiation

- **What**: Add a new describe block to `test/verify-integration.test.js` (or a new file `test/verify-html.test.js` -- follow existing pattern of one file per feature area) testing the Accept header branching.
- **Deliverables**: Integration tests covering all Accept header variations from the edge cases table, Content-Type header correctness for both HTML and JSON paths, security headers (CSP) on HTML responses, Cache-Control parity between HTML and JSON responses.
- **Dependencies**: Requires the content negotiation logic to be implemented in `handleVerifyCapture`. Uses the existing test setup from verify-integration.test.js (real WACZ capture with signed bundle, beforeEach with `performCapture`).
- **Estimated test count**: 10-14 tests.

#### Task 3: Regression Guard for Existing JSON API

- **What**: Add explicit tests that the default (no Accept header) and `Accept: application/json` paths still return JSON. This is a regression guard against the content negotiation breaking the API contract.
- **Deliverables**: 2-3 tests in the integration file that explicitly set Accept headers and verify JSON responses are unchanged.
- **Dependencies**: None beyond existing test infrastructure. These can be written first as "green" tests against the current implementation, then verified to stay green after content negotiation is added.
- **Estimated test count**: 2-3 tests.

### Risks and Concerns

1. **Accept header parsing complexity creep**: RFC 9110 content negotiation with quality values is surprisingly complex. The risk is over-engineering the parser. Recommendation: implement the simplest possible check (`Accept.includes('text/html')`) and test the known edge cases. Do not build a general-purpose conneg library. YAGNI.

2. **HTML template size in test assertions**: If the HTML string is large (likely 5-15KB with inlined CSS), string assertions become brittle if they match on whitespace or layout structure. Recommendation: test semantic content (data values, presence of key elements), not layout. Use `toContain()` for presence checks, not snapshot testing. Snapshots of large HTML strings are the single worst use of snapshot testing -- they change constantly and developers blindly update them.

3. **XSS in template interpolation**: The highest security risk is improper escaping when injecting verification data into the HTML string. This is testable (inject `<script>` in data, verify it appears as `&lt;script&gt;` in output) but must be tested for EVERY dynamic field. Risk: a new field is added later and the escaping is forgotten. Recommendation: the HTML generation function should use a single `escapeHtml()` helper, and tests should verify that every dynamic value passes through it.

4. **CSP and inline script compatibility**: If the page uses inline `<script>` tags, the CSP must either use `'unsafe-inline'` (weak) or nonce-based script loading. Nonce-based is more secure but requires generating a unique nonce per request and including it in both the CSP header and the script tag. This is a coordination point between security-minion's CSP recommendation and the actual implementation. The test must verify the nonce in the CSP header matches the nonce in the `<script>` tag.

5. **workerd runtime limitations**: The vitest tests run in workerd (Cloudflare's runtime), not Node.js. This means no `document`, no `DOMParser`, no `jsdom`. All HTML testing must be string-based. This is not a limitation in practice for this feature, but developers unfamiliar with the test setup might instinctively reach for DOM APIs.

6. **Test file organization**: The existing test suite has a clean pattern: one file per module for unit tests, one file per feature area for integration tests. The new tests should follow this pattern. Recommendation: `test/verify-page.test.js` for unit tests of the HTML generation, and either extend `test/verify-integration.test.js` with a new describe block for content negotiation, or create `test/verify-html.test.js` if the test count warrants a separate file. Given the estimated 10-14 integration tests, a separate file is probably cleaner.

### Additional Agents Needed

None. The current team (edge-minion, ux-design-minion, ux-strategy-minion, security-minion, software-docs-minion, test-minion) covers all aspects. The test strategy does not require browser-based E2E testing for MVP, so no Playwright or browser-testing specialist is needed. If the page later gains interactive features, revisit this decision.
