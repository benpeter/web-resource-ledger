# Accessibility Review — Feature List and Competitor Comparison Table

**Verdict: ADVISE**

The plan is structurally sound and demonstrates genuine accessibility awareness. The table semantics, badge text-content requirement, and caption/scope specifications are all correct. Three issues need to be addressed at implementation time, none severe enough to block the delegation, but one is a WCAG 2.2 Level A violation that must not ship as-is.

---

## What the Plan Gets Right

- `<caption class="sr-only">` on both tables — correct pattern, accessible name for the table object
- `scope="col"` on `<thead>` cells and `scope="row"` on the first cell of each body row — correct for a simple grid table
- Badge requirement: "Every badge must contain visible text" — this is the right call; no color-only pass/fail information
- `data-label` on `<td>` elements for mobile card-stack — correct approach for responsive tables without destroying screen reader semantics
- No JavaScript dependency — static HTML/CSS reduces interaction complexity and focus management concerns
- Section landmark structure: the two new sections both have `id` attributes and live inside the existing `<main>` — no landmark violations expected

---

## Issues

### 1. Mobile card-stack: `<thead>` is visually hidden but remains in the accessibility tree (WCAG 2.2 SC 1.3.1, Level A — must fix)

The plan instructs:

```css
.comparison-table thead {
  position: absolute; width: 1px; height: 1px;
  overflow: hidden; clip: rect(0,0,0,0);
}
```

This is the `.sr-only` / clip pattern. It hides content visually but keeps it in the accessibility tree, which is the correct intent for truly screen-reader-only content. However, the table structure changes at mobile: `tr` and `td` are set to `display: block`, which breaks the implicit table role mappings. NVDA and JAWS both lose table semantics when `display: block` is applied to table elements without explicit ARIA roles. The result is that on mobile, screen readers may announce the thead cells as plain text before the "card" content — creating duplicate, confusing announcements (column headers read by thead AND repeated by `data-label` via `::before`).

**Required fix**: Add `role="presentation"` to the `<table>` element only within the mobile context — or, more practically, add `aria-hidden="true"` to `<thead>` at mobile breakpoints. Since CSS cannot set ARIA attributes, the cleanest cross-browser solution is to use `aria-hidden="true"` on the `<thead>` unconditionally (not just at mobile), since its content is already communicated to screen readers via `scope="col"` on the column header cells in `<tbody>` rows and via `data-label` attributes. The `<caption>` names the table; the `scope` attributes on `<th scope="row">` cells identify the row. The column headers in `<thead>` become redundant for screen readers once `data-label` carries the same information.

**Concrete instruction to add to the Task 1 and Task 2 prompts**:

```html
<thead aria-hidden="true">
  <tr>
    <th scope="col">Tool</th>
    ...
  </tr>
</thead>
```

This removes the thead from the accessibility tree entirely. Screen readers navigate by the `scope="row"` row headers and the `data-label`-backed `::before` text, which is sufficient. The `<caption>` still names the table. This pattern is well-established for responsive card-stack tables and avoids the duplicate-announcement problem at all viewport sizes without requiring JavaScript.

Note: `aria-hidden` on `<thead>` is safe here because none of the `<th scope="col">` cells in thead are the source of an `aria-labelledby` reference on any other element. The information they carry is duplicated in `data-label`.

### 2. Docs table: row header cells are specified as `<td>` not `<th>` (WCAG 2.2 SC 1.3.1, Level A — must fix)

Task 2 specifies `scope="row"` on the first cell of each tbody row. The CSS rule references `th[scope="row"]`:

```css
.comparison-table th[scope="row"] {
  font-weight: var(--weight-bold);
  white-space: nowrap;
}
```

This is correct — row headers should be `<th scope="row">`, not `<td>`. However, the plan's badge cell content examples all use `<td>` format, and no explicit markup example is given for the row header cell itself. If frontend-minion treats the first column as `<td scope="row">` (which some developers do by habit), the `scope` attribute on a `<td>` element has no semantic effect — `scope` is only valid on `<th>` elements. Screen readers would then announce the row without a row header.

**Required fix**: The prompts for Task 1 and Task 2 must include an explicit markup example of the first column cell:

```html
<th scope="row">WRL</th>
```

Not:

```html
<td scope="row">WRL</td>
```

This is a one-word difference in the spec but a critical semantic one.

### 3. Landing page `<td>` first-child styling hides the tool name label via `::before { display: none }` — acceptable but verify against `.sr-only` thead (informational)

The mobile CSS suppresses the `::before` label on `td:first-child` (the tool name cell) with `display: none`. This is intentional — the tool name itself is the card heading and no column label is needed. Since `::before` is CSS-generated content, `display: none` correctly removes it from both visual and accessibility trees. No issue here, but worth noting for implementer clarity: the tool name cell does not announce a column label; it announces the tool name, which is its own `th scope="row"` value and visually bold. This is correct behavior.

---

## Focus Management

No interactive elements beyond links. The new sections add anchor links (`href="#features"`, `href="#compare"`) and two outbound links to the docs site. These are standard `<a>` elements with descriptive text ("Full feature comparison across 9 tools →" and "Full comparison of 9 tools across 7 criteria →"). Both links have visible, non-color-dependent text. No focus management concerns.

The `→` character (right arrow, U+2192) in the link text will be announced by screen readers. NVDA + Firefox announces it as "right arrow"; JAWS omits it. This is acceptable — the surrounding text is sufficient without the arrow character. Not blocking.

---

## Landmark Structure

The two new sections do not introduce landmark violations. Both sections are `<section>` elements with `id` attributes inside the existing `<main>`. If the sections use `<section>` without an accessible name (no `aria-labelledby` or `aria-label`), they will not be exposed as named landmark regions — but unnamed `<section>` elements fall back to generic region and do not pollute the landmark list. This is fine for these content sections. The existing page structure already handles the `<main>` landmark.

---

## WCAG 2.2 New Criteria Check

- **2.4.11 Focus Not Obscured / 2.4.13 Focus Appearance**: No sticky headers or overlapping elements introduced. The site header appears to be a normal flow header. No sticky positioning in the new sections. No focus appearance concerns.
- **2.5.8 Target Size (Minimum)**: All interactive elements are links with text content. Text links are exempt from 2.5.8 per the WCAG 2.2 exception for inline text links. No icon-only buttons.
- **3.3.7 Redundant Entry**: Not applicable — no forms in scope.
- **3.3.8 Accessible Authentication**: Not applicable.

---

## Summary for Frontend-Minion

Two required changes before these tasks ship:

1. Add `aria-hidden="true"` to `<thead>` on both tables (landing and docs). This eliminates duplicate column-header announcements in the mobile card-stack pattern.
2. Mark the row header cell as `<th scope="row">Tool Name</th>`, not `<td scope="row">`. The CSS selector `th[scope="row"]` in the plan already anticipates this — just make the element type match.

Both changes are single-attribute/element-type corrections. No structural rework required.
