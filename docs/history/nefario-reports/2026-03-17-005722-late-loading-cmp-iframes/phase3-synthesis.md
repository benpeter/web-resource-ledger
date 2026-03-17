## Delegation Plan

**Team name**: cmp-late-frame-injection
**Description**: Fix autoconsent injection timing for late-loading CMP iframes by adding `page.on('framenavigated')` listeners to consent.js. Single-file change plus staging validation.

### Task 1: Add framenavigated listener for late-loading CMP iframes
- **Agent**: frontend-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |
    You are modifying `src/consent.js` in the WRL project to fix autoconsent injection
    timing for late-loading CMP iframes. This is issue #81 -- some CMPs (notably
    OneTrust on NYT) create their iframe AFTER `page.frames()` is enumerated,
    so autoconsent is never injected into them. The fix: register a
    `page.on('framenavigated')` listener that injects autoconsent into late-arriving
    frames.

    ## Constraints
    - ONLY modify `src/consent.js`. Do NOT touch `src/capture.js` or the vendored
      autoconsent script in `src/vendor/`.
    - Do NOT add `frame.waitForLoadState()` -- Playwright's `frame.evaluate()`
      already awaits execution context readiness internally.
    - Do NOT use `context.addInitScript()` -- it runs before bindings are set up.
    - Use `framenavigated` ONLY (not `frameattached`). `frameattached` fires before
      the frame has a document context. `framenavigated` fires after the frame commits
      navigation and has a JavaScript execution context ready for `evaluate()`.
      Frames that only ever have `about:blank` or `javascript:void(0)` URLs are not
      CMP detection targets -- skipping them is correct.
    - Keep the existing `page.frames()` loop as-is for frames already present at
      injection time. The listener is additive.

    ## Changes to `_dismissWithBinding(page, start)`

    1. After `await page.exposeBinding(...)` (line 151) and before the main frame
       injection (line 155), add:

       a. Create `const injectedFrames = new Set()` for deduplication between the
          initial `page.frames()` loop and the listener.

       b. Define a local function `injectIntoFrame(frame)` that:
          - Returns immediately if `frame === page.mainFrame()` (main frame injected separately)
          - Returns immediately if `injectedFrames.has(frame)` (already injected)
          - Adds frame to `injectedFrames`
          - Calls `frame.evaluate(inject, [autoconsentScript]).catch(() => {})` (same
            pattern as the existing loop on line 159)

       c. Add an `active` flag (`let active = true`) that `injectIntoFrame` checks
          before proceeding. This closes the micro-race between Promise.race
          resolution and `page.off()`.

       d. Register `page.on('framenavigated', injectIntoFrame)`.

    2. Replace the existing `page.frames()` loop (lines 156-161) to route through
       `injectIntoFrame` for deduplication:
       ```javascript
       await page.evaluate(inject, [autoconsentScript]);
       injectedFrames.add(page.mainFrame());
       for (const frame of page.frames()) {
         injectIntoFrame(frame);
       }
       ```

    3. After `Promise.race` resolves (line 167), BEFORE returning, clean up:
       ```javascript
       active = false;
       page.off('framenavigated', injectIntoFrame);
       ```
       Use try/finally to ensure cleanup even if an error occurs between listener
       registration and the return.

    ## Changes to `_dismissWithPolling(page, start)`

    Same pattern but with `wrappedScript` as the injection payload instead of
    `[autoconsentScript]`:

    1. After the initial `page.evaluate(wrappedScript)` (line 212), before the
       `page.frames()` loop (line 213), register a `framenavigated` listener
       with the same dedup pattern. The injection call is:
       `frame.evaluate(wrappedScript).catch(() => {})`

    2. Route the existing `page.frames()` loop through `injectIntoFrame`.

    3. Clean up with `page.off()` after the polling while-loop exits (either
       result found or deadline reached). Use try/finally.

    Note: the polling loop on lines 225-231 already calls `page.frames()` each
    iteration to check results from all frames. This still works correctly -- the
    listener ensures autoconsent is INJECTED into late frames, and the poll loop
    checks RESULTS from all frames including late ones.

    ## Deduplication rationale

    Use `Set<Frame>` (not `WeakSet`). Frame identity (reference equality) is correct
    because Playwright reuses the same Frame object across navigations within the same
    iframe element. The Set prevents double-injection during the overlap window between
    the initial `page.frames()` loop and the `framenavigated` listener. Do NOT
    re-inject on subsequent navigations of the same frame -- autoconsent handles
    internal navigations within its own lifecycle, and re-injection mid-flow risks
    conflicting with in-progress opt-out sequences.

    ## What NOT to do
    - Do NOT add diagnostic instrumentation for Sourcepoint. The debugger-minion
      analysis confirms Sourcepoint `failed` status is a selector mismatch in
      autoconsent 14.59.0 vs current Sourcepoint SDK -- not a timing issue. This
      is a separate backlog item.
    - Do NOT extract helper functions for testability. consent.test.js (unit tests
      for pure logic) is a Phase 6 post-execution concern. The frame event listener
      code is integration logic that cannot be meaningfully unit-tested.
    - Do NOT change CONSENT_TIMEOUT_MS, detectRetries, or any timing constants.
    - Do NOT add `frameattached` listeners.
    - Do NOT use `WeakSet` -- `Set` is correct here (the frames are already
      referenced by the page object; WeakSet buys nothing and lacks `.has()` debug
      introspection).

    ## File
    `/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/cmp-navigation/src/consent.js`

    ## Verification
    After making changes, run the full test suite:
    ```bash
    cd /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/cmp-navigation && npx vitest run 2>&1
    ```
    All 503 existing tests must pass. The consent.js changes are additive (listener
    registration + dedup set) and do not change any existing behavior for frames
    already present at injection time.

