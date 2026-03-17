You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise.

## Project Task
Should we add a collapsible "Verify independently" section to the verify page with a copy-to-clipboard npx command for the existing @w-r-l/verify CLI tool?

## Advisory Context
Advisory-only orchestration. Focus on analysis, trade-offs, and recommendations.

## Your Planning Question
What ARIA attributes are needed for the copy button? How should screen readers announce copy success/failure? Is there anything specific about keyboard interaction within a `<details>` element that we need to handle?

## Context
Read the verify page source for existing accessibility patterns:
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario-advisory-branch-envs/src/verify-page.js

Existing accessibility features in the page:
- `<h1 class="sr-only">` for screen reader page title
- `role="status"` on loading indicator
- `aria-live="polite"` on result container
- `aria-label` on sections
- `aria-hidden="true"` on decorative SVG icons
- `<span class="sr-only">` for check status text
- `:focus-visible` styles with 2px solid outline throughout
- `prefers-reduced-motion` media query for spinner

The proposed feature:
- A `<details><summary>Verify independently</summary>` section
- A `<code>` block with the npx command
- A copy button (icon or text) that copies to clipboard
- Visual feedback on copy (e.g., "Copied!" tooltip or icon change)
- Screen reader feedback on copy action

## Instructions
1. Read the page source for existing patterns
2. Recommend ARIA markup, screen reader announcements, keyboard interaction
3. Flag any WCAG concerns
4. Write your contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-zdnDkL/verify-page-npx-copy-command/phase2-accessibility-minion.md`
