# Domain Plan Contribution: test-minion

## Recommendations

### 1. Separate Vitest Config for Integration Tests

Create `vitest.integration.config.js` using the same `defineWorkersConfig` from `@cloudflare/vitest-pool-workers/config`. This config must:

- Point at a **different `include` glob**: `test/integration/**/*.test.js` (keeps integration tests physically separated from the 24 existing unit/mock-level tests in `test/`)
- Reuse the same `wrangler.toml` config path so the BROWSER binding, KV, R2, and all vars are available
- **Not activate `fetchMock`** -- integration tests must make real outbound requests (to the local test server and optionally to the DigiCert TSA)
- Use the same key generation for SIGNING_KEY (copy from existing vitest.config.js) so WACZ signing works end-to-end
- Provide `TSA_URL` binding pointing to `http://timestamp.digicert.com` (the real production TSA -- same as wrangler.toml vars)
- Wire up a `globalSetup` file that starts the local test server before the suite and tears it down after

**package.json script:**
```json
"test:integration": "vitest run --config vitest.integration.config.js"
```

This is a clean separation: `npm test` remains fast (mocked, <5s), `npm run test:integration` is slow (real browser, 30-60s) and has external dependencies (Chromium, optional network).

**Critical implementation detail:** The existing vitest.config.js sets `isolatedStorage: false`. The integration config should do the same, since tests share KV/R2 state and do explicit cleanup.

### 2. Local Test Server via globalSetup

The `globalSetup` file (`test/integration/global-setup.js`) runs in Node.js, not the Workers runtime. It should:

1. Start a vanilla `node:http` server on port 0 (OS-assigned random port) serving static HTML fixtures
2. Store the assigned port via vitest's `provide()` mechanism
3. Inject the port into the vitest config so tests can construct URLs like `http://localhost:{port}/fast.html`

**Important consideration about URL validation:** `performCapture()` takes pre-validated URLs (the caller is `handleCreateCapture` which runs `validateUrl` first, but `performCapture` itself accepts any URL string). The integration tests should call `performCapture()` directly, bypassing the HTTP handler and URL validation. This means `localhost` URLs work even though `validateUrl` would block private IPs. This is the correct approach -- we are testing the **capture pipeline**, not the API layer.

**Test server routes (static HTML files):**

| Route | Purpose | Bug class it catches |
|-------|---------|---------------------|
| `/fast.html` | Simple, static HTML. No external resources. Loads in <1s. | Baseline sanity. Validates the full pipeline works at all: browser -> screenshot -> consent scan -> WACZ -> KV/R2 |
| `/never-settle.html` | HTML that spawns infinite XHR/fetch polling (e.g., `setInterval(fetch, 500)`). Simulates ad-heavy pages where `networkidle` never fires. | **#67-class**: catches timeout budget bugs. With the `waitUntil: 'load'` strategy, this page should complete. With `networkidle`, it would hang until timeout. |
| `/cookie-banner.html` | HTML with a simple CMP-style dialog that autoconsent can detect and dismiss. Include a recognizable consent management pattern (e.g., a Cookiebot-style or generic CMP that autoconsent knows). | Validates consent dismissal end-to-end through the real code path. Catches regressions in `dismissCookieConsent()` with a real Playwright page. |
| `/large-page.html` | HTML with many subresources (approaching but not exceeding the 200-subresource limit). | Validates route interception and subresource counting work correctly with real browser traffic. |

**Implementation guidance for the test server:**

The server should use only `node:http` and `node:fs` -- no Express, no framework. Serve pre-written HTML files from a `test/integration/fixtures/` directory. Each fixture is a self-contained HTML file with inline scripts (no external deps that would break when served from localhost).

For the never-settle page, the HTML should include:
```html
<script>
  // Continuous network activity that prevents networkidle
  setInterval(() => fetch('/ping').catch(() => {}), 200);
</script>
```
The server should respond to `/ping` with a 200 to keep the requests flowing.

For the cookie banner page, the approach needs care. Autoconsent detects real CMPs by their DOM signatures. The simplest approach is to include a known CMP's HTML structure that autoconsent's rule set recognizes. Alternatively, if this proves brittle, test only that `consent.status` is `'none'` (no CMP detected on the test page) and rely on the real-URL advisory test to validate actual CMP dismissal. I recommend starting with `status: 'none'` validation and documenting that the real-URL test covers CMP detection. Building a fake CMP that autoconsent recognizes is fragile maintenance.

