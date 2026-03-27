## Delegation Plan

**Team name**: diff-overlay-slider-fix
**Description**: Fix the diff overlay slider handle so it can be grabbed and dragged for screenshot comparison.

### Task 1: Fix overlay slider pointer event interception

- **Agent**: frontend-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |
    Fix the diff overlay slider in the WRL comparison UI. The slider handle
    cannot be grabbed or dragged because the top overlay image intercepts
    pointer events.

    ## Root Cause

    In `src/ui/ui-css.js`, the `.diff-overlay-img--top` element is
    `position: absolute` covering the entire container (`width: 100%;
    height: 100%`). Although the slider handle (`.diff-overlay-slider`) and
    line (`.diff-overlay-line`) appear later in DOM order, the top image's
    full-coverage bounding box intercepts pointer events before they reach
    the handle. CSS `clip-path` (applied dynamically by JS) changes the
    visible area but does NOT affect hit testing in all browsers -- the
    element still receives clicks across its original bounds.

    ## Fix

    Edit `src/ui/ui-css.js` (the CSS string definitions around lines 1980-2009).
    Make these changes:

    1. Add `pointer-events: none;` to `.diff-overlay-img--top` (around line 1987).
       This lets clicks pass through the image to the slider handle beneath it.

    2. Add `z-index: 2;` to `.diff-overlay-line` (around line 1989-1997).
       Ensures the vertical indicator line renders above the top image.

    3. Add `z-index: 3;` and `pointer-events: auto;` to `.diff-overlay-slider`
       (around line 1999-2009). Ensures the handle is the topmost interactive
       element and explicitly receives pointer events.

    ## Files

    - `src/ui/ui-css.js` -- the ONLY file to modify. Contains CSS as a JS
      template string. The overlay styles start at the `/* Overlay */` comment
      around line 1961.

    Do NOT modify `src/ui/ui-diff.js` -- the slider interaction logic
    (mousedown, mousemove, touchstart, etc.) is correct. The bug is purely
    CSS stacking/pointer-events.

    ## Verification

    After making the changes, read back the modified CSS block to confirm:
    - `.diff-overlay-img--top` has `pointer-events: none`
    - `.diff-overlay-line` has `z-index: 2`
    - `.diff-overlay-slider` has `z-index: 3` and `pointer-events: auto`
    - No other overlay styles were changed
    - The CSS is syntactically valid (properly terminated declarations)

    Do NOT run `npm test` -- this is a CSS-only change and the test suite
    is heavyweight (Workers runtime). Visual verification is sufficient.

- **Deliverables**: Updated CSS in `src/ui/ui-css.js` with 3 property additions
- **Success criteria**: The overlay slider handle sits above the top image in the stacking context and receives pointer events, enabling drag interaction.

### Cross-Cutting Coverage

- **Testing**: Excluded. CSS-only fix with no logic changes. The project's test suite runs a full Workers runtime (~8 GB) and is inappropriate for visual-only fixes. Manual verification of the rendered overlay is sufficient.
- **Security**: Excluded. No attack surface, auth, user input, or dependencies involved. Pure CSS stacking fix.
- **Usability -- Strategy**: Excluded. This is a bug fix restoring existing intended functionality (the slider was designed to be draggable but broken by a CSS stacking issue). No journey or cognitive load changes.
- **Usability -- Design**: Excluded. No visual design changes -- the slider, line, and images look identical. Only pointer-event behavior is corrected.
- **Documentation**: Excluded. Bug fix restoring existing documented behavior. No API, architecture, or user-facing documentation changes needed.
- **Observability**: Excluded. No runtime components, services, or APIs affected. Client-side CSS only.

### Architecture Review Agents

This is a 3-property CSS bug fix restoring existing functionality. Phase 3.5 review runs if the calling session triggers it per its standard protocol. The synthesis does not skip it autonomously.

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**: none
- **Not selected**:
  - ux-design-minion: No visual changes; fix restores existing interaction without altering appearance
  - accessibility-minion: The slider already has correct ARIA attributes (role=slider, aria-label, aria-valuenow, keyboard handlers). This fix only unblocks pointer events.
  - sitespeed-minion: No runtime code, no web-facing pages affected beyond fixing an existing UI control
  - observability-minion: No runtime components or services
  - user-docs-minion: Bug fix, no user-facing documentation changes

### Decisions

None. The fix approach is uncontested -- `pointer-events: none` on the covering element is the standard CSS solution for this class of stacking/interaction bug.

### Risks and Mitigations

1. **clip-path + pointer-events interaction**: Setting `pointer-events: none` on the top image means clicks anywhere on the overlay go through to the container (which has `cursor: col-resize` but no click handler for repositioning). This is acceptable because the container's mousedown is not wired -- only the handle's is. If click-to-reposition is desired later, a separate click handler on the container would be needed regardless.

### Execution Order

```
Batch 1: Task 1 (frontend-minion)
```

Single task, no dependencies, no gates.

### Verification Steps

1. Open a diff comparison page with two captures that have screenshots
2. Switch to the "Overlay" tab
3. Confirm the slider handle can be grabbed and dragged left/right
4. Confirm the vertical line tracks the handle position
5. Confirm the top image clips correctly as the slider moves
6. Confirm keyboard navigation still works (Arrow Left/Right on focused handle)
