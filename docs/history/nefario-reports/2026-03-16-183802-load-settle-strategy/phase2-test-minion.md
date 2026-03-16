## Domain Plan Contribution: test-minion

### Recommendations

**1. Fixtures: change `waitUntilReached` from `'networkidle'` to `'load'` -- do NOT add a new renderer variant.**

The change in `defaultRenderer` means successful full captures will report `waitUntilReached: 'load'` instead of `'networkidle'`. The existing fixtures that model full captures should simply update their value. There is no semantic distinction between "load strategy" and "load+settle" that warrants a separate renderer -- the settle delay is an implementation detail of the renderer, not a metadata field. The renderer still returns `waitUntilReached: 'load'`, `timedOut: false`, and a `durationMs` reflecting the total time including settle. A new variant would add testing surface without catching any new bug category.

Specifically, update these three fixture renderers in `test/fixtures.js`:
- `consentNotDetectedRenderer` (line 42): `'networkidle'` -> `'load'`
- `dualScreenshotRenderer` (line 55): `'networkidle'` -> `'load'`
- `consentFailedRenderer` (line 67): `'networkidle'` -> `'load'`

**2. Update `enrichedStubRenderer` in `capture.test.js`.**

The inline `enrichedStubRenderer` at line 601 also has `waitUntilReached: 'networkidle'`. This must change to `'load'` and the corresponding assertion at line 751 must match.

**3. Update error messages from "20 seconds" to "25 seconds".**

Since NAV_TIMEOUT_MS changes from 20000 to 25000, the user-facing message in `categorizeError()` changes. All test assertions must track. Better yet: the implementation should derive the message from the constant (`Page did not finish loading within ${NAV_TIMEOUT_MS / 1000} seconds`) so future changes are a single-point edit. Either way, the test assertions must match the new string.

Affected test assertions in `capture.test.js`:
- Line 141: `'Page did not finish loading within 20 seconds'`
- Line 290: `'Page did not finish loading within 20 seconds'`
- Line 713: `'Page did not finish loading within 20 seconds'`
- Line 727: `'Page did not finish loading within 20 seconds'`

Also update `openapi.yaml` examples:
- Line 896: `error: Page did not finish loading within 20 seconds`
- Line 1273: `error: Page did not finish loading within 20 seconds`

**4. Do NOT add a test for "the settle delay is applied".**

Testing that a specific delay duration occurs would require either:
- A real browser integration test with timing measurements (flaky, expensive)
- Mocking `setTimeout`/`page.waitForTimeout` (tests the mock, not the behavior)

Neither approach provides value proportional to its cost. The settle delay is a simple constant applied inside `defaultRenderer`. The real validation comes from:
- The existing stub renderer pattern (tests verify that `performCapture` correctly stores whatever the renderer returns)
- Integration/staging tests against real sites (already covered by the smoke test infrastructure)

What IS worth verifying: that the renderer's *output contract* is correct for the new strategy. The existing tests already cover this -- `enrichedStubRenderer` (now returning `'load'`) validates that `performCapture` stores the render metadata correctly. This is sufficient.

**5. Update the `openapi.yaml` `RenderInfo` description.**

Lines 260-286 describe `waitUntilReached` with `networkidle` as the target milestone. After this change, `'load'` is the target milestone for full captures. The description and `timedOut` explanation must be updated. The enum already includes `load` -- no schema change needed, only narrative updates.

**6. The `partialRenderer` in `fixtures.js` stays as-is.**

`partialRenderer` uses `waitUntilReached: 'domcontentloaded'` (line 80) which is correct -- partial captures happen when the page times out before reaching `load`. This value represents the actual DOM readyState, not the `waitUntil` target, so it does not change.

Similarly, `partialLoadRenderer` in `capture.test.js` (line 586-594) correctly uses `'load'` for a partial capture where `readyState === 'complete'`. No change needed.

**7. Update the comment in `capture.js` defaultRenderer.**

Line 400-401: The comment `// Playwright uses 'networkidle' (not 'networkidle2')` should be updated to reflect the new `'load'` strategy. The surrounding budget calculation comment (line 15) also needs updating to reflect the new timing model.

### Proposed Tasks

Listed in dependency order. Tasks within the same group can be done in parallel.

**Group A -- Source changes (do these first, tests follow)**

- **T1: Update `NAV_TIMEOUT_MS` from 20000 to 25000** in `src/capture.js` line 84.
- **T2: Change `page.goto()` from `waitUntil: 'networkidle'` to `waitUntil: 'load'`** in `src/capture.js` line 403.
- **T3: Add post-load settle delay** (~3s) after `page.goto()` returns in the `defaultRenderer` function. Something like `await page.waitForTimeout(3000)` or similar. The `render.waitUntilReached` return value at line 482 should change from `'networkidle'` to `'load'`.
- **T4: Update `categorizeError()` timeout messages** from `'Page did not finish loading within 20 seconds'` to `'Page did not finish loading within 25 seconds'` (lines 508, 512). Strongly recommend deriving from constant: `` `Page did not finish loading within ${NAV_TIMEOUT_MS / 1000} seconds` ``.
- **T5: Update budget comments** in `src/capture.js` -- lines 15 (header comment), 400-401 (goto comment), 412 (budget comment referencing `~20.5s`).

