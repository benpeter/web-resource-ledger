# Test Strategy: R3 CORS + R4 HSTS + R5 X-RateLimit-Limit

## Domain Plan Contribution: test-minion

---

### Recommendations

#### 1. CORS tests: New file `test/cors.test.js` -- not in `security-headers.test.js`

**Decision**: Create a dedicated `test/cors.test.js`.

**Rationale**: The existing `security-headers.test.js` tests a narrow concern: that a fixed set of security headers appears on every response, regardless of route. It uses a shared `expectSecurityHeaders()` helper and makes simple GET/POST requests without special request headers. CORS testing is fundamentally different in character:

- It requires **OPTIONS requests** (a method not tested anywhere in the suite today).
- It requires sending **Origin** headers and inspecting response headers that vary per-request based on origin matching.
- It needs **env var injection** to test the configurable allowlist.
- It tests a conditional behavior (allowed vs. disallowed origin), not a universal header.

Putting CORS tests in `security-headers.test.js` would bloat a focused file and blur its purpose. The existing codebase convention is one-file-per-concern: `auth.test.js`, `url-validation.test.js`, `responses.test.js`, `signing-key.test.js`. A new `cors.test.js` follows this pattern exactly.

**What stays in `security-headers.test.js`**: The HSTS assertion update (R4) belongs there -- it is a direct modification to an existing security header value, and the file already tests HSTS. The "specific value checks" describe block already validates `max-age` numerically.

#### 2. CORS origin allowlist testing via vitest miniflare bindings

**Mechanism**: The configurable origin allowlist should be an env var (e.g., `CORS_ALLOWED_ORIGINS`). In tests, this is injected via `vitest.config.js` in `miniflare.bindings`, the same way `CAPTURE_API_KEY` and `SIGNING_KEY` are injected today.

The recommended approach is to set a test origin in `vitest.config.js`:

```js
bindings: {
  CAPTURE_API_KEY: 'test-api-key-for-vitest',
  SIGNING_KEY: testSigningKey,
  TEST_ARCHIVED_KEY: testArchivedKey,
  CORS_ALLOWED_ORIGINS: 'https://allowed.example.com,https://other-allowed.example.com',
},
```

Then CORS tests send requests with `Origin: https://allowed.example.com` (should get CORS headers) and `Origin: https://evil.example.com` (should not). This avoids dynamic env var manipulation and is deterministic.

**Important**: Do NOT use `isolatedStorage: true` or per-test miniflare instances. The project explicitly disables isolated storage (comment in vitest.config.js explains the R2 WAL issue). All test isolation is done via explicit cleanup in `beforeEach`.

#### 3. Interaction with existing `Access-Control-Allow-Origin: *` on read endpoints

The codebase already sets `Access-Control-Allow-Origin: *` on five read-only endpoints in `src/index.js`:

- `GET /v1/captures/{id}` (handleGetCapture, line 298)
- `GET /v1/captures/{id}/artifacts/{name}` (handleGetCaptureArtifact, line 350)
- `GET /v1/verify/{id}` (handleVerifyCapture, line 415/451)
- `GET /.well-known/signing-key` (handleGetSigningKey, line 477)
- `GET /.well-known/signing-keys` (handleGetSigningKeys, line 496)

These are tested in `signing-key.test.js` and `verify-integration.test.js`. Issue #33 explicitly says "Existing retrieval GET endpoints (already using `*`) are unaffected." CORS tests should include a regression test confirming these remain `*` regardless of the configured allowlist.

#### 4. HSTS test update strategy

Current assertions in `security-headers.test.js`:

- `expectSecurityHeaders()` checks `toContain('max-age=')` and `toContain('includeSubDomains')` -- these pass for both old and new values.
- "HSTS max-age is at least 31536000 (one year)" -- this also passes for 63072000. Good.

New assertions needed:
- **Exact value match**: `expect(hsts).toBe('max-age=63072000; includeSubDomains; preload')` -- this ensures the `preload` directive is present and the exact value matches the preload requirement.
- **Preload directive present**: A separate assertion `expect(hsts).toContain('preload')` in `expectSecurityHeaders()` to catch any future regression.

The max-age numeric check should be updated to `toBeGreaterThanOrEqual(63072000)` to codify the preload minimum.

#### 5. X-RateLimit-Limit test strategy

Issue #35 says "Header value sourced from config (not hardcoded)". The rate limiter config is in `wrangler.toml`:

