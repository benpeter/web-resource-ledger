## Domain Plan Contribution: ux-design-minion

### Recommendations

#### 1. Schedule Panel Placement and Navigation

The schedule management UI should live on its own route (`#/schedules`) with a corresponding nav link in the app shell. The nav link follows the exact same pattern as the existing "Captures" and "Settings" links: a `.nav-link` element with `aria-current="page"` applied by the router. Place it between "Captures" and "Settings" in the nav bar -- schedules are a capture-adjacent feature, not an account setting.

The Schedules route should only be available to session-authenticated users (same gate as Settings), since API-key-only users manage schedules via the API.

#### 2. Cron Expression Input: Constrained Preset Selector, Not a Freeform Field

**Do not expose a raw cron expression input.** Cron syntax is expert-level knowledge and virtually guarantees user errors. Instead, provide a constrained frequency selector using a `<select>` element with the `.input` class:

- **Every hour** (`0 * * * *`)
- **Every 6 hours** (`0 */6 * * *`)
- **Every 12 hours** (`0 */12 * * *`)
- **Daily** (`0 0 * * *`)
- **Weekly** (`0 0 * * 1`)

Each option maps to a fixed cron expression stored in the API. Display the human-readable label in the UI; the cron string is an implementation detail.

Below the select, show a **"Next capture" preview line** in `--text-sm` / `--color-text-muted` that computes the next execution time from the selected frequency. Example: "Next capture: Tomorrow at 00:00 UTC". This gives users confidence about what they selected without needing to understand cron. Use `font-variant-numeric: tabular-nums` for the time display so it doesn't shift width as values change.

If the API needs to support arbitrary cron expressions (for power users via the API), that is fine -- the UI simply does not need to expose the full range.

#### 3. Create Schedule Form

Follow the exact same form pattern as the capture submit form in `ui-submit.js`: a `<form>` with `noValidate`, inputs using the `.input` class, a `.btn--primary` submit button, and an error alert using `.alert.alert--error` with `role="alert"` and `aria-live="polite"`.

**Form fields:**

1. **URL** -- `<input type="url">` with `.input` class, same as the capture form. Label: "URL to capture". Placeholder: `https://example.com`.
2. **Frequency** -- `<select>` with `.input` class. Label: "Capture frequency". Options as listed above.
3. **Name** (optional) -- `<input type="text">` with `.input` class. Label: "Schedule name (optional)". Placeholder: `e.g. Homepage daily check`. Max length 64 (consistent with key name limit in settings).

**Layout:** Stack the fields vertically in a column layout, not inline. The capture submit form uses an inline row because it has exactly one field + button. Three fields warrant a stacked layout. Place the submit button ("Create Schedule") at the bottom as a full-width `.btn--primary` on mobile, inline-flex on desktop.

**Accessibility requirements:**
- Every input needs an explicit `<label>` with `for` attribute, not just `aria-label`. The capture URL input gets away with `aria-label` because it is the only field in a clearly labeled section, but a multi-field form requires visible labels.
- Use `<label>` elements with `.settings-create-label` class (already defined in the design system).
- The frequency `<select>` needs `aria-describedby` pointing to the "Next capture" preview text.
- Error messages linked via `aria-describedby` on the invalid input.
- Focus first invalid field on validation failure.

**Validation:**
- URL: same `safeUrl()` check as capture form.
- Frequency: required (pre-select "Daily" as default so users rarely hit this).
- On submit error (e.g., schedule limit reached): show inline `.alert--error` with actionable text: "Schedule limit reached (N of N). Delete an existing schedule to create a new one."

#### 4. Schedule List

Use the same list pattern as the captures list: a header row (`.capture-header-row` pattern) plus stacked item rows. Reuse the grid-based column layout but with columns appropriate for schedules.

**Column layout (desktop):**
```
grid-template-columns: 1fr 7rem 5rem 4rem;
```
| Column | Content | Class Pattern |
|--------|---------|---------------|
| URL | Truncated URL, links to schedule detail or latest capture | `.capture-url` pattern |
| Frequency | Human label: "Daily", "Weekly", etc. | `--text-sm`, `--color-text-muted` |
| Status | Badge showing active/paused/error | `.badge` pattern |
| Actions | Pause/resume toggle, delete button | `.btn--ghost.btn--sm` |

