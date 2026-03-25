## test-minion verdict: ADVISE

The plan is sound. Existing test patterns (string assertions on exported JS constants, no DOM) are well-established and appropriate for these changes. The plan acknowledges test-minion's earlier input and correctly drops the behavioral notification test. Three targeted advisories follow.

---

[testing]: Billing dedup fix needs a regression guard in ui-billing.test.js

SCOPE: `src/ui/ui-billing.js` / `test/ui-billing.test.js`

CHANGE: Add one string-assertion test in Partition E (structural smoke checks) asserting that `BILLING_JS` does NOT contain the specific pattern that renders the duplicate status text in `buildRefreshRow()`. Something like:

```js
it('E11: buildRefreshRow does not render inline billing status text (dedup fix)', () => {
  // The status label is shown by buildStatusBanner/buildPaymentSection.
  // buildRefreshRow must not render a "Status: X" span alongside the refresh button.
  expect(BILLING_JS).not.toContain("'Status: '");
});
```

WHY: Without a regression guard, the dedup fix is invisible to the test suite. The plan says "all existing tests pass" as success criteria, but nothing in the existing suite would catch a revert of this specific change. The other structural tests (E1–E10) test presence, not absence of the removed element. A one-line string assertion closes the gap.

TASK: frontend-minion should add this test while making the billing change (same file, same context). No new test infrastructure needed.

---

[testing]: Design token sync check is missing from the test suite

SCOPE: `src/design-system.css` / `src/design-system.js` / `test/ui-dashboard.test.js` (or a new `test/design-system.test.js`)

CHANGE: The plan explicitly calls out that both files must stay in sync (Risk 4), but there is currently no automated check that enforces this. `ui-dashboard.test.js` already imports `htmlDashboard()` which embeds the token values. A targeted test asserting the new value is present would lock in the fix and catch desync:

```js
it('--color-text-muted is #595550 (WCAG AA fix, must match design-system.css)', async () => {
  const html = await htmlDashboard().text();
  expect(html).toContain('--color-text-muted: #595550');
});
```

And a companion assertion on `DESIGN_SYSTEM_CSS` from `src/design-system.js`:

```js
import { DESIGN_SYSTEM_CSS } from '../src/design-system.js';
it('DESIGN_SYSTEM_CSS --color-text-muted is #595550 (JS export in sync with CSS)', () => {
  expect(DESIGN_SYSTEM_CSS).toContain('--color-text-muted: #595550');
});
```

WHY: The plan verifies correctness through visual review and manual contrast-ratio calculation. An automated test asserting the exact hex value is the only way CI will catch a future inadvertent revert or desync between the two files. The dashboard test already tests other token values (`--color-text`, `--color-primary`, `--font-sans`) — this follows the same pattern.

TASK: frontend-minion should add both assertions while making the token change.

---

[testing]: Docs link has no structural test coverage in AUTH_JS

SCOPE: `src/ui/ui-auth.js` / `test/ui-dashboard.test.js`

CHANGE: The plan adds a docs link to `AUTH_JS` for both auth paths but there is no test asserting it is present in the exported `AUTH_JS` string. The existing `ui-dashboard.test.js` already imports `AUTH_JS` (line 6) and has security tests over it. Adding two assertions is low-effort and catches both the presence of the link and the screen-reader text:

```js
it('AUTH_JS: contains docs link pointing to docs.webresourceledger.com', () => {
  expect(AUTH_JS).toContain('docs.webresourceledger.com');
});

it('AUTH_JS: docs link includes screen reader text for external navigation', () => {
  expect(AUTH_JS).toContain('opens in new tab');
});
```

WHY: Without these, the test suite would pass even if the implementing agent forgot to add the docs link to one of the two auth paths. These two assertions are cheap and guard against the most likely error mode (missing one of the two auth paths).

TASK: frontend-minion should add both assertions in `test/ui-dashboard.test.js` while making the auth change.

---

## Summary

No blockers. The test approach is appropriate for the project. The three advisories above are low-effort additions (6-8 lines of test code total) that close specific regression gaps in the three changed areas. All follow existing project patterns and can be written by frontend-minion alongside the implementation changes.
