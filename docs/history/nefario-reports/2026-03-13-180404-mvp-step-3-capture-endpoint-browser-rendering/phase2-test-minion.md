# Domain Plan Contribution: test-minion

## Recommendations

### Question 1: Does `@cloudflare/vitest-pool-workers` provide a mock browser binding?

**No. The miniflare browser rendering plugin launches a real headless browser,
not a mock. Browser interactions must be injectable.**

I inspected the installed `miniflare` package (v included in `wrangler` 4.73.0).
The `browser-rendering` plugin at
`node_modules/miniflare/dist/src/plugins/browser-rendering/index.ts` downloads
a real Chrome binary (via Puppeteer's browser installer), launches it, and
proxies WebSocket connections through a Durable Object (`BrowserSession`).
The `browserRendering: { binding: 'BROWSER' }` key in `vitest.config.js`
does not provide a stub or mock -- it configures a real browser binding
backed by a real browser process.

This means:

1. **Tests that exercise `env.BROWSER` (Puppeteer `launch`, `newPage`,
   `screenshot`, `content`) will require a Chrome installation**, adding
   ~200MB+ disk footprint and 5-30s per test. These are slow, environment-
   dependent, and unsuitable for the fast-feedback unit test layer.

2. **The vitest config key that already exists is not wrong -- it is premature.**
   It will become useful if we add optional integration tests that exercise
   the real browser path. But the primary test suite must not depend on it.

3. **The code architecture must make browser interactions injectable.**
   The existing codebase already demonstrates this pattern well: `validateUrl`
   accepts an injectable resolver object (`{ resolve4, resolve6 }`) with a
   default that uses real `dns.promises`. The browser rendering module should
   follow the same pattern -- accept a `browser` parameter (or a rendering
   function) with a default that uses `env.BROWSER`, and inject a stub in
   tests.

**Recommended injection interface:**

```js
// src/capture.js (or similar)
export async function performCapture(url, browser, kv, captureId) {
  // browser is the Puppeteer browser instance (from env.BROWSER)
  // In tests, browser is a stub that returns canned screenshot/HTML
}
```

Or, if the rendering logic is complex enough to warrant it, extract a
`renderPage(browser, url, options)` function that can be stubbed:

```js
// Default: real Puppeteer flow
async function renderPage(browser, url, { timeout, viewport }) {
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle0', timeout });
    const screenshot = await page.screenshot({ fullPage: true });
    const html = await page.content();
    return { screenshot, html };
  } finally {
    await page.close();
  }
}
```

Tests inject a stub `renderPage` that returns `{ screenshot: <Buffer>, html: '<html>...' }`
without launching a browser. The boundary under test is then the orchestration
logic (auth check -> validate URL -> render -> write KV -> update status),
not the Puppeteer API calls themselves.

**Do not mock the KV binding.** The `@cloudflare/vitest-pool-workers` test
runner provides a real in-memory KV implementation that is fast and accurate.
Mocking KV would test the mock, not the system. Use `env.KV` directly in
integration tests -- the vitest pool workers environment handles isolation.

### Question 2: Right decomposition between unit and integration tests

The capture pipeline has five testable boundaries. Here is the recommended
decomposition, following the existing project patterns:

#### Unit tests (direct imports, no `SELF.fetch()`)

These test pure functions and modules in isolation, the same way
`test/responses.test.js` and `test/url-validation.test.js` work.

| Module | What to test | Mocking strategy |
|--------|-------------|------------------|
| `src/auth.js` (new) | Bearer token extraction, timing-safe comparison, missing/malformed/wrong key, missing env var -> 503 | Pass `env` object with `CAPTURE_API_KEY` set to test values. No mocks needed -- `crypto.subtle.timingSafeEqual` works in the vitest worker runtime. |
| `src/capture.js` (new) | Capture orchestration: calls validate, calls render, writes KV status transitions, handles errors | Inject a stub `renderPage` function. Use real `env.KV` (provided by vitest pool). Inject a stub DNS resolver (same pattern as url-validation). |
| `src/url-validation.js` | Already fully tested | Already uses injectable resolvers |
| `src/responses.js` | Already fully tested; add 415 title | Existing tests sufficient |
| Capture ID generation | Format matches `/^cap_[a-f0-9]{32}$/`, uses `crypto.randomUUID()` | Pure function, no mocks |
| Capture ID validation | Status endpoint rejects malformed IDs before KV lookup | Pure function, no mocks |

#### Integration tests (`SELF.fetch()` through the Worker)

These test the full HTTP request/response cycle, the same way
`test/health.test.js` works.

| Scenario | What to verify |
|----------|---------------|
| POST /v1/captures happy path | 202 status, response body shape (`id`, `statusUrl`, `note`), `Retry-After` header, `Content-Type`, capture ID format |
| POST /v1/captures auth failures | Missing auth header -> 401 + `WWW-Authenticate`, wrong key -> 401, malformed Bearer -> 401 |
| POST /v1/captures body validation | Missing body -> 400, invalid JSON -> 400, missing `url` field -> 400, wrong type -> 400, bad Content-Type -> 415 |
| POST /v1/captures URL validation failures | Private IP -> 422, bad scheme -> 400 (delegates to existing `validateUrl` but through full stack) |
| GET /v1/captures/{id}/status happy path | Returns 200 with `{ id, status }` for each state |
| GET /v1/captures/{id}/status unknown ID | 404 with RFC 9457 shape |
| GET /v1/captures/{id}/status malformed ID | 404 without KV lookup (same response as unknown -- no oracle) |
| Method dispatch | GET /v1/captures -> 404 or 405, POST /v1/captures/{id}/status -> 404 or 405 |

**Critical: integration tests must stub the browser rendering, not skip it.**
The `SELF.fetch()` call goes through the Worker's fetch handler, which will
trigger `ctx.waitUntil()` with the background capture work. If the browser
binding is not available (no Chrome installed), the test will fail in the
background task, and the capture status will transition to `failed` instead
of `complete`. This is actually testable and useful -- we can verify the
failure path -- but to test the success path we need the capture module to
accept an injectable renderer.

**Recommended approach for integration tests:** Wire the Worker's capture
module to use a stub renderer in test mode. Two options:

1. **Environment variable switch:** Check `env.TEST_MODE` and use a stub
   renderer. Simple but mixes test concerns into production code. Not
   recommended.

2. **Module-level injection (preferred):** Export a `setRenderer` function
   or use a module-scoped variable that tests can override before calling
   `SELF.fetch()`. The `cloudflare:test` module provides `env` access in
   tests -- use it to pre-configure the renderer:

   ```js
   // test/capture.test.js
   import { SELF, env } from 'cloudflare:test';
   import { setRenderer } from '../src/capture.js';

   beforeEach(() => {
     setRenderer(async (browser, url, opts) => ({
       screenshot: new Uint8Array([0x89, 0x50, 0x4e, 0x47]), // PNG magic
       html: '<html><body>stubbed</body></html>',
       headers: { 'content-type': 'text/html' },
     }));
   });
   ```

   This keeps production code clean (the default renderer uses the real
   browser binding) and gives tests full control.

#### What NOT to test at this layer

- **Actual Puppeteer API calls against a real browser.** These belong in a
  separate, optional integration test file that runs only when Chrome is
  available (e.g., `test/browser-rendering.integration.test.js` with a
  skip condition). Do not gate CI on browser availability for MVP.

- **Rate limiting behavior.** If platform-level rate limiting is used
  (Cloudflare dashboard/wrangler.toml rules), the Worker never sees the
  rate-limited request in tests. Rate limiting cannot be tested with
  `@cloudflare/vitest-pool-workers`. Document this as a manual verification
  step for deployment.

- **R2 storage.** Out of scope for Step 3 (Step 4).

### Question 3: Testing async `ctx.waitUntil()` and KV status transitions

**The `@cloudflare/vitest-pool-workers` provides `waitOnExecutionContext(ctx)`
for exactly this purpose. But `SELF.fetch()` integration tests handle it
automatically.**

Two testing approaches, depending on test type:

#### Approach A: Unit tests (direct handler call)

When calling the Worker handler directly (bypassing `SELF.fetch()`), you
control the `ExecutionContext`:

```js
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';

it('transitions KV status from pending to complete', async () => {
  const ctx = createExecutionContext();
  const request = new Request('https://example.com/v1/captures', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer test-key',
    },
    body: JSON.stringify({ url: 'https://example.com/' }),
  });

  const response = await worker.fetch(request, env, ctx);
  expect(response.status).toBe(202);
  const { id } = await response.json();

  // Wait for all ctx.waitUntil() promises to settle
  await waitOnExecutionContext(ctx);

  // Now verify KV was updated
  const kvValue = await env.KV.get(`capture:${id}`, 'json');
  expect(kvValue.status).toBe('complete');
});
```

This is the most direct way to test the async transition. The
`waitOnExecutionContext` call blocks until all `waitUntil` promises resolve
or reject, then the test can assert on the final KV state.

#### Approach B: Integration tests (`SELF.fetch()`)

When using `SELF.fetch()`, the test runner automatically waits for
`ctx.waitUntil()` promises before allowing the test to complete. This is
documented in the Cloudflare vitest integration:

> "In integration tests, the lifetime of the execution context is
> automatically extended."

This means a test like:

```js
it('capture completes and status transitions to complete', async () => {
  // Submit capture
  const postResp = await SELF.fetch('https://example.com/v1/captures', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer test-key',
    },
    body: JSON.stringify({ url: 'https://example.com/' }),
  });
  const { id } = await postResp.json();

  // The waitUntil work has completed by the time SELF.fetch() returns
  // (vitest pool workers auto-waits). Poll status:
  const statusResp = await SELF.fetch(
    `https://example.com/v1/captures/${id}/status`
  );
  const status = await statusResp.json();
  expect(status.status).toBe('complete');
});
```

**However:** the auto-wait behavior for `SELF.fetch()` is not guaranteed
across all versions and configurations. The safest approach is to use
Approach A for status transition tests and Approach B for request/response
shape tests.

**Testing the failure path:**

```js
it('KV status transitions to failed when rendering fails', async () => {
  // Configure stub renderer to throw
  setRenderer(async () => { throw new Error('Navigation timeout'); });

  const ctx = createExecutionContext();
  const request = /* POST /v1/captures with valid URL */;
  const response = await worker.fetch(request, env, ctx);
  expect(response.status).toBe(202);
  const { id } = await response.json();

  await waitOnExecutionContext(ctx);

  const kvValue = await env.KV.get(`capture:${id}`, 'json');
  expect(kvValue.status).toBe('failed');
  expect(kvValue.error).toContain('timeout');
});
```

### Question 4: Following existing patterns

**Yes. The existing test pattern split is well-designed and should be
extended.**

| Existing pattern | How to extend for capture |
|-----------------|--------------------------|
| `test/health.test.js` -- `SELF.fetch()` for integration | `test/capture.test.js` -- `SELF.fetch()` for POST /v1/captures and GET /v1/captures/{id}/status request/response cycle |
| `test/responses.test.js` -- direct imports for unit | `test/auth.test.js` -- direct import `verifyApiKey` for auth logic unit tests |
| `test/url-validation.test.js` -- direct imports with injectable deps | `test/capture-logic.test.js` -- direct import capture orchestration with injectable renderer and KV |

**File organization recommendation:**

```
test/
  auth.test.js              # Unit: verifyApiKey function
  capture.test.js           # Integration: SELF.fetch() for POST/GET endpoints
  capture-logic.test.js     # Unit: capture orchestration with stubs
  health.test.js            # (existing)
  responses.test.js         # (existing)
  url-validation.test.js    # (existing)