**Revised cookie-banner recommendation:** Do NOT build a synthetic CMP. Autoconsent rule sets are tightly coupled to specific vendor DOM structures and change frequently. Instead:
- The `/cookie-banner.html` fixture verifies that autoconsent injection executes without errors on a clean page (consent.status === 'none')
- Real CMP dismissal is validated by the advisory real-URL test (see section 5)
- This avoids a permanent maintenance burden of tracking autoconsent rule changes

### 3. Test Scenarios That Catch #66-class and #67-class Bugs

**#66-class (TSA misconfiguration):**

The root cause of #66 was that `requestTimestamp()` in `rfc3161.js` pointed at a wrong TSA URL (Sectigo HTTP instead of DigiCert), the TSA returned an error, and the `try/catch` in `wacz.js` swallowed the failure silently. The capture completed without a timestamp, and `timestampStatus` was `'error'` instead of `'present'`.

Integration test assertion:
```javascript
// When TSA_URL is configured (it is, in the vitest config), a full capture
// of a page that loads successfully MUST produce a WACZ with a timestamp.
const record = await getCapture(env.KV, captureId);
expect(record.wacz).toBeTruthy();
expect(record.wacz.timestampStatus).toBe('present');
```

This test calls `performCapture()` with the real `defaultRenderer` (no injection), which calls `buildWacz()`, which calls `requestTimestamp()` with the configured `TSA_URL`. If the TSA URL is wrong, the request fails, `timestampStatus` becomes `'error'`, and the assertion fails.

**Additional structural assertion:** Unzip the WACZ from R2, parse `datapackage-digest.json`, and assert that `signedData.signatures` contains an entry with `type: 'rfc3161'`. This catches the case where timestamping succeeds but the token is not embedded correctly.

**#67-class (timeout budget):**

The root cause of #67 was using `waitUntil: 'networkidle'` on the `page.goto()` call. Pages with persistent connections (ads, analytics) never reach networkidle, so the 20s navigation timeout always fires, forcing every such page into the partial capture path.

Integration test for the never-settle page:
```javascript
// The never-settle page has continuous network activity but its 'load' event
// fires promptly. With the correct 'load' strategy, this should produce a
// full capture (not partial). With 'networkidle', it would timeout.
const record = await getCapture(env.KV, captureId);
expect(record.renderQuality).toBe('full');
expect(record.render?.timedOut).toBe(false);
```

**Timeout budget validation:**
```javascript
// The total render duration must fit within the 30s ctx.waitUntil budget.
// NAV_TIMEOUT_MS(20s) + SETTLE_DELAY_MS(3s) + CONSENT_TIMEOUT_MS(8s) = 31s worst case.
// For a page that loads quickly (fast.html), total duration should be well under 30s.
expect(record.render.durationMs).toBeLessThan(30000);

// Stage-level timing should be present and reasonable
expect(record.render.stages.navigationMs).toBeDefined();
expect(record.render.stages.settleMs).toBeDefined();
expect(record.render.stages.consentMs).toBeDefined();
```

### 4. Boundary Between Unit Tests and Integration Tests

The boundary should be clean and explicit:

| Concern | Unit tests (`npm test`) | Integration tests (`npm run test:integration`) |
|---------|------------------------|------------------------------------------------|
| Renderer | Mocked (`stubRenderer`, `partialRenderer`, etc.) | Real `defaultRenderer()` with browser binding |
| Network | `fetchMock.disableNetConnect()` | Real HTTP (local test server, optionally TSA) |
| Browser | Never launched | Real Chromium via miniflare browser binding |
| Speed | <5s total | 30-90s total |
| CI | Must pass, blocks merge | Must pass (local fixtures), advisory (real URL) |
| What it validates | API routing, auth, KV/R2 logic, WACZ assembly, signing, error handling, response shapes | Real capture pipeline: browser navigation, screenshot, consent injection, WACZ with timestamp, timeout budget |

