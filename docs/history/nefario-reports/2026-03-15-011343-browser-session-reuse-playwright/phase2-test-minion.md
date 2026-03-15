# Test Strategy: Playwright Migration & Session Reuse

## Summary

The current test architecture is well-designed for this migration. The `stubRenderer` DI pattern cleanly separates orchestration tests from browser internals, and most existing tests will survive the migration without changes. The real test work falls into three buckets: (1) adapting `defaultRenderer` internals for Playwright's API, (2) adding session reuse test scenarios that don't exist yet, and (3) updating `categorizeError()` for Playwright-specific error strings. The miniflare `browserRendering` binding is the biggest infrastructure question -- it may not support `@cloudflare/playwright` natively, which would block integration-level browser tests in CI.

---

## Answers to Planning Questions

### (a) Does the stubRenderer DI pattern survive the Playwright migration?

**Yes -- the pattern survives completely.** This is the strongest part of the current test design.

The `stubRenderer` injected into `performCapture()` never touches Puppeteer. It's a plain async function that returns `{ screenshot, html }`. All 17 existing tests in `capture.test.js` use this pattern and test the *orchestration layer*: KV status transitions, R2 artifact storage, error categorization, retry flags. None of them exercise the browser API.

The only change needed at this layer: the `renderer` function signature. Currently it's `(browserBinding, url) => Promise<{screenshot, html}>`. If session reuse changes the renderer contract (e.g., adding a session management parameter or changing the return to include session metadata), the stub signature must match. **Recommendation: keep the renderer interface unchanged.** The renderer should encapsulate all session management internally. The caller (`performCapture`) should not know whether sessions are reused.

The `defaultRenderer` function itself (lines 183-234 of `capture.js`) is where all Puppeteer-to-Playwright changes land. This function is NOT tested directly -- it's tested only through the stub injection. This is the correct approach: `defaultRenderer` is an integration concern that exercises real browser APIs.

**No changes needed to existing `capture.test.js` tests for the migration itself.**

### (b) Does miniflare support `@cloudflare/playwright` in the test pool?

**This is the highest-risk question and the answer is: probably not natively.**

The current `vitest.config.js` has:
```js
miniflare: {
  browserRendering: { binding: 'BROWSER' },
}
```

This provides a `BROWSER` binding in the test environment. However, the Cloudflare vitest integration docs do not mention `browserRendering`, `puppeteer`, or `playwright` anywhere in their configuration reference. The `browserRendering` option in miniflare likely provides a mock or stub binding -- not a real browser. The existing tests never exercise it because they inject `stubRenderer` instead.

**Key findings:**
- The `browserRendering` binding in miniflare is undocumented for testing purposes
- No existing test calls `env.BROWSER` directly -- it flows through `stubRenderer` injection
- The `wrangler.toml` declares `[browser] binding = "BROWSER"` which is the production binding

**Recommendation:** The test infrastructure does NOT need changes for the migration, because:
1. Orchestration tests use stub injection and never touch the binding
2. The `browserRendering` miniflare config just needs to provide *something* at `env.BROWSER` so the code doesn't crash when `defaultRenderer` is not injected -- but in tests, it's always injected
3. If a future integration test needs real browser execution in CI, that's a separate initiative requiring either workerd with browser support or a deploy-and-test strategy

**Risk mitigation:** Verify that `@cloudflare/playwright`'s `launch()` accepts the same binding type that miniflare provides for `browserRendering`. If the import changes from `import puppeteer from '@cloudflare/puppeteer'` to `import { launch } from '@cloudflare/playwright'`, the binding format might differ. Add a smoke test that confirms `env.BROWSER` is defined (even if it can't launch a real browser in the test environment).

### (c) How should session reuse behavior be tested?

Session reuse introduces several new behaviors that need test coverage. These split into two categories: **unit-testable logic** (via stubs) and **integration-testable behavior** (requiring real or near-real browser sessions).

#### Unit-testable (via stub injection in capture.test.js):

