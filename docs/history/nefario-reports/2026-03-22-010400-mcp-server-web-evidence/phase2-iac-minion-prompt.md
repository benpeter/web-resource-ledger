# Phase 2: IAC-Minion Planning Consultation

You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise
to help build a comprehensive plan.

## Project Task

**Outcome**: Any MCP-compatible AI agent can capture and verify web pages as part of its workflow, positioning WRL as "the MCP server for web evidence" — a niche with zero current occupants.

**Success criteria**:
- MCP server exposes 3 tools: `capture_url`, `get_capture`, `verify_capture`
- Streamable HTTP transport (Cloudflare Workers compatible)
- Tools map directly to existing REST API endpoints

## Your Planning Question

Adding `@modelcontextprotocol/server` and `zod` to the Worker introduces new dependencies to a project that currently has only 3 runtime deps (`@cloudflare/playwright`, `fflate`, `@duckduckgo/autoconsent`). What is the impact on: (1) Worker bundle size (Cloudflare has a 10MB compressed limit for Workers with browser binding)? (2) Cold-start latency? (3) CI build time? (4) Should the MCP route be in the same Worker or a separate Worker (same wrangler.toml with service bindings, or separate project)? The project uses `wrangler` for builds with no bundler config -- will the SDK's ESM exports work cleanly?

## Context

Read these files:
- `wrangler.toml` — Worker config, bindings, environments
- `package.json` — current dependencies
- `src/index.js` — entry point, router pattern

Working directory: /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/snappy-bouncing-sloth

## Instructions
1. Read relevant files to understand the current state
2. Research the bundle size of @modelcontextprotocol/server and zod (check npm, unpkg, or bundlephobia)
3. Apply your domain expertise to the planning question
4. Identify risks, dependencies, and requirements from your perspective
5. Return your contribution in this format:

## Domain Plan Contribution: iac-minion

### Recommendations
<your expert recommendations>

### Proposed Tasks
<specific tasks>

### Risks and Concerns
<things that could go wrong>

### Additional Agents Needed
<or "None">

6. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-uxrItw/mcp-server-web-evidence/phase2-iac-minion.md