**What NOT to re-test in integration tests:**
- HTTP API routing (already covered by `capture-integration.test.js`)
- Auth and rate limiting (already covered)
- KV/R2 CRUD operations (already covered)
- Error categorization (already covered in `capture.test.js`)
- WACZ internal structure and signing (already covered in `wacz.test.js`, `verify.test.js`)
- URL validation (already covered in `url-validation.test.js`)

**What integration tests add that unit tests cannot:**
- Proof that `defaultRenderer()` actually works (not just its interface contract)
- Proof that Playwright's `page.goto()` with `waitUntil: 'load'` handles real pages correctly
- Proof that autoconsent injection runs without errors on a real page
- Proof that TSA timestamping works end-to-end with a real HTTP POST to DigiCert
- Proof that the timeout budget fits within 30s for normal pages

### 5. Advisory Real-URL Test (Allowed-to-Fail)

The real-URL test captures an actual public website to validate the full pipeline against the wild internet. This test is fundamentally different from local fixture tests:

**Target:** `https://example.com` -- IANA-controlled, guaranteed stable, no consent banner, fast loading. Alternatives: `https://www.w3.org/` or `https://httpbin.org/html`. Avoid anything with dynamic content, A/B tests, or geo-blocking.

**Why it must be allowed-to-fail:**
- Network outages (CI runner has no internet, DNS failure, target site down)
- Rate limiting by the target site
- Browser rendering quota limits on Cloudflare
- Timeouts in slow CI environments

**Implementation pattern using vitest's `todo` or custom skip logic:**
```javascript
describe('real URL capture (advisory)', () => {
  it.skipIf(!canReachNetwork())('captures example.com end-to-end', async () => {
    // ... test body
  });
});
```

However, vitest-pool-workers runs in the Workers runtime where network probing is awkward. A simpler approach:

```javascript
describe('real URL capture (advisory)', () => {
  it('captures a stable public URL end-to-end', async () => {
    try {
      // performCapture with real renderer against real URL
      await performCapture(env, 'https://example.com', '93.184.216.34', captureId, 'default');
      const record = await getCapture(env.KV, captureId);
      // If we got here, validate the result
      expect(record.status).toBe('complete');
      expect(record.renderQuality).toBe('full');
    } catch (err) {
      // Network failure is acceptable -- log and skip
      console.warn('Advisory test skipped: network unavailable -', err.message);
    }
  });
});
```

**Better approach: use a separate test file and CI configuration.**
Put the real-URL test in `test/integration/advisory.test.js`. In CI, run it separately and allow the step to fail:

```yaml
- name: Integration tests (advisory - real URL)
  run: npx vitest run --config vitest.integration.config.js test/integration/advisory.test.js
  continue-on-error: true
```

This keeps the advisory test visible in CI output but non-blocking.

**TSA validation in the advisory test:** If the real-URL capture succeeds and `TSA_URL` is configured, assert `timestampStatus === 'present'`. This catches #66-class bugs against the real production TSA.

### 6. Test File Organization

```
test/integration/
  global-setup.js          # Starts/stops local HTTP test server (runs in Node.js)
  fixtures/
    fast.html              # Simple static page
    never-settle.html      # Continuous network activity (polling)
    cookie-banner.html     # Clean page for consent injection test (no real CMP)
    large-page.html        # Many subresources (optional stretch goal)
  capture-pipeline.test.js # Core integration tests (local fixtures)
  advisory.test.js         # Real-URL test (allowed-to-fail)
```

### 7. Test Execution and Cleanup

Each integration test must:
1. Generate a unique `captureId` (use `crypto.randomUUID()` pattern from the production code)
2. Call `createCapture()` in KV first (mirrors the real flow where KV pending record exists before `performCapture` runs)
3. Call `performCapture(env, url, ip, captureId, tenantId)` with **no renderer argument** (uses `defaultRenderer` by default)
4. Wait for the promise to resolve (in tests, we await directly; in production, it runs in `ctx.waitUntil`)
5. Read back the KV record and R2 artifacts to validate results
6. Clean up KV and R2 in `afterEach` (same pattern as existing tests)

**Timeouts:** Individual tests that involve real browser navigation should have generous vitest-level timeouts. Set `testTimeout: 60000` (60s) in the integration config. The fast.html test should complete in <15s; the never-settle test should complete in <30s (it loads quickly with `waitUntil: 'load'`).

