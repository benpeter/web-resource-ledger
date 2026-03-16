# Outcome: CMP navigation fix

## Summary

Modified the `context.route()` handler in `src/capture.js` to only block
cross-domain **main-frame** navigations, allowing CMP consent iframes to
load. This fixes the bug where 6/7 tested sites showed `consent=notDetected`
despite having cookie consent management platforms.

## What changed

**One file modified:** `src/capture.js`

1. Added `let page = null` before route registration (fixes TDZ bug)
2. Changed `const page = await context.newPage()` to `page = await context.newPage()`
3. Added main-frame guard with defensive try/catch inside the cross-domain
   navigation block: only `route.abort()` for requests where
   `route.request().frame() === page.mainFrame()`
4. Updated three code comments: security constraints header, inline SECURITY
   comment, and accepted-gaps section

**Net change:** ~15 lines of logic added, 3 comment blocks updated.

## What did NOT change

- No new test files (miniflare can't run Playwright browser tests)
- No changes to consent.js or autoconsent integration
- No same-registrable-domain allowlisting
- No function extraction or refactoring
- No new dependencies

## Test results

- 503 tests pass (23 test files)
- No test regressions

## Staging validation

Pending manual staging deployment and validation against the 8-site test set
from #79. Expected results:
- theguardian.com, spiegel.de, nytimes.com, arstechnica.com: consent detected and dismissed
- bbc.com: redirect followed successfully (Playwright auto-continues 301/302)
- tagesschau.de: no CMP (unchanged)
- slashdot.org: CMP dismissed (unchanged, already worked)

## Backlog changes

- **Added:** `[consider] E2E staging test for CMP iframe consent detection`
  in Capture Fidelity parking lot. Condition: when staging test infrastructure
  supports real Playwright browser. Source: test-minion, Phase 0033.

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