- `CAPTURE_RATE_LIMITER`: `limit = 10, period = 60` (used by `POST /v1/captures` and `GET /v1/captures`)
- `VERIFY_RATE_LIMITER`: `limit = 60, period = 60` (used by `GET /v1/verify/{id}`, `GET /.well-known/signing-key`, `GET /.well-known/signing-keys`)
- `GLOBAL_CAPTURE_LIMITER`: `limit = 200, period = 60` (used by `POST /v1/captures` and `GET /v1/captures`)

The `X-RateLimit-Limit` header should reflect the per-IP limit that the client can control, not the global capacity limit. So:
- Capture endpoints: `X-RateLimit-Limit: 10`
- Verify/signing-key endpoints: `X-RateLimit-Limit: 60`

**Test location**: These assertions naturally fit as additional checks in the existing test files for each endpoint group. Add `X-RateLimit-Limit` header assertions to:

- `test/capture-integration.test.js` -- for `POST /v1/captures` 202 response
- `test/list-captures.test.js` -- for `GET /v1/captures` 200 response
- `test/verify-integration.test.js` -- for `GET /v1/verify/{id}` 200 response
- `test/signing-key.test.js` -- for `GET /.well-known/signing-key` and `GET /.well-known/signing-keys`

**No `X-RateLimit-Remaining` or `X-RateLimit-Reset`**: Issue explicitly forbids these. Add negative assertions: `expect(res.headers.get('X-RateLimit-Remaining')).toBeNull()` and `expect(res.headers.get('X-RateLimit-Reset')).toBeNull()` on at least one endpoint to guard against future overreach.

---

### Proposed Tasks

#### Task 1: Create `test/cors.test.js` with all CORS test cases

**Tests to write** (each is a separate `it()` block):

```
describe('OPTIONS /v1/captures -- CORS preflight')
  - allowed origin receives Access-Control-Allow-Origin matching the request Origin
  - allowed origin receives Access-Control-Allow-Methods: POST
  - allowed origin receives Access-Control-Allow-Headers including Authorization and Content-Type
  - allowed origin receives Access-Control-Max-Age for preflight caching
  - preflight returns 204 with empty body
  - disallowed origin does NOT receive Access-Control-Allow-Origin
  - missing Origin header does NOT receive Access-Control-Allow-Origin
  - preflight response includes security headers (Referrer-Policy, X-Content-Type-Options, HSTS)

describe('POST /v1/captures -- CORS response headers')
  - allowed origin receives Access-Control-Allow-Origin on 202 response
  - disallowed origin does NOT receive Access-Control-Allow-Origin on 202 response
  - allowed origin receives Access-Control-Allow-Origin on error responses (401, 400)

describe('CORS -- read-only endpoints remain Access-Control-Allow-Origin: *')
  - GET /v1/captures/{id} still returns Access-Control-Allow-Origin: *
  - GET /.well-known/signing-key still returns Access-Control-Allow-Origin: *
  - GET /v1/verify/{id} still returns Access-Control-Allow-Origin: * (optional, already tested)

describe('CORS -- empty/missing allowlist')
  - when CORS_ALLOWED_ORIGINS is not set, no Access-Control-Allow-Origin on capture POST
```

**Env var injection**: Add `CORS_ALLOWED_ORIGINS: 'https://allowed.example.com,https://other-allowed.example.com'` to `vitest.config.js` miniflare bindings.

For the "empty/missing allowlist" test, the test can verify behavior by sending an Origin that matches the configured allowlist -- the positive test proves the mechanism works, and the disallowed-origin test proves the negative case. Testing a truly empty allowlist would require a separate miniflare config, which is not practical. Instead, the "disallowed origin" test covers the equivalent behavior.

**Estimated**: ~15 test cases, ~120 lines.

#### Task 2: Update HSTS assertions in `test/security-headers.test.js`

1. In `expectSecurityHeaders()`: add `expect(hsts).toContain('preload')`.
2. In "HSTS max-age is at least 31536000": change to exact value check `expect(hsts).toBe('max-age=63072000; includeSubDomains; preload')`.
3. Update the max-age numeric assertion to `toBeGreaterThanOrEqual(63072000)`.

Also update the HSTS assertion in `test/signing-key.test.js` line 64 if it tests `includeSubDomains` without `preload` -- it currently does `toContain('max-age=')` and `toContain('includeSubDomains')` which will pass, but should also verify `toContain('preload')` for completeness.

**Estimated**: ~10 lines changed across 2 files.

#### Task 3: Add `X-RateLimit-Limit` assertions across endpoint test files

Add a new describe block or individual test in each relevant file:

1. **`test/capture-integration.test.js`**: In the "POST /v1/captures -- happy path" describe, add:
   - `it('returns X-RateLimit-Limit header', async () => { ... expect 10 ... })`
   - `it('does NOT return X-RateLimit-Remaining or X-RateLimit-Reset', ...)`

