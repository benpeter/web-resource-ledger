# Debugger Minion: Sourcepoint Opt-Out Failure Diagnosis

## Evidence Summary

- Guardian: `failed, cmp=Sourcepoint-frame, consentMs=8128`
- Spiegel: `failed, cmp=Sourcepoint-frame, consentMs=8264`
- Both consume the full 8s timeout, meaning the flow progresses far enough to detect the CMP but the `optOutResult` message with `result === false` arrives (or the timeout fires and `detectedCmp` is set, producing `timeout` -- but the status is `failed`, so `optOutResult` with `result === false` was received).

Wait -- the status is `failed`, not `timeout`. In `consent.js` line 114-116, `failed` is returned when `msg.type === 'optOutResult' && msg.result === false`. The `timeout` status (line 164) only fires if the 8s timeout wins the race. Since `consentMs` is ~8128/8264 (very close to the 8000ms timeout), one of two things happened:

1. The optOut ran to completion and returned `false` at around the 8s mark, or
2. The timeout fired first but `failed` was emitted just before -- the race is tight.

Actually, re-reading: `consentMs = Date.now() - start` and CONSENT_TIMEOUT_MS is 8000. The values 8128 and 8264 are slightly above 8000, consistent with the timeout firing (setTimeout is not precise) and the timeout path resolving with `status: detectedCmp ? 'timeout' : 'none'`. But the status is `failed`, not `timeout`.

This means the `optOutResult` with `result === false` **did** arrive before the timeout resolved. The Sourcepoint optOut() ran, attempted its actions, and returned `false`. The timing (~8s) is explained by the cumulative waits inside the optOut flow.

## Root Cause Analysis

### Tracing the Sourcepoint-frame optOut Flow

The Sourcepoint-frame `optOut()` method has this execution path for GDPR sites (not CCPA):

```
1. wait(500)                              -- 500ms
2. Check ccpaPopup                        -- false for Guardian/Spiegel (GDPR)
3. Check elementVisible('.sp_choice_type_SE') -- likely false
4. Check isManagerOpen()                  -- false (initial consent screen)
5. waitForVisible('.sp_choice_type_12,.sp_choice_type_13,...') -- 2s timeout
6. If no .sp_choice_type_12: click .sp_choice_type_13
   If .sp_choice_type_12 exists: click it, then waitFor(isManagerOpen, 200, 100) -- up to 20s
7. waitForElement('.type-modal', 20000)    -- 20s timeout
8. If [role=tablist] exists: waitForElement('[role=tablist] [role=tab]', 10000)
9. waitForThenClick('.ccpa-stack ...', 500)
10. Promise.race of three paths:
    - waitForElement('.sp_choice_type_REJECT_ALL', 2000)
    - waitForElement('.reject-toggle', 2000)
    - waitForElement('.pm-features', 2000)
11. Click the winner, or fallback to .sp_choice_type_SAVE_AND_EXIT
```

**The critical bottleneck is step 5: `waitForVisible('.sp_choice_type_12,.sp_choice_type_13,...')`** with a 2s timeout. If this returns `false` (the buttons never become visible), the method falls through the `if (!actionable) return false` branch at step 5, and `optOut()` returns `false`.

### Hypothesis 1: detectCmp succeeds but optOut runs in the wrong frame (MOST LIKELY)

The Sourcepoint-frame CMP has `runContext: { main: true, frame: true }`. Its `detectCmp()` checks `location.href` for specific URL patterns (`/index.html` with `message_id` or `requestUUID` params). This detection runs **inside the Sourcepoint iframe** where the URL matches.

However, the autoconsent architecture is:
1. Script is injected into each frame independently
2. Each instance creates its own `AutoConsent` object
3. Each instance runs `_start()` independently
4. The `sendContentMessage` (our `autoconsentSendMessage` binding) routes messages back through the host

**The problem**: When autoconsent runs inside the Sourcepoint iframe, `detectCmp()` succeeds (the URL matches). But `detectPopup()` calls `waitForElement('.sp_choice_type_11,...', 2000)`. These button classes exist inside the iframe's DOM -- they are part of the Sourcepoint message rendered inside the iframe. So `detectPopup()` also succeeds.

Then `optOut()` runs. It calls `waitForVisible('.sp_choice_type_12,.sp_choice_type_13,...', 2000)`. Here is where it gets interesting:

- `.sp_choice_type_12` = "Manage Preferences" / "Show Purposes" button
- `.sp_choice_type_13` = "Reject All" button

**If the Sourcepoint SDK has changed its button class naming or the current version uses different class patterns, these selectors won't match.** The autoconsent version is 14.59.0, but the Sourcepoint SDK on Guardian/Spiegel may have updated since that autoconsent version was released.

### Hypothesis 2: eval message loss due to frame navigation (POSSIBLE)

