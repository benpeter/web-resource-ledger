# Domain Plan Contribution: frontend-minion

## Recommendations

### Summary of Findings

The settings and schedules views have significant CSS gaps relative to the captures and billing views. The root issue is not just "visual polish" -- many CSS class names used in the JS DOM construction have **no corresponding CSS rules at all**, meaning those elements are styled only by browser defaults or accidental inheritance. The billing view introduced a pattern (inline `style.padding` on inner wrapper divs) that works but diverges from how other views handle card padding. Below is a concrete, selector-level audit.

---

### (a) Card Wrapping and Padding

**The problem:** Three different padding strategies exist across views.

| View | Card class | Inner padding mechanism |
|------|-----------|------------------------|
| Captures | No `.card` on form section; list has border-based wrapper | No inner padding div; padding via `.capture-header-row` / `.capture-item` grid cells |
| Billing | `.settings-section.card` | Explicit inner `<div>` with `style.padding = 'var(--space-4) var(--space-5)'` (inline styles, repeated 5 times) |
| Settings | `.settings-section.card` | **No inner padding div and no padding CSS** -- content (headings, grids, add-on rows) sits flush against the card border |
| Schedules | `.schedule-form-section.card` for form; list section has no card wrapping | Form has `.card` but **no inner padding** -- the form contents sit flush inside the card |

**What needs to change:**

1. Add a CSS rule for `.settings-section.card` that provides consistent inner padding: `padding: var(--space-4) var(--space-5)`. This eliminates the need for billing's repeated inline `style.padding` on inner divs and simultaneously fixes the settings view.
2. Add `padding: var(--space-4) var(--space-5)` to `.schedule-form-section.card` (or apply the same `.settings-section.card` rule if schedule form section adopts that class).
3. **Optionally** (lower priority): remove the inline `style.padding` assignments in `ui-billing.js` now that the CSS rule handles it. This is a code cleanup, not a visual fix.

**Specific CSS additions in `ui-css.js`:**

```css
/* Card inner padding -- shared by settings, billing, schedules */
.settings-section.card {
  padding: var(--space-4) var(--space-5);
}

.schedule-form-section.card {
  padding: var(--space-4) var(--space-5);
}
```

---

### (b) Section Heading Treatment

**The problem:** The class `settings-section-heading` is used by **all three views** (settings, billing, schedules) as the standard h2 heading style inside cards. But it has **zero CSS definition** anywhere -- not in `ui-css.js`, not in `design-system.js`. This means all h2 headings inside settings/billing/schedules cards render with browser-default h2 styling (typically large bold text with browser-default margins), which is visually inconsistent with the captures view's intentional typography.

The captures view uses `captures-heading` (h1) which is well-defined, and the `.section h2` rule in `design-system.js` (small caps, uppercase, muted) only applies when the h2 is inside a `.section` element -- which these cards are not.

**What needs to change:**

Add a CSS rule for `.settings-section-heading`:

```css
.settings-section-heading {
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
  margin: 0 0 var(--space-4);
}
```

This matches the `.section h2` pattern from the design system and the `.settings-section-title` rule already in `ui-css.js` (line 636-643), which appears to be an earlier attempt at the same thing but uses a different class name that is never actually used in the JS.

**Action:** Either rename `.settings-section-title` to `.settings-section-heading` in CSS, or add a new rule for `.settings-section-heading`. The former is cleaner since `.settings-section-title` is dead CSS.

---

### (c) Grid/Flex Layout Patterns

**The problem:** Several layout classes used in settings JS have no CSS definitions.

**Missing CSS rules for settings view:**

