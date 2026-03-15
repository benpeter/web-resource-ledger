# Phase 3 Synthesis: Browser Session Reuse with Playwright Migration

## Delegation Plan

**Team name**: browser-session-reuse
**Description**: Migrate from Puppeteer to Playwright, implement browser session reuse for 10x capture throughput, and close TOCTOU navigation blocking gaps.

---

### Conflict Resolutions

#### 1. page.route() vs browserContext.route()

**frontend-minion** recommended `page.route()`. **security-minion** recommended `browserContext.route()` because `page.route()` misses the first request of popup windows.

**Resolution: Use browserContext.route().** Security-minion's argument wins. The popup first-request gap is a real attack vector (a malicious page could open a popup to an internal URL, and the first navigation would bypass page-level interception). The route handler is set up on the context before any pages are created, so it covers all requests in all pages within the context. The subresource counting and cross-domain navigation blocking both go on the context route handler.

#### 2. networkidle vs networkidle2 strategy

**frontend-minion** proposed three options. The practical risk is that Playwright's `networkidle` (0 connections for 500ms) is stricter than Puppeteer's `networkidle2` (allows 2 outstanding connections).

**Resolution: Use `waitUntil: 'networkidle'` directly.** Reasoning:
- The `'load'` + 2s settle approach wastes 2 seconds on every fast page -- this directly hurts the throughput target.
- The race pattern adds complexity (KISS violation).
- The project is an archival tool capturing arbitrary URLs. Pages with persistent WebSocket/SSE connections are a minority case. Those pages already have the 25-second timeout as a safety net.
- The Playwright team themselves note that `networkidle` is imperfect but adequate for batch/automation use cases.
- If regressions appear in production, switching to `'load'` + settle is a one-line change. This is easily reversible.

This is a judgment call that should be flagged at the approval gate.

#### 3. Rate limiter scope change

Both **edge-minion** and **ux-strategy-minion** agree `GLOBAL_CAPTURE_LIMITER` at 20/min is the real throughput bottleneck and must be raised. The issue scope says "Out: infrastructure changes." However, changing a rate limit value in `wrangler.toml` is a configuration change, not infrastructure. Without this change, the 10x throughput improvement is unreachable regardless of session reuse.

**Resolution: Include rate limit increase.** Raise `GLOBAL_CAPTURE_LIMITER` from `limit = 20` to `limit = 200` (keeping headroom below the 300/min theoretical max). This is a one-line config change that directly gates the success criteria.

#### 4. Renderer extraction (separate module vs inline)

**test-minion** recommended extracting `defaultRenderer` to `src/renderer.js` for testability. **margo-aligned simplicity principle** says: is this extraction needed now?

**Resolution: Do NOT extract to a separate module.** The `defaultRenderer` function stays in `src/capture.js`. Reasoning:
- The existing DI pattern (`renderer` parameter on `performCapture`) already provides full testability.
- The session acquisition helper (`getOrCreateSession`) belongs in `src/capture.js` as a private function -- it is only used by `defaultRenderer`.
- Creating `src/renderer.js` adds a module boundary, an import, and a new test file for ~80 lines of code. YAGNI.
- If the renderer grows beyond ~150 lines, extraction becomes warranted. Not yet.

The test-minion's `vi.mock('@cloudflare/playwright')` approach for renderer-level tests can still work within a test file that imports from `capture.js` if needed, but the existing `stubRenderer` pattern covers the orchestration contract. Renderer internals (Playwright API calls) are integration concerns tested via the real browser binding, not mocked unit tests.

#### 5. Service Worker disabling

**security-minion** flagged that `page.route()` / `browserContext.route()` do not intercept Service Worker requests and recommended disabling SWs.

**Resolution: Include SW disabling in the implementation.** Playwright supports `serviceWorkers: 'block'` in the context options:
```js
const context = await browser.newContext({ serviceWorkers: 'block', ... });
```
This is a one-line addition that eliminates the SW bypass vector. The Cloudflare Playwright fork is based on Playwright 1.57.0, which supports this option.

---

### Task 1: Migrate src/capture.js from Puppeteer to Playwright with session reuse

