## Domain Plan Contribution: test-minion

### Recommendations

**Continue the established Vitest-in-Workers pattern as the primary test tier.** The existing codebase has a mature, well-structured test suite: ~28 unit/worker-level test files using `@cloudflare/vitest-pool-workers` with `SELF.fetch()` for route-level assertions, plus a separate integration tier using real Playwright browsers. The new UI should follow this exact model. Playwright E2E browser tests should be added sparingly, only for behaviors that cannot be validated at the worker level.

#### Three-tier strategy for the Web UI

**Tier 1 (majority): Vitest worker tests -- HTML generator functions + route handlers**

This is the proven pattern from `verify-page.test.js` and `verify-html.test.js`. Each new view (capture form, capture list, capture detail, auth gate) will be an HTML generator function like `htmlVerifyResponse()`. These generators are pure functions that take data and return a `Response` with HTML. Tests at this level verify:

- Response headers (Content-Type, CSP, Cache-Control, security headers)
- HTML structure (contains expected elements, no external resources, correct noscript fallback)
- Design system token usage (no hardcoded hex, var() references present)
- XSS protection (HTML escaping of user-supplied data -- capture IDs, URLs, error messages)
- Content Security Policy correctness (inline scripts need nonce or 'unsafe-inline' -- the existing verify page uses inline scripts with `'unsafe-inline'` in CSP, the new views will too)
- Accessibility basics (lang attribute, viewport meta, semantic HTML markers)

For route-level tests using `SELF.fetch()`:
- Auth gate behavior: unauthenticated requests to UI routes get the auth form, authenticated requests get the real view
- Content negotiation: browser Accept headers serve HTML, API clients get JSON
- Error responses: invalid routes, missing resources, expired tokens

This tier runs in the Cloudflare Workers test runtime (miniflare), is fast (<2s), and gives high confidence on server-side rendering correctness.

**Tier 2 (targeted): Vitest worker tests -- client-side JavaScript logic**

The new UI has significant client-side behavior: client-side routing (hash or history API), auth state management (API key storage/retrieval), polling for capture status, and form submission. This JavaScript runs in the browser, not the worker.

The recommended approach: extract client-side logic into testable pure functions where possible. For example:
- A `router` module that maps URL patterns to view functions -- test the mapping logic, not the DOM manipulation
- An `authState` module that manages API key storage -- test with a stubbed `localStorage`
- A `pollCaptureStatus` function that takes a fetch function and returns status -- test with stubbed fetch
- Form validation logic (URL validation, required fields) as pure functions

These functions can be tested with standard Vitest (not the Workers pool) since they're pure JS. Create a second Vitest config (e.g., `vitest.browser-logic.config.js`) that runs outside the Workers pool for client-side unit tests, or simply include them in the existing config with the right module resolution.

However, be pragmatic: if the client-side JS is thin (just wiring up fetch calls and DOM updates), testing it via tier 1 (checking the generated HTML contains correct script logic) plus tier 3 (E2E) may be sufficient. Don't over-engineer a test framework for 200 lines of vanilla JS.

**Tier 3 (minimal): E2E browser tests for critical flows**

Add 3-4 Playwright-based tests covering the critical user journeys that span multiple views and involve real browser behavior (routing, localStorage, fetch, polling). These belong in `test/integration/` alongside the existing capture pipeline tests.

Target flows:
1. **Auth flow**: load UI without API key -> see auth gate -> enter key -> redirected to capture list
2. **Capture submission + polling**: authenticated user -> submit URL -> see polling state -> see completed capture
3. **Capture list + detail navigation**: authenticated user -> see list -> click capture -> see detail view
4. **Mobile viewport**: one of the above flows at 375px width to verify responsive layout

These tests would use the existing integration test infrastructure (global-setup.js starts a fixture server, miniflare provides the Workers runtime with real D1/R2/Queue bindings). The browser sessions use `@cloudflare/playwright` just like the existing capture pipeline tests. The key difference: instead of calling `performCapture()` directly, these tests would navigate a browser to the UI routes and interact with the page.

