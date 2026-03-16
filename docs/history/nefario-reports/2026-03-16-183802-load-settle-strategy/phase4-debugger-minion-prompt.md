## Task: Switch navigation from networkidle to load + settle delay

GitHub issue #67. Change `defaultRenderer()` in `src/capture.js` to use
`waitUntil: 'load'` with a 3-second post-load settle delay instead of
`waitUntil: 'networkidle'`. Update tests and OpenAPI spec to match.

### Why

Ad-heavy sites (tagesschau.de, adobe.com) visually load in 2-3s but their
tracking scripts keep network connections alive indefinitely. `networkidle`
burns 20s waiting for silence that never comes, leaving too little budget
for consent dismissal, screenshots, and WACZ packaging.

### What to change

All changes are in the worktree at:
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario/load-settle-strategy/

#### A. Source changes (src/capture.js)

1. Add constant SETTLE_DELAY_MS = 3000 alongside existing timeout constants.

2. Keep NAV_TIMEOUT_MS at 20000. Do NOT change it.

3. Change page.goto() call from waitUntil: 'networkidle' to waitUntil: 'load'.

4. Add settle delay on happy path -- insert await page.waitForTimeout(SETTLE_DELAY_MS)
   immediately after the limitExceeded check, BEFORE the viewport height check and
   screenshots. If page.waitForTimeout() is not available, use
   await new Promise(r => setTimeout(r, SETTLE_DELAY_MS)) instead.

5. SECURITY ADVISORY: After the settle delay, add a SECOND limitExceeded check.
   During the settle delay, async response events can push totalBytes past
   MAX_PAGE_BYTES. Add: if (limitExceeded) throw new Error(limitExceeded);
   after the settle delay. This closes the window.

6. Update render.waitUntilReached on the happy-path return from 'networkidle' to 'load'.

7. Update categorizeError() messages to derive from NAV_TIMEOUT_MS constant:
   return { message: `Page did not finish loading within ${NAV_TIMEOUT_MS / 1000} seconds`, retryable: true };
   Do this for both the Deadline exceeded case and the TimeoutError case.

8. Update file-header comment (line 15) to reflect new timing budget.

9. Update inline comment at the goto call to explain the strategy change.

10. Update partial-capture budget comment to note this is the load timeout path.

#### B. Test changes

11. test/fixtures.js -- change waitUntilReached: 'networkidle' to 'load' on:
    - consentNotDetectedRenderer (line 42)
    - dualScreenshotRenderer (line 55)
    - consentFailedRenderer (line 67)

12. test/capture.test.js -- update:
    - enrichedStubRenderer (line 601): 'networkidle' -> 'load'
    - Assertion (line 751): 'networkidle' -> 'load'
    - Error message assertions at lines 141, 290, 713, 727 stay as "20 seconds"
      (NAV_TIMEOUT_MS unchanged). Verify they still pass after template literal change.

#### C. OpenAPI spec changes (openapi.yaml)

13. Update RenderInfo descriptions to reflect load milestone instead of networkidle.
    Keep networkidle in the enum for backward compatibility.

14. Update CaptureRecord.renderQuality and render descriptions similarly.

15. Error examples stay the same (20 seconds, NAV_TIMEOUT_MS unchanged).

#### D. Do NOT change
- partialRenderer in test/fixtures.js (uses domcontentloaded -- correct)
- partialLoadRenderer in test/capture.test.js (uses 'load' for partial -- correct)
- timeoutRenderer error messages (25000ms -- correct Playwright timeout value)
- Staged fallback path structure (lines 402-451)
- Other test files

#### E. After all changes
Run npm test and verify all tests pass.

### Success criteria
- waitUntil: 'load' in page.goto() call
- SETTLE_DELAY_MS = 3000 constant defined
- Settle delay on happy path after limitExceeded check, before screenshots
- Second limitExceeded check after settle delay (security advisory)
- render.waitUntilReached returns 'load' on happy path
- categorizeError() derives message from NAV_TIMEOUT_MS constant
- All 3 fixture renderers updated to 'load'
- enrichedStubRenderer and assertion updated to 'load'
- OpenAPI spec descriptions updated (enum unchanged)
- All existing tests pass
- No changes to the staged fallback path structure