- **Agent**: edge-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: yes
- **Gate reason**: This is the core implementation change. It touches the only production file, changes the browser lifecycle model, and every downstream task (tests, backlog, docs) depends on it. Hard to reverse (API contract change from Puppeteer to Playwright), high blast radius.
- **Prompt**: |
    ## Task: Migrate src/capture.js from Puppeteer to Playwright with browser session reuse

    You are implementing the core Playwright migration and session reuse logic in
    `src/capture.js` for the WRL (Web Resource Ledger) project. This is a
    Cloudflare Workers project using Browser Rendering.

    ### What to do

    Rewrite `src/capture.js` to replace `@cloudflare/puppeteer` with
    `@cloudflare/playwright` and implement browser session reuse. Also update
    `package.json` dependencies and `wrangler.toml` rate limits.

    #### 1. Package changes

    In `package.json`:
    - Remove `"@cloudflare/puppeteer": "^1.0.6"` from `dependencies`
    - Add `"@cloudflare/playwright": "^1.1.0"` to `dependencies`

    #### 2. Rate limit change

    In `wrangler.toml`, change the `GLOBAL_CAPTURE_LIMITER` from:
    ```
    simple = { limit = 20, period = 60 }
    ```
    to:
    ```
    simple = { limit = 200, period = 60 }
    ```
    This is necessary because the current 20/min cap makes the 10x throughput
    target unreachable regardless of session reuse.

    #### 3. Import changes in src/capture.js

    Replace:
    ```js
    import puppeteer from '@cloudflare/puppeteer';
    ```
    With:
    ```js
    import { connect, acquire, sessions, limits } from '@cloudflare/playwright';
    ```

    #### 4. Session acquisition helper

    Add a private `getOrCreateSession(browserBinding)` function that implements
    session discovery and reuse:

    ```
    1. Call sessions(browserBinding) to list active sessions
    2. Filter to free sessions (those WITHOUT a connectionId property)
    3. If free sessions exist:
       a. Pick one at RANDOM (not first -- distributes contention)
       b. Try connect(browserBinding, sessionId) in try/catch
       c. On success, return the connected browser
       d. On failure (another worker claimed it), fall through
    4. If no free session or connect failed:
       a. Check limits(browserBinding).allowedBrowserAcquisitions > 0
       b. If allowed: acquire(browserBinding, { keep_alive: KEEP_ALIVE_MS })
          then connect(browserBinding, sessionId)
       c. If not allowed and timeUntilNextAllowedBrowserAcquisition is available:
          wait that duration (capped at 3 seconds to avoid eating ctx.waitUntil budget),
          then retry from step 1 (max 1 retry)
    5. If all attempts fail, throw with a message containing "session pool"
       (this string is matched by categorizeError)
    ```

    Use a `KEEP_ALIVE_MS` constant set to `120000` (2 minutes). This bounds
    orphaned session duration while being generous enough for steady traffic.

    #### 5. Rewrite defaultRenderer

    Replace the current `defaultRenderer` function. The new implementation:

    a. Call `getOrCreateSession(browserBinding)` to get a connected browser.

    b. **Defensive orphan cleanup**: On connect, close any existing contexts:
       ```js
       for (const ctx of browser.contexts()) {
         await ctx.close();
       }
       ```

    c. Create a new context with viewport and service worker blocking:
       ```js
       const context = await browser.newContext({
         viewport: { width: 1280, height: 720 },
         serviceWorkers: 'block',
       });
       ```

    d. Set up request interception and response monitoring on the **context**
       level (not page level). Use `browserContext.route()`:
       ```js
       const targetOrigin = new URL(url).origin;
       let subresourceCount = 0;
       let totalBytes = 0;
       let limitExceeded = null;

       await context.route('**/*', async (route) => {
         // Cross-domain navigation blocking (closes TOCTOU gap)
         if (route.request().isNavigationRequest() &&
             new URL(route.request().url()).origin !== targetOrigin) {
           await route.abort('blockedbyclient');
           return;
         }

         if (limitExceeded) { await route.abort('blockedbyclient'); return; }
         subresourceCount++;
         if (subresourceCount > MAX_SUBRESOURCES) {
           limitExceeded = `Page exceeded ${MAX_SUBRESOURCES} subresource limit`;
           await route.abort('blockedbyclient');
           return;
         }
         await route.continue();
       });
       ```

    e. Set up response monitoring on the page (after page creation):
       ```js
       page.on('response', (resp) => {
         const cl = resp.headers()['content-length'];
         if (cl) totalBytes += parseInt(cl, 10);
         if (totalBytes > MAX_PAGE_BYTES) {
           limitExceeded = 'Page exceeded 50MB size limit';
         }
       });
       ```

    f. Navigate with `waitUntil: 'networkidle'` (Playwright has no `networkidle2`):
       ```js
       await page.goto(url, { timeout: NAV_TIMEOUT_MS, waitUntil: 'networkidle' });
       ```

    g. Cap screenshot height using `page.setViewportSize()` (not `setViewport()`):
       ```js
       const pageHeight = await page.evaluate(() => document.body.scrollHeight);
       if (pageHeight > MAX_PAGE_HEIGHT) {
         await page.setViewportSize({ width: 1280, height: MAX_PAGE_HEIGHT });
       }
       ```

    h. Screenshot and content APIs are identical:
       ```js
       const screenshot = await page.screenshot({ fullPage: true, type: 'png' });
       const html = await page.content();
       ```

    i. **Cleanup in try/finally** -- this is the critical security invariant:
       ```js
       } finally {
         await context.close();  // MUST close context before disconnecting
         await browser.close();  // disconnects (does NOT kill browser) for connect()-obtained sessions
       }
       ```

    **IMPORTANT**: All `route.abort()` and `route.continue()` calls MUST be
    awaited. In Puppeteer these were fire-and-forget; in Playwright they return
    Promises. Missing `await` causes silent request stalls.

    #### 6. Update categorizeError()

    Add new error patterns for Playwright-specific errors and session reuse
    errors. Insert these BEFORE the existing navigation pattern:

    ```js
    function categorizeError(error) {
      const msg = error?.message ?? '';
      const name = error?.name ?? '';

      // Playwright TimeoutError class or timeout substring
      if (name === 'TimeoutError' || msg.includes('timeout') || msg.includes('Timeout')) {
        return { message: 'Page did not finish loading within 25 seconds', retryable: true };
      }
      if (msg.includes(`${MAX_SUBRESOURCES} subresource limit`)) {
        return { message: `Page exceeded ${MAX_SUBRESOURCES} subresource limit`, retryable: false };
      }
      if (msg.includes('50MB size limit')) {
        return { message: 'Page exceeded 50MB size limit', retryable: false };
      }
      // Playwright: page crash or close during navigation
      if (msg.includes('page crashed') || msg.includes('page was closed')) {
        return { message: 'Browser session terminated unexpectedly', retryable: true };
      }
      // Session reuse: stale session or pool exhaustion
      if (msg.includes('browser has been closed') || msg.includes('Target closed') || msg.includes('session pool')) {
        return { message: 'Browser session unavailable. Try again shortly.', retryable: true };
      }
      if (msg.includes('Could not navigate') || msg.includes('net::ERR') || msg.includes('Navigation')) {
        return { message: 'Could not navigate to the target URL', retryable: true };
      }

      return { message: 'Capture could not be completed', retryable: true };
    }
    ```

    #### 7. Update the header comment

    Update the file's header comment to document the session reuse model and
    BrowserContext isolation decision. Add after the existing security
    constraints section:

    ```
     * Session reuse model:
     *   - Browser sessions are reused across captures (acquire/connect pattern)
     *   - Each capture gets a fresh BrowserContext for isolation
     *   - BrowserContext isolates: cookies, localStorage, sessionStorage,
     *     IndexedDB, HTTP cache, permissions, browsing history
     *   - Browser-level shared state (DNS cache, TLS session cache, HTTP/2 pools)
     *     is NOT isolated across contexts -- accepted because:
     *     (1) WRL is single-tenant; no cross-tenant data to leak
     *     (2) Shared state is not observable through capture artifacts
     *     (3) Cloudflare's gVisor VMs provide account-level isolation
     *   - Service Workers are blocked (serviceWorkers: 'block') to prevent
     *     route interception bypass
     *   - context.close() in try/finally is MANDATORY -- without it the next
     *     worker connecting to the session inherits application-layer state
     *   - Revisit isolation model if multi-tenant deployment is implemented
    ```

    ### Constraints

    - Do NOT extract renderer to a separate module. Keep everything in `src/capture.js`.
    - Do NOT add pre-warming, cron triggers, or Durable Object coordination.
    - Do NOT change the `performCapture()` function signature or the renderer
      interface `(browserBinding, url) => Promise<{screenshot, html}>`.
    - The `keep_alive` value should be a constant, not an env var (KISS).
    - Keep the `// tva` marker in the file.
    - Preserve all existing exports (`performCapture`, `captureHeaders`).

    ### Files to modify

    - `src/capture.js` (primary -- all Playwright changes)
    - `package.json` (dependency swap)
    - `wrangler.toml` (rate limit change)

    ### Files to NOT modify

    - `src/index.js` -- no changes needed
    - `test/` -- separate task
    - `docs/` -- separate task

    ### Context

    Current `src/capture.js`:
    - Lines 1-261, contains `performCapture()`, `captureHeaders()`,
      `defaultRenderer()`, `categorizeError()`
    - `defaultRenderer` uses Puppeteer: `puppeteer.launch()`,
      `page.setRequestInterception(true)`, `page.on('request')`,
      `page.setViewport()`, `waitUntil: 'networkidle2'`
    - The `performCapture` function uses DI: `renderer = defaultRenderer`
    - All 17 existing tests use `stubRenderer` and never touch Puppeteer

    Current `wrangler.toml`:
    - `compatibility_date = "2026-03-13"` (satisfies Playwright GA requirement)
    - `compatibility_flags = ["nodejs_compat"]` (required by Playwright)
    - `[browser] binding = "BROWSER"` (Browser Rendering binding)
    - `GLOBAL_CAPTURE_LIMITER` at `limit = 20, period = 60`

    ### Success criteria

    - `@cloudflare/puppeteer` replaced with `@cloudflare/playwright` in all files
    - Session discovery and reuse implemented (sessions/connect/acquire pattern)
    - Cross-domain navigation blocking implemented via context.route()
    - Service Workers blocked via context options
    - context.close() guaranteed in try/finally before browser.close()
    - Defensive orphan context cleanup on connect
    - categorizeError() handles Playwright error patterns
    - Header comment documents BrowserContext isolation threat model
    - GLOBAL_CAPTURE_LIMITER raised to 200/min
    - Renderer interface unchanged: `(browserBinding, url) => Promise<{screenshot, html}>`

