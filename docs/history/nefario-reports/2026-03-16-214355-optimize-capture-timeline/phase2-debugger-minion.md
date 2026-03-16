# Debugger Minion: Adaptive Settle Delay Design

## Summary

Replace the fixed `setTimeout(r, 3000)` settle delay (line 459 of `src/capture.js`)
with an adaptive mechanism that monitors in-flight HTTP requests via Playwright's
`page.on('request')` / `page.on('requestfinished')` / `page.on('requestfailed')`
events and exits early after a quiescence period. The approach is deliberately
simple -- it counts in-flight requests and resolves when zero requests have been
in-flight for 500ms, capped at 3000ms total.

## Current State (What Exists)

**Line 459**: `await new Promise(r => setTimeout(r, SETTLE_DELAY_MS));`

This runs unconditionally after `page.goto(url, { waitUntil: 'load' })` succeeds.
Every capture pays a full 3s penalty regardless of whether the page has any
post-load network activity.

**Context from 0029-load-settle-strategy**: The team previously evaluated three
options (decisions.md D2). "Option C: Custom idle detection" was rejected as
"over-engineered for the problem." That decision was correct at the time --
the priority was replacing `networkidle` with something that wouldn't hang. Now
that the `load + fixed settle` pattern is proven stable, the optimization is
a natural next step, not premature.

**Existing infrastructure we can reuse**: The `context.route('**/*')` handler
(lines 365-388) already intercepts every request for subresource counting and
cross-origin blocking. The `page.on('response')` handler (lines 393-398) already
monitors responses for page size limits.

## Proposed Approach

### Core Mechanism: In-Flight Request Counter with Quiescence Timer

```js
const SETTLE_MAX_MS = 3000;        // hard cap (unchanged behavior ceiling)
const SETTLE_QUIESCE_MS = 500;     // idle window before early exit
```

After `page.goto` returns (load event fired), register `request`, `requestfinished`,
and `requestfailed` listeners on the page. Track a count of in-flight requests.
When the count drops to zero, start a 500ms quiescence timer. If a new request
fires before the timer completes, cancel it and wait again. If the timer completes
(500ms of zero in-flight requests), resolve immediately. If 3000ms total elapses,
resolve regardless.

### Why NOT `page.waitForLoadState('networkidle')`

The project documentation (0029 decisions.md D2) explains why this was rejected:
it hangs indefinitely on sites with persistent connections (analytics beacons,
ad trackers, websockets). The custom approach addresses this by:

1. **Counting requests, not connections.** Playwright's `networkidle` counts
   active connections (<=0.5 connections for 500ms). Our approach counts
   requests that have started but not finished. A keep-alive TCP connection
   that isn't actively carrying a request doesn't show up.

2. **Hard cap at 3s.** Even if a page has infinite streaming requests,
   we never wait more than SETTLE_MAX_MS.

3. **Ignoring certain request types.** WebSocket upgrade requests and
   event-source (SSE) connections show up as `request` events but never
   fire `requestfinished`. These must be explicitly excluded by resource
   type.

### Concrete Code Shape

```js
/**
 * Waits for network quiescence after the load event, with a hard cap.
 * Resolves early when no HTTP requests have been in-flight for SETTLE_QUIESCE_MS.
 * Never waits longer than SETTLE_MAX_MS.
 *
 * Ignores WebSocket and EventSource connections (they never "finish").
 *
 * @param {import('@cloudflare/playwright').Page} page
 * @returns {Promise<{ settledMs: number, settledBy: 'quiesce'|'cap' }>}
 */
function waitForSettle(page) {
  return new Promise((resolve) => {
    const start = Date.now();
    let inflight = 0;
    let quiesceTimer = null;

    // Resource types that never emit 'requestfinished' -- exclude from counting
    const IGNORED_TYPES = new Set(['websocket', 'eventsource']);

    const capTimer = setTimeout(() => done('cap'), SETTLE_MAX_MS);

    function done(reason) {
      clearTimeout(capTimer);
      clearTimeout(quiesceTimer);
      page.removeListener('request', onRequest);
      page.removeListener('requestfinished', onComplete);
      page.removeListener('requestfailed', onComplete);
      resolve({ settledMs: Date.now() - start, settledBy: reason });
    }

    function checkQuiesce() {
      if (inflight <= 0) {
        // Start quiescence countdown
        if (!quiesceTimer) {
          quiesceTimer = setTimeout(() => done('quiesce'), SETTLE_QUIESCE_MS);
        }
      } else {
        // Activity resumed -- cancel any pending quiescence timer
        if (quiesceTimer) {
          clearTimeout(quiesceTimer);
          quiesceTimer = null;
        }
      }
    }

    function onRequest(req) {
      if (IGNORED_TYPES.has(req.resourceType())) return;
      inflight++;
      // Cancel any pending quiescence timer
      if (quiesceTimer) {
        clearTimeout(quiesceTimer);
        quiesceTimer = null;
      }
    }

    function onComplete(req) {
      if (IGNORED_TYPES.has(req.resourceType())) return;
      inflight = Math.max(0, inflight - 1); // guard against underflow
      checkQuiesce();
    }

    page.on('request', onRequest);
    page.on('requestfinished', onComplete);
    page.on('requestfailed', onComplete);

    // Kick off initial quiescence check (page may already be idle at load)
    checkQuiesce();
  });
}
```

