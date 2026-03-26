# Domain Plan Contribution: accessibility-minion

## Recommendations

### 1. The bug is worse than reported -- hover state is also broken

The original issue correctly identifies the default state contrast failure (2.34:1, WCAG 1.4.3 requires 4.5:1). However, the **hover state is broken in a completely different way**: `.site-header nav a:hover` overrides both `color` and `background`, turning the primary button into a light-background element (`#f3f2f0`) with dark text (`#1e2a36`). This is not just a contrast issue -- it is a visual identity failure where the button loses its primary styling entirely on hover.

The fix must address **three specificity conflicts**, not just one:

| State | Winning selector | Applied color | Applied background | Contrast | WCAG 1.4.3 |
|-------|-----------------|---------------|-------------------|----------|-------------|
| Default | `.site-header nav a` (0,0,1,2) | `#6e6a66` | `#2a3444` (from `.btn--primary`) | 2.34:1 | **FAIL** |
| Hover | `.site-header nav a:hover` (0,0,2,2) | `#1e2a36` | `#f3f2f0` (from nav hover) | 13.04:1 | PASS (but visually wrong) |
| Focus-visible | `.site-header nav a:focus-visible` (0,0,2,2) | same as default | same as default | 2.34:1 | **FAIL** |

### 2. Recommended fix approach: scoped selector, not `!important`

The cleanest fix is a single scoped rule that matches the button inside the header nav with sufficient specificity to override `.site-header nav a` and its pseudo-class variants. The selector `.site-header nav .btn--primary` has specificity (0,0,2,2) -- matching the pseudo-class selectors -- and should be placed **after** the nav link rules in `landing.css` so that source order breaks ties for the hover/focus-visible states.

Alternatively, `.site-header .btn--primary` at (0,0,2,1) is sufficient for the default state but loses to the pseudo-class selectors at (0,0,2,2). The safer choice is `.site-header nav .btn--primary` and corresponding `:hover` / `:focus-visible` rules.

Do NOT use `!important`. It creates maintenance debt and breaks the cascade.

### 3. Intended contrast ratios after fix (all pass WCAG 1.4.3 AA)

| State | Text | Background | Ratio | Verdict |
|-------|------|-----------|-------|---------|
| Default | `#f8f8fa` | `#2a3444` | 11.83:1 | PASS AA (4.5:1) |
| Hover | `#f8f8fa` | `#1f2835` | 14.01:1 | PASS AA (4.5:1) |
| Focus-visible | `#f8f8fa` | `#2a3444` | 11.83:1 | PASS AA (4.5:1) |
| Focus outline against `#ffffff` header surface | `#2a3444` | `#ffffff` | 12.55:1 | PASS (outline visible) |

### 4. Additional WCAG success criteria relevant to this element

Beyond **1.4.3 Contrast (Minimum)** (the primary violation), the following criteria apply to this `<a class="btn btn--primary btn--sm">Sign in</a>` element:

- **WCAG 2.4.7 Focus Visible (AA)**: The focus indicator must be visible. Currently the focus-visible outline is `2px solid #2a3444` against a `#ffffff` header background -- 12.55:1 contrast, which is fine. But the **text inside the button** during focus has the same broken contrast as the default state (2.34:1). The fix must ensure text remains readable when focused.

- **WCAG 2.4.13 Focus Appearance (AA, new in WCAG 2.2)**: The focus indicator must have a minimum area (at least as large as a 2px-thick perimeter) and a minimum 3:1 contrast change between focused and unfocused states. The current `outline: 2px solid` with `outline-offset: 2px` meets the area requirement. The `#2a3444` outline against `#ffffff` header background provides sufficient contrast change. This criterion is satisfied.

- **WCAG 2.5.8 Target Size (Minimum) (AA, new in WCAG 2.2)**: `.btn--sm` sets `min-height: 36px`. The WCAG 2.2 minimum is 24x24 CSS pixels, so this passes. However, 36px is below the recommended 44px touch target. This is a **separate issue**, not part of this fix, but worth noting for backlog.

- **WCAG 4.1.2 Name, Role, Value (A)**: The element is `<a href="...">` (role: link) with visible text "Sign in" as its accessible name. This is correct. The `.btn` classes are visual only and do not affect semantics. No `role="button"` should be added -- navigating to a login URL is a link action, not a button action.

