# Accessibility Review: Task 4 — Web UI Schedule Panel

**Verdict: ADVISE**

The plan is structurally sound and inherits several good patterns from `ui-settings.js`. It does not have blocking accessibility failures that would prevent shipping, but it has specific gaps that the implementing agent must address during Task 4 execution. These are not blocking because they are addressable within the task scope without architecture changes.

---

## What the plan gets right

The existing codebase (`ui-settings.js`) establishes patterns that Task 4 is explicitly instructed to follow, and those patterns are accessible. Specifically:

- `aria-live="polite"` + `aria-atomic="true"` sr-only region for announcements (the `settingsAnnounce` pattern) — plan calls for the same
- Error display with `role="alert"` and `aria-live="polite"` on the create form error container
- Inline delete confirmation: focus moves to Cancel (safer action) on trigger, returns to Delete on cancel — correct keyboard focus management
- `<section aria-label="...">` landmarks for both the create form section and the list section
- `<label for="id">` association for form inputs

---

## Issues requiring attention during implementation

### 1. "Schedule name (optional)" label — required field handling (WCAG 2.2 SC 3.3.2, Level A)

The plan describes the name field as `label "Schedule name (optional)"` but the API task (Task 2) marks `name` as **required** in the POST body (missing name returns 400). The label must not say "optional" if the field is required. Use `"Schedule name"` with no qualifier, and do not suppress the required indicator. If name truly is optional for MVP, the API validation must match — but the plan description at line 459 says `max 128 chars` not `optional`, suggesting the "optional" label text may be a planning error. The implementing agent must reconcile this against the actual API behavior.

If name is required: label it `"Schedule name"` with `aria-required="true"` on the input.
If name is optional: ensure the POST body sends `name` as empty string or omits it, and the API accepts that.

### 2. Custom cron input — accessible name when revealed (WCAG 2.2 SC 1.3.1, Level A)

The "Custom..." select option reveals a text input for raw cron expression. The plan does not specify a label for this revealed input. A `<label>` element must be associated with it before it is shown, even if visually hidden until that point. Do not rely on `placeholder` alone. Implement as:

```js
var customCronLabel = document.createElement('label');
customCronLabel.htmlFor = 'schedule-cron-custom';
customCronLabel.textContent = 'Custom cron expression';
customCronLabel.className = 'sr-only'; // visible label preferred; sr-only acceptable if space is constrained

var customCronInput = document.createElement('input');
customCronInput.type = 'text';
customCronInput.id = 'schedule-cron-custom';
customCronInput.className = 'input';
customCronInput.setAttribute('aria-describedby', 'schedule-cron-hint');
// keep hidden until "Custom..." is selected
customCronInput.style.display = 'none';
customCronLabel.style.display = 'none';
```

Also add a hint element (referenced by `aria-describedby`) explaining the expected format: `"5-field cron expression, e.g. 0 8 * * 1-5. Minimum interval: 1 hour."` This satisfies WCAG SC 3.3.2 (Labels or Instructions).

### 3. Status badges — text alternatives for color-coded meaning (WCAG 2.2 SC 1.4.1, Level A)

The plan specifies `.badge--pass` for "Active", `.badge--fail` for "Error", `.badge--skip` for "Paused". The text content ("Active", "Error", "Paused") is sufficient as a text alternative — color is not the sole conveyance of meaning. This is acceptable IF the badge text is always present in the DOM. The implementing agent must confirm that badge class names are supplemented by visible text strings, never left as empty CSS-styled elements.

The planned `CRON_LABELS` mapping for human-readable frequency in the list is good — raw cron strings alone would be unusable for non-technical users and harder to parse for screen readers. The fallback to raw cron string for custom expressions is acceptable but the implementing agent should wrap it in a `<code>` element with an appropriate `aria-label` if it cannot be mapped: `<code aria-label="Custom cron schedule: 0 8 * * 1-5">0 8 * * 1-5</code>`.

### 4. "Next capture" preview — must not convey information only through dynamic text without announcement (WCAG 2.2 SC 4.1.3, Level AA)

