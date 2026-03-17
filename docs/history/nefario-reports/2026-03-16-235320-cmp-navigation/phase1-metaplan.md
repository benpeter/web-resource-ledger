# Meta-Plan: CMP iframe navigation fix

## Task Summary

The `context.route('**/*')` handler in `capture.js` (lines 367-390) blocks
ALL cross-domain navigation requests -- including CMP iframe navigations that
are essential for cookie consent detection. The fix needs to distinguish
top-level (main frame) navigation from iframe navigation, blocking only the
former to preserve the TOCTOU security guarantee while allowing CMPs like
Sourcepoint, OneTrust, and consentmanager.net to load their consent UI in
iframes.

Additionally, the BBC capture fails because `bbc.com` -> `bbc.co.uk` is
treated as a cross-domain redirect even though it's a same-site redirect
(same registrable domain). This is a secondary fix that needs careful scoping
to avoid opening arbitrary redirect chains.

### Key code surface

- `src/capture.js` lines 367-375: the route handler with `isNavigationRequest()` + origin check
- `src/capture.js` lines 58-66: "Accepted gaps" documentation that already acknowledges iframe sub-navigation
- `src/consent.js`: autoconsent integration (not in scope for changes, but affected by the fix)
- `test/capture.test.js`: unit tests use injectable renderer stubs; route handler is tested implicitly via integration

### Constraint from task

Use `route.request().frame() === page.mainFrame()` (or Playwright equivalent)
to distinguish top-level from iframe navigation.

---

## Planning Consultations

#### Consultation 1: Security implications of relaxing navigation blocking

- **Agent**: security-minion
- **Planning question**: The current route handler blocks ALL cross-domain `isNavigationRequest()` requests. The proposed fix would narrow this to only block cross-domain navigations in the main frame, allowing iframe navigations to proceed freely. Given the existing security model (TOCTOU gap closure, single-tenant deployment, BrowserContext isolation, service workers blocked), what are the security implications of allowing cross-domain iframe navigations? Specifically: (1) Can a malicious page use a cross-origin iframe to exfiltrate data from the capture environment? (2) Does the BBC same-site redirect (bbc.com -> bbc.co.uk) warrant special handling beyond the main-frame check, or should same-registrable-domain redirects be allowed for top-level navigation too? (3) Are there any iframe-based attacks (clickjacking within the capture, postMessage exploitation, etc.) that the current blanket block was implicitly preventing?
- **Context to provide**: `src/capture.js` lines 52-66 (security constraints + accepted gaps), lines 355-390 (context setup + route handler), the evidence table from the task showing 6/7 CMPs blocked, and the fact that `src/capture.js` already documents "Cross-origin iframe sub-navigation" as an accepted gap (line 63-65).
- **Why this agent**: This is fundamentally a security boundary change. The route handler is the TOCTOU mitigation, and narrowing its scope requires security review to ensure the guarantee is preserved.

#### Consultation 2: Test strategy for navigation filtering

- **Agent**: test-minion
- **Planning question**: The route handler logic (lines 367-390 of `capture.js`) is currently inside `defaultRenderer()` which is NOT tested by the unit test suite -- all tests use injectable renderer stubs. The proposed change to `isNavigationRequest()` filtering is a security-critical behavior that needs test coverage. (1) How should we test the frame-check logic given that `context.route()` callbacks are Playwright internals? (2) Should we extract the routing logic into a testable function, or rely on integration tests? (3) What test scenarios are needed: main-frame cross-origin block, iframe cross-origin allow, same-origin navigation allow, BBC-style same-site redirect? (4) Can the existing `stubRenderer` pattern be extended to test route behavior, or does this need a different approach?
- **Context to provide**: `test/capture.test.js` (all tests use `stubRenderer` which bypasses the real renderer), `test/fixtures.js` (renderer stubs), `src/capture.js` lines 340-390 (`defaultRenderer` including route handler).
- **Why this agent**: The change is in code that has zero direct test coverage today. Test strategy needs to be designed before execution, not after.

#### Consultation 3: Playwright API specifics for frame detection

