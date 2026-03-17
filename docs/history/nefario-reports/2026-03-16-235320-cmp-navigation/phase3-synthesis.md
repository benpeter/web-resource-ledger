## Delegation Plan

**Team name**: cmp-navigation
**Description**: Narrow cross-domain navigation block to main-frame only, allowing CMP consent iframes to load.

### Task 1: Narrow route handler to main-frame navigation only

- **Agent**: debugger-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |
    Fix the cross-domain navigation block in `src/capture.js` so it only blocks
    **main-frame** cross-domain navigations, allowing CMP consent iframes to load.

    ## Context

    The route handler at line 367-375 currently blocks ALL cross-domain navigation
    requests using `isNavigationRequest()`. This is over-broad -- it blocks CMP
    consent iframes (Sourcepoint, OneTrust, Cookiebot, etc.) that load from
    cross-origin domains. The TOCTOU threat only applies to main-frame navigations;
    iframe navigations are bounded by the browser's same-origin policy and existing
    subresource limits.

    ## What to change

    **1. Fix the `page` variable TDZ (Temporal Dead Zone) bug.**

    The route handler is registered at line 367 via `context.route()`, but `page`
    is declared at line 392 as `const page = await context.newPage()`. The route
    callback closure closes over `page`, but `const` creates a TDZ -- accessing
    `page` before line 392 executes would throw `ReferenceError`.

    Fix: Declare `let page = null` BEFORE the `context.route()` call (after
    `let limitExceeded = null` on line 365). Change line 392 from
    `const page = await context.newPage()` to `page = await context.newPage()`.

    **2. Add main-frame guard with defensive try/catch.**

    In the route callback, change the cross-domain navigation block from:

    ```javascript
    if (
      route.request().isNavigationRequest() &&
      new URL(route.request().url()).origin !== targetOrigin
    ) {
      await route.abort('blockedbyclient');
      return;
    }
    ```

    To:

    ```javascript
    if (
      route.request().isNavigationRequest() &&
      new URL(route.request().url()).origin !== targetOrigin
    ) {
      // Only block main-frame navigations; allow iframe navigations (CMP consent)
      let isMainFrame = false;
      if (page) {
        try {
          isMainFrame = route.request().frame() === page.mainFrame();
        } catch {
          // frame() throws for pre-creation requests -- treat as non-main-frame
        }
      }
      if (isMainFrame) {
        await route.abort('blockedbyclient');
        return;
      }
    }
    ```

    This pattern handles three edge cases identified by debugger-minion:
    - `page` is null (route fires during `newPage()`) -- allows the request
    - `frame()` throws (pre-creation request, service worker) -- allows the request
    - Normal operation: blocks main-frame cross-domain, allows iframe cross-domain

    **3. Update the SECURITY comment on line 368.**

    Change:
    ```
    // SECURITY: Block cross-domain top-level navigation (closes TOCTOU gap)
    ```
    To:
    ```
    // SECURITY: Block cross-domain main-frame navigation (closes TOCTOU gap).
    // Iframe navigations allowed -- needed for CMP consent iframes and bounded
    // by same-origin policy + subresource limits (MAX_SUBRESOURCES).
    ```

    **4. Update the accepted-gaps comment (lines 63-65).**

    The existing accepted-gap about cross-origin iframe sub-navigation was
    aspirational -- the old code blocked ALL cross-domain navigations including
    iframes. Now the code matches the documented intent. Update the comment to
    reflect that it is now implemented, not just accepted:

    Change:
    ```
    *   - Cross-origin iframe sub-navigation: iframes can navigate internally
    *     within their own origin; only top-level cross-origin navigations are
    *     blocked. Acceptable for the current single-tenant use case.
    ```
    To:
    ```
    *   - Cross-origin iframe sub-navigation: iframes can navigate to cross-origin
    *     destinations (e.g. CMP consent frames); only main-frame cross-origin
    *     navigations are blocked. Bounded by same-origin policy and MAX_SUBRESOURCES.
    ```

    **5. Do NOT change anything else.** Specifically:
    - Do NOT add same-registrable-domain allowlisting for BBC or similar redirects
    - Do NOT extract the route handler into a separate function
    - Do NOT add new test files (the miniflare test environment has no real browser)
    - Do NOT modify consent.js
    - Do NOT change the redirect behavior (Playwright auto-continues redirects;
      this is pre-existing and unchanged by this fix)

    ## Files to modify

    - `src/capture.js` -- the ONLY file that changes

    ## Verification

    After making the change, run the existing test suite:
    ```
    npx vitest run
    ```
    All existing tests must pass. The route handler change is inside
    `defaultRenderer` which is not directly tested (tests use stub renderers),
    so existing tests verify no orchestration regression.

    ## Important Playwright API details

    - `route.request().frame()` THROWS (does not return null) when the frame is
      not available. Two throw paths: service worker requests (no frame) and
      pre-page-creation requests (frame._page is null).
    - Playwright does NOT invoke route handlers for HTTP redirect hops (301/302).
      Redirects are auto-continued internally. This is pre-existing behavior.
    - `serviceWorkers: 'block'` is already set on the context (line 357), so
      service worker frame() throws should not occur in practice, but the
      try/catch handles it defensively.

