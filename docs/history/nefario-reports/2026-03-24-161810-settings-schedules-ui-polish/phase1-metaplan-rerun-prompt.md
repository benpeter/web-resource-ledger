MODE: META-PLAN

You are creating a revised meta-plan after a team adjustment.

## Task
<github-issue>
The settings page (eIDAS toggle, account settings) and schedules management page (schedule list, create, delete) need visual polish to match the existing capture UI.

Reported during Act 5 post-deployment review.

## Pages affected

- `/ui` settings panel (Phase 0063 — eIDAS toggle)
- `/ui` schedules panel (Phase 0059 — schedule CRUD)

## What to check

- Layout consistency with existing panels
- Responsive behavior
- Form input styling
- Error/success state feedback
- Loading states
</github-issue>

## Original Meta-Plan
Read from: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-J5bcQH/settings-schedules-ui-polish/phase1-metaplan.md

## Team Adjustment
- Removed: ux-strategy-minion (CSS consistency check doesn't need UX strategy engagement)
- Removed: software-docs-minion (visual-only changes have no documentation surface)

## Revised Team
frontend-minion

## Constraints
- Keep the same scope and task description
- Generate planning consultation for frontend-minion in the revised team
- Re-evaluate the cross-cutting checklist against the new team
- Produce output at the same depth and format as the original
- Do NOT change the fundamental scope of the task
- Do NOT add agents the user did not request

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/proud-purring-shell

## Instructions
1. Read relevant files to understand the codebase context
2. Produce a revised meta-plan with only frontend-minion as the planning specialist
3. Write your complete revised meta-plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-J5bcQH/settings-schedules-ui-polish/phase1-metaplan-rerun.md`