1. **Session discovery succeeds -- renderer reuses session:**
   - Stub that simulates a successful `connect()` path
   - Verify same `{ screenshot, html }` contract is fulfilled
   - Verify `performCapture` orchestration is identical (KV, R2 behavior)

2. **Session discovery fails -- renderer falls back to launch:**
   - Stub that simulates the fallback path
   - Verify capture still completes successfully
   - This tests that the renderer handles the race condition where another worker takes the session

3. **Session contention (another worker connected first):**
   - Stub that throws a connection error, then succeeds on launch
   - Verify capture completes (the error is swallowed internally by the renderer)

4. **disconnect() vs close() behavior:**
   - This is NOT testable at the `performCapture` level -- it's internal to `defaultRenderer`
   - The renderer should use `browser.close()` (which disconnects for connected sessions in Playwright) rather than explicit `disconnect()`
   - Test at the renderer unit level: verify the renderer function does not leave sessions in a bad state

#### Proposed new test structure for session reuse in `capture.test.js`:

```js
describe('performCapture -- session reuse (renderer contract)', () => {
  it('succeeds with a renderer that simulates session reconnection', async () => {
    // Stub behaves identically -- contract is { screenshot, html }
    const reconnectRenderer = async () => ({
      screenshot: PNG_BYTES,
      html: TEST_HTML,
    });
    mockHeaderFetch();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP);
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, reconnectRenderer);
    const record = await getCapture(env.KV, TEST_ID);
    expect(record.status).toBe('complete');
  });

  it('succeeds when session connect fails and renderer falls back to launch', async () => {
    // Same contract -- renderer internally handled the fallback
    const fallbackRenderer = async () => ({
      screenshot: PNG_BYTES,
      html: TEST_HTML,
    });
    mockHeaderFetch();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP);
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, fallbackRenderer);
    const record = await getCapture(env.KV, TEST_ID);
    expect(record.status).toBe('complete');
  });
});
```

**Important insight:** Because the renderer interface hides session management, the orchestration tests look identical to existing ones. This is the point -- the DI pattern means session reuse is an implementation detail of the renderer, not of `performCapture`. The real session reuse tests belong in a **new test file** that tests `defaultRenderer` (or its refactored equivalent) directly.

#### New test file: `test/renderer.test.js` (integration-level):

This file would test the actual Playwright session logic. It requires either:
- A mock Playwright module that simulates `launch`, `connect`, `sessions`
- Or real browser execution (deployment-gated test)

**Recommended approach:** Create a thin wrapper module (`src/renderer.js`) that exports the renderer function and test it with a mocked `@cloudflare/playwright` module using `vi.mock()`. Test scenarios:

1. `sessions()` returns empty list -> `launch()` is called
2. `sessions()` returns session with no `connectionId` -> `connect()` is called
3. `connect()` throws (race condition) -> falls back to `launch()`
4. `connect()` succeeds -> page operations work -> `browser.close()` disconnects
5. `launch()` succeeds -> page operations work -> `browser.close()` closes
6. `keep_alive` option is passed when launching new sessions
7. Subresource counting works via `page.route()` instead of `setRequestInterception`
8. Page size limit works via response event monitoring

### (d) Can vitest-pool-workers simulate concurrent captures?

**Partially.** The `@cloudflare/vitest-pool-workers` pool runs tests in workerd, which supports concurrent async operations within a single test. However:

- **Within a single test:** You can `Promise.all()` multiple `performCapture()` calls. With stub renderers, this tests the KV/R2 contention at the orchestration level.
- **Across workers:** The pool doesn't simulate multiple worker invocations hitting the same browser pool. Real concurrency testing for session contention requires either:
  - A staging deployment with load generation (k6 or similar)
  - A mock that simulates the `sessions()` API returning varying states

**Recommended test for concurrent captures:**