- **Deliverables**: Modified `src/capture.js` with narrowed route handler
- **Success criteria**:
    - Cross-domain iframe navigations are no longer blocked (the `isMainFrame` check allows them)
    - Cross-domain main-frame navigations are still blocked (TOCTOU preserved)
    - `let page = null` declared before route handler, assigned after `newPage()`
    - `frame()` call wrapped in try/catch
    - SECURITY comment updated
    - Accepted-gaps comment updated
    - All existing tests pass (`npx vitest run`)

### Cross-Cutting Coverage

- **Testing**: No new automated tests in this PR. The route handler is inside `defaultRenderer` which requires a real browser binding not available in the miniflare test environment. Mocking `frame()` would test the mock, not the behavior. Manual verification procedure will be documented in the evolution log. Backlog item for E2E staging test to be added.
- **Security**: Fully addressed by security-minion's planning contribution. The fix preserves TOCTOU mitigation for main-frame navigations. Iframe navigations are bounded by same-origin policy and existing subresource limits. No regression to SSRF posture. The redirect bypass gap is pre-existing and documented.
- **Usability -- Strategy**: Not applicable. This is an internal infrastructure fix with no user-facing UX change. CMP consent handling is automated by autoconsent; users do not interact with consent dialogs.
- **Usability -- Design**: Not applicable. No UI changes.
- **Documentation**: Code comments updated inline. Evolution log entry (prompt.md, decisions.md, outcome.md) will be created per project requirements during wrap-up.
- **Observability**: Not applicable. No new runtime components. The existing logging in capture.js already logs route aborts. If needed, a debug log for allowed iframe navigations could be added later (backlog).

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**: none -- this is a single-file, 10-line logic change with no UI, no new components, no new runtime services, and no documentation artifacts beyond code comments
- **Not selected**: ux-design-minion, accessibility-minion, sitespeed-minion, observability-minion, user-docs-minion

### Conflict Resolutions

**security-minion vs debugger-minion on `frame()` null handling:**
security-minion recommended handling `frame()` returning null as non-main-frame.
debugger-minion traced the Playwright source and found that `frame()` never
returns null -- it throws instead. Resolution: use try/catch (debugger-minion's
recommendation), which correctly handles both the theoretical null case and the
actual throw behavior. security-minion's intent (treat unknown frames as
non-main-frame / allow) is preserved in the catch branch.

**security-minion vs test-minion on integration test:**
security-minion recommended adding an integration test for the narrowed route
handler. test-minion analyzed the test infrastructure and found the miniflare
environment lacks a real browser binding, making such a test impossible in CI.
Resolution: follow test-minion's recommendation (no new automated tests), add
manual verification procedure to evolution log, add backlog item for E2E staging
test. This aligns with the project's "test the real boundaries" philosophy --
a mock-based test would test mocks, not behavior.

### Risks and Mitigations

1. **CRITICAL (mitigated): TDZ crash on `page` variable.** The `page` variable
   is declared after the route handler registration. Naive use of
   `page.mainFrame()` in the callback would crash with ReferenceError if the
   callback fires during `newPage()`. **Mitigation**: `let page = null` before
   route registration, null-check in callback. Identified by debugger-minion
   and test-minion independently.

2. **CRITICAL (mitigated): `frame()` throws, not returns null.** Playwright's
   `request.frame()` throws for pre-creation requests and service worker
   requests. **Mitigation**: try/catch around `frame()` call, with catch
   branch treating the request as non-main-frame (allow). Identified by
   debugger-minion via source code tracing.

3. **LOW: No automated regression test.** If someone later removes the frame
   check, no test catches it. **Mitigation**: clear inline comments explaining
   why the check exists, code review discipline, backlog item for E2E test.

4. **LOW: Cloudflare Playwright fork divergence.** The `@cloudflare/playwright`
   fork may have different CDP event sequencing. **Mitigation**: the defensive
   coding pattern (null-check + try/catch) handles unknown behavior gracefully.
   Manual verification against the real Cloudflare browser binding is part of
   the testing procedure.

5. **INFORMATIONAL: Redirect bypass is pre-existing.** Playwright does not
   invoke route handlers for 301/302 redirect hops. A server redirecting from
   same-origin to cross-origin bypasses the navigation block. This is unchanged
   by this fix and documented in the code comments. Not actionable in this PR.

### Execution Order

```
Batch 1 (single task):
  Task 1: debugger-minion -- narrow route handler [no gate]

Phase 3.5: Architecture review (5 mandatory reviewers)

Phase 4: Execute Task 1

Phase 5-8: Post-execution phases per standard workflow
```

### Verification Steps

1. `npx vitest run` -- all existing tests pass (no orchestration regression)
2. Manual verification: capture a page with a known CMP iframe (e.g., a site
   using Cookiebot or OneTrust) and confirm:
   - The consent iframe loads (not blocked)
   - Autoconsent detects and dismisses the CMP
   - The capture completes successfully with consent dismissed
3. Manual verification: confirm main-frame cross-domain navigation is still
   blocked (existing behavior preserved)
