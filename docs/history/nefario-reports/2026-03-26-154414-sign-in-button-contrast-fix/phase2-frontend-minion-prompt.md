You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
Fix a CSS specificity bug where the "Sign in" button in the landing page header has unreadable text (~2.5:1 contrast ratio, failing WCAG AA 4.5:1). The nav link rule `.site-header nav a` overrides `.btn--primary` color, making button text dark gray on a dark navy background.

Affected files: `landing/public/index.html` and 6 other landing pages.
Styles: `landing/public/css/landing.css:167` and `landing/public/css/design-system.css:83`

## Your Planning Question
What is the cleanest way to resolve this specificity conflict? Options: (a) `.site-header nav a.btn--primary { color: var(--color-primary-text); }`, (b) `:not(.btn)` exclusion on the nav rule, (c) reordering CSS, (d) `:where()` to lower nav specificity. Which matches existing landing.css patterns and avoids side effects on other nav links?

## Context
- `.site-header nav a` rule block is at `landing/public/css/landing.css:167-184`
- `.btn--primary` rule is at `landing/public/css/design-system.css:83-86`
- Nav HTML structure uses `<a>` tags for both plain links and the button
- The nav contains links: How It Works, Use Cases, Pricing, Docs, and Sign in (button)
- Working directory: /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/magical-sparking-snowglobe

## Instructions
1. Read relevant files to understand the current state (read both CSS files and one of the HTML files to see the nav structure)
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. Return your contribution in the format specified below
5. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-i0tewf/sign-in-button-contrast-fix/phase2-frontend-minion.md`

## Domain Plan Contribution: frontend-minion

### Recommendations
<your expert recommendations for this aspect of the task>

### Proposed Tasks
<specific tasks that should be in the execution plan>

### Risks and Concerns
<things that could go wrong from your domain perspective>

### Additional Agents Needed
<any specialists not yet involved who should be, and why>
(or "None" if the current team is sufficient)