**Mobile layout (<640px):** Stack to 2-column grid like the capture items:
- Row 1: URL (full width, wrapping)
- Row 2: Frequency + Status badge (left-aligned) | Actions (right-aligned)

**Status badges -- reuse existing badge classes with new semantic variants:**

| Status | Badge Class | Label | When |
|--------|-------------|-------|------|
| Active | `.badge--pass` | "Active" | Schedule is running, last capture succeeded |
| Paused | `.badge--skip` | "Paused" | User paused the schedule |
| Error | `.badge--fail` | "Error" | Last capture failed (schedule still active) |

These map directly to the existing `badge--pass`, `badge--fail`, `badge--skip` classes. No new CSS needed for badges.

**Additional schedule metadata (shown on hover or in a detail view):**
- Last capture time (relative, like captures list)
- Next scheduled capture time
- Total captures from this schedule

**Empty state:** Follow the capture list empty state pattern (`.capture-empty` class): "No scheduled captures. Create one above to automatically capture pages on a recurring basis."

**Limit indicator:** Show "N of M schedules" in the same style as the API keys section header (`.settings-keys-count` pattern). This communicates the per-tenant limit without being in the way.

#### 5. Inline Actions: Pause/Resume and Delete

**Pause/Resume toggle:** A single `.btn--ghost.btn--sm` that toggles between "Pause" and "Resume" text. When clicked:
- Optimistically update the badge to reflect the new state.
- Call the API to update the schedule.
- On failure, revert the badge and announce the error via `aria-live`.

Do not use an icon-only toggle. Text buttons ("Pause" / "Resume") are unambiguous. Icon toggles for play/pause are ambiguous in a non-media context.

**Delete:** Follow the exact same inline confirmation pattern as the key revocation in `ui-settings.js`:
1. Click "Delete" button (`.btn--ghost.btn--sm`).
2. Button hides; inline confirmation area appears with "Delete this schedule?" text + "Confirm" (`.btn--primary.btn--sm`) + "Cancel" (`.btn--ghost.btn--sm`).
3. Focus moves to "Cancel" (safer action gets focus -- established pattern in the codebase).
4. On confirm: API call, remove row, update count, announce via `aria-live`.
5. On cancel: hide confirmation, restore Delete button, focus it.

This is identical to the revoke-key UX. Consistency here is more important than novelty.

#### 6. Status Indicators for Schedule Health

Beyond the per-row badge, add a **schedule health summary** at the top of the list section when any schedules are in error state. Use the existing `.alert--warning` component:

> "1 schedule has errors. Check the affected schedule for details."

This surfaces problems without requiring the user to scan every row. Only show when there are actual errors; do not show a success banner (that would be noise).

For schedules in error state, the row should also show a subtle inline note (same pattern as `.capture-timeout-note`): "Last capture failed: [brief reason]". This spans the full grid width below the main row content.

#### 7. Design Tokens -- No New Tokens Needed

The existing design system covers all visual needs for the schedule panel:

- **Colors:** `--color-success` / `--color-error` / `--color-warning` for status states, `--color-surface-muted` for backgrounds, `--color-text-muted` for secondary text, `--color-accent` for links.
- **Typography:** `--text-sm` for metadata, `--text-xs` for labels, `--text-base` for content, `font-variant-numeric: tabular-nums` for numeric displays.
- **Spacing:** `--space-2` through `--space-8` for all layout needs.
- **Shape:** `--radius-md` for inputs and cards, `--radius-sm` for badges.

Do not introduce new tokens. The schedule UI is a variation on existing patterns (list + form + inline actions), not a new visual concept.

#### 8. CSS Additions

The following new CSS classes are needed, added to `ui-css.js`. Keep them minimal and follow existing naming conventions:

```css
/* Schedule list section */
.schedules-heading { /* reuse .captures-heading */ }

.schedule-form-section { margin-bottom: var(--space-8); }

.schedule-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.schedule-form-label {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  color: var(--color-text-muted);
}

.schedule-form-preview {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}

.schedule-form-actions {
  display: flex;
  gap: var(--space-3);
  align-items: center;
}

/* Schedule list items -- follow capture item grid pattern */
.schedule-header-row,
.schedule-item {
  display: grid;
  grid-template-columns: 1fr 7rem 5rem 4rem;
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-3) var(--space-4);
}

.schedule-header-row {
  background: var(--color-surface-muted);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md) var(--radius-md) 0 0;
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
}

.schedule-item {
  color: var(--color-text);
  border-bottom: 1px solid var(--color-border-subtle);
  background: var(--color-surface);
  transition: background 0.1s;
}

.schedule-item:hover {
  background: var(--color-surface-muted);
}

.schedule-item:last-child {
  border-bottom: none;
}

.schedule-frequency {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  white-space: nowrap;
}

.schedule-actions {
  display: flex;
  gap: var(--space-1);
  align-items: center;
}

.schedule-error-note {
  grid-column: 1 / -1;
  font-size: var(--text-xs);
  color: var(--color-error-text);
  background: var(--color-error-bg);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  margin-top: var(--space-1);
}

/* Mobile: stacked layout */
@media (max-width: 640px) {
  .schedule-header-row {
    display: none;
  }

  .schedule-item {
    grid-template-columns: 1fr auto;
    grid-template-rows: auto auto;
    row-gap: var(--space-1);
    padding: var(--space-3);
  }

  .schedule-item .capture-url {
    grid-column: 1 / -1;
    white-space: normal;
    word-break: break-all;
  }

  .schedule-frequency {
    grid-row: 2;
    grid-column: 1;
  }

  .schedule-actions {
    grid-row: 2;
    grid-column: 2;
    justify-self: end;
  }

  .schedule-form-actions {
    flex-direction: column;
  }

  .schedule-form-actions .btn {
    width: 100%;
  }
}
```

#### 9. Interaction Patterns

**Loading state:** When the schedule list is loading, show the same `view-placeholder` text pattern: "Loading schedules...". Do not use a skeleton screen -- the existing codebase uses text placeholders, not skeletons. Consistency with the captures and settings views is more important than a "better" loading pattern.

**Optimistic UI for pause/resume:** Update the badge immediately on click, then revert on API failure. This matches the captures list pattern where pending items are prepended optimistically.

**Form submission:** Disable the submit button and change text to "Creating..." during the API call (same as key creation and capture submission patterns). On success, prepend the new schedule to the list and reset the form. On error, show the inline error alert.

**Polling:** Schedules do not need real-time polling like individual captures do. The list shows the most recently known state. A manual "Refresh" link in the section header (similar to the usage refresh button in settings) is sufficient for users who want to see updated status.

#### 10. Linking Captures to Schedules

When viewing the captures list, captures triggered by a schedule should show a subtle visual association. Add a small text label below the URL in the capture item: "via [Schedule Name]" in `--text-xs` / `--color-text-muted`. This uses the same grid-column span pattern as `.capture-timeout-note`. It should be non-intrusive -- users who do not use schedules see no change.

On the capture detail view, add a "Schedule" row to the data grid (same as the existing metadata rows) linking to the originating schedule.

#### 11. Accessibility Checklist for Implementation

- **Heading hierarchy:** h1 "Schedules" (page heading), h2 section headings if needed.
- **Landmark regions:** `<section aria-label="Create new schedule">` for form, `<section aria-label="Schedules list">` for list.
- **Focus management:** Focus h1 on route navigation (existing pattern). Focus first invalid field on validation error. Focus "Cancel" in delete confirmation (existing pattern).
- **Keyboard navigation:** All interactive elements reachable via Tab. Delete confirmation dismissable via Escape (add keydown handler). Select dropdown navigable via arrow keys (native behavior).
- **Screen reader announcements:** `aria-live="polite"` region for: schedule created, schedule deleted, schedule paused/resumed, errors. Follow the `announce()` / `settingsAnnounce()` pattern.
- **Status communication:** Badge text provides status to screen readers (no icon-only status). Error notes are visible text, not color-only indicators.
- **Touch targets:** All buttons meet 44x44px minimum (`.btn` already has `min-height: 44px`). The `.btn--sm` variant at 36px height is acceptable for inline actions within rows since it has sufficient horizontal padding and spacing.
- **Reduced motion:** The existing `@media (prefers-reduced-motion: reduce)` rule in the design system CSS already handles transitions globally. No additional motion is introduced.

