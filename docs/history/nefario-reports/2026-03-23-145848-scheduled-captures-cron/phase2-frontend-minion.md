# Domain Plan Contribution: frontend-minion

## Recommendations

### (1) Route: Dedicated `/schedules` route, not a settings tab

Schedules are a first-class domain concept -- they produce captures, have their own lifecycle (active/paused/errored), and will grow over time with history, execution logs, and linked capture results. Burying them in settings would conflate operational configuration (API keys, usage) with domain workflow (scheduling captures).

The existing router pattern is straightforward to extend. The `route()` function in `ui-shell.js` is a simple `if/else` chain matching hash paths. Adding `#/schedules` and `#/schedules/:id` follows the exact same pattern as `#/captures` and `#/captures/:id`.

The nav bar in `renderAppShell()` (ui-auth.js, line 136-222) builds nav links imperatively. Adding a "Schedules" link between "Captures" and "Settings" is a one-line addition. Like settings, schedules should only appear for session-authenticated users (`_authMethod === 'session'`), since API-key users can manage schedules via the API directly.

Route structure:
- `#/schedules` -- list all schedules with create form
- `#/schedules/:id` -- schedule detail view (execution history, linked captures, edit/delete)

### (2) Module structure: New `ui-schedules.js` file

Follow the established pattern exactly. Every view is a separate file exporting a JS string constant:

- `src/ui/ui-schedules.js` -- exports `SCHEDULES_JS`
- Imported in `ui-shell.js` and concatenated into the `<script>` block (same as `SETTINGS_JS`, `SUBMIT_VIEW_JS`, etc.)
- Follows the render/mount pattern: `renderSchedules()` builds the DOM skeleton, `mountSchedules()` wires events and fetches data
- For the detail view: `renderScheduleDetail(id)` + `mountScheduleDetail(id)`

The module should **not** need a separate CSS file. The existing design system components (`.card`, `.btn`, `.alert`, `.badge`, `.data-grid`, `.input`) plus a handful of schedule-specific CSS classes added to `ui-css.js` should be sufficient. Reuse the same list layout pattern from captures (grid columns with header row) for the schedule list.

If the schedule detail view becomes complex enough to warrant it, consider a separate `ui-schedule-detail.js` later. Start with both in one file -- YAGNI.

### (3) Cron expression input: Presets with optional raw edit

Cron expressions are hostile to casual users. A preset-first approach that degrades to raw input is the right balance:

**Primary input: Preset dropdown (a `<select>` element)**

Common intervals that cover 90%+ of use cases:
- Every hour (`0 * * * *`)
- Every 6 hours (`0 */6 * * *`)
- Every 12 hours (`0 */12 * * *`)
- Daily at midnight UTC (`0 0 * * *`)
- Weekly on Monday (`0 0 * * 1`)
- Monthly on the 1st (`0 0 1 * *`)
- Custom... (reveals the raw input)

**Secondary input: Raw cron string (text input)**

Shown only when "Custom..." is selected from the preset dropdown. Include a brief inline help text below the input: `"Standard cron syntax: minute hour day month weekday"`. Validate client-side before submission (5-field format, reasonable ranges).

**Do NOT build a visual cron picker widget.** A multi-field visual builder with day/time selectors is a significant UI engineering effort that adds complexity without proportional value at this stage. Presets + raw input covers the need. A visual builder can be a backlog item if user feedback demands it.

Human-readable summary: Show a computed description below the input in either mode (e.g., "Runs every 6 hours at :00"). Use a simple function that maps known presets to plain-English descriptions, with a basic cron-to-text formatter for custom expressions. Keep the formatter simple -- cover the common cases, fall back to showing the raw cron for complex expressions.

### (4) Schedule list display

The schedule list should follow the capture list's grid layout pattern (`.capture-header-row` + `.capture-item` grid) but with schedule-relevant columns:

**Desktop columns (4-column grid):**

| Column | Content | Notes |
|--------|---------|-------|
| URL | Target URL (truncated, links to schedule detail) | Same ellipsis overflow treatment as capture list |
| Frequency | Human-readable label ("Every 6 hours", "Daily at 00:00 UTC") | Derived from cron expression |
| Next run | Relative time ("in 2h") or absolute date | Helps user understand when next capture fires |
| Status | Badge: Active (green), Paused (neutral), Errored (red) | Uses existing `.badge--pass`, `.badge--skip`, `.badge--fail` |

**Mobile layout:** Stack to URL full-width on row 1, frequency + status on row 2 (same responsive pattern as captures).

**Empty state:** "No scheduled captures. Create one below to automatically capture URLs on a recurring basis." (mirrors the captures empty state copy style)

**Count line:** "Showing N of M schedules" (same pattern as captures)

**"N of limit" indicator:** Show the schedule limit in the header area (same as the API keys "3 of 5 keys" pattern in settings). This communicates the per-tenant limit without requiring the user to discover it by hitting the limit.

### Additional UI considerations

**Create schedule form:** Place it above the list, same as the capture submit form. Fields:
- URL input (reuse the same `.input` + validation as the capture form)
- Frequency select (presets + optional custom cron input)
- Submit button: "Create Schedule"
- Error display area (same `.alert--error` pattern)

