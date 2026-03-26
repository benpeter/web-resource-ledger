## Verdict: APPROVE

### Contrast ratio verification (independently computed)

All values verified against source tokens in `design-system.css`:

| State | Text | Background | Ratio | WCAG AA | Synthesis claim |
|-------|------|-----------|-------|---------|-----------------|
| Default | #f8f8fa | #2a3444 | 11.83:1 | PASS | 11.8:1 -- accurate |
| Hover | #f8f8fa | #1f2835 | 14.01:1 | PASS | 14.0:1 -- accurate |
| Focus-visible | #f8f8fa | #2a3444 | 11.83:1 | PASS | 11.8:1 -- accurate |
| Visited | #f8f8fa | #2a3444 | 11.83:1 | PASS | 11.8:1 -- accurate |
| Broken state | #6e6a66 | #2a3444 | 2.34:1 | FAIL | 2.5:1 -- slightly optimistic but same conclusion |

All fixed states exceed WCAG 2.2 SC 1.4.3 (AA, 4.5:1 normal text) by a large margin. No concerns.

### :visited handling

The explicit `.site-header nav .btn--primary:visited { color: var(--color-primary-text); }` rule is the correct defense. Browser default visited purple (#551a8b) against #2a3444 computes to approximately 1.14:1 -- a complete failure. The explicit override is not optional here, it is load-bearing. The synthesis is correct to include it.

### Focus indicator continuity

The `:not(.btn)` exclusion removes `.site-header nav a:focus-visible` from applying to the button. This is safe: `design-system.css` line 82 defines `.btn:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }` which applies to all `.btn` elements regardless of context. The button retains its focus outline through the design system rule; it does not depend on the nav link rule. No focus regression.

The focus outline color is `--color-primary` (#2a3444) against the surrounding page surface. This is an outline around the button itself, not against the button background -- the contrast is against the page background (`--color-surface` or similar), which is appropriate. No WCAG 2.4.13 concern introduced by this change.

### No new WCAG violations from :not(.btn) exclusion

The exclusion approach scopes existing styles to non-button links. It does not change the visual treatment of the five plain nav links (Use Cases, Features, How It Works, Pricing, FAQ, Docs). Their `color: var(--color-text-muted)` (#6e6a66) against the site header background should be verified separately, but that is pre-existing and out of scope for this fix.

### One observation (non-blocking)

The `.btn--sm` modifier is on the Sign in button (`class="btn btn--primary btn--sm"`). The synthesis does not mention `btn--sm` overriding any color properties -- correct, it should only affect sizing. Verified that `design-system.css` does not define `.btn--sm` overriding color. No impact.

### Summary

The fix is technically sound, contrast ratios are accurately reported, the `:visited` rule is necessary and correctly scoped, and the `:not(.btn)` approach introduces no new WCAG violations. Approve for execution.
