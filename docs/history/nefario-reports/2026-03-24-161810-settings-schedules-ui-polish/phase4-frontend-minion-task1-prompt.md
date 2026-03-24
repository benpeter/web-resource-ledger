## Task: CSS polish for settings and schedules views

You are working on the WRL web UI. The settings view and schedules form
have significant CSS gaps -- many class names used in the JS DOM
construction have no corresponding CSS rules, so elements render with
browser defaults. Your job is to add the missing CSS rules to
`src/ui/ui-css.js` so these views match the visual quality of the
captures and billing views.

### Context

The UI is vanilla JS with CSS defined as a template literal in
`src/ui/ui-css.js`. Design tokens come from `src/design-system.css`.
The settings view is built in `src/ui/ui-settings.js` and the schedules
view in `src/ui/ui-schedules.js`. The billing view
(`src/ui/ui-billing.js`) is the most recently built view and represents
the current visual standard.

### File to modify

**`src/ui/ui-css.js`** — this is the ONLY file you modify.

### Changes required (in order of where they go in the file)

#### A. Fix `.settings-section-title` → `.settings-section-heading`

The class `.settings-section-title` (around line 636-643) is dead CSS --
it is never used by any JS file. The actual class used everywhere is
`.settings-section-heading`. Replace the `.settings-section-title` rule
with a `.settings-section-heading` rule:

```css
.settings-section-heading {
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
  margin: 0 0 var(--space-4);
}
```

#### B. Fix `.settings-info-grid` — add `display: grid`

The existing rule (around line 645-647) only sets
`grid-template-columns: 8rem 1fr` without `display: grid`. Fix it to:

```css
.settings-info-grid {
  display: grid;
  grid-template-columns: 8rem 1fr;
  gap: var(--space-2) var(--space-4);
}
```

#### C. Add card padding rules

Add padding rules for card sections:

```css
.settings-section.card {
  padding: var(--space-4) var(--space-5);
}

.schedule-form-section.card {
  padding: var(--space-4) var(--space-5);
}
```

#### D. Add missing settings element rules

Add these rules in the "Settings view" section of the CSS:

```css
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

#### E. Remove dead `.settings-scope-label` rule

The `.settings-scope-label` CSS rule (around line 738) is dead CSS -- the JS uses
`settings-scope-label` as an element `id`, not as a `className`. The class
`.settings-scope-item` (added above) is what the JS actually uses. Remove the
`.settings-scope-label` rule.

#### F. Check `.settings-key-list` class

Read `src/ui/ui-settings.js` and check if `.settings-key-list` class is used.
If it is, add an appropriate CSS rule for it. It likely just needs basic spacing.

#### G. Add mobile breakpoints for settings

Add a `@media (max-width: 640px)` block for settings, consistent with
existing mobile breakpoints for captures and schedules:

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

### What NOT to do

- Do NOT modify any JS files
- Do NOT add new design tokens
- Do NOT change existing captures, billing, or detail view CSS
- Do NOT add vendor prefixes beyond what already exists in the file
- Place new rules logically near existing related rules

### Success criteria

1. Every class name used in `ui-settings.js` has a corresponding CSS rule
2. Dead `.settings-section-title` replaced with `.settings-section-heading`
3. Dead `.settings-scope-label` removed
4. `.settings-info-grid` renders as a 2-column grid (has `display: grid`)
5. Card sections have consistent inner padding
6. Settings view has mobile breakpoints at 640px
7. No CSS regressions in other views