The plan calls for a "Next capture" preview line updated on frequency select change. This is not an action result but a live preview, so it should use `aria-live="polite"` on the container element. Without it, screen reader users changing the frequency select will not hear the updated preview.

```js
var previewEl = document.createElement('p');
previewEl.className = 'schedule-form-preview';
previewEl.id = 'schedule-cron-preview';
previewEl.setAttribute('aria-live', 'polite');
previewEl.setAttribute('aria-atomic', 'true');
```

### 5. Pause/Resume button — announce state change (WCAG 2.2 SC 4.1.3, Level AA)

The plan calls for an "optimistic badge update" on pause/resume but does not specify an announcement. The `settingsAnnounce` equivalent (or a schedules-specific live region) must fire after the optimistic update: `"Schedule paused."` / `"Schedule resumed."`. On API failure and revert: `"Could not pause schedule. Please try again."`. The live region approach from `ui-settings.js` must be replicated for the schedules module.

### 6. Delete confirmation — accessible name for confirmation group (existing pattern is correct; verify it carries through)

The `ui-settings.js` pattern for the revoke confirmation sets `role="group"` and `aria-label="Confirm key revocation"` on the confirmation area. The plan must use a specific label for the delete case: `aria-label="Confirm schedule deletion"`. The existing pattern is correct — the implementing agent must not omit the `role` and `aria-label` when adapting the pattern.

### 7. Schedule list — accessible table semantics or alternative (WCAG 2.2 SC 1.3.1, Level A)

The plan specifies a grid layout with header row (`.schedule-header-row`) and item rows (`.schedule-item`) with columns: URL / Frequency / Next Run / Status / Actions. This is tabular data. Using `<div>` grid without ARIA table semantics means the column headers are not programmatically associated with data cells.

Two acceptable approaches:

**Option A (preferred for consistency with existing capture list):** If the existing capture list in `ui-submit.js` uses the same div-grid pattern without table semantics, maintain that pattern and add `aria-label` to each data cell that includes its column name: e.g., `<div class="schedule-cell" aria-label="URL: example.com/page">`. This avoids the implementation overhead of full table semantics while giving screen reader users the context.

**Option B:** Use `<table>`, `<thead>`, `<th scope="col">`, `<tbody>`, `<tr>`, `<td>`. More robust but higher implementation effort.

Before implementing, the agent should check the existing `.capture-header-row` / `.capture-item` pattern in `ui-css.js` and `ui-submit.js`. If those use div-grid without table semantics, Option A is the pragmatic choice to maintain consistency. If they use table elements, match that.

### 8. `aria-current="page"` for the Schedules nav link (already called out in plan, must be implemented correctly)

The plan mentions `aria-current="page"` handling for the new route. This must be set to `"page"` (string literal, not boolean) on the active nav link, and removed or set to `"false"` on all other nav links when the route changes. The existing nav pattern in `ui-auth.js` handles this — the implementing agent must apply the same logic to the Schedules link.

---

## Non-issues (no action needed)

- `role="alert"` on the error display area — correct
- `aria-live="polite"` on the error container alongside `role="alert"` — the plan specifies both; the existing pattern uses both; this is acceptable
- Focus management on delete: Cancel gets focus on trigger, Delete gets focus on cancel — correct WCAG 2.4.3 pattern
- `<h1>` heading for the view — correct document structure
- The `noValidate` pattern (disable native browser validation, handle errors explicitly) — correct for custom error messaging

---

## Summary for implementing agent

The accessibility baseline is solid because the plan inherits from `ui-settings.js`. The five items that need active attention during implementation:

1. Clarify whether `name` is required or optional; label accordingly with `aria-required`
2. Associate a `<label>` with the custom cron input before it is shown
3. Add `aria-describedby` hint for the custom cron input format
4. Add `aria-live="polite"` to the "Next capture" preview element
5. Announce pause/resume and delete outcomes via the schedules live region

None of these require architectural changes. All are achievable within Task 4's scope.
