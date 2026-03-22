You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
Build a static landing page for WRL (Web Resource Ledger) at webresourceledger.com. Plain HTML/CSS, no JS frameworks. Uses the WRL brand design system. Sections: hero with tagline/CTA, 3-step how-it-works, 4 use cases, pricing tiers (free/pro/enterprise), footer.

## Your Planning Question
The design system was built for application UI (buttons, alerts, badges, cards, etc.). What landing-page-specific patterns are needed (hero layout, pricing cards, step indicators, section backgrounds)? Should we extend existing tokens or create a landing-page CSS layer? What responsive breakpoints beyond the current 640px mobile breakpoint? Consider:
- The design system tokens and components are in src/design-system.css (read this file)
- The docs site styles are in site/css/docs.css (read this for patterns)
- The style guide is at docs/style-guide.md
- Logo: site/assets/logo-w-check.svg
- Target: Lighthouse perf >= 95, a11y >= 90
- Must be responsive: mobile, tablet, desktop
- No JavaScript -- pure CSS for any interactivity (smooth scrolling, hover states)
- The page should feel like it belongs to the same brand as the docs site but be visually distinct (marketing vs documentation)

## Context
Working directory: /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/gleaming-noodling-quokka

## Instructions
1. Read src/design-system.css, docs/style-guide.md, and site/css/docs.css
2. Identify what existing tokens/components can be reused
3. Identify what new landing-page-specific CSS is needed
4. Propose the HTML structure (semantic sections) and CSS architecture
5. Return your contribution in this format:

## Domain Plan Contribution: ux-design-minion

### Recommendations
<visual design and CSS architecture recommendations>

### Proposed Tasks
<specific tasks>

### Risks and Concerns
<things that could go wrong>

### Additional Agents Needed
None expected

6. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-wpZsJf/landing-page/phase2-ux-design-minion.md
