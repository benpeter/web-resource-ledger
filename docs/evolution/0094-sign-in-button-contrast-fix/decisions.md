# Decisions: Sign-in Button Contrast Fix

## CSS Fix Approach: Exclusion vs Override

**Chosen**: `:not(.btn)` exclusion on `.site-header nav a` selectors
**Over**: Adding ~15 lines of override rules (`.site-header nav .btn--primary` + pseudo-class variants)
**Why**: The exclusion approach fixes the root cause — nav link styles should never have applied to buttons. It's fewer lines (3 selector modifications vs. 15 new lines), automatically handles all pseudo-class states without duplication, and avoids coupling landing.css to specific button variant class names. The accessibility-minion's own risk assessment acknowledged this as the better long-term approach.

## Include :visited Guard

**Chosen**: Add `.site-header nav .btn--primary:visited` rule alongside the exclusion
**Over**: Relying solely on the exclusion approach
**Why**: The `:not(.btn)` exclusion prevents nav link styles from applying, but does not prevent browser-default `:visited` styling. The Sign-in link points to `api.webresourceledger.com/auth/login` — a URL the user will have visited. Browser-default visited purple (#551a8b) against the dark button background computes to ~1.14:1 contrast — effectively invisible. The 3-line defensive rule costs nothing and prevents a real edge case.

## Scope: Three States, Not One

The issue described the default state contrast failure. Accessibility-minion's analysis revealed that hover and focus-visible states were also broken — the nav hover rule overrode btn--primary:hover, and focus-visible inherited the broken default color. The `:not(.btn)` approach fixes all three simultaneously without additional work.
