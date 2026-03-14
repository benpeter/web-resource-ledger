## Domain Plan Contribution: test-minion

### Recommendations

#### 1. OpenAPI Validation: Lint Step, Not a Test

OpenAPI spec validation should be a **lint/CI step**, not a vitest test. Rationale:

- The spec is a static YAML file. Validating it does not require the Worker runtime, Miniflare, KV, R2, or any of the `@cloudflare/vitest-pool-workers` infrastructure.
- Running it as a vitest test inside the Cloudflare worker pool would be a misuse of the pool -- importing a YAML parser and OpenAPI validator into the Worker sandbox adds unnecessary complexity and is likely to hit compatibility issues with node:fs imports.
- As a lint step, it runs in <1 second and fails fast before heavier integration tests.

**Recommended tool: `@redocly/cli`** (formerly `redocly-cli`). Reasons:

- It is the most actively maintained OpenAPI validator as of 2026. `swagger-cli validate` (the IBM openapi-validator alias) was archived. `@redocly/cli` is the de facto standard.
- Supports OpenAPI 3.1 natively (the project uses `openapi: 3.1.0`).
- Zero-config for basic validation: `npx @redocly/cli lint openapi.yaml` works out of the box.
- Can be added as an npm script (`"lint:api": "redocly lint openapi.yaml"`) and run in CI alongside `vitest run`.
- No new dependency in `dependencies` -- only `devDependencies`, which aligns with the project's lean philosophy.

**Alternative considered and rejected:** Writing a vitest test that imports a validation library (e.g., `@apidevtools/swagger-parser`). This works but is slower, heavier, and conflates spec validation with runtime testing. The spec is a contract document, not runtime code -- validate it as a document.

**Do NOT add response-schema-matching tests** that validate live Worker responses against the OpenAPI schema at this time. That would be valuable for a larger project, but this project has 16 test files with thorough hand-written assertions on response shapes, status codes, headers, and content types. Adding schema-based response validation would duplicate existing coverage without providing proportional value. Revisit if the API surface grows significantly.

#### 2. Signing-Key Endpoint Tests

The `GET /.well-known/signing-key` endpoint needs integration tests via `SELF.fetch()` in the existing Cloudflare worker pool, following the exact same patterns as `test/health.test.js` and `test/capture-retrieval.test.js`. This is a simple GET endpoint with no auth, making it one of the lightest test files to write.

**Required test cases (new file: `test/signing-key.test.js`):**

| Test | What it verifies |
|------|-----------------|
| Returns 200 with base64 body | Happy path -- endpoint exists and returns key material |
| Response body decodes to exactly 32 bytes | Ed25519 raw public key is always 32 bytes; catches key format errors |
| Content-Type is appropriate | Whatever the design decision is (text/plain, application/octet-stream, or JSON) |
| Cache-Control headers present | Key changes only on rotation; verify caching strategy is applied |
| Security headers present (Referrer-Policy, X-Content-Type-Options) | Global header middleware covers this endpoint too |
| HSTS header present | New header being added globally in this step |
| X-Frame-Options present | New header being added globally in this step |
| POST returns 404 | Method not matched by route table (consistent with health endpoint pattern) |
| Returns 503 when SIGNING_KEY is not configured | Graceful degradation when env is misconfigured |
| Returned key matches the key used for signing | Round-trip: sign data with env key, verify with the key returned by the endpoint |

The round-trip test is the most important one. It proves the endpoint returns the correct public key -- the one that actually corresponds to the private key used for WACZ signing. Without this test, the endpoint could return any 32 bytes of garbage and all other tests would pass.

**Implementation note:** The vitest config already injects a test `SIGNING_KEY` into Miniflare bindings (line 19 of `vitest.config.js`). The signing-key endpoint will derive the public key from this same binding, so the tests will work without additional config.

#### 3. Security Header Tests

