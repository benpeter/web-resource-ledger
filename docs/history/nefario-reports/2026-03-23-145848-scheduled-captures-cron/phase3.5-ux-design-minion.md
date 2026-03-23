# UX Design Review: Task 4 (Web UI Schedule Panel)

**Verdict: ADVISE**

Task 4 is well-structured and aligns with the design system in most respects. The issues below are advisories -- none are blockers, but two are significant enough that the frontend-minion should address them before the panel ships.

---

## What is correct

**Badge reuse.** The plan correctly maps schedule states to existing badge classes (`badge--pass`, `badge--fail`, `badge--skip`) from `design-system.css`. The mapping is semantically sound: active=pass, error=fail, paused=skip.

**Grid pattern alignment.** The instruction to follow the EXACT same grid pattern as `.capture-header-row` / `.capture-item` is explicit and correct. The column template `1fr 7rem 7rem 5rem 6rem` is a reasonable extension of the existing `1fr 6rem 6rem` captures grid.

**Alert and error display.** Using `.alert.alert--error` with `role="alert"` and `aria-live="polite"` matches the existing pattern and is correct for inline validation feedback.

**Form component tokens.** All referenced classes (`.input`, `.btn--primary`, `.btn--ghost`, `.btn--sm`) exist in the design system with correct token backing.

**Delete confirmation pattern.** Replicating the key revocation confirmation from `ui-settings.js` exactly is the right call -- it preserves learned patterns and focus management.

**Limit indicator.** "N of M schedules" follows the `settings-keys-count` pattern.

**Mobile responsive.** The instruction to hide the header row and stack to a 2-row layout at `<640px` matches what the captures list already does. Consistent.

**`prefers-reduced-motion`.** The existing `ui-css.js` already applies `transition-duration: 0.01ms` globally via the media query block. New CSS additions will inherit this automatically -- no extra work needed.

---

## Issues to address

### 1. The frequency `<select>` must use `.input` class but is a `<select>`, not `<input>` -- verify rendering

**Severity: significant.**

The design system defines `.input` on `display: block; width: 100%` with border/background/focus styles. The plan tells the frontend-minion to apply `.input` to the frequency `<select>`. This is correct usage -- the `.input` class works on `<select>` elements. However, the plan also says:

> "Custom... (reveals a text input for raw cron expression)"

The custom cron text input must also receive `.input` and must have an explicit `<label>` (not just a placeholder). The plan's layout description does not specify a label for the custom cron field. The frontend-minion must be explicit: the revealed custom input needs a visible label ("Custom cron expression") or at minimum a `<label>` with `class="sr-only"` so screen readers can announce it. Placeholder text alone fails WCAG 1.3.1.

**Recommendation:** Add to the Task 4 prompt: "The custom cron text input revealed by 'Custom...' selection must have an explicit associated `<label>` (visible or `.sr-only`). Placeholder text alone is not sufficient."

### 2. `aria-live="polite"` on the error area is correct, but success announcements need their own region

**Severity: significant.**

The plan defines an error display area with `aria-live="polite"`. On success (schedule created, deleted, pause toggled), the plan says "announce via aria-live" but does not specify where that announcement goes. If the same error region is repurposed for success messages, it works, but mixing error and success in one region makes the semantics ambiguous.

The existing `ui-submit.js` should be checked for its announcement pattern. The plan should tell the frontend-minion to either:
- Reuse the same `aria-live` region for transient status messages (success and error), clearing it between states, OR
- Add a separate `role="status"` region for success announcements

Either is acceptable -- the gap is that the plan is silent on this and leaves it to the implementer's judgment. Given the "imperative DOM only" constraint, the simpler path is: one `role="status" aria-live="polite"` region per form, used for both success and error feedback (with appropriate visual styling for each state).

**Recommendation:** Clarify which region carries success announcements. One region per form section, used for both outcomes, is sufficient.

### 3. "Next capture" preview line -- no token specified, risks hardcoded style

**Severity: minor.**

The plan introduces `.schedule-form-preview` with the description "small, muted, tabular-nums" but does not specify which tokens back these values. The frontend-minion must use `var(--text-sm)` for size, `var(--color-text-muted)` for color, and `font-variant-numeric: tabular-nums` (not a token -- this is a CSS property, acceptable). The `ui-css.js` file header explicitly states "Uses design system tokens exclusively -- no hardcoded hex values." The plan's vague description creates room for the implementer to infer values rather than use tokens.

**Recommendation:** The plan should specify: `.schedule-form-preview { font-size: var(--text-sm); color: var(--color-text-muted); font-variant-numeric: tabular-nums; }` to prevent token drift.

### 4. Optimistic badge update on pause/resume -- revert logic needs focus restoration

**Severity: minor.**

The plan says "Optimistic badge update. PATCH to `/v1/schedules/:id`. Revert on API failure." On revert, if focus was on the pause/resume button, it may be lost or misplaced (the button's text changed, the badge reverted). The plan should instruct the frontend-minion to keep a reference to the button element and restore focus to it after revert, matching the same pattern as the delete cancel path.

### 5. `<section aria-label="...">` wrapping -- verify heading hierarchy

**Severity: minor.**

The layout uses `<h1>Schedules</h1>` as the page heading and two `<section aria-label="...">` containers. Within the schedule list section, there is no sub-heading specified. The `<section>` label provides an accessible name for the region, which is correct. No heading is needed inside these sections given the `aria-label`, but the frontend-minion should not introduce an `<h2>` or similar unless the plan explicitly calls for it -- the capture list view sets the precedent of no sub-headings within sections.

---

## Summary

The plan is solid. The two significant issues (custom cron field label, success announcement region) should be resolved before implementation begins, as they affect accessibility compliance directly. The minor issues can be addressed during implementation if the frontend-minion is briefed on them. No design system tokens are being introduced unnecessarily, no hardcoded colors are called for, and the structural patterns (grid, badges, forms, confirmation) all map to existing system components.