**Important caveat on Playwright scope**: The existing integration tests already use `@cloudflare/playwright` for browser rendering (the capture pipeline). But for UI E2E tests, we need Playwright as a *test driver* (navigating pages, clicking buttons, reading DOM), not as a capture engine. This is a different usage. The `@cloudflare/playwright` package is designed for Browser Rendering inside Workers, not for traditional Playwright test automation. The E2E tests may need to use the standard `playwright` package (or `@playwright/test`) instead, launched against the `wrangler dev` server. This is a meaningful architectural decision -- see Risks section.

#### What NOT to test

- Visual regression / screenshot comparison: not worth it for an initial build. The design system tokens provide visual consistency; visual regression adds CI complexity and brittleness.
- Every CSS responsive breakpoint: verify mobile works in one E2E test. Trust the CSS.
- localStorage mechanics in isolation: test the auth flow end-to-end instead.

### Proposed Tasks

**Task 1: Establish HTML generator test pattern for each view**
- What: For each new view (capture form, capture list, capture detail, auth gate), write Vitest worker tests that call the generator function and assert on response headers, HTML structure, security properties, and design system compliance. Follow the exact pattern from `verify-page.test.js`.
- Deliverables: Test files `test/ui-capture-form.test.js`, `test/ui-capture-list.test.js`, `test/ui-capture-detail.test.js`, `test/ui-auth-gate.test.js` (naming follows existing convention).
- Dependencies: The HTML generator functions must exist. These tests should be written alongside or immediately after each view generator. The existing `verify-page.test.js` serves as the template.

**Task 2: Add route-level tests for UI endpoints**
- What: Using `SELF.fetch()` in Vitest, test the new routes that serve the UI: correct status codes, content negotiation (HTML vs JSON), auth gating (unauthenticated -> auth page, authenticated -> real content), error cases (bad URLs, missing captures). This follows the `verify-html.test.js` pattern but for the new routes.
- Deliverables: Test file `test/ui-routes.test.js` or integrated into individual view test files.
- Dependencies: Router must be wired in `src/index.js`. Auth middleware/check must be implemented. Depends on Task 1's generator functions.

**Task 3: Add security-focused tests for auth gate and API key handling**
- What: Test that the auth gate correctly blocks unauthenticated access to protected views. Test that API keys from the UI are validated through the same `verifyApiKey()` path as API requests. Test that the HTML generator escapes all user-supplied content (API key errors, capture URLs, any data reflected in the page).
- Deliverables: Assertions in the view test files (Task 1) plus dedicated `test/ui-auth.test.js` if warranted.
- Dependencies: Auth implementation for UI must be designed. Key question: does the UI send the API key as a Bearer token on fetch requests, or is there a session mechanism? This affects what to test.

**Task 4: Test client-side polling logic**
- What: The capture detail view must poll for status updates (pending -> processing -> complete). Test that the generated HTML includes correct polling logic: correct API endpoint, appropriate interval, stops polling on terminal states (complete, failed), handles network errors gracefully. At the Vitest level, verify the script in the generated HTML contains these patterns (string assertions on the JS code). At the E2E level (Task 5), verify the actual polling behavior.
- Deliverables: Polling-related assertions within `test/ui-capture-detail.test.js`.
- Dependencies: Polling implementation in the client-side JS.

**Task 5: Add E2E browser tests for critical UI flows**
- What: Write 3-4 Playwright tests that exercise complete user journeys through the UI in a real browser. Use the integration test infrastructure (miniflare + fixture server). Tests cover: auth flow, capture submission + polling, list + detail navigation, mobile viewport.
- Deliverables: `test/integration/ui-flows.test.js` with the integration test fixtures needed.
- Dependencies: All views must be implemented and routed. Requires a decision on Playwright driver approach (see Risks). This task should be done LAST -- after all views work correctly per tier 1/2 tests. The existing `global-setup.js` and `vitest.integration.config.js` may need updates to support UI-focused test fixtures (e.g., pre-seeded captures in various states for the list/detail views).

**Task 6: CSP validation for new views**
- What: The existing verify page sets a strict CSP (`default-src 'none'`). The new UI views use inline scripts and may need fetch access to the API. Verify that CSP headers allow what's needed (inline scripts, fetch to self, img from data: URIs) and block everything else. Each view's test file should assert on the CSP header.
- Deliverables: CSP assertions in each view test file (Task 1).
- Dependencies: CSP policy must be decided as part of implementation. This is a coordination point with the security mindset -- the existing CSP is tight and intentional.

