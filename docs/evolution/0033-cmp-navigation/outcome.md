# Outcome: CMP navigation fix

## Summary

Two-part fix to enable CMP consent detection on sites that use iframe-based
consent providers (Sourcepoint, OneTrust, etc.):

1. **capture.js**: Narrowed the `context.route()` handler to only block
   cross-domain **main-frame** navigations, allowing CMP consent iframes to load.
2. **consent.js**: Injected autoconsent into all frames (main + child iframes)
   and routed binding responses back to the originating frame. Previously
   autoconsent only ran in the main frame, so iframe-based CMPs like
   Sourcepoint-frame were never detected even after their iframes could load.

## What changed

**Two files modified:** `src/capture.js`, `src/consent.js`

### capture.js (route handler)

1. Added `let page = null` before route registration (fixes TDZ bug)
2. Changed `const page = await context.newPage()` to `page = await context.newPage()`
3. Added main-frame guard with defensive try/catch inside the cross-domain
   navigation block: only `route.abort()` for requests where
   `route.request().frame() === page.mainFrame()`
4. Updated three code comments: security constraints header, inline SECURITY
   comment, and accepted-gaps section

### consent.js (multi-frame injection)

1. Inject autoconsent script into all child frames after main frame
   (`page.frames()` iteration) in both the exposeBinding and polling paths
2. Use `source.frame` (not `page`) to route init/eval responses back to
   the correct frame in the exposeBinding callback
3. Poll all frames for results in the polling fallback path

## What did NOT change

- No new test files (miniflare can't run Playwright browser tests)
- No changes to the vendored autoconsent script itself
- No same-registrable-domain allowlisting
- No function extraction or refactoring
- No new dependencies

## Test results

- 503 tests pass (23 test files)
- No test regressions

## Staging validation

Deployed to staging and captured four sites:

| Site | Before (pre-fix) | After (post-fix) | Notes |
|------|------------------|-------------------|-------|
| theguardian.com | notDetected | **failed**, cmp=Sourcepoint-frame | CMP detected, opt-out failed |
| spiegel.de | notDetected | **failed**, cmp=Sourcepoint-frame | CMP detected, opt-out failed |
| nytimes.com | notDetected | notDetected | OneTrust -- likely lazy-loads iframe after injection |
| bbc.co.uk | notDetected | notDetected | No CMP on site (correct) |

The `notDetected -> failed` transition is a net improvement: `failed` with
`cmpDetected` is honest (CMP present, opt-out attempted but didn't complete),
while `notDetected` was a false signal contradicted by the screenshot.

## Known gaps (follow-up work)

1. **Sourcepoint opt-out failure**: CMP detected but opt-out doesn't complete
   within 8s timeout. May be autoconsent rule timing or button selector issue.
2. **OneTrust not detected on NYT**: Likely because OneTrust iframe loads lazily
   (after `page.frames()` is called at injection time). Fix: listen for
   `framenavigated` events and inject into late-arriving frames.
3. **consent.test.js does not exist**: Module header references it but file was
   never created. Unit-testable logic exists (allowlist, eval cap, status mapping).

## Backlog changes

- **Added:** `[consider] E2E staging test for CMP iframe consent detection`
  in Capture Fidelity parking lot. Condition: when staging test infrastructure
  supports real Playwright browser. Source: test-minion, Phase 0033.
- **Should add:** `[should] Inject autoconsent into late-loading CMP iframes`
  (framenavigated listener). Condition: when NYT-style lazy CMPs need support.
- **Should add:** `[consider] Distinguish timeout vs failed in consent API result`
  for audit consumers. Source: ux-strategy-minion.

## Surprises

1. **Playwright redirects bypass route handlers entirely.** The BBC redirect
   case that motivated the same-registrable-domain allowlisting suggestion
   turns out to be a non-issue: Playwright internally auto-continues HTTP
   redirects without invoking route callbacks. Discovered by debugger-minion
   via source code tracing.

2. **`Request.frame()` throws, never returns null.** The Playwright docs
   suggest it could return null, but source tracing shows it throws for
   pre-creation requests and service worker requests. All specialist
   recommendations assumed null-return behavior until debugger-minion
   corrected the record.

3. **The code's existing comments didn't match behavior.** Lines 63-65 of
   capture.js described allowing cross-origin iframe sub-navigation, but the
   actual `isNavigationRequest()` check blocked ALL navigations including
   iframes. The fix aligns code with the documented (and intended) behavior.

4. **Autoconsent injection was the real blocker, not just navigation.** The
   original issue focused on the route handler blocking iframe navigations.
   After fixing that, staging showed CMP banners were visible (iframes loaded)
   but autoconsent still couldn't detect them. Root cause: autoconsent only
   ran in the main frame, but Sourcepoint-frame's `detectCmp()` checks
   `location.href` inside the iframe. Multi-frame injection was required.