| Class | Used in | Purpose | CSS status |
|-------|---------|---------|------------|
| `.settings-key-row` | `buildKeyRow()` | Container for each API key row | **MISSING** -- no flex/grid layout defined |
| `.settings-key-info` | `buildKeyRow()` | Key name + meta + scopes container | **MISSING** |
| `.settings-key-name` | `buildKeyRow()` | Key name text | **MISSING** |
| `.settings-key-meta` | `buildKeyRow()` | "Created <date>" text | **MISSING** |
| `.settings-key-scopes` | `buildKeyRow()` | Scopes badge container | **MISSING** |
| `.settings-key-actions` | `buildKeyRow()` | Revoke button + confirm area | **MISSING** |
| `.settings-keys-empty` | `renderKeyList()` | "No API keys" empty state | **MISSING** |
| `.settings-keys-limit` | `buildSettingsContent()` | "N of M keys" count | **MISSING** |
| `.settings-info-row` | `addInfoRow()` | Individual dt/dd pair wrapper | **MISSING** |
| `.settings-info-label` | `addInfoRow()` | dt element (label) | **MISSING** |
| `.settings-info-value` | `addInfoRow()` | dd element (value) | **MISSING** |
| `.settings-create-heading` | create key section | h3 for "Create new key" | **MISSING** |
| `.settings-create-row` | create key form | Name label + input wrapper | **MISSING** |
| `.settings-new-key-display` | `showNewKeyDisplay()` | New key reveal container | **MISSING** |
| `.settings-scope-item` | scope checkboxes | Individual scope checkbox label | **MISSING** |

Note: `.settings-info-grid` **does** exist (line 645-647) but only sets `grid-template-columns: 8rem 1fr` without declaring `display: grid` -- so it has no effect.

**Required CSS additions:**

```css
/* Account info grid */
.settings-info-grid {
  display: grid;
  grid-template-columns: 8rem 1fr;
  gap: var(--space-2) var(--space-4);
}

.settings-info-row {
  display: contents;
}

.settings-info-label {
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
}

.settings-info-value {
  font-size: var(--text-base);
  color: var(--color-text);
}

/* API key rows */
.settings-key-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) 0;
  border-bottom: 1px solid var(--color-border-subtle);
}

.settings-key-row:last-child {
  border-bottom: none;
}

.settings-key-info {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}

.settings-key-name {
  font-size: var(--text-base);
  font-weight: var(--weight-medium);
  color: var(--color-text);
}

.settings-key-meta {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.settings-key-scopes {
  display: flex;
  gap: var(--space-1);
  flex-wrap: wrap;
}

.settings-key-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
}

.settings-keys-empty {
  padding: var(--space-4) 0;
  font-size: var(--text-base);
  color: var(--color-text-muted);
}

.settings-keys-limit {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

/* Create key section */
.settings-create-heading {
  font-size: var(--text-base);
  font-weight: var(--weight-medium);
  color: var(--color-text);
  margin-bottom: var(--space-2);
}

.settings-create-row {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.settings-new-key-display {
  margin-top: var(--space-4);
  padding: var(--space-4);
  background: var(--color-surface-muted);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.settings-scope-item {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-base);
  cursor: pointer;
}
```

**Schedules view** has better CSS coverage but is still missing:

| Class | CSS status |
|-------|-----------|
| `.schedule-delete-btn` | **MISSING** -- no special styling (inherits from `.btn .btn--ghost .btn--sm`) which is acceptable |

The schedule delete button inherits correctly from `.btn.btn--ghost.btn--sm`, so this is not a gap that needs fixing.

---

### (d) Form Field Spacing and Label Styles

**Settings form vs Schedules form vs Captures form:**

| View | Form layout | Label style | Field spacing |
|------|------------|-------------|---------------|
| Captures | `.capture-form-row` (flex, horizontal) | `aria-label` only (no visible label) | `gap: var(--space-3)` |
| Schedules | `.schedule-form` (flex column, `gap: var(--space-3)`) | `.schedule-field-label` (defined, `text-sm`, `weight-medium`, `text-muted`, `margin-bottom: space-1`) | Consistent via flex gap |
| Settings (create key) | `.settings-create-form` (flex column, `gap: var(--space-3)`) | `.settings-create-label` (defined) | Consistent via flex gap |
| Settings (addons) | `.settings-addon-row` (flex column) | `.settings-addon-label` / `.settings-addon-description` (defined) | `gap: var(--space-3)` |
| Billing | No form elements | N/A | N/A |

