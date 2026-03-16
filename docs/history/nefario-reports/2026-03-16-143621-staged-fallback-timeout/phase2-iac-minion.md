# Domain Plan Contribution: iac-minion

**Scope**: Cloudflare Workers runtime constraints, timeout budget engineering, deadline tracking, interaction with existing safety checks, renderer return shape, observability on the partial path.

---

## Recommendations

### (a) Timeout values for post-timeout screenshot and content extraction

The advisory suggested ~1.5s each with a 28s deadline. After re-examining the actual budget, I recommend slightly different values with a clearer rationale.

**Budget accounting after a 25s navigation timeout:**

```
Browser setup (before page.goto):        ~500ms
page.goto timeout:                      25,000ms
--- TimeoutError fires here ---
page.evaluate (readyState check):          ~50ms
page.evaluate (scrollHeight):              ~50ms
page.setViewportSize (if tall):            ~50ms
page.screenshot:                      200-2,000ms
page.content:                          50-200ms
context.close + browser.close:            ~150ms
--- Renderer returns here ---
R2 puts (3x parallel, no WACZ):       100-500ms
KV completeCapture (read + write):     100-400ms
Coralogix log:                          50-200ms
```

Total after timeout fires: ~750-3,600ms. Plus the 25,500ms already elapsed. Worst case: ~29,100ms against a 30,000ms hard wall clock.

**Recommended values:**

- `PARTIAL_SCREENSHOT_TIMEOUT_MS = 3000` -- screenshots of tall pages (up to MAX_PAGE_HEIGHT 8000px) can take 1-2s. 3s gives headroom without being reckless.
- `PARTIAL_CONTENT_TIMEOUT_MS = 1000` -- page.content() is DOM serialization, purely in-process. 1s is generous; typical is 50-200ms.
- `DEADLINE_MS = 28000` -- the absolute wall-clock deadline measured from `performCapture()`'s `const start = Date.now()`. This leaves 2s for the KV write, context cleanup, and the Coralogix log call. The 2s margin is critical: if `completeCapture` or `failCapture` fails to execute because the isolate was killed, the capture is stuck in `pending` forever (until the 24h TTL self-cleans).

**How to apply the individual timeouts:** Playwright's `page.screenshot()` accepts a `timeout` option. `page.content()` does not natively accept a timeout, so wrap it with `Promise.race` against a timer. For the readyState check, `page.evaluate()` accepts a timeout option.

**Key insight**: The individual operation timeouts (3s, 1s) are safety nets for pathological cases (e.g., a page that blocks the main thread during screenshot). The deadline check is the actual budget enforcement. Both layers are needed: the individual timeouts prevent any single operation from consuming the entire remaining budget, while the deadline prevents the aggregate from overrunning.

### (b) Deadline tracking: Date.now() check vs AbortController

**Use `Date.now()` checks, not AbortController.**

Rationale:

1. **AbortController does not integrate with Playwright's CDP-based API.** Playwright operations (screenshot, content, evaluate) use the Chrome DevTools Protocol over WebSockets. They accept their own `timeout` parameter but do not respect `AbortSignal`. An AbortController pattern would require wrapping every call in `Promise.race` anyway, which is exactly what `Date.now()` checks do more simply.

2. **The partial path is a linear sequence, not concurrent work.** AbortController shines when you need to cancel in-flight concurrent operations. The partial capture path is: check readyState -> cap viewport -> screenshot -> content -> return. Sequential. A simple "check the clock before each step" pattern is the right tool.

3. **Date.now() is monotonic enough on Workers.** V8 isolates in Workers use `performance.now()` for high-res time, but `Date.now()` is sufficient for second-granularity budget checks. There is no clock-skew risk within a single isolate invocation.

**Implementation pattern:**

```js
const deadline = start + 28000; // start is already defined in performCapture()

function remainingMs() {
  return Math.max(0, deadline - Date.now());
}

// Before each post-timeout operation:
if (remainingMs() < 500) {
  // Not enough time -- abort partial capture, let it fail
  throw new Error('Deadline exceeded before partial capture could complete');
}
```

