# Domain Plan Contribution: debugger-minion

## Recommendations

### 1. Use `page.waitForTimeout(3000)` as the settle delay -- not `networkidle` with a short timeout

Three approaches were asked about. Here is the analysis:

**Option A: `page.waitForTimeout(3000)` (plain timer)**

- Deterministic. Exactly 3000ms added to every successful `load` event.
- No risk of hanging on ad-heavy sites -- the timer fires regardless of network state.
- On fast pages (e.g., example.com where load fires in <1s), this "wastes" 3s. But the total navigation phase (load + settle) will be ~4s, far below the current 20s networkidle timeout.
- Simple to reason about in budget analysis. No Playwright API quirks.

**Option B: `page.waitForLoadState('networkidle')` with a short timeout (~3s) as "best effort"**

- This is the approach that was explicitly rejected in Phase 0014 as adding complexity.
- On ad-heavy sites (tagesschau.de, adobe.com), `networkidle` will never fire. The 3s timeout will always be hit, turning this into Option A with extra error-handling noise.
- On clean sites, `networkidle` fires in <500ms, saving ~2.5s vs the timer. But the 30s budget is not tight enough to justify this optimization.
- Risk: Playwright's `waitForLoadState` timeout throws a `TimeoutError`. This must be caught and swallowed, which introduces confusion with the *navigation* TimeoutError from `page.goto()`. The partial capture fallback catches `navError.name === 'TimeoutError'` (line 405) -- a settle-phase TimeoutError must not leak into that catch block.
- Verdict: complexity for marginal gain. The error-confusion risk is real and the debugging tax is high.

**Option C: Custom idle detection (e.g., MutationObserver + network quiescence)**

- Most adaptive -- could detect when JS rendering actually completes.
- Requires injecting a script via `page.evaluate()`, setting up MutationObserver, monitoring network activity, and racing with a timeout.
- Substantial new code surface for a marginal improvement over a fixed timer.
- Creates a new failure mode: the injected script could be blocked by CSP, or interact badly with page JS.
- Verdict: violates KISS and YAGNI. Not warranted.

**Recommendation: Option A (`page.waitForTimeout(3000)`).**

It is the simplest approach that solves the stated problem. The ~3s "waste" on fast pages is a non-issue because the total pipeline time drops from 20-28s to 6-14s -- a massive improvement.

### 2. Settle delay placement: immediately after `page.goto()` succeeds, before screenshots

The settle delay should go at line 453 (immediately after the current `if (limitExceeded)` check), before the viewport height check and before-screenshot. The flow becomes:

```
page.goto(url, { timeout: NAV_TIMEOUT_MS, waitUntil: 'load' })
  --> [on timeout: staged fallback path, unchanged from #53]
  --> [on success: continue]
if (limitExceeded) throw
await page.waitForTimeout(SETTLE_DELAY_MS)  // <-- new
// ... existing: viewport cap, before-screenshot, consent, after-screenshot, html
```

**Why before screenshots, not after**: The settle delay exists to let late-rendering JS (analytics callbacks, lazy-loaded images, font swaps, hydration) complete before the first screenshot. Placing it after the screenshot defeats the purpose.

**Why not between the two screenshots**: The before-screenshot must capture the page as-loaded (with consent banner). The settle delay should ensure that the page has visually stabilized including any consent banner rendering. Consent dismissal happens after, and the after-screenshot is taken immediately because autoconsent's DOM manipulation is synchronous enough not to need another settle.

### 3. NAV_TIMEOUT_MS should be raised to 25s

Current value: 20s (set in Phase 0014 when `networkidle` was the wait strategy).

With `waitUntil: 'load'`, the timeout covers a much narrower window: DNS + TLS + HTTP response + HTML parsing + subresource loading up to the `load` event. The `load` event fires when the DOM is complete and all synchronous subresources (images, CSS, iframes) are loaded. For healthy sites, this is 1-5s. For pathological sites, 10-15s.

Budget breakdown with 25s NAV_TIMEOUT_MS + 3s settle:

| Phase | Max duration | Cumulative |
|-------|-------------|------------|
| Session acquisition | ~0.5s (hot session) | 0.5s |
| Navigation (load event) | 25s (timeout) | 25.5s |
| Settle delay | 3s | 28.5s |
| -- Remaining for consent + screenshots + WACZ + R2/KV | -- | 1.5s |