```js
describe('performCapture -- concurrent execution', () => {
  it('two captures do not interfere with each other', async () => {
    const ID_A = 'cap_aaaa' + 'a'.repeat(28);
    const ID_B = 'cap_bbbb' + 'b'.repeat(28);

    // Mock header fetches for both
    mockHeaderFetch();
    // (need second mock for same origin -- or use different URLs)

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

This tests orchestration-level concurrency (KV and R2 don't collide). True browser session concurrency testing belongs in a staging/load test, not unit tests.

### (e) Should categorizeError() be updated for Playwright error messages?

**Yes, absolutely.** Playwright produces different error messages than Puppeteer. The current patterns and their Playwright equivalents:

| Current Pattern | Puppeteer Error | Playwright Equivalent |
|---|---|---|
| `'timeout'` / `'Timeout'` | `Navigation timeout of 25000 ms exceeded` | `Timeout 25000ms exceeded` or `page.goto: Timeout 25000ms exceeded` |
| `'net::ERR'` | `net::ERR_NAME_NOT_RESOLVED` | Same -- Chromium error codes pass through |
| `'Navigation'` | `Navigation timeout...` | `page.goto: Navigation failed because page was closed!` or `page.goto: Navigation failed because page crashed!` |
| `'Could not navigate'` | Cloudflare-specific? | Unknown -- may not exist in Playwright |
| `'subresource limit'` | Custom thrown error | Custom thrown error (unchanged) |
| `'50MB size limit'` | Custom thrown error | Custom thrown error (unchanged) |

**Key changes needed:**

1. Playwright throws `TimeoutError` class, not generic `Error` with timeout in message. Check `error.name === 'TimeoutError'` in addition to string matching.
2. Playwright prefixes errors with the method name: `page.goto: Timeout 25000ms exceeded`. The string `'timeout'` match (case-insensitive) still catches this, but tests should use the actual Playwright error format.
3. Add pattern for `'page crashed'` -- a Playwright-specific failure that is retryable.
4. Add pattern for `'browser has been closed'` or `'Target closed'` -- session reuse can produce these if a session is unexpectedly terminated.

**Proposed updated categorizeError:**

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
  // Playwright: "page crashed", "page was closed"
  if (msg.includes('page crashed') || msg.includes('page was closed')) {
    return { message: 'Browser session terminated unexpectedly', retryable: true };
  }
  // Session reuse: stale session errors
  if (msg.includes('browser has been closed') || msg.includes('Target closed')) {
    return { message: 'Browser session expired', retryable: true };
  }
  if (msg.includes('Could not navigate') || msg.includes('net::ERR') || msg.includes('Navigation')) {
    return { message: 'Could not navigate to the target URL', retryable: true };
  }

  return { message: 'Capture could not be completed', retryable: true };
}
```

**New tests for categorizeError:**

```js
describe('performCapture -- Playwright-specific errors', () => {
  it('handles Playwright TimeoutError (name-based)', async () => {
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

  it('handles page crash (retryable)', async () => {
    const crashRenderer = async () => {
      throw new Error('page.goto: Navigation failed because page crashed!');
    };
    mockHeaderFetch();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP);
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, crashRenderer);
    const record = await getCapture(env.KV, TEST_ID);
    expect(record.status).toBe('failed');
    expect(record.retryable).toBe(true);
  });

  it('handles stale session error (retryable)', async () => {
    const staleRenderer = async () => {
      throw new Error('browser has been closed');
    };
    mockHeaderFetch();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP);
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, staleRenderer);
    const record = await getCapture(env.KV, TEST_ID);
    expect(record.status).toBe('failed');
    expect(record.retryable).toBe(true);
  });
});
```

---

## Recommendations

### 1. Keep the stubRenderer DI pattern -- do not change it

The current test architecture already isolates the Playwright migration surface. All 17 existing `capture.test.js` tests continue to work unmodified. The renderer interface (`(browserBinding, url) => Promise<{screenshot, html}>`) is the right abstraction boundary. Session reuse is an implementation detail of the renderer, invisible to `performCapture`.

### 2. Extract `defaultRenderer` to `src/renderer.js` for testability

Currently `defaultRenderer` is a private function in `capture.js`. For the Playwright migration, extract it to its own module:
- `src/renderer.js` exports `createRenderer(browserBinding)` or similar
- Contains session discovery, connect/launch logic, page operations
- Can be tested with `vi.mock('@cloudflare/playwright')` in a dedicated test file
- `capture.js` imports and uses it as the default renderer