### Risks and Concerns

**Risk 1: Playwright driver confusion -- `@cloudflare/playwright` vs `@playwright/test`**

The existing integration tests use `@cloudflare/playwright` for browser rendering *inside* the Workers runtime (capturing web pages). UI E2E tests need Playwright as a *test client* that navigates to the worker's HTTP endpoints and interacts with the DOM. These are fundamentally different uses. `@cloudflare/playwright` may or may not support test-driver usage -- this needs to be validated before committing to the E2E approach. If it doesn't, installing `@playwright/test` as a devDependency and running E2E tests against `wrangler dev` is the fallback, but that's a different CI setup.

**Mitigation**: Investigate `@cloudflare/playwright` capabilities early. If it cannot serve as a test driver, design the E2E tests to run against `wrangler dev` using standard Playwright. Keep E2E tests minimal (3-4 tests) so this infrastructure decision has bounded cost.

**Risk 2: Client-side routing testability**

Hash-based or History API routing in vanilla JS is easy to implement but awkward to test at the HTML-generator level. The routing logic lives in inline `<script>` tags within the HTML string. Vitest can assert that the script *contains* routing patterns (string matching), but cannot execute the routing logic. This creates a coverage gap between "the script text looks right" and "the routing actually works in a browser."

**Mitigation**: Keep the client-side router minimal and stupid. Test routing behavior exclusively in the E2E tier (Task 5). At the generator level, verify that each view's HTML is self-contained and correct -- the router just picks which generator to call. If the router is thin enough, E2E coverage is sufficient.

**Risk 3: Auth state across views**

The UI needs to persist an API key across page loads (localStorage, sessionStorage, or cookie). Testing this at the Vitest level requires simulating browser storage APIs, which the Workers test runtime does not provide. This pushes auth flow testing entirely to the E2E tier, which is slow and brittle.

**Mitigation**: Design the auth flow so that each HTML response from the worker checks the API key server-side (sent via cookie or Authorization header), not purely client-side. This makes auth testable with `SELF.fetch()` in Vitest -- just include the right headers. The client-side JS only needs to store the key and attach it to requests. This is both more testable AND more secure (server validates on every request, client-side storage is just convenience).

**Risk 4: Test data for list/detail views**

The capture list and detail views need pre-existing captures in various states (pending, processing, complete, failed, with/without WACZ). The existing test fixtures create captures via `createCapture()` + `performCapture()`, which is slow (involves browser rendering). For unit-level HTML generator tests, the generators should accept data objects directly (not fetch from D1), so test data is just plain objects. For route-level tests, `createCapture()` + `completeCapture()` (without actual browser rendering) can seed D1 records quickly.

**Mitigation**: Design generator functions to accept pre-fetched data, not to query D1 themselves. The route handler fetches data, the generator renders it. This follows the existing pattern (`htmlVerifyResponse()` takes parameters, doesn't touch KV/D1). Add test helper functions in `test/fixtures.js` for creating captures in specific states without running the full capture pipeline.

**Risk 5: Test suite speed**

The existing unit test suite runs fast because Workers pool tests use miniflare without real browser sessions. Adding UI tests that follow the same pattern should add negligible time. However, if E2E tests (Task 5) require browser sessions, each test adds 5-15 seconds. Four E2E tests could add a minute to `test:integration`. This is acceptable but should be monitored.

### Additional Agents Needed

None. The current team is sufficient for test planning. The implementation of UI views themselves (HTML generators, client-side JS, routing) will determine the exact test structure -- tests follow code, not the reverse. The test strategy above adapts to whatever the UI implementation looks like, as long as the core principle holds: **server-side HTML generators are pure functions that take data and return Response objects**, keeping them highly testable in the existing Vitest Workers pool.

One coordination note: if a **security-focused agent** is involved in planning, they should weigh in on the CSP policy for UI views (which must allow inline scripts for vanilla JS) and the auth mechanism (cookie vs Authorization header vs custom header). Both decisions directly affect what the tests validate.
