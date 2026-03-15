# Frontend (Browser API) Assessment: Puppeteer-to-Playwright Migration Surface

## Summary

The migration from `@cloudflare/puppeteer` to `@cloudflare/playwright` involves **six distinct API translation points** in `src/capture.js`. Five are straightforward mechanical mappings. The sixth -- request interception via `page.route()` -- is a structural redesign that replaces Puppeteer's event-driven model with Playwright's route-handler model, and this change directly addresses the TOCTOU cross-domain navigation blocking gap in the backlog.

The Cloudflare fork (`@cloudflare/playwright` v1.1.0, based on Playwright v1.57.0) adds session management functions (`launch`, `acquire`, `connect`, `sessions`, `history`, `limits`) on top of standard Playwright. The standard Playwright API (`page.route`, `page.goto`, `page.screenshot`, `page.setViewportSize`, `page.content`) is fully available through the fork.

---

## (a) Request Interception: `page.setRequestInterception()` + Events -> `page.route()`

### Current Puppeteer pattern

```javascript
await page.setRequestInterception(true);
page.on('request', (req) => {
  if (limitExceeded) { req.abort('blockedbyclient'); return; }
  subresourceCount++;
  if (subresourceCount > MAX_SUBRESOURCES) {
    limitExceeded = `Page exceeded ${MAX_SUBRESOURCES} subresource limit`;
    req.abort('blockedbyclient');
    return;
  }
  req.continue();
});
```

### Playwright equivalent

Playwright replaces the two-step "enable interception, then listen for events" with a single `page.route()` call that registers a handler for matching URLs. The handler receives a `Route` object (not a `Request` object), and must call one of `route.abort()`, `route.continue()`, or `route.fulfill()`.

