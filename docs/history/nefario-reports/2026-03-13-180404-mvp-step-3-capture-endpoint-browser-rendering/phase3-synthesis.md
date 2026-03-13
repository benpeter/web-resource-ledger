## Delegation Plan

**Team name**: mvp-step-3-capture-endpoint
**Description**: Implement POST /v1/captures and GET /v1/captures/{id}/status with browser rendering, KV status tracking, API key auth, and rate limiting.

---

### Conflict Resolutions

#### 1. DNS-pinned fetch vs original URL for HTTP headers

**security-minion** initially recommended DNS pinning on the Workers `fetch` call (replace hostname with resolved IP, set Host header). **edge-minion** identified that Workers cannot fetch bare IPs (Error 1003), and the TLS-SNI mismatch breaks certificate validation. **security-minion** then revised to agree: use the original validated URL with `redirect: 'manual'`, accept the TOCTOU gap as identical to the Browser Rendering gap, close both together in the backlog.

**Resolution**: Use original validated URL for the header fetch. No DNS pinning. `redirect: 'manual'` is mandatory. This is unanimous after security-minion's self-correction.

#### 2. Status endpoint response shape: minimal vs full KV value

**api-design-minion** recommends minimal responses: `{ status }` for pending, add `captureUrl` on complete, add `detail` on failed. **data-minion** recommends returning the full KV value (url, ip, timestamps, artifacts). **ux-strategy-minion** recommends including `id` in every status response plus `retryable` boolean on failed.

**Resolution**: The API response should be selective, not a KV dump. Include `id` in all status responses (ux-strategy-minion is right -- response hygiene for multi-capture clients). Include `captureUrl` on complete (api-design-minion + ux-strategy). Include `error` string and `retryable` boolean on failed (ux-strategy). Omit url, ip, timestamps from the status response (api-design-minion is right -- callers know the URL they submitted; timestamps belong to the metadata endpoint in Step 5). The KV value stores the full metadata; the status handler selects what to expose.

#### 3. `note` field in 202 response

**ux-strategy-minion** recommends `note` field with ID preservation warning. **api-design-minion** recommends no additional metadata in 202 body. The acceptance criteria in the issue explicitly require a message telling the caller to preserve the ID.

**Resolution**: Include `note` field. The issue spec requires it. api-design-minion's minimalism principle is sound but the acceptance criteria override it here. The field is a one-time informational string, not a recurring payload burden.

#### 4. Retry-After header scope

**ux-strategy-minion** wants `Retry-After: 5` on 202 and on pending status responses. **api-design-minion** wants `Retry-After` only on 429 responses.

**Resolution**: Include `Retry-After: 5` on 202 responses and pending status responses (ux-strategy). This is an HTTP convention for 202 (RFC 7231 section 6.3.3 says 202 responses "ought to" indicate when the work will be complete). The cost is one header; the benefit is eliminating guesswork for pollers. Also include `Retry-After` on 429 responses (api-design-minion -- this is mandatory).

#### 5. R2 artifact storage in Step 3 vs Step 4

**data-minion** recommends writing intermediate artifacts (screenshot, HTML, headers) to R2 in Step 3 rather than deferring to Step 4. This prevents data loss if `ctx.waitUntil()` is killed between rendering and bundling.

**Resolution**: Store artifacts in R2 during Step 3. The R2 BUCKET binding already exists in wrangler.toml. Writing captures/{captureId}/screenshot.png, captures/{captureId}/rendered.html, captures/{captureId}/headers.json is additive and respects step isolation. The KV artifacts map records where each file lives.

#### 6. Concurrency limiting

**edge-minion** evaluated three options (skip, KV counter, Durable Object) and recommended skipping explicit concurrency limiting for MVP. The rate limiter (10/min) combined with Browser Rendering's platform limits (~3 concurrent on free plan) provides an implicit cap.

**Resolution**: Skip explicit concurrency limiting. This is YAGNI-compliant and the platform constraints provide a backstop.

#### 7. OpenAPI spec timing

**software-docs-minion** argues for contract-first OpenAPI spec before implementation. MVP.md defers the full spec to Step 8, but this step introduces the first real JSON endpoints.

**Resolution**: Write openapi.yaml covering the three endpoints (health, POST captures, GET status) before implementation. This is small (~150-200 lines YAML), prevents implementation-first drift, and Step 8 becomes an extension step rather than a from-scratch authoring effort. Contract stays mutable within the step.

#### 8. `error` vs `detail` field name for failed status

**api-design-minion** uses `detail` (consistent with RFC 9457 convention). **ux-strategy-minion** and **data-minion** use `error`. The status response is 200 (the request succeeded; the *capture* failed), so the RFC 9457 `detail` naming doesn't directly apply.

**Resolution**: Use `error` for the failure reason in the status response. Reserve `detail` for RFC 9457 problem responses (4xx/5xx). This avoids conflating "the HTTP request failed" (problem detail) with "the capture process failed" (status response). Consistent with ux-strategy-minion's recommendation.

---

