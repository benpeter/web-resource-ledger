# Meta-Plan: Settings & Schedules UI Polish

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
  gaps and produce a targeted fix list. This is the core work.

### Consultation 2: UX Consistency Review

- **Agent**: ux-strategy-minion
- **Planning question**: Looking at the settings page (account info card, usage
  metrics, add-ons toggle, API keys CRUD) and schedules page (create form with
  URL/frequency/name fields, schedule list with status badges), what UX
  patterns should be unified with the capture submission flow? Specifically:
  (a) should the schedules create form use the same inline form pattern as
  capture submission (horizontal input + button), or is the current vertical
  card form appropriate for a multi-field form? (b) Are there cognitive load
  issues with the settings page's section ordering (Account > Usage > Add-ons >
  API Keys)? (c) Any loading/empty state feedback gaps compared to captures?
  Keep recommendations to CSS-achievable changes -- no new features.
- **Context to provide**: The issue description, screenshots if available,
  current DOM structure from the JS files
- **Why this agent**: Every plan needs journey coherence review. The settings
  and schedules pages have different interaction patterns than captures -- UX
  strategy should confirm which patterns to unify and which to leave different.

### Consultation 3: Documentation Impact Assessment

- **Agent**: software-docs-minion
- **Planning question**: This is a visual-only polish pass on existing UI panels.
  What, if any, documentation needs updating? The design system is documented
  in `src/design-system.js` (CSS tokens) and `src/design-system.css`. Are there
  patterns being introduced that should be documented as design system
  conventions (e.g., "all panel views use card wrapping", "section headings
  use settings-section-heading class")? This is likely a lightweight assessment.
- **Context to provide**: `src/design-system.js`, the CSS file, evolution log
  structure
- **Why this agent**: Documentation is mandatory in every plan. This is likely
  minimal (evolution log entries only), but the agent should confirm.

---

## Cross-Cutting Checklist

- **Testing**: Include test-minion for planning. The UI has existing tests, and
  CSS class name changes could break test selectors. Test-minion should identify
  which tests reference settings/schedules DOM structure and flag any that need
  updating. Additionally, any visual changes should be verified against the
  responsive breakpoints.
- **Security**: Exclude security-minion. This is a CSS/visual polish task with
  no auth, API, input handling, or infrastructure changes. All DOM construction
  patterns are already in place and not changing.
- **Usability -- Strategy**: ALWAYS include. See Consultation 2 above.
- **Usability -- Design**: Exclude ux-design-minion and accessibility-minion
  from *planning*. The existing panels already have solid a11y (aria-live regions,
  role attributes, focus management, sr-only announcements). This is visual polish
  only. However, ux-design-minion may be relevant at architecture review (Phase
  3.5) to verify the visual changes don't introduce hierarchy or contrast issues.
- **Documentation**: ALWAYS include. See Consultation 3 above.
- **Observability**: Exclude. No runtime components, APIs, or services are being
  changed. This is purely client-side CSS/HTML.

---

## Notable Exclusions

- **accessibility-minion**: Existing panels already have comprehensive a11y
  (aria-live, roles, focus management, keyboard nav). Visual-only changes
  don't affect the accessibility layer. May review at Phase 3.5 if
  discretionary pick is warranted.
- **ux-design-minion**: No new UI components or interaction patterns are being
  designed -- this is aligning existing patterns. May review at Phase 3.5.
- **test-minion**: While excluded from planning consultations (the test
  implications are straightforward), test-minion will participate at Phase 3.5
  review and Phase 6 execution per standard process.

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

This is a narrowly-scoped visual polish task. The primary work is CSS: finding
inconsistencies between the settings/schedules panels and the established
capture/billing panels, then fixing them. Frontend-minion does the core analysis.
UX-strategy-minion validates that the unification makes sense from a user journey
perspective. Software-docs-minion confirms whether any documentation is needed
beyond the standard evolution log.

The task does not warrant infrastructure, security, observability, or data
specialists. The architecture review (Phase 3.5) will include mandatory
reviewers (security, test, ux-strategy, lucy, margo) but the scope is narrow
enough that most should APPROVE quickly.

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