The existing test suite already validates `Referrer-Policy: no-referrer` and `X-Content-Type-Options: nosniff` across multiple endpoint test files (health.test.js, capture-integration.test.js, capture-retrieval.test.js, verify-integration.test.js). This step adds two new global headers: `Strict-Transport-Security` and `X-Frame-Options: DENY`.

**Strategy: centralized security header test, not scattered assertions.**

The current approach of checking security headers in each endpoint's test file works but creates maintenance burden when a new header is added (you must update 5+ test files). For this step, I recommend creating a **dedicated `test/security-headers.test.js`** that systematically tests all global security headers across all routes in one place.

**Required test cases:**

| Test | What it verifies |
|------|-----------------|
| All security headers present on GET /health | Baseline happy path |
| All security headers present on POST /v1/captures (401 response) | Error responses include headers |
| All security headers present on GET /v1/captures/{id} (404 response) | Not-found responses include headers |
| All security headers present on GET /.well-known/signing-key | New endpoint |
| All security headers present on GET /nonexistent (404 fallback) | Catch-all route |
| HSTS max-age is >= 31536000 | Minimum recommended value for HSTS |
| X-Frame-Options is exactly DENY | Not SAMEORIGIN or other values |

Each "all security headers" assertion should check all five headers in a single test using a helper:

```js
function expectSecurityHeaders(response) {
  expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
  expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  expect(response.headers.get('X-Frame-Options')).toBe('DENY');
  const hsts = response.headers.get('Strict-Transport-Security');
  expect(hsts).toBeTruthy();
  expect(hsts).toMatch(/max-age=\d+/);
}
```

This helper can also be used by existing test files if they want to keep their local header checks, but the centralized file is the authoritative coverage.

#### 4. Verification Endpoint OpenAPI Coverage

The `openapi.yaml` currently has no path entry for `GET /v1/verify/{captureId}`. The spec completion task adds this. The existing `test/verify-integration.test.js` already thoroughly tests the verification endpoint (happy path, tamper detection, error cases, headers, security field leaks, content negotiation). No new test file is needed for the verification endpoint itself -- coverage is already strong.

However, **one gap exists**: the content negotiation path (`Accept: text/html` returning HTML) is not tested in the integration test suite. The `verify-page.test.js` tests the HTML generation function in isolation but does not test the full HTTP path through `SELF.fetch()` with an `Accept: text/html` header. Consider adding one integration test to `verify-integration.test.js`:

```js
it('returns HTML when Accept: text/html is sent', async () => {
  const res = await SELF.fetch(`https://worker.test/v1/verify/${TEST_ID}`, {
    headers: { Accept: 'text/html' },
  });
  expect(res.status).toBe(200);
  expect(res.headers.get('Content-Type')).toContain('text/html');
});
```

This is low-effort high-value since it validates the content negotiation routing in `src/index.js` lines 292-295.

#### 5. DNS Pinning Verification

The meta-plan mentions "DNS pinning enforcement verified" as a validation/test task. The existing `test/url-validation.test.js` already tests private IP rejection. No new test file is needed for this -- the coverage exists. If the acceptance criteria require a specific "defense-in-depth" test beyond what exists, it would be verifying that the URL validator is actually called in the capture flow, which is already covered by the integration test that rejects `ftp://` URLs through the full POST endpoint.

### Proposed Tasks

#### Task A: Add OpenAPI Lint Script
- **What**: Install `@redocly/cli` as devDependency, add `"lint:api": "redocly lint openapi.yaml"` to package.json scripts
- **Deliverables**: Updated `package.json` with script and devDependency; CI can run `npm run lint:api`
- **Dependencies**: None (can be done first, runs against existing spec before modifications)
- **Estimate**: Trivial -- 5 lines of config