- **Deliverables**: Modified `src/capture.js`, `package.json`, `wrangler.toml`
- **Success criteria**: All three files updated, `npm install` runs without error, code compiles without import errors

---

### Task 2: Update tests for Playwright migration

- **Agent**: test-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |
    ## Task: Update tests for Playwright migration and add session-reuse error coverage

    You are updating the test suite for the WRL project after the Puppeteer-to-Playwright
    migration in `src/capture.js`.

    ### What to do

    Modify `test/capture.test.js` to add Playwright-specific error pattern tests
    and verify the miniflare binding still works.

    #### 1. Add Playwright-specific error tests

    Add a new `describe` block after the existing error test blocks:

    ```js
    describe('performCapture -- Playwright-specific errors', () => {
      it('handles Playwright TimeoutError (name-based detection)', async () => {
        const playwrightTimeout = async () => {
          const err = new Error('page.goto: Timeout 25000ms exceeded');
          err.name = 'TimeoutError';
          throw err;
        };
        mockHeaderFetch();
        await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP);
        await performCapture(env, TEST_URL, TEST_IP, TEST_ID, playwrightTimeout);
        const record = await getCapture(env.KV, TEST_ID);
        expect(record.status).toBe('failed');
        expect(record.retryable).toBe(true);
        expect(record.error).toBe('Page did not finish loading within 25 seconds');
      });

      it('handles page crash as retryable', async () => {
        const crashRenderer = async () => {
          throw new Error('page.goto: Navigation failed because page crashed!');
        };
        mockHeaderFetch();
        await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP);
        await performCapture(env, TEST_URL, TEST_IP, TEST_ID, crashRenderer);
        const record = await getCapture(env.KV, TEST_ID);
        expect(record.status).toBe('failed');
        expect(record.retryable).toBe(true);
        expect(record.error).toBe('Browser session terminated unexpectedly');
      });

      it('handles stale session error as retryable', async () => {
        const staleRenderer = async () => {
          throw new Error('browser has been closed');
        };
        mockHeaderFetch();
        await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP);
        await performCapture(env, TEST_URL, TEST_IP, TEST_ID, staleRenderer);
        const record = await getCapture(env.KV, TEST_ID);
        expect(record.status).toBe('failed');
        expect(record.retryable).toBe(true);
        expect(record.error).toBe('Browser session unavailable. Try again shortly.');
      });

      it('handles session pool exhaustion as retryable', async () => {
        const poolExhausted = async () => {
          throw new Error('No available browser session pool capacity');
        };
        mockHeaderFetch();
        await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP);
        await performCapture(env, TEST_URL, TEST_IP, TEST_ID, poolExhausted);
        const record = await getCapture(env.KV, TEST_ID);
        expect(record.status).toBe('failed');
        expect(record.retryable).toBe(true);
        expect(record.error).toBe('Browser session unavailable. Try again shortly.');
      });
    });
    ```

    #### 2. Add concurrent capture orchestration test

    Add a test that verifies two captures running concurrently don't interfere:

    ```js
    describe('performCapture -- concurrent execution', () => {
      it('two captures with different IDs complete independently', async () => {
        const ID_A = 'cap_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
        const ID_B = 'cap_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

        // Need two intercepts for the same origin
        fetchMock
          .get(TEST_ORIGIN)
          .intercept({ path: '/', method: 'GET' })
          .reply(200, 'ok', { headers: { 'content-type': 'text/html' } })
          .times(2);

        await createCapture(env.KV, ID_A, TEST_URL, TEST_IP);
        await createCapture(env.KV, ID_B, TEST_URL, TEST_IP);

        await Promise.all([
          performCapture(env, TEST_URL, TEST_IP, ID_A, stubRenderer),
          performCapture(env, TEST_URL, TEST_IP, ID_B, stubRenderer),
        ]);

        const recordA = await getCapture(env.KV, ID_A);
        const recordB = await getCapture(env.KV, ID_B);
        expect(recordA.status).toBe('complete');
        expect(recordB.status).toBe('complete');
      });
    });
    ```

    #### 3. Verify existing tests still pass

    All 17 existing tests should continue to pass without modification. The
    `stubRenderer` DI pattern means existing tests never import or exercise
    Puppeteer/Playwright directly. Do NOT modify any existing test.

    #### 4. Clean up KV for new test IDs

    Add cleanup for the new test IDs (ID_A, ID_B) in `beforeEach` if needed,
    or scope the cleanup within the test's own setup.

    ### Constraints

    - Do NOT create a new test file (`test/renderer.test.js`). All tests go
      in the existing `test/capture.test.js`.
    - Do NOT use `vi.mock()` to mock `@cloudflare/playwright`. The `stubRenderer`
      DI pattern is the testing strategy.
    - Do NOT modify any existing passing test.
    - The `vitest.config.js` file should NOT need changes -- the
      `browserRendering` binding config provides `env.BROWSER` as a placeholder,
      and tests never use it directly.

    ### Files to modify

    - `test/capture.test.js` (add new test blocks)

    ### Files to NOT modify

    - `vitest.config.js` -- leave as-is
    - `src/capture.js` -- already modified in Task 1

    ### Context

    Current test file has 17 tests organized in these describe blocks:
    - `performCapture -- successful capture` (4 tests)
    - `performCapture -- renderer failure: timeout` (3 tests)
    - `performCapture -- renderer failure: subresource limit` (2 tests)
    - `performCapture -- renderer failure: page size limit` (2 tests)
    - `performCapture -- header fetch fails but render succeeds` (3 tests)
    - `performCapture -- both renderer and header fetch fail` (1 test)
    - `performCapture -- KV always updated` (3 tests)
    - `captureHeaders -- Set-Cookie redaction` (2 tests)
    - Plus several captureHeaders unit test blocks

    The `stubRenderer` pattern: `async () => ({ screenshot: PNG_BYTES, html: TEST_HTML })`
    Tests inject custom renderers that throw specific errors to test categorizeError().

    ### Success criteria

    - All existing 17 tests pass
    - 4 new Playwright error tests pass
    - 1 new concurrent capture test passes
    - Total test count: 22+
    - `npm test` exits 0

