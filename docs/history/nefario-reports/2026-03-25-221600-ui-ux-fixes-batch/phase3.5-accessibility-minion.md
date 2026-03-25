## Accessibility Review

**Verdict: ADVISE**

---

[accessibility]: Contrast diagnostic rationale contains an incorrect figure — correct the stated ratio before it is committed as documentation.

**SCOPE**: Task 1 (Fix A), synthesis rationale and any commit message / evolution log that inherits it.

**CHANGE**: The synthesis states `--color-text-muted` (#6e6a66) achieves "only ~3.4:1" against `--color-bg` (#f7f6f5). My calculation gives 4.97:1 — the original value *already passes* WCAG AA 4.5:1 normal text on that background. The true failure mode is more nuanced: it may fail in specific usage contexts (e.g., against a lighter surface, or when composed with other elements) or the ticket author measured against a different reference background. The change to #595550 is still correct and beneficial (6.85:1 / 7.39:1 on the two surfaces), but the stated justification is wrong.

**WHY**: If "3.4:1 failing" is embedded in commit messages, evolution log `decisions.md`, or ops runbook, it becomes a false historical record that could mislead future audits. A developer reviewing `git log` will see a passing value was changed to fix a "failing" value and lose trust in the audit process.

**TASK**: Before or during PR creation, update the rationale to accurately reflect the contrast values. Suggested phrasing: "Updated `--color-text-muted` from #6e6a66 (4.97:1 against #f7f6f5, marginal pass) to #595550 (6.85:1) to provide stronger WCAG AA margin and bring text clarity in line with the rest of the design system." If the original issue (#211) was filed against a different background color than #f7f6f5, note which background was the actual failure.

---

**Everything else is sound:**

- **#595550 contrast**: PASS. Measured 6.85:1 against #f7f6f5 and 7.39:1 against #ffffff. Both clear WCAG 2.2 AA 4.5:1 for normal text (SC 1.4.3) and AA 3:1 for large text.
- **Billing status removal**: `billingAnnounce()` and the `aria-live="polite"` region in `ui-billing.js` are explicitly preserved. Screen reader users will continue to receive status announcements on data refresh. The visual dedup does not break assistive technology.
- **Docs link sr-only pattern**: Correct. `aria-hidden="true"` on the SVG icon prevents double-announcement. Visually-hidden `<span>` with "(opens in new tab)" is the WCAG-recommended technique for communicating `target="_blank"` behavior (see WCAG technique G201). The plan correctly instructs the agent to add `.sr-only` if not present — confirmed: no `.sr-only` class exists in `ui-css.js` today.
- **Accessible name**: Using visible text "Docs" plus sr-only "(opens in new tab)" is preferable to `aria-label`. The plan's explicit instruction not to use `aria-label` here is correct — visible label matches the announced name (SC 2.5.3 Label in Name).
- **External link icon**: `aria-hidden="true"` + `fill="currentColor"` is the correct pattern. No additional label needed since the sr-only span handles context.
- **No new keyboard or focus concerns**: Adding a `<a>` element to the nav introduces no keyboard trap risk. Focus order follows DOM order. No custom widget patterns involved.
