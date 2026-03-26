## Domain Plan Contribution: ux-design-minion

### Recommendations

#### 1. Information Hierarchy: Three-Level Drill-Down

The admin dashboard should present information at three levels of granularity, using progressive disclosure to avoid cognitive overload:

**Level 1 -- Aggregate Overview (landing state)**
A row of 3-4 stat cards at the top, providing at-a-glance operational awareness. These follow the exact pattern already established by `billing-stats-row` / `billing-stat` in the billing view:

- **Total tenants** (count)
- **Active tenants this period** (tenants with captureCount > 0)
- **Total captures this period** (sum across all tenants)
- **Total storage** (sum of storageBytes, formatted as human-readable)

Use the existing `billing-stat-value` (--text-xl, --weight-bold) for the number and `billing-stat-label` (--text-xs, --color-text-muted) for the descriptor. This is a proven pattern in the codebase -- reuse, don't reinvent.

**Level 2 -- Tenant Table (primary content)**
Below the stats, a sortable table of all tenants. This is the core view the operator will spend time in.

**Level 3 -- Tenant Detail (drill-down)**
Clicking a tenant row navigates to a per-tenant detail view showing full usage history, key listing, and configuration. This uses the existing hash-router pattern (`#/admin/tenants/:tenantId`).

#### 2. Tenant Table Design

Use the existing `.table` component from `design-system.css` as the foundation. The table should:

**Columns:**
| Column | Content | Alignment | Notes |
|--------|---------|-----------|-------|
| Tenant ID | `text-mono` | left | Primary identifier, clickable link to detail view |
| Status | Badge | left | Active / Inactive badge using existing `.badge` variants |
| Captures (period) | Number | right | Current period capture count, `font-variant-numeric: tabular-nums` |
| Storage | Formatted bytes | right | Human-readable (KB/MB/GB) |
| API Keys | Count | right | Number of active (non-revoked) keys |
| Created | Relative date | right | "3 days ago" or "Mar 15, 2026" |

**Visual treatment:**
- Use existing `.table th` styling (surface-muted background, uppercase xs text, letter-spacing)
- Use existing `.table td` styling (space-3 padding, border-subtle bottom borders)
- Add `cursor: pointer` on rows to indicate clickability
- Hover state: `background: var(--color-surface-muted)` -- same hover pattern as `.capture-item`
- Focus-visible: `outline: 2px solid var(--color-primary); outline-offset: -2px` -- same as `.capture-item`
- Numeric columns should use `font-variant-numeric: tabular-nums` for alignment (already used in `.usage-metric-value`)

**Sorting interaction:**
- Column headers become buttons with a sort indicator (ascending/descending arrow using text characters, not icons)
- Active sort column uses `--weight-bold` instead of `--weight-medium`
- Default sort: Captures (period), descending -- the operator most likely wants to see high-usage tenants first
- Sort is client-side since tenant counts will be small (hundreds, not thousands)

**Empty state:**
If no tenants exist, show a centered message using the existing `.capture-empty` pattern: `"No tenants found."` in `--color-text-muted`.

#### 3. Stat Cards Pattern

Reuse the `billing-stats-row` grid pattern exactly. For 4 stats, change `grid-template-columns` to `repeat(4, 1fr)`. Each card uses:

```
.admin-stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-4);
  margin-bottom: var(--space-6);
}
```

Each stat cell uses the same structure as `buildStatCell` in `ui-billing.js`:
- `.admin-stat` container (text-align: center)
- `.admin-stat-value` (--text-xl, --weight-bold, --color-text)
- `.admin-stat-label` (--text-xs, --color-text-muted, margin-top: --space-1)

No card borders or backgrounds on individual stat cells. The stats are visually grouped by their grid proximity, not by card containers. This matches the billing view's approach.

#### 4. View Container Width

The current `.view-container` is `max-width: 860px`. For a data-dense admin table with 6 columns, this is tight but workable if:
- Tenant ID is truncated with ellipsis at ~12ch for long IDs (most IDs are short like `acme`, `demo`)
- Storage and date columns are compact
- The table itself gets `width: 100%` within the container

Do NOT increase the view container max-width globally. If the admin view needs more room, scope it:

```css
.view-container--admin {
  max-width: 1100px;
}
```

This keeps the narrow, focused layout for tenant-facing views while giving the operator more room. Apply this class only when the admin route is active.