### 8. Vitest Integration Config Structure

```javascript
// vitest.integration.config.js
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';
import { generateKeyPairSync } from 'node:crypto';

const { privateKey: _testPrivateKey } = generateKeyPairSync('ed25519');
const testSigningKey = _testPrivateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');

export default defineWorkersConfig({
  test: {
    include: ['test/integration/**/*.test.js'],
    testTimeout: 60000,
    hookTimeout: 30000,
    globalSetup: ['./test/integration/global-setup.js'],
    poolOptions: {
      workers: {
        wrangler: {
          configPath: './wrangler.toml',
        },
        miniflare: {
          browserRendering: { binding: 'BROWSER' },
          bindings: {
            CAPTURE_API_KEY: 'test-api-key-for-vitest',
            SIGNING_KEY: testSigningKey,
            CORS_ORIGINS: '',
            IP_HASH_SEED: 'test-ip-hash-seed-for-vitest',
            TSA_URL: 'http://timestamp.digicert.com',
          },
          isolatedStorage: false,
        },
      },
    },
  },
});
```

**Note on `globalSetup` and `provide()`:** The global setup starts the HTTP server and uses `provide('testServerPort', port)` to make the port available. In the vitest config, `inject('testServerPort')` can be used -- but this only works in test files, not in the config itself. Since the test server URL is constructed in the test files (not the config), this is fine. Tests import `inject` from `vitest` and build the URL dynamically.

**Alternative if `provide/inject` does not work well in Workers pool:** Use an environment variable. The global setup writes the port to `process.env.TEST_SERVER_PORT`, and the config injects it as a miniflare binding. Tests read it from `env.TEST_SERVER_PORT`. This is simpler and more reliable.

## Proposed Tasks

### Task 1: Local Test Server and Fixtures
**Deliverables:**
- `test/integration/global-setup.js` -- Node.js HTTP server lifecycle
- `test/integration/fixtures/fast.html` -- simple static page
- `test/integration/fixtures/never-settle.html` -- infinite polling page
- `test/integration/fixtures/cookie-banner.html` -- clean page for consent test

**Dependencies:** None (pure infrastructure)
**Estimate:** Small

### Task 2: Vitest Integration Config
**Deliverables:**
- `vitest.integration.config.js` -- separate config with `globalSetup`, generous timeouts, `browserRendering` binding, real `TSA_URL`
- `package.json` update: add `"test:integration"` script

**Dependencies:** Task 1 (needs globalSetup file to exist)
**Estimate:** Small

### Task 3: Core Integration Tests (Local Fixtures)
**Deliverables:**
- `test/integration/capture-pipeline.test.js` with tests:
  - Fast page: full capture, screenshot exists, WACZ signed, timestamp present, renderQuality='full'
  - Never-settle page: full capture (not partial), timedOut=false, validates #67-class fix
  - Cookie-banner page: consent.status is 'none' (no CMP on test page), pipeline completes cleanly
  - Timing budget: render.durationMs < 30000, stage timing fields present

**Dependencies:** Tasks 1 and 2
**Estimate:** Medium (browser tests require debugging)

### Task 4: Advisory Real-URL Test
**Deliverables:**
- `test/integration/advisory.test.js` with allowed-to-fail test capturing `https://example.com`
- Asserts complete capture with WACZ and timestamp when network available

**Dependencies:** Tasks 1 and 2
**Estimate:** Small

### Task 5: CI Integration
**Deliverables:**
- `.github/workflows/ci.yml` updated with separate `test:integration` job
- Job has appropriate timeout (15 minutes), runs after unit tests
- Advisory test step uses `continue-on-error: true`

**Dependencies:** Tasks 2-4 (tests must exist to run in CI)
**Estimate:** Small

## Risks and Concerns

