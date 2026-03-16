# Phase 3: Synthesis -- Load + Settle Strategy

## Delegation Plan

**Team name**: load-settle-strategy
**Description**: Switch navigation wait strategy from networkidle to load + settle delay for reliable captures on ad-heavy sites.

### Conflict Resolution: NAV_TIMEOUT_MS

Both specialists flagged budget overrun risk if NAV_TIMEOUT_MS is raised to 25s. The worst-case arithmetic (25 + 3 + 8 + 2 = 38s) exceeds the 30s ctx.waitUntil hard limit.

**Resolution: Keep NAV_TIMEOUT_MS at 20s.**

Rationale:
- With `waitUntil: 'load'`, the timeout covers a much narrower event than `networkidle`. The `load` event fires when the DOM and synchronous subresources (images, CSS, iframes) are loaded. For healthy sites: 1-5s. For pathological sites: 10-15s. A 20s timeout for just the `load` event is generous.
- 20s timeout means worst-case budget: 20 + 3 + 8 + 2 = 33s. Still tight, but the pathological case (load at 20s) already triggers the staged fallback (TimeoutError), so the settle delay never runs. Realistic worst: 10 + 3 + 8 + 2 = 23s, well within 30s.
- The issue says "NAV_TIMEOUT_MS restored to 25s (or justified if kept at 20s)." This is the justification: raising to 25s creates a real budget overrun window (pages where load fires at 22-24s succeed but then push past 30s with settle + consent), while keeping at 20s saves zero real-world captures (any site needing >20s to fire `load` is broken).
- debugger-minion independently recommends 20s for the same reasons.
- A comment in `categorizeError()` will document the justification.

