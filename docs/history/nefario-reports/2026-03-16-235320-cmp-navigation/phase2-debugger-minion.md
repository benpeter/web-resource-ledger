## Domain Plan Contribution: debugger-minion

### Summary of Investigation

I traced the proposed fix (`route.request().frame() === page.mainFrame()`) through the Playwright source code in `@cloudflare/playwright@1.1.2` to answer all four sub-questions. The investigation uncovered critical bugs in the proposed approach that would cause runtime crashes.

---

### Findings

#### (1) Does `request.frame()` resolve correctly for requests after page creation?

**Yes, but only after the page is fully created.** The `frame()` method in `network.js:116-129` has two throw paths:

```javascript
frame() {
    if (!this._initializer.frame) {
      throw new Error("Service Worker requests do not have an associated frame.");
    }
    const frame = Frame.from(this._initializer.frame);
    if (!frame._page) {
      throw new Error(
        "Frame for this navigation request is not available, because the request " +
        "was issued before the frame is created..."
      );
    }
    return frame;
}
```

The `_page` property on a frame is set during `Page` construction (`page.js:50`): `this._mainFrame._page = this`. For iframe sub-frames, it's set in `_onFrameAttached` (`page.js:95`). After `context.newPage()` resolves, `frame()` works correctly for all requests. But for any request that fires *during* page creation (see finding 4), `frame()` throws.

For normal post-creation requests: `request.frame()` returns a `Frame` object. Comparing `request.frame() === page.mainFrame()` correctly identifies main-frame vs. sub-frame requests. This is a sound approach when the timing is right.

#### (2) How does Playwright handle the BBC 301 redirect (bbc.com -> bbc.co.uk)?

**Redirects do NOT trigger the route handler for each hop.** This is the most important finding for the proposed fix.

In `crNetworkManager.js:285`, when processing a redirected request:
```javascript
if (redirectedFrom || !this._userRequestInterceptionEnabled && ...) {
    // Auto-continue, no route created
    requestPausedSessionInfo.session._sendMayFail("Fetch.continueRequest", ...);
} else {
    route = new RouteImpl(requestPausedSessionInfo.session, requestPausedEvent.requestId);
}
```

When `redirectedFrom` is truthy (i.e., this is a redirect hop), `route` is set to `null`. The request is auto-continued. No `route` event fires on the client side. The user's `context.route()` callback is **never invoked** for redirect hops.

Then in `frames.js:228-229`:
```javascript
if (route)
    new Route(request, route).handle([...page.requestInterceptors, ...context.requestInterceptors]);
```

Since `route` is null for redirects, the handler is skipped entirely.

**Implication**: For the BBC 301 redirect (bbc.com -> bbc.co.uk), the route handler fires only for the initial `bbc.com` request. The redirect to `bbc.co.uk` is auto-continued by Playwright internals. The current code (`isNavigationRequest()` + origin check) sees the initial `bbc.com` request, whose origin matches `targetOrigin`, and lets it through. The redirect to `bbc.co.uk` silently succeeds without interception.

This means the **current** cross-domain navigation block does not actually catch same-origin-to-cross-origin redirects. This is an existing gap, not something the proposed fix introduces or fixes. However, the `page.goto()` call does set the final URL after redirects, and the response URL would be `bbc.co.uk`. This is worth documenting but is not a regression.

#### (3) Edge cases where `request.frame()` returns null?

**`frame()` never returns null** -- it throws instead. The two throw paths are documented in finding (1):

1. **Service worker requests**: `this._initializer.frame` is undefined. Throws "Service Worker requests do not have an associated frame." However, the code already has `serviceWorkers: 'block'` in the context options (line 357), so this path should not be hit.

2. **Pre-page-creation requests**: `frame._page` is null. Throws "Frame for this navigation request is not available...". This can happen for the initial `about:blank` navigation during `newPage()`.

There is also `_safePage()` (`network.js:131-133`) which returns null gracefully:
```javascript
_safePage() {
    return Frame.fromNullable(this._initializer.frame)?._page || null;
}
```

Playwright's own `_onRoute` in `browserContext.js:170` uses `_safePage()` to handle these cases, but `_safePage()` is a private API not available to user code.

#### (4) Is there a timing issue where the `page` variable is not yet assigned when the route callback fires?

**Yes, this is a critical bug in the proposed approach.**

The route is registered at line 367 (`context.route('**/*', async (route) => { ... })`). The `page` is declared at line 392 (`const page = await context.newPage()`). Both are in the same `try` block, so the route callback closure does close over the `page` binding.

However, `const page` is in the Temporal Dead Zone (TDZ) until line 392 executes. If the route callback fires during `context.newPage()` (before the assignment), accessing `page` throws a `ReferenceError: Cannot access 'page' before initialization`.

**Will the route handler actually fire during `newPage()`?**