The `deadline` value (28000ms from start) should be passed into the renderer or computed there from a shared `start` timestamp. Since `start` is currently only in `performCapture()`, the cleanest approach is to compute the deadline inside `defaultRenderer` using its own `Date.now()` at entry. This avoids changing the renderer function signature. However, this means the renderer's deadline is relative to its own start, not `performCapture()`'s start. The difference is the time spent in `Promise.allSettled` setup and the `captureHeaders` kickoff -- negligible (< 5ms). This is acceptable.

Alternatively, pass `start` as a third argument to the renderer. This changes the signature from `(browserBinding, url)` to `(browserBinding, url, start)`. Since the renderer is injectable for testing, this is a minor but visible API change. Either approach works; the key constraint is that the deadline must account for the work that happens AFTER the renderer returns (R2 puts, KV writes).

**Recommendation: compute deadline inside defaultRenderer using `Date.now()` at renderer entry, set to `rendererStart + 27000`.** This gives 27s from renderer entry, leaving ~3s for post-renderer work in performCapture. The renderer does not need to know about performCapture's start time. Simpler, no signature change, and the ~500ms difference between performCapture start and renderer start is swallowed by the margin.

### (c) Interaction with the existing limitExceeded check

The current `limitExceeded` check (line 347) runs AFTER `page.goto()` resolves. On the timeout path, `page.goto()` throws instead of resolving, so line 347 is never reached. The question is: should a partial capture proceed if `limitExceeded` was set during the (timed-out) navigation?

**Recommendation: proceed with partial capture even if limitExceeded is set. Do not check limitExceeded on the partial path.**

Rationale:

1. **limitExceeded is a blunt instrument.** It is set when subresource count exceeds 200 or total bytes exceed 50MB. These limits exist to prevent resource exhaustion during a FULL page load. On the partial path, the page has already been loading for 25 seconds; the screenshot and HTML extraction are about the current DOM state, not about continuing to load.

2. **The limit was set but the route handler already blocked further loading.** When limitExceeded is set, subsequent route handler calls abort new requests. The page is effectively frozen at whatever state it reached when the limit was hit. This frozen state is exactly what we want to capture as partial evidence.

3. **Failing the capture entirely because of a limit that was hit during a timeout is double punishment.** The user gets no evidence for a page that was too heavy -- which is exactly the class of pages the staged fallback is designed to help.

4. **One edge case to document**: If a page hit the 50MB limit AND timed out, the screenshot may be partially rendered (images cut off, lazy-loaded content missing). This is the expected behavior for a partial capture and the `renderQuality: 'partial'` metadata correctly communicates it.

**Implementation**: In the catch block for TimeoutError, do NOT check `limitExceeded`. Proceed directly to the readyState check and partial capture. The `limitExceeded` variable is still useful on the non-timeout path (line 347), so do not remove it.

### (d) Renderer return shape for partial captures

**Return the same shape with an additional `partial` flag and render metadata.**

```js
// Full capture (existing)
{ screenshot: Uint8Array, html: string }

// Partial capture (new)
{ screenshot: Uint8Array, html: string, partial: true, render: { ... } }
```

**Why this shape, not a separate type or wrapper:**

1. **Backward compatibility in performCapture().** Line 110 destructures `{ screenshot, html }` from `renderResult.value`. Adding `partial` and `render` to the same object requires zero changes to the destructuring -- the new fields are simply additional properties. The caller opts in to reading them.

2. **The caller (performCapture) needs the partial flag** to decide: (a) skip WACZ bundling, (b) pass `renderQuality` to `completeCapture`, (c) log differently. Testing for `renderResult.value.partial === true` is simpler and more explicit than inferring partialness from error types or checking if a specific error was caught.

3. **The render metadata object** should include the fields the synthesis agreed on:

```js
render: {
  waitUntilReached: 'domcontentloaded' | 'load' | 'networkidle',
  waitUntilTarget: 'networkidle',  // always, for now
  timedOut: true,                   // always true on partial path
  durationMs: 25000,                // approximate navigation duration
}
```

This object is computed in the renderer (which has access to the page and knows what happened) and passed through to both the KV record and the WACZ datapackage.

