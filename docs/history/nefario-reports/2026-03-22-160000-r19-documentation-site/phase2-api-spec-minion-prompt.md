You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
Build a static documentation site deployed on Cloudflare Pages at a custom docs subdomain, providing comprehensive guides for all WRL features. The site is generated from the repo's existing openapi.yaml and markdown content, styled with the WRL brand design system, and automatically deployed on push to main.

Success criteria include: API reference generated from openapi.yaml (not hand-written) and stays in sync via CI.

Constraints: No JS framework, openapi.yaml is single source of truth for API reference, no Swagger UI.

## Your Planning Question
How should the 2,868-line openapi.yaml be rendered into static HTML without Swagger UI? Options include: Redocly build (already a devDep), 11ty plugin, custom build script. What CI check ensures rendered HTML stays in sync? Single long page or split by tag?

## Context
Read these files to understand the codebase:
- `openapi.yaml` — the OpenAPI spec (structure, tags, endpoints)
- `redocly.yaml` — existing Redocly configuration
- `package.json` — check for existing redocly dependency and scripts
- Any existing API documentation in docs/

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that aren't already part of the planning, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: api-spec-minion

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

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-BCSxCY/r19-documentation-site/phase2-api-spec-minion.md`
