You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise
to help build a comprehensive plan.

## Project Task
The settings page (eIDAS toggle, account settings) and schedules management page (schedule list, create, delete) need visual polish to match the existing capture UI.

Reported during Act 5 post-deployment review.

### Pages affected
- `/ui` settings panel (Phase 0063 — eIDAS toggle)
- `/ui` schedules panel (Phase 0059 — schedule CRUD)

### What to check
- Layout consistency with existing panels
- Responsive behavior
- Form input styling
- Error/success state feedback
- Loading states

## Your Planning Question
Review the CSS in `src/ui/ui-css.js` and the DOM structure in `src/ui/ui-settings.js` and `src/ui/ui-schedules.js`. Compare against the captures view (`src/ui/ui-submit.js`) and billing view (`src/ui/ui-billing.js`). What specific inconsistencies exist in: (a) card wrapping and padding, (b) section heading treatment, (c) grid/flex layout patterns, (d) form field spacing and label styles, (e) mobile breakpoint behavior? Produce a concrete list of CSS changes needed, organized by file and selector. Note: this project uses vanilla JS/CSS with design system tokens -- no frameworks.

## Context
Key files to read:
- `src/ui/ui-css.js` (full CSS definitions)
- `src/design-system.js` (design tokens)
- `src/ui/ui-settings.js` (settings panel DOM)
- `src/ui/ui-schedules.js` (schedules panel DOM)
- `src/ui/ui-submit.js` (capture submission - reference for consistency)
- `src/ui/ui-billing.js` (billing - reference for consistency)

## Instructions
1. Read all relevant files to understand the current state
2. Apply your frontend expertise to identify specific CSS/layout inconsistencies
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that
   aren't already part of the planning, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: frontend-minion

### Recommendations
Your expert recommendations for CSS/layout fixes needed

### Proposed Tasks
Specific tasks that should be in the execution plan
For each task: what to do, deliverables, dependencies

### Risks and Concerns
Things that could go wrong from your domain perspective

### Additional Agents Needed
Any specialists not yet involved who should be, and why
(or "None" if the current team is sufficient)

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-J5bcQH/settings-schedules-ui-polish/phase2-frontend-minion.md`