The Sourcepoint iframe flow involves navigation. The initial iframe loads with a URL like `https://cdn.privacy-mgmt.com/index.html?message_id=...`. After user interaction (or script-driven clicks), the iframe may navigate to `/privacy-manager/index.html`.

In the `exposeBinding` path, eval messages are routed via:
1. Autoconsent inside frame calls `requestEval(code)`
2. This calls `autoconsentSendMessage({ type: 'eval', id, code })`
3. consent.js receives this, runs `frame.evaluate(code)`, gets result
4. consent.js calls `frame.evaluate(({ id, res }) => autoconsentReceiveMessage({ type: 'evalResp', id, result: res }))` **on the same frame**

If the frame navigates between step 2 and step 4, the `frame` reference from `source.frame` points to the **navigated** frame. The `autoconsentReceiveMessage` callback would be gone (new page context). The `frame.evaluate()` in step 4 would either throw (caught by `.catch(() => {})`) or execute in a context where `autoconsentReceiveMessage` doesn't exist.

**However**, the Sourcepoint-frame `detectCmp()` does NOT use `mainWorldEval()` -- it checks `location.href` directly. And `detectPopup()` uses `waitForElement()` which is pure DOM querying, not eval. The `optOut()` method also does not appear to use `mainWorldEval()`. So eval message loss is **not the primary cause** for this CMP.

### Hypothesis 3: detectRetries=5 is insufficient (UNLIKELY to be the main issue)

The `findCmp()` retry logic: 5 retries x 500ms delay = 2.5s max detection window. For Sourcepoint-frame, `detectCmp()` checks `location.href` which is available as soon as the iframe navigates. The iframe should be present and have its URL by the time the page reaches "load" state (which is when `dismissCookieConsent` runs -- after page.goto and 3s settle).

However, there's a subtlety: `consent.js` injects autoconsent into `page.frames()` at injection time. If the Sourcepoint iframe is created **after** the `page.frames()` snapshot (late-loading), autoconsent is never injected into it. The `detectRetries` in autoconsent only retry detection within an already-injected frame. They do NOT handle the case where the frame doesn't exist yet.

This is the late-loading iframe problem that is the main PR topic, but it's **separate from why detected CMPs fail**. If the CMP is detected (status=`failed`, not `none`), autoconsent WAS injected successfully.

### Hypothesis 4: Timing -- clicking before DOM is interactive (POSSIBLE)

The `optOut()` method starts with `await this.wait(500)`. Then it calls `waitForVisible()` on the consent buttons with a 2s timeout. `waitForVisible` polls every 200ms, 10 times. If the buttons don't become visible within 2s, the method returns `false`.

On a slow-loading Sourcepoint iframe, the consent message DOM may not be fully rendered within 2s of autoconsent injection. The iframe loads, `detectCmp()` passes (URL check), `detectPopup()` finds some element (or times out at 2s), then `optOut()` starts but the interactive buttons aren't rendered yet.

The total timeline inside autoconsent:
- `findCmp` retries: up to 5 x 500ms = 2.5s
- `waitForPopup` retries: up to 10 x 500ms = 5s
- `optOut` internal waits: 500ms + 2s waitForVisible = 2.5s

That's 10s worst-case, but our timeout is 8s. If detection takes time, optOut's waitForVisible has less than 2s before the 8s external timeout fires.

## Recommended Diagnostic Approach

### Step 1: Add instrumentation to consent.js (no vendored changes)

Add temporary logging to the `autoconsentSendMessage` handler to capture the **full message flow** for Sourcepoint:

```javascript
// In the exposeBinding callback, before the switch:
console.log(`[consent] ${msg.type}`, msg.cmp || '', msg.result ?? '', Date.now() - start);
```

This will reveal:
- When `cmpDetected` fires (how long after injection)
- When `popupFound` fires (detection -> popup delay)
- When `optOutResult` fires and what `result` value is
- Whether `autoconsentDone` ever fires
- Whether any `autoconsentError` fires

### Step 2: Capture Sourcepoint iframe URL and DOM state

Before running the consent flow, or as part of the frame enumeration, log the URLs of all iframes:

```javascript
for (const frame of page.frames()) {
  console.log(`[frame] ${frame.url()}`);
}
```

This reveals whether the Sourcepoint iframe is present at injection time.

### Step 3: Check button selectors on live sites

Manually visit theguardian.com and spiegel.de in a browser. Open DevTools, navigate to the Sourcepoint iframe, and check:
- Do elements matching `.sp_choice_type_12` or `.sp_choice_type_13` exist?
- Do elements matching `.sp_choice_type_REJECT_ALL` exist?
- What class names do the consent action buttons actually have?

This is the most direct way to confirm or rule out Hypothesis 1 (selector mismatch).

### Step 4: Check if optOut ever reaches the manager-open phase

The Sourcepoint optOut flow has a two-phase structure:
1. Click a button on the initial consent overlay (`.sp_choice_type_12` or `.sp_choice_type_13`)
2. Interact with the privacy manager (`.type-modal`, reject toggles, save)