### Task 1: OpenAPI spec (contract-first)
- **Agent**: api-spec-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: none
- **Approval gate**: yes
- **Gate reason**: The OpenAPI spec defines the API contract that all implementation tasks depend on. Response shapes, field names, status codes, and error formats are locked in here. High blast radius (6+ downstream tasks), hard to reverse after implementation begins.
- **Prompt**: |
    You are writing the OpenAPI 3.1 spec for the Web Resource Ledger capture API. This is a contract-first deliverable: implementation tasks will treat this spec as authoritative.

    ## Context
    Working directory: /Users/ben/github/benpeter/web-resource-ledger
    The project is a Cloudflare Worker that captures web page screenshots, rendered HTML, and HTTP headers. It currently has one endpoint: GET /health returning `{"status":"ok"}`.

    Read these files for existing patterns:
    - src/responses.js -- RFC 9457 problem response implementation
    - src/index.js -- route table pattern
    - src/url-validation.js -- validation error shapes ({ok, status, detail})

    ## What to produce
    Create `openapi.yaml` at the project root. OpenAPI 3.1. Cover exactly three endpoints:

    ### GET /health
    - 200: `{"status":"ok"}`

    ### POST /v1/captures
    - Requires `Authorization: Bearer <key>` header
    - Requires `Content-Type: application/json`
    - Request body: `{"url": "https://example.com"}`
    - 202 Accepted response body:
      ```json
      {
        "id": "cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
        "statusUrl": "https://wrl.example.com/v1/captures/cap_a1b2.../status",
        "note": "No list endpoint is available. Store the capture ID -- it is the only way to access this capture."
      }
      ```
      Headers: `Retry-After: 5`
    - Error responses (all RFC 9457 `application/problem+json`):
      - 400: missing/invalid JSON body, missing `url` field, `url` not a string, bad URL scheme
      - 401: missing/malformed/invalid Authorization header (include `WWW-Authenticate: Bearer`)
      - 415: wrong Content-Type (not application/json)
      - 422: private IP, embedded credentials, double-encoding
      - 429: rate limit exceeded (include `Retry-After: 60`)
      - 503: service misconfigured (API key not set in environment)

    ### GET /v1/captures/{captureId}/status
    - No auth required (capture ID is the access secret)
    - Path parameter: captureId matching pattern `^cap_[a-f0-9]{32}$`
    - 200 responses (state-conditional fields):
      ```json
      {"id": "cap_...", "status": "pending"}
      ```
      Header: `Retry-After: 5` on pending only
      ```json
      {"id": "cap_...", "status": "complete", "captureUrl": "https://wrl.example.com/v1/captures/cap_..."}
      ```
      ```json
      {"id": "cap_...", "status": "failed", "error": "Page did not finish loading within 25 seconds", "retryable": true}
      ```
    - 404: unknown or malformed capture ID (RFC 9457)

    ## Shared schemas to define in components
    - `ProblemDetail` -- RFC 9457 shape matching src/responses.js: type (always "about:blank"), status, title, detail. Media type: `application/problem+json`
    - `CaptureAccepted` -- 202 body: id, statusUrl, note
    - `CaptureStatus` -- status response with discriminated shapes
    - `CaptureId` -- string pattern `^cap_[a-f0-9]{32}$`

    ## Security scheme
    - `bearerAuth` of type `http`, scheme `bearer`
    - Apply to POST /v1/captures only (status endpoint uses ID-as-secret model)

    ## Security response headers (on all responses)
    - `Referrer-Policy: no-referrer`
    - `X-Content-Type-Options: nosniff`
    - `Cache-Control: private, no-store` (on status endpoint responses)

    ## Constraints
    - Include realistic examples for every response (success and each error case)
    - Field name decisions are final: `id`, `statusUrl`, `note`, `captureUrl`, `error`, `retryable`, `status`
    - Status URL is absolute (construct from request origin)
    - The `note` field is required in the 202 response
    - Use `415` status code title "Unsupported Media Type" (add to knowledge)
    - Keep the spec under 250 lines if possible

    ## What NOT to do
    - Do not spec endpoints for Steps 5-7 (retrieval, WACZ bundling, verification)
    - Do not generate code
    - Do not create any files other than openapi.yaml
- **Deliverables**: `openapi.yaml` at project root
- **Success criteria**: Valid OpenAPI 3.1 spec covering all three endpoints, all error cases with examples, shared ProblemDetail schema matching src/responses.js

---

### Task 2: Auth module
- **Agent**: edge-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |
    You are implementing the API key authentication module for the Web Resource Ledger Cloudflare Worker.

    ## Context
    Working directory: /Users/ben/github/benpeter/web-resource-ledger
    Read these files first:
    - src/responses.js -- problemResponse() and jsonResponse() helpers
    - src/url-validation.js -- pattern to follow: exported function, discriminated result object, injectable dependencies
    - src/index.js -- route table, handler signature (request, env, ctx, match)
    - openapi.yaml -- the API contract (will exist by the time you run)
    - vitest.config.js -- test configuration

    ## What to produce

    ### src/auth.js
    Export a function `verifyApiKey(request, env)` that:
    1. Checks env.CAPTURE_API_KEY is set. If not, return `{ ok: false, response: problemResponse(503, 'Service is not configured') }`
    2. Extract Authorization header. If missing: return `{ ok: false, response: problemResponse(401, 'Authorization header is required', { 'WWW-Authenticate': 'Bearer' }) }`
    3. Check header starts with 'Bearer '. If not: return `{ ok: false, response: problemResponse(401, 'Authorization header must use Bearer scheme', { 'WWW-Authenticate': 'Bearer' }) }`
    4. Extract token after 'Bearer '
    5. Compare token to env.CAPTURE_API_KEY using timing-safe comparison:
       ```js
       const enc = new TextEncoder();
       const a = enc.encode(provided);
       const b = enc.encode(expected);
       if (a.byteLength !== b.byteLength) return { ok: false, response: ... };
       const match = crypto.subtle.timingSafeEqual(a, b);
       if (!match) return { ok: false, response: problemResponse(401, 'Invalid API key', { 'WWW-Authenticate': 'Bearer' }) };
       ```
    6. On success: return `{ ok: true }`

    Follow the discriminated result pattern from validateUrl -- callers check `result.ok` then use `result.response`.

    SECURITY constraints:
    - NEVER log or include the provided key in error responses
    - NEVER echo the provided value back
    - Use crypto.subtle.timingSafeEqual for comparison (available in Workers runtime)
    - Return consistent 401 for both wrong-key and empty-key cases

    ### test/auth.test.js
    Unit tests importing verifyApiKey directly. Test cases:
    - Correct key -> { ok: true }
    - Wrong key -> 401 with WWW-Authenticate header
    - Missing Authorization header -> 401
    - Malformed header (not Bearer scheme, e.g., "Basic abc") -> 401
    - Empty token ("Bearer ") -> 401
    - Missing CAPTURE_API_KEY env var -> 503
    - Response bodies are RFC 9457 shape (type, status, title, detail)
    - Error responses never contain the test API key value

    For tests, construct env objects directly:
    ```js
    const env = { CAPTURE_API_KEY: 'test-key-abc123' };
    const request = new Request('https://example.com/v1/captures', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer test-key-abc123' },
    });
    ```

    Follow existing test patterns from test/responses.test.js and test/url-validation.test.js:
    - import from 'vitest' for describe, it, expect
    - Descriptive test names
    - Group with describe blocks

    ### vitest.config.js update
    Add CAPTURE_API_KEY binding to miniflare config so integration tests can use it:
    ```js
    miniflare: {
      browserRendering: { binding: 'BROWSER' },
      bindings: {
        CAPTURE_API_KEY: 'test-api-key-for-vitest',
      },
    },
    ```

    ### responses.js update
    Add `415: 'Unsupported Media Type'` to the titles map.

    ## Module header comment convention
    Follow the pattern from url-validation.js: module-level block comment explaining purpose, trust boundaries, and attack categories.

    ## What NOT to do
    - Do not implement the capture handler or route table changes
    - Do not implement rate limiting
    - Do not create more than the files listed above
    - Do not use === for key comparison
