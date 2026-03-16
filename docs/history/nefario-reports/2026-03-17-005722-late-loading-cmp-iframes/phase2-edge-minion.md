# Edge Minion Planning Contribution: Workers Runtime Constraints for Frame Event Listeners

## Question Addressed

Does `@cloudflare/playwright` support `page.on('frameattached')` and `page.on('framenavigated')`? Are there timing differences in the Workers gVisor sandbox vs local Playwright? Could frame event delivery interact badly with the 8s consent timeout? Any `ctx.waitUntil` budget concerns (current worst-case ~33s against 30s limit)?

## Findings

### 1. Frame Event API Support -- Confirmed in Type Definitions

The installed `@cloudflare/playwright@1.1.2` package exports full Playwright type definitions for `page.on('frameattached')`, `page.on('framenavigated')`, and `page.on('framedetached')`. These are declared in `node_modules/@cloudflare/playwright/types/types.d.ts` (lines 1112-1122) with all standard listener patterns (`on`, `once`, `addListener`, `removeListener`, `off`, `prependListener`, `waitForEvent`).

The `@cloudflare/playwright` package is a fork of upstream Playwright (synced to v1.55+), compiled to run inside the Workers runtime. It re-exports the full `types/types.d.ts` from upstream Playwright. The Cloudflare-specific additions are limited to session management (`sessions()`, `acquire()`, `connect()`, `limits()`, `history()`) and a `Browser.sessionId()` method. The fork does not remove or stub out standard Playwright APIs -- it adds to them.

**Assessment: `page.on('frameattached')` and `page.on('framenavigated')` are available.** These are CDP-level events forwarded through the Playwright protocol layer. The Workers runtime communicates with the browser process over WebSocket (the `connect()` pattern), and CDP frame lifecycle events are part of the core protocol that any Playwright operation depends on (e.g., `page.frames()` itself uses the frame tree built from these events internally).

However: **availability in type definitions is not a guarantee of runtime behavior in the gVisor sandbox.** The type definitions are copied from upstream Playwright, not generated from the Workers runtime's actual capabilities. There is no Cloudflare documentation explicitly confirming or denying frame event support. The implementation should include a defensive fallback (see Recommendations).

### 2. addInitScript and exposeBinding -- Also Available

Both `context.addInitScript()` and `page.exposeBinding()` are present in the type definitions. The existing `consent.js` already uses `page.exposeBinding()` as the primary path (line 87) with a polling fallback when unavailable. This confirms `exposeBinding` works in the Workers runtime today.

`context.addInitScript()` is particularly relevant: it runs a script in every frame before any other script, including frames created after registration. This is Playwright's built-in mechanism for exactly the "inject into late-loading frames" problem. However, there is a critical limitation: `addInitScript` runs before the page's own scripts, which means autoconsent's `autoconsentSendMessage` binding may not yet exist when the init script runs in a new frame. The `exposeBinding` approach already handles this correctly since bindings are registered at the protocol level and available immediately. The frame event listener approach (inject on `frameattached`/`framenavigated`) is more reliable for this use case because it injects after the frame has a document context.

### 3. gVisor Sandbox Timing -- No Evidence of Frame Event Latency Issues

The Cloudflare Browser Rendering architecture runs Chromium inside a gVisor sandbox with the browser process communicating to the Worker via WebSocket. Frame lifecycle events (`frameattached`, `framenavigated`) are CDP events that flow over this same WebSocket channel. There is no documented evidence of additional latency on frame events vs other CDP events (navigation, response, etc.) that already work correctly in the existing codebase.

The existing code already processes per-frame CDP events successfully:
- `page.on('response')` works (capture.js line 412)
- `page.frames()` returns the correct frame tree (consent.js line 156)
- `frame.evaluate()` works for cross-origin frames (consent.js line 159)
- `route.request().frame()` works for frame identification (capture.js line 383)

All of these depend on the same CDP frame lifecycle tracking that `frameattached`/`framenavigated` expose. If frame events were broken or severely delayed, the existing frame enumeration and evaluation would also be broken.

**Assessment: No evidence of gVisor-specific frame event timing issues.** The risk is low but non-zero. Validate with staging tests against the 14-site test set.

### 4. ctx.waitUntil Budget -- The 33s Concern is a Misconception

This is the most important finding. **The timing budget comment in capture.js is conservative but not actually at risk of hitting a hard limit.**

The `ctx.waitUntil` documentation states: "The Worker's lifetime is extended for up to **30 seconds after the response is sent** or the client disconnects." The 202 response is sent immediately after `ctx.waitUntil(performCapture(...))` is called (index.js lines 192-202). The response includes `createCapture` KV write and JSON serialization -- call it ~50ms. After that, the full 30s window is available for `performCapture`.

