# Phase 3 Synthesis -- Sign-in Button Contrast Fix

## Delegation Plan

**Team name**: sign-in-contrast-fix
**Description**: Fix CSS specificity bug where `.site-header nav a` overrides `.btn--primary` color on the Sign in button, causing WCAG AA contrast failure across 7 landing pages.

### Task 1: Fix nav link selector specificity in landing.css
- **Agent**: frontend-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |
    Fix a CSS specificity bug in the landing page header where `.site-header nav a`
    overrides `.btn--primary` styles on the "Sign in" button, producing unreadable
    text (~2.5:1 contrast ratio, failing WCAG AA 4.5:1).

    ## Root Cause

    `.site-header nav a` has specificity (0,1,2) which beats `.btn--primary` at
    (0,1,0). The nav link color `var(--color-text-muted)` (#6e6a66) overrides
    the button's intended `var(--color-primary-text)` (#f8f8fa) against the dark
    `var(--color-primary)` (#2a3444) background. The hover and focus-visible
    pseudo-class variants are also broken.

    ## What to Do

    In `landing/public/css/landing.css`, modify the three nav link selectors
    (lines 167, 177, 182) to exclude button elements using `:not(.btn)`:

    ```
    .site-header nav a           -->  .site-header nav a:not(.btn)
    .site-header nav a:hover     -->  .site-header nav a:not(.btn):hover
    .site-header nav a:focus-visible --> .site-header nav a:not(.btn):focus-visible
    ```

    This excludes `.btn` elements from the nav link rules entirely, allowing the
    existing `.btn--primary` styles from `design-system.css` to apply without
    competition. No new CSS rules are needed. No properties change. The five
    plain nav links (Use Cases, Features, How It Works, Pricing, FAQ, Docs)
    do not have the `.btn` class and are unaffected.

    Add a brief comment above the first selector explaining the exclusion:

    ```css
    /* :not(.btn) excludes the Sign-in button so .btn--primary styles apply cleanly */
    ```

    ## Accessibility Advisory (from architecture review)

    Also add a `:visited` rule for the button to prevent browsers from applying
    default visited-link colors (the Sign in link points to an external domain
    that may be in browser history):

    ```css
    .site-header nav .btn--primary:visited {
      color: var(--color-primary-text);
    }
    ```

    Place this rule immediately after the `.site-header nav a:not(.btn):focus-visible`
    block (after the closing brace at what is currently line 185).

    ## What NOT to Do

    - Do NOT use `!important` -- it creates maintenance debt
    - Do NOT modify `design-system.css` -- landing.css extends it, per the comment at line 2
    - Do NOT change any HTML files -- this is a CSS-only fix
    - Do NOT add override rules like `.site-header nav .btn--primary { ... }` -- the
      exclusion approach fixes the root cause
    - Do NOT touch any other CSS rules or sections
    - Do NOT run tests -- this is a CSS-only change (per project testing discipline)

    ## File

    `landing/public/css/landing.css` -- lines 167-185 are the target area.

    ## Expected Result After Fix

    | State | Text Color | Background | Contrast Ratio | WCAG AA |
    |-------|-----------|-----------|---------------|---------|
    | Default | #f8f8fa | #2a3444 | ~11.8:1 | PASS |
    | Hover | #f8f8fa | #1f2835 | ~14.0:1 | PASS |
    | Focus-visible | #f8f8fa | #2a3444 | ~11.8:1 | PASS |
    | Visited | #f8f8fa | #2a3444 | ~11.8:1 | PASS |

- **Deliverables**: Modified `landing/public/css/landing.css` with 3 updated selectors + 1 new `:visited` rule
- **Success criteria**: (1) The three `.site-header nav a` selectors include `:not(.btn)`. (2) A `.site-header nav .btn--primary:visited` rule exists with `color: var(--color-primary-text)`. (3) No other files are modified. (4) No `!important` used.

### Cross-Cutting Coverage

- **Testing**: Not needed. This is a CSS-only change with no executable logic. Per project CLAUDE.md testing discipline: "Never run tests just to 'check if things work' after a CSS-only or copy change."
- **Security**: Not needed. No attack surface change -- pure visual CSS fix, no user input handling, no auth changes, no new dependencies.
- **Usability -- Strategy**: Addressed. The fix restores a broken user journey touchpoint (Sign in action). The button is the primary conversion path from landing pages to the authenticated experience. Both specialists confirmed the design system tokens already encode the correct colors -- this is a cascade bug, not a design decision.
- **Usability -- Design**: Not needed separately. No new UI is being created. The fix restores existing design system styling that was being overridden. The intended visual hierarchy (prominent primary button in the nav) is already designed and tokenized.
- **Documentation**: Not needed. No architectural or API surface changes. No user-facing behavior change to document (the button will simply look as intended). A CSS comment in the code is sufficient documentation.
- **Observability**: Not needed. No runtime components, APIs, or services are affected.

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - accessibility-minion: The task is specifically a WCAG contrast violation fix. Accessibility review validates that the fix achieves the claimed contrast ratios across all states (default, hover, focus-visible, visited) and does not introduce new violations.
    Review focus: Verify contrast ratios for all interactive states; confirm `:visited` handling; confirm no new WCAG violations introduced.
- **Not selected**:
  - ux-design-minion: No new UI components or visual patterns are being created. The fix restores existing design system styling.
  - sitespeed-minion: CSS selector change has no performance impact.
  - observability-minion: No runtime components involved.
  - user-docs-minion: No user-facing behavior change that needs documenting.

### Decisions

- **Exclusion approach (`:not(.btn)`) over override approach (`.site-header nav .btn--primary`)**
  Chosen: Modify the three `.site-header nav a` selectors to exclude `.btn` elements via `:not(.btn)`
  Over: Adding ~15 lines of override rules for `.site-header nav .btn--primary` and its pseudo-class variants (accessibility-minion's recommendation)
  Why: The exclusion approach fixes the root cause (the nav link rule should never have applied to buttons) rather than patching the symptom. It is fewer lines (3 selector modifications vs. 15 new lines), automatically handles all pseudo-class states without duplication, and does not create a coupling between `landing.css` and specific button variant class names. Both specialists agreed the override approach works, but frontend-minion's exclusion approach is cleaner. The accessibility-minion's own risk assessment acknowledged this: "Consider a backlog item to refactor the header nav styles to scope link styles to non-button links (e.g., `.site-header nav a:not(.btn)`)" -- which is exactly this approach.

- **Include `:visited` rule despite using the exclusion approach**
  Chosen: Add a `.site-header nav .btn--primary:visited` rule alongside the `:not(.btn)` exclusion
  Over: Relying solely on the exclusion approach (no `:visited` rule)
  Why: The `:not(.btn)` exclusion prevents the nav link styles from applying to the button, but it does not prevent browser-default `:visited` styling. Since the Sign in link points to `api.webresourceledger.com/auth/login` (an external URL the user will have visited), browsers may apply a default purple visited color. The explicit `:visited` rule is a defensive measure from the accessibility-minion's analysis that costs 3 lines and prevents a subtle future color issue.

### Risks and Mitigations

1. **Future nav buttons**: If a second button is added to the nav (e.g., "Sign up"), it must carry the `.btn` class to be excluded from nav link styling. This is the correct and expected pattern -- any visually-styled button should have `.btn`. The CSS comment documents this. **Risk: LOW.**

2. **Hover state may look different from what the user currently expects**: The current hover state shows a light background with dark text (the nav link hover overriding the button). After the fix, hover will show the intended dark primary-hover background with white text. The user may have grown accustomed to the broken hover. **Mitigation**: The design system tokens define the correct hover behavior; this is a bug restoration, not a design change.

3. **No regression from selector change**: The `:not(.btn)` pseudo-class is supported in all browsers since IE9. The codebase already uses `:not()` (line 438). No compatibility risk. **Risk: NEGLIGIBLE.**

### Execution Order

```
Batch 1 (single task, no dependencies):
  Task 1: Fix nav link selector specificity
```

One task, one file, one batch. No gates needed -- this is an additive CSS fix that is easy to reverse (low blast radius, easy to undo).

### Verification Steps

After execution:
1. Open `landing/public/index.html` in a browser and visually confirm the Sign in button has white text on a dark background
2. Hover over the button -- confirm it stays dark (not light) with white text
3. Tab to the button -- confirm focus ring is visible and text remains readable
4. Spot-check one policy page (e.g., `privacy.html`) to confirm identical rendering
5. All 7 pages share the same CSS and identical nav HTML, so a fix in `landing.css` covers all of them