- **Deliverables**: `src/auth.js`, `test/auth.test.js`, updated `vitest.config.js`, updated `src/responses.js`
- **Success criteria**: All auth test cases pass. timing-safe comparison used. 503 on missing env var. WWW-Authenticate header on all 401s.

---

### Task 3: KV helper module
- **Agent**: edge-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |
    You are implementing the KV status tracking module for the Web Resource Ledger capture pipeline.

    ## Context
    Working directory: /Users/ben/github/benpeter/web-resource-ledger
    Read these files first:
    - src/responses.js -- response helpers
    - src/url-validation.js -- pattern to follow for module design
    - wrangler.toml -- KV namespace binding (KV)
    - openapi.yaml -- the API contract (will exist by the time you run)

    ## What to produce

    ### src/kv.js
    Export four functions that encapsulate all KV access for the capture pipeline. No raw env.KV.put()/get() calls should exist outside this module.

    **Key format**: `capture:{captureId}` (e.g., `capture:cap_a1b2c3d4...`)

    ```js
    /**
     * Write initial pending record. Called BEFORE returning 202.
     * Uses expirationTtl: 86400 (24h) as self-cleaning for stuck captures.
     */
    export async function createCapture(kv, captureId, url, ip) {
      const value = {
        status: 'pending',
        url,
        ip,
        captureId,
        createdAt: new Date().toISOString(),
      };
      await kv.put(`capture:${captureId}`, JSON.stringify(value), {
        expirationTtl: 86400,
      });
    }

    /**
     * Update status to complete. Removes TTL (completed records persist).
     * artifacts: { screenshot: 'captures/cap_.../screenshot.png', html: '...', headers: '...' }
     */
    export async function completeCapture(kv, captureId, artifacts) {
      const existing = await kv.get(`capture:${captureId}`, 'json');
      if (!existing) return; // Expired or missing -- nothing to update
      const value = {
        ...existing,
        status: 'complete',
        completedAt: new Date().toISOString(),
        artifacts,
      };
      await kv.put(`capture:${captureId}`, JSON.stringify(value));
      // No expirationTtl -- completed records persist
    }

    /**
     * Update status to failed. Removes TTL (failed records persist for debugging).
     * error: human-readable string, retryable: boolean
     */
    export async function failCapture(kv, captureId, error, retryable = false) {
      const existing = await kv.get(`capture:${captureId}`, 'json');
      if (!existing) return;
      const value = {
        ...existing,
        status: 'failed',
        failedAt: new Date().toISOString(),
        error,
        retryable,
      };
      await kv.put(`capture:${captureId}`, JSON.stringify(value));
    }

    /**
     * Read capture record. Returns parsed JSON or null for missing keys.
     */
    export async function getCapture(kv, captureId) {
      return kv.get(`capture:${captureId}`, 'json');
    }
    ```

    The module encapsulates:
    - Key prefix convention (`capture:`)
    - JSON serialization
    - TTL logic (24h on pending, none on complete/failed)
    - Timestamp generation

    ### test/kv.test.js
    Unit tests using the real in-memory KV from @cloudflare/vitest-pool-workers. Do NOT mock KV.

    ```js
    import { env } from 'cloudflare:test';
    ```

    Test cases:
    - createCapture writes correct key (capture:{id}) and value shape
    - getCapture returns null for missing keys
    - getCapture returns parsed JSON for existing keys
    - completeCapture updates status, adds completedAt and artifacts, removes TTL
    - failCapture updates status, adds failedAt, error, and retryable
    - Key prefix is correctly applied (verify via raw env.KV.get)
    - Round-trip: createCapture then getCapture returns matching data
    - failCapture with retryable=true and retryable=false both work
    - completeCapture on expired/missing key is a no-op (does not throw)

    Follow test patterns from test/responses.test.js.

    ## Module header convention
    Follow url-validation.js pattern: block comment at top explaining purpose and data model.

    ## What NOT to do
    - Do not implement route handlers
    - Do not implement browser rendering
    - Do not use KV metadata field (value only)
    - Do not create files beyond src/kv.js and test/kv.test.js
- **Deliverables**: `src/kv.js`, `test/kv.test.js`
- **Success criteria**: All KV test cases pass. Key prefix applied. TTL set on pending, absent on complete/failed. Round-trip serialization works.