That budget is too tight if navigation actually takes 25s. However:

- If the `load` event takes 25s, the page is pathological and the staged fallback should handle it.
- The NAV_TIMEOUT_MS acts as a safety net, not an expected duration. Typical `load` fires in 2-5s.
- Realistic worst-case budget (5s load + 3s settle + 8s consent + 2s post): 18s, well within 30s.

**Recommendation**: Set NAV_TIMEOUT_MS to 25s. But the staged fallback catch block must account for the settle delay having NOT yet run. See Risk #2 below.

### 4. The settle delay must NOT run on the partial capture path

The staged fallback (lines 402-451) catches `TimeoutError` from `page.goto()` and gives itself a 2s deadline for screenshot + HTML extraction. If the settle delay is inside the `try` block before the catch, it does not execute on timeout (correct). But this must be verified in the implementation -- the settle delay placement must be strictly after the `page.goto()` try/catch block's successful path.

### 5. The `render.waitUntilReached` field should change from `'networkidle'` to `'load'`

Line 482 currently reports `waitUntilReached: 'networkidle'`. This must change to `'load'` for the happy path. The partial path already correctly reports the `readyState`-derived value (line 440). The `openapi.yaml` enum already includes `'load'` as a valid value.

### 6. Introduce a named constant `SETTLE_DELAY_MS = 3000`

Consistent with the project's pattern of naming timeouts (NAV_TIMEOUT_MS, HEADER_FETCH_TIMEOUT_MS, PARTIAL_SCREENSHOT_TIMEOUT_MS, PARTIAL_CONTENT_TIMEOUT_MS, CONSENT_TIMEOUT_MS). The delay value should be tunable in one place.

### 7. The `categorizeError()` user-facing message should be updated

Line 508: `'Page did not finish loading within 20 seconds'` -- this should reflect the new NAV_TIMEOUT_MS value. If NAV_TIMEOUT_MS changes to 25s, the message should say 25. Better: derive the message from the constant so it stays in sync.

---

## Proposed Tasks

1. **Add `SETTLE_DELAY_MS = 3000` constant** alongside existing timeout constants (line ~88).

2. **Change `page.goto()` from `waitUntil: 'networkidle'` to `waitUntil: 'load'`** at line 403.

3. **Insert `await page.waitForTimeout(SETTLE_DELAY_MS)` on the happy path** -- after `if (limitExceeded) throw` (line 454), before viewport height check (line 457).

4. **Restore `NAV_TIMEOUT_MS` to 25000** (line 84).

5. **Update `render.waitUntilReached`** from `'networkidle'` to `'load'` on the happy-path return (line 482).

6. **Update `categorizeError()` message** to reflect the new timeout value (or derive from constant).

7. **Update the file-header comment** (line 15) which describes the budget as "NAV_TIMEOUT_MS=20s + 8s consent + 2s post" -- should reflect new budget breakdown.

8. **Update the inline comment** at line 400 ("Navigate with 20s timeout; 8s consent window + 2s post-processing fits the 30s ctx.waitUntil budget") to describe the new strategy.

9. **Update test assertions**: `enrichedStubRenderer` (fixtures.js line 601) reports `waitUntilReached: 'networkidle'` -- must change to `'load'`. The test at capture.test.js line 751 asserts `networkidle` -- must change. The error message assertion at line 141 ("within 20 seconds") needs updating if the message changes.

10. **Verify staged fallback is unaffected**: The partial capture path (lines 402-451) should not be structurally modified. The `readyState` check and 2s deadline remain. Verify that changing `waitUntil` from `'networkidle'` to `'load'` does not alter when `TimeoutError` fires or what `document.readyState` returns at that point. (Answer: it does not -- `TimeoutError` fires when the timeout expires regardless of `waitUntil`, and `readyState` reflects DOM state independent of the Playwright wait strategy.)

---

## Risks and Concerns

### Risk 1: Visual completeness regression on "clean" sites

**What**: Pages that previously loaded with full visual fidelity under `networkidle` (which waits for 0 connections for 500ms) might now be screenshotted 3s after the `load` event, which for some sites could be before all async-rendered content appears.