**For full captures**, also return render metadata for consistency:

```js
{ screenshot, html, partial: false, render: { waitUntilReached: 'networkidle', waitUntilTarget: 'networkidle', timedOut: false, durationMs: actualMs } }
```

This ensures every completed capture has render metadata, which simplifies the API surface (no null checks, no defaulting) and gives observability into non-timeout captures too.

### (e) Observability data on the timeout path

**Log the following on the partial capture path (severity 3, info-level):**

```js
{
  event: 'capture.partial',
  captureId,
  tenantId,
  cip,
  renderQuality: 'partial',
  readyState: 'interactive' | 'complete',  // from page.evaluate()
  navDurationMs: 25000,                     // time spent in page.goto
  screenshotMs: <actual>,                   // time for screenshot op
  contentMs: <actual>,                      // time for content extraction
  totalMs: Date.now() - start,              // total capture duration
  budgetRemainingMs: deadline - Date.now(), // headroom left for post-renderer work
  limitExceeded: limitExceeded || null,      // if a safety limit was also hit
}
```

**Why each field matters:**

- `readyState` -- distinguishes interactive-only (DOMContentLoaded) from complete (load event fired). This is the evidence quality indicator. If most partial captures show `readyState: 'complete'`, the page was fully loaded but network-chatty; the evidence quality is high. If most show `readyState: 'interactive'`, the page was genuinely slow to render; the evidence is thinner.

- `navDurationMs` -- always ~25000ms for timeouts, but useful as a sanity check and for correlation with non-timeout captures when render metadata is added to full captures.

- `screenshotMs` and `contentMs` -- individual operation timings reveal whether the partial path's time budget is adequate or needs adjustment. If screenshots consistently take >2s, the 3s timeout is correct. If they are consistently <500ms, the budget could be tightened to leave more margin.

- `budgetRemainingMs` -- the most critical operational metric. This is how much time was left for KV writes and cleanup when the renderer returned. If this drops below 1000ms in production, the DEADLINE_MS needs to be reduced. Track this as a histogram in Coralogix.

- `limitExceeded` -- correlates timeout + limit scenarios. If a page exceeds both the subresource limit and the navigation timeout, this combination is interesting for understanding the class of pages that trigger fallbacks.

**On the existing timeout FAILURE path (DOMContentLoaded not reached):**

Keep the existing log at severity 5 (`capture.stage.fail` with `errorCategory: 'Page did not finish loading within 25 seconds'`). Add `readyState` to the log payload so we can see what state the page was in when it failed even on the non-partial path. This costs one `page.evaluate()` call (~50ms) before re-throwing.

**Aggregate metrics for R16 activation:**

The Coralogix query for the 7-day rolling timeout rate is:

```
source:"wrl-worker" AND (event:"capture.partial" OR (event:"capture.stage.fail" AND errorCategory:"Page did not finish loading*"))
```

Divided by total `capture.success` + `capture.partial` + `capture.stage.fail`. When this ratio exceeds 5%, trigger R16 planning.

---

## Proposed Tasks

### Task 1: Add deadline tracking and partial capture to defaultRenderer

**What to do**: Modify `defaultRenderer()` to catch `TimeoutError` from `page.goto()`, check `document.readyState` via `page.evaluate()`, and if readyState is at least `'interactive'` (meaning DOMContentLoaded fired), capture screenshot and HTML with short timeouts. Return the enriched result shape with `partial: true` and `render` metadata. If readyState is below `'interactive'`, re-throw the error for the existing failure path.

**Deliverables**:
- Modified `defaultRenderer()` in `src/capture.js`
- New constants: `PARTIAL_SCREENSHOT_TIMEOUT_MS`, `PARTIAL_CONTENT_TIMEOUT_MS`
- Deadline tracking with `Date.now()` checks before each post-timeout operation

**Dependencies**: None. This is the core change.

**Implementation sketch** (for the catch block inside the try, after `page.goto()`):