```

**Convention observations from existing tests:**

- Use `describe` blocks grouped by endpoint or function
- Use `it.each` for parametric cases (url-validation does this extensively)
- Name tests descriptively: `'returns 200 with status ok'`, not `'works'`
- RFC 9457 shape assertions are a pattern: check `type`, `status`, `title`, `detail`
- No setup/teardown complexity in existing tests -- keep it minimal
- Import from `cloudflare:test` for `SELF`, `env`
- Import from `vitest` for `describe`, `it`, `expect`

**New conventions needed:**

- `beforeEach` for setting up the stub renderer (new pattern, necessary)
- `afterEach` for resetting the renderer to default (cleanup)
- Access to `env.KV` for verifying status transitions (new pattern, supported
  by vitest pool workers)
- Access to `env.CAPTURE_API_KEY` for auth tests (set via `miniflare` config
  in `vitest.config.js` or via test-level `env` manipulation)

### Additional Recommendation: vitest.config.js updates

The vitest config needs updates to support the new test requirements:

```js
// vitest.config.js
export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: {
          configPath: './wrangler.toml',
        },
        miniflare: {
          browserRendering: { binding: 'BROWSER' },
          bindings: {
            CAPTURE_API_KEY: 'test-api-key-for-vitest',
          },
        },
      },
    },
  },
});
```

The `CAPTURE_API_KEY` binding must be available in the test environment.
Setting it via `miniflare.bindings` ensures it is available to both unit
tests (via `env.CAPTURE_API_KEY`) and integration tests (via the Worker's
`env`). Use a known test value so auth tests can assert against it.

KV is already bound in `wrangler.toml` and should be available in the test
environment automatically. The vitest pool workers integration creates an
isolated, in-memory KV namespace for each test file by default.

## Proposed Tasks

### Task T1: Extract browser rendering into an injectable module

**What:** Create `src/capture.js` (or `src/render.js`) with the browser
rendering logic extracted into a function that accepts a renderer parameter.
Provide a default renderer that uses the real Puppeteer/`env.BROWSER` binding.
Export a `setRenderer` function (or accept the renderer as a parameter) so
tests can inject a stub.

**Deliverables:**
- `src/capture.js` with injectable renderer
- Default renderer that uses `env.BROWSER` Puppeteer API
- `setRenderer()` or parameter-based injection for tests
- Follows the same injectable-dependency pattern as `validateUrl`'s resolver

**Dependencies:** Depends on the edge-minion's guidance on the correct
Puppeteer API sequence for Cloudflare Browser Rendering. The test architecture
does not depend on the specific API calls, only on the interface boundary.

### Task T2: Auth module unit tests

**What:** Write `test/auth.test.js` testing the `verifyApiKey` function
directly (not through `SELF.fetch()`). Cover all auth failure modes.

**Deliverables:**
- `test/auth.test.js`
- Test cases:
  - Correct key -> accepted (result.ok === true)
  - Wrong key -> rejected (status 401)
  - Missing Authorization header -> rejected (status 401)
  - Malformed header (not Bearer scheme) -> rejected (status 401)
  - Empty token (Bearer with no key) -> rejected (status 401)
  - Missing `CAPTURE_API_KEY` env var -> rejected (status 503)
  - Key with trailing whitespace -> rejected (exact match required)
- Verify response includes `WWW-Authenticate: Bearer` header on 401s
- Verify error responses never contain the provided key value

**Dependencies:** Task S1 (security-minion: auth module implementation)

### Task T3: Capture endpoint integration tests

**What:** Write `test/capture.test.js` using `SELF.fetch()` for full HTTP
integration testing of `POST /v1/captures` and `GET /v1/captures/{id}/status`.

**Deliverables:**
- `test/capture.test.js`
- POST /v1/captures test cases:
  - Happy path: 202, response body has `id` (matches `/^cap_[a-f0-9]{32}$/`),
    `statusUrl` (absolute URL), and `note` field. `Retry-After` header present.
    Content-Type is `application/json`.
  - Auth failures: all three 401 variants (missing, malformed, wrong key)
  - Body validation: missing body -> 400, invalid JSON -> 400, missing url ->
    400, url not string -> 400, missing Content-Type -> 415
  - URL validation passthrough: private IP -> 422, bad scheme -> 400
    (verify RFC 9457 shape on all errors)
  - Security headers on response: `Referrer-Policy`, `X-Content-Type-Options`
- GET /v1/captures/{id}/status test cases:
  - Known pending capture -> 200 with `{ id, status: "pending" }`
  - Known complete capture -> 200 with `{ id, status: "complete", captureUrl }`
  - Known failed capture -> 200 with `{ id, status: "failed", error, retryable }`
  - Unknown ID -> 404 with RFC 9457 shape
  - Malformed ID -> 404 (same response as unknown -- no format oracle)
  - No auth required on status endpoint (per "ID is the secret" model)
  - `Cache-Control: private, no-store` header present

**Dependencies:** Task T1 (injectable renderer for happy path tests),
vitest config update for `CAPTURE_API_KEY`.

### Task T4: Capture orchestration unit tests

**What:** Write `test/capture-logic.test.js` testing the capture orchestration
function directly. Use a stub renderer and real in-memory KV to verify the
full lifecycle without HTTP layer.

**Deliverables:**
- `test/capture-logic.test.js`
- Test cases:
  - Successful capture: renderer returns screenshot + HTML -> KV status
    transitions to complete
  - Failed capture: renderer throws -> KV status transitions to failed with
    error detail
  - Renderer timeout: simulated timeout -> status is failed, error message
    is user-safe (no stack traces)
  - KV is written with pending status before rendering starts
  - Capture ID generation: format matches expected pattern
  - Error detail in KV never contains stack traces or internal state
  - Context destruction: verify renderer cleanup runs even on failure
    (test that the stub's cleanup was called)

**Dependencies:** Task T1 (injectable renderer module)

### Task T5: Update vitest.config.js for capture test environment

**What:** Add `CAPTURE_API_KEY` binding to the miniflare test configuration
so auth tests have a known API key to test against.

**Deliverables:**
- Updated `vitest.config.js` with `bindings: { CAPTURE_API_KEY: 'test-api-key-for-vitest' }`
- Verified that `env.KV` is available in tests (should be automatic from
  wrangler.toml, but verify)
- Document in a test file comment that the test API key is intentionally
  committed (it has no production value)

**Dependencies:** None. Can start immediately.

### Task T6: KV status transition end-to-end test

**What:** Write a test that exercises the full async lifecycle: POST capture,
wait for `ctx.waitUntil()` to settle, verify KV status transitioned, then
poll the status endpoint and verify the response matches the KV state.

**Deliverables:**
- Test in `test/capture-logic.test.js` (unit) or `test/capture.test.js`
  (integration) -- likely both, testing different aspects
- Uses `createExecutionContext()` + `waitOnExecutionContext()` for the unit
  test variant
- Verifies: pending status written immediately, complete/failed status
  written after waitUntil settles, status endpoint reads match KV state
- Tests both success and failure paths

**Dependencies:** Tasks T1, T3, T4

## Risks and Concerns

### Risk 1: Browser binding in vitest config may cause test failures (MEDIUM)

The `browserRendering: { binding: 'BROWSER' }` key in `vitest.config.js`
may cause miniflare to attempt browser download/launch during test suite
initialization, even if no test exercises the browser binding. This could
cause:

- Test failures in CI environments without Chrome
- Slow test startup (browser download)
- Flaky tests if browser launch times out

**Mitigation:** If the browser binding causes initialization issues when no
test uses it, remove `browserRendering` from vitest.config.js for now. The
binding exists in `wrangler.toml` and will be picked up automatically when
(and if) browser integration tests are added. Alternatively, gate browser
tests in a separate vitest config:

```
vitest.config.js           # Standard tests, no browser binding
vitest.browser.config.js   # Browser integration tests, browser binding
```

Run only the standard config in CI. Run the browser config manually or in
a dedicated CI step with Chrome pre-installed.

**Verification step:** Run `vitest run` in the current repo right now to
confirm whether the existing `browserRendering` config key causes any issues.
If it does, fix it as Task T5 prerequisite.

### Risk 2: `SELF.fetch()` and `ctx.waitUntil()` timing in integration tests (MEDIUM)

The behavior of `SELF.fetch()` with respect to `ctx.waitUntil()` promises
is not fully documented. In some versions of `@cloudflare/vitest-pool-workers`,
`SELF.fetch()` returns as soon as the Response is available but the
`waitUntil` work may still be in flight. This would cause status transition
tests to see `pending` instead of `complete`.

**Mitigation:** For status transition assertions, prefer the direct handler
call pattern with `createExecutionContext()` + `waitOnExecutionContext()`.
Use `SELF.fetch()` only for request/response shape assertions where the
background work is irrelevant.

### Risk 3: Test isolation for KV state between tests (LOW)

If multiple tests write to the same KV namespace with the same key,
inter-test pollution could cause flaky failures. The vitest pool workers
integration provides isolated storage per test file by default, but tests
within the same file share KV state.

**Mitigation:** Each test generates a unique capture ID (via the real
`crypto.randomUUID()` in the handler), so KV key collisions are effectively
impossible. No additional isolation needed. But verify that KV isolation
works as expected in practice -- add a test that writes to KV, then reads
in a subsequent test to confirm isolation boundaries.

### Risk 4: Testing the `fetch` call for HTTP headers (LOW-MEDIUM)

The security-minion recommends a separate Workers `fetch` call to capture
HTTP response headers. This fetch goes to an external URL. In tests, this
fetch will either:

(a) Hit a real server (slow, non-deterministic, requires network)
(b) Need to be mocked via `fetchMock` from `cloudflare:test`

**Mitigation:** Use the `fetchMock` API from `cloudflare:test` (backed by
undici `MockAgent`). This is the Cloudflare-sanctioned approach for mocking
outbound fetch in tests. Configure it in `beforeEach` to intercept the
header-fetch call and return canned response headers.

```js
import { fetchMock } from 'cloudflare:test';