**Schedule detail view (`#/schedules/:id`):**
- Back link to `#/schedules`
- Status banner (Active/Paused/Errored, same pattern as capture detail)
- Metadata card: URL, cron expression, human-readable frequency, created/updated timestamps, next run time, total executions count
- Linked captures section: list of recent captures produced by this schedule (link to `#/captures/:id`), with pagination
- Action buttons: Pause/Resume toggle, Edit (limited to frequency change), Delete (with inline confirmation, same pattern as key revocation)

**Pause/Resume:** A single toggle button that changes between "Pause" and "Resume" based on current state. Use the ghost button style (`btn--ghost`). Paused schedules show a neutral badge and the next run column shows "Paused" instead of a time.

**Delete:** Inline confirmation pattern identical to the key revocation flow in settings -- click "Delete" shows "Delete this schedule?" with Confirm/Cancel, Cancel gets default focus.

**Session-only gating:** Schedules require session auth (same as settings). The route handler should redirect to `#/captures` for API-key users, matching the settings gate pattern.

## Proposed Tasks

1. **Create `src/ui/ui-schedules.js`** -- New module exporting `SCHEDULES_JS` string constant. Implement `renderSchedules()` + `mountSchedules()` for the list/create view, and `renderScheduleDetail(id)` + `mountScheduleDetail(id)` for the detail view. Follow the exact same render/mount pattern as `ui-settings.js` and `ui-submit.js`. Use imperative DOM construction (no innerHTML with dynamic content).

2. **Extend the hash router in `ui-shell.js`** -- Add route matches for `#/schedules` and `#/schedules/:id` (same pattern as `#/captures/:id` with a schedule ID regex). Import `SCHEDULES_JS` and concatenate it into the script block.

3. **Add "Schedules" nav link in `renderAppShell()`** (in `ui-auth.js`) -- Insert between "Captures" and "Settings", gated behind `_authMethod === 'session'`.

4. **Add schedule-specific CSS to `ui-css.js`** -- Schedule list grid layout, create form styles, detail view styles. Reuse design system tokens and existing component classes (`.card`, `.badge`, `.btn`, `.input`, `.data-grid`, `.alert`) wherever possible. Estimate ~60-80 lines of new CSS.

5. **Implement cron preset select + custom input** -- Build the `<select>` with predefined cron presets, wire the "Custom..." option to reveal a raw cron text input. Add a human-readable description display that updates on selection change. Client-side validation for custom cron strings (5-field format, range checks).

6. **Implement schedule CRUD interactions** -- Wire create form to `POST /v1/schedules`, list fetch to `GET /v1/schedules`, detail fetch to `GET /v1/schedules/:id`, pause/resume to `PATCH /v1/schedules/:id`, delete to `DELETE /v1/schedules/:id`. Use `apiFetch()` for all requests (gets auth headers, CSRF, 401/429 handling for free). Show optimistic UI for create (prepend to list immediately).

7. **Implement linked captures section in schedule detail** -- Fetch captures filtered by schedule ID (`GET /v1/captures?scheduleId=:id`), render as a mini capture list with pagination. Each item links to `#/captures/:id`.

8. **Update `aria-current="page"` nav highlighting** -- The current nav highlighting logic (if any) needs to support the new `/schedules` route. Verify that the active nav link is visually indicated when on a schedules route.

## Risks and Concerns

1. **Module size growth** -- The SPA is a single inlined `<script>` block. Each new view module adds to the total JS payload. Schedules + schedule detail will add roughly 400-600 lines of JS. This is manageable now but the pattern does not scale indefinitely. No action needed yet, but worth noting as a future concern if more views are added.

2. **No code sharing between modules** -- Helpers like `formatDate()`, `relativeTime()`, `truncate()`, and `safeUrl()` are duplicated across `ui-submit.js`, `ui-settings.js`, and `ui-detail.js`. The schedules module will need these same helpers. Currently they are redeclared as module-local functions. Since everything runs in a single IIFE scope, the functions from earlier modules are actually available to later modules -- but this is a fragile implicit dependency on concatenation order. A shared `ui-helpers.js` module would be cleaner but is not strictly necessary for this phase.

3. **Cron validation fidelity** -- Client-side cron validation should be lightweight (regex format check + range validation), not a full cron parser. The server is the authority on whether a cron expression is valid. The UI validation catches obvious typos; the server rejects invalid semantics. Do not bring in a cron parsing library.

4. **Schedule ID format** -- The router needs a regex for schedule IDs (same as `CAPTURE_RE` for capture IDs). The API design needs to define the schedule ID format before the frontend can implement the route match. Assuming a pattern like `sch_[a-f0-9]{32}` to match the `cap_` convention.

5. **API-key user experience** -- Schedules are gated behind session auth in the UI, but the API itself should accept API key auth for schedule management. This means API-key users manage schedules via curl/scripts only. This is consistent with how settings work today. No UI change needed, but the API documentation should make this clear.

6. **Next run time calculation** -- Showing "next run" in the schedule list requires either the server to include `nextRunAt` in the schedule response, or the client to calculate it from the cron expression. Server-side is strongly preferred -- client-side cron next-run calculation requires a cron parser library, which violates the lightweight dependency principle.

## Additional Agents Needed

- **api-design-minion** -- Must define the schedule API contract before frontend work begins: schedule ID format, response shapes for list/detail/create/update/delete, the `scheduleId` filter parameter on the captures list endpoint, and whether `nextRunAt` is included in schedule responses.
- **test-minion** -- E2E tests for the schedule management flows: create, list, pause/resume, delete, and navigation between schedules and linked captures.
