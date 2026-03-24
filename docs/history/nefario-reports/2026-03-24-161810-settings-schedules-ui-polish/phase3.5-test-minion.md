ADVISE

- [testing]: No test asserts that `.settings-section-heading` is present in `UI_CSS`, meaning the rename from `.settings-section-title` is untestable and undetected by the suite if it regresses.
  SCOPE: `test/ui-settings-usage.test.js`, `src/ui/ui-css.js`
  CHANGE: Add a `UI_CSS` assertion for `.settings-section-heading` alongside the existing usage-section CSS class checks (the `UI_CSS -- usage section styles` describe block is the natural home).
  WHY: The existing pattern for CSS class coverage is established (see Partition G in `ui-billing.test.js` and the `UI_CSS -- usage section styles` block in `ui-settings-usage.test.js`). The rename of `.settings-section-title` → `.settings-section-heading` is exactly the kind of silent regression that string-presence tests catch cheaply. Without it, a future refactor could revert to the dead class name and all tests would still pass.
  TASK: Task 1

- [testing]: No test asserts that `.settings-info-grid` contains `display: grid`, which is the specific fix that makes the grid render at all.
  SCOPE: `test/ui-settings-usage.test.js`, `src/ui/ui-css.js`
  CHANGE: Add a `UI_CSS` assertion that checks `UI_CSS` contains `.settings-info-grid` (and optionally that the substring following it contains `display: grid` within a short window, matching the pattern used for `--color-warning`/`--color-error` in the billing tests).
  WHY: The `display: grid` omission is the single highest-impact bug being fixed — without it the grid columns rule is a no-op. The synthesis plan calls out in its verification steps (step 3) that this should be checked post-execution, but a permanent test assertion costs nothing extra and prevents silent reversion.
  TASK: Task 1

- [testing]: Task 2 removes the `inner` wrapper div from five builder functions in `ui-billing.js`, but no test guards against re-introduction of `inner.style.padding` inline assignments.
  SCOPE: `test/ui-billing.test.js`, `src/ui/ui-billing.js`
  CHANGE: Add a `BILLING_JS` string assertion that `BILLING_JS` does not contain `inner.style.padding` (mirroring the existing `F1: no innerHTML` pattern). One line, same structure.
  WHY: The plan explicitly calls out this cleanup in its verification steps (step 4: "grep for no `inner.style.padding`"). That grep belongs in the permanent test suite, not just the post-execution checklist. The DOM simplification only stays clean if the test catches drift.
  TASK: Task 2

None of these concerns block execution. All three are additive test assertions that can be added as part of Task 1 and Task 2 without changing the implementation scope. The CSS changes themselves cannot break any existing test selectors — no current test asserts presence of `.settings-section-title` (the dead class) or absence of the new classes being added.
