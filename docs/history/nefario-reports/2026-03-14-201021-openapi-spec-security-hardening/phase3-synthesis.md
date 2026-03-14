# Phase 3: Synthesis -- OpenAPI Spec and Security Hardening

## Delegation Plan

**Team name**: mvp-step-8-hardening
**Description**: Harden the WRL service for production: formal OpenAPI specification completion, security headers, backpressure handling, signing-key endpoint, and documentation.

---

### Conflict Resolutions

**1. Signing-key response format: raw base64 vs JSON envelope**

The issue says "base64-encoded raw bytes" but api-design-minion and api-spec-minion both recommend a JSON envelope `{ algorithm, publicKey }`. security-minion also recommends JSON (JWK-like). **Resolved: JSON envelope.** The entire API speaks JSON; `text/plain` would be the only exception. Two fields (algorithm + publicKey) are the minimum viable envelope. Forward-compatible with key versioning. Costs 20 bytes.

**2. Key versioning fields (keyId, createdAt) in signing-key response**

ux-strategy-minion wants `keyId` and `createdAt` included from day one ("retrofitting it later is a breaking change"). api-design-minion explicitly says do NOT add `keyId` now ("creates a contract that must be honored") and documents that the current shape is forward-compatible (new fields can be added without breaking). **Resolved: api-design-minion wins. No keyId or createdAt.** Reasoning: YAGNI is an explicit project principle. Adding `keyId` creates a contract obligation when key versioning does not exist. The response shape `{ algorithm, publicKey }` is additively extensible -- adding `keyId` later is not a breaking change, it is an additive field. This is a reversible decision.

**3. ux-strategy-minion wants to elevate key versioning to [must]**

ux-strategy-minion argues the signing-key endpoint creates an expectation that key rotation works gracefully, and without key versioning it does not. **Resolved: Keep as [should].** The rotation UX concern is real but the mitigation is documentation (warn users prominently), not premature feature work. The backlog item already captures the need. User-docs-minion's recommendation to document the limitation honestly is the right approach for MVP.

**4. Signing-key error response: 404 vs 503 when key not configured**

api-design-minion initially argued 404 (the resource genuinely does not exist), then reversed to 503 for consistency with `handleVerifyCapture`. **Resolved: 503.** Consistency with the verify endpoint matters more than semantic purity. An operator who deploys without SIGNING_KEY sees 503 from both signing-related endpoints.

**5. Cache-Control for signing-key endpoint: 1h vs 24h max-age**

edge-minion recommends `max-age=86400` (1 day) with 7-day SWR. api-design-minion recommends `max-age=3600` (1 hour) with 24-hour SWR. api-design-minion's reasoning is stronger: after rotation, a 24-hour convergence window is too long. An operator who rotates and signs new captures would have verifiers seeing the wrong key for a day. **Resolved: `public, max-age=3600, stale-while-revalidate=86400`** (api-design-minion's recommendation).

**6. signingKeyUrl in API responses**

ux-strategy-minion wants `signingKeyUrl` added to both verify and capture retrieval JSON responses. This would add a URL field pointing to `/.well-known/signing-key`. **Resolved: Do not add.** The `.well-known` path is a standard convention that technical users know. Adding a URL field to every response creates coupling between the signing-key endpoint and multiple response schemas. YAGNI -- the key endpoint is discoverable via its well-known path and will be in the OpenAPI spec. If users need to find it, they read the spec or know the convention.

**7. Verification page changes (public key link in crypto details)**

ux-strategy-minion wants a "Public key" row added to the verification page's cryptographic details section. **Resolved: Include, but scope carefully.** This is a low-cost change (a few lines in verify-page.js) that serves the technical verifier audience without impacting casual users (it is inside a collapsed `<details>` element). It naturally falls to the same task that implements the signing-key endpoint, since the URL must exist before linking to it.

**8. Content-negotiation integration test gap**

test-minion identified that `Accept: text/html` is not tested through the full HTTP path. **Resolved: Include as part of the test task.** Low-effort, high-value -- validates the routing in index.js. One test case added to an existing file.

---

