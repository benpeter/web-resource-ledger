You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
Build a static documentation site deployed on Cloudflare Pages at a custom docs subdomain, providing comprehensive guides for all WRL features. The site is generated from the repo's existing openapi.yaml and markdown content, styled with the WRL brand design system, and automatically deployed on push to main.

Success criteria include: Getting Started guide, API reference generated from openapi.yaml, Auth guide, Verification guide, MCP guide, Batch guide, WRL brand design system styling, custom domain with HTTPS, Lighthouse accessibility >= 90, CI deploy on push to main.

Constraints: No JS framework (11ty or plain HTML only), openapi.yaml is single source of truth for API reference, brand design system should be used.

## Your Planning Question
What is the best approach for building a docs site with 11ty (or plain HTML) that can render openapi.yaml at build time without Swagger UI, reuse the WRL design system tokens from `src/design-system.css`, and stay within the "no JS framework" constraint? How should docs-specific CSS extend the design system (nav, sidebar, code highlighting)? What directory structure (`site/` vs `docs-site/`)?

## Context
Read these files to understand the codebase:
- `src/design-system.css` — the WRL brand design system
- `package.json` — current project dependencies and scripts
- `CLAUDE.md` — engineering philosophy and constraints
- Check for any existing `site/` or `docs/` directories
- Check `redocly.yaml` for existing OpenAPI rendering config

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that aren't already part of the planning, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: frontend-minion

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

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-BCSxCY/r19-documentation-site/phase2-frontend-minion.md`
