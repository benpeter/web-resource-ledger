You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
Build a static documentation site deployed on Cloudflare Pages at a custom docs subdomain, providing comprehensive guides for all WRL features. The site is generated from the repo's existing openapi.yaml and markdown content, styled with the WRL brand design system, and automatically deployed on push to main.

Success criteria include:
- Getting Started guide walks a new user from API key to first verified capture in under 5 minutes
- Auth guide covers per-tenant API keys, admin keys, scopes, and the legacy single-key mode
- Verification guide explains the cryptographic chain: Ed25519 signature, RFC 3161 timestamp, WACZ bundle structure, and `npx @w-r-l/verify` usage
- MCP guide documents the MCP server tool interface, setup, and example agent workflows
- Batch guide covers the batch capture endpoint request/response format and polling pattern

## Your Planning Question
For 6 content pages (Getting Started, API Reference, Auth, Verification, MCP, Batch), what information architecture serves a new WRL user best? Getting Started must go from API key to verified capture in < 5 minutes. What to assume about prerequisites? How does the docs site relate to (not duplicate) the README? How deep into Ed25519/RFC 3161 cryptography should the verification guide go?

## Context
Read these files to understand the codebase:
- `README.md` — current project documentation
- `openapi.yaml` — API spec (especially securitySchemes section)
- `packages/verify/README.md` — verify package documentation
- `packages/mcp-server/` — MCP server package (look for README or docs)
- `src/` — source code for understanding auth flow, capture flow, batch endpoints

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that aren't already part of the planning, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: user-docs-minion

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

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-BCSxCY/r19-documentation-site/phase2-user-docs-minion.md`