```javascript
await page.route('**/*', async (route) => {
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

### Key differences

1. **`route.abort()`, `route.continue()`, `route.fulfill()` are async** -- they return Promises and should be awaited. The Puppeteer equivalents (`req.abort()`, `req.continue()`) are fire-and-forget. Missing `await` will cause race conditions.

2. **The glob pattern `'**/*'` replaces the boolean interception toggle**. Playwright uses URL pattern matching (glob or regex) to decide which requests to intercept. `'**/*'` matches everything, which is what we want for subresource counting.

3. **The handler receives `route`, not `request`**. To access request properties (URL, resource type, headers), use `route.request()`.

4. **If the handler does nothing (no abort/continue/fulfill), the request stalls**. This is the same behavior as Puppeteer (failing to call `req.abort()` or `req.continue()` stalls the request), but it's more explicit in Playwright's model.

5. **Error code support**: Playwright's `route.abort()` accepts the same error code strings as Puppeteer, including `'blockedbyclient'`. The full set includes: `'aborted'`, `'accessdenied'`, `'addressunreachable'`, `'blockedbyclient'`, `'blockedbyresponse'`, `'connectionaborted'`, `'connectionclosed'`, `'connectionfailed'`, `'connectionrefused'`, `'connectionreset'`, `'internetdisconnected'`, `'namenotresolved'`, `'timedout'`, `'failed'`. Default is `'failed'`.

### Migration risk: Low

The translation is nearly 1:1. The main gotcha is adding `await` to the route action calls.

---

## (b) Abort and Continue Equivalents

| Puppeteer | Playwright | Notes |
|-----------|-----------|-------|
| `req.abort('blockedbyclient')` | `await route.abort('blockedbyclient')` | Same error codes supported. Must await. |
| `req.continue()` | `await route.continue()` | Must await. Accepts optional overrides: `{ headers, method, postData, url }`. |
| `req.respond({...})` | `await route.fulfill({...})` | Not currently used in capture.js. |

No API gaps here. The Playwright equivalents accept the same inputs and produce the same browser-level behavior.

---

## (c) `page.goto()` -- `waitUntil` Differences

### The critical mapping

| Puppeteer | Playwright | Behavior |
|-----------|-----------|----------|
| `waitUntil: 'networkidle0'` | `waitUntil: 'networkidle'` | 0 connections for 500ms |
| `waitUntil: 'networkidle2'` | `waitUntil: 'networkidle'` | **Different threshold** |
| `waitUntil: 'load'` | `waitUntil: 'load'` | Same |
| `waitUntil: 'domcontentloaded'` | `waitUntil: 'domcontentloaded'` | Same |

**This is the most semantically significant API difference.** Playwright only has `'networkidle'`, which waits for **0 network connections for 500ms** (equivalent to Puppeteer's `networkidle0`). The current code uses `networkidle2`, which allows up to **2 outstanding connections**.

### Impact on capture behavior

Pages that use long-polling, analytics beacons, or persistent WebSocket connections will behave differently:

- **With `networkidle2` (current)**: Navigation completes even if 1-2 background connections remain open. This is more forgiving for pages with keepalive connections, analytics pings, or Server-Sent Events.
- **With `networkidle` (Playwright)**: Navigation only completes when ALL network connections close. Pages with any persistent connection will either timeout or require the navigation to ignore those connections.

### Practical risk: Medium

For a web archival tool that captures arbitrary URLs, `networkidle2` is deliberately more tolerant. Switching to the stricter `networkidle` (0 connections) could cause timeout failures on pages that previously captured successfully -- specifically pages with:
- Analytics scripts that maintain persistent connections
- Chat widgets with WebSocket connections
- Pages using Server-Sent Events
- Long-polling XHR requests

### Recommended approach

Use `waitUntil: 'networkidle'` (the only option) but combine it with a **race pattern** as a fallback:

```javascript
await Promise.race([
  page.goto(url, { timeout: NAV_TIMEOUT_MS, waitUntil: 'networkidle' }),
  page.waitForLoadState('load').then(() =>
    new Promise(resolve => setTimeout(resolve, 2000))
  ),
]);
```

Alternatively, Playwright's `page.waitForLoadState('networkidle')` can be used with a timeout wrapper. But the simplest approach is to just use `waitUntil: 'load'` and then add a brief explicit wait, since `networkidle` is considered unreliable by the Playwright team themselves. Playwright's official recommendation is to avoid `networkidle` and instead wait for specific conditions (elements, network responses). For a generic archival tool that doesn't know the page structure, `'load'` + a 2-second settle time is more robust than `'networkidle'`.

**Decision needed at approval gate**: Which wait strategy to use. Options:
1. `waitUntil: 'networkidle'` -- strictest, may cause regressions on pages with persistent connections
2. `waitUntil: 'load'` + 2s settle -- most compatible, wastes 2s on fast pages
3. `waitUntil: 'networkidle'` with a timeout fallback to `'load'` -- complex but best of both worlds

---

## (d) Screenshot, Content, and Viewport API Differences

### `page.screenshot()`

| Puppeteer | Playwright | Notes |
|-----------|-----------|-------|
| `page.screenshot({ fullPage: true, type: 'png' })` | `page.screenshot({ fullPage: true, type: 'png' })` | Identical API |

Playwright's `page.screenshot()` accepts the same `fullPage` and `type` options. Additional Playwright options not in Puppeteer: `animations` (disable CSS animations), `caret` (hide text cursor), `omitBackground` (transparency). None are needed for this migration.

**Return type difference**: Puppeteer returns a `Buffer` (Node.js). Playwright returns a `Buffer` as well. In the Cloudflare Workers environment, both should produce a `Uint8Array`-compatible value. **Verify this in the Cloudflare fork** -- the return type in a Workers context may differ from Node.js.

### `page.content()`

Identical API. No changes needed. Both return a `Promise<string>` containing the full page HTML.

### `page.setViewport()` -> `page.setViewportSize()`

| Puppeteer | Playwright |
|-----------|-----------|
| `await page.setViewport({ width: 1280, height: 720 })` | `await page.setViewportSize({ width: 1280, height: 720 })` |

**Method name change only.** The parameter shape (`{ width, height }`) is identical. Puppeteer's `setViewport` also accepted `deviceScaleFactor`, `isMobile`, `hasTouch`, and `isLandscape` -- none of which are used in the current code.

In Playwright, viewport can also be set at context creation time: `browser.newContext({ viewport: { width: 1280, height: 720 } })`. This is preferable because `setViewportSize()` resets the screen size and can cause layout shifts. For the initial viewport, set it on the context. For the dynamic height adjustment (capping at `MAX_PAGE_HEIGHT`), use `setViewportSize()`.

### Migration risk: Low

All three APIs have direct equivalents. The only gotcha is the method rename (`setViewport` -> `setViewportSize`).

---

## (e) BrowserContext Creation and Isolation

### Puppeteer (current)

```javascript
const browser = await puppeteer.launch(browserBinding);
const context = await browser.createBrowserContext();
// ...
await context.close();
await browser.close();
```

### Playwright equivalent

```javascript
const browser = await launch(env.BROWSER);
const context = await browser.newContext();
// ...
await context.close();
await browser.disconnect(); // or browser.close() -- see session reuse discussion
```

### Key differences

1. **Method name**: `browser.createBrowserContext()` -> `browser.newContext()`

2. **Context options**: Playwright's `newContext()` accepts a rich options object: `viewport`, `userAgent`, `locale`, `timezoneId`, `geolocation`, `permissions`, `storageState`, etc. This is where to set the initial viewport instead of calling `page.setViewportSize()` separately:

   ```javascript
   const context = await browser.newContext({
     viewport: { width: 1280, height: 720 },
   });
   ```

3. **Isolation model**: Both Puppeteer's `BrowserContext` and Playwright's `BrowserContext` provide:
   - Separate cookie jars
   - Separate localStorage/sessionStorage
   - Separate cache
   - Separate service worker registrations

   This isolation model is identical in both libraries. What matters for the session reuse security assessment is whether Chromium-level state (DNS cache, HSTS preload list, certificate cache) leaks between contexts. This is a question for security-minion, not a Playwright vs. Puppeteer difference.

4. **`close()` vs `disconnect()`**: In Playwright (and the Cloudflare fork), `browser.close()` behaves differently depending on how the browser was obtained:
   - `launch()` -> `close()` terminates the browser process
   - `connect()` -> `close()` disconnects from the session (keeps it alive)

   For session reuse, the pattern is:
   - `context.close()` -- always, to release context resources
   - `browser.close()` (on a `connect()`-obtained browser) -- disconnects, keeps session alive
   - Or `browser.disconnect()` -- explicit disconnect

### Import pattern change

Puppeteer:
```javascript
import puppeteer from '@cloudflare/puppeteer';
const browser = await puppeteer.launch(env.BROWSER);
```

Playwright (Cloudflare fork):
```javascript
import { launch, connect, acquire, sessions } from '@cloudflare/playwright';
const browser = await launch(env.BROWSER);
// or for session reuse:
const { sessionId } = await acquire(env.BROWSER);
const browser = await connect(env.BROWSER, sessionId);
```

### Response event listener migration

The `page.on('response', ...)` listener for tracking `totalBytes` translates directly:

```javascript
// Puppeteer (current)
page.on('response', (resp) => {
  const cl = resp.headers()['content-length'];
  // ...
});

