# Decisions: Diff Overlay Slider Fix

## Team Composition

- **Decided**: No specialist planning agents needed
- **Over**: ux-strategy-minion consultation on interaction pattern
- **Why**: Lucy (governance reviewer) determined this is a bug fix restoring existing behavior, not a design decision. The drag-to-scrub pattern was already validated; only the CSS implementation was broken.

## Fix Approach

- **Decided**: `pointer-events: none` on top image + `z-index` layering
- **Over**: No alternatives considered — this is the standard CSS solution for stacking/pointer-event interception bugs
- **Why**: The root cause is clear from code reading: the overlay image covers the container and intercepts pointer events before they reach the slider handle. `pointer-events: none` is the minimal correct fix.

## Testing Strategy

- **Decided**: Visual verification only (no `npm test`)
- **Over**: Running the full test suite
- **Why**: CSS-only change; the test suite runs in workerd (Workers runtime) without a browser and cannot verify CSS stacking behavior. CLAUDE.md explicitly permits visual verification for UI-only changes.