#### 5. Tenant Detail View (Drill-Down)

When clicking a tenant row, navigate to `#/admin/tenants/:tenantId`. This view shows:

**A. Back navigation** -- Reuse the `buildBackLink()` pattern from `ui-detail.js`: a simple text link "Back to tenants" at the top.

**B. Tenant header** -- Tenant ID displayed as an h1 using the existing `.captures-heading` style (--text-2xl, --weight-bold). Below it, a badge showing status.

**C. Current period usage card** -- A `.settings-section.card` containing:
- Period heading (using `formatPeriod` pattern from billing)
- Usage metrics using the existing `.usage-metric` / `.usage-bar` pattern:
  - Captures: count vs. free tier limit (200), shown as a progress bar
  - Storage: bytes used
  - API calls: count
  - eIDAS captures: count (if > 0)

**D. Usage history section** -- A compact table showing period-over-period data:
| Period | Captures | Storage | API Calls | eIDAS |
|--------|----------|---------|-----------|-------|
| 2026-03 | 1,247 | 45 MB | 3,891 | 12 |
| 2026-02 | 982 | 38 MB | 2,654 | 8 |

Use the existing `.billing-tier-table` styling (smaller --text-sm font, compact padding).

**E. API Keys section** -- Reuse the `.settings-key-list` / `.settings-key-row` pattern from the settings view. Show key name, scopes (as badges), creation date, and last-used date. Read-only for now -- the admin dashboard is for visibility, not management.

#### 6. Loading State

Use the existing `view-placeholder` pattern: a text message "Loading tenant data..." in `--color-text-muted`. The billing view uses this exact approach (`#billing-loading`). No skeleton screens needed -- the admin dashboard loads a single aggregate query that should return in under 500ms from D1.

If the API call takes longer than expected, the operator sees the placeholder text. No spinner needed for the initial load; the 2-second budget is generous for a D1 query.

#### 7. Error State

Follow the existing pattern from billing:
- API failure: `.alert.alert--error` with `role="alert"` saying "Could not load tenant data. Please try refreshing."
- Network failure: Same alert pattern with "Connection failed. Check your network and try again."
- No retry button needed for the admin view since the operator can just refresh the browser.

#### 8. Refresh Mechanism

Add a refresh button using the existing `.usage-refresh-btn` pattern (the circular arrow button from the billing view). Place it in a `.usage-footer` row below the stats and above the table. This lets the operator manually refresh without a full page reload.

Do NOT auto-refresh or poll. The admin dashboard is pulled up on demand for operational checks, not left open as a monitoring dashboard. Auto-refresh would add unnecessary complexity and API load.

#### 9. Accessibility Specifications

**Heading hierarchy:**
- h1: "Admin Dashboard" (or "Tenants" if we want to match the existing nav pattern of view-name as h1)
- h2: Section headings ("Overview", "Tenants") using `.settings-section-heading` pattern (uppercase, xs, muted)
- In detail view: h1 is the tenant ID, h2s are section headings

**Table accessibility:**
- Use semantic `<table>` with `<thead>`, `<tbody>`, `<th scope="col">`
- Add `aria-label="Tenant list"` on the table
- Sortable column headers: `<button>` inside `<th>`, with `aria-sort="ascending"` / `aria-sort="descending"` / no `aria-sort` (unsorted)
- Row click targets: make each tenant row an `<a>` element (not a `<tr>` with click handler). The existing capture list uses `<a class="capture-item">` with grid layout -- follow this pattern