### Task 1: Switch navigation from networkidle to load + settle delay
- **Agent**: debugger-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: no
- **Gate reason**: n/a -- single-file source change + mechanical test/spec updates, easy to reverse, low blast radius.
- **Prompt**: |
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
    `/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario/load-settle-strategy/`

    #### A. Source changes (`src/capture.js`)

    1. **Add constant** `SETTLE_DELAY_MS = 3000` alongside existing timeout
       constants (after line 88, alongside PARTIAL_CONTENT_TIMEOUT_MS).

    2. **Keep `NAV_TIMEOUT_MS` at 20000** (line 84). Do NOT change it. The
       issue suggested 25s but budget analysis shows 20s is correct:
       - With `waitUntil: 'load'`, the timeout covers only the load event
         (1-5s typical, 10-15s pathological). 20s is generous for this.
       - Budget: 20 + 3 + 8 + 2 = 33s worst-case. But if goto takes 20s,
         TimeoutError fires and staged fallback runs (settle delay never
         executes). Realistic worst: 10 + 3 + 8 + 2 = 23s.
       - 25s would create a real overrun window: pages where load fires at
         22-24s succeed but settle + consent push past 30s.

    3. **Change `page.goto()` call** (line 403) from
       `waitUntil: 'networkidle'` to `waitUntil: 'load'`.

    4. **Add settle delay on happy path** -- insert
       `await page.waitForTimeout(SETTLE_DELAY_MS)` immediately after the
       `if (limitExceeded) throw` check (after line 454), BEFORE the viewport
       height check and screenshots. This is the happy path only -- the settle
       delay must NOT run on the partial capture (timeout) path.

       NOTE: `page.waitForTimeout()` is standard Playwright API. If it's not
       available in `@cloudflare/playwright`, use
       `await new Promise(r => setTimeout(r, SETTLE_DELAY_MS))` instead.

    5. **Update `render.waitUntilReached`** on the happy-path return (line 482)
       from `'networkidle'` to `'load'`.

    6. **Update `categorizeError()` messages** (lines 508, 512). Since
       NAV_TIMEOUT_MS stays at 20s, the message text stays the same ("within
       20 seconds"). But improve it to derive from the constant so future
       changes are single-point:
       ```js
       return { message: `Page did not finish loading within ${NAV_TIMEOUT_MS / 1000} seconds`, retryable: true };
       ```
       Do this for both the "Deadline exceeded" case (line 508) and the
       TimeoutError case (line 512).

    7. **Update the file-header comment** (line 15) which says
       `NAV_TIMEOUT_MS=20s + 8s consent + 2s post`. Change to:
       `NAV_TIMEOUT_MS=20s load + 3s settle + 8s consent + 2s post ≈ 33s worst-case; in practice load fires in 2-5s`.

    8. **Update the inline comment** at line 400-401. Currently says:
       ```
       // Navigate with 20s timeout; 8s consent window + 2s post-processing fits the 30s ctx.waitUntil budget
       // Playwright uses 'networkidle' (not 'networkidle2')
       ```
       Change to:
       ```
       // Navigate with 20s timeout using 'load' (not 'networkidle' -- ad trackers keep connections alive indefinitely)
       // Post-load: 3s settle + 8s consent + 2s post-processing fits the 30s ctx.waitUntil budget
       ```

    9. **Update the partial-capture budget comment** at line 412. Currently says:
       `// 2000ms budget: renderer has been running ~20.5s; leaves margin for KV/R2 post-work`
       Change to:
       `// 2000ms budget: renderer has been running ~20.5s (load timed out); leaves margin for KV/R2 post-work`
       (The "~20.5s" is still correct -- this path runs when goto times out at 20s.)

    #### B. Test changes

    10. **`test/fixtures.js`** -- change `waitUntilReached: 'networkidle'` to
        `'load'` on these three fixture renderers:
        - `consentNotDetectedRenderer` (line 42)
        - `dualScreenshotRenderer` (line 55)
        - `consentFailedRenderer` (line 67)

    11. **`test/capture.test.js`** -- update inline renderer and assertions:
        - `enrichedStubRenderer` (line 601): `'networkidle'` -> `'load'`
        - Assertion (line 751): `'networkidle'` -> `'load'`
        - Error message assertions: since NAV_TIMEOUT_MS stays at 20s, these
          four assertions remain "20 seconds" and do NOT change:
          - Line 141, 290, 713, 727
          Verify they still pass after the template literal change in
          `categorizeError()`.

    #### C. OpenAPI spec changes (`openapi.yaml`)

    12. **RenderInfo description** (lines 260-286): Update narrative to reflect
        that the target milestone is now `load` (not `networkidle`). The enum
        keeps `networkidle` for backward compatibility (old records may have it).
        Specifically:
        - Line 262: change "reached the target (networkidle)" to "reached the
          target milestone (load). Older captures may report networkidle."
        - Line 263: change "When absent, the page reached networkidle" to
          "When absent, the page loaded successfully"
        - Line 272: keep the description of what "networkidle" means (it's
          still a valid enum value for old records), but add that "load" is
          the current target for full captures.
        - Lines 278-280: change "did not reach the target milestone
          (networkidle)" to "did not reach the target milestone (load)"
        - Line 286: change "at networkidle or at timeout" to "at load
          completion or at timeout"

    13. **CaptureRecord.renderQuality description** (line 332): change
        "reached networkidle" to "reached the load milestone"

    14. **CaptureRecord.render description** (line 340): change "reached
        networkidle" to "loaded successfully"

    15. **Error examples** -- since NAV_TIMEOUT_MS stays at 20s, these
        stay the same. No change needed:
        - Line 896: `error: Page did not finish loading within 20 seconds`
        - Line 1273: `error: Page did not finish loading within 20 seconds`

    #### D. Do NOT change

    - `partialRenderer` in `test/fixtures.js` (line 80) -- uses
      `domcontentloaded`, which is correct for partial captures.
    - `partialLoadRenderer` in `test/capture.test.js` (line 590) -- uses
      `'load'` for partial capture where readyState is complete. Correct.
    - `timeoutRenderer` error message (line 114) -- already says 25000ms,
      which is the Playwright timeout value. This is fine.
    - `playwrightTimeout` error message (line 280) -- already says 25000ms.
    - The staged fallback path (lines 402-451) -- structurally unchanged.
      The readyState check, 2s deadline, partial screenshot/content
      extraction all remain as-is.
    - Other test files (`kv.test.js`, `capture-retrieval.test.js`,
      `list-captures.test.js`, `verify-integration.test.js`) -- none
      reference `networkidle` or `20 seconds`.

    #### E. After all changes

    Run `npm test` and verify all tests pass. The test suite has ~474 tests.

    ### Success criteria
    - `waitUntil: 'load'` in `page.goto()` call
    - `SETTLE_DELAY_MS = 3000` constant defined
    - `page.waitForTimeout(SETTLE_DELAY_MS)` on happy path after limitExceeded check, before screenshots
    - `render.waitUntilReached` returns `'load'` on happy path
    - `categorizeError()` derives message from `NAV_TIMEOUT_MS` constant
    - All 3 fixture renderers updated to `'load'`
    - `enrichedStubRenderer` and assertion updated to `'load'`
    - OpenAPI spec descriptions updated (enum unchanged)
    - All existing tests pass
    - No changes to the staged fallback path structure

- **Deliverables**:
    - Modified `src/capture.js` (new constant, changed wait strategy, settle delay, updated comments and error messages)
    - Modified `test/fixtures.js` (3 renderer values)
    - Modified `test/capture.test.js` (inline renderer + assertion)
    - Modified `openapi.yaml` (narrative descriptions)
- **Success criteria**: `npm test` passes. Manual code review confirms settle delay placement is on happy path only, between limitExceeded check and first screenshot.

### Cross-Cutting Coverage

- **Testing** (test-minion): Covered within Task 1 -- test fixture and assertion updates are part of the implementation task. Phase 6 post-execution will run the full test suite.
- **Security** (security-minion): Not needed. debugger-minion explicitly confirmed: no security posture change. The settle delay is a passive timer with no new code execution on the page. Cross-domain blocking, subresource limits, context isolation, header redaction all unaffected.
- **Usability -- Strategy** (ux-strategy-minion): Not needed for execution. This is a backend timing change invisible to API consumers. The `waitUntilReached` field value changes from `networkidle` to `load` for new captures, but the enum and contract are unchanged. Phase 3.5 review will cover this.
- **Usability -- Design** (ux-design-minion, accessibility-minion): Not needed. No user-facing interface changes.
- **Documentation** (software-docs-minion / user-docs-minion): OpenAPI spec updates are included in Task 1. The spec narrative changes are straightforward (networkidle -> load in descriptions). Phase 8 post-execution will handle any remaining documentation. No user-facing documentation changes needed.
- **Observability** (observability-minion, sitespeed-minion): Not needed. No new logging, metrics, or tracing. The existing `render.durationMs` field will naturally include settle time (it measures wall-clock from navigation start to capture). Coralogix monitoring should be checked post-deploy for `render.durationMs` distribution changes, but that's operational, not a code change.

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - None. This is a narrow timing change within a single source file plus mechanical updates to tests and spec. No UI, no new runtime components, no user-facing documentation impact, no multi-service coordination.
- **Not selected**: ux-design-minion, accessibility-minion, sitespeed-minion, observability-minion, user-docs-minion

### Conflict Resolutions

1. **NAV_TIMEOUT_MS: 25s vs 20s** -- Issue #67 says "restored to 25s (or justified if kept at 20s)." Both specialists warn about budget overrun with 25s. Resolution: keep at 20s with justification documented in code comments. See detailed rationale at top of this document.

2. **api-spec-minion / api-design-minion involvement** -- Both specialists recommended an API spec agent review the openapi.yaml changes. Resolution: the changes are narrative-only (updating descriptions from "networkidle" to "load"). The enum is unchanged, no schema changes, no backward compatibility issues. Including these in the single implementation task is proportionate. Phase 3.5 review by ux-strategy-minion covers the API consumer perspective.

### Risks and Mitigations

1. **Visual completeness regression on clean sites** (LOW): Pages that loaded fully under `networkidle` (0 connections for 500ms) now get a 3s timer instead. Risk: async-rendered content might not be complete in 3s. Mitigation: 3s is generous for typical hydration (<1s). Target capture population is news articles and landing pages, not heavy SPAs. Monitor `render.durationMs` in Coralogix post-deploy.

2. **`page.waitForTimeout()` unavailable in @cloudflare/playwright** (LOW): If the API subset doesn't include this method, the fallback is `await new Promise(r => setTimeout(r, SETTLE_DELAY_MS))` -- functionally identical. The prompt includes this fallback instruction.

3. **Budget math edge case** (MEDIUM): If load fires at exactly 20s, TimeoutError triggers and the staged fallback runs (settle delay skipped -- correct). If load fires at 19.9s, the happy path runs: 19.9 + 3 + 8 + 2 = 32.9s, past 30s. Mitigation: a page needing 19.9s to fire `load` is deeply pathological. The consent phase has its own 8s timeout and most consent completes in <3s. Realistic worst case for this edge: 19.9 + 3 + 3 + 1 = 26.9s. Acceptable.

4. **Test assertion string matching** (LOW): `categorizeError()` switching to template literal must produce the exact same string. Since NAV_TIMEOUT_MS stays at 20000, the output is `"Page did not finish loading within 20 seconds"` -- unchanged. Tests catch any mismatch.

### Execution Order

```
Batch 1: Task 1 (all source, test, and spec changes)
Phase 3.5: Architecture review (5 mandatory reviewers)
Phase 5: Code review (code-review-minion, lucy, margo)
Phase 6: Test execution (npm test)
Phase 8: Documentation (evolution log)
```

No approval gates. Single task, easy to reverse, no downstream dependents.

### Verification Steps

1. `npm test` passes all ~474 tests
2. `grep -rn 'networkidle' src/` returns zero matches (only docs/history should have it)
3. `grep -rn "waitUntilReached: 'networkidle'" test/` returns zero matches
4. Code review confirms settle delay is placed after limitExceeded check, before viewport height check and screenshots
5. Code review confirms staged fallback path (lines 402-451) is structurally unchanged
6. OpenAPI spec `waitUntilReached` enum still includes all three values (backward compat)
