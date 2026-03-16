## Edge Minion Review -- phase3-synthesis.md
**Decision: APPROVE**

### Workers Runtime Compatibility -- Confirmed

The synthesis plan's Risk #1 (frame events unsupported in Workers runtime) can be
closed. I checked `@cloudflare/playwright@1.1.2` type definitions directly:

- `page.on('framenavigated', listener)` -- typed and present
- `page.off('framenavigated', listener)` -- typed and present
- `page.once('framenavigated', ...)`, `addListener`, `removeListener`, `prependListener` -- all present
- `page.waitForEvent('framenavigated', ...)` -- typed and present
- Client-side event constants in `lib/playwright-core/src/client/events.js` confirm
  `FrameNavigated: "framenavigated"` is wired in the actual implementation, not just
  the type layer

This is the installed runtime version (`node_modules/@cloudflare/playwright`). The
event infrastructure is not theoretical -- it is compiled into the package that
executes in the Workers environment. CDP frame lifecycle events underpin `page.frames()`
which already works in production, and `framenavigated` is routed through the same
client event plumbing.

Risk #1 should be removed from the risk register or downgraded to "theoretical -- type
definitions and event plumbing confirmed present".

### CDP Event Timing -- No Concerns

The synthesis uses `framenavigated` (not `frameattached`), which is the correct event
for this injection pattern. `framenavigated` fires after the frame commits navigation
and has a JavaScript execution context, so `frame.evaluate()` is safe to call in the
listener without additional readiness checks. This matches how `page.frames()` + loop
works today -- `framenavigated` is simply the async version of the same guarantee.

The `frameattached` prohibition in the constraints is correct. That event fires before
document context exists; evaluate calls would race and silently fail for cross-origin
frames.

### Listener Registration Order -- Correct

The plan registers the listener AFTER `exposeBinding()` completes and BEFORE the
`page.frames()` loop. This is the right sequence. There is no window where a frame
could navigate, be missed by both the listener (not yet registered) and the loop (not
yet started). Registering before the loop means the Set-based dedup handles any
`framenavigated` fires that race with the initial loop iteration.

### Cleanup Pattern -- Sound

Using `try/finally` with `active = false` before `page.off()` is the correct
pattern. The `active` flag provides an extra guard against the micro-race but is not
strictly necessary given the semantics of `page.off()` -- once off() is called, the
listener will not fire again within the same event loop tick. The flag is a reasonable
belt-and-suspenders addition given that `Promise.race` resolution and the next event
loop tick are not atomic.

### Set vs WeakSet -- Confirmed Correct

`Set<Frame>` is correct. Frame objects are held by the page for the duration of the
consent flow. WeakSet would gain nothing (no GC pressure benefit when the page holds
the same references) and loses `.has()` semantics for dedup checks. The synthesis
resolution is sound.

### Polling Path

The same pattern applied to `_dismissWithPolling` is correct. The polling loop
already calls `page.frames()` each iteration for result-checking, so late-injected
frames will be picked up on the next poll cycle after `framenavigated` fires and
injects. The listener and the poll loop are complementary, not redundant.

### One Minor Observation (non-blocking)

The `framenavigated` event fires on EVERY navigation of a frame, including the main
frame's initial load. The plan correctly handles this by checking `frame ===
page.mainFrame()` and returning early. Main frame injection happens via
`page.evaluate()` before the listener is registered, so this early-return is
belt-and-suspenders. No issue.

### Summary

The implementation plan is technically sound, the API is confirmed available in the
installed runtime version, and the event timing model is correct. No changes required
before execution.