### Task 1: Security Headers (Global)
- **Agent**: security-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |
    You are hardening the WRL Cloudflare Worker service by adding two global security headers.

    ## Context

    The WRL service is a Cloudflare Worker (`src/index.js`) that serves a JSON API and one HTML page. All responses pass through a global header block at lines 48-49 of `src/index.js` that currently sets:
    - `Referrer-Policy: no-referrer`
    - `X-Content-Type-Options: nosniff`

    The verify page (`src/verify-page.js`) additionally sets its own `X-Frame-Options: DENY` and `Content-Security-Policy` headers in the Response constructor at line 525-531.

    ## Task

    Add two global security headers to the response wrapper in `src/index.js`:

    1. **HSTS**: `Strict-Transport-Security: max-age=31536000; includeSubDomains`
       - Do NOT add `preload` -- it is a one-way door (removal from browser preload lists takes months). The domain is not finalized.
       - Workers are already HTTPS-only. This is defense-in-depth.

    2. **X-Frame-Options**: `X-Frame-Options: DENY`
       - No endpoint should be frameable. This prevents clickjacking.
       - The verify page already sets this in its own Response. The global header will overwrite it with the same value -- no conflict.

    After your changes, the global header block should be:
    ```js
    response.headers.set('Referrer-Policy', 'no-referrer');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    ```

    ## Files to modify

    - `src/index.js` -- add two `response.headers.set()` calls after line 49

    ## Files NOT to modify

    - `src/verify-page.js` -- leave the page-specific CSP and X-Frame-Options as-is. The global X-Frame-Options overwrites the page-specific one (same value), and the CSP must remain page-specific.
    - Do NOT add `Content-Security-Policy` globally. CSP must be page-specific because `unsafe-inline` is only appropriate for the verify HTML page, not for JSON responses.
    - Do NOT add `Permissions-Policy`. It is informational severity and not in scope.

    ## Deliverables

    - Modified `src/index.js` with HSTS and X-Frame-Options added to the global header block
    - Run existing tests (`npm test`) to verify nothing breaks

    ## Success criteria

    - `Strict-Transport-Security` header present on all responses
    - `X-Frame-Options: DENY` header present on all responses
    - All existing tests pass
- **Deliverables**: Modified `src/index.js` with two new global security headers
- **Success criteria**: All existing tests pass; HSTS and X-Frame-Options present on all responses

---

### Task 2: Global Capture Rate Limiter (Backpressure)
- **Agent**: edge-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |
    You are adding a global rate limiter to the WRL capture endpoint for backpressure protection.

    ## Context

    The WRL service runs on Cloudflare Workers with Browser Rendering for headless captures. Browser Rendering allows 30 concurrent sessions per account (paid plan). The existing per-IP rate limiter (`CAPTURE_RATE_LIMITER`: 10 requests/60s) prevents abuse from individual IPs, but does not protect against distributed legitimate load (10 IPs x 10 requests = 100 concurrent browser sessions, far exceeding the 30-session limit).

    The solution is a global-key rate limiter using the same `[[unsafe.bindings]]` pattern already in `wrangler.toml`. This uses a fixed string key instead of `CF-Connecting-IP`, limiting total capture throughput at each Cloudflare PoP.

    Important: Cloudflare's rate limiting is **per-location** (per data center), not globally distributed. This is fine -- Browser Rendering sessions are also location-scoped.

    ## Task

    ### 1. Add rate limiter binding to `wrangler.toml`

    Add after the existing `VERIFY_RATE_LIMITER` binding:

    ```toml
    [[unsafe.bindings]]
    name = "GLOBAL_CAPTURE_LIMITER"
    type = "ratelimit"
    namespace_id = "1003"
    simple = { limit = 20, period = 60 }
    ```

    The limit of 20/min leaves headroom below the 30-session ceiling to account for in-flight captures.

    ### 2. Add global rate limit check in `handleCreateCapture` in `src/index.js`

    Add the global rate limit check AFTER the existing per-IP rate limit check (after line 75). Use a fixed key string `"global"`:

    ```js
    // Step 3b: Global rate limit check (service capacity protection)
    if (env.GLOBAL_CAPTURE_LIMITER) {
      const { success } = await env.GLOBAL_CAPTURE_LIMITER.limit({ key: 'global' });
      if (!success) return problemResponse(503, 'Service is at capacity. Try again shortly.', { 'Retry-After': '10' });
    }
    ```

    Key points:
    - Use **503** (not 429) for the global limiter. 429 = "you are sending too many requests"; 503 = "the service is temporarily at capacity". Different semantics, different status codes.
    - `Retry-After: 10` (not 60) because capacity frees up quickly as browser sessions complete.
    - The `if (env.GLOBAL_CAPTURE_LIMITER)` guard ensures the feature is opt-in (like the existing rate limiters) and does not break local dev without the binding.

    ### 3. Add the binding to vitest config

    Check `vitest.config.js` -- if rate limiter bindings are configured there for testing, add `GLOBAL_CAPTURE_LIMITER` alongside them. If rate limiters are not configured in the test environment (they may be optional), skip this step.

    ## Files to modify

    - `wrangler.toml` -- add `GLOBAL_CAPTURE_LIMITER` binding
    - `src/index.js` -- add global rate limit check in `handleCreateCapture`

    ## Files NOT to modify

    - `src/capture.js` -- do NOT add Browser Rendering error handling in this task. That is a separate concern.
    - Do NOT add backpressure to any GET endpoints (health, status, retrieval, verification, signing-key). They are lightweight KV/R2 reads that do not need protection.
    - Do NOT use Durable Objects for a global counter. That is over-engineering.

    ## Deliverables

    - Modified `wrangler.toml` with new binding
    - Modified `src/index.js` with global rate limit check (~5 lines)
    - All existing tests pass

    ## Success criteria

    - Global rate limit check exists in `handleCreateCapture` after the per-IP check
    - Returns 503 with `Retry-After: 10` when capacity exceeded
    - Existing tests pass (the binding is optional/guarded)
