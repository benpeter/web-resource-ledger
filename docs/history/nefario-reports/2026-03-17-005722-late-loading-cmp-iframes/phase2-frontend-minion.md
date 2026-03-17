## Domain Plan Contribution: frontend-minion

### Recommendations

**Use `page.on('framenavigated')` as the primary event, NOT `frameattached`. Register the listener immediately after `exposeBinding()` (binding path) or immediately before the initial `page.evaluate()` (polling path), both inside `dismissCookieConsent()`. Use a `Set<Frame>` to deduplicate between the initial `page.frames()` loop and late-arriving events. Do not call `frame.waitForLoadState()` -- Playwright's `frame.evaluate()` already awaits execution context readiness internally.**

Here is the detailed analysis:

#### Which event: `frameattached` vs `framenavigated` vs both?

**Use `framenavigated` only.** Here is the reasoning:

1. **`frameattached` fires too early.** When a frame is first attached to the page, Playwright creates the Frame object with its execution context set to `null`. The `_setContext("main", null)` call in the Frame constructor creates a new unresolved `ManualPromise`. The execution context is only created later when the browser's CDP/BiDi layer reports that the frame has navigated and a JavaScript context exists. Calling `frame.evaluate()` on a just-attached frame will therefore **block** until the context resolves -- it will not fail, but it introduces an unbounded wait that could exceed the 8s timeout without doing useful work.

2. **`framenavigated` fires when the frame commits a navigation to a URL.** At this point, the frame has a document and the execution context has been created (the server-side `frameCommittedNewDocumentNavigation` calls `_contextCreated` which resolves the ManualPromise). Calling `frame.evaluate()` immediately after `framenavigated` is safe -- the context is already resolved or will resolve within the same microtask batch.