If step 1 fails (no button found), optOut returns `false` immediately. If step 1 succeeds but step 2 fails, the privacy manager flow hangs until various internal timeouts expire.

The ~8s `consentMs` timing is consistent with: 500ms initial wait + 2s waitForVisible timeout + internal autoconsent retries consuming the remaining time before the external 8s timeout.

## Conclusions and Ranking

| # | Hypothesis | Likelihood | Evidence needed |
|---|-----------|------------|-----------------|
| 1 | Selector mismatch (autoconsent 14.59.0 rules vs current Sourcepoint SDK) | **HIGH** | Check live sites for `.sp_choice_type_*` classes |
| 4 | Timing: consent buttons not rendered within 2s waitForVisible window | **MEDIUM** | Message flow timestamps from instrumented run |
| 2 | eval message loss from frame navigation | **LOW** | Sourcepoint-frame does not use mainWorldEval in its flow |
| 3 | detectRetries=5 insufficient | **LOW** | CMP IS detected (status=failed not none), so detection works |

## Recommendations

### R1: Instrument before fixing (MUST)

Before changing any injection timing, run one instrumented capture against Guardian and Spiegel that logs the full autoconsent message sequence with timestamps. This proves exactly where the flow stalls.

### R2: Verify selectors against live Sourcepoint SDK (MUST)

Check the actual DOM class names on Guardian and Spiegel consent iframes. If autoconsent 14.59.0's selectors don't match the current Sourcepoint SDK, no amount of timing fixes will help. This would be a "needs autoconsent update" finding for the backlog.

### R3: Consider increasing detectRetries to 10 (SHOULD -- if timing is the cause)

The current `detectRetries: 5` gives 2.5s for CMP detection. If Sourcepoint iframes take longer to render their consent UI, increasing to 10 (5s detection window) would help. But this directly trades off against the 8s external timeout -- more time detecting means less time for optOut. A better fix is the late-loading iframe injection (the main PR work) which ensures autoconsent is injected earlier.

### R4: Do NOT change the vendored autoconsent script (CONSTRAINT)

The meta-plan correctly marks this out of scope. If the root cause is a selector mismatch in autoconsent 14.59.0 vs current Sourcepoint, the fix is to update the vendored autoconsent version (a separate backlog item), not to patch the minified bundle.

### R5: Consider whether late-loading iframe injection resolves this organically (SHOULD)

The main PR work (frame event listeners for late-loading iframes) may improve Sourcepoint timing. If autoconsent is injected into the Sourcepoint iframe **earlier** (via `framenavigated` event instead of the one-shot `page.frames()` snapshot after settle), the internal 2s `waitForVisible` timeout has a better chance of succeeding because the frame is caught at an earlier lifecycle point.

However, if the root cause is a selector mismatch, earlier injection won't help.

## Proposed Tasks

1. **Diagnostic instrumentation** (0.5h): Add console.log to the `autoconsentSendMessage` handler in `consent.js` to capture the full message flow with timestamps. Run against Guardian and Spiegel. Analyze the sequence.

2. **Live selector verification** (0.5h): Visit theguardian.com and spiegel.de, inspect the Sourcepoint iframe DOM, document actual button class names vs autoconsent's expected selectors.

3. **Fix or defer based on findings**:
   - If selector mismatch: Create backlog item "Update vendored autoconsent to version >= X that supports current Sourcepoint SDK". Mark Guardian/Spiegel as known-failing in the validation table. No code change in this PR.
   - If timing issue: The late-loading iframe injection (main PR work) likely resolves this. Validate after implementing frame event listeners.
   - If eval message loss: Add defensive re-injection on `framenavigated` events (already part of the main PR work).

## Risks

1. **Selector mismatch is unfixable without autoconsent update**: If the current Sourcepoint SDK has changed its DOM structure, this PR cannot fix Guardian/Spiegel consent. This is not a regression -- these sites were not passing before PR #82 either (they were `none`/undetected). Moving from "undetected" to "detected but failed" is actually progress -- it proves injection works, the rules just need updating.

2. **Autoconsent version upgrade could be complex**: The vendored script is a single 130KB+ minified file. Upgrading requires re-vendoring from @duckduckgo/autoconsent, testing against the full site set, and potentially updating the message routing in consent.js if the autoconsent API changed.

3. **Instrumentation in production**: The diagnostic logging suggested in R1 should use structured logging (the project's existing Coralogix pipeline), not bare console.log. But for a staging-only diagnostic run, console.log is fine.

## Additional Agents

- **frontend-minion**: Primary implementer. The diagnostic instrumentation can be added alongside the frame event listener work. No separate task needed -- just ensure the first staging validation run includes timestamp logging.
- **No additional agents needed for diagnosis**. The selector verification (R2) can be done by whoever runs the staging validation, or as a manual check by the human operator.
