ADVISE

---

- [testing]: Protocol-relative URL `//example.com` is not covered and silently passes as valid
  SCOPE: test/ui-submit.test.js, safeUrl() in src/ui/ui-submit.js
  CHANGE: Add a test case for `safeUrl("//example.com")`. Under the planned implementation, `//example.com` does not contain `://` so the prepend path fires, producing `https://example.com/`. Whether that is the intended behavior should be an explicit decision — if it is intentional, add a passing test; if not, the guard needs to handle it and the test should assert null.
  WHY: Protocol-relative URLs are a known input pattern. A user who pastes `//example.com` (e.g., copied from HTML source) will silently get `https://example.com` submitted, which may surprise them. The behavior is deterministic but undocumented in the test suite. Verified by running the proposed logic: `new URL("https://" + "//example.com")` produces `https://example.com/`.
  TASK: Task 2

- [testing]: Bare hostname with port (`example.com:8080`) returns null even though `https://example.com:8080` is valid — this behavior is unspecified and untested
  SCOPE: test/ui-submit.test.js, safeUrl() in src/ui/ui-submit.js
  CHANGE: Add a test case for `safeUrl("example.com:8080")` asserting the actual return value (null). Document why: `new URL("example.com:8080")` succeeds but parses `example.com` as the scheme, so the catch branch is never reached and no prepend occurs. If ports on bare hostnames should be supported, the implementation needs a more sophisticated detection heuristic. If null is acceptable, the test documents it explicitly.
  WHY: Users who type `example.com:8080` (a common developer input pattern) will get a validation error rather than auto-prepend. This is a meaningful UX gap that the 9 planned cases don't surface. Confirmed by running proposed logic: first parse succeeds with `protocol: "example.com:"`, which fails the http/https check, returning null before entering the catch block.
  TASK: Task 2

- [testing]: The verify page text fix (Fix 2) and billing CSS fix (Fix 3) have no test coverage — the plan leaves them to manual spot-check only
  SCOPE: test/ui-submit.test.js (missing), src/verify-page.js, src/ui/ui-css.js
  CHANGE: Add at minimum two string-assertion tests: (1) in the existing test/verify-page.test.js, assert that the HTML output does not contain `"Art. 41"` and does contain `"Article 41"`; (2) in test/ui-billing.test.js (which already imports UI_CSS), assert that `.billing-stat-value` and `.billing-stat-label` rules contain `display: block`. These are one-line additions to existing test files.
  WHY: The plan's stated success criteria include "verify page shows 'Article 41'" and "billing stat spans are block-level" but neither has an automated assertion — both rely on grep spot-checks. The existing test infrastructure already imports `BILLING_JS`/`UI_CSS` and `htmlVerifyResponse`, so adding assertions is trivial. Without them, a future refactor could silently revert Fix 2 or Fix 3 without breaking CI.
  TASK: Task 1 (these assertions should accompany the code changes, not wait for Task 2)

---

Notes:

The evalFromSource() pattern is appropriate for this use case. The existing ui-billing.test.js proves it works for extracting helpers from embedded JS string constants, and the constraints (no DOM, no fetch, var not let/const) are correctly accounted for in the Task 2 prompt. The 9 planned cases cover the core branches adequately; the two ADVISE items above are gaps worth closing, not blockers.

The absence of tests for Fix 2 and Fix 3 is the most important ADVISE item. The verify-page and UI_CSS test files already exist and already import the relevant exports — adding two assertions is minutes of work and protects against silent regression.