**Why it matters**: A JS-heavy SPA might fire `load` before React hydration completes. The 3s settle covers most hydration, but not all.

**Mitigation**: The 3s settle is deliberately generous. React hydration on a typical page completes in <1s. Heavy SPAs (dashboards, apps) are not the target capture population for WRL -- the target is news articles, landing pages, and public content pages. Monitor `render.durationMs` in Coralogix after deployment; if captures consistently complete in <5s total, the settle delay is sufficient.

**Detection**: Compare before/after screenshots for a set of known URLs. This is a manual verification step during the PR review, not an automated test.

### Risk 2: Budget overrun if load event is slow AND settle runs

If a site's `load` event fires at, say, 22s (just under a 25s timeout), the settle delay adds 3s, pushing total to 25s. Then consent (8s max) would push past 30s.

**Mitigation**: This is the same class of site that currently times out at 20s under `networkidle`. The staged fallback handles this today. With the new strategy, these sites are more likely to succeed (load fires faster than networkidle on ad-heavy sites), but if they do time out, the fallback is unchanged.

**However**: There is a subtler scenario. A page where `load` fires at 22s will NOT trigger the staged fallback (no TimeoutError). The settle delay then runs for 3s (total 25s), and the consent phase starts. If consent takes the full 8s, total is 33s -- past the 30s hard limit. The `ctx.waitUntil` will cut execution.

**Proposed mitigation**: After the settle delay, check remaining time budget before entering the consent phase. If less than ~10s remains (not enough for consent + screenshots + post-work), either skip consent entirely or reduce the consent timeout dynamically. This is a new defensive check, not currently in the codebase.

Alternatively (simpler): reduce NAV_TIMEOUT_MS to 20s to guarantee that load + settle (23s max) leaves 7s for downstream work. But this conflicts with the requirement to "restore to 25s or justify if kept at 20s."

**Justification for 20s**: With the new strategy, `waitUntil: 'load'` fires much faster than `networkidle` on real sites. The 20s timeout is generous for the `load` event and leaves a safe margin (20 + 3 = 23s, leaving 7s for consent + post-work). Setting it to 25s saves zero real-world captures (any site that needs >20s to reach `load` is broken) but creates the budget overrun risk above.

### Risk 3: `page.waitForTimeout()` availability on `@cloudflare/playwright`

`page.waitForTimeout()` is a standard Playwright API. However, `@cloudflare/playwright` is a subset of the full Playwright API. Verify that `waitForTimeout` is available in the Cloudflare binding. If not, use `await new Promise(r => setTimeout(r, SETTLE_DELAY_MS))` as a fallback (functionally identical, just less idiomatic).

### Risk 4: Test fixture assumptions

Multiple test fixtures in `test/fixtures.js` hardcode `waitUntilReached: 'networkidle'` (lines 42, 55, 67). These must all be updated to `'load'`. The `openapi.yaml` examples also reference `networkidle` as the happy-path value. Missing any of these creates inconsistency between code and fixtures/spec.

### Risk 5: Error message string matching in tests

`categorizeError()` produces messages matched by tests via string equality (line 141: `'Page did not finish loading within 20 seconds'`). If the message changes, all tests matching it must be found and updated. There are also references in `openapi.yaml` descriptions. A search for "20 seconds" across the codebase should be part of the implementation checklist.

---

## Additional Agents Needed

- **test-minion**: Update test fixtures (`waitUntilReached: 'networkidle'` -> `'load'`), error message assertions, and add a test verifying that the settle delay is documented in the `render.durationMs` field (i.e., durationMs includes settle time). Verify no other tests implicitly depend on `networkidle` semantics.

- **api-spec-minion** (or whoever owns openapi.yaml): Update the `RenderInfo` schema description which says `"networkidle" means fewer than two open network connections for 500ms` and the examples that show `waitUntilReached: networkidle` as the happy-path value. The spec should note that `'load'` is now the expected value for full captures.

- **No security review needed**: This change does not alter the security posture. Cross-domain blocking, subresource limits, page size limits, context isolation, and header redaction are all unaffected. The settle delay is passive (timer, no new code execution on the page).
