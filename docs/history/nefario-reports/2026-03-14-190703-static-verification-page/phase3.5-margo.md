# Phase 3.5 Review -- margo (Complexity / YAGNI / KISS)

## Verdict: ADVISE

The plan is fundamentally sound: 5 tasks for a well-scoped feature, vanilla
JS/CSS/HTML, zero new dependencies, content negotiation via ~5 lines in
`index.js`. The architecture is proportional to the problem. The following
are non-blocking concerns that would reduce accidental complexity.

---

### Advisories

- **[YAGNI]**: Task 1 prompt specifies 4 distinct HTTP error states (404, 429, 503, network) with individually designed messages in the client-side JS
  SCOPE: `src/verify-page.js` client-side error handling
  CHANGE: Use a single generic error state ("Could not load verification data. Try refreshing, or use the JSON API link below.") with the noscript-style JSON API link as fallback. Differentiated error messages for client-side fetch failures add code for a scenario that is rare and where the user cannot take different action per error type.
  WHY: Non-technical users cannot act differently on 429 vs. 503 vs. network error. Four branches in the client JS add cognitive complexity and testing surface for no user benefit. One error state with a JSON API link covers all cases.
  TASK: 1

- **[YAGNI]**: Screenshot expand/collapse interaction (max-height with gradient fade, "View full screenshot" button, JS toggle, CSS class management)
  SCOPE: `src/verify-page.js` screenshot section
  CHANGE: Show the screenshot at full width inside the container (`max-width: 100%; height: auto`). No collapse, no expand button, no gradient fade, no JS toggle. If the image is tall, the user scrolls -- standard web behavior.
  WHY: The expand/collapse pattern adds JS logic, CSS for the gradient overlay, a button element, and an event listener -- all for an image the user presumably wants to see (they clicked a verification link). This is gold-plating a trust document. If truncation proves necessary after real usage, add it then.
  TASK: 1

- **[Test proportionality]**: Task 3 specifies 23 unit tests; Task 4 specifies 25 integration tests -- 48 total new tests for ~300 lines of new code and ~5 modified lines
  SCOPE: `test/verify-page.test.js` and `test/verify-html.test.js`
  CHANGE: Reduce overlap between unit and integration tests. Task 3 tests 6 response headers (cases 1-6); Task 4 re-tests 6+ of the same headers (cases 10-16, 17-18). Task 4 tests 9 Accept header variations when 4 cover the meaningful branches (text/html, application/json, */*, absent). Cut redundant header assertions from the integration tests (the unit tests cover the Response object) and reduce Accept routing to 4-5 cases. Target ~30-35 total tests.
  WHY: The existing codebase has 191 tests across 13 files for ~800 lines of source. Adding 48 tests for ~300 lines would make this the most heavily tested module by ratio. The marginal value of testing `Accept: application/xml`, `Accept: text/plain`, and empty Accept as separate integration test cases (all exercising the same else-branch) is near zero. Over-testing creates maintenance drag when the HTML template changes.
  TASK: 3, 4

- **[Scope]**: Task 1 prompt includes `Intl.DateTimeFormat` with both absolute and relative time display for timestamps
  SCOPE: `src/verify-page.js` timestamp rendering
  CHANGE: Show the absolute timestamp only using `Intl.DateTimeFormat`. Drop relative time ("3 days ago"). Relative time requires a `Date.now()` comparison and a formatting function (or a series of conditionals for seconds/minutes/hours/days) that adds logic to the client JS for marginal benefit on a trust document.
  WHY: This is a certificate page, not a social feed. Absolute time is the authoritative display. Relative time adds code complexity for a cosmetic feature that was not in the issue spec.
  TASK: 1

- **[CSS over-specification]**: Task 1 prompt prescribes 12 CSS custom properties, exact pixel values for 6+ typographic settings, BEM-lite naming convention, responsive breakpoints, `:focus-visible` outlines, and `prefers-reduced-motion` media query
  SCOPE: `src/verify-page.js` CSS specification
  CHANGE: Give the frontend-minion the design intent (trust document, single column, system fonts, green/red status, mobile-friendly) and let implementation determine the minimal CSS needed. Prescribing 12 custom properties and exact px values for an inlined stylesheet of a single page is over-constraining. The CSS custom properties are only referenced once each in a single-file page -- they add a layer of indirection without the reuse benefit that justifies custom properties.
  WHY: Over-specifying CSS in the task prompt makes the prompt itself brittle (changes require updating the spec) and adds accidental complexity to what should be a simple inlined stylesheet. CSS custom properties are valuable in design systems with themes or component reuse; in a single self-contained HTML page they are indirection without benefit.
  TASK: 1

---

### What the plan gets right

- Content negotiation on the existing route (no new routes, no new services)
- Vanilla JS/CSS/HTML with zero dependencies -- the entire feature is one new file and ~5 lines in index.js
- Client-side fetch per the issue spec, avoiding server-side HTML escaping of user-controlled data
- `unsafe-inline` CSP over nonce for static template content -- correct KISS call
- Error paths staying as JSON -- correct YAGNI call
- HSTS deferred to Step 8 -- correct scope discipline
- Task count is appropriate (1 module, 1 integration point, 2 test files, 1 docs) -- no task inflation
- Evolution log as a parallel task with no blocking dependency on code tasks