beforeEach(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
  const pool = fetchMock.get('https://example.com');
  pool.intercept({ path: '/' }).reply(200, 'OK', {
    headers: { 'X-Custom': 'value', 'Content-Type': 'text/html' },
  });
});

afterEach(() => {
  fetchMock.assertNoPendingInterceptors();
  fetchMock.deactivate();
});
```

### Risk 5: Test suite speed regression (LOW)

Adding capture tests with KV operations, stub rendering, and auth checks
should not significantly slow the test suite. The current suite (3 test
files) runs in under 2 seconds. Adding 3 more test files with ~30 total
test cases should keep the suite under 5 seconds. But watch for:

- Tests that accidentally trigger real browser launch
- Tests that accidentally make real network requests
- Excessive `beforeEach` setup per test

**Mitigation:** Run `vitest run` with `--reporter=verbose` during
development to monitor per-test duration. Flag any test over 500ms as
suspicious.

## Additional Agents Needed

None. The current team is sufficient for test planning. The test architecture
depends on decisions from:

- **edge-minion** -- for the Puppeteer API sequence and Cloudflare-specific
  constraints (determines the renderer interface boundary)
- **api-design-minion** -- for finalized response shapes (determines assertion
  expectations in integration tests) -- already contributed
- **security-minion** -- for auth module design (determines unit test
  expectations) -- already contributed

All three have already provided their contributions. The test strategy is
designed to work with any implementation that follows the injectable-dependency
pattern.