**Finding:** The schedules form label class `.schedule-field-label` and the settings label class `.settings-create-label` are **identically styled** -- both use `text-sm`, `weight-medium`, `text-muted`. This is correct and consistent.

**One gap:** The schedules form has `margin-top: var(--space-4)` on `.schedule-form` which creates a gap between the card heading and the form. But the card has no padding, so the heading is flush to the card edge while the form floats 1rem below it. Combined with the missing card padding (issue a), this looks broken.

**Additional form-related issue:** The schedules form section uses `.schedule-form-preview` with a negative margin (`margin-top: calc(-1 * var(--space-1))`) which only makes visual sense if the form items have consistent vertical gap. This is fine given the `gap: var(--space-3)` on `.schedule-form`, but it's fragile.

---

### (e) Mobile Breakpoint Behavior

**Captures view:** Well-handled. Has explicit `@media (max-width: 640px)` rules for:
- Hiding header row
- Stacking capture items to `grid-template-columns: 1fr auto`
- URL wrapping
- Form row stacking (`flex-direction: column`)

**Schedules view:** Has explicit `@media (max-width: 640px)` rules that mirror the captures pattern:
- Hiding header row
- Stacking schedule items to single column
- Correct. No gaps here.

**Settings view:** **NO mobile breakpoints at all.** Issues:
- `.settings-info-grid` with `grid-template-columns: 8rem 1fr` -- the 8rem label column is fine down to small screens, but should collapse to single column below ~400px
- `.settings-key-row` (once CSS is added) needs to stack vertically on mobile
- `.settings-create-form` inherits flex-column, which is already mobile-friendly
- `.settings-addon-toggle-label` is flex with `align-items: flex-start` which works at mobile width

**Billing view:** Has explicit `@media (max-width: 640px)` for:
- `.billing-stats-row` (3-col grid to 1-col)
- `.billing-tier-table` (responsive card layout)
- Missing: no breakpoint for the inline `style.padding` on inner divs (but padding values `space-4 space-5` = `1rem 1.25rem` are reasonable at mobile)

**Required mobile CSS additions for settings:**

```css
@media (max-width: 640px) {
  .settings-info-grid {
    grid-template-columns: 1fr;
  }

  .settings-key-row {
    flex-direction: column;
  }

  .settings-key-actions {
    align-self: flex-start;
  }
}
```

---

### Additional Issues Found

1. **Dead CSS:** `.settings-section-title` (lines 636-643 of ui-css.js) is defined but **never used** in any JS file. It should be removed and its styles adopted under `.settings-section-heading`.

2. **Incomplete `.settings-info-grid`:** The existing rule at line 645-647 only sets `grid-template-columns` without `display: grid`. This is a no-op -- the element renders as a block `<dl>`.

3. **Inline style proliferation in billing:** Five instances of `inner.style.padding = 'var(--space-4) var(--space-5)'` in `ui-billing.js`. Once a CSS rule is added for `.settings-section.card`, these can be removed. Lower priority but reduces maintenance burden.

4. **Schedules form card lacks heading padding context:** The schedule form section applies `card` class but its heading `.settings-section-heading` has no left/top padding, while the form below it has `margin-top: var(--space-4)`. Once card padding is added (issue a), this resolves itself.

5. **`formatPeriod` function duplication:** Both `ui-settings.js` and `ui-billing.js` use `formatPeriod()` but only settings defines it. Billing calls it without definition. This will cause a runtime error if billing loads before settings. (Not a CSS issue, but found during review.)

---

## Proposed Tasks

### Task 1: Add missing CSS rules for settings view (HIGH PRIORITY)

**What:** Add all 16+ missing CSS selectors listed in section (c) above to `src/ui/ui-css.js`, plus the `.settings-section-heading` rule from section (b).

**Deliverables:**
- All settings DOM elements have corresponding CSS rules
- Account info grid displays as a proper 2-column layout
- API key rows have flex layout with proper spacing
- Section headings match the design system's uppercase muted pattern
- Create-key form has proper label and input spacing
- New key display area has visual containment (background, border, padding)