**Focus management:**
- On navigation to admin view, focus the h1 (using `tabIndex=-1` + `.focus()`, same as captures heading)
- On navigation to tenant detail, focus the h1 (same pattern)
- Tab order follows visual order: stats (not focusable, they're just display), refresh button, sort column headers, table rows (as links)

**Screen reader announcements:**
- Add an `aria-live="polite"` region (sr-only) for announcing sort changes: "Sorted by captures, descending"
- After refresh: "Tenant data refreshed" announcement via the live region

#### 10. CSS Organization

All admin-specific CSS should be added to `ui-css.js` in a new clearly delimited section:

```
/* ---------------------------------------------------------------------------
   Admin dashboard
--------------------------------------------------------------------------- */
```

New classes should be prefixed with `admin-` to avoid collision with existing component classes. Reuse design system tokens exclusively -- no hardcoded hex values, consistent with the existing codebase rule.

New CSS additions needed (estimated):
- `.view-container--admin` -- wider max-width override
- `.admin-stats-row` -- 4-column stat grid (mirrors billing-stats-row)
- `.admin-stat`, `.admin-stat-value`, `.admin-stat-label` -- stat cell (mirrors billing-stat)
- `.admin-table-wrap` -- overflow-x: auto wrapper for the table
- `.admin-table` -- extends `.table` with row hover, pointer cursor
- `.admin-table th button` -- sortable header button styling
- `.admin-tenant-link` -- tenant ID cell styling (mono, accent color)

Total: ~60-80 lines of CSS. No new design tokens needed -- the existing token set covers everything.

### Proposed Tasks

1. **Design the stat card row** -- Define the 4 aggregate stats, their labels, and data sources. Verify the stat-cell pattern from billing view can be reused without modification. Output: confirmed component spec.

2. **Design the tenant table** -- Finalize column set, alignment, sort defaults, and truncation rules. Define hover/focus/active states. Output: table spec with all states documented.

3. **Design the tenant detail view** -- Define the layout, sections, and data displayed for a single tenant drill-down. Specify which existing component patterns to reuse. Output: detail view spec.

4. **Specify CSS additions** -- Write the actual CSS rules needed, using only existing design tokens. Include the wider container variant, admin stat grid, table hover states, and sort button styling. Output: CSS block ready for insertion into `ui-css.js`.

5. **Specify accessibility requirements** -- Document heading hierarchy, table ARIA attributes, focus management, and live region announcements. Output: accessibility spec for implementation handoff.

### Risks and Concerns

1. **View container width tension.** The admin table needs more horizontal room than the 860px tenant-facing views. A scoped `.view-container--admin` at 1100px is the cleanest approach, but requires the shell to conditionally apply the class based on the active route. If this is too much plumbing, the table can work at 860px with more aggressive column truncation, but readability suffers. The implementer should decide based on routing complexity.

2. **Table as links vs. rows with click handlers.** The existing capture list uses `<a>` elements styled as grid rows -- this is the correct accessible pattern (keyboard navigable, right-click context menu works, browser history works). The admin tenant table must follow this same pattern, NOT use `<tr onclick>`. This means the table is technically a list of links styled to look like a table, OR each row's primary column is a link. Recommendation: make the tenant ID cell a link; keep the row as a plain `<tr>`. This avoids the semantic awkwardness of `<a>` inside `<table>` while keeping the drill-down clearly actionable.

3. **No mobile requirement is stated, but the admin dashboard still needs to not break below 860px.** The CSS should not actively optimize for mobile (no stacked columns, no hidden columns), but it must not overflow or become unusable if someone opens it on a smaller window. A simple `overflow-x: auto` on the table wrapper handles this gracefully.

4. **Data volume.** The plan assumes tenant counts in the low hundreds. If tenant count grows to thousands, the table will need server-side pagination and search. This is not needed for MVP -- build the simple version, add pagination later if needed. The 2-second load target is easily met with D1 for hundreds of rows.

5. **No dark mode.** The existing design system has no dark mode tokens or `prefers-color-scheme` handling. The admin dashboard should not introduce dark mode -- stay consistent with the rest of the product.

6. **Stat card count sensitivity.** The 4-stat grid becomes cramped if stat values are long (e.g., "1,247,893 captures"). Use `font-variant-numeric: tabular-nums` and keep labels short. If values exceed 7 digits, abbreviate (1.2M).

### Additional Agents Needed

- **frontend-minion**: To implement the admin view JS module (`ui-admin.js`), the CSS additions in `ui-css.js`, and the hash router extension. The implementation should follow the exact DOM-building pattern from `ui-billing.js` and `ui-detail.js` (createElement, classList, appendChild -- no innerHTML with interpolated data).

- **data-minion**: To define the admin API endpoint(s) that aggregate tenant and usage data. The admin dashboard needs a single endpoint that returns all tenants with their current-period usage in one response, avoiding N+1 queries. This likely means a new query joining `tenants` with `usage_counters` on `period = currentPeriod`.

- **security-minion**: To verify that the admin dashboard route and its API endpoints are properly gated behind admin authentication (ADMIN_KEY). The dashboard must not be accessible to regular tenant sessions. This is a critical access control boundary -- admin sees all tenants' data.