```js
try {
  await page.goto(url, { timeout: NAV_TIMEOUT_MS, waitUntil: 'networkidle' });
} catch (navError) {
  if (navError.name !== 'TimeoutError') throw navError;

  // Check if DOMContentLoaded has passed
  const readyState = await page.evaluate(() => document.readyState)
    .catch(() => 'unknown');
  if (readyState !== 'interactive' && readyState !== 'complete') {
    throw navError; // Page too broken for partial capture
  }

  const deadline = Date.now() + 2500; // ~27.5s from capture start
  // Note: 2500ms = remaining budget for screenshot + content + cleanup
  // The renderer has been running for ~25.5s already

  // Cap viewport for tall pages (same as full path)
  const pageHeight = await page.evaluate(() => document.body.scrollHeight)
    .catch(() => 0);
  if (pageHeight > MAX_PAGE_HEIGHT) {
    await page.setViewportSize({ width: 1280, height: MAX_PAGE_HEIGHT });
  }

  if (Date.now() > deadline) throw new Error('Deadline exceeded');

  const ssStart = Date.now();
  const screenshot = await page.screenshot({
    fullPage: true,
    type: 'png',
    timeout: PARTIAL_SCREENSHOT_TIMEOUT_MS,
  });
  const screenshotMs = Date.now() - ssStart;

  if (Date.now() > deadline) throw new Error('Deadline exceeded');

  const cStart = Date.now();
  const html = await Promise.race([
    page.content(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Content extraction timeout')),
        PARTIAL_CONTENT_TIMEOUT_MS)),
  ]);
  const contentMs = Date.now() - cStart;

  return {
    screenshot, html,
    partial: true,
    render: {
      waitUntilReached: readyState === 'complete' ? 'load' : 'domcontentloaded',
      waitUntilTarget: 'networkidle',
      timedOut: true,
      durationMs: NAV_TIMEOUT_MS,
      screenshotMs,
      contentMs,
    },
  };
}
```

### Task 2: Update performCapture to handle partial renderer results

**What to do**: After the existing destructure at line 110, check `renderResult.value.partial`. If true: skip WACZ bundling, pass `renderQuality: 'partial'` and render metadata to `completeCapture`, and log `capture.partial` instead of `capture.success`.

**Deliverables**:
- Modified `performCapture()` in `src/capture.js`
- Conditional WACZ skip based on `partial` flag

**Dependencies**: Task 1 (renderer return shape), and the `completeCapture` KV change (separate task, likely owned by another specialist).

### Task 3: Extend completeCapture to accept renderQuality and render metadata

**What to do**: Add optional `renderQuality` and `render` parameters to `completeCapture()`. These are written into the KV record. Default `renderQuality` to `'full'` when not provided (backward compat for existing callers and for reading pre-feature records).

**Deliverables**:
- Modified `completeCapture()` in `src/kv.js`
- Updated JSDoc

**Dependencies**: None.

### Task 4: Add render metadata to full capture path

**What to do**: On the non-timeout (full capture) path in `defaultRenderer()`, also return `partial: false` and `render` metadata with actual navigation duration and `waitUntilReached: 'networkidle'`. This ensures every capture record has render metadata.

**Deliverables**:
- Modified full-capture return in `defaultRenderer()`

**Dependencies**: Task 1 (same function being modified).

### Task 5: Update categorizeError for deadline-exceeded errors

**What to do**: Add a case in `categorizeError()` for the `'Deadline exceeded'` and `'Content extraction timeout'` error messages introduced by the partial path. These should categorize as the standard timeout message with `retryable: true`. This handles the case where the partial capture itself fails (e.g., screenshot took too long even with the 3s timeout).

**Deliverables**:
- Modified `categorizeError()` in `src/capture.js`

**Dependencies**: Task 1 (introduces the new error messages).

### Task 6: Write tests for partial capture path

**What to do**: Add test cases using the injectable renderer pattern. Create stub renderers that simulate the partial capture return shape and verify that `performCapture` handles them correctly (skips WACZ, writes correct KV record, logs correctly).

Test scenarios:
- Partial capture succeeds: renderer returns `{ screenshot, html, partial: true, render: {...} }`
- Partial capture with no headers (header fetch also failed)
- Full capture continues to work as before (regression)
- Renderer throws (non-timeout error) -- failure path unchanged