### 3. Update categorizeError() for Playwright error patterns

Add `error.name === 'TimeoutError'` check, `page crashed`, `page was closed`, `browser has been closed`, `Target closed`. All are retryable. Write explicit tests for each new pattern.

### 4. Create `test/renderer.test.js` for renderer-level tests

Test the Playwright-specific logic with `vi.mock`:
- Session listing and selection logic
- Connect vs launch paths
- Fallback on contention
- `page.route()` based subresource counting
- `browser.close()` call semantics (disconnect for connected, close for launched)

### 5. Do not attempt real browser tests in CI initially

The miniflare `browserRendering` binding is sufficient for providing `env.BROWSER` as a placeholder. Real browser testing in CI requires either workerd browser support (not documented) or a deploy-and-test pipeline. Defer this to a post-migration phase.

### 6. Add concurrent capture test for orchestration safety

A `Promise.all` test with two captures verifies that KV and R2 operations don't collide. This is cheap to add and catches any shared-state bugs introduced during the migration.

---

## Proposed Tasks

### Task 1: Verify existing tests pass with import change only
- Change `import puppeteer from '@cloudflare/puppeteer'` to `import { launch } from '@cloudflare/playwright'`
- Run `vitest run` -- all 17 `capture.test.js` tests should still pass because they never import or exercise the browser module directly
- **Effort:** Minutes. **Risk:** Low.

### Task 2: Update categorizeError() and add Playwright error tests
- Add `error.name` check for `TimeoutError`
- Add patterns for `page crashed`, `page was closed`, `browser has been closed`, `Target closed`
- Write 3-4 new test cases with Playwright-format error messages
- Update existing `timeoutRenderer` test to use Playwright error format (`page.goto: Timeout 25000ms exceeded` with `name: 'TimeoutError'`)
- Keep backward compatibility for any Puppeteer-format errors that might still surface
- **Effort:** Small. **Risk:** Low.

### Task 3: Rewrite defaultRenderer for Playwright API
- Replace `puppeteer.launch()` with session reuse pattern: `sessions()` -> `connect()` or `launch()`
- Replace `page.setRequestInterception(true)` + `page.on('request', ...)` with `page.route('**/*', ...)`
- Replace `page.on('response', ...)` with Playwright response event
- Replace `browser.createBrowserContext()` with `browser.newContext()`
- Use `browser.close()` (which disconnects for connected sessions in Playwright) in finally block
- **Effort:** Medium. **Risk:** Medium -- API surface changes significantly.

### Task 4: Extract renderer to src/renderer.js with dedicated tests
- Move `defaultRenderer` to `src/renderer.js`
- Export as named function (e.g., `renderPage`)
- Create `test/renderer.test.js` with `vi.mock('@cloudflare/playwright')`
- Test: session listing, connect path, launch path, fallback on contention, subresource counting via `page.route()`, page size limit via response events
- **Effort:** Medium. **Risk:** Low.

### Task 5: Add concurrent capture orchestration test
- Add `describe('performCapture -- concurrent execution')` block
- Two captures with different IDs, same URL, `Promise.all`
- Verify both complete independently
- **Effort:** Small. **Risk:** Low.

### Task 6: Verify miniflare browserRendering binding compatibility
- After changing the import to `@cloudflare/playwright`, verify `env.BROWSER` is still available in tests
- If miniflare's `browserRendering` option breaks, check if `wrangler.toml`'s `[browser]` section is sufficient
- Document finding for the team
- **Effort:** Small. **Risk:** Medium -- undocumented behavior.

---

## Risks and Concerns

### HIGH: miniflare browserRendering binding compatibility with @cloudflare/playwright

The `browserRendering` option in miniflare's vitest config is undocumented. It currently works with `@cloudflare/puppeteer` but may not recognize `@cloudflare/playwright`. If the binding breaks, `env.BROWSER` will be undefined in tests. The stub injection pattern means this only affects the *default* code path (when no renderer is injected), but it could break the integration test (`capture-integration.test.js`) if that test exercises the real renderer.