#### Task B: Create `test/signing-key.test.js`
- **What**: Integration tests for `GET /.well-known/signing-key` covering the 10 cases listed above
- **Deliverables**: `test/signing-key.test.js` -- approximately 80-100 lines following existing test patterns
- **Dependencies**: Depends on the signing-key endpoint implementation in `src/index.js` (the route handler must exist). Can be written in parallel if the handler name and response format are agreed upon.
- **Estimate**: Small -- follows the exact pattern of `test/health.test.js`

#### Task C: Create `test/security-headers.test.js`
- **What**: Centralized security header coverage across all routes, including the two new headers (HSTS, X-Frame-Options)
- **Deliverables**: `test/security-headers.test.js` -- approximately 60-80 lines
- **Dependencies**: Depends on the global header additions in `src/index.js` (HSTS and X-Frame-Options must be set)
- **Estimate**: Small

#### Task D: Add content-negotiation integration test to verify-integration.test.js
- **What**: One additional test case verifying Accept: text/html returns HTML through the full HTTP path
- **Deliverables**: ~8 lines added to existing `test/verify-integration.test.js`
- **Dependencies**: None (verify endpoint already exists)
- **Estimate**: Trivial

#### Task E: Run OpenAPI lint and fix spec errors
- **What**: After spec completion (adding verify and signing-key paths), run `npx @redocly/cli lint openapi.yaml` and fix any reported errors
- **Deliverables**: Clean lint output, possibly minor spec fixes
- **Dependencies**: Depends on Task A and the spec completion work done by api-spec-minion
- **Estimate**: Small -- most errors are structural (missing required fields, $ref typos)

### Risks and Concerns

1. **`@redocly/cli` OpenAPI 3.1 edge cases**: The project uses `const` keyword in schemas (e.g., `const: about:blank`, `const: ok`, `const: complete`). This is valid OpenAPI 3.1 / JSON Schema 2020-12, but some validators have historically flagged it. `@redocly/cli` handles this correctly, but verify after installation.

2. **Miniflare HSTS behavior**: The test environment uses Miniflare (local Cloudflare Workers simulation). HSTS headers are set in application code (not at the CDN level), so they will appear correctly in tests via `SELF.fetch()`. No risk here -- just confirming the testing strategy is sound.

3. **Existing security header tests may become redundant**: Creating a centralized `test/security-headers.test.js` creates overlap with header assertions scattered across `capture-integration.test.js`, `capture-retrieval.test.js`, and `verify-integration.test.js`. Recommendation: leave existing assertions in place (they serve as documentation of per-endpoint expectations) but do not add new per-endpoint header assertions. The centralized file is the canonical coverage for global headers.

4. **Signing-key endpoint 503 test**: If the implementation team decides to NOT return 503 when SIGNING_KEY is missing (e.g., returning 404 instead, or omitting the route entirely when no key is configured), the test plan needs adjustment. The `getSigningKeys()` function in `src/signing.js` already returns `null` when SIGNING_KEY is absent, and the verify endpoint uses this to return 503 -- so the pattern exists. But the signing-key endpoint design needs to agree on this behavior.

5. **Content-negotiation gap is low severity**: The missing Accept: text/html integration test for the verify endpoint is not blocking -- the HTML generation is unit-tested and the JSON path is integration-tested. But since this step is about hardening and completeness, it is worth closing the gap.

6. **No response-schema validation against OpenAPI spec**: This is a deliberate omission, not an oversight. Tools like `openapi-response-validator` can auto-check that HTTP responses match the spec schemas. This project has hand-written assertions that are more precise and maintainable at the current scale (7 routes, 16 test files). Adding schema-based validation would increase test fragility (spec changes break tests even when behavior is correct) without proportional benefit. Flag for revisit if the API surface doubles.

### Additional Agents Needed

None. The current team (api-spec-minion, security-minion, edge-minion, api-design-minion, ux-strategy-minion, user-docs-minion, test-minion) covers all the domains needed for this step. The testing strategy I have outlined is straightforward integration testing that does not require additional specialist input.
