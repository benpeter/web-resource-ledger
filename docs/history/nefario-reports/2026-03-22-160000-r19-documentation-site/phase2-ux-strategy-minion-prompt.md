You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
Build a static documentation site deployed on Cloudflare Pages at a custom docs subdomain, providing comprehensive guides for all WRL features. The site is generated from the repo's existing openapi.yaml and markdown content, styled with the WRL brand design system, and automatically deployed on push to main.

Success criteria include: 6 content pages (Getting Started, API Reference, Auth, Verification, MCP, Batch), WRL brand design, Lighthouse accessibility >= 90.

Constraints: No JS framework, 11ty or plain HTML only, uses existing WRL brand design system.

## Your Planning Question
For a 6-page developer docs site, what navigation and reading patterns reduce cognitive load? Sidebar vs top nav vs both? Homepage vs Getting Started as default? Code example presentation? How to handle API reference relation to guides? What minimal nav/sidebar additions to the existing design system?

## Context
Read these files to understand the codebase:
- `src/design-system.css` — the WRL brand design system (colors, typography, tokens)
- Consider the 6 pages: Getting Started, API Reference, Auth, Verification, MCP, Batch
- Constraint: plain HTML/CSS, Lighthouse accessibility >= 90

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that aren't already part of the planning, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: ux-strategy-minion

### Recommendations
<your expert recommendations for this aspect of the task>

### Proposed Tasks
<specific tasks that should be in the execution plan>
For each task: what to do, deliverables, dependencies

### Risks and Concerns
<things that could go wrong from your domain perspective>

### Additional Agents Needed
<any specialists not yet involved who should be, and why>
(or "None" if the current team is sufficient)

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-BCSxCY/r19-documentation-site/phase2-ux-strategy-minion.md`
