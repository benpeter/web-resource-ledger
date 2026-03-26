# Frontend Minion -- Domain Plan Contribution

## Recommendations

### Root Cause

The specificity of `.site-header nav a` is (0,1,2) -- one class, two element selectors. The specificity of `.btn--primary` is (0,1,0) -- one class. The nav rule wins because 0-1-2 > 0-1-0, so `color: var(--color-text-muted)` (#6e6a66, a medium gray) overrides `color: var(--color-primary-text)` (#f8f8fa, near-white). The button background is `var(--color-primary)` (#2a3444, dark navy), producing approximately 2.5:1 contrast -- well below WCAG AA's 4.5:1 requirement.

The hover state is also broken: `.site-header nav a:hover` sets `color: var(--color-text)` (#1e2a36, dark charcoal) while the button hover background is `var(--color-primary-hover)` (#1f2835, darker navy), producing even worse contrast (~1.1:1, essentially invisible).

### Recommended Fix: Option (b) -- `:not(.btn)` exclusion on the nav rule

**Change `.site-header nav a` to `.site-header nav a:not(.btn)`**

This is the cleanest approach for several reasons:

1. **Addresses the real problem at the source.** The nav link styles (muted color, hover background) should never have applied to buttons. The `:not(.btn)` exclusion says exactly that: "style nav links, but not nav buttons." This is semantically correct -- the button is not a link, it just happens to be an `<a>` tag.

2. **No new specificity to manage.** The specificity of `.site-header nav a:not(.btn)` is still (0,2,1) (`:not()` contributes its argument's specificity, so `.btn` adds one class). But crucially, this selector *excludes* the button entirely rather than trying to override it. The `.btn--primary` rule applies cleanly with no competition.

3. **Automatically fixes hover, focus-visible, and any future states.** Because the exclusion is on the base selector, all pseudo-class variants (`:hover`, `:focus-visible`) also stop matching the button. With option (a), you would need to duplicate the override for `.site-header nav a.btn--primary:hover` as well to prevent the nav hover from applying.

4. **Matches existing codebase patterns.** The landing.css file already uses `:not()` (line 438: `.feature-group-label:not(:first-child)`). No new CSS features are introduced. The codebase does not use `:where()` or `:is()` anywhere, so option (d) would introduce an unfamiliar pattern.

5. **Zero side effects on other nav links.** The five plain nav links (`Use Cases`, `Features`, `How It Works`, `Pricing`, `FAQ`, `Docs`) don't have the `.btn` class, so they continue matching the rule exactly as before.

### Why the other options are worse

**(a) `.site-header nav a.btn--primary { color: var(--color-primary-text); }`** -- This is a specificity override patch. It fixes the base color but you also need a hover rule (`.site-header nav a.btn--primary:hover`) and you need to undo `background: var(--color-surface-muted)` from the nav hover. It's two or three rules to paper over a problem that option (b) eliminates with three characters (`:not(.btn)`). It also couples landing.css to specific button variant class names.

**(c) Reordering CSS** -- The stylesheets load in a defined order (`design-system.css` then `landing.css`), and the comment at line 2 of `landing.css` says "Extends src/design-system.css -- do NOT modify design-system.css". Reordering would either break this contract or require moving the nav styles into design-system.css, which is wrong (they are landing-specific). And reordering alone doesn't fix the specificity difference (0,1,2 vs 0,1,0), so it wouldn't work anyway.

**(d) `:where()` to lower nav specificity** -- Would work (`:where(.site-header nav) a` has specificity 0-0-1, so `.btn--primary` would win), but `:where()` is not used anywhere in this codebase. It's also semantically confusing -- it looks like you're trying to be clever rather than solving the problem directly. And if anyone adds another rule that targets `.site-header nav a` without `:where()`, the specificity issue returns.

## Proposed Tasks

### Task 1: Update the nav link selector in landing.css

**File:** `landing/public/css/landing.css`

Change three selectors (lines 167, 177, 182):

```css
/* Before */
.site-header nav a {
.site-header nav a:hover {
.site-header nav a:focus-visible {

/* After */
.site-header nav a:not(.btn) {
.site-header nav a:not(.btn):hover {
.site-header nav a:not(.btn):focus-visible {
```

No other properties change. No new rules needed.

### Task 2: Verify contrast ratios

After the fix, verify the computed colors:
- **Normal state:** `#f8f8fa` text on `#2a3444` background -- 10.6:1 contrast (passes AAA)
- **Hover state:** `#f8f8fa` text on `#1f2835` background -- 12.1:1 contrast (passes AAA)

No additional work needed; the design-system token values already provide excellent contrast when not overridden.

### Task 3: Confirm fix applies across all 7 HTML files

All 7 landing pages share the same CSS file and use identical nav HTML. The fix is CSS-only, so no HTML changes are needed. Verify that `404.html`'s body button (`.btn btn--primary btn--lg` at line 40) is not inside `.site-header nav` and therefore unaffected (it's in a `<main>` section).

## Risks and Concerns

1. **Minimal risk.** This is a targeted selector change that narrows scope rather than adding overrides. The `:not(.btn)` pseudo-class has universal browser support (since IE9).

2. **Future nav buttons.** If a second button is ever added to the nav (e.g., a "Sign up" ghost button), it would also need the `.btn` class to be excluded from nav link styling. This is the correct behavior -- any element styled as a button should carry the `.btn` class.

3. **The `.btn--sm` rule in landing.css (line 93) and `.btn--lg` (line 86) are landing-specific extensions.** They do not set `color`, so they don't contribute to this bug. No changes needed there.

4. **No JavaScript involved.** The fix is pure CSS, no risk of runtime regressions.

## Additional Agents Needed

None. This is a straightforward CSS specificity fix confined to a single CSS file. No design decisions are involved (the correct colors are already defined in the design system tokens), no API changes, no infrastructure changes.