---

### Task 4: Browser rendering capture module
- **Agent**: edge-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: Task 1, Task 2, Task 3
- **Approval gate**: yes
- **Gate reason**: This is the core architectural component. The browser rendering lifecycle, isolation controls, request interception, injectable rendering interface, and artifact storage pattern affect every downstream task and all future capture pipeline work. Hard to reverse once tests are written against it.
- **Prompt**: |
    You are implementing the browser rendering capture module for the Web Resource Ledger Cloudflare Worker. This is the core component that navigates to a URL, takes a screenshot, captures rendered HTML, fetches HTTP headers, and stores artifacts in R2.

    ## Context
    Working directory: /Users/ben/github/benpeter/web-resource-ledger
    Read these files first:
    - src/url-validation.js -- injectable dependency pattern (resolvers parameter)
    - src/kv.js -- KV helper module (will exist by the time you run)
    - src/auth.js -- auth module (will exist by the time you run)
    - src/responses.js -- response helpers
    - wrangler.toml -- bindings: BROWSER, BUCKET (R2), KV
    - openapi.yaml -- the API contract
    - package.json -- dependencies (you need to add @cloudflare/puppeteer)

    ## What to produce

    ### Install dependency
    Run: `npm install @cloudflare/puppeteer`

    ### src/capture.js
    The module has two main exports:

    **1. `performCapture(env, url, ip, captureId, renderer)`**
    Orchestrates the full capture pipeline. Called from ctx.waitUntil() in the POST handler.

    Parameters:
    - env: Worker environment (KV, BUCKET, BROWSER bindings)
    - url: validated URL string
    - ip: resolved IP string (informational)
    - captureId: the capture ID (e.g., cap_abc123...)
    - renderer: injectable rendering function (defaults to `defaultRenderer`)

    Pipeline:
    1. Run browser capture and header fetch concurrently via Promise.allSettled()
    2. On all success: store artifacts in R2, update KV to complete
    3. On any failure: update KV to failed with error message and retryable flag
    4. Top-level try/catch ensures KV is ALWAYS updated (never leave stuck pending)

    ```js
    import { completeCapture, failCapture } from './kv.js';

    export async function performCapture(env, url, ip, captureId, renderer = defaultRenderer) {
      try {
        const [renderResult, headerResult] = await Promise.allSettled([
          renderer(env.BROWSER, url),
          captureHeaders(url),
        ]);

        if (renderResult.status === 'rejected') {
          const { message, retryable } = categorizeError(renderResult.reason);
          await failCapture(env.KV, captureId, message, retryable);
          return;
        }

        const { screenshot, html } = renderResult.value;
        const headers = headerResult.status === 'fulfilled' ? headerResult.value : null;

        // Store in R2
        const prefix = `captures/${captureId}`;
        await Promise.all([
          env.BUCKET.put(`${prefix}/screenshot.png`, screenshot),
          env.BUCKET.put(`${prefix}/rendered.html`, html),
          headers ? env.BUCKET.put(`${prefix}/headers.json`, JSON.stringify(headers)) : Promise.resolve(),
        ]);

        const artifacts = {
          screenshot: `${prefix}/screenshot.png`,
          html: `${prefix}/rendered.html`,
          ...(headers ? { headers: `${prefix}/headers.json` } : {}),
        };

        await completeCapture(env.KV, captureId, artifacts);
      } catch (err) {
        // Catch-all: ensure KV is updated even on unexpected errors
        try {
          await failCapture(env.KV, captureId, 'Capture could not be completed', true);
        } catch { /* KV write failed -- nothing more we can do */ }
      }
    }
    ```

    **2. `defaultRenderer(browser, url)` (NOT exported -- module-scoped default)**
    The real Puppeteer rendering function. Replaceable via the `renderer` parameter for testing.

    ```js
    import puppeteer from '@cloudflare/puppeteer';

    async function defaultRenderer(browserBinding, url) {
      const browser = await puppeteer.launch(browserBinding);
      const context = await browser.createBrowserContext();
      try {
        const page = await context.newPage();
        await page.setViewport({ width: 1280, height: 720 });

        // Request interception for isolation and safety limits
        let subresourceCount = 0;
        let totalBytes = 0;
        const MAX_SUBRESOURCES = 200;
        const MAX_PAGE_BYTES = 50 * 1024 * 1024;
        let limitExceeded = null;

        await page.setRequestInterception(true);
        page.on('request', (req) => {
          if (limitExceeded) { req.abort('blockedbyclient'); return; }
          subresourceCount++;
          if (subresourceCount > MAX_SUBRESOURCES) {
            limitExceeded = `Subresource limit exceeded (${MAX_SUBRESOURCES} max)`;
            req.abort('blockedbyclient');
            return;
          }
          req.continue();
        });

        page.on('response', (resp) => {
          const cl = resp.headers()['content-length'];
          if (cl) totalBytes += parseInt(cl, 10);
          if (totalBytes > MAX_PAGE_BYTES) {
            limitExceeded = `Page size limit exceeded (50MB max)`;
          }
        });

        // Navigate with 25s timeout (leaves 5s headroom in ctx.waitUntil 30s budget)
        await page.goto(url, { timeout: 25000, waitUntil: 'networkidle2' });

        if (limitExceeded) throw new Error(limitExceeded);

        // Cap screenshot height to prevent memory exhaustion
        const pageHeight = await page.evaluate(() => document.body.scrollHeight);
        const maxHeight = 8000;
        if (pageHeight > maxHeight) {
          await page.setViewport({ width: 1280, height: maxHeight });
        }

        const screenshot = await page.screenshot({ fullPage: true, type: 'png' });
        const html = await page.content();

        return { screenshot, html };
      } finally {
        await context.close();
        await browser.close();
      }
    }
    ```

    **3. `captureHeaders(url)` (exported for testing)**
    Fetches HTTP response headers via Workers fetch.

    ```js
    export async function captureHeaders(url) {
      const resp = await fetch(url, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(10000),
        headers: {
          'User-Agent': 'WRL/0.1 (Web Resource Ledger)',
          'Cache-Control': 'no-cache',
        },
        cf: { cacheTtl: 0 },
      });

      const headers = {};
      for (const [key, value] of resp.headers.entries()) {
        // SECURITY: strip Set-Cookie values (privacy)
        if (key.toLowerCase() === 'set-cookie') {
          headers[key] = '[redacted]';
        } else {
          headers[key] = value;
        }
      }

      return {
        status: resp.status,
        statusText: resp.statusText,
        headers,
      };
    }
    ```

    **4. `setRenderer(fn)` (exported for test injection)**
    Module-scoped variable + setter so tests can inject a stub renderer:
    ```js
    let _renderer = defaultRenderer;
    export function setRenderer(fn) { _renderer = fn; }
    export function getRenderer() { return _renderer; }
    ```
    Then `performCapture` defaults to `_renderer` when no renderer argument is passed.

    **5. `categorizeError(error)` (NOT exported -- internal helper)**
    Maps errors to user-facing messages and retryable flags:
    - Timeout errors (message includes 'timeout' or 'Timeout'): `{ message: 'Page did not finish loading within 25 seconds', retryable: true }`
    - Subresource limit: `{ message: 'Page exceeded 200 subresource limit', retryable: false }`
    - Page size limit: `{ message: 'Page exceeded 50MB size limit', retryable: false }`
    - Navigation errors: `{ message: 'Could not navigate to the target URL', retryable: true }`
    - Default: `{ message: 'Capture could not be completed', retryable: true }`

    SECURITY constraints:
    - Never expose stack traces, internal error messages, or KV keys in error strings
    - try/finally for browser context destruction (ALWAYS close even on error)
    - redirect:'manual' on header fetch (never follow redirects to unvalidated URLs)
    - Set-Cookie values redacted in captured headers

    ### test/capture.test.js (unit tests for capture orchestration)
    Test performCapture with injectable renderer. Use real KV (from cloudflare:test env). Use fetchMock from cloudflare:test for the header capture outbound fetch.

    ```js
    import { env, fetchMock } from 'cloudflare:test';
    ```

    Test cases:
    - Successful capture: stub renderer returns { screenshot, html }, fetchMock returns headers -> KV status transitions to complete, R2 artifacts written
    - Failed capture (renderer throws timeout): KV transitions to failed with retryable=true
    - Failed capture (renderer throws size limit): KV failed with retryable=false
    - Header capture fails but render succeeds: capture still completes (headers optional, but R2 headers.json not written)
    - Both fail: KV transitions to failed
    - KV is always updated (never stuck pending): verify after every test
    - Error messages are user-safe (no stack traces)

    For stub renderer:
    ```js
    const stubRenderer = async () => ({
      screenshot: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      html: '<html><body>test</body></html>',
    });
    ```

    For fetchMock:
    ```js
    beforeEach(() => {
      fetchMock.activate();
      fetchMock.disableNetConnect();
    });
    afterEach(() => {
      fetchMock.deactivate();
    });
    ```

    Verify R2 writes via env.BUCKET.get() in assertions.
    Verify KV state via env.KV.get() in assertions (import getCapture from src/kv.js).

    ## What NOT to do
    - Do not implement route handlers (Task 5)
    - Do not implement rate limiting (Task 6)
    - Do not write the evolution log (Task 7)
    - Do not implement request interception for isPrivateIP re-check on cross-domain navigations (documented as TOCTOU gap in backlog -- Step 3 accepts this risk)
    - Do not use page.goto with default timeout (must be 25000)
