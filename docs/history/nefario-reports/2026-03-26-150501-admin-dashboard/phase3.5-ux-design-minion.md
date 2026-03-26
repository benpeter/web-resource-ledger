## UX Design Review — Admin Dashboard

**Verdict: ADVISE**

The plan is structurally sound and the accessibility requirements are well-specified. The issues below are not blockers, but two of them will cause real friction in production and should be addressed before implementation begins.

---

### Issue 1: Table `.table` class is missing `aria-sort` support in the design system (advisory)

The existing `.table` CSS in `design-system.css` has no styles for `[aria-sort]` on `th` elements or for `th button` sort affordances. The plan correctly specifies `<button>` inside `<th>` with `aria-sort`, but without corresponding visual styling the sort state will be invisible.

The `admin-css.js` task includes `.admin-table th button` as a class to define, but the spec only says "inherits font, no border, pointer cursor." That is insufficient — sort direction must be visually indicated (ascending/descending arrow indicator). A button with no visible affordance that merely changes `aria-sort` communicates state only to screen readers, not sighted users.

**Required addition to `admin-css.js` spec:** The `.admin-table th button[aria-sort]` style must include a visual sort indicator (e.g., `::after` pseudo-element with content "↑"/"↓", or a background-image SVG arrow). The active sorted column header also needs a visual distinction from non-sorted headers (e.g., `color: var(--color-primary)` on the active `th`).

---

### Issue 2: Stat cards lack visual hierarchy at the `.admin-stats-row` level (advisory)

The four-column `.admin-stats-row` with `repeat(4, 1fr)` is correct for desktop. The plan says "mirrors the billing-stat pattern," which is a centered text, bold value, muted label pattern. That pattern works.

However, the spec provides no minimum width or wrapping behavior for the grid. At viewport widths between 640–1000px (tablet and small laptop), four equal columns at 1100px max-width will produce very narrow stat cells — the bold numeric value may wrap or be truncated. The plan explicitly opts out of mobile-specific responsive design ("just ensure overflow-x: auto on tables"), but the stat cards are not a table and will not benefit from that.

**Required addition to `admin-css.js` spec:** Add `grid-template-columns: repeat(auto-fit, minmax(200px, 1fr))` in place of `repeat(4, 1fr)`, or add a media query wrapping to 2×2 at medium widths. This prevents layout breakage without adding mobile-specific complexity.

---

### Issue 3: `.table` component missing focus state for row interactivity (minor advisory)

The plan specifies `cursor: pointer` on `.admin-table tr` for clickable rows. However, the rows navigate to the detail view. If the implementation makes `<tr>` itself clickable (via `click` event on the row), that is a keyboard accessibility gap — `<tr>` is not a focusable or operable element.

The plan also specifies the Tenant ID cell as an `<a href="#/tenants/${id}">` link. If the row click is additive (clicking anywhere in the row navigates), that is acceptable as a progressive enhancement — the link in the Tenant ID cell is the keyboard-reachable path. The `cursor: pointer` on `<tr>` is purely visual sugar.

**Recommendation:** Confirm in the Task 3 prompt that `cursor: pointer` on `<tr>` is purely cosmetic and that all keyboard navigation goes through the `<a>` in the Tenant ID cell. No duplicate `tabindex` or `role="button"` should be added to `<tr>`. This is fine as planned but worth making explicit to avoid the frontend-minion reaching for a `role="row"` or `tabindex="0"` on `<tr>`.

---

### Confirmed correct

- Semantic table structure (`<table>`, `<thead>`, `<tbody>`, `<th scope="col">`, `aria-label`) is fully specified and correct.
- `aria-live="polite"` region for sort changes and refresh confirmation is present and appropriate.
- Login form with proper `<label>` and no paste-disable is correct.
- Focus management on view navigation (`tabIndex=-1` + `.focus()` on h1) is the right pattern.
- Error alerts with `role="alert"` are specified.
- `role="alert"` on error messages provides immediate announcement — correct for errors, not for routine state updates.
- `<button>` inside `<th>` (not `<th onclick>`) is the correct ARIA pattern for sortable columns.
- Design system tokens are used exclusively in `admin-css.js` — no hardcoded values.
- The 44px minimum height on `.btn` in the existing design system already covers the submit button in the login form.