The worst-case pipeline:
```
Response sent (t=0 for waitUntil clock)
  |
  +-- getOrCreateSession:  ~500ms (session list + connect)
  +-- context setup:       ~200ms
  +-- page.goto(load):     up to 20,000ms (NAV_TIMEOUT_MS)
  +-- settle delay:        3,000ms
  +-- before screenshot:   ~500ms
  +-- consent dismissal:   up to 8,000ms (CONSENT_TIMEOUT_MS)
  +-- after screenshot:    ~500ms
  +-- page.content():      ~200ms
  +-- context.close():     ~200ms
  +-- browser.close():     ~100ms
  = ~33,200ms pipeline total
```

But the 30s waitUntil clock starts when the 202 is returned, not when `performCapture` starts. The response returns almost immediately (KV write is ~10ms, no heavy computation). So the effective budget is:

```
30,000ms (waitUntil budget after response sent)
- ~50ms (time between ctx.waitUntil call and response return)
= ~29,950ms available for performCapture
```

**The actual risk: 33.2s worst-case pipeline vs 29.95s available = ~3.2s overshoot in the absolute worst case.** This is a real concern, but it only triggers when ALL of:
1. Navigation takes the full 20s (timeout)
2. Consent takes the full 8s (timeout)
3. Both screenshots and content extraction are slow

In practice, as the capture.js header comment notes: "in practice load fires in 2-5s." When navigation is fast (5s), the pipeline is: 5 + 3 + 8 + ~1.5 = ~17.5s -- well within budget.

**The frame event listener change does not worsen this budget.** Frame event listeners are passive observers registered once. They fire asynchronously as frames arrive during the 8s consent timeout window that is already allocated. The injection into a late frame (`frame.evaluate(inject, ...)`) adds negligible time (<100ms) and runs concurrently with the consent timeout.

However: **the budget IS tight for navigation-timeout cases.** When `page.goto()` times out at 20s, the code already falls into the partial capture path (capture.js line 424-481), which skips consent entirely. So the consent + frame events path only runs in the non-timeout case, where navigation completed within 20s. In the worst non-timeout case: ~19.9s navigation + 3s settle + 8s consent + 2s post = ~33s. This exceeds the budget by ~3s.

### 5. Frame Event Listener + Consent Timeout Interaction

When the 8s consent timeout fires, the `Promise.race` in `_dismissWithBinding` (line 167) resolves and `dismissCookieConsent` returns. At that point, the frame event listeners registered via `page.on('frameattached')` are still active on the page object. This is not a problem for correctness -- the listeners will fire for subsequently-attached frames, but the `resolveConsent` callback they might invoke is already resolved (Promises resolve once). The injected scripts in late frames will call `autoconsentSendMessage`, but the binding callback will execute harmlessly (it can only resolve an already-resolved promise or update `detectedCmp` which is no longer read).

**No cleanup is strictly necessary**, but for hygiene and to avoid unnecessary CDP traffic, the implementation should call `page.removeListener('frameattached', handler)` and `page.removeListener('framenavigated', handler)` after the consent timeout resolves. This is especially relevant in the Workers runtime where the WebSocket connection to the browser process is a shared resource.

## Recommendations

### R1: Use `page.on('frameattached')` + `page.on('framenavigated')`, Not `addInitScript`

Register frame event listeners before the initial `page.frames()` injection loop. Use `frameattached` to catch new frames and `framenavigated` to catch frames that navigate to their CMP URL after initial attachment (some CMPs create an about:blank iframe first, then navigate it).

Do NOT use `context.addInitScript()` for autoconsent injection. `addInitScript` runs before page scripts, which creates a timing issue: autoconsent expects `autoconsentSendMessage` to be available as a binding, but the init script runs before bindings are set up in the frame's context. The frame event approach lets you inject after the frame has a document and after bindings are propagated.

### R2: Deduplicate Injection with a WeakSet

Track injected frames in a `WeakSet<Frame>`. Before injecting into a frame (whether from the initial loop or a frame event), check the set. This prevents double-injection when a frame appears in both `page.frames()` and the `frameattached` event (race window between listener registration and initial enumeration).

### R3: Guard Frame Readiness Before Evaluate

`frameattached` fires when the frame is attached to the DOM, but the frame may not have a document context ready for `evaluate()` yet. The implementation should either:
- Use `framenavigated` instead of (or in addition to) `frameattached`, since `framenavigated` fires after the frame commits navigation and has a document.
- Or wrap the `frame.evaluate()` call in a try-catch that retries once after a short delay (50ms) if the first attempt fails with a "frame was detached" or "execution context was destroyed" error.