- **Deliverables**: `@cloudflare/puppeteer` added to package.json, `src/capture.js`, `test/capture.test.js`
- **Success criteria**: All capture unit tests pass. Injectable renderer works. KV always updated. R2 artifacts stored. fetchMock used for outbound fetch.

---

### Task 5: Route handlers and integration tests
- **Agent**: edge-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: Task 1, Task 2, Task 3, Task 4
- **Approval gate**: no
- **Prompt**: |
    You are wiring the capture endpoints into the Web Resource Ledger Worker's route table and writing integration tests.

    ## Context
    Working directory: /Users/ben/github/benpeter/web-resource-ledger
    Read these files:
    - src/index.js -- existing route table pattern
    - src/auth.js -- verifyApiKey(request, env) -> { ok, response }
    - src/kv.js -- createCapture, getCapture
    - src/capture.js -- performCapture, setRenderer, captureHeaders
    - src/responses.js -- problemResponse, jsonResponse
    - src/url-validation.js -- validateUrl(rawUrl, resolvers) -> { ok, url, ip } | { ok, status, detail }
    - openapi.yaml -- the API contract (source of truth for response shapes)
    - test/health.test.js -- integration test pattern using SELF.fetch

    ## What to produce

    ### Update src/index.js
    Add two routes to the route table:

    ```js
    const routes = [
      ['GET',  /^\/health$/, handleHealth],
      ['POST', /^\/v1\/captures$/, handleCreateCapture],
      ['GET',  /^\/v1\/captures\/(cap_[a-f0-9]{32})\/status$/, handleCaptureStatus],
    ];
    ```

    **handleCreateCapture(request, env, ctx, match)**:
    1. Check Content-Type: if not 'application/json', return problemResponse(415, 'Content-Type must be application/json')
    2. Auth check: `const auth = verifyApiKey(request, env); if (!auth.ok) return auth.response;`
    3. Rate limit check (if CAPTURE_RATE_LIMITER binding exists):
       ```js
       if (env.CAPTURE_RATE_LIMITER) {
         const { success } = await env.CAPTURE_RATE_LIMITER.limit({
           key: request.headers.get('CF-Connecting-IP') || 'unknown',
         });
         if (!success) return problemResponse(429, 'Rate limit exceeded. Try again later.', { 'Retry-After': '60' });
       }
       ```
    4. Parse JSON body. On parse failure: return problemResponse(400, 'Request body must be valid JSON')
    5. Validate `url` field exists and is a string. Missing: problemResponse(400, "Field 'url' is required"). Wrong type: problemResponse(400, "Field 'url' must be a string")
    6. Call validateUrl(body.url). If !result.ok: return problemResponse(result.status, result.detail)
    7. Generate capture ID: `const captureId = 'cap_' + crypto.randomUUID().replace(/-/g, '')`
    8. Write pending to KV (SYNCHRONOUSLY before returning 202):
       `await createCapture(env.KV, captureId, result.url, result.ip)`
       If KV write fails, return problemResponse(500, 'Could not create capture record')
    9. Trigger background capture:
       `ctx.waitUntil(performCapture(env, result.url, result.ip, captureId))`
    10. Build absolute status URL: `const statusUrl = new URL(\`/v1/captures/\${captureId}/status\`, request.url).href`
    11. Return 202:
        ```js
        return jsonResponse({
          id: captureId,
          statusUrl,
          note: 'No list endpoint is available. Store the capture ID -- it is the only way to access this capture.',
        }, 202, { 'Retry-After': '5' });
        ```

    Add security headers to ALL responses. The cleanest approach: add them after route dispatch in the main fetch handler:
    ```js
    async fetch(request, env, ctx) {
      const response = await handleRequest(request, env, ctx);
      response.headers.set('Referrer-Policy', 'no-referrer');
      response.headers.set('X-Content-Type-Options', 'nosniff');
      return response;
    }
    ```

    **handleCaptureStatus(request, env, ctx, match)**:
    The regex capture group provides the validated captureId (match[1]).
    1. The regex already enforces `cap_[a-f0-9]{32}` format. No additional validation needed.
    2. Call getCapture(env.KV, match[1])
    3. If null: return problemResponse(404, `Capture ${match[1]} not found`)
    4. Build response based on status:
       - pending: `{ id, status: 'pending' }` with `Retry-After: 5` header and `Cache-Control: private, no-store`
       - complete: `{ id, status: 'complete', captureUrl }` where captureUrl is absolute URL to `/v1/captures/{id}` (Step 5 endpoint, not yet implemented but URL is stable). `Cache-Control: private, no-store`
       - failed: `{ id, status: 'failed', error, retryable }` with `Cache-Control: private, no-store`

    **Import additions at top of index.js**:
    ```js
    import { verifyApiKey } from './auth.js';
    import { validateUrl } from './url-validation.js';
    import { createCapture, getCapture } from './kv.js';
    import { performCapture } from './capture.js';
    ```

    ### test/capture-integration.test.js
    Integration tests using SELF.fetch(). This tests the full HTTP request/response cycle.

    Set up renderer stub in beforeEach using setRenderer from src/capture.js.

    Test cases for POST /v1/captures:
    - Happy path: 202, body has id (matches /^cap_[a-f0-9]{32}$/), statusUrl (absolute URL), note field. Retry-After: 5 header. Content-Type: application/json.
    - Missing auth header: 401 with WWW-Authenticate and RFC 9457 shape
    - Wrong API key: 401 with RFC 9457 shape
    - Missing Content-Type: 415 with RFC 9457 shape
    - Missing body: 400 with RFC 9457 shape
    - Invalid JSON body: 400
    - Missing url field: 400 with detail mentioning 'url'
    - url field not a string: 400
    - URL validation failure (private IP): pass through from validateUrl (mock DNS via the resolver injection? No -- for integration tests, use a URL that will fail structurally like 'ftp://bad')
    - Security headers present on all responses: Referrer-Policy, X-Content-Type-Options

    Test cases for GET /v1/captures/{id}/status:
    - Create a capture first (POST), then GET status -> 200 with id and status field. Cache-Control: private, no-store.
    - Unknown ID (valid format): 404 with RFC 9457 shape
    - Malformed ID (e.g., "badid"): 404 from route not matching
    - No auth required on status endpoint (no Authorization header needed)

    Status transition test (use createExecutionContext + waitOnExecutionContext for reliability):
    ```js
    import { createExecutionContext, waitOnExecutionContext, env } from 'cloudflare:test';
    import worker from '../src/index.js';
    ```
    - POST capture, wait for ctx.waitUntil, then verify KV has complete status
    - POST capture with failing renderer, wait, verify KV has failed status

    Use fetchMock for outbound header capture fetch (same as Task 4 tests).

    For SELF.fetch tests, auth header must use the key from vitest.config.js: 'test-api-key-for-vitest'.

    ## What NOT to do
    - Do not modify src/auth.js, src/kv.js, or src/capture.js (those are done)
    - Do not implement the actual /v1/captures/{id} retrieval endpoint (Step 5)
    - Do not write evolution log docs
    - Do not implement 405 Method Not Allowed (current 404 behavior is acceptable per api-design-minion)