**Group B -- Test fixture and assertion updates**

- **T6: Update `test/fixtures.js`** -- change `waitUntilReached: 'networkidle'` to `'load'` on lines 42, 55, 67.
- **T7: Update `test/capture.test.js` inline renderers and assertions:**
  - `enrichedStubRenderer` line 601: `'networkidle'` -> `'load'`
  - Assertion line 751: `'networkidle'` -> `'load'`
  - Error message assertions lines 141, 290, 713, 727: `'20 seconds'` -> `'25 seconds'`
- **T8: Update `timeoutRenderer` error message** in `capture.test.js` line 114: `'Navigation timeout of 25000 ms exceeded'` -- this already says 25000, confirm it still matches the new `NAV_TIMEOUT_MS`. (It does, since NAV_TIMEOUT_MS is becoming 25000. No change needed here.)
- **T9: Update `playwrightTimeout` error message** in `capture.test.js` line 280: `'page.goto: Timeout 25000ms exceeded'` -- same as T8, already matches. Confirm no change needed.

**Group C -- API documentation**

- **T10: Update `openapi.yaml`**:
  - Error examples at lines 896, 1273: `'20 seconds'` -> `'25 seconds'`
  - `RenderInfo` description (lines 260-286): change target milestone from `networkidle` to `load`, update `timedOut` description
  - `CaptureRecord.renderQuality` description (line 332): `networkidle` -> `load`
  - Other `networkidle` narrative references in the schema

**Group D -- Verify no collateral damage**

- **T11: Run full test suite** and verify all assertions pass. The following files have `networkidle` or `20 seconds` references but should NOT change:
  - `test/kv.test.js`: uses `domcontentloaded` only -- no change needed
  - `test/capture-retrieval.test.js`: uses `domcontentloaded` only -- no change needed
  - `test/list-captures.test.js`: uses `domcontentloaded` only -- no change needed
  - `test/verify-integration.test.js`: uses `domcontentloaded` only -- no change needed
  - None of these files import consent-related renderers from fixtures.js

### Risks and Concerns

**Risk 1: Partial capture readyState mapping may need adjustment.**

In `defaultRenderer`, the partial capture path (lines 438-446) sets `waitUntilReached` based on `document.readyState`. When `readyState === 'complete'`, it reports `'load'`. When `'interactive'`, it reports `'domcontentloaded'`. With the switch from `networkidle` to `load`, a page that fires `load` quickly but has lingering network activity will now succeed (not time out), so the partial capture path is entered less often. This is the desired behavior -- but verify that the partial capture tests still exercise realistic scenarios. The existing test coverage is adequate since partial renderers are stubs that inject the specific metadata values.

**Risk 2: The settle delay constant should be a named constant, not a magic number.**

If `3000` is used inline, it becomes hard to adjust and test. Recommend defining `SETTLE_DELAY_MS = 3000` alongside `NAV_TIMEOUT_MS`. This doesn't require a test but makes the code maintainable and the budget math auditable.

**Risk 3: Budget math must be validated.**

The new budget breakdown should be documented:
- NAV_TIMEOUT_MS (25s) covers `page.goto(waitUntil: 'load')` + settle delay (3s)
- Actually, clarify: is NAV_TIMEOUT_MS the `page.goto()` timeout (which would NOT include the settle delay)? Or does it include settle? The settle delay happens AFTER `page.goto()` returns, so the total renderer time is `goto_time + settle + screenshot + consent`. With a 30s `ctx.waitUntil` budget:
  - goto timeout: 25s max (but load fires much faster than networkidle)
  - settle: 3s
  - consent: 8s
  - post: 2s
  - Total worst case: 25 + 3 + 8 + 2 = 38s -- exceeds 30s budget

This needs careful review. If `page.goto()` uses a 25s timeout and settle is 3s, the consent window (8s) may not fit. The implementation should ensure the settle delay is accounted for in the budget. This is a **design concern more than a test concern**, but tests should validate that the partial capture deadline logic still fires correctly.

**Risk 4: The `openapi.yaml` enum stays unchanged but semantics shift.**

The enum `[domcontentloaded, load, networkidle]` keeps `networkidle` as a valid value for backward compatibility (old records may have it). But new full captures will report `'load'`. API consumers should not break, but the documentation must clearly state that `networkidle` is a legacy value. This is not a test risk but an API contract consideration.

### Additional Agents Needed

- **api-design-minion**: Review the `openapi.yaml` changes, particularly the `RenderInfo` description updates and any backward-compatibility implications for API consumers who might be matching on `waitUntilReached === 'networkidle'`.
- **edge-minion**: Validate the budget math. The interaction between NAV_TIMEOUT_MS, settle delay, consent window, and `ctx.waitUntil` budget is the critical correctness concern. Tests can verify the renderer output contract but cannot validate real-world timing behavior.