2. **`test/list-captures.test.js`**: In "GET /v1/captures -- headers", add:
   - `it('returns X-RateLimit-Limit header', async () => { ... expect 10 ... })`

3. **`test/verify-integration.test.js`**: In "GET /v1/verify/{id} -- headers", add:
   - `it('returns X-RateLimit-Limit header', ...)`  -- expect 60

4. **`test/signing-key.test.js`**: In both signing-key and signing-keys headers describes, add:
   - `it('returns X-RateLimit-Limit header', ...)` -- expect 60

**Estimated**: ~30 lines added across 4 files.

#### Task 4: Update `vitest.config.js`

Add `CORS_ALLOWED_ORIGINS` to the miniflare bindings. Single line addition.

---

### Risks and Concerns

#### Risk 1: OPTIONS routing -- the route table doesn't match OPTIONS today

The current route table in `src/index.js` only has entries for `GET` and `POST` methods. An `OPTIONS /v1/captures` request today falls through to the catch-all 404. The implementation needs to add OPTIONS handling to the route table or add a pre-routing CORS check. This is an implementation concern, but it affects test expectations: the CORS test must verify that OPTIONS actually returns 204 (not 404 with CORS headers bolted on).

**Mitigation**: The CORS test file should explicitly test that `OPTIONS /v1/captures` returns 204, not 404. If the implementation adds the OPTIONS handler as a route table entry, the test confirms it. If it's a pre-route middleware check, the test still confirms correct behavior.

#### Risk 2: `CORS_ALLOWED_ORIGINS` env var format

The test plan assumes a comma-separated string (e.g., `'https://a.com,https://b.com'`). The implementation must agree on this format. If JSON array is preferred (e.g., `'["https://a.com"]'`), the test must parse accordingly. Comma-separated is simpler and matches Cloudflare Workers env var conventions (plain strings).

**Recommendation**: Use comma-separated. Document the format in the env var name or a comment.

#### Risk 3: Rate limiter bindings in test environment

The `wrangler.toml` defines rate limiters as `[[unsafe.bindings]]` with `type = "ratelimit"`. In the vitest miniflare environment, these bindings exist and are functional (the capture-integration tests already rely on them). However, the `simple.limit` value is only in `wrangler.toml`, not directly accessible as a binding property. The `X-RateLimit-Limit` header value either needs to:

a) Be read from a config binding (another env var like `RATE_LIMIT_CAPTURE=10`)
b) Be hardcoded in the handler but documented as matching the rate limiter config
c) Be read from the rate limiter binding's metadata (not supported by the Cloudflare API)

Option (a) is cleanest -- add `RATE_LIMIT_CAPTURE` and `RATE_LIMIT_VERIFY` env vars in `wrangler.toml [vars]` and in `vitest.config.js` miniflare bindings. The tests then assert the header value matches what's injected. Option (b) creates a maintenance risk (config drift between `wrangler.toml` rate limiter definition and the hardcoded value).

**Recommendation**: Option (a). Add vars to `wrangler.toml [vars]` and mirror in test config.

#### Risk 4: CORS on POST error responses (401, 400, etc.)

A browser making a CORS request to `POST /v1/captures` with a bad API key will get a 401 response. If the 401 response lacks `Access-Control-Allow-Origin`, the browser's CORS enforcement hides the response body from JavaScript -- the client sees an opaque network error, not the RFC 9457 error details. The implementation should include CORS headers on error responses for the capture POST endpoint when the Origin is in the allowlist. Tests should verify this.

#### Risk 5: `Access-Control-Allow-Origin: *` vs. configurable allowlist interaction

The capture POST endpoint needs a configurable allowlist (not `*`), but the read-only endpoints use `*`. If the implementation adds CORS headers in a middleware/wrapper that applies to all responses, it must not downgrade `*` to a specific origin on the read-only endpoints. The regression tests in Task 1 (CORS -- read-only endpoints remain `*`) catch this.

---

### Additional Agents Needed

None for test implementation. The implementation agent will need to:

1. Add the OPTIONS route handler in `src/index.js`
2. Add CORS header logic to `POST /v1/captures` responses
3. Update the HSTS header value from `max-age=31536000; includeSubDomains` to `max-age=63072000; includeSubDomains; preload`
4. Add `X-RateLimit-Limit` header to all rate-limited endpoint responses
5. Add env var config for `CORS_ALLOWED_ORIGINS` (and optionally `RATE_LIMIT_CAPTURE`/`RATE_LIMIT_VERIFY`)

The test agent (or implementation agent) should run the full test suite after implementation to verify no regressions. The existing 20 test files provide good regression coverage.