### Risk 1: Miniflare Browser Binding Availability
**Severity:** High (blocking)
**Detail:** The existing `vitest.config.js` declares `browserRendering: { binding: 'BROWSER' }` in miniflare options. The existing unit tests never actually call `defaultRenderer()` (they always inject mock renderers), so we have no evidence that this binding works locally. Miniflare started supporting local browser rendering around mid-2025 (Chromium downloads), but there may be version-specific issues with `@cloudflare/vitest-pool-workers@0.12.21` and `wrangler@4.73.0`.
**Mitigation:** First task should be a "hello world" test that just calls `defaultRenderer()` on a data URL or the simplest possible page. If the binding doesn't work, the entire integration test approach needs to fall back to `wrangler dev` + an external test runner (a fundamentally different architecture). Validate this assumption before building anything else.

### Risk 2: Chromium Download in CI
**Severity:** Medium
**Detail:** Local browser rendering requires a Chromium binary. On developer machines, `wrangler dev` handles this. In CI (ubuntu-latest), the Chromium binary may need to be downloaded during `npm ci` or a separate step. This adds time and potential flakiness. The `@cloudflare/playwright` package may or may not bundle Chromium download logic (like `playwright install chromium` does for standard Playwright).
**Mitigation:** Check whether `npm ci` handles browser installation. If not, add explicit `npx playwright install chromium` or equivalent Cloudflare-specific setup step. Cache the browser binary using `actions/cache`.

### Risk 3: Test Server Port Accessibility from Browser
**Severity:** Medium
**Detail:** The miniflare-spawned Chromium process needs to reach `http://localhost:{port}` where the test server runs. In most setups this works, but containerized CI environments or network namespacing could prevent it. The Workers runtime running in workerd also needs to be able to reach the browser process for CDP communication.
**Mitigation:** Use `127.0.0.1` explicitly (not `localhost` which may resolve to IPv6 `::1` in some environments). Test in CI early.

### Risk 4: TSA Rate Limiting / Availability
**Severity:** Low
**Detail:** DigiCert's TSA at `http://timestamp.digicert.com` is a free public service. Running integration tests frequently (every PR, local development) sends real timestamp requests. DigiCert may rate limit or block automated requests.
**Mitigation:** The TSA test is part of the core integration suite (not advisory), but it should handle transient TSA failures gracefully. If the TSA is unreachable, the test should fail clearly (not silently degrade). Consider whether TSA tests should only run in CI, not locally, to reduce request volume. Alternatively, accept `timestampStatus: 'error'` as a network-class failure and only assert `'present'` in CI where connectivity is reliable.

### Risk 5: Test Duration
**Severity:** Low
**Detail:** Each browser capture involves: session acquisition, context creation, navigation, 3s settle delay, consent scan (up to 8s timeout on no-CMP pages), screenshot, WACZ building with TSA request. Even for fast pages, expect 10-15s per test. With 4-5 tests, the suite will take 60-90s.
**Mitigation:** This is acceptable for integration tests. The separate `test:integration` script and CI job prevent this from slowing down the fast unit test feedback loop. Avoid adding unnecessary tests -- each integration test should justify its browser cost.

### Risk 6: URL Validation Bypass
**Severity:** None (by design)
**Detail:** Integration tests call `performCapture()` directly, bypassing URL validation. This means `localhost` URLs work even though `validateUrl()` rejects private IPs. This is intentional -- we are testing the capture pipeline, not the API routing layer. URL validation is thoroughly tested in `url-validation.test.js`.
**Note:** Document this design decision in the test file comments so future contributors understand why localhost URLs are used despite the private-IP restriction.

### Risk 7: Flaky Consent Detection
**Severity:** Low
**Detail:** The recommendation to NOT build a synthetic CMP means the cookie-banner test only verifies that autoconsent injection runs without errors. It does not validate actual CMP detection and dismissal. Real CMP dismissal is only tested by the advisory real-URL test (which is allowed to fail).
**Mitigation:** This is a deliberate trade-off. A fake CMP would require tracking autoconsent rule changes across versions. The real-URL advisory test provides the CMP coverage. If CMP dismissal is critical enough to warrant deterministic testing, consider adding a fixture that uses the `__tcfapi` API (IAB TCF) which autoconsent has stable support for -- but evaluate maintenance cost first.

## Additional Agents Needed

None. The two agents selected (test-minion for test architecture, iac-minion for CI integration) cover all the necessary expertise. The implementation is entirely test infrastructure -- no production code changes, no security boundary changes, no API design decisions.
