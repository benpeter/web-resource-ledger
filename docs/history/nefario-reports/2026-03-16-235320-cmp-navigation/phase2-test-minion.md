## Domain Plan Contribution: test-minion

### Recommendations

**Do NOT extract routing into a testable function. Rely on unit tests with the existing injectable renderer pattern, plus one targeted scenario in the integration test.**

Here is the reasoning:

1. **The project's CLAUDE.md is explicit**: "Mocking out the browser is like testing an HTTP server without sending requests." Extracting the route callback into a standalone function that accepts mock `route` and `page` objects would create exactly the kind of abstraction-over-browser-internals the project warns against. You would end up testing whether your mock `route.request().frame()` returns the right thing, not whether Playwright actually behaves as expected when a CMP iframe fires a navigation request.

2. **The routing logic is 6 lines of code.** The change is from `route.request().isNavigationRequest()` to `route.request().isNavigationRequest() && route.request().frame() === page.mainFrame()`. This is not complex enough to warrant extraction into its own module. Extracting it would violate YAGNI and add indirection for one conditional check.

3. **The existing test architecture is deliberately structured around injectable renderers.** Every test in `capture.test.js` validates orchestration behavior (KV state transitions, R2 artifact writing, error categorization) through stub renderers. The route handler lives inside `defaultRenderer`, which is the non-exported, real implementation. This separation is the right design -- orchestration tests use stubs, and the real renderer should be validated via integration tests that exercise the actual browser.

**The right approach is two-layered:**

**Layer 1 -- Unit test with a purpose-built stub renderer (capture.test.js):**
A stub renderer that simulates what happens when an iframe cross-origin navigation is *allowed* versus when a main-frame cross-origin navigation is *blocked*. This validates that `performCapture` handles the outcomes correctly (e.g., a capture that succeeds despite cross-origin iframe loads, or a capture that fails because a main-frame redirect was blocked). These tests verify the orchestration layer handles these outcomes, not the routing logic itself.

However -- this is what the existing tests already do implicitly. The stub renderers return success/failure, and the orchestration layer processes them. There is no new orchestration behavior to test here. The change is entirely within `defaultRenderer`'s routing callback. **So no new unit tests are needed for the orchestration layer.**

**Layer 2 -- Integration test with real browser (the actual value):**
The real test value is an integration test that proves:
- A page with a cross-origin iframe (like a CMP consent iframe) loads successfully and the iframe content is not blocked.
- A main-frame cross-origin redirect is still blocked.

This is where the rubber meets the road. The `defaultRenderer` runs against a real (or miniflare-simulated) browser, and the routing callback's `frame() === page.mainFrame()` check is exercised for real.

**The problem: Cloudflare Workers test environment.**
The vitest config uses `@cloudflare/vitest-pool-workers` with miniflare. The `BROWSER` binding is declared but in the test environment there is no actual browser process. The lifecycle smoke test in `capture-integration.test.js` already acknowledges this: "In test env the default renderer fails (no real browser binding)." This means a true integration test of `defaultRenderer` is not possible in the current CI test environment.

**Practical recommendation:**

Given this constraint, the most honest and KISS approach is:

1. **No new unit tests in capture.test.js.** The change is inside the non-exported `defaultRenderer`. The orchestration layer's behavior does not change. Adding unit tests that mock `route.request().frame()` would be testing mocks, not the system.

2. **Add a focused comment/documentation in the code** at the route handler explaining the frame check and why it exists (CMP iframes). This serves as the "test" for code reviewers.

3. **Add a manual verification test script or documented manual test procedure** in the evolution log that describes how to verify the fix works: capture a page with a known CMP (e.g., a site using OneTrust or Cookiebot) and confirm the consent iframe loads and autoconsent can dismiss it. This is the real boundary test.

4. **If the team wants automated regression coverage**, the right long-term investment is an E2E test that runs against the deployed worker (staging environment) with a real browser binding. This is outside the scope of this PR but should be tracked in the backlog.

### Proposed Tasks

1. **Code change: Narrow route handler to main-frame only** (implementation task, not test-minion scope)
   - Change `route.request().isNavigationRequest()` to `route.request().isNavigationRequest() && route.request().frame() === page.mainFrame()`
   - Add inline comment explaining why: CMP consent iframes need cross-origin navigation

2. **No new automated tests in this PR** (explicit decision)
   - The routing logic is inside a non-exported function that requires a real browser to exercise
   - The miniflare test environment does not provide a real browser binding
   - Mocking `route.request().frame()` would test the mock, not the behavior
   - This is consistent with the project's philosophy: "test the real boundaries"

3. **Document manual verification procedure in evolution log**
   - Include specific URLs with known CMPs to test against
   - Document expected behavior: CMP iframe loads, consent can be dismissed, before/after screenshots differ
   - Document regression check: main-frame cross-origin redirect (e.g., HTTP->HTTPS redirect to different domain) is still blocked

4. **Add backlog item: E2E test for CMP iframe loading**
   - A staging-environment integration test that captures a page with a known CMP
   - Verifies consent iframe loads (not blocked by route handler)
   - Verifies consent dismissal succeeds
   - This is the right automated test but requires infrastructure (real browser binding) that the current test env does not have

### Risks and Concerns

1. **No automated regression test for this specific fix.** If someone later changes the route handler back to blocking all navigation requests (removing the frame check), no test will catch it. This is the honest trade-off: the project cannot test `defaultRenderer` in the current test environment. The mitigation is code review discipline and the inline comment.

2. **The `page` variable is not in scope at the route handler registration point.** Looking at the code: `context.route('**/*', ...)` is called at line 367, but `const page = await context.newPage()` is at line 392. The proposed fix needs `page.mainFrame()`, but `page` does not exist when the route handler is registered. This is a **critical implementation concern**: the route handler callback is a closure, but `page` is declared *after* the route is registered. The handler is called lazily (when requests happen), so `page` will exist by the time any request fires -- but only if the code is sequenced correctly. The implementer must either:
   - Move the `page` declaration before `context.route()`, or
   - Capture `page` in a mutable variable that the closure reads later, or
   - Use `context.route()` after `page` creation

   This sequencing issue is exactly the kind of subtle bug that a real integration test would catch. Without one, code review must be extra careful.

3. **Playwright API compatibility.** The `route.request().frame()` method must return the frame that initiated the request. In Playwright's API, this is standard, but the `@cloudflare/playwright` fork may have differences. Verify that `route.request().frame()` is available in the Cloudflare Playwright API.

4. **BBC redirect scenario.** The planning question mentions "BBC redirect" as a scenario needing coverage. If BBC (or similar sites) redirect from `http://bbc.co.uk` to `https://www.bbc.co.uk` as a main-frame navigation, the current code blocks this cross-origin redirect. The fix should NOT change this behavior -- main-frame cross-origin redirects should still be blocked. But this means the initial URL must be the final canonical URL. This is existing behavior and not changed by this PR, but it should be verified as part of manual testing.

5. **Same-origin iframe navigations** are already allowed by both old and new code (the origin check passes). No new risk there.

### Additional Agents Needed

None. The implementation is straightforward (one conditional change). The main risk is the `page` variable scoping issue identified above, which the implementing agent should handle during code change. No additional specialist expertise is needed beyond what nefario and the code-minion provide.