- **Deliverables**: Modified `wrangler.toml` and `src/index.js` with global capture rate limiter
- **Success criteria**: 503 returned when global capacity exceeded; existing tests pass

---

### Task 3: Signing-Key Endpoint Implementation
- **Agent**: api-design-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: Task 1 (needs global headers in place)
- **Approval gate**: yes
- **Gate reason**: The signing-key endpoint response format locks in an API contract. The JSON shape `{ algorithm, publicKey }` and error behavior (503 when no key) are hard to reverse once clients depend on them. Multiple tasks downstream depend on this endpoint existing.
- **Prompt**: |
    You are implementing the `GET /.well-known/signing-key` endpoint for the WRL service.

    ## Context

    WRL signs WACZ bundles with Ed25519. The verification endpoint already exists and verifies against the server's own key. The signing-key endpoint makes the public key available for independent, out-of-band verification by third parties.

    The `getSigningKeys(env)` function in `src/signing.js` already handles key derivation and caching. It returns `{ privateKey, publicKeyBytes }` or `null` if no key is configured. `publicKeyBytes` is a 32-byte Uint8Array (raw Ed25519 public key).

    ## Task

    ### 1. Add the route to `src/index.js`

    Add to the `routes` array (before or after the verify route):

    ```js
    ['GET',  /^\/\.well-known\/signing-key$/, handleGetSigningKey],
    ```

    Note the escaped dot: `\.well-known`.

    ### 2. Implement the handler in `src/index.js`

    ```js
    async function handleGetSigningKey(request, env) {
      // Rate limit (reuse VERIFY_RATE_LIMITER -- endpoint is cheap but needs abuse protection)
      if (env.VERIFY_RATE_LIMITER) {
        const { success } = await env.VERIFY_RATE_LIMITER.limit({
          key: request.headers.get('CF-Connecting-IP') || 'unknown',
        });
        if (!success) return problemResponse(429, 'Rate limit exceeded. Try again later.', { 'Retry-After': '60' });
      }

      const keys = await getSigningKeys(env);
      if (!keys) return problemResponse(503, 'Signing is not configured');

      const publicKeyBase64 = btoa(String.fromCharCode(...keys.publicKeyBytes));

      return jsonResponse({ algorithm: 'Ed25519', publicKey: publicKeyBase64 }, 200, {
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
        'Access-Control-Allow-Origin': '*',
      });
    }
    ```

    Key design decisions (already resolved, do not deviate):
    - **Response format**: JSON `{ algorithm: "Ed25519", publicKey: "<base64>" }`. Not raw bytes, not JWK.
    - **No keyId or createdAt**: YAGNI. The response shape is forward-compatible -- these fields can be added later without breaking existing clients.
    - **Cache-Control**: `public, max-age=3600, stale-while-revalidate=86400` -- 1 hour fresh, 24 hour SWR. After key rotation, caches converge within 1 hour.
    - **Error**: 503 with RFC 9457 problem response when no key configured. Matches `handleVerifyCapture` behavior.
    - **Rate limiting**: Reuse `VERIFY_RATE_LIMITER`. The endpoint is cheap (no R2/KV reads) but needs abuse protection.
    - **CORS**: `Access-Control-Allow-Origin: *` -- browsers need this for client-side verification.
    - **No authentication**: This is a public key. The whole point is anyone can fetch it.

    ### 3. Add a public key link to the verification page

    In `src/verify-page.js`, in the `buildResult` function, add a "Public key" row to the cryptographic details section. This goes inside the existing `<details>` element, after the "Signed at" row (around line 383). Only show it when `signing` data is present (same condition as the other crypto rows).

    Add a new `<div class="crypto-row">` with label "Public key" and a value that links to `/.well-known/signing-key`. Use the `origin` variable already available in the page's JavaScript scope to construct the URL. The link text should be the full URL (e.g., `https://wrl.example.com/.well-known/signing-key`).

    In the `populate` function, set the link href and text using DOM manipulation (not innerHTML) for consistency with the page's security patterns. Create an anchor element, set its `href` and `textContent`, and append it to the crypto-value element.

    Important: This link is inside a collapsed `<details>` element. Casual users never see it. Technical users who expand "Cryptographic details" find it alongside the bundle hash and signed-at timestamp.

    ## Files to modify

    - `src/index.js` -- add route and handler function
    - `src/verify-page.js` -- add public key row to cryptographic details

    ## Files NOT to modify

    - `src/signing.js` -- the existing `getSigningKeys()` function provides everything needed
    - Do NOT add `signingKeyUrl` to the verification JSON response or capture retrieval response
    - Do NOT add `keyId`, `createdAt`, or any versioning fields to the response

    ## Deliverables

    - New route and handler in `src/index.js`
    - Updated verify page with public key link in crypto details
    - All existing tests pass

    ## Success criteria

    - `GET /.well-known/signing-key` returns `{ algorithm: "Ed25519", publicKey: "<base64>" }` with correct headers
    - Returns 503 when SIGNING_KEY not configured
    - Rate limited via VERIFY_RATE_LIMITER
    - Verify page shows public key link in collapsed crypto details section
    - All existing tests pass