- **Deliverables**: Modified `test/capture.test.js` with new test blocks
- **Success criteria**: All tests pass, including new Playwright-specific error tests

---

### Task 3: Update backlog and add scaling path documentation

- **Agent**: software-docs-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |
    ## Task: Update backlog with TOCTOU resolution and scaling path

    You are updating `docs/backlog.md` for the WRL project after the Playwright
    migration and session reuse implementation.

    ### What to do

    #### 1. Mark TOCTOU items as DONE

    In the **Security** section of `docs/backlog.md`, update these two items:

    **Before:**
    ```
    - [should] TOCTOU gap mitigation -- Browser Rendering re-resolves DNS independently; `captureHeaders` fetch also uses original hostname; both legs share the gap and should be addressed together; Puppeteer request interception available (urlval decisions #3, security-minion; updated: capture-endpoint)
    - [should] Puppeteer request interception for cross-domain navigation blocking -- defense-in-depth against TOCTOU in browser session; currently interception is in place for subresource counting only; accepted risk for MVP (security-minion, capture-endpoint)
    ```

    **After:**
    ```
    - [should] ~~TOCTOU gap mitigation~~ -- DONE (browser-session-reuse): Cross-domain navigation blocking implemented via browserContext.route(); each redirect hop is validated against target origin. Residual risk: same-domain DNS rebinding (attacker controls DNS for target domain) remains -- cannot be solved at request interception layer; accepted risk documented in capture.js header comment
    - [should] ~~Puppeteer request interception for cross-domain navigation blocking~~ -- DONE (browser-session-reuse): browserContext.route() blocks navigations to origins other than the validated target URL; covers server-side redirects, client-side navigations, and popup first-requests; Service Workers blocked via context options
    ```

    #### 2. Update queue migration context

    In the **API** section, update the queue migration item:

    **Before:**
    ```
    - [should] Queue migration for capture processing -- ctx.waitUntil() has 30s hard limit; Cloudflare Queue gives 15min processing budget; add when slow-page timeouts recur (edge-minion, capture-endpoint)
    ```

    **After:**
    ```
    - [should] Queue migration for capture processing -- ctx.waitUntil() has 30s hard limit; session reuse eliminates ~2-5s browser launch overhead, freeing more budget for rendering; Cloudflare Queue gives 15min processing budget; add when slow-page timeouts recur (edge-minion, capture-endpoint; updated: browser-session-reuse)
    ```

    #### 3. Update capture service container migration context

    In the **Operations** section, update:

    **Before:**
    ```
    - [consider] Capture service container migration -- if Browser Rendering limits hit (iac-minion, kickoff)
    ```

    **After:**
    ```
    - [consider] Capture service container migration -- session reuse pushes this further out; 30 reusable sessions at ~300 captures/min is sufficient for current scale; revisit if concurrent session limit (30) becomes the bottleneck (iac-minion, kickoff; updated: browser-session-reuse)
    ```

    #### 4. Add scaling path section

    Add a new section at the end of the backlog (before any trailing whitespace):

    ```
    ## Scaling Beyond Session Reuse

    Options for scaling beyond the current 30-session / ~300 captures/min ceiling,
    ordered by complexity:

    - [consider] Session pre-warming via cron trigger -- eliminate cold-start latency by pre-acquiring sessions on deploy or schedule; burns 30/min new-instance budget but gives 30 hot sessions immediately (edge-minion, browser-session-reuse)
    - [consider] Queue-based backpressure with Cloudflare Queues -- decouple capture acceptance from execution; queue provides 15min processing budget vs ctx.waitUntil's 30s; enables retry without client re-request (edge-minion, browser-session-reuse)
    - [consider] Durable Object session coordinator -- central session assignment to eliminate contention; Workers request sessions from DO instead of racing on sessions() list; adds latency but eliminates retry overhead (edge-minion, browser-session-reuse)
    - [consider] Cloudflare Containers -- run browser outside Browser Rendering limits; full control over session count, memory, and lifecycle; significant complexity increase (iac-minion, browser-session-reuse)
    ```

    #### 5. Add per-tenant rate limiting context update

    In the **API** section, update:

    **Before:**
    ```
    - [consider] Per-tenant rate limiting -- current rate limit keys on CF-Connecting-IP; should switch to tenant ID when per-tenant keys are added (edge-minion, capture-endpoint)
    ```

    **After:**
    ```
    - [consider] Per-tenant rate limiting -- current rate limit keys on CF-Connecting-IP; with 10x capacity (300/min) the per-IP 10/min limit feels more constraining; should switch to tenant ID when per-tenant keys are added (edge-minion, capture-endpoint; updated: browser-session-reuse)
    ```

    ### Constraints

    - Do NOT change the tier definitions or structure of the backlog
    - Do NOT add items that are already covered by existing entries
    - Preserve the existing source attribution format
    - Keep the `~~strikethrough~~` pattern consistent with existing DONE items

    ### Files to modify

    - `docs/backlog.md`

    ### Success criteria

    - Two TOCTOU items marked DONE with strikethrough
    - Queue migration and container migration items updated with session-reuse context
    - Scaling path section added with 4 ordered options
    - Per-tenant rate limit context updated
    - No existing items removed or re-tiered