- **Deliverables**: Modified `src/consent.js` with `framenavigated` listeners in both `_dismissWithBinding` and `_dismissWithPolling`
- **Success criteria**: All 503 existing tests pass; code adds ~20-30 lines; listener registered before initial frame loop; cleanup after Promise.race/polling exit; dedup with Set<Frame>

### Task 2: Staging validation against 14 sites
- **Agent**: (orchestrator -- direct execution, no agent spawn)
- **Delegation type**: standard
- **Model**: n/a
- **Mode**: n/a
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |
    After Task 1 completes and tests pass, deploy to staging and validate
    against the 14-site test set. This is executed directly by the orchestrator
    session, not by a spawned agent.

    Steps:
    1. Deploy to staging: `cd /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/cmp-navigation && unset CLOUDFLARE_API_TOKEN && npx wrangler deploy --env staging`
    2. Trigger captures for all 14 sites against the staging worker
    3. Wait for completion (60s timeout per site)
    4. Collect consent results: status, cmp, durationMs per site
    5. Compare against expected outcomes (see table below)

    Expected outcomes:
    | Site | Expected CMP | Acceptable Status |
    |------|-------------|-------------------|
    | nytimes.com | OneTrust | dismissed, failed, timeout (NOT none) |
    | theguardian.com | Sourcepoint-frame | failed (known selector mismatch) |
    | spiegel.de | Sourcepoint-frame | failed (known selector mismatch) |
    | lemonde.fr | Didomi/TrustCommander | dismissed, failed, timeout |
    | zeit.de | Sourcepoint/consentmanager | dismissed, failed, timeout |
    | yahoo.com | varies | any (geo-dependent) |
    | sap.com | OneTrust | dismissed, failed, none |
    | microsoft.com | MSCC | any |
    | cnn.com | OneTrust | dismissed, failed, none |
    | reuters.com | OneTrust | dismissed, failed |
    | stackoverflow.com | varies | any (geo-dependent) |
    | github.com | none | none |
    | amazon.de | custom | none, failed |
    | bbc.co.uk | none | none |

    Key regression checks:
    - nytimes.com MUST NOT be `none`/`notDetected` (this is the primary bug)
    - theguardian.com and spiegel.de must still detect Sourcepoint-frame (status=failed is acceptable)
    - github.com and bbc.co.uk must remain `none` (no false positives)
    - All 14 captures must complete (status=complete, not error)

- **Deliverables**: Staging validation results table showing consent status per site
- **Success criteria**: NYT shows CMP detected (not `none`); Sourcepoint detection not regressed; no false positives on non-CMP sites; all captures complete

### Cross-Cutting Coverage