**Deliverables**:
- New test cases in `test/capture.test.js`

**Dependencies**: Tasks 1-4.

### Task 7: Observability instrumentation

**What to do**: Add the `capture.partial` log event with the fields specified in section (e). Add `readyState` to the existing timeout failure log. Verify that the Coralogix query for R16 activation works with the new event names.

**Deliverables**:
- Log statements in `performCapture()` for partial captures
- Updated log payload in the existing timeout failure path

**Dependencies**: Tasks 1-2.

---

## Risks and Concerns

### Risk 1: Tall page screenshots exhausting the time budget (Medium)

A page at MAX_PAGE_HEIGHT (8000px) produces a large PNG. On @cloudflare/playwright, screenshot rendering is done server-side in the browser process. For a visually complex page at 8000px height, screenshot time could approach 2-3s. Combined with the 25s navigation timeout and ~500ms of pre-goto setup, this leaves <2s for R2 writes and KV updates.

**Mitigation**: The 3s screenshot timeout and the deadline check after screenshot provide two layers of defense. If the screenshot exceeds the budget, the capture fails to the existing error path -- which is the current behavior anyway (timeout = failure). The user is no worse off. Additionally, consider reducing `MAX_PAGE_HEIGHT` on the partial path to 4000px (above the fold only) to reduce screenshot time. This is a judgment call: the advisory did not address it, but it would roughly halve worst-case screenshot time.

### Risk 2: page.content() blocking on heavy DOM (Low)

`page.content()` serializes the DOM to a string. For a page with a very large DOM (e.g., a single-page app that has loaded hundreds of components), serialization could take longer than expected. The 1s timeout handles this.

**Mitigation**: The `Promise.race` wrapper ensures content extraction never blocks beyond 1s. If it fails, the entire partial capture fails. This is acceptable: a page whose DOM cannot be serialized in 1s is pathological.

### Risk 3: page.evaluate() failing after TimeoutError (Low-Medium)

The readyState check uses `page.evaluate()`. If the page's main thread is completely blocked (infinite loop in JS, excessive GC pressure), `page.evaluate()` may itself hang or fail. This is unlikely for a page that has been loading for 25s (the browser would have killed a truly hung page), but possible.

**Mitigation**: The `.catch(() => 'unknown')` on the readyState evaluate call handles this. If readyState cannot be determined, the partial capture does not proceed and the existing failure path runs. No regression from current behavior.

### Risk 4: Context cleanup timing after partial capture (Medium)

The `context.close()` call in the finally block is MANDATORY for security (clears cookies, localStorage, etc.). If the partial capture consumes nearly all remaining budget, `context.close()` could be racing the 30s wall clock. If the isolate is killed before `context.close()` completes, the next session reuse may encounter leaked state.

**Mitigation**: The existing orphan cleanup at the top of `defaultRenderer()` (lines 291-293) handles this -- any contexts left by a prior user are closed before the new capture begins. This is defense-in-depth that already exists. The 2s margin in the deadline (28s, not 30s) is specifically to ensure context.close() and browser.close() have time to run.

### Risk 5: Observability log calls adding to time budget (Low)

The Coralogix log call in performCapture's success path (`log(env, 3, 'capture', {...})`) is an HTTP call. On the partial path, the total budget is tighter. If the log call takes >500ms, it could push past the 30s wall clock.

**Mitigation**: The log call is the last operation before the function returns. If it is killed by the wall clock, the capture is already complete (KV is updated, R2 artifacts are stored). The log loss is acceptable -- it is observability data, not critical state. If this becomes a pattern, the log call can be moved to a fire-and-forget pattern (no await), but that is a separate optimization.

---

## Additional Agents Needed

None. The current team (iac-minion for runtime constraints, api-design-minion for schema, security-minion for evidence integrity, ux-strategy-minion for consumer experience) covers all aspects of this change. The implementation is contained within `src/capture.js` and `src/kv.js` with no new infrastructure, no new services, and no deployment changes beyond the code update.