- **Deliverables**: Modified `docs/backlog.md`
- **Success criteria**: TOCTOU items marked DONE, scaling path documented

---

### Cross-Cutting Coverage

| Dimension | Coverage | Justification |
|-----------|----------|---------------|
| **Testing** | Task 2 (test-minion) + Phase 6 (post-execution) | New error pattern tests, concurrent capture test, existing test preservation |
| **Security** | Incorporated into Task 1 prompt | security-minion's recommendations (context.close guarantee, orphan cleanup, browserContext.route, SW blocking, threat model documentation) are all part of the implementation task |
| **Usability -- Strategy** | Incorporated into Task 1 prompt | ux-strategy-minion's recommendations (pool exhaustion error category, rate limit raise) are in the implementation |
| **Usability -- Design** | Not applicable | No user-facing UI changes; API contract unchanged |
| **Documentation** | Task 3 (software-docs-minion) + Phase 8 (post-execution) | Backlog updates, scaling path documentation; capture.js header comment in Task 1 |
| **Observability** | Not included | No new runtime services or APIs. The session acquisition helper logs via console (existing pattern). Observability instrumentation (limits()/history() monitoring) is a post-MVP concern documented in the scaling path. |

---

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - None selected. The plan has 3 tasks modifying 4 files. No UI components (ux-design-minion, accessibility-minion not needed). No web-facing runtime changes beyond capture internals (sitespeed-minion not needed). Single service, no coordinated observability (observability-minion not needed). No end-user-facing documentation changes (user-docs-minion not needed -- backlog is developer-facing).
- **Not selected**: ux-design-minion, accessibility-minion, sitespeed-minion, observability-minion, user-docs-minion