**Mitigation:** Test this first (Task 6). If it fails, the `browserRendering` config line may need to change, or a manual binding mock may be needed.

### MEDIUM: Playwright error message format differences across versions

`@cloudflare/playwright` v1.1.0 is based on Playwright v1.57.0. Error message formats can change between Playwright versions. String matching on error messages is inherently fragile.

**Mitigation:** Use `error.name` checking (e.g., `TimeoutError`) where possible instead of string matching. Keep string matching as fallback for custom errors (subresource limit, size limit) that we throw ourselves.

### MEDIUM: page.route() vs setRequestInterception behavioral differences

Puppeteer's `setRequestInterception(true)` intercepts ALL requests. Playwright's `page.route('**/*', handler)` also matches all requests, but the handler API is different: `route.continue()` vs `request.continue()`, `route.abort()` vs `request.abort()`. The subresource counting and size limiting logic needs careful translation.

**Mitigation:** Test subresource counting and size limiting as part of Task 4 (renderer tests). The custom errors thrown by this logic (`Page exceeded 200 subresource limit`) are unchanged -- they're our strings, not Playwright's.

### LOW: session reuse race condition in tests

If `test/renderer.test.js` uses `vi.mock('@cloudflare/playwright')`, the mock's `sessions()` return value needs to be carefully controlled per test. Shared mock state between tests could cause flakiness.

**Mitigation:** Reset mock state in `beforeEach`. Use `vi.fn()` for each test's session configuration.

### LOW: keep_alive timing in tests

Session reuse with `keep_alive` introduces time-dependent behavior. Tests should not rely on wall-clock time.

**Mitigation:** Mock timers or test keep_alive as a configuration assertion (verify the option is passed to `launch()`), not a behavioral test.

---

## Additional Agents Needed

### edge-minion
Should confirm whether the `@cloudflare/playwright` `launch()` and `connect()` functions accept the same binding type that `wrangler.toml`'s `[browser]` section provides. Also needs to verify that the `keep_alive` option works with the Cloudflare Browser Rendering paid plan limits (30 concurrent sessions, 60s default timeout).

### security-minion
Should review the `page.route()` based request interception to confirm it provides equivalent isolation to Puppeteer's `setRequestInterception`. Specifically: can a malicious page bypass `page.route()` in ways it couldn't bypass Puppeteer's interception? Also review whether `browser.close()` (which disconnects in Playwright) properly cleans up page state so the next user of that session doesn't see previous page content.

---

## Test File Change Summary

| File | Action | Scope |
|---|---|---|
| `test/capture.test.js` | Modify | Add 3-4 Playwright error tests, 1 concurrent capture test. Update `timeoutRenderer` error format. No changes to existing passing tests. |
| `test/renderer.test.js` | Create | New file. 8-10 tests for Playwright session management, `page.route()` interception, connect/launch paths. Uses `vi.mock`. |
| `vitest.config.js` | Verify | Confirm `browserRendering` binding still works. May need minor adjustment. |
| `src/capture.js` | Modify | Update `categorizeError()`. Change import. Rewrite `defaultRenderer`. |
| `src/renderer.js` | Create | Extracted renderer with session reuse logic. |

---

## Sources

- [Cloudflare Browser Rendering - Playwright](https://developers.cloudflare.com/browser-rendering/playwright/)
- [Cloudflare Browser Rendering - Reuse Sessions](https://developers.cloudflare.com/browser-rendering/workers-bindings/reuse-sessions/)
- [Cloudflare Browser Rendering - Limits](https://developers.cloudflare.com/browser-rendering/limits/)
- [Cloudflare Workers Vitest Integration - Configuration](https://developers.cloudflare.com/workers/testing/vitest-integration/configuration/)
- [Playwright Network Handling (Cloudflare fork)](https://deepwiki.com/cloudflare/playwright/2.4-network-handling)
- [Playwright TimeoutError API](https://playwright.dev/docs/api/class-timeouterror)
- [@cloudflare/playwright on npm](https://www.npmjs.com/package/@cloudflare/playwright)