When `context.newPage()` is called, the browser creates a new target navigating to `about:blank`. The `about:blank` navigation typically does **not** go through the CDP `Fetch.requestPaused` event (it's not a network request), so the route handler likely does NOT fire for the initial `about:blank` navigation. However, this behavior is implementation-dependent and not guaranteed across Chromium versions.

Even if `about:blank` doesn't trigger the route, the proposed code creates a latent bug: any code change that causes a real network request during page creation (e.g., a Cloudflare fork change, a browser extension, a service worker that somehow bypasses the block) would crash the route handler with a TDZ error.

**The safe approach**: Use `let page = null` declared before the route handler, assigned after `newPage()`. The route callback checks `page !== null` before accessing `page.mainFrame()`.

---

### Recommendations

1. **Do NOT use `route.request().frame()` directly** -- it throws for edge cases. If using frame-based detection, wrap it in a try/catch or use an alternative approach.

2. **The correct approach to distinguish main-frame from sub-frame navigation** is:
   ```javascript
   let page = null;  // Declared before route registration

   await context.route('**/*', async (route) => {
     const req = route.request();
     if (req.isNavigationRequest() && new URL(req.url()).origin !== targetOrigin) {
       // If page hasn't been created yet, this is infrastructure navigation (safe)
       if (!page) {
         await route.continue();
         return;
       }
       // Only block if this is a main-frame navigation
       try {
         const frame = req.frame();
         if (frame === page.mainFrame()) {
           await route.abort('blockedbyclient');
           return;
         }
       } catch {
         // frame() threw -- request issued before frame is available.
         // For navigation requests where frame() fails, safe to allow
         // since this is an infrastructure request.
         await route.continue();
         return;
       }
     }
     // ... rest of handler
   });

   page = await context.newPage();
   ```

3. **Alternative approach (simpler, no frame() dependency)**: Check the request's `resourceType()`. Main-frame navigations have `resourceType() === 'document'`, sub-frame navigations also return `'document'`. However, you can check whether the request's frame is the main frame via `request.frame().parentFrame === null` (main frames have no parent). But this still requires the try/catch for `frame()`.

4. **Simplest safe approach**: Keep the existing origin-based check but exclude known CMP domains. This avoids the frame() complexity entirely but is less general.

### Proposed Tasks

1. **Refactor `page` variable declaration**: Change `const page = await context.newPage()` to `let page = null` before the route handler, with `page = await context.newPage()` after route registration. This eliminates the TDZ risk.

2. **Add frame-based main-frame guard with defensive try/catch**: In the route callback, wrap `route.request().frame()` in try/catch. If `frame()` throws, treat the request as non-main-frame (allow it). If it succeeds, compare to `page.mainFrame()`.

3. **Add null-page guard**: Before accessing `page.mainFrame()`, check `if (!page)` and allow the request. This handles the window between route registration and page creation.

4. **Document the redirect behavior**: Add a code comment noting that Playwright does not invoke route handlers for redirect hops. The existing security comment about "closes TOCTOU gap" should be amended to note that server-side redirects (301/302) bypass the route handler entirely. This is an existing limitation, not introduced by this change.

5. **Add regression test**: Test that a page with a cross-origin CMP iframe (e.g., a Sourcepoint or TrustArc iframe navigating to `consent.cookiebot.com` or similar) is NOT blocked by the navigation guard.

6. **Add test for main-frame cross-origin navigation still being blocked**: Verify that a page attempting `window.location = 'https://evil.com'` is still blocked.

### Risks and Concerns

1. **CRITICAL: TDZ crash**: The proposed `route.request().frame() === page.mainFrame()` will throw `ReferenceError` if the route callback fires before `page` is assigned. Even if this doesn't happen today, it's a latent crash waiting for an environmental change to trigger it.

2. **CRITICAL: `frame()` throws, not returns null**: The proposed code assumes `frame()` returns a value that can be compared. In edge cases (service worker requests, pre-creation requests), it throws. Any code using `frame()` MUST be wrapped in try/catch.

3. **MEDIUM: Redirect bypass is pre-existing**: The route handler does not fire for HTTP redirect hops. A server that redirects `https://safe.com` -> `https://evil.com` is not caught by the route handler. This is an existing gap, not introduced by this change, but worth documenting. The `about:blank` -> `page.goto(url)` flow is safe because `page.goto()` issues a fresh navigation request (not a redirect), which does trigger the route handler.

4. **LOW: Cloudflare fork divergence**: The analysis is based on standard Playwright's Chromium CDP code path. The `@cloudflare/playwright` fork may have different behavior in the remote browser rendering environment (e.g., different CDP event sequencing, modified `Fetch` domain behavior). The proposed fix should be tested against the actual Cloudflare browser binding, not just assumed to match upstream Playwright behavior.

5. **LOW: `about:blank` route interception**: While `about:blank` navigations typically don't trigger CDP `Fetch.requestPaused`, this is not formally guaranteed. If the Cloudflare environment intercepts `about:blank`, the route handler would fire with `page` in TDZ (with the proposed code) or `page === null` (with the recommended fix). The recommended fix handles this correctly.

### Additional Agents Needed

- **security-minion**: Should review the redirect bypass gap (finding 2). Server-side 301/302 redirects from a same-origin URL to a cross-origin URL bypass the route handler entirely. This is pre-existing but was not previously documented. Security-minion should assess whether this needs a separate mitigation (e.g., checking the final response URL after navigation completes).
