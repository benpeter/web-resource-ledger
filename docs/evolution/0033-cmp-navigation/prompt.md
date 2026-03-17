# Prompt: Fix cross-domain navigation block for CMP consent iframes

Source: GitHub Issue #81

## Outcome

Cookie consent banners from third-party CMP providers (Sourcepoint, OneTrust,
consentmanager.net, etc.) render correctly during capture, so that autoconsent
can detect and dismiss them and captureSettings accurately reflects consent state.

## Success criteria

- Cross-domain iframe navigations (CMP iframes) are no longer blocked by the route handler
- Cross-domain top-level navigations are still blocked (TOCTOU security guarantee preserved)
- Autoconsent detects CMPs on sites that use iframe-based consent (Guardian, Spiegel, NYT as test cases)
- BBC capture follows the bbc.com -> bbc.co.uk redirect successfully (same-site redirect, not a security risk)
- All existing capture and security tests pass
- Staging validation against the same 8-site test set from #79

## Scope

- **In:** `context.route` handler in capture.js (line 445-453), specifically the `isNavigationRequest()` check; related tests
- **Out:** Autoconsent library changes, CMP-specific handling, new consent providers, subresource counting logic

## Constraints

- Use `route.request().frame() === page.mainFrame()` (or Playwright equivalent) to distinguish top-level from iframe navigation

## Evidence

Discovered during #79 staging testing. 6/7 tested sites show `consent=notDetected` despite having CMPs.
