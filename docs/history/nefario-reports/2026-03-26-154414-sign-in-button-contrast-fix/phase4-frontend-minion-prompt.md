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
plain nav links do not have the `.btn` class and are unaffected.

Add a brief comment above the first selector explaining the exclusion:

```css
/* :not(.btn) excludes the Sign-in button so .btn--primary styles apply cleanly */
```

## Accessibility Advisory

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

- Do NOT use `!important`
- Do NOT modify `design-system.css`
- Do NOT change any HTML files
- Do NOT add override rules like `.site-header nav .btn--primary { ... }`
- Do NOT touch any other CSS rules or sections
- Do NOT run tests

## File

`landing/public/css/landing.css` -- lines 167-185 are the target area.

## Working Directory

/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/magical-sparking-snowglobe
