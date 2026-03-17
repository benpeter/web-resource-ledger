---
reviewer: frontend-minion
verdict: APPROVE
---

## Review Summary

The design is correct. The `framenavigated` listener, dedup pattern, and cleanup strategy are all sound. Two implementation-level notes for the coding agent to watch.

---

## Design Assessment

**Event choice (`framenavigated` vs `frameattached`)**

Correct. `frameattached` fires before the frame has a document context. `framenavigated` fires after navigation commits — the JS execution context exists and `frame.evaluate()` will succeed. The main frame navigation on initial page load is correctly excluded by the `frame === page.mainFrame()` guard.

**Race condition mitigation**

The `active` flag is the right tool. Setting `active = false` before `page.off()` closes the window between `Promise.race` resolution and listener removal. Even if a `framenavigated` event fires in that window, `injectIntoFrame` returns early at the `active` check — no observable effect. The worst-case is one redundant evaluate that gets silently swallowed by the existing `.catch(() => {})`.

**Dedup correctness**

`Set<Frame>` with reference equality is correct. Playwright reuses the same Frame object for the lifetime of an iframe element. The explicit `injectedFrames.add(page.mainFrame())` before the loop is belt-and-suspenders but correct — the mainFrame guard in `injectIntoFrame` already prevents injection, but the set prevents it from being re-considered if `framenavigated` fires on the main frame later (SPA navigation, etc.).

**Polling path**

The interaction is correct. The listener injects `wrappedScript` into late frames. The polling loop checks `page.frames()` every 200ms. By the next poll tick after injection, the late frame has `window.__autoconsentResult` available. No timing issue.

**Cleanup ordering**

Listener registered after `exposeBinding` and before the initial `page.frames()` loop — correct. Any frame navigating during or after the loop is caught. `try/finally` for cleanup is correct.

---

## Implementation Notes (must follow)

**1. Register `injectIntoFrame` by name, not wrapped in an anonymous function.**

`page.off()` matches by reference. If the implementer writes:

```javascript
page.on('framenavigated', (frame) => injectIntoFrame(frame));
```

the `page.off('framenavigated', injectIntoFrame)` call will silently fail — the listener stays registered. Must be:

```javascript
page.on('framenavigated', injectIntoFrame);
// ...
page.off('framenavigated', injectIntoFrame);
```

Same named reference at both call sites.

**2. `injectIntoFrame` must be defined as a local closure, not a module-level function.**

It needs to close over `injectedFrames`, `active`, and the injection payload (`inject` or `wrappedScript`). Define it inside `_dismissWithBinding` and `_dismissWithPolling` respectively:

```javascript
const injectIntoFrame = (frame) => {
  if (!active) return;
  if (frame === page.mainFrame()) return;
  if (injectedFrames.has(frame)) return;
  injectedFrames.add(frame);
  frame.evaluate(inject, [autoconsentScript]).catch(() => {});
};
```

If extracted to module scope, the closure capture breaks.

---

## Not Flagged

- Security surface: unchanged. Same script, same evaluate path, same binding validation.
- False positive risk: skipping `about:blank` frames is correct — they are not CMP targets.
- Sourcepoint: `failed` status is a selector mismatch, not a timing issue. This fix correctly does not attempt to address it.
- WeakSet vs Set: Set is correct for the reasons given in the synthesis.
