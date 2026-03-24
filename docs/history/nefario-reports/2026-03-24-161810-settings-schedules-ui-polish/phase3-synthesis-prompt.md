MODE: SYNTHESIS

You are synthesizing specialist planning contributions into a
final execution plan.

## Original Task
The settings page (eIDAS toggle, account settings) and schedules management page (schedule list, create, delete) need visual polish to match the existing capture UI.

Pages affected:
- `/ui` settings panel (Phase 0063 — eIDAS toggle)
- `/ui` schedules panel (Phase 0059 — schedule CRUD)

What to check:
- Layout consistency with existing panels
- Responsive behavior
- Form input styling
- Error/success state feedback
- Loading states

## Specialist Contributions

Read the following scratch file for the full specialist contribution:
/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-J5bcQH/settings-schedules-ui-polish/phase2-frontend-minion.md

## Key consensus across specialists:

### Summary: frontend-minion
Phase: planning
Recommendation: Add 16+ missing CSS selectors for settings view, fix card padding across all views, fix broken grid layout, add mobile breakpoints for settings
Tasks: 7 — Add missing CSS rules for settings (HIGH); Card padding consistency (HIGH); Fix settings-info-grid display:grid (HIGH); Clean dead CSS (LOW); Mobile breakpoints for settings (MED); Remove billing inline padding (LOW); Investigate formatPeriod duplication (MED)
Risks: No visual regression testing; inline style specificity in billing; formatPeriod runtime bug potential
Conflicts: none

## External Skills Context
No external skills detected.

## Instructions
1. Review the specialist contribution
2. Consolidate into an actionable execution plan -- combine related tasks where it makes sense (e.g., all CSS additions for settings can go in one task)
3. This is a CSS-only polish task. Consolidate the 7 proposed tasks into fewer, more efficient execution units
4. The formatPeriod issue (Task 7 in the contribution) is a runtime bug, not CSS. Include it only if it's a quick fix alongside the CSS work.
5. Create the final execution plan in structured format with complete, self-contained prompts
6. Each execution task should target a single agent (frontend-minion) with sonnet model and bypassPermissions mode
7. Ensure every task has a complete, self-contained prompt
8. Write your complete delegation plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-J5bcQH/settings-schedules-ui-polish/phase3-synthesis.md`