I favor using both events: `frameattached` to set up the injection attempt, `framenavigated` to actually inject. This matches the Playwright documentation: "Frame object's lifecycle is controlled by three events: `frameattached` (attached to page), `framenavigated` (commits navigation), `framedetached` (detached from page)."

### R4: Clean Up Listeners After Consent Resolution

After `Promise.race` resolves (either consent result or timeout), remove the frame event listeners. This prevents unnecessary CDP round-trips for frame events that arrive after consent handling is complete.

### R5: Do NOT Change the Timing Budget

The frame event listeners do not add to the timing budget. The existing 8s consent timeout already accounts for the time needed to detect and dismiss consent. Late-loading frames that arrive within the 8s window get injected; frames that arrive after are irrelevant (consent has already resolved).

Do not extend the consent timeout to accommodate late frames. If a CMP iframe loads after 8s, the site's CMP implementation is broken or adversarial -- extending the timeout would harm all captures for the sake of an edge case.

### R6: Accept the ctx.waitUntil Budget Risk (No Change Needed Now)

The worst-case 33s vs 30s overshoot is a pre-existing condition, not caused by this change. It only triggers when navigation takes 19-20s (almost timing out) AND consent takes the full 8s. This combination is unlikely: sites that load slowly enough to approach 20s rarely have functional consent popups that also take 8s to dismiss.

If monitoring (Coralogix `capture.success` events with `durationMs > 28000`) shows this is a real problem, the fix is to reduce `SETTLE_DELAY_MS` from 3s to 1s (saving 2s) -- the settle delay is the lowest-value time in the pipeline. But this is a separate backlog item, not part of this fix.

### R7: Defensive Fallback if Frame Events Don't Fire

Include a one-time safety check: after registering `page.on('frameattached')`, verify the listener actually fires by checking `page.listenerCount('frameattached') > 0` (if the EventEmitter API is available). If the Workers runtime silently drops the listener registration, the existing `page.frames()` snapshot injection still works for frames present at injection time -- the change is additive, not replacing existing behavior.

## Proposed Tasks

1. **Register frame event listeners in `_dismissWithBinding`** -- Add `page.on('frameattached')` and `page.on('framenavigated')` handlers before the `page.frames()` injection loop. Handlers inject autoconsent into the new frame using the same `inject` function. Track injected frames in a `WeakSet` for deduplication. Clean up listeners after `Promise.race` resolves. (~30 lines of code)

2. **Register frame event listeners in `_dismissWithPolling`** -- Same pattern but with the polling-path injection script. The polling path's frame iteration in the poll loop (line 225) already handles late frames for result checking, but it needs injection into them too. (~30 lines of code)

3. **Staging validation** -- Test against the 14-site test set. Specifically verify:
   - nytimes.com (OneTrust in late-loading iframe): should now detect and attempt dismissal
   - theguardian.com / spiegel.de (Sourcepoint-frame): frame event listeners should not regress the existing detection
   - bbc.co.uk: should remain `notDetected` (no CMP)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Frame events silently unsupported in Workers runtime | Low | Medium -- falls back to current behavior (snapshot-only injection) | Additive change; existing `page.frames()` loop still runs. Staging validation catches this immediately. |
| `frameattached` fires before frame has document context | Medium | Low -- injection fails silently, caught by try-catch | Use `framenavigated` as the primary injection trigger; `frameattached` as early warning only. |
| Double injection causes autoconsent to run twice in same frame | Medium | Low -- autoconsent is idempotent (checks for existing `autoconsentSendMessage`) | WeakSet deduplication belt-and-suspenders. |
| ctx.waitUntil budget exceeded on slow sites | Low (pre-existing) | Medium -- capture fails silently after 30s, KV left pending | Not caused by this change. Monitor `durationMs` in logs. Separate backlog item if observed. |

## Additional Agents

No additional agents needed beyond what the meta-plan already specifies. The edge runtime constraints are manageable and well-understood. The primary implementation risk is Playwright API behavior, which is frontend-minion's domain.

**One note for debugger-minion**: When diagnosing the Sourcepoint opt-out failure, check whether Sourcepoint's iframe navigates after initial attachment. If Sourcepoint creates an `about:blank` iframe and then navigates it to the CMP URL, the current snapshot-only injection misses the post-navigation context entirely. The frame event listener fix may resolve the Sourcepoint failure as a side effect -- a frame that navigates after attachment gets re-injected via `framenavigated`, giving autoconsent a fresh shot at detecting the CMP in the correct document context.