### Proposed Tasks

1. **Add `#/schedules` route and nav link** -- Update `ui-shell.js` router to handle `#/schedules`, update `ui-auth.js` to add the nav link (session-only, between Captures and Settings). Add `aria-current="page"` handling.

2. **Create `ui-schedules.js` module** -- New file following `ui-settings.js` structure: `renderSchedules()` builds DOM skeleton, `mountSchedules()` fetches data and wires events. Export as `SCHEDULES_JS` string constant. Import in `ui-shell.js`.

3. **Implement create schedule form** -- Three-field form (URL, frequency select, optional name). Frequency select with preset options. "Next capture" preview line. Client-side validation. Submit handler with optimistic prepend.

4. **Implement schedule list with grid layout** -- Header row + item rows following capture list pattern. Status badges. Frequency labels. Empty state. Limit indicator. Mobile responsive stacking.

5. **Implement inline pause/resume and delete actions** -- Pause/resume toggle with optimistic badge update. Delete with inline confirmation (revoke-key pattern). `aria-live` announcements for all state changes.

6. **Add schedule CSS to `ui-css.js`** -- New CSS classes as specified above. No changes to `design-system.css`.

7. **Add schedule-to-capture association display** -- "via [Schedule Name]" label on capture list items. "Schedule" row on capture detail data grid. Both sourced from API response data.

### Risks and Concerns

1. **Cron preset limitations:** The constrained preset approach trades flexibility for usability. If power users need arbitrary cron expressions (e.g., "every Tuesday and Thursday at 14:00"), they must use the API directly. This is an acceptable tradeoff for an MVP -- the UI can be extended later with a "Custom" option that reveals a more complex input, but do not build that now (YAGNI).

2. **Schedule limit UX:** The per-tenant schedule limit needs to be communicated clearly. If the user hits the limit, the create form should show the error inline (not a modal or toast). The limit count in the section header provides passive awareness. Ensure the API returns a clear error message when the limit is reached, including the current and maximum counts.

3. **Error state ambiguity:** A schedule can be "active" but its most recent capture failed. The badge says "Error" but the schedule is still running. The inline error note must clarify: "Last capture failed: [reason]. Next attempt: [time]." Without this, users may think the schedule has stopped.

4. **nav bar width on mobile:** Adding a third nav link ("Schedules") makes the nav bar wider. At 420px and below, the nav already stacks vertically (`flex-direction: column`), so this should be fine. Verify the 420-600px range does not cause awkward wrapping -- three short words ("Captures", "Schedules", "Settings") should fit in a single row with `gap: var(--space-4)` up to about 360px. If it does not, the existing vertical stack breakpoint at 420px handles it.

5. **Module size in inline script:** The `ui-shell.js` bundles all view JS into a single inline `<script>`. Adding `ui-schedules.js` increases the payload. The existing modules total roughly 35-40KB of JS text. A schedules module of similar complexity to settings (~400 lines) adds maybe 8-10KB. This is acceptable for now but worth monitoring -- if the total inline script exceeds ~80KB, consider code-splitting (out of scope for this phase).

### Additional Agents Needed

- **frontend-minion:** To implement the `ui-schedules.js` module, CSS additions, and router changes. The implementation must follow the exact DOM-construction patterns in `ui-settings.js` and `ui-submit.js` (no `innerHTML` with user data, explicit `createElement` calls, proper event delegation).

- **accessibility-minion:** After implementation, to audit the schedule panel with screen reader testing (VoiceOver), keyboard navigation testing, and contrast verification of new badge/status combinations. The design specifies accessible patterns, but implementation details (focus trapping in delete confirmation, `aria-live` timing, select element labeling) need validation with assistive technology.