---

### Risks and Mitigations

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| **networkidle vs networkidle2 regression** | Medium | Medium | Using `networkidle` directly. If pages with persistent connections timeout more often, switch to `'load'` + settle -- one-line change. Monitor timeout error rates after deploy. |
| **Session contention at 300 captures/min** | Medium | Low | Random session selection + try/catch fallback to acquire(). At 30 sessions and 300/min, ~10 captures/session/min. Manageable. |
| **Cold start: 30 sessions need 1 minute to warm** | High | Medium | Accept degraded throughput for first minute. Pre-warming is documented as a scaling option in backlog. |
| **miniflare browserRendering binding compat** | Medium | Low | Tests use stubRenderer and never touch the binding. If env.BROWSER becomes undefined, only the default code path (not used in tests) is affected. |
| **Playwright error message format differences** | Medium | Low | categorizeError() uses both error.name and substring matching. Custom errors (subresource limit, size limit) are our own strings and unchanged. |
| **Context close failure** | Low | High | try/finally pattern guarantees context.close(). Defensive orphan cleanup on connect as safety net. |

---

### Execution Order

```
Batch 1 (sequential -- single task):
  Task 1: Migrate src/capture.js [edge-minion]
    |
    v
  APPROVAL GATE (Task 1 deliverable)
    |
    v
Batch 2 (parallel -- independent tasks):
  Task 2: Update tests [test-minion]
  Task 3: Update backlog [software-docs-minion]
    |
    v
Phase 5: Post-execution code review (code-review-minion, lucy, margo)
Phase 6: Post-execution test execution
Phase 8: Post-execution documentation check
```

---

### Verification Steps

1. `npm install` succeeds with `@cloudflare/playwright` replacing `@cloudflare/puppeteer`
2. `npm test` passes all tests (existing + new)
3. `src/capture.js` no longer references `puppeteer`, `setRequestInterception`, `createBrowserContext`, `setViewport`, or `networkidle2`
4. `src/capture.js` contains `sessions`, `connect`, `acquire` imports from `@cloudflare/playwright`
5. `src/capture.js` header comment documents BrowserContext isolation threat model
6. `wrangler.toml` GLOBAL_CAPTURE_LIMITER is `limit = 200`
7. `docs/backlog.md` has TOCTOU items marked DONE and scaling path section
8. `package.json` dependencies show `@cloudflare/playwright` not `@cloudflare/puppeteer`
