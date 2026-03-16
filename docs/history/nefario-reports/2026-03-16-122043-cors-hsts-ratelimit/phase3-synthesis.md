## Delegation Plan

**Team name**: cors-hsts-ratelimit
**Description**: Implement CORS for capture POST endpoint (#33), HSTS preload (#34), and X-RateLimit-Limit header (#35) in a single PR.

---

### Task 1: Core implementation -- CORS, HSTS, rate limit headers
- **Agent**: edge-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |
    You are implementing three small features in a Cloudflare Worker: CORS for the capture POST endpoint, HSTS preload, and X-RateLimit-Limit response headers. All changes are in the existing `src/index.js` plus one new file `src/rate-limits.js`.

    ## Codebase Context

    - Worker entry: `src/index.js` (531 lines). Routes table at line 16. Main `fetch()` handler starts line 29. Global security headers set at lines 52-57 after all handlers return.
    - `src/responses.js` has `problemResponse()` and `jsonResponse()` helpers.
    - `wrangler.toml` has rate limiter bindings: `CAPTURE_RATE_LIMITER` (limit=10, period=60), `VERIFY_RATE_LIMITER` (limit=60, period=60), `GLOBAL_CAPTURE_LIMITER` (limit=200, period=60).
    - Existing `Access-Control-Allow-Origin: *` is set inline on 5 read-only GET handlers. These must NOT be changed.
    - `vitest.config.js` has miniflare bindings for test env vars.
    - Project follows the Helix Manifesto: YAGNI, KISS, lean code, <300ms latency.

    ## R3: CORS for capture POST endpoint (#33)

    **New env var**: `CORS_ORIGINS` -- comma-separated string of allowed origins in `wrangler.toml` `[vars]`. Parse at request time: `env.CORS_ORIGINS ? env.CORS_ORIGINS.split(',').map(s => s.trim()).filter(Boolean) : []`.

    **Implementation details**:

    1. Add CORS_ORIGINS to `wrangler.toml` as a commented-out example in both `[vars]` and `[env.staging.vars]`:
       ```toml
       # Comma-separated origins allowed for CORS preflight (browser clients).
       # Omit or leave empty to disable CORS. No wildcards.
       # CORS_ORIGINS = "https://my-extension.example.com"
       ```

    2. Add CORS_ORIGINS to `vitest.config.js` miniflare bindings:
       ```js
       CORS_ORIGINS: 'https://allowed.example.com,https://other-allowed.example.com',
       ```

    3. Add a CORS helper function in `src/index.js` (or at the top of the file, before routes):
       ```js
       function getCorsHeaders(request, env) {
         const origin = request.headers.get('Origin');
         if (!origin) return null;
         const allowed = env.CORS_ORIGINS
           ? env.CORS_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
           : [];
         if (allowed.includes(origin)) return origin;
         return null;
       }
       ```
       This uses exact string match against the parsed array. No regex, no substring, no wildcards.

    4. Add an OPTIONS preflight handler BEFORE the route matching loop in `fetch()`:
       ```js
       // CORS preflight for POST /v1/captures
       if (request.method === 'OPTIONS' && pathname === '/v1/captures') {
         const allowedOrigin = getCorsHeaders(request, env);
         const headers = { 'Access-Control-Max-Age': '7200' };
         if (allowedOrigin) {
           headers['Access-Control-Allow-Origin'] = allowedOrigin;
           headers['Access-Control-Allow-Methods'] = 'POST';
           headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
           headers['Vary'] = 'Origin';
         }
         // Cache-Control: no-store prevents CDN from caching preflight responses
         headers['Cache-Control'] = 'no-store';
         response = new Response(null, { status: 204, headers });
         // Fall through to global security headers below
       }
       ```
       Note: the OPTIONS response still gets global security headers (HSTS, X-Content-Type-Options, etc.) because it falls through to the global header block at lines 52-57.

    5. After the route matching loop (before the global security headers), add CORS headers to POST /v1/captures responses:
       ```js
       // CORS response headers for POST /v1/captures
       if (request.method === 'POST' && pathname === '/v1/captures') {
         const allowedOrigin = getCorsHeaders(request, env);
         if (allowedOrigin) {
           response.headers.set('Access-Control-Allow-Origin', allowedOrigin);
           response.headers.set('Vary', 'Origin');
         }
       }
       ```
       IMPORTANT: This must apply to ALL responses from the POST handler -- 202, 401, 400, 415, 429, 503. This is why it goes in the global response pipeline, not inside the handler. When a browser sends a CORS request that gets 401, the browser hides the 401 body if CORS headers are missing -- the developer sees a confusing CORS error instead of the real auth error.

    6. The `Vary: Origin` header is MANDATORY on any response where `Access-Control-Allow-Origin` varies by request origin. Without it, CDN caches could serve the wrong CORS headers to a different origin (cache poisoning).

    **Security constraints**:
    - Empty/missing CORS_ORIGINS = no CORS headers on POST responses (secure default, fail closed)
    - Never fall back to `*` -- the endpoint requires Authorization
    - Exact string match only -- no wildcard patterns, no subdomain matching
    - OPTIONS must NOT trigger rate limiting or auth checks
    - Existing `Access-Control-Allow-Origin: *` on GET endpoints must remain unchanged

    ## R4: HSTS preload (#34)

    **One-line change** in `src/index.js` line 55:

    Change:
    ```js
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    ```
    To:
    ```js
    response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
    ```

    That is the entire change. `max-age=63072000` (2 years) is the minimum required by hstspreload.org. The `preload` directive signals eligibility for browser preload lists.

    ## R5: X-RateLimit-Limit response header (#35)

    1. **Create `src/rate-limits.js`**:
       ```js
       // Rate limit ceilings for X-RateLimit-Limit response headers.
       // These MUST match the `simple.limit` values in wrangler.toml rate limiter bindings.
       // The rate limiter binding enforces the limit; this constant reports it to clients.
       export const RATE_LIMITS = {
         capture: { limit: 10, period: 60 },
         verify:  { limit: 60, period: 60 },
       };
       ```
       Note: `global` is intentionally excluded -- exposing global capacity aids DoS attackers.

    2. **Add X-RateLimit-Limit header to rate-limited responses**. The cleanest approach: add the header in the fetch() function after routing, keyed off the matched route. Define a route-to-limiter mapping:

       After the routing loop, before global security headers:
       ```js
       // X-RateLimit-Limit: report per-IP ceiling on rate-limited endpoints
       const rateLimitGroup = getRateLimitGroup(request.method, pathname);
       if (rateLimitGroup && response.status !== 503) {
         response.headers.set('X-RateLimit-Limit', String(RATE_LIMITS[rateLimitGroup].limit));
       }
       ```

       The `getRateLimitGroup()` function maps method+path to rate limit group:
       ```js
       function getRateLimitGroup(method, pathname) {
         if (pathname === '/v1/captures') return 'capture'; // POST and GET
         if (pathname.match(/^\/v1\/verify\//) || pathname.match(/^\/\.well-known\/signing-key/)) return 'verify';
         return null;
       }
       ```

    3. **Do NOT add X-RateLimit-Limit on 503 responses** from the global limiter. The 503 "Service is at capacity" is a different failure mode -- the per-IP ceiling is irrelevant and could confuse clients.

    4. **Do NOT add X-RateLimit-Remaining or X-RateLimit-Reset** -- these leak rate limiter state that aids timing-based evasion.

    5. The header appears on ALL responses from rate-limited handlers: 200, 202, 400, 401, 415, 429 -- any response from a handler behind a rate limiter. This is for discoverability.

    ## Files to modify

    - `src/index.js` -- CORS preflight handler, CORS response headers, HSTS change, rate limit header injection, import rate-limits
    - `src/rate-limits.js` -- NEW FILE: rate limit config constants
    - `wrangler.toml` -- add commented CORS_ORIGINS to [vars] and [env.staging.vars]
    - `vitest.config.js` -- add CORS_ORIGINS to miniflare bindings

    ## What NOT to do

    - Do NOT modify any existing GET handler CORS headers (`Access-Control-Allow-Origin: *`)
    - Do NOT add X-RateLimit-Remaining or X-RateLimit-Reset headers
    - Do NOT expose the global capacity limiter ceiling in headers
    - Do NOT add env vars for rate limit values (YAGNI -- the JS config object is sufficient)
    - Do NOT add a global OPTIONS catch-all -- only handle OPTIONS on /v1/captures
    - Do NOT use Access-Control-Allow-Origin: * on the POST endpoint
    - Do NOT use Access-Control-Max-Age: 86400 -- use 7200 (Chrome caps at 7200, higher values are wasted)

- **Deliverables**: Modified `src/index.js` with CORS, HSTS, and rate limit header logic; new `src/rate-limits.js`; updated `wrangler.toml` and `vitest.config.js`
- **Success criteria**: Worker handles OPTIONS preflight for /v1/captures, echoes allowed origins on POST responses, HSTS header has preload directive and 2-year max-age, X-RateLimit-Limit appears on all rate-limited endpoint responses

---

### Task 2: Tests -- CORS, HSTS update, rate limit headers
- **Agent**: test-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |
    You are writing tests for three features just implemented in a Cloudflare Worker: CORS for the capture POST endpoint, HSTS preload, and X-RateLimit-Limit response headers.

    ## Codebase Context

    - Worker entry: `src/index.js`. Routes table at line 16. Main `fetch()` at line 29.
    - Test framework: vitest with `@cloudflare/vitest-pool-workers`. Tests use `import { SELF } from 'cloudflare:test'` and call `SELF.fetch()`.
    - Test convention: one file per concern. Existing files: `auth.test.js`, `security-headers.test.js`, `capture-integration.test.js`, `list-captures.test.js`, `verify-integration.test.js`, `signing-key.test.js`, etc.
    - `vitest.config.js` has miniflare bindings including `CORS_ORIGINS: 'https://allowed.example.com,https://other-allowed.example.com'` and test API key `CAPTURE_API_KEY: 'test-api-key-for-vitest'`.
    - `isolatedStorage: false` -- do NOT use per-test miniflare instances. All test isolation is via explicit cleanup in `beforeEach`.
    - Rate limit config: `src/rate-limits.js` exports `RATE_LIMITS` with `capture: { limit: 10, period: 60 }` and `verify: { limit: 60, period: 60 }`.

    ## Task A: Create `test/cors.test.js`

    Create a new file `test/cors.test.js` with these test cases:

    ```
    describe('OPTIONS /v1/captures -- CORS preflight')
      it('returns 204 with empty body')
      it('allowed origin receives Access-Control-Allow-Origin matching the request Origin')
      it('allowed origin receives Access-Control-Allow-Methods: POST')
      it('allowed origin receives Access-Control-Allow-Headers including Authorization and Content-Type')
      it('allowed origin receives Access-Control-Max-Age: 7200')
      it('allowed origin receives Vary: Origin')
      it('disallowed origin does NOT receive Access-Control-Allow-Origin')
      it('missing Origin header does NOT receive Access-Control-Allow-Origin')
      it('preflight response includes security headers (HSTS, X-Content-Type-Options, X-Frame-Options)')

    describe('POST /v1/captures -- CORS response headers')
      it('allowed origin receives Access-Control-Allow-Origin on 202 response')
      it('allowed origin receives Vary: Origin on 202 response')
      it('disallowed origin does NOT receive Access-Control-Allow-Origin')
      it('allowed origin receives Access-Control-Allow-Origin on 401 error response')

    describe('CORS -- read-only endpoints remain unaffected')
      it('GET /.well-known/signing-key returns Access-Control-Allow-Origin: *')
      it('GET /v1/captures/{id} returns Access-Control-Allow-Origin: *')
    ```

    **Important implementation details**:
    - Send `Origin: https://allowed.example.com` for allowed-origin tests
    - Send `Origin: https://evil.example.com` for disallowed-origin tests
    - For the POST tests, include `Authorization: Bearer test-api-key-for-vitest` and `Content-Type: application/json` where needed for the request to reach the handler
    - For the 401 test, omit the Authorization header but include `Origin: https://allowed.example.com` -- the 401 response should still have CORS headers
    - For the GET regression tests, confirm `Access-Control-Allow-Origin` is exactly `*` (not the specific origin from the allowlist)
    - Use `Cache-Control: no-store` assertion on preflight response to verify CDN caching prevention

    ## Task B: Update HSTS assertions in `test/security-headers.test.js`

    1. In `expectSecurityHeaders()` helper (line 5-16): add `expect(hsts).toContain('preload')` after the existing `includeSubDomains` assertion.

    2. In the "HSTS max-age is at least 31536000" test (line 55-61): change the assertion to check the exact value:
       ```js
       it('HSTS meets preload requirements (max-age >= 63072000, preload directive present)', async () => {
         const res = await SELF.fetch('https://worker.test/health');
         const hsts = res.headers.get('Strict-Transport-Security');
         const match = hsts.match(/max-age=(\d+)/);
         expect(match).not.toBeNull();
         expect(Number(match[1])).toBeGreaterThanOrEqual(63072000);
         expect(hsts).toContain('preload');
       });
       ```

    ## Task C: Add X-RateLimit-Limit assertions to existing test files

    Add header assertions to the existing test files for each rate-limited endpoint group:

    1. **`test/capture-integration.test.js`**: Add within the happy-path describe block:
       ```js
       it('returns X-RateLimit-Limit header with capture ceiling', async () => {
         // ... make a valid POST /v1/captures request ...
         expect(res.headers.get('X-RateLimit-Limit')).toBe('10');
       });
       it('does NOT return X-RateLimit-Remaining or X-RateLimit-Reset', async () => {
         // ... reuse the same response ...
         expect(res.headers.get('X-RateLimit-Remaining')).toBeNull();
         expect(res.headers.get('X-RateLimit-Reset')).toBeNull();
       });
       ```

    2. **`test/list-captures.test.js`**: Add:
       ```js
       it('returns X-RateLimit-Limit header with capture ceiling', async () => {
         // ... make a GET /v1/captures request with auth ...
         expect(res.headers.get('X-RateLimit-Limit')).toBe('10');
       });
       ```

    3. **`test/verify-integration.test.js`**: Add:
       ```js
       it('returns X-RateLimit-Limit header with verify ceiling', async () => {
         // ... make a GET /v1/verify/{id} request ...
         expect(res.headers.get('X-RateLimit-Limit')).toBe('60');
       });
       ```

    4. **`test/signing-key.test.js`**: Add for both endpoints:
       ```js
       it('returns X-RateLimit-Limit header with verify ceiling', async () => {
         const res = await SELF.fetch('https://worker.test/.well-known/signing-key');
         expect(res.headers.get('X-RateLimit-Limit')).toBe('60');
       });
       it('returns X-RateLimit-Limit on /.well-known/signing-keys', async () => {
         const res = await SELF.fetch('https://worker.test/.well-known/signing-keys');
         expect(res.headers.get('X-RateLimit-Limit')).toBe('60');
       });
       ```

    5. **`test/health.test.js`** (negative test): Add:
       ```js
       it('does NOT return X-RateLimit-Limit on health endpoint', async () => {
         const res = await SELF.fetch('https://worker.test/health');
         expect(res.headers.get('X-RateLimit-Limit')).toBeNull();
       });
       ```

    ## Files to create/modify

    - `test/cors.test.js` -- NEW FILE (~15 test cases, ~150 lines)
    - `test/security-headers.test.js` -- update HSTS assertions
    - `test/capture-integration.test.js` -- add X-RateLimit-Limit assertions
    - `test/list-captures.test.js` -- add X-RateLimit-Limit assertion
    - `test/verify-integration.test.js` -- add X-RateLimit-Limit assertion
    - `test/signing-key.test.js` -- add X-RateLimit-Limit assertions
    - `test/health.test.js` -- add negative X-RateLimit-Limit assertion

    ## What NOT to do

    - Do NOT create a separate miniflare config for "empty allowlist" testing -- the disallowed-origin test covers the equivalent behavior
    - Do NOT use `isolatedStorage: true`
    - Do NOT test X-RateLimit-Remaining or X-RateLimit-Reset (they should not exist)
    - Do NOT modify any implementation files -- this task is tests only
    - Do NOT change existing passing tests unless specifically updating the HSTS assertions

- **Deliverables**: New `test/cors.test.js` file; updated HSTS assertions in `test/security-headers.test.js`; X-RateLimit-Limit assertions across 5 existing test files; negative assertion in `test/health.test.js`
- **Success criteria**: All new tests pass when run with `npx vitest run`; existing tests continue to pass; CORS tests cover allowed origin, disallowed origin, missing origin, preflight shape, error response CORS, and GET endpoint regression

---

### Task 3: OpenAPI spec updates
- **Agent**: software-docs-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |
    You are updating the OpenAPI specification (`openapi.yaml`) to reflect three features just implemented: CORS for the capture POST endpoint, HSTS preload, and X-RateLimit-Limit response headers.

    ## Codebase Context

    - `openapi.yaml` is OpenAPI 3.1.0, currently at version 0.2.0.
    - The spec uses reusable header components under `components/headers/` (ReferrerPolicy, XContentTypeOptions, XFrameOptions, StrictTransportSecurity, RetryAfter, TermsLink).
    - Every response references these headers via `$ref`.
    - Reusable response components exist under `components/responses/` (Problem400, Problem401, Problem404, Problem415, Problem422, Problem429, Problem503).
    - `Access-Control-Allow-Origin: *` is already documented inline on GET responses (getCapture 200, getCaptureArtifact 200, verifyCapture 200, getSigningKey 200, getSigningKeys 200).
    - Rate-limited endpoints: POST /v1/captures, GET /v1/captures, GET /v1/verify/{captureId}, GET /.well-known/signing-key, GET /.well-known/signing-keys.

    ## Changes to make

    ### 1. Bump version to 0.3.0
    Change `info.version` from `0.2.0` to `0.3.0`.

    ### 2. Update StrictTransportSecurity header component
    Update the existing component at `components/headers/StrictTransportSecurity`:
    ```yaml
    StrictTransportSecurity:
      description: Enforces HTTPS connections with HSTS preload eligibility.
      schema:
        type: string
        pattern: '^max-age=\d+'
        examples:
          - 'max-age=63072000; includeSubDomains; preload'
    ```
    Keep the pattern as a loose prefix match (it is documentation, not enforcement). Add the example to show the full value.

    ### 3. Add XRateLimitLimit header component
    Add a new reusable header component at `components/headers/XRateLimitLimit`:
    ```yaml
    XRateLimitLimit:
      description: Maximum number of requests allowed per IP in the current rate-limit window.
      schema:
        type: integer
        minimum: 1
        examples:
          - 10
    ```

    ### 4. Add X-RateLimit-Limit to Problem429 response
    Add the header reference to `components/responses/Problem429`:
    ```yaml
    X-RateLimit-Limit:
      $ref: '#/components/headers/XRateLimitLimit'
    ```

    ### 5. Add X-RateLimit-Limit to success responses of rate-limited endpoints
    Add the header reference to each of these operation responses:
    - `POST /v1/captures` -- 202 response
    - `GET /v1/captures` -- 200 response
    - `GET /v1/verify/{captureId}` -- 200 response
    - `GET /.well-known/signing-key` -- 200 response
    - `GET /.well-known/signing-keys` -- 200 response

    ### 6. Add CORS note to POST /v1/captures description
    Append to the existing operation description:
    ```
    CORS: This endpoint supports cross-origin requests from allowed origins.
    Preflight (OPTIONS) is handled automatically. Configure allowed origins
    via the CORS_ORIGINS environment variable.
    ```

    ### 7. Add Access-Control-Allow-Origin to POST /v1/captures 202 response headers
    Add inline (not as $ref, since the value differs from the `*` used on GET endpoints):
    ```yaml
    Access-Control-Allow-Origin:
      description: Echoes the requesting origin when it matches the configured allowlist.
      schema:
        type: string
    Vary:
      description: Indicates the response varies by Origin header for CORS.
      schema:
        type: string
        enum: [Origin]
    ```

    ### 8. Do NOT add an OPTIONS operation
    Skip documenting the OPTIONS preflight as a separate operation. It is a browser mechanism, not an application-level API contract. The description note on the POST operation is sufficient.

    ## Files to modify
    - `openapi.yaml` -- approximately 25-30 lines of changes

    ## What NOT to do
    - Do NOT add `X-RateLimit-Remaining` or `X-RateLimit-Reset` headers
    - Do NOT change existing `Access-Control-Allow-Origin: *` on GET endpoints
    - Do NOT add an OPTIONS operation
    - Do NOT modify the pattern regex for StrictTransportSecurity (keep the loose prefix match)
    - Do NOT hardcode origin values in the spec (origins are deployment-specific)

- **Deliverables**: Updated `openapi.yaml` with version bump, HSTS component update, new X-RateLimit-Limit component and references, CORS documentation on POST /v1/captures
- **Success criteria**: Spec passes OpenAPI validation (`npx @redocly/cli lint openapi.yaml` or equivalent); all rate-limited endpoints reference X-RateLimit-Limit; HSTS component reflects preload; CORS behavior is documented on POST /v1/captures

---

### Task 4: Evolution log entry
- **Agent**: software-docs-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1, Task 2, Task 3
- **Approval gate**: no
- **Prompt**: |
    You are creating the evolution log entry for phase 0019 -- CORS, HSTS preload, and X-RateLimit-Limit implementation. This documents the decisions, rationale, and outcome of the development phase.

    ## Codebase Context

    - Evolution log directory: `docs/evolution/`
    - Convention: `NNNN-short-name/` with `prompt.md`, `decisions.md`, `outcome.md`
    - Latest entry: `0018-staging-and-tos/`
    - Backlog: `docs/backlog.md`
    - Evolution index: `docs/evolution/README.md`

    ## Create directory and files

    Create `docs/evolution/0019-cors-hsts-ratelimit/` with:

    ### prompt.md
    Document the task that initiated this phase:
    - Implementing three GitHub issues in one PR: #33 (CORS for capture POST), #34 (HSTS preload), #35 (X-RateLimit-Limit)
    - These are R3, R4, R5 from the security hardening roadmap in the backlog
    - Combined because they are small, well-scoped, header-level changes with no cross-dependencies

    ### decisions.md
    Document the key decisions made:

    1. **CORS env var name**: `CORS_ORIGINS` chosen over `CORS_ALLOWED_ORIGINS`. Rationale: matches project's terse naming convention (CAPTURE_API_KEY, SIGNING_KEY, not CAPTURE_ALLOWED_API_KEY). "CORS" already implies an allowlist.

    2. **CORS header application scope**: OPTIONS handler is path-specific (/v1/captures only), but CORS response headers (Access-Control-Allow-Origin, Vary: Origin) are applied in the global response pipeline for POST /v1/captures. This ensures error responses (401, 400, 429) also get CORS headers, preventing browsers from hiding the real error behind a CORS error.

    3. **Rate limit config pattern**: Single config object in `src/rate-limits.js` rather than duplicating values in `[vars]` env vars. Creates one sync point with wrangler.toml rather than four (prod vars, staging vars, prod binding, staging binding). edge-minion's recommendation over ux-strategy-minion's hardcoding suggestion.

    4. **Access-Control-Max-Age: 7200** (not 86400). Chrome caps at 7200 anyway. Using the effective maximum avoids a misleading header value. Cache-Control: no-store on OPTIONS prevents CDN-layer caching (complementary to browser-layer caching via Max-Age).

    5. **No global capacity exposure**: X-RateLimit-Limit reports per-IP ceiling only. Global capacity (200/min) is intentionally hidden -- exposing it would tell attackers exactly how many requests saturate the service. 503 responses from the global limiter do NOT carry X-RateLimit-Limit.

    6. **Existing GET wildcard CORS unchanged**: The `Access-Control-Allow-Origin: *` on read-only GET endpoints (verify, signing-key, artifacts) is correct and safe. No changes needed -- these are public, unauthenticated endpoints. The new restrictive POST CORS coexists without conflict.

    Rejected alternatives:
    - JSON env var format for CORS origins (rejected: requires escaping in TOML, error-prone with wrangler secret)
    - Wildcard/subdomain matching in CORS (rejected: security footgun, exact match is safer)
    - Adding X-RateLimit-Remaining/Reset (rejected: leaks rate limiter state, aids timing-based evasion)
    - Separate env vars for rate limit display values (rejected: YAGNI, creates 4 sync points instead of 1)

    ### outcome.md
    Document what was produced:
    - Files created: `src/rate-limits.js`, `test/cors.test.js`
    - Files modified: `src/index.js`, `wrangler.toml`, `vitest.config.js`, `openapi.yaml`, `test/security-headers.test.js`, `test/capture-integration.test.js`, `test/list-captures.test.js`, `test/verify-integration.test.js`, `test/signing-key.test.js`, `test/health.test.js`
    - OpenAPI spec bumped to 0.3.0
    - ~15 new CORS test cases, HSTS assertion updates, X-RateLimit-Limit assertions across 5 existing test files
    - Post-merge action: submit domain to hstspreload.org after verifying the header is served correctly

    **Backlog changes**: Read `docs/backlog.md` and mark R3, R4, R5 as done. Note any follow-up items discovered during implementation (e.g., documenting CORS in README).

    ## Update the evolution index

    Add the entry to `docs/evolution/README.md` following the existing pattern.

    ## What NOT to do
    - Do NOT write outcome.md as a summary of the plan -- write it as a summary of what was actually produced
    - Do NOT backfill decisions that were not actually made (stick to the decisions listed above)
    - Do NOT skip the backlog update

- **Deliverables**: `docs/evolution/0019-cors-hsts-ratelimit/` with `prompt.md`, `decisions.md`, `outcome.md`; updated `docs/evolution/README.md`; updated `docs/backlog.md`
- **Success criteria**: Evolution log entry follows the established pattern; backlog reflects completed items

---

### Cross-Cutting Coverage

- **Testing**: Task 2 covers comprehensive CORS, HSTS, and rate limit header tests. Phase 6 (post-execution) will run the full suite.
- **Security**: security-minion's recommendations are embedded directly in Task 1's prompt (exact origin matching, Vary: Origin, fail-closed empty allowlist, no global capacity exposure, no remaining/reset headers). Phase 3.5 review will cover any gaps.
- **Usability -- Strategy**: ux-strategy-minion's recommendations incorporated: terse env var name (CORS_ORIGINS), commented example in wrangler.toml, error responses get CORS headers. README documentation of CORS deferred to Phase 8 (post-execution docs).
- **Usability -- Design**: Not applicable -- no user-facing UI changes. All changes are HTTP headers.
- **Documentation**: Task 3 covers OpenAPI spec updates. Task 4 covers evolution log. README CORS documentation will be handled by Phase 8 (post-execution docs) if the documentation checklist flags it.
- **Observability**: Not applicable -- no new runtime components, no new services. These are response header additions to an existing worker. Existing Coralogix logging already covers rate limit events.

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - None selected. All three changes are header-level modifications to an existing worker with no UI, no new runtime components, no web-facing HTML, and no user-facing documentation changes in the execution tasks.
- **Not selected**: ux-design-minion, accessibility-minion, sitespeed-minion, observability-minion, user-docs-minion

### Conflict Resolutions

1. **CORS header application scope** (security-minion vs. ux-strategy-minion): security-minion recommended path-specific OPTIONS handler only; ux-strategy-minion recommended CORS headers in the global response pipeline for error response coverage. Resolution: BOTH -- OPTIONS handler is path-specific (only /v1/captures), but Access-Control-Allow-Origin is applied in the global pipeline for POST /v1/captures responses so error responses (401, 400, 429) also get CORS headers. These are complementary, not conflicting.

2. **Rate limit config pattern** (edge-minion vs. ux-strategy-minion): edge-minion recommended `src/rate-limits.js` config object; ux-strategy-minion recommended hardcoding in handlers. Resolution: edge-minion's approach wins -- single source of truth for display values, one sync point with wrangler.toml, importable by tests for assertion values.

3. **Access-Control-Max-Age** (security-minion 7200 vs. edge-minion 86400): Resolution: 7200. Chrome caps at 7200; using 86400 is misleading since it exceeds Chrome's maximum. 7200 is the practical ceiling and matches security-minion's recommendation.

4. **Env var name** (all specialists): Both security-minion and ux-strategy-minion favor `CORS_ORIGINS`. edge-minion used `CORS_ALLOWED_ORIGINS`. Resolution: `CORS_ORIGINS` per project naming convention (terse, no adjectives).

### Risks and Mitigations

1. **CDN cache poisoning without Vary: Origin** (HIGH) -- Mitigation: Vary: Origin is mandatory on every response where Access-Control-Allow-Origin varies by request. Enforced in implementation and tested.

2. **CORS origin substring matching vulnerability** (HIGH) -- Mitigation: exact string match against parsed array. Never use `.includes()` on the raw string. Implementation uses `allowed.includes(origin)` on the split array.

3. **Error responses without CORS headers** (MEDIUM) -- Mitigation: CORS headers applied in the global response pipeline, not inside individual handlers. Tests verify CORS headers on 401 responses.

4. **Rate limit constant drift from wrangler.toml** (LOW) -- Mitigation: code comment in `src/rate-limits.js` cross-references wrangler.toml values. Acceptable for a single-operator project.

5. **HSTS preload is permanent** (LOW, operational) -- Mitigation: conscious decision documented in the issue. Post-merge verification at hstspreload.org before submission.

### Execution Order

```
Batch 1 (parallel: none, sequential):
  Task 1: Core implementation (CORS, HSTS, rate limit headers)

Batch 2 (parallel after Task 1):
  Task 2: Tests
  Task 3: OpenAPI spec updates

Batch 3 (after all):
  Task 4: Evolution log entry
```

### Verification Steps

1. Run `npx vitest run` -- all tests pass (new + existing)
2. Verify OPTIONS /v1/captures returns 204 with correct CORS headers for allowed origin
3. Verify POST /v1/captures response includes Access-Control-Allow-Origin for allowed origin
4. Verify POST /v1/captures 401 response also includes CORS headers
5. Verify HSTS header contains `max-age=63072000; includeSubDomains; preload`
6. Verify X-RateLimit-Limit: 10 on capture endpoints, 60 on verify/signing-key endpoints
7. Verify X-RateLimit-Limit absent on health endpoint
8. Verify X-RateLimit-Limit absent on 503 global capacity responses
9. Verify existing GET endpoint CORS (`Access-Control-Allow-Origin: *`) unchanged
10. Validate OpenAPI spec: `npx @redocly/cli lint openapi.yaml` (if available) or manual review