- **Deliverables**: New endpoint in `src/index.js`, updated `src/verify-page.js` with public key link
- **Success criteria**: Endpoint returns correct JSON; 503 when unconfigured; verify page links to key; tests pass

---

### Task 4: OpenAPI Spec Completion
- **Agent**: api-spec-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: Task 3 (needs signing-key endpoint format finalized)
- **Approval gate**: yes
- **Gate reason**: The OpenAPI spec is the formal API contract. Spec errors propagate to documentation, SDK generation, and contract tests. The spec grows from ~634 to ~900 lines with 4 new schemas, 2 new endpoints, and 5 gap fixes.
- **Prompt**: |
    You are completing the OpenAPI specification for the WRL service, adding verification and signing-key endpoints plus fixing spec-implementation gaps.

    ## Context

    The `openapi.yaml` (currently ~634 lines, OpenAPI 3.1.0) covers health, capture lifecycle, and artifact endpoints. Two endpoints are missing from the spec: the verification endpoint (`GET /v1/verify/{captureId}`) and the signing-key endpoint (`GET /.well-known/signing-key`). There are also 5 spec-implementation gaps to fix.

    ## Task

    ### 1. Add new tags

    Add to the `tags` section:
    ```yaml
    - name: verification
      description: WACZ bundle cryptographic verification
    - name: signing
      description: Signing key management
    ```

    ### 2. Add verification schemas to `components/schemas/`

    Add these 4 new schemas (refer to the implementation in `src/index.js` lines 224-301 and `src/verify.js` for the exact shape):

    **VerificationCheck**: `{ name: enum[artifactHashes, bundleHash, signature], status: enum[pass, fail, skip], detail?: string }`

    **VerificationSigning**: `{ bundleHash: string|null (pattern sha256:hex), signature: string|null, publicKey: string|null, signedAt: string|null (date-time) }` -- all fields nullable using OpenAPI 3.1 `type: ["string", "null"]` syntax. Description must note that `publicKey` is informational only -- the server verifies against its own key.

    **VerificationCapture**: `{ id: $ref CaptureId, createdAt: date-time, completedAt: date-time }`

    **VerificationResult**: `{ verified: boolean, capture: $ref VerificationCapture, signing: oneOf[$ref VerificationSigning, null], checks: array[$ref VerificationCheck] minItems:3 maxItems:3 }` -- signing is null when WACZ bundle cannot be read.

    ### 3. Add verification endpoint path

    Add `GET /v1/verify/{captureId}` with:
    - `operationId: verifyCapture`
    - `tags: [verification]`
    - `security: []` (no auth)
    - Parameter: `captureId` in path, `$ref CaptureId`
    - Response 200 with **content negotiation** -- two media types under the same 200:
      - `application/json` with schema `$ref VerificationResult` and three examples (verified, unverified with signature fail, storage loss with null signing)
      - `text/html` with schema `type: string` and description explaining it is a self-contained HTML page that fetches JSON client-side
    - Headers on 200: `Vary: Accept`, `Cache-Control` (varies by verified status), `Access-Control-Allow-Origin: *`
    - Error responses: 404 ($ref Problem404), 422 (WACZ exceeds 100MB), 429 ($ref Problem429), 503 ($ref Problem503)
    - Description must note: "A 200 status does NOT mean the capture is verified -- check the `verified` field."

    ### 4. Add signing-key endpoint path

    Add `GET /.well-known/signing-key` with:
    - `operationId: getSigningKey`
    - `tags: [signing]`
    - `security: []`
    - Response 200:
      - Schema: `{ algorithm: const "Ed25519", publicKey: string }` with `additionalProperties: false`
      - Headers: `Cache-Control`, `Access-Control-Allow-Origin: *`
      - Example: `{ algorithm: "Ed25519", publicKey: "MCowBQYDK2VwAyEAexamplekeybase64encoded=" }`
    - Response 503: signing not configured, with problem+json example
    - Response 429: $ref Problem429

    ### 5. Fix spec-implementation gaps

    **Gap 1: Missing `verifyUrl` in CaptureRecord**
    Add to `CaptureRecord` properties:
    ```yaml
    verifyUrl:
      type: string
      format: uri
      description: >
        URL to the verification endpoint for this capture. Present only
        when the capture has a signed WACZ bundle.
      examples:
        - https://wrl.example.com/v1/verify/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6
    ```
    Update the `withWacz` example to include `verifyUrl`. Do NOT add `verifyUrl` to `required`.

    **Gap 2: Missing `Access-Control-Allow-Origin` on artifact endpoint**
    Add `Access-Control-Allow-Origin: *` header to the artifact endpoint's 200 response (currently missing, but the implementation sends it at line 217 of index.js).

    **Gap 3: Missing `Vary` header declaration**
    Ensure the verify endpoint's 200 response declares the `Vary: Accept` header.

    **Gap 4: New global security headers**
    Add `X-Frame-Options` and `Strict-Transport-Security` to `components/headers/`:
    ```yaml
    XFrameOptions:
      description: Prevents clickjacking by disabling framing.
      schema:
        type: string
        enum: [DENY]
    StrictTransportSecurity:
      description: Enforces HTTPS connections.
      schema:
        type: string
    ```
    Add these headers to ALL endpoint responses (all paths, all status codes) alongside the existing ReferrerPolicy and XContentTypeOptions references.

    **Gap 5: 503 response description update**
    The existing Problem503 description says "API key not configured." Update to be more general: "Service Unavailable -- required configuration is missing or service is at capacity."

    ### 6. Install and configure `@redocly/cli`

    Add to `package.json` devDependencies:
    ```json
    "@redocly/cli": "^1.34.0"
    ```

    Add npm script:
    ```json
    "lint:api": "redocly lint openapi.yaml"
    ```

    Create `redocly.yaml` at project root:
    ```yaml
    extends:
      - recommended

    rules:
      operation-operationId-unique: error
      no-unresolved-refs: error
      no-unused-components: warn
      operation-summary: error
      operation-operationId: error
      tag-description: error
      info-description: error
      operation-description: error
    ```

    ### 7. Validate

    Run `npx @redocly/cli lint openapi.yaml` and fix any errors. The spec must lint clean (errors, not warnings).

    ## Files to modify

    - `openapi.yaml` -- all spec changes
    - `package.json` -- add `@redocly/cli` devDependency and `lint:api` script

    ## Files to create

    - `redocly.yaml` -- linter configuration

    ## Files NOT to modify

    - `src/index.js` -- do not change implementation code
    - `src/verify-page.js` -- do not change implementation code
    - Do NOT split the spec into multiple files (single-file is fine at ~900 lines)

    ## Deliverables

    - Complete `openapi.yaml` with all endpoints, schemas, and gap fixes
    - `@redocly/cli` installed and `npm run lint:api` passes
    - `redocly.yaml` configuration file

    ## Success criteria

    - `npm run lint:api` reports no errors
    - All implementation endpoints have corresponding spec entries
    - Content negotiation on verify endpoint correctly specified with two media types
    - Signing-key endpoint response shape matches implementation: `{ algorithm, publicKey }`
    - `verifyUrl` field added to CaptureRecord schema
    - New security headers declared on all responses