- **Deliverables**: Updated `src/index.js`, `test/capture-integration.test.js`
- **Success criteria**: All integration tests pass. Route table correctly dispatches. Security headers on all responses. 202 returns absolute statusUrl. KV written before 202 returned.

---

### Task 6: Rate limiting configuration
- **Agent**: edge-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: Task 5
- **Approval gate**: no
- **Prompt**: |
    You are adding rate limiting to the Web Resource Ledger capture endpoint.

    ## Context
    Working directory: /Users/ben/github/benpeter/web-resource-ledger
    Read these files:
    - wrangler.toml -- existing bindings
    - src/index.js -- the handler already has conditional rate limit check code

    ## What to produce

    ### Update wrangler.toml
    Add the rate limiting binding:

    ```toml
    [[ratelimits]]
    binding = "CAPTURE_RATE_LIMITER"
    namespace_id = "1001"

      [ratelimits.simple]
      limit = 10
      period = 60
    ```

    The rate limit check code in src/index.js (Task 5) already handles this binding conditionally -- it checks `if (env.CAPTURE_RATE_LIMITER)` before using it. Adding the binding to wrangler.toml activates it.

    ### Verify the handler code
    Read src/index.js and confirm the rate limit check exists in handleCreateCapture:
    - Uses CF-Connecting-IP as key
    - Returns 429 with Retry-After: 60 on limit exceeded
    - Uses problemResponse(429, ...) for RFC 9457 format

    If the rate limit check is not present in the handler, add it. It should go after auth check and before body parsing.

    ### wrangler.toml R2 bucket
    While editing wrangler.toml, ensure the R2 bucket binding has a bucket_name. The current config has:
    ```toml
    [[r2_buckets]]
    binding = "BUCKET"
    ```
    This needs a bucket_name for deployment. Add:
    ```toml
    [[r2_buckets]]
    binding = "BUCKET"
    bucket_name = "wrl-captures"
    ```
    And add a preview bucket name for local dev:
    ```toml
    [[r2_buckets]]
    binding = "BUCKET"
    bucket_name = "wrl-captures"
    preview_bucket_name = "wrl-captures-preview"
    ```

    ### KV namespace
    Similarly, the KV binding needs a namespace id for deployment:
    ```toml
    [[kv_namespaces]]
    binding = "KV"
    id = "placeholder-create-before-deploy"
    preview_id = "placeholder-create-before-deploy"
    ```
    Use placeholder values -- actual IDs are created via `wrangler kv namespace create` at deploy time. Add a comment noting this.

    ## What NOT to do
    - Do not modify any JS source files (unless rate limit check is missing from handler)
    - Do not write tests for rate limiting (edge-minion confirmed: rate limit binding cannot be tested in vitest pool workers)
    - Do not add queue bindings or Durable Object bindings