### Integration Point

Replace line 459:

```js
// Before:
await new Promise(r => setTimeout(r, SETTLE_DELAY_MS));

// After:
const settle = await waitForSettle(page);
```

The return value `settle` provides telemetry (`settledMs`, `settledBy`) that can
be included in the `render` metadata of the KV record and in log events. This
gives production observability into how the adaptive settle performs.

### Changes to render metadata

Extend the `render` object to include settle information:

```js
render: {
  waitUntilReached: 'load',
  timedOut: false,
  durationMs: Date.now() - renderStart,
  settleMs: settle.settledMs,       // NEW: how long settle actually took
  settleReason: settle.settledBy,   // NEW: 'quiesce' or 'cap'
}
```

### Constants

```js
const SETTLE_MAX_MS = 3000;     // replaces SETTLE_DELAY_MS
const SETTLE_QUIESCE_MS = 500;  // quiescence window
```

`SETTLE_DELAY_MS` should be removed to avoid dead constant confusion.

## Edge Cases and Failure Modes

### 1. Persistent connections (analytics, ad trackers)

**Problem**: Sites like CNN, NYTimes fire tracking pixels and analytics beacons
continuously. Some use `fetch()` with `keepalive: true` or `navigator.sendBeacon()`.

**Mitigation**: These show up as `request` -> `requestfinished` pairs (they complete,
they just keep spawning new ones). The 500ms quiescence window handles this:
as long as there's a 500ms gap between tracking bursts, we settle. The 3s hard
cap catches the worst offenders.

**Evidence**: The current 3s fixed delay works for these sites today. Our approach
is strictly no-worse (same 3s cap) and frequently better.

### 2. WebSocket upgrade requests

**Problem**: A `request` event fires for the HTTP upgrade, but `requestfinished`
never fires (the connection upgrades to a persistent protocol).

**Mitigation**: Filter by `req.resourceType() === 'websocket'`. Playwright
classifies these correctly. They don't count toward in-flight total.

### 3. Server-Sent Events (EventSource)

**Problem**: Similar to WebSocket -- long-lived HTTP connection that never
"finishes."

**Mitigation**: Filter by `req.resourceType() === 'eventsource'`. Same
treatment as WebSocket.

### 4. Streaming responses (chunked transfer-encoding)

**Problem**: A very slow large response (e.g., a 5MB image loading over 4s)
would keep `inflight > 0` past the 3s cap.

**Mitigation**: The 3s hard cap handles this. We don't need to wait for every
byte -- we just need the page to be visually settled for screenshots. Also,
the existing `MAX_PAGE_BYTES` limit would abort such resources.

### 5. Race condition: no requests in-flight at load time

**Problem**: If the page has zero post-load network activity (static HTML page),
the quiescence timer starts immediately and we exit after 500ms instead of 3000ms.

**Analysis**: This is the desired behavior. A fully-loaded static page doesn't
need 3s of settle time. 500ms is generous for any deferred CSS/font rendering
to complete. This is where the biggest time savings come from.

### 6. Requests already in-flight when load fires

**Problem**: The `load` event fires when the DOM and synchronous resources
are ready, but async resources (lazy images, analytics) may already be in-flight.

**Mitigation**: The `page.on('request')` listener is registered *before*
`waitForSettle` is called. However, requests that started before the listener
was attached won't be counted. This is acceptable because:
- The route handler (`context.route('**/*')`) already intercepts all requests.
  We could use it as the source of truth.
- Practically, any request that started before `load` and hasn't finished will
  fire `requestfinished` eventually, which we won't match to a `request` event.
  The underflow guard (`Math.max(0, inflight - 1)`) handles this gracefully --
  the count stays at 0 and the quiescence timer runs normally.

**Alternative (stronger)**: If we want to be more precise, we can track in-flight
requests from the route handler using a `Set` of request objects, and count
membership in that Set for the settle check. The route handler already sees every
request from page creation. This would be a refinement if the simpler approach
proves insufficient.

