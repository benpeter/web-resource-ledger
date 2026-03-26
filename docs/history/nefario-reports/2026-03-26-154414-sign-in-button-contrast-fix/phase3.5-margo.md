# Margo -- Complexity Review

## Verdict: APPROVE

This plan is proportional to the problem. A CSS specificity bug gets a CSS specificity fix. No new files, no new dependencies, no new abstractions, no framework changes.

### What I checked

**Scope alignment**: The user asked for legible button text across 7 landing pages. The plan modifies 3 selectors and adds 1 rule in a single CSS file. Task count: 1. Technology additions: 0. Dependencies added: 0. This is as lean as it gets.

**`:not(.btn)` approach**: This is not over-engineered. It is the standard CSS idiom for "style these elements but not those." The alternative (15 lines of override rules) would be strictly more complex -- more lines, more coupling between landing.css and button variant class names, more maintenance surface. The exclusion approach fixes the root cause rather than patching symptoms. Correct call.

**`:visited` rule**: This is the only item worth scrutinizing. It adds 3 lines to prevent a hypothetical future color issue (browser applying default visited purple to the sign-in link). The justification is sound: the link points to an external auth URL the user will have visited, and browser-default `:visited` styling is a real and documented behavior, not a speculative concern. 3 lines of defensive CSS is proportional. Not YAGNI -- this is a known browser behavior for a link that will definitely be visited.

**No unnecessary work**: No tests run (correct for CSS-only). No docs updated (correct, no API/architectural change). No design-system.css touched. No HTML modified. Single batch, single task, no approval gates. The plan explicitly lists what NOT to do, which prevents scope creep during execution.

### Complexity budget tally

| Item | Cost |
|------|------|
| New technologies | 0 |
| New services | 0 |
| New abstraction layers | 0 |
| New dependencies | 0 |
| **Total** | **0** |

No concerns.