- **Testing**: Covered. 503 existing tests validate no regression (Task 1). Staging validation (Task 2) is the integration test for frame event behavior -- consistent with the project's "test the real boundaries" philosophy. consent.test.js for pure-logic unit tests is deferred to Phase 6 (post-execution) per test-minion's recommendation.
- **Security**: No new attack surface. The `framenavigated` listener injects the same autoconsent script through the same `frame.evaluate()` path with the same `exposeBinding` message validation and eval code cap. No new message types, no new eval paths, no new external inputs.
- **Usability -- Strategy**: Not applicable. This is an internal runtime behavior change with no user-facing interface changes. The consent result shape is unchanged.
- **Usability -- Design**: Not applicable. No UI components.
- **Documentation**: Phase 8 (post-execution) handles evolution log entries. The consent.js file header comment already describes multi-frame injection (line 4-7); the `framenavigated` addition is a natural extension.
- **Observability**: No new observability needed. The existing consent result (`status`, `cmp`, `durationMs`) already surfaces in capture records and Coralogix logs. A CMP going from `none` to `dismissed` is observable through the existing pipeline.

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**: none -- this is a single-file, ~25-line additive change to an internal runtime path. No UI, no new runtime components, no user-facing documentation impact.
- **Not selected**: ux-design-minion, accessibility-minion, sitespeed-minion, observability-minion, user-docs-minion

### Conflict Resolutions

**Sourcepoint side-effect theory (edge-minion) vs selector mismatch diagnosis (debugger-minion)**

Edge-minion suggested that `framenavigated` may fix Sourcepoint as a side effect by re-injecting after `about:blank` navigation. Debugger-minion analyzed the evidence more carefully: the status is `failed` (not `none`), meaning autoconsent IS injected and DOES detect Sourcepoint, but the `optOut()` returns `false` because button selectors in autoconsent 14.59.0 don't match the current Sourcepoint SDK. The ~8s `consentMs` timing is consistent with autoconsent's internal retry waits expiring.

**Resolution**: Both positions are compatible. The `framenavigated` listener will be added (it fixes the actual bug -- NYT/OneTrust late-loading iframes), and it may coincidentally improve Sourcepoint injection timing. But we do NOT expect it to fix Sourcepoint `failed` status. The Sourcepoint selector mismatch is a separate backlog item: "Update vendored autoconsent to support current Sourcepoint SDK." This should be added to the backlog during wrap-up.

**Set vs WeakSet for dedup (frontend-minion vs edge-minion)**

Frontend-minion recommends `Set<Frame>`, edge-minion recommends `WeakSet<Frame>`. Resolution: Use `Set`. The frames are already held by the page object for the duration of the consent flow. WeakSet gains nothing (no GC benefit) and loses `.size` for debugging. This is a minor stylistic difference with no functional impact.

### Risks and Mitigations

1. **Frame events unsupported in @cloudflare/playwright Workers runtime** (Low likelihood, Medium impact)
   - Type definitions confirm the API exists; CDP frame lifecycle events underpin existing working features (`page.frames()`, `frame.evaluate()`). But no Cloudflare docs explicitly confirm `page.on('framenavigated')`.
   - Mitigation: Change is additive. If events don't fire, existing `page.frames()` snapshot injection still works as before. Staging validation (Task 2) catches this immediately.

2. **Micro-race between Promise.race resolution and listener cleanup** (Low likelihood, Low impact)
   - A `framenavigated` event could fire between `Promise.race` resolving and `page.off()`.
   - Mitigation: `active` flag checked inside `injectIntoFrame()`, set to `false` before `page.off()`. Even without the flag, the worst case is one unnecessary frame injection that has no observable effect.

3. **Sourcepoint `failed` status unchanged after this fix** (High likelihood, Low impact)
   - This is expected. The Sourcepoint failure is a selector mismatch, not a timing issue.
   - Mitigation: Document as known limitation. Add backlog item for autoconsent version update.

4. **ctx.waitUntil budget unchanged** (pre-existing, not caused by this change)
   - Worst-case pipeline is ~33s vs 30s budget. Frame event listeners add negligible overhead (<100ms).
   - Mitigation: No action needed. Budget risk only triggers when navigation almost times out AND consent takes full 8s -- uncommon combination.

### Execution Order

```
Task 1: Add framenavigated listener (frontend-minion, sonnet)
  |
  v
Task 2: Staging validation (orchestrator, direct execution)
```

Single sequential chain. No parallelism needed (2 tasks, strict dependency).

No approval gates per user directive.

### Verification Steps

1. All 503 existing tests pass after Task 1
2. Staging validation shows:
   - nytimes.com consent status is NOT `none` (primary success criterion)
   - theguardian.com / spiegel.de still show `cmp=Sourcepoint-frame` (not regressed)
   - github.com / bbc.co.uk show `none` (no false positives)
   - All 14 captures complete successfully
3. Code review confirms:
   - Listener registered after `exposeBinding()` / before `page.frames()` loop
   - Cleanup with `page.off()` in try/finally
   - Dedup with `Set<Frame>`
   - `active` flag guards against post-cleanup injection
