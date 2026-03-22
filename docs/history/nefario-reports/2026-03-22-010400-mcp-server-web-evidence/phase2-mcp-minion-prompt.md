# Phase 2: MCP-Minion Planning Consultation

You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise
to help build a comprehensive plan.

## Project Task

**Outcome**: Any MCP-compatible AI agent can capture and verify web pages as part of its workflow, positioning WRL as "the MCP server for web evidence" — a niche with zero current occupants.

**Success criteria**:
- MCP server exposes 3 tools: `capture_url`, `get_capture`, `verify_capture`
- Streamable HTTP transport (Cloudflare Workers compatible)
- Tools map directly to existing REST API endpoints
- An MCP client (e.g., Claude Code) can complete a full capture-verify round-trip
- Documentation includes MCP server configuration examples
- Listed in MCP server directories

**Scope**:
- In: Thin MCP adapter over existing API, 3 tool definitions, Streamable HTTP transport, documentation, directory listing
- Out: New capture capabilities beyond existing API, agent-specific UX, MCP auth beyond API key

## Your Planning Question

The WRL codebase is a vanilla JS Cloudflare Worker with a hand-rolled regex router (`src/index.js`). The MCP TypeScript SDK provides `WebStandardStreamableHTTPServerTransport` from `@modelcontextprotocol/server` for web-standard runtimes, and `McpServer` for tool registration (using Zod schemas). Two architectural approaches exist: (1) Add the MCP SDK as a dependency and mount the transport at `/mcp` alongside the existing REST routes, sharing the same Worker fetch handler; (2) Build a separate Worker or use a sub-router that delegates to the SDK transport. Given that the project philosophy is YAGNI/KISS with minimal dependencies, but the SDK requires both `@modelcontextprotocol/server` and `zod` as dependencies -- what is the right integration pattern? Should we use stateless mode (`sessionIdGenerator: undefined`) since the tools are simple request-response wrappers? How should auth (existing Bearer token) be handled -- before the MCP transport sees the request, or inside tool handlers?

## Context

Read these files for codebase context:
- `src/index.js` — router pattern, auth flow
- `wrangler.toml` — Worker config
- `package.json` — current deps
- `src/auth.js` — verifyApiKey

Working directory: /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/snappy-bouncing-sloth

## Instructions
1. Read relevant files to understand the current state
2. Research the MCP TypeScript SDK, specifically `WebStandardStreamableHTTPServerTransport` and how it works with Cloudflare Workers. Check the SDK source and documentation.
3. Apply your domain expertise to the planning question
4. Identify risks, dependencies, and requirements from your perspective
5. If you believe additional specialists should be involved that aren't already part of the planning, say so and explain why
6. Return your contribution in this format:

## Domain Plan Contribution: mcp-minion

### Recommendations
<your expert recommendations>

### Proposed Tasks
<specific tasks that should be in the execution plan>
For each task: what to do, deliverables, dependencies

### Risks and Concerns
<things that could go wrong from your domain perspective>

### Additional Agents Needed
<any specialists not yet involved who should be, and why>
(or "None" if the current team is sufficient)

7. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-uxrItw/mcp-server-web-evidence/phase2-mcp-minion.md