3. **`frameattached` does not fire for `src="javascript:void(0)"` frames** (Playwright issue #4890 confirmed this is by design). Some CMPs create iframes this way. However, `framenavigated` also does not fire for these frames because `javascript:` URIs keep the initial blank document. The good news: autoconsent detects CMPs by evaluating code in frames that have navigated to real URLs (Sourcepoint loads `https://sourcepoint.mgr.consensu.org/...`, OneTrust loads `https://cdn.cookielaw.org/...`). Frames with `javascript:void(0)` are typically intermediate shims, not the detection targets.

4. **Iframes that navigate to `about:blank` are edge cases.** Playwright fires `frameattached` but NOT `framenavigated` for `about:blank` iframes. These are not CMP detection targets -- autoconsent needs a real document with the CMP's JavaScript running. Skipping `about:blank` frames is correct behavior, not a gap.

5. **`framenavigated` fires for EVERY navigation, including same-document navigations.** This means the listener may fire multiple times for the same frame (e.g., Sourcepoint iframe loading, then navigating internally). Deduplication is needed to avoid injecting autoconsent twice.

6. **Why not both?** Adding `frameattached` gains nothing. Every frame that eventually gets a document will fire `framenavigated`. The only frames that fire `frameattached` without `framenavigated` are `about:blank` and `javascript:void(0)` frames, which are not CMP targets. Using both events doubles the deduplication surface and adds complexity for no coverage gain.

#### When to register the listener

**Register BEFORE the initial `page.frames()` loop, AFTER `exposeBinding()`.** The sequence must be:

```
1. exposeBinding('autoconsentSendMessage', handler)   -- binding path
2. page.on('framenavigated', injectIntoFrame)         -- catch late frames
3. page.evaluate(inject, [autoconsentScript])          -- main frame
4. for (const frame of page.frames()) { ... }         -- existing frames
5. Promise.race([resultPromise, timeoutPromise])       -- wait for outcome
```

The listener must be registered before step 4 (the `page.frames()` snapshot) to close the race window. If a CMP iframe navigates between step 4 and step 5, the `framenavigated` listener catches it. If the listener were registered after step 4, there would be a gap where a frame could navigate without being injected.

The listener must be registered after step 1 (exposeBinding) because autoconsent's `init` message fires synchronously upon injection. If autoconsent is injected into a frame before the binding is registered, the `init` message is lost and autoconsent silently stalls.

For the polling path, the same sequence applies (listener registered before the initial frame loop), but the binding step is replaced by the initial `page.evaluate(wrappedScript)`.

#### Deduplication strategy

Use a `Set<Frame>` to track which frames have already been injected:

```javascript
const injectedFrames = new Set();

function injectIntoFrame(frame) {
  if (frame === page.mainFrame()) return;  // main frame injected separately
  if (injectedFrames.has(frame)) return;   // already injected
  injectedFrames.add(frame);
  frame.evaluate(inject, [autoconsentScript]).catch(() => {});
}

// Register listener
page.on('framenavigated', injectIntoFrame);

// Initial injection
await page.evaluate(inject, [autoconsentScript]);
injectedFrames.add(page.mainFrame());
for (const frame of page.frames()) {
  injectIntoFrame(frame);  // dedup handled inside
}
```

This handles three cases cleanly:
- **Frame exists at injection time**: caught by `page.frames()` loop, added to Set
- **Frame navigates after injection**: caught by `framenavigated` listener, added to Set
- **Frame navigates twice** (same-document or cross-document): second call is a no-op via Set check

The Set uses Frame object identity (reference equality), which is correct because Playwright reuses the same Frame object across navigations within the same iframe element. A frame that navigates to a new URL gets a new execution context but the same Frame object -- the old autoconsent injection is destroyed by the navigation, so re-injection on the second `framenavigated` event is actually correct. **Revision**: the Set should track injected frames to prevent double-injection during the initial loop + listener overlap, but should NOT prevent re-injection on subsequent navigations. The dedup protects against the race between the initial loop and the listener firing for the same frame, not against legitimate re-navigations.

Wait -- this needs more thought. A CMP iframe that navigates internally (e.g., Sourcepoint loads a consent management URL, then navigates to a different consent page) would benefit from re-injection because the first navigation's execution context is destroyed. But autoconsent's detection runs on the first navigation, and re-injection on the second would restart detection, potentially conflicting with in-progress opt-out flows.

**Revised dedup strategy**: Use `Set<Frame>` to prevent double-injection during the initial injection window (overlap between `page.frames()` loop and `framenavigated` listener). Do NOT re-inject into frames that have already been injected even if they navigate again. Autoconsent handles internal navigations within its own lifecycle. If the execution context is destroyed by a navigation, autoconsent's `init` message won't fire from the old injection, and the CMP detection will time out naturally. Re-injecting mid-flow risks conflicting with in-progress opt-out sequences.

#### Race conditions with the 8s timeout

The `framenavigated` listener fires asynchronously. If a CMP iframe loads at t=7.5s, autoconsent has only 500ms to detect and dismiss the CMP. This is acceptable -- the 8s timeout is a budget, not a guarantee. The listener gives autoconsent the best possible chance by injecting as soon as the frame is ready, but if the CMP loads too late, timeout is the correct outcome.

One subtlety: the `framenavigated` listener fires asynchronously from the main event loop, but `frame.evaluate()` inside the listener awaits the execution context. In Playwright's architecture, the context is already resolved when `framenavigated` fires (the event is emitted from `frameCommittedNewDocumentNavigation` which is called after `_contextCreated`). So the `evaluate` call should resolve quickly (network round-trip to browser, not waiting for context creation). The total overhead per late frame injection is ~5-20ms, well within the timeout budget.

**The listener must be cleaned up.** After `Promise.race` resolves (either consent result or timeout), remove the listener to avoid injecting into frames that appear during the post-consent screenshot phase:

```javascript
const outcome = await Promise.race([resultPromise, timeoutPromise]);
page.off('framenavigated', injectIntoFrame);
return { ...outcome, durationMs: Date.now() - start };
```

#### Compatibility with both paths (exposeBinding and polling)

**Binding path**: The `framenavigated` listener injects `autoconsentScript` via `frame.evaluate(inject, [autoconsentScript])`. The binding (`autoconsentSendMessage`) is already registered page-wide by `exposeBinding()`, so autoconsent in the new frame can immediately call the binding. The `source.frame` routing in the binding callback already handles messages from any frame. No changes needed to the binding callback.

**Polling path**: The `framenavigated` listener injects `wrappedScript` (which includes the polling shim that writes to `window.__autoconsentResult`). The polling loop already iterates `page.frames()` on each cycle, so it will pick up results from late-injected frames. No changes needed to the polling loop -- but the injection into late frames is the new part.

The key difference: in the binding path, the inject function is `([script]) => { const fn = new Function(script); fn(); }` with `[autoconsentScript]` as the argument. In the polling path, the inject function is the entire `wrappedScript` string (which includes the autoconsentSendMessage override). The `framenavigated` listener must use the correct injection payload for each path.

**Implementation approach**: Pass the injection function and payload as parameters when setting up the listener, or define the listener inside each path's function where the correct payload is in scope. The latter is simpler and avoids adding parameters.

#### `frame.waitForLoadState()` -- do NOT use

Playwright's `frame.evaluate()` internally awaits the execution context via `_mainContext()` which returns the `contextPromise`. The context is resolved when the browser reports that a JavaScript execution context has been created for the frame. This happens before `DOMContentLoaded` fires. Calling `frame.waitForLoadState('domcontentloaded')` before `evaluate()` would add unnecessary latency -- autoconsent doesn't need the DOM to be fully parsed, it just needs to be able to run JavaScript in the frame. The earlier it runs, the better its chance of detecting the CMP before the 8s timeout.

### Proposed Tasks

1. **Add `page.on('framenavigated')` listener to `_dismissWithBinding()`** (the primary change)
   - Create `injectedFrames = new Set()`
   - Define `injectIntoFrame(frame)` that checks dedup, skips mainFrame, injects autoconsent
   - Register listener after `exposeBinding()`, before main frame injection
   - Update existing `page.frames()` loop to use `injectIntoFrame()` for dedup
   - Remove listener with `page.off()` after `Promise.race` resolves
   - Estimated: 15-20 lines of new code, 5-10 lines of modified code

2. **Add `page.on('framenavigated')` listener to `_dismissWithPolling()`** (parallel change)
   - Same pattern as binding path but with `wrappedScript` payload
   - The polling loop's `page.frames()` iteration already handles result collection from late frames
   - Register listener before initial injection, remove after polling completes or times out
   - Estimated: 15-20 lines of new code, 5-10 lines of modified code

3. **Update consent.js header comment** to document the frame event listener pattern
   - Describe the three injection vectors: main frame, existing child frames, late-arriving frames
   - Note the dedup strategy and cleanup

4. **Do NOT add `frame.waitForLoadState()`** (explicit non-task)
   - Playwright's `evaluate()` already awaits context readiness internally
   - Adding explicit load-state waits would reduce the time budget for CMP detection

### Risks and Concerns

1. **Execution context destruction during evaluate.** If a CMP iframe navigates again while `frame.evaluate()` is in progress (the injection call), the execution context is destroyed and evaluate rejects. The existing `.catch(() => {})` on frame.evaluate handles this -- the error is silently swallowed, which is correct because the old execution context's injection is now irrelevant and the new navigation will trigger another `framenavigated` event... BUT the Set-based dedup will prevent re-injection on the second navigation. **Decision needed**: Should the dedup Set track frame+URL pairs instead of just frames? This would allow re-injection when a frame navigates to a different URL (new execution context) while still preventing double-injection during the initial overlap window. However, this adds complexity for a scenario (CMP iframe navigating twice) that may not occur in practice. **Recommendation**: Start with frame-only dedup. If Sourcepoint's opt-out failure (the Guardian/Spiegel `failed` status) turns out to be caused by a multi-navigation pattern, revisit with frame+URL dedup as a targeted fix.

2. **Listener fires during screenshot phase.** If a CMP iframe navigates during the post-consent screenshot (after `dismissCookieConsent()` returns), the listener should NOT inject autoconsent -- it could modify the page between screenshots. The `page.off('framenavigated', injectIntoFrame)` cleanup after `Promise.race` resolves handles this. But there is a micro-race: if `framenavigated` fires between Promise.race resolution and `page.off()`, the injection will proceed. **Mitigation**: Add a `let active = true` flag that is checked inside `injectIntoFrame()` and set to `false` before `page.off()`. This closes the micro-race.

3. **Memory leak from listener not being removed.** If `dismissCookieConsent()` throws before reaching the cleanup line, the listener stays registered. The `try/catch` in the outer `dismissCookieConsent()` function catches errors but doesn't clean up the listener. **Mitigation**: Use a try/finally pattern inside `_dismissWithBinding` to ensure `page.off()` is called even on unexpected errors.

4. **@cloudflare/playwright fork compatibility.** The `framenavigated` event is in the type definitions (confirmed: `types/types.d.ts` line 1122) and the server-side event dispatch code (confirmed: `lib/playwright-core/src/server/frames.js` line 171 calls `frameNavigatedToNewDocument` which emits through the Page events system). The event mapping is present in `events.js` line 48. This is standard Playwright API, not a custom extension, so the Cloudflare fork should support it fully. **Risk**: If the Cloudflare fork has patches that suppress or delay frame events, the listener would silently miss late frames. The existing `page.frames()` loop would still work as before. **Mitigation**: Staging validation will reveal whether the events fire as expected.

5. **Sourcepoint `failed` status is likely NOT a timing issue.** The Guardian and Spiegel show `cmp=Sourcepoint-frame` detected but `status=failed`. This means autoconsent's detection works (it found the CMP) but the opt-out flow fails. This is probably an autoconsent rule issue (wrong button selector, missing step in the opt-out sequence) or a timing issue within autoconsent's own retry logic, not a frame injection timing issue. The `framenavigated` listener fixes the NYT/OneTrust `notDetected` problem but is unlikely to fix the Sourcepoint `failed` problem. These are separate issues with separate root causes.

### Additional Agents Needed

- **debugger-minion**: Should verify that `page.on('framenavigated')` actually fires for CMP iframes on the Cloudflare Workers Playwright runtime. The Phase 0033 debugger-minion traced the Playwright source for `Request.frame()` behavior -- the same approach should confirm that frame lifecycle events propagate correctly through the Cloudflare fork's client/server boundary. This is the single highest-risk unknown: if the event doesn't fire, the entire approach fails silently.

- No other agents needed beyond what's already planned. The implementation is contained within `consent.js` and follows patterns already established in the file.
