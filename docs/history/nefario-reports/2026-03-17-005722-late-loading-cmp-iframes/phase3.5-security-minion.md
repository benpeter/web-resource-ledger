## Security Review: framenavigated listener addition to consent.js

**Verdict: APPROVE**

---

### Summary

The proposed change adds `page.on('framenavigated', injectIntoFrame)` listeners to both `_dismissWithBinding` and `_dismissWithPolling` to catch late-loading CMP iframes. The overall risk level is **Low**. The change is additive and stays on an already-established injection path that has existing security controls. No new message channels, no new eval paths, no new trust boundaries are introduced. Two design decisions in the plan require scrutiny (addressed below), both resolvable without blocking.

---

### Threat Analysis: Can a malicious page trigger frame events that cause autoconsent injection into unintended contexts?

This is the right question. Here is the full chain:

**The `framenavigated` event fires for every frame navigation the Playwright browser processes**, including adversarially-crafted navigations. A malicious page could:

1. Rapidly create and navigate many iframes (e.g., `for` loop creating 1000 iframes pointing to `data:` URLs or crafted origins)
2. Navigate an existing iframe through multiple URLs in quick succession
3. Create iframes pointing to sensitive internal origins (if the capture environment has any reachable via the browser's network stack)

For each of these, the proposed `injectIntoFrame` function would be called. The question is: does injection into an adversarially-crafted frame do anything harmful?

**Assessment**: The injection payload is always `autoconsentScript` (or `wrappedScript`) -- the vendored autoconsent bundle. Injecting this script into an attacker-controlled frame has no effect that benefits the attacker. The script looks for CMP UI elements in the frame and attempts opt-out sequences. In an attacker-controlled frame, the attacker already controls the full execution context -- `eval` is not a meaningful escalation. The `frame.evaluate()` call is from the Playwright worker to the frame, so it represents the worker acting on the page, not the page acting on the worker.

The only meaningful injection risk would be if autoconsent's `eval` message type (via the `exposeBinding` channel) could be used to run attacker-crafted code **in the worker process**. That channel is already in the current codebase and is **not expanded** by this change. The `active` flag and `page.off()` cleanup ensure the listener does not persist beyond the consent window.

**Conclusion on the specific threat**: No. A malicious page cannot use `framenavigated` events to cause injection into unintended contexts that the attacker does not already control, and cannot escalate through the injection path into the worker process.

---

### Findings

#### LOW Unbounded frame event volume (DoS / resource exhaustion)

- **Location**: proposed `injectIntoFrame` in `_dismissWithBinding` and `_dismissWithPolling`
- **Description**: A malicious page can fire `framenavigated` at arbitrary frequency -- hundreds or thousands of times within the 8-second consent window -- by programmatically creating, navigating, and destroying iframes. Each event triggers `frame.evaluate()`, which is an async IPC round-trip to the Playwright browser process. The `injectedFrames` Set deduplication prevents re-injection into the same frame object, but it does not bound the total number of distinct frames a page can create.
- **Impact**: Resource pressure on the Playwright worker. Each `frame.evaluate()` call consumes a CDP session slot and a micro-task. With a hostile page creating e.g. 500 distinct iframes within 8 seconds, this could slow the capture pipeline or cause the consent timeout to fire late. Impact is bounded by the 8-second consent timeout and the existing per-capture resource budget. This is not a code execution risk; it is a throughput degradation risk.
- **Remediation**: Add a frame count cap inside `injectIntoFrame`:
  ```javascript
  const MAX_INJECTED_FRAMES = 50; // well above any legitimate CMP iframe count
  if (injectedFrames.size >= MAX_INJECTED_FRAMES) return;
  ```
  50 is a generous ceiling for any real CMP; no legitimate site needs autoconsent in 50 iframes. This is a defense-in-depth measure. Given the 8-second timeout naturally bounds exposure, this is **Low** priority but should be included in the implementation.

#### INFORMATIONAL Skipping `about:blank` and `javascript:void(0)` frames is correct

- **Location**: plan description of frame URL filtering
- **Description**: The plan says to skip frames with `about:blank` or `javascript:void(0)` URLs. This is correct security posture. These are placeholder frames with no document context for a CMP to operate in. Injecting into them wastes a `frame.evaluate()` call at minimum, and in edge cases could cause evaluate to fail with a detached-context error.
- **Impact**: None if implemented; the plan is correct.
- **Remediation**: Confirm the implementation includes a URL check. The `_dismissWithBinding` existing loop (lines 156-161) does not filter by URL, but `frame.evaluate()` failures are already `.catch(() => {})`'d. A URL pre-filter (`if (frame.url() === 'about:blank' || frame.url().startsWith('javascript:')) return;`) is cleaner than relying on the catch. This is informational -- not blocking.

#### INFORMATIONAL `Set<Frame>` dedup is correct; WeakSet would be wrong

- **Location**: conflict resolution section
- **Description**: The plan correctly resolves the Set vs WeakSet debate in favor of `Set`. The deduplication reasoning is sound: Frame reference equality is stable across navigations of the same iframe element during the consent window. The Set also allows `.size` for the frame cap check recommended above.
- **Impact**: None -- confirming the correct choice.

#### INFORMATIONAL eval path not expanded

- **Location**: `_dismissWithBinding`, `case 'eval'` (line 127-144 of current consent.js)
- **Description**: The most sensitive existing code is the `eval` handler in the `exposeBinding` callback. A page can call `window.autoconsentSendMessage({ type: 'eval', code: '...' })` and have that code execute in any frame, capped at 2048 characters. This path exists today and is **not changed** by the proposed modification. The `framenavigated` addition only affects which frames receive the initial autoconsent script injection; it does not affect how eval messages are routed or executed.
- **Impact**: The existing eval path is a known design choice documented in the file header ("eval msg.code capped at 2048 bytes"). The page already controls its own frame execution contexts. The cap limits code size but does not prevent arbitrary JS execution in a page-controlled frame. This is pre-existing accepted risk, not introduced by this change.

---

### Recommendations

1. **Add frame count cap (Low priority, recommended before merge)**: Add `if (injectedFrames.size >= MAX_INJECTED_FRAMES) return;` at the top of `injectIntoFrame`. Use 50 as the cap. This bounds resource consumption from adversarially-crafted pages without affecting any real CMP scenario.

2. **Confirm `about:blank` / `javascript:` skip in implementation**: Verify the frontend-minion implementation includes URL filtering or that the `.catch(() => {})` on `frame.evaluate()` reliably handles those cases. Either is acceptable; URL pre-filter is cleaner.

3. **`active` flag placement is correct**: The plan's cleanup sequence (`active = false` then `page.off()`) in try/finally is the right order and prevents the micro-race. Confirm this in code review.

The frame count cap (item 1) is the only net-new control worth adding. It is a small addition that removes the one meaningful degradation path. Neither item 1 nor 2 blocks execution -- they can be handled as part of the Task 1 implementation prompt or a follow-up note to the frontend-minion.