- **Deliverables**: Updated `wrangler.toml` with rate limiting, R2 bucket name, KV namespace IDs
- **Success criteria**: wrangler.toml parses correctly. Rate limiting binding configured for 10/min.

---

### Task 7: Evolution log and backlog update
- **Agent**: software-docs-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: Task 5 (needs implementation to be done for decisions.md)
- **Approval gate**: no
- **Prompt**: |
    You are writing the evolution log for Phase 0005 of the Web Resource Ledger project.

    ## Context
    Working directory: /Users/ben/github/benpeter/web-resource-ledger
    Read these files:
    - docs/evolution/README.md -- evolution log index (to add new entry)
    - docs/evolution/0003-url-validation/ -- example of a completed phase for format reference
    - docs/backlog.md -- current backlog to review
    - CLAUDE.md -- evolution log rules (mandatory)
    - openapi.yaml -- what was built (contract)
    - src/index.js -- what was built (handlers)
    - src/capture.js -- what was built (browser rendering)
    - src/auth.js -- what was built (auth)
    - src/kv.js -- what was built (KV)

    ## What to produce

    ### docs/evolution/0005-capture-endpoint/prompt.md
    The task briefing: implementing capture endpoint with browser rendering and KV status tracking per GitHub Issue #3. Include the key requirements from the issue.

    ### docs/evolution/0005-capture-endpoint/decisions.md
    Key decisions made during this phase. Each decision should include:
    - What was decided
    - What alternatives were considered
    - Why this choice was made

    Key decisions to document:
    1. DNS-pinned fetch abandoned due to Workers bare-IP restriction and TLS-SNI mismatch. Used original URL with redirect:'manual' instead.
    2. ctx.waitUntil() chosen over Queue for background processing. 25s navigation timeout to fit within 30s budget. Queue is the documented fallback.
    3. R2 artifact storage in Step 3 (not deferred to Step 4) for step isolation and data loss prevention.
    4. Concurrency limiting skipped for MVP. Platform constraints provide implicit cap.
    5. Contract-first OpenAPI spec created at Step 3 (not deferred to Step 8).
    6. Status response shape: selective exposure from KV value. `error` (not `detail`) for capture failures. `retryable` boolean for UX.
    7. `note` field in 202 response per acceptance criteria, with `Retry-After: 5` header.
    8. 24-hour TTL on pending KV records for self-cleaning stuck captures.
    9. Injectable renderer pattern for browser rendering testability (following validateUrl's resolver injection precedent).
    10. Security response headers centralized in fetch handler (Referrer-Policy, X-Content-Type-Options, Cache-Control on status).

    ### docs/evolution/0005-capture-endpoint/outcome.md
    What was produced:
    - New files: src/auth.js, src/kv.js, src/capture.js, openapi.yaml
    - Modified files: src/index.js (route table, security headers), src/responses.js (415 title), wrangler.toml (rate limiting, R2 bucket, KV IDs), vitest.config.js (CAPTURE_API_KEY binding)
    - New test files: test/auth.test.js, test/kv.test.js, test/capture.test.js, test/capture-integration.test.js
    - Dependency added: @cloudflare/puppeteer

    Include a "Backlog changes" section (see below).

    ### docs/evolution/README.md update
    Add: `| [0005-capture-endpoint](0005-capture-endpoint/) | Capture endpoint with browser rendering (Issue #3) |`

    ### docs/backlog.md review
    Review the current backlog against what Step 3 produced. Changes expected:
    - **Partially addressed**: "Rate limit headers in responses" -- Retry-After on 429 and 202/pending is implemented; X-RateLimit-* headers still deferred. Change tier note to reflect partial implementation.
    - **New items to add**:
      - [should] Queue migration for capture processing -- ctx.waitUntil() has 30s hard limit, Queue gives 15min. Add when captures of slow pages reliably time out. (edge-minion, capture-endpoint)
      - [should] Puppeteer request interception for cross-domain navigation blocking -- defense-in-depth against TOCTOU in browser session. Currently accepted risk. (security-minion, capture-endpoint)
      - [should] Captured HTML XSS prevention -- serving captured HTML as text/html enables XSS. Must serve as text/plain or with Content-Disposition: attachment at retrieval endpoint. (security-minion, capture-endpoint)
      - [consider] Screenshot height cap is 8000px -- pages taller than this produce capped screenshots. May need configurable viewport. (edge-minion, capture-endpoint)
      - [consider] Per-tenant rate limiting -- current rate limit uses CF-Connecting-IP; should switch to tenant ID when per-tenant keys are added. (edge-minion, capture-endpoint)
    - **Existing item updated**: "TOCTOU gap mitigation" -- add note that both browser rendering and header fetch legs have the same gap, to be addressed together.

    Record all changes in outcome.md "Backlog changes" section. If no change for an item, do not mention it.

    ## What NOT to do
    - Do not write process.md (that is written after PR creation by the calling session)
    - Do not modify any source code
    - Do not create any files outside docs/evolution/0005-capture-endpoint/ and docs/backlog.md
- **Deliverables**: `docs/evolution/0005-capture-endpoint/prompt.md`, `decisions.md`, `outcome.md`; updated `docs/evolution/README.md`; updated `docs/backlog.md`
- **Success criteria**: All four files exist. README.md updated. Backlog reviewed with changes documented in outcome.md.

---

### Cross-Cutting Coverage

| Dimension | Coverage | Rationale |
|-----------|----------|-----------|
| **Testing** | Tasks 2, 3, 4, 5 each include test files; Phase 6 runs test suite | Every task produces tests alongside code. test-minion's strategy is embedded in prompts. |
| **Security** | Task 2 (auth), Task 4 (browser isolation, header redaction), Task 5 (security headers), Task 6 (rate limiting) | security-minion's recommendations are woven into every implementation task. |
| **Usability -- Strategy** | ux-strategy-minion's recommendations embedded: note field, Retry-After, error+retryable, captureUrl, id in all status responses | No separate task needed; UX decisions are baked into the API contract (Task 1). |
| **Usability -- Design** | Not applicable | No user-facing UI in this step. API-only. |
| **Documentation** | Task 1 (OpenAPI spec), Task 7 (evolution log + backlog). Phase 8 runs software-docs-minion for any gaps. | Contract-first spec + evolution log + backlog update. |
| **Observability** | Excluded | No production services with logging/metrics/tracing in this step. The Worker is a single function. Structured logging is backlogged as [should] "add when debugging becomes painful." |

---

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - **software-docs-minion**: Plan creates openapi.yaml as a contract-first deliverable and includes evolution log documentation. Docs accuracy review ensures the spec matches implementation intent.
- **Not selected**: ux-design-minion (no UI), accessibility-minion (no UI), sitespeed-minion (no web-facing pages), observability-minion (single Worker function, no multi-service coordination), user-docs-minion (no end-user documentation changes in this step)

---

### Risks and Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| **ctx.waitUntil() 30s hard limit** | HIGH | 25s navigation timeout. Code structured for easy Queue migration. Documented in evolution log. |
| **Browser Rendering TOCTOU gap** | MEDIUM | Accepted for MVP. Both browser and fetch legs have same gap. Backlogged for holistic fix. redirect:'manual' prevents redirect-based exploitation on fetch leg. |
| **Captured HTML as XSS vector** | MEDIUM | Step 5 concern. Documented now in backlog. Must serve with Content-Disposition: attachment or text/plain. |
| **Free plan browser limits (10min/day)** | MEDIUM | Injectable renderer pattern allows testing without real browser. Integration tests use stubs. Real browser tests are optional. |
| **KV eventual consistency** | LOW | KV write is synchronous before 202. Same-colo reads are immediately consistent. Cross-colo lag acceptable for single-operator MVP. |
| **API key in logs** | HIGH if it happens | Auth module never logs or echoes the key. Error messages use static strings. |
| **Large screenshot memory pressure** | LOW-MEDIUM | 8000px height cap. PNG screenshot of 1280x8000 is ~40MB uncompressed, fits within 128MB Worker limit. |

---

### Execution Order

```
Batch 1 (parallel):
  Task 1: OpenAPI spec (api-spec-minion)

  -- APPROVAL GATE: Task 1 (API contract) --

Batch 2 (parallel):
  Task 2: Auth module (edge-minion)
  Task 3: KV helper module (edge-minion)

Batch 3:
  Task 4: Browser rendering capture module (edge-minion)
    depends on: Task 2, Task 3

  -- APPROVAL GATE: Task 4 (core capture architecture) --

Batch 4:
  Task 5: Route handlers + integration tests (edge-minion)
    depends on: Task 4

Batch 5 (parallel):
  Task 6: Rate limiting configuration (edge-minion)
    depends on: Task 5
  Task 7: Evolution log + backlog (software-docs-minion)
    depends on: Task 5
```

---

### Verification Steps

After all tasks complete:
1. `npm test` -- all test files pass (auth, kv, capture, capture-integration, plus existing health/responses/url-validation)
2. `wrangler dev` -- Worker starts without errors
3. Manual smoke test: POST /v1/captures with valid API key and URL returns 202 with expected body
4. Manual smoke test: GET /v1/captures/{id}/status returns status response
5. openapi.yaml is valid (can be checked with any OpenAPI linter)
6. Evolution log directory exists with prompt.md, decisions.md, outcome.md
7. docs/evolution/README.md includes 0005 entry
8. docs/backlog.md has been reviewed and updated
