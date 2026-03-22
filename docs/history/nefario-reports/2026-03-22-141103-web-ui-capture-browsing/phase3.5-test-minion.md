## Verdict: ADVISE

The planned Vitest tests in Task 4 cover the most important ground (HTML structure, CSP, Cache-Control, security pattern scanning, design system compliance). The test strategy correctly targets server-side HTML generation rather than client-side behavior. The E2E deferral is sound. However, four testing blind spots are worth flagging before implementation begins.

---

- [testing]: The CSP test should assert the exact policy string, not just individual directives.
  SCOPE: `test/ui-dashboard.test.js` -- CSP header assertions
  CHANGE: Add one test that checks the full CSP value matches the exact policy specified in Task 1 (`default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`). Checking `default-src 'none'` alone does not catch a missing `base-uri 'none'` or `form-action 'none'`.
  WHY: `base-uri 'none'` and `form-action 'none'` are the two CSP directives that do not inherit from `default-src`. A test that checks only `default-src` would pass even if those two directives were accidentally omitted, leaving the page vulnerable to base tag injection and form hijacking. The existing `verify-page.test.js` makes this same omission -- this is a chance to do better.
  TASK: Task 4

---

- [testing]: The "security" test for banned dynamic code patterns should explicitly check for `innerHTML` assignment with non-literal content patterns, not just `Function` constructor usage.
  SCOPE: `test/ui-dashboard.test.js` -- security scanning assertions
  CHANGE: Add an assertion that scans the HTML output for `innerHTML` followed by API-derived variable names (e.g., assert the string `innerHTML` does not appear adjacent to common API variable patterns). A simpler but still effective approach: assert the output does not contain `innerHTML =` at all -- the plan's architecture uses `textContent` and `createElement` exclusively, so any `innerHTML =` in the generated output is a bug. This is distinct from checking the `Function` constructor.
  WHY: XSS via API key theft is the highest-impact risk listed in the plan. The plan relies on Phase 5 code review to catch `innerHTML` misuse, but a static pattern test on the HTML output catches this class of bug automatically and without reviewer attention. The `verify-page.test.js` pattern shows how to scan HTML output for banned patterns.
  TASK: Task 4

---

- [testing]: The polling module (`ui-poll.js`) has no testable surface identified in Task 4 -- the timeout, backoff, and visibility-pause logic are left entirely to browser E2E tests that are deferred.
  SCOPE: `src/ui/ui-poll.js` -- `startPolling()` exported as a JS string constant
  CHANGE: The polling module is a string constant (`POLL_JS`). While the client-side function itself cannot be unit-tested in the Workers runtime, the **string content** can be scanned in Task 4. Add assertions that `POLL_JS` contains: `visibilityState` (visibility pause guard), `Retry-After` (header respect), `setTimeout` and NOT `setInterval` (correct timing pattern), and the 120-second timeout boundary value. These are regression guards that prevent the implementation from drifting from spec without the change being noticed.
  WHY: The polling logic has three behavioral requirements that are easy to get wrong and have no other test coverage path until E2E is built: the `setInterval` vs `setTimeout` distinction (setInterval ignores Retry-After; setTimeout respects it), the visibility pause (a common mobile battery consideration that developers often forget to implement), and the 120-second abort. Without these guards, a future refactor could silently break all three.
  TASK: Task 4

---

- [testing]: The route test for `GET /ui` should assert that the `Cache-Control: no-store` directive is present via `SELF.fetch()`, not just via direct `htmlDashboard()` call.
  SCOPE: `test/ui-dashboard.test.js` -- route-level tests using `SELF.fetch()`
  CHANGE: The plan lists `Cache-Control: no-store` as a test only at the `htmlDashboard()` unit level. Add an explicit `SELF.fetch('https://worker.test/ui')` assertion for `Cache-Control: no-store`. The route handler wraps the response from `htmlDashboard()`, and a future change to the global response wrapper in `src/index.js` (e.g., adding a catch-all `Cache-Control` override) could silently strip this header. The route-level test catches that class of regression.
  WHY: `Cache-Control: no-store` on the UI shell is a security requirement, not just a performance preference. If the page is cached by a shared proxy, a user's auth-gated session state could be served to another user. This is the same reason it was specified. Testing it only at the function level misses the integration point where the global response pipeline could override it.
  TASK: Task 4
