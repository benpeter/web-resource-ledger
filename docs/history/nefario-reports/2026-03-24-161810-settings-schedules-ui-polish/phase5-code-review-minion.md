## Code Review: Settings/Schedules UI Polish

**Reviewer**: code-review-minion
**Files**: `src/ui/ui-css.js`, `src/ui/ui-billing.js`
**Scope**: CSS additions for settings/schedules parity, DOM cleanup removing inner wrapper divs

---

VERDICT: APPROVE

FINDINGS:

- [NIT] ui-css.js:651-656 -- Two consecutive identical rules for `.settings-section.card` and `.schedule-form-section.card` both set `padding: var(--space-4) var(--space-5)`. This is a minor DRY violation. Could be collapsed into a single multi-selector rule:
  ```css
  .settings-section.card,
  .schedule-form-section.card {
    padding: var(--space-4) var(--space-5);
  }
  ```
  FIX: Combine into one rule if the selectors remain in sync. Accept as-is if divergence is anticipated (e.g., the schedule variant may get different padding later).

- [NIT] ui-css.js:671 -- `.settings-info-row { display: contents; }` is correct for making `div` wrappers transparent in the CSS Grid so `dt`/`dd` children become grid items directly. However, `display: contents` has a known accessibility regression in older implementations where the element is removed from the accessibility tree. This is a non-issue for a purely structural wrapper `div` with no role, label, or interactive content -- confirmed by reading ui-settings.js:344-354 where the row `div` carries no accessible semantics. No action required; note is for awareness.

- [NIT] ui-billing.js (multiple locations around lines 402-414, 603-610) -- Several `p` elements in billing sections still set typography via inline `style.fontSize` and `style.marginTop`. These escaped the cleanup pass (the cleanup correctly targeted the wrapper `div` padding, not general inline styles). Not a correctness issue -- the inline styles work -- but they are inconsistent with the CSS-class approach used elsewhere. Low priority.
  FIX: Defer to a future polish pass or extract `.billing-note` / `.billing-note-success` utility classes.

---

### Summary

**ui-billing.js**: Clean and correct. The removal of 5 inner `div` wrappers with inline padding in `buildPeriodSummary`, `buildThresholdSection`, `buildPricingSection`, `buildEidasSection`, and `buildPaymentSection` is mechanically straightforward -- children re-parented directly to `section`, wrapper removed, no logic changes. The padding responsibility moves correctly to the new `.settings-section.card` CSS rule in design-system context.

**ui-css.js**: All new selectors are grounded in actual DOM usage. Cross-checked:
- `.settings-section-heading`: replaces `.settings-section-title` (old class removed from CSS, old class confirmed absent from all JS files)
- `.settings-scope-item`: replaces `.settings-scope-label` (old class removed from CSS; `settings-scope-label` appearing in ui-settings.js lines 597/600 is an *id*, not a class reference -- no regression)
- `.settings-info-grid` now has `display: grid` added (it was missing before; the `grid-template-columns` rule was previously inert)
- All 18+ new selectors (`.settings-info-row`, `.settings-info-label`, `.settings-info-value`, `.settings-key-list`, `.settings-key-row`, `.settings-key-info`, `.settings-key-name`, `.settings-key-meta`, `.settings-key-scopes`, `.settings-key-actions`, `.settings-keys-empty`, `.settings-keys-limit`, `.settings-create-heading`, `.settings-create-row`, `.settings-new-key-display`, `.settings-scope-item`) verified against ui-settings.js usage
- Mobile breakpoint added for `settings-info-grid` (single column) and `settings-key-row` (stack direction) is appropriate

**Security**: No injection vectors. No hardcoded secrets. All content set via `.textContent` (not `.innerHTML`). No auth/authz logic touched.

**Correctness**: The `.card` base rule (`design-system.css:118`) carries `overflow: hidden` with no padding. The new compound selectors correctly add the padding that was previously inline on the removed wrapper divs. Padding parity is preserved.