- **Agent**: debugger-minion
- **Planning question**: The task specifies using `route.request().frame() === page.mainFrame()` to distinguish top-level from iframe navigation. In @cloudflare/playwright (which wraps Playwright): (1) Is `route.request().frame()` available and reliable in the `context.route()` callback? Note that `context.route()` fires before any page exists -- but the handler is async and page is created after route registration (line 392). Does the frame reference resolve correctly for requests triggered after page creation? (2) What about the BBC redirect case -- `bbc.com` -> `bbc.co.uk` is a server-side 301 redirect. Does Playwright's route handler see the redirect as a navigation request from the main frame, or does the browser handle it transparently? (3) Is `request.frame()` null for any edge cases (preflight requests, service worker intercepts, etc.)?
- **Context to provide**: `src/capture.js` lines 355-395 (context creation, route setup, page creation order), and the Playwright `Route` and `Request` API docs.
- **Why this agent**: The implementation hinges on correct Playwright API usage. Getting this wrong silently (e.g., frame() returning null) would either break security or break CMP detection. RCA and API investigation are debugger-minion's strength.

### Cross-Cutting Checklist

- **Testing**: INCLUDE (test-minion) -- Consultation 2 above. The change is security-critical with zero existing direct test coverage. Test strategy is essential for planning.
- **Security**: INCLUDE (security-minion) -- Consultation 1 above. This is a security boundary modification.
- **Usability -- Strategy**: EXCLUDE from planning. This is an internal infrastructure fix to make autoconsent work correctly. There is no user-facing journey change -- the existing consent detection feature simply starts working on more sites. The user-visible effect (consent=dismissed vs consent=notDetected) is already part of the captureSettings schema.
- **Usability -- Design**: EXCLUDE from planning. No UI changes.
- **Documentation**: EXCLUDE from planning consultation, but INCLUDE in execution. The `src/capture.js` header comments (lines 52-66 "Accepted gaps" and "Security constraints") need updating to reflect the new iframe-vs-mainframe distinction. This is straightforward enough to handle at execution time without planning input.
- **Observability**: EXCLUDE from planning. No new runtime components; the existing structured logging already captures consent outcomes. The fix will naturally produce different consent.status values in logs (more `dismissed`, fewer `notDetected`), which is the desired outcome.

### Anticipated Approval Gates

1. **Security model for iframe navigation** (MUST gate) -- The security-minion's assessment of whether relaxing the blanket cross-domain block to main-frame-only preserves the TOCTOU guarantee. Hard to reverse (security model), high blast radius (route handler affects every capture). This must be approved before any code is written.

This is likely the only gate needed. The implementation itself is a ~5-line change in a single function with clear success criteria from the staging test set.

### Rationale

Three specialists are consulted for planning:

- **security-minion** because this is fundamentally a security boundary change. The route handler was specifically designed to close a TOCTOU gap, and narrowing its scope requires explicit security review.
- **test-minion** because the code being changed has zero direct test coverage, and the change is security-critical. The test strategy should influence how the code change is structured (e.g., whether to extract routing logic for testability).
- **debugger-minion** because the implementation depends on specific Playwright API behavior (`request.frame()` in context-level route handlers) that needs investigation before we commit to an approach. The BBC redirect case is also a behavioral question about how Playwright handles 3xx redirects in route intercepts.

Not included in planning:
- **ux-strategy-minion**: No user journey change -- consent detection already exists, it just starts working on more sites.
- **software-docs-minion / user-docs-minion**: Documentation updates are scoped to code comments in capture.js and will be handled during execution.
- **observability-minion**: No new runtime components or logging changes needed.
- **frontend-minion / iac-minion / etc.**: Not relevant -- this is a single-file bugfix in the capture pipeline.

### Scope

**In scope**:
- Modifying the `context.route()` callback in `defaultRenderer()` to only block cross-domain navigation for the main frame
- Handling the BBC same-site redirect case (bbc.com -> bbc.co.uk)
- Adding test coverage for the new navigation filtering logic
- Updating security documentation in `capture.js` header comments
- Staging validation against the 8-site test set from #79

**Out of scope**:
- Autoconsent library changes
- CMP-specific handling or new consent providers
- Subresource counting logic
- Changes to consent.js
- New configuration options or API changes

### External Skill Integration

No external skills detected in project.
