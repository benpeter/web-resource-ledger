MODE: SYNTHESIS

You are synthesizing a delegation plan for a CSS bug fix.

## Original Task
<github-issue>
## Problem

In the diff Overlay mode, the slider handle cannot be grabbed or dragged, making the overlay comparison unusable.

## Expected

The overlay slider handle should be draggable so users can scrub between the two capture states.
</github-issue>

## Meta-Plan Analysis (no specialist contributions — team was 0 agents)

Read the meta-plan from: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-aC8jkU/diff-overlay-slider-fix/phase1-metaplan.md

Key findings from meta-plan:
- Root cause: `.diff-overlay-img--top` is `position: absolute` covering the entire container, sitting above `.diff-overlay-slider` handle in the stacking context. Neither has z-index. The top image intercepts all pointer events.
- Fix: Add `pointer-events: none` to `.diff-overlay-img--top`, `z-index` to `.diff-overlay-slider` and `.diff-overlay-line`, `pointer-events: auto` on handle
- Files: `src/ui/ui-css.js` (CSS definitions) and `src/ui/ui-diff.js` (slider DOM + interaction logic)
- This is a 3-5 line CSS fix

## External Skills Context
No external skills detected relevant to this task.

## Instructions
1. Review the meta-plan analysis
2. Create a single-task execution plan for this CSS fix
3. The fix agent should be frontend-minion (CSS expertise)
4. Model: sonnet (execution task, well-understood fix)
5. Mode: bypassPermissions (CSS-only changes, low risk)
6. No approval gates needed (small, easily reversible)
7. Ensure the task prompt is complete and self-contained
8. Write your complete delegation plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-aC8jkU/diff-overlay-slider-fix/phase3-synthesis.md`
