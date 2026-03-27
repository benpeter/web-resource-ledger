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

## When Done
Report the file paths with change scope and line counts, and a 1-2 sentence summary of what was produced.