### 7. Page navigates during settle (security)

**Problem**: A malicious page could trigger a same-origin navigation during
the settle window.

**Mitigation**: The existing `context.route('**/*')` handler already blocks
cross-origin top-level navigations. Same-origin navigations would fire new
`request` events, resetting the quiescence timer. The 3s cap ensures we don't
hang. This is the same security posture as today.

### 8. Timer API availability in Workers

**Problem**: `setTimeout` and `clearTimeout` must work in the Workers runtime.

**Mitigation**: They already work -- the existing code uses `setTimeout` on
line 459 and in `consent.js`. No new runtime dependency.

## Stronger Alternative: Route-Handler-Based Tracking

Instead of attaching `page.on('request')` / `page.on('requestfinished')` listeners
in `waitForSettle`, we could track in-flight requests in the *existing* route handler:

```js
const inflightRequests = new Set();

await context.route('**/*', async (route) => {
  // ... existing security checks ...
  inflightRequests.add(route.request());
  await route.continue();
});

page.on('requestfinished', (req) => inflightRequests.delete(req));
page.on('requestfailed', (req) => inflightRequests.delete(req));
```

Then `waitForSettle` checks `inflightRequests.size` instead of maintaining its
own counter. This catches requests that started before `waitForSettle` was called.

**Tradeoff**: Slightly more invasive change to the route handler, but more accurate.
The route handler would need to add the request to the Set *before* calling
`route.continue()` (which it already does -- the add would go right before
`await route.continue()`).

**Recommendation**: Start with the simpler page-event-based approach. The underflow
guard makes it safe. Upgrade to route-handler-based tracking if production telemetry
shows settle decisions being made on incorrect counts.

## Budget Impact Analysis

Current budget:
```
20s (goto) + 3s (settle) + 8s (consent) + 2s (post) = 33s worst-case
```

With adaptive settle, typical fast-path:
```
5s (goto) + 0.5s (settle, quiesce) + 8s (consent) + 2s (post) = 15.5s
```

Worst case unchanged (still 3s cap):
```
20s (goto) + 3s (settle, cap) + 8s (consent) + 2s (post) = 33s
```

The optimization only improves the common case. It never makes the worst case
worse. The 30s `ctx.waitUntil` budget is not affected.

## Testing Recommendations

1. **Unit test `waitForSettle` in isolation**: Mock page event emitter. Verify
   quiescence exit, cap exit, ignored resource types, underflow guard.

2. **Integration test via `defaultRenderer`**: The existing test infrastructure
   uses injected renderers (`stubRenderer`), so `waitForSettle` would be
   exercised only in `defaultRenderer`. Integration tests with real browser
   sessions would be needed to verify the adaptive behavior end-to-end.

3. **Telemetry assertions**: Verify that `render.settleMs` and
   `render.settleReason` appear in KV records for full captures.

4. **Regression test**: Ensure the post-settle `limitExceeded` re-check
   (line 463) still works -- it must run after `waitForSettle` returns,
   same as it does after the current `setTimeout`.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Page events not firing in CF runtime | Low | High | Type definitions confirm support. The existing `page.on('response')` on line 393 proves events work. If broken, fall through to 3s cap. |
| Quiesce timer too aggressive (500ms) | Low | Low | Same window as Playwright's `networkidle`. Tunable constant. |
| `removeListener` not available | Very low | Medium | Standard Playwright API. Fallback: don't remove listeners (they're page-scoped, page closes in finally block). |
| Increased code complexity | Medium | Low | ~40 lines for `waitForSettle`. Self-contained function, no cross-cutting changes. |

## What NOT to Change

- The `context.route('**/*')` handler -- keep it focused on security and limits.
  Don't mix settle-tracking state into the security gate.
- The partial capture path (lines 404-452) -- it has its own tight budget and
  doesn't use the settle delay.
- The consent timeout (8s) -- independent concern.
- `NAV_TIMEOUT_MS` (20s) -- validated in 0029, no reason to revisit.

## Deliverables

1. New `waitForSettle(page)` function in `src/capture.js` (internal helper,
   not exported)
2. Replace `setTimeout(r, SETTLE_DELAY_MS)` call with `waitForSettle(page)`
3. Remove `SETTLE_DELAY_MS` constant, add `SETTLE_MAX_MS` and `SETTLE_QUIESCE_MS`
4. Extend `render` metadata with `settleMs` and `settleReason` fields
5. Update log events to include settle telemetry
6. Update `openapi.yaml` RenderInfo schema to document new fields
