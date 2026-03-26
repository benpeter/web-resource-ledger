MODE: SYNTHESIS

You are synthesizing specialist planning contributions into a final execution plan.

## Original Task
Fix a CSS specificity bug where the "Sign in" button in the landing page header has unreadable text (~2.5:1 contrast ratio, failing WCAG AA 4.5:1). The nav link rule `.site-header nav a` overrides `.btn--primary` color, making button text dark gray on a dark navy background. Affects 7 landing pages.

## Specialist Contributions

Read the following scratch files for full specialist contributions:
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-i0tewf/sign-in-button-contrast-fix/phase2-accessibility-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-i0tewf/sign-in-button-contrast-fix/phase2-frontend-minion.md

## Key consensus across specialists:

### accessibility-minion
- Three states are broken (default, hover, focus-visible), not just one
- Hover state also broken: nav hover style overrides btn--primary:hover, losing primary identity
- Recommends CSS override `.site-header nav .btn--primary` + pseudo-class variants + `:visited` rule
- ~15 lines of CSS, single file change, no HTML changes

### frontend-minion
- Recommends adding `:not(.btn)` to the three `.site-header nav a` selectors
- Fixes problem at source by excluding buttons from nav link styles entirely
- 3 selector modifications in one file, no HTML changes
- Automatically fixes hover and focus states without additional rules

### KEY CONFLICT: Two different approaches
- accessibility-minion: Override approach (add rules to win specificity for .btn--primary in nav)
- frontend-minion: Exclusion approach (modify nav rules to not apply to buttons via :not(.btn))
- Both fix the same problem; exclusion approach is fewer lines and addresses root cause

## External Skills Context
No external skills detected.

## Instructions
1. Review all specialist contributions
2. Resolve the conflict between the override vs exclusion approaches
3. Incorporate risks and concerns into the plan
4. Create the final execution plan in structured format
5. Ensure every task has a complete, self-contained prompt
6. Write your complete delegation plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-i0tewf/sign-in-button-contrast-fix/phase3-synthesis.md`