- **Deliverables**: Complete `openapi.yaml`, `redocly.yaml`, updated `package.json`
- **Success criteria**: `npm run lint:api` passes; all endpoints specified; spec matches implementation

---

### Task 5: Tests for New Functionality
- **Agent**: test-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: Task 1, Task 2, Task 3 (needs all implementation changes in place)
- **Approval gate**: no
- **Prompt**: |
    You are writing integration tests for the new functionality added in MVP Step 8: signing-key endpoint, security headers, and a content-negotiation gap.

    ## Context

    The WRL service uses vitest with `@cloudflare/vitest-pool-workers` for integration testing. Tests use `SELF.fetch()` to make HTTP requests to the Worker. The existing test suite has 15 test files covering all endpoints.

    The `vitest.config.js` already injects a test `SIGNING_KEY` into Miniflare bindings. The `getSigningKeys()` function in `src/signing.js` derives the public key from this binding.

    ## Task

    ### 1. Create `test/signing-key.test.js`

    Integration tests for `GET /.well-known/signing-key`. Follow the exact patterns in `test/health.test.js` (simplest existing test) and `test/capture-retrieval.test.js`.

    Test cases:
    1. **Returns 200 with JSON body** -- happy path, endpoint exists and returns key material
    2. **Response body has correct shape** -- `{ algorithm: "Ed25519", publicKey: "<string>" }`
    3. **publicKey decodes to exactly 32 bytes** -- `atob(body.publicKey)` should yield exactly 32 characters (Ed25519 raw key is always 32 bytes)
    4. **Content-Type is application/json** -- consistent with all other endpoints
    5. **Cache-Control headers present** -- `public, max-age=3600, stale-while-revalidate=86400`
    6. **CORS header present** -- `Access-Control-Allow-Origin: *`
    7. **Security headers present** -- Referrer-Policy, X-Content-Type-Options, X-Frame-Options, Strict-Transport-Security
    8. **POST returns 404** -- method not matched by route table
    9. **Round-trip verification** -- this is the most important test. Sign some data using the test SIGNING_KEY, then fetch the public key from the endpoint, and verify the signature using the returned key. This proves the endpoint returns the correct public key. Use `getSigningKeys()` and `signBytes()` from `src/signing.js`, and `verifySignature()` to verify with the endpoint's returned key.

    For the 503-when-no-key test: this requires a different Miniflare configuration without SIGNING_KEY. If the test framework does not easily support per-test env overrides, skip this test case and note it in a comment. The guard logic (`if (!keys)`) is the same pattern as the verify endpoint, which is already tested.

    ### 2. Create `test/security-headers.test.js`

    Centralized security header coverage for the two new global headers (HSTS, X-Frame-Options) across multiple routes. Create a helper function and test all routes systematically.

    ```js
    function expectSecurityHeaders(response) {
      expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(response.headers.get('X-Frame-Options')).toBe('DENY');
      const hsts = response.headers.get('Strict-Transport-Security');
      expect(hsts).toBeTruthy();
      expect(hsts).toContain('max-age=');
    }
    ```

    Test cases -- apply `expectSecurityHeaders()` to:
    1. `GET /health` -- baseline happy path (200)
    2. `POST /v1/captures` without auth -- error response (401)
    3. `GET /v1/captures/cap_00000000000000000000000000000000` -- not found (404)
    4. `GET /.well-known/signing-key` -- new endpoint (200)
    5. `GET /nonexistent` -- catch-all 404
    6. Specific value check: HSTS max-age >= 31536000
    7. Specific value check: X-Frame-Options is exactly `DENY`

    ### 3. Add content-negotiation test to `test/verify-integration.test.js`

    Add one test case to the existing file:

    ```js
    it('returns HTML when Accept: text/html is sent', async () => {
      // Use an existing test capture ID that has verification data set up
      // in the test fixtures, or create a minimal fixture
      const res = await SELF.fetch(`https://worker.test/v1/verify/${TEST_CAPTURE_ID}`, {
        headers: { Accept: 'text/html' },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('text/html');
      expect(res.headers.get('Vary')).toBe('Accept');
    });
    ```

    Look at the existing test setup in `test/verify-integration.test.js` to find the test capture ID and fixture setup pattern. The test needs a complete capture with a WACZ in KV/R2 to return 200 (not 404).

    ## Files to create

    - `test/signing-key.test.js` (~80-100 lines)
    - `test/security-headers.test.js` (~60-80 lines)

    ## Files to modify

    - `test/verify-integration.test.js` -- add one test case (~8 lines)

    ## Files NOT to modify

    - `src/` files -- do not modify implementation code
    - Other test files -- do not remove existing header assertions from other test files (they serve as per-endpoint documentation)

    ## Deliverables

    - `test/signing-key.test.js` with 8-9 test cases
    - `test/security-headers.test.js` with 7 test cases
    - Updated `test/verify-integration.test.js` with content-negotiation test
    - All tests pass (`npm test`)

    ## Success criteria

    - `npm test` passes with all new and existing tests green
    - Round-trip signing-key test proves the endpoint returns the correct key
    - Security headers verified across all route patterns
    - Content-negotiation integration path covered
- **Deliverables**: Three test files (2 new, 1 modified) with comprehensive coverage
- **Success criteria**: All tests pass; round-trip key verification works; security headers verified across routes

---

### Task 6: Documentation (README + Backlog)
- **Agent**: user-docs-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: Task 3 (needs signing-key endpoint to exist)
- **Approval gate**: no
- **Prompt**: |
    You are adding key rotation documentation and signing-key endpoint reference to the WRL README, and updating the backlog.

    ## Context

    The WRL service signs WACZ bundles with Ed25519. The signing key setup section already exists in README.md (lines 36-65). A new `GET /.well-known/signing-key` endpoint has been added that returns the current public key as `{ algorithm: "Ed25519", publicKey: "<base64>" }`.

    Key rotation is a destructive operation: after rotation, all captures signed with the old key will fail signature verification. This is a known limitation -- key versioning is a [should] backlog item.

    ## Task

    ### 1. Add "Key Rotation" section to README.md

    Add after the existing "Signing Key Setup" section (after the "Security" note about .dev.vars). Structure:

    **Warning block first** (use a blockquote or bold text):
    Rotating the signing key invalidates signature verification for all captures signed with the previous key. There is no key history endpoint yet -- old captures will show "Verification Failed" until key versioning is implemented.

    **Steps** (3 steps, imperative mood):
    1. Generate a new key pair: `node scripts/generate-signing-key.js`
    2. Update the production secret: `wrangler secret put SIGNING_KEY`
    3. Update local dev secret in `.dev.vars` (if applicable)

    **What happens after rotation** (2-3 sentences):
    - New captures are signed with the new key.
    - Existing captures signed with the old key will fail signature verification.
    - The `/.well-known/signing-key` endpoint serves the current key. Third-party verifiers should re-fetch after rotation. Caches converge within 1 hour.

    **What is not supported yet** (1 sentence):
    Key versioning and old-key verification are not yet implemented. See `docs/backlog.md` under "Signing and Legal Admissibility."

    ### 2. Add signing-key endpoint reference

    Add a brief paragraph (3-4 sentences) after the Key Rotation section or in a "Public Key Endpoint" subsection:

    - What: `GET /.well-known/signing-key` returns the current Ed25519 public key for independent verification.
    - Why: Third-party verifiers can fetch the key without trusting the publicKey embedded in individual WACZ bundles.
    - Format: JSON `{ algorithm, publicKey }` with `publicKey` as base64-encoded raw 32-byte Ed25519 key.
    - Caching: Cached for 1 hour at the edge.

    ### 3. Update `docs/backlog.md`

    Under "Verification Page" section:
    - Mark the HSTS header item as done: `~~[should] HSTS header -- ...~~` -> DONE with reference to Step 8

    Under "Signing and Legal Admissibility":
    - Add: `[should] HSTS preload submission -- add preload directive and submit to hstspreload.org after domain is finalized (security-minion, openapi-security-hardening)`

    No other backlog changes. Key versioning remains [should]. Do not elevate it.

    ## Files to modify

    - `README.md` -- add Key Rotation section and signing-key endpoint reference
    - `docs/backlog.md` -- mark HSTS done, add HSTS preload item

    ## Files NOT to modify

    - `openapi.yaml` -- spec changes are handled separately
    - `src/` files -- no implementation changes
    - Do NOT document multi-key management, HSM guidance, or cache invalidation procedures (speculative / YAGNI)
    - Do NOT document downtime windows (there is no downtime -- the service stays up)

    ## Deliverables

    - Updated `README.md` with key rotation section and signing-key endpoint reference
    - Updated `docs/backlog.md` with HSTS status change and preload backlog item

    ## Success criteria

    - Key rotation warning appears BEFORE the rotation steps (not buried after)
    - Documentation accurately reflects current capabilities (no speculative features)
    - Limitation about old captures clearly stated
    - Backlog accurately reflects what was done and what remains
- **Deliverables**: Updated `README.md` and `docs/backlog.md`
- **Success criteria**: Key rotation documented with prominent warning; signing-key endpoint referenced; backlog updated

---

### Task 7: DNS Pinning Risk Documentation
- **Agent**: security-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |
    You are documenting the accepted DNS pinning TOCTOU risk in the WRL codebase.

    ## Context

    WRL validates URLs before capture using `validateUrl()` in `src/url-validation.js`, which resolves DNS and checks all IPs against a private range blocklist. However, there is a time-of-check-to-time-of-use (TOCTOU) gap: Browser Rendering and the Workers `fetch()` runtime independently re-resolve DNS when connecting. An attacker controlling DNS could serve a public IP during validation and a private IP during rendering (DNS rebinding attack).

    This gap is already documented briefly in `url-validation.js` (lines 17-21) and tracked in `docs/backlog.md`. Additional runtime enforcement (Puppeteer IP pinning, request interception) is not achievable on Cloudflare's platform.

    ## Task

    ### 1. Expand the TOCTOU comment in `src/url-validation.js`

    The existing comment at lines 17-21 should be expanded (not replaced) to include risk quantification. Add after the existing comment:

    ```
    // Risk quantification:
    //   - Attacker must control DNS for the target domain (significant prerequisite)
    //   - DNS TTL must expire between validation and rendering (< 1s typical)
    //   - Cloudflare DNS resolver enforces minimum TTL floors (reduces rebinding window)
    //   - Blast radius: attacker gets Chromium to render an internal page, but result
    //     goes to R2 storage -- attacker needs the capture ID to retrieve it
    //   - IP pinning (--host-resolver-rules) is not available in CF Browser Rendering
    //   - Workers fetch() does not support IP override either
    //   - Accepted risk: pre-resolution check is the primary defense; TOCTOU is residual
    ```

    ### 2. Verify existing test coverage

    Confirm that `test/url-validation.test.js` covers:
    - All private IP ranges (RFC 1918, RFC 6598, loopback, link-local, cloud metadata 169.254.169.254)
    - IPv4-mapped IPv6 bypass
    - Fail-closed on unrecognized formats

    If the tests are comprehensive (they should be based on previous steps), note this in a brief comment. Do NOT write new tests for DNS pinning -- the TOCTOU gap cannot be tested without controlled DNS infrastructure.

    ## Files to modify

    - `src/url-validation.js` -- expand TOCTOU comment (~7 lines)

    ## Files NOT to modify

    - `test/url-validation.test.js` -- only review, do not modify unless a gap is found
    - Do NOT attempt to add runtime IP pinning or request interception
    - Do NOT modify `src/capture.js`

    ## Deliverables

    - Expanded risk documentation in `src/url-validation.js`
    - Confirmation that existing test coverage is comprehensive

    ## Success criteria

    - TOCTOU comment includes risk quantification and platform constraints
    - No implementation changes (documentation only)
    - All existing tests pass
- **Deliverables**: Expanded TOCTOU risk documentation in `src/url-validation.js`
- **Success criteria**: Risk quantified in code comments; existing tests confirmed comprehensive

---

### Cross-Cutting Coverage

| Dimension | Coverage | Task(s) |
|-----------|----------|---------|
| **Testing** | test-minion writes signing-key tests, security header tests, content-negotiation gap test | Task 5 |
| **Security** | security-minion adds HSTS + X-Frame-Options globally; DNS pinning risk documented | Task 1, Task 7 |
| **Usability -- Strategy** | ux-strategy-minion contributions incorporated: public key link in verify page crypto details (inside collapsed `<details>`, zero cognitive load for casual users); key versioning kept as [should] with honest documentation of limitation | Task 3, Task 6 |
| **Usability -- Design** | Not included. No new UI pages or interaction patterns -- only a single link added inside an existing collapsed section. ux-design-minion review would not add value. | -- |
| **Documentation** | user-docs-minion handles README key rotation section and backlog update; api-spec-minion handles OpenAPI spec completion | Task 4, Task 6 |
| **Observability** | Not included. No new runtime services or background processes. The signing-key endpoint is a simple in-memory key derivation with no external calls. Existing Cloudflare Workers observability (request logs, error rates) is sufficient. | -- |

---

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - **accessibility-minion**: The verify page is being modified (Task 3 adds a public key link to the crypto details section). The link must be keyboard-navigable and have appropriate focus styles consistent with existing page elements.
- **Not selected**: ux-design-minion (no new UI pages/components), sitespeed-minion (no web-facing runtime changes beyond a static link), observability-minion (no new runtime components), user-docs-minion (README changes are straightforward)

---

### Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Signing-key response format locks in prematurely | Low | Medium | JSON `{algorithm, publicKey}` is minimal and additively extensible. No versioning fields committed. |
| HSTS without preload provides partial protection | Low | Low | HSTS preload is tracked as backlog item. Workers are already HTTPS-only; HSTS is defense-in-depth. |
| Global rate limiter is per-PoP, not truly global | Medium | Low | Per-PoP aligns with Browser Rendering's location-scoped sessions. Limit of 20 has headroom below 30-session ceiling. |
| Key rotation breaks old capture verification | High (when rotation occurs) | High | Documented prominently in README with warning. Key versioning tracked as [should] in backlog. |
| `@redocly/cli` version pinning | Low | Low | Pinned to `^1.34.0` -- major version lock prevents surprise breaking changes. |

---

### Execution Order

```
Batch 1 (parallel, no dependencies):
  Task 1: Security Headers
  Task 2: Global Capture Rate Limiter
  Task 7: DNS Pinning Risk Documentation

  -- no gate --

Batch 2 (depends on Task 1):
  Task 3: Signing-Key Endpoint Implementation

  -- APPROVAL GATE: signing-key endpoint --

Batch 3 (parallel, depends on Task 3):
  Task 4: OpenAPI Spec Completion
  Task 6: Documentation (README + Backlog)

  -- APPROVAL GATE: OpenAPI spec --

Batch 4 (depends on Tasks 1, 2, 3):
  Task 5: Tests for New Functionality

  -- no gate (Phase 6 handles test execution) --
```

Gate count: 2 (within budget of 3-5)

---

### Verification Steps

After all tasks complete:

1. `npm test` -- all existing and new tests pass
2. `npm run lint:api` -- OpenAPI spec lints clean
3. `curl /.well-known/signing-key` returns JSON with `algorithm` and `publicKey` fields
4. All responses include HSTS, X-Frame-Options, Referrer-Policy, X-Content-Type-Options headers
5. POST to `/v1/captures` returns 503 (not 429) when global capacity exceeded
6. Verify page crypto details section includes public key link
7. README includes key rotation section with warning before steps
8. `docs/backlog.md` reflects HSTS as done and preload as new backlog item
