You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
Fix a CSS specificity bug where the "Sign in" button in the landing page header has unreadable text (~2.5:1 contrast ratio, failing WCAG AA 4.5:1). The nav link rule `.site-header nav a` overrides `.btn--primary` color, making button text dark gray on a dark navy background.

Affected files: `landing/public/index.html` and 6 other landing pages.
Styles: `landing/public/css/landing.css:167` and `landing/public/css/design-system.css:83`

## Your Planning Question
For the specificity fix restoring #f8f8fa text on #2a3444 background (~11.5:1 ratio), should we also verify hover state (#1f2835 background) and focus-visible state? Are there other WCAG Success Criteria beyond 1.4.3 to check for this `<a>` element acting as a button?

## Context
- Design system color tokens are in `landing/public/css/design-system.css`
- Hover/focus-visible rules are in `landing/public/css/landing.css:177-184`
- The element is `<a href="..." class="btn btn--primary btn--sm">Sign in</a>` inside `<nav>` inside `.site-header`
- Working directory: /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/magical-sparking-snowglobe

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. Return your contribution in the format specified below
5. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-i0tewf/sign-in-button-contrast-fix/phase2-accessibility-minion.md`

## Domain Plan Contribution: accessibility-minion

### Recommendations
<your expert recommendations for this aspect of the task>

### Proposed Tasks
<specific tasks that should be in the execution plan>

### Risks and Concerns
<things that could go wrong from your domain perspective>

### Additional Agents Needed
<any specialists not yet involved who should be, and why>
(or "None" if the current team is sufficient)