- **WCAG 1.4.11 Non-text Contrast (AA)**: The button border (`border-color: var(--color-primary)` = `#2a3444`) against the white header surface (`#ffffff`) has 12.55:1 contrast, which passes the 3:1 minimum for UI component boundaries.

### 5. No `:visited` styles are defined

Since the Sign in link points to an external URL (`api.webresourceledger.com/auth/login`), browsers may apply default `:visited` color styling after the user has visited the page. The specificity fix should also explicitly set `color` for `.site-header nav .btn--primary:visited` to prevent any browser-default visited color from overriding the intended `#f8f8fa` text.

### 6. Semantic correctness is fine -- do not add `role="button"`

The element navigates to a login page. It is correctly an `<a>` element. The `.btn` class is purely visual. Adding `role="button"` would be semantically wrong and would break expected screen reader behavior (screen readers announce "Sign in, link" which correctly communicates that activation navigates somewhere).

## Proposed Tasks

### Task 1: Add scoped CSS override for header nav button (all states)

Add rules in `landing.css` immediately after the `.site-header nav a:focus-visible` block (after line 185) that restore the button's intended appearance:

```css
/* Restore btn--primary styles when used inside header nav */
.site-header nav .btn--primary {
  color: var(--color-primary-text);
  background: var(--color-primary);
  border-color: var(--color-primary);
}

.site-header nav .btn--primary:visited {
  color: var(--color-primary-text);
}

.site-header nav .btn--primary:hover {
  color: var(--color-primary-text);
  background: var(--color-primary-hover);
  border-color: var(--color-primary-hover);
}

.site-header nav .btn--primary:focus-visible {
  color: var(--color-primary-text);
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
```

This is approximately 15 lines of CSS in a single location (`landing.css`). No changes to `design-system.css`. No HTML changes. No changes to the 7 landing page HTML files.

### Task 2: Verify contrast ratios for all states post-fix

After the CSS change, verify using browser DevTools (Chrome Accessibility tab or Firefox Accessibility Inspector):
- Default state: text contrast >= 4.5:1
- Hover state: text contrast >= 4.5:1, background is dark (not light)
- Focus-visible state: text contrast >= 4.5:1, outline visible against header background
- Visited state: text color is `#f8f8fa` (not browser default visited purple)

### Task 3: Visual verification across all 7 pages

Open each landing page and confirm the Sign in button renders correctly:
- `index.html`
- `404.html`
- `privacy.html`
- `terms.html`
- `security.html`
- `refund-policy.html`
- `content-policy.html`

All pages share the same header HTML and CSS, so a single CSS fix covers all 7. But verify visually since there may be page-specific CSS or layout differences.

## Risks and Concerns

### Risk 1: Future selectors in design-system.css could re-break this

The root cause is a **structural CSS architecture issue**: `.site-header nav a` is overly broad -- it targets all `<a>` elements inside the nav, including ones that are buttons. The scoped fix works, but if someone later adds `.site-header nav a:active` or `.site-header nav a:visited` without considering button variants, the bug could recur.

**Mitigation**: Add a CSS comment above the override block explaining the specificity relationship. Consider a backlog item to refactor the header nav styles to scope link styles to non-button links (e.g., `.site-header nav a:not(.btn)`), but this is a larger refactor not needed for this fix.

### Risk 2: The hover state visual breakage may not have been noticed

The hover state currently shows a light background with dark text -- it looks like a ghost/outline button, not the intended dark primary button. This might be perceived as intentional by someone who has only seen the hover state. Confirm with the user that the intended hover is dark-on-dark (primary-hover background with primary-text foreground).

### Risk 3: btn--sm target size is below 44px recommendation

`.btn--sm` sets `min-height: 36px`, which passes WCAG 2.5.8 (24px minimum) but falls below the 44px recommended minimum touch target. This is **not part of this fix** -- the `.btn` base class already uses 44px for non-sm variants. Log this as a separate backlog consideration if mobile touch targets are a concern.

## Additional Agents Needed

None. This is a pure CSS specificity fix. The frontend-minion can implement the CSS changes. No design decisions are needed (the colors are already defined in the design system tokens). No test changes are required (this is CSS-only, per the project's testing discipline -- no test run needed for CSS changes).
