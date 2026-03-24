# Meta-Plan: Settings & Schedules UI Polish (Revised)

## Task Summary

Visual polish pass on two existing UI panels (Settings and Schedules) to match
the established capture UI patterns. This is a CSS/HTML-only refinement -- no
new features, no API changes, no new data flows. The panels are functional but
lack the visual consistency of the captures list, detail view, and billing tab.

### Scope

**In scope:**
- Layout consistency: settings and schedules panels should use the same card,
  grid, spacing, and header patterns as captures and billing
- Responsive behavior: verify mobile stacking matches captures (640px breakpoint)
- Form input styling: labels, inputs, selects, buttons should use design system
  classes consistently
- Error/success state feedback: visual alerts, inline error display, loading states
- Loading states: skeleton/placeholder patterns during data fetch

**Out of scope:**
- New features or API endpoints
- Accessibility refactoring (existing a11y work is solid -- this is visual only)
- JavaScript logic changes (unless a CSS class name changes require a corresponding
  JS update)
- Design system token changes

### Files Involved

The UI is vanilla JS/CSS shipped as template literals from:
- `src/ui/ui-css.js` -- all page-level CSS (single file, ~1460 lines)
- `src/ui/ui-settings.js` -- settings panel JS (~977 lines)
- `src/ui/ui-schedules.js` -- schedules panel JS (~710 lines)
- `src/design-system.js` -- design tokens and base components (reference only, likely unchanged)

---

## Planning Consultations

### Consultation 1: Frontend Layout and CSS Audit

- **Agent**: frontend-minion
- **Planning question**: Review the CSS in `src/ui/ui-css.js` and the DOM
  structure in `src/ui/ui-settings.js` and `src/ui/ui-schedules.js`. Compare
  against the captures view (`src/ui/ui-submit.js`) and billing view
  (`src/ui/ui-billing.js`). What specific inconsistencies exist in: (a) card
  wrapping and padding, (b) section heading treatment, (c) grid/flex layout
  patterns, (d) form field spacing and label styles, (e) mobile breakpoint
  behavior? Produce a concrete list of CSS changes needed, organized by file
  and selector. Note: this project uses vanilla JS/CSS with design system
  tokens -- no frameworks.
- **Context to provide**: `src/ui/ui-css.js` (full), `src/design-system.js`
  (tokens), `src/ui/ui-settings.js`, `src/ui/ui-schedules.js`,
  `src/ui/ui-submit.js`, `src/ui/ui-billing.js`
- **Why this agent**: Frontend-minion can identify the specific CSS/layout
  gaps and produce a targeted fix list. This is the core work -- and with
  a single-agent team, it carries the full planning responsibility for
  analyzing patterns, identifying inconsistencies, and proposing the
  concrete change set.

---

## Cross-Cutting Checklist

- **Testing**: Exclude from planning. The CSS class names in settings/schedules
  are already established; if any class names change during execution, the
  producing agent will update any test selectors that reference them. Test-minion
  participates at Phase 3.5 review and Phase 6 execution per standard process.
- **Security**: Exclude. This is a CSS/visual polish task with no auth, API,
  input handling, or infrastructure changes. All DOM construction patterns are
  already in place and not changing.
- **Usability -- Strategy**: Exclude from planning (user removed). The task is
  narrowly scoped to visual alignment with existing patterns, not a UX strategy
  review. ux-strategy-minion still participates as a mandatory reviewer at
  Phase 3.5.
- **Usability -- Design**: Exclude from planning. No new UI components or
  interaction patterns are being designed. The existing panels have solid a11y.
  May be a discretionary Phase 3.5 reviewer if visual hierarchy changes are
  substantial.
- **Documentation**: Exclude from planning (user removed). Visual-only CSS
  changes do not alter the documentation surface. The standard evolution log
  entries (prompt.md, decisions.md, outcome.md) are a project-level
  requirement handled by the calling session, not a specialist planning
  concern. software-docs-minion still available at Phase 3.5 if needed.
- **Observability**: Exclude. No runtime components, APIs, or services are
  being changed. This is purely client-side CSS/HTML.

---

## Notable Exclusions

- **ux-strategy-minion**: Removed at user request. The task is pattern-alignment
  (matching settings/schedules to the established captures/billing look), not a
  UX strategy reconsideration. Still participates as mandatory Phase 3.5 reviewer.
- **software-docs-minion**: Removed at user request. Visual-only CSS changes have
  no documentation surface beyond the standard evolution log. Still available at
  Phase 3.5 if the review reveals documentation needs.
- **test-minion**: Not included in planning because test implications are
  straightforward (class name changes, if any, propagate to selectors).
  Participates at Phase 3.5 review and Phase 6 execution per standard process.

---

## Anticipated Approval Gates

**One gate expected:**

1. **CSS Change List** (frontend-minion output): The specific list of CSS
   selectors to add/modify/remove and any DOM class changes. This gates all
   execution work because it defines the scope of what changes. Gate rationale:
   multiple valid approaches exist for unifying the layouts (e.g., refactor
   settings to use the same grid as captures, vs. create a shared panel layout
   abstraction). Low blast radius (CSS only, easy to revert) but involves
   judgment about which patterns to standardize. **OPTIONAL gate** -- include
   only if the change list reveals non-obvious layout decisions.

Given the narrow scope (visual CSS polish, no new features), this plan may
proceed with zero blocking gates if the changes are straightforward pattern
alignment.

---

## Rationale

This is a narrowly-scoped visual polish task with a single planning specialist.
Frontend-minion does the core analysis: identifying CSS/layout inconsistencies
between the settings/schedules panels and the established capture/billing panels,
and producing a concrete fix list. The user explicitly trimmed ux-strategy-minion
and software-docs-minion from planning, judging that a CSS consistency pass does
not warrant UX strategy engagement or documentation planning. Both agents remain
available at Phase 3.5 per mandatory review rules, ensuring cross-cutting
coverage without adding planning overhead.

---

## Scope

**Overall goal**: Make the settings and schedules UI panels visually consistent
with the captures list, detail view, and billing tab.

**In**: CSS changes in `src/ui/ui-css.js`, minimal DOM class adjustments in
`src/ui/ui-settings.js` and `src/ui/ui-schedules.js`.

**Out**: New features, API changes, design system token changes, accessibility
refactoring, JavaScript logic changes.

---

## External Skill Integration

No external skills detected in project. No project-local `.claude/skills/` or
`.skills/` directories exist. Global user skills (nefario, mermaid,
despicable-prompter, etc.) are not relevant to this CSS polish task.
