# Meta-Plan: Diff Overlay Slider Fix

## Analysis

The diff overlay slider in `src/ui/ui-diff.js` is non-functional -- the slider handle cannot be grabbed or dragged. Root cause analysis from reading the code:

**The bug**: The `.diff-overlay-img--top` element is `position: absolute` and covers the entire container. It sits above the `.diff-overlay-slider` handle in the stacking context because neither the slider nor the line have `z-index` values. The top image intercepts all pointer events, preventing the handle from receiving `mousedown`/`touchstart`.

**Files involved**:
- `src/ui/ui-css.js` -- CSS definitions for `.diff-overlay-slider`, `.diff-overlay-line`, `.diff-overlay-img--top` (lines ~1963-2015)
- `src/ui/ui-diff.js` -- JS logic for `initOverlaySlider()` and DOM construction (lines ~254-498)

**Fix scope**: This is a CSS stacking/pointer-events bug. The fix requires:
1. Adding `pointer-events: none` to `.diff-overlay-img--top` (the image doesn't need click events)
2. Adding `z-index` to `.diff-overlay-slider` and `.diff-overlay-line` to ensure they render above the image
3. Ensuring `pointer-events: auto` on the slider handle (so it can be grabbed despite the parent potentially having different settings)

This is a small, single-file (or two-file) CSS fix with no architectural implications.

## Planning Consultations

Given the narrow scope of this bug (CSS stacking fix in two closely related files), specialist planning consultation adds minimal value. The fix is well-understood from code reading.

### Consultation 1: UX Strategy Journey Coherence
- **Agent**: ux-strategy-minion
- **Planning question**: The overlay slider is one of three screenshot comparison modes (side-by-side, overlay, diff). Is the current interaction pattern (drag handle to scrub) the right approach, or should we consider an alternative like hover-to-scrub or click-to-position that might be more discoverable? Are there any cognitive load concerns with the current hint text "Drag or use arrow keys to compare screenshots"?
- **Context to provide**: The three tab modes in `buildScreenshotSection()`, the overlay DOM structure, the `initOverlaySlider()` interaction model
- **Why this agent**: Ensures we fix the right interaction, not just the implementation. If the drag pattern itself is problematic, we should know before coding.

### Cross-Cutting Checklist

- **Testing**: EXCLUDE. This is a CSS-only fix (z-index and pointer-events). The project's test suite runs in workerd (Workers runtime) without a real browser -- CSS stacking bugs cannot be verified there. Visual verification is the appropriate validation method per project conventions (CLAUDE.local.md: "For UI-only changes, visual verification is sufficient").
- **Security**: EXCLUDE. No attack surface change. No user input handling. No auth. No dependencies. Pure CSS property changes.
- **Usability -- Strategy**: INCLUDE (Consultation 1 above). Even for a bug fix, confirming the interaction pattern is worth a quick check.
- **Usability -- Design**: EXCLUDE. No new UI components or visual changes. The slider already has correct visual design -- it just can't be reached through the stacking context.
- **Documentation**: EXCLUDE. This is a bug fix to an existing feature. No API surface change, no architectural change, no user-facing behavior change (the feature was broken, now it works as originally designed). Phase 8a documentation assessment will confirm.
- **Observability**: EXCLUDE. No runtime components, no services, no APIs affected. CSS-only change.

### Notable Exclusions

- **frontend-minion**: The fix is well-understood from code reading (CSS z-index/pointer-events). No React, no build tooling, no state management involved -- vanilla JS DOM manipulation. Including frontend-minion for planning a 3-line CSS fix would be over-engineering the process.
- **accessibility-minion**: The slider already has correct ARIA attributes (`role="slider"`, `aria-valuemin/max/now`, `aria-label`, keyboard handlers). The bug is that mouse/touch can't reach it, not an accessibility pattern issue.
- **debugger-minion**: Root cause is already identified from code reading. No logs to correlate, no stack traces, no profiling needed.

### Anticipated Approval Gates

None. This is a small, easily reversible CSS fix with zero downstream dependents. The fix approach (z-index + pointer-events) is standard practice for this class of bug. No gate is warranted.

### Rationale

This is a straightforward CSS stacking context bug. The only planning question worth asking is whether the interaction pattern itself (drag-to-scrub) is correct, which is ux-strategy-minion's domain. All other specialists would provide zero planning value for a 3-5 line CSS property fix.

The single consultation keeps the planning phase proportional to the task scope while still catching the one question that could change the fix approach: "is drag the right pattern?"

### Scope

**In scope**: Fix the overlay slider handle so it can be grabbed and dragged in the diff view's Overlay tab.

**Out of scope**: Redesigning the overlay interaction, changing the other screenshot comparison tabs, modifying the diff computation logic, adding new comparison modes.

### External Skill Integration

#### Discovered Skills

| Skill | Location | Classification | Domain | Recommendation |
|-------|----------|---------------|--------|----------------|
| ops-runbook | .claude/skills/ops-runbook/SKILL.md | LEAF | WRL operations | Not relevant to this task |

#### Precedence Decisions

No external skills are relevant to this CSS bug fix. No precedence decisions needed.

### Note: Evolution Log Numbering

Phase directory `docs/evolution/0100-diff-overlay-slider-fix/` already exists with `prompt.md`, but `docs/evolution/0100-honest-positioning/` also exists. This is a numbering collision that should be resolved during execution (renumber to the next available phase number).