// Playwright
page.on('response', (resp) => {
  const cl = resp.headers()['content-length'];
  // ...
});
```

The `response` event API is identical between Puppeteer and Playwright. `resp.headers()` returns an object in both cases. No changes needed.

### Migration risk: Low

Method rename plus import refactor. The isolation model is equivalent.

---

## (f) TOCTOU Gap: Does `page.route()` Close It?

### Current backlog items

From `docs/backlog.md`:
- "[should] TOCTOU gap mitigation -- Browser Rendering re-resolves DNS independently"
- "[should] Puppeteer request interception for cross-domain navigation blocking -- defense-in-depth against TOCTOU in browser session; currently interception is in place for subresource counting only; accepted risk for MVP"

### How `page.route()` addresses this

The TOCTOU concern is: after URL validation confirms the hostname resolves to a safe IP, the browser could be redirected to a different (potentially internal) host via a server-side redirect or client-side navigation. The current Puppeteer interception only counts subresources; it doesn't block cross-domain navigations.

Playwright's `page.route('**/*', handler)` intercepts **ALL requests**, including:
- The initial navigation (main frame document request)
- Server-side redirects (301/302 -- each redirect leg is intercepted separately)
- Client-side navigations (JavaScript `window.location`, meta refresh)
- Subresource loads (scripts, images, fonts, etc.)

To block cross-domain navigation, the route handler can inspect the request's URL and frame:

```javascript
await page.route('**/*', async (route) => {
  const requestUrl = new URL(route.request().url());
  const targetOrigin = new URL(url).origin; // the validated capture URL

  // Block navigations to different origins
  if (route.request().isNavigationRequest() && requestUrl.origin !== targetOrigin) {
    await route.abort('blockedbyclient');
    return;
  }

  // Existing subresource counting logic...
  await route.continue();
});
```

### Does this fully close the TOCTOU gap?

**Partially.** `page.route()` addresses the **cross-domain navigation** component of the TOCTOU gap. It prevents the browser from following redirects to different hostnames after the initial URL validation.

**It does NOT address the DNS re-resolution gap.** The browser makes its own DNS queries independently of the Worker's `validateUrl()` resolution. Between the time `validateUrl()` confirms the IP is safe and the browser's DNS resolver queries the same hostname, the DNS record could change (via short TTL or DNS rebinding) to point to an internal IP. This gap exists regardless of Puppeteer vs. Playwright -- it's a consequence of the browser having its own network stack.

### Backlog update recommendation

After migration, the cross-domain navigation blocking backlog item can be marked **DONE** (with the `page.route()` implementation as evidence). The DNS re-resolution gap item should remain as `[should]` with updated context noting that the navigation blocking is now addressed but DNS-level TOCTOU is still open.

---

## Recommendations

### 1. Use context-level viewport instead of page-level setViewportSize

Set the viewport at context creation time for the initial 1280x720. Only use `page.setViewportSize()` for the dynamic height adjustment (capping at `MAX_PAGE_HEIGHT`).

```javascript
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
});
const page = await context.newPage();
// Later, if height exceeds cap:
await page.setViewportSize({ width: 1280, height: MAX_PAGE_HEIGHT });
```

### 2. Add cross-domain navigation blocking in the route handler

This is the right moment to close the TOCTOU navigation gap since the route handler is being rewritten anyway. Check `route.request().isNavigationRequest()` and compare origins.

### 3. Evaluate the `waitUntil` strategy carefully

The loss of `networkidle2` semantics is the highest-risk API difference. Recommend testing with a set of known-problematic URLs (pages with analytics, chat widgets, SSE) under both `networkidle` and `load` + settle strategies before committing to one approach.

### 4. Add `await` to all route action calls

The Puppeteer-to-Playwright interception migration has one pervasive gotcha: `route.abort()`, `route.continue()`, and `route.fulfill()` are all async and must be awaited. Missing `await` will cause silent request stalls.

### 5. Verify `page.screenshot()` return type in Workers

In standard Node.js Playwright, `page.screenshot()` returns a `Buffer`. In the Cloudflare Workers environment (no Node.js `Buffer`), verify the return type is `Uint8Array` or something R2's `put()` accepts. This should be tested early in the migration.

---

## Proposed Tasks

| # | Task | Dependency | Risk |
|---|------|------------|------|
| 1 | Replace `import puppeteer` with `import { launch, connect, acquire, sessions } from '@cloudflare/playwright'` | None | Low |
| 2 | Replace `page.setRequestInterception(true)` + `page.on('request')` with `page.route('**/*', handler)` including cross-domain navigation blocking | None | Low |
| 3 | Add `await` to all `route.abort()` and `route.continue()` calls | Task 2 | Low (easy to miss) |
| 4 | Replace `page.setViewport()` with context-level viewport + `page.setViewportSize()` for dynamic adjustment | None | Low |
| 5 | Replace `waitUntil: 'networkidle2'` with chosen wait strategy | Decision at approval gate | Medium |
| 6 | Replace `browser.createBrowserContext()` with `browser.newContext()` | None | Low |
| 7 | Verify `page.screenshot()` return type in Cloudflare Workers environment | None | Low |
| 8 | Verify `page.on('response')` API compatibility (header access pattern) | None | Low |
| 9 | Update `categorizeError()` for Playwright error message patterns | Playwright migration complete | Medium |
| 10 | Update TOCTOU backlog items -- navigation blocking DONE, DNS gap remains | Task 2 | Low |

---

## Risks and Concerns

### Risk 1: `networkidle` vs `networkidle2` behavior regression (MEDIUM)

Playwright's `networkidle` is stricter than Puppeteer's `networkidle2` (0 vs 2 allowed connections). Pages with persistent connections (analytics, WebSockets, SSE) that captured successfully under Puppeteer may timeout under Playwright.

**Mitigation**: Test with a diverse set of URLs before deployment. Consider `waitUntil: 'load'` + settle time as an alternative. This should be a decision at the session lifecycle approval gate.

### Risk 2: Missing `await` on route actions causes silent stalls (LOW-MEDIUM)

Puppeteer's `req.abort()` and `req.continue()` are synchronous-style (fire-and-forget). Playwright's equivalents return Promises. If `await` is omitted, requests stall silently -- no error, no timeout, just a hung page.

**Mitigation**: Code review specifically checking that every `route.abort()` and `route.continue()` call is awaited. Add a lint rule or code comment warning.

### Risk 3: `page.screenshot()` return type in Workers (LOW)

The Cloudflare Playwright fork runs in a Workers environment without Node.js `Buffer`. The return type of `page.screenshot()` may differ from standard Playwright.

**Mitigation**: Test screenshot capture early in the migration. If the return type isn't directly compatible with R2's `put()`, wrap in `new Uint8Array()`.

### Risk 4: Playwright error messages differ from Puppeteer (LOW-MEDIUM)

The `categorizeError()` function pattern-matches on Puppeteer-specific error strings ("Navigation timeout", "net::ERR"). Playwright may produce different error messages for the same failures (e.g., "page.goto: Timeout 25000ms exceeded" instead of "Navigation timeout of 25000 ms exceeded").

**Mitigation**: After migration, test each error path (timeout, navigation failure, etc.) and update `categorizeError()` matchers to handle Playwright's error message formats. Keep the Puppeteer patterns as fallbacks during the transition since the matcher is inclusive (substring matching).

---

## Additional Agents Needed

- **Edge-minion**: Must confirm whether `page.route()` works correctly in the Cloudflare Playwright fork. The Cloudflare docs show no `page.route()` examples, which could indicate it's untested or has limitations in the fork. Edge-minion should verify this against the fork's source or Cloudflare support.
- **Security-minion**: The cross-domain navigation blocking implementation (checking `route.request().isNavigationRequest()` and comparing origins) needs security review. The origin comparison logic must handle edge cases: subdomains, port differences, protocol upgrades, `about:blank` navigations, data: URIs, and blob: URLs.
- **Test-minion**: The `stubRenderer` injection pattern in tests is unaffected by the migration (tests inject a mock renderer, they don't call Puppeteer/Playwright directly). However, `categorizeError()` tests need updating for Playwright error message patterns.