**Dependencies:** None. Pure CSS addition.

### Task 2: Add card padding consistency rule (HIGH PRIORITY)

**What:** Add CSS padding rules for `.settings-section.card` and `.schedule-form-section.card` so card content is consistently padded across all views.

**Deliverables:**
- Settings sections have `padding: var(--space-4) var(--space-5)` via CSS
- Schedule form section has matching padding
- Visual alignment matches billing view's card sections

**Dependencies:** None. Can be done in parallel with Task 1.

### Task 3: Fix `.settings-info-grid` -- add `display: grid` (HIGH PRIORITY)

**What:** The existing `.settings-info-grid` rule in ui-css.js is missing `display: grid`, making it a no-op. Add it.

**Deliverables:**
- Account info (GitHub username, Tenant ID, Member since) displays in a proper 2-column grid layout

**Dependencies:** None. One-line fix.

### Task 4: Clean up dead CSS selector `.settings-section-title` (LOW PRIORITY)

**What:** Remove the `.settings-section-title` rule (lines 636-643) which is never used. Its intended styles are now covered by the new `.settings-section-heading` rule.

**Deliverables:**
- No dead CSS

**Dependencies:** Task 1 (which adds `.settings-section-heading`)

### Task 5: Add mobile breakpoints for settings view (MEDIUM PRIORITY)

**What:** Add `@media (max-width: 640px)` rules for `.settings-info-grid` (single column), `.settings-key-row` (stack vertically), and `.settings-key-actions` (align start).

**Deliverables:**
- Settings view is usable on mobile devices
- Layout stacks vertically below 640px breakpoint, consistent with captures and schedules

**Dependencies:** Task 1 and Task 3 (the rules being made responsive must exist first)

### Task 6: Remove inline padding from billing view (LOW PRIORITY, OPTIONAL)

**What:** Remove the five `inner.style.padding = 'var(--space-4) var(--space-5)'` inline style assignments in `ui-billing.js` since the CSS rule from Task 2 now handles it.

**Deliverables:**
- No inline style overrides for padding in billing sections
- Cleaner, more maintainable code

**Dependencies:** Task 2

### Task 7: Investigate `formatPeriod` duplication risk (MEDIUM PRIORITY)

**What:** Verify that `formatPeriod()` defined in settings is available when billing renders. If not, either move it to a shared utilities section or duplicate it in billing. This is a runtime bug, not CSS, but was discovered during this review.

**Deliverables:**
- `formatPeriod()` callable from billing view without error
- No function duplication if avoidable

**Dependencies:** None

---

## Risks and Concerns

1. **Execution order matters for Tasks 1-3.** These are the foundation -- Tasks 4-6 are cleanup that depends on them. The visual improvement is entirely in Tasks 1-3 + 5.

2. **Browser testing scope.** The CSS additions are straightforward (grid, flex, font, color, padding), but the mobile breakpoint additions (Task 5) should be visually verified at 640px, 420px, and 320px widths. The project has no visual regression testing, so manual verification is required.

3. **Inline styles in billing (Task 6) carry specificity risk.** If we add CSS padding to `.settings-section.card` but leave the inline `style.padding` in billing JS, the inline style wins. This is not a bug (same values), but removing the inline styles in the same PR avoids future confusion when someone changes the CSS and wonders why billing doesn't respond.

4. **`formatPeriod` bug (Task 7) could cause a runtime crash** on the billing page if settings hasn't been visited first in the same session. The JS modules are concatenated into a single `<script>`, so execution order depends on concatenation order. This needs investigation -- it may already work due to load order, but it's brittle.

5. **No visual design spec exists.** The recommendations above derive the "correct" styles from the design system tokens and from what the captures/billing views already do. If the designer intended different treatment for settings/schedules, these recommendations would need revision. Given this is a polish pass, matching existing patterns is the safest approach.

---

## Additional Agents Needed

None. This is a pure frontend CSS/DOM task. The inconsistencies are all in the CSS layer and can be resolved by a frontend implementer working with the existing design system tokens. No design decisions are being made -- only alignment with established patterns.
