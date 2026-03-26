---
verdict: APPROVE
minion: ux-strategy-minion
---

## Verdict: APPROVE

This plan fixes a broken user journey touchpoint with surgical precision. No concerns from a UX strategy perspective.

### Journey coherence

The Sign in button is the primary conversion action on every landing page -- the single most important affordance for getting users into the product. At 2.5:1 contrast, it fails as a visible affordance entirely: users may not register it as an interactive element, may not see it against the header background, and those who do click it get a broken hover state that signals "broken" rather than "interactive." The fix restores visibility, affordance clarity, and feedback consistency in one CSS change.

The `:visited` rule is a sound defensive addition. A user who has already authenticated will have `api.webresourceledger.com/auth/login` in their history -- a purple visited-link color on a dark button would be a confusing signal ("is this broken? have I already signed in?").

### Cognitive load

The fix reduces cognitive load. Currently, a user scanning the nav encounters a button that does not read as a button -- it blends into the surrounding text visually. After the fix, the design system's visual hierarchy does its intended job: one prominent primary action stands apart from five plain nav links. This is exactly what primary button styling is for.

### Simplification

Nothing to simplify. Single file, single concern, minimum viable change. The exclusion approach (`:not(.btn)`) over the override approach is the right call -- it fixes the root cause rather than adding compensating complexity.

### User jobs-to-be-done

"When I land on this page and want to access my account, I want to see a clear Sign in action so I can proceed without hunting." This fix serves that job directly. No ancillary deliverables, no scope creep.

### One note

The plan correctly flags that hover behavior will change (from broken light-background to correct dark-background). This is restoration, not regression. No user testing needed -- the design system tokens define the intended behavior.
