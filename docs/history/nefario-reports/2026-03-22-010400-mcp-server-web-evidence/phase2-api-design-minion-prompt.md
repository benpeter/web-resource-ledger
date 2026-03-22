# Phase 2: API-Design-Minion Planning Consultation

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

**Scope**:
- In: Thin MCP adapter over existing API, 3 tool definitions, Streamable HTTP transport, documentation
- Out: New capture capabilities beyond existing API, agent-specific UX, MCP auth beyond API key

## Your Planning Question

The three MCP tools (`capture_url`, `get_capture`, `verify_capture`) map to existing REST endpoints: `POST /v1/captures`, `GET /v1/captures/{id}`, `GET /v1/verify/{id}`. The REST API uses RFC 7807 problem responses, async 202 with polling for capture, cursor-paginated list, and content negotiation for verification. How should the tool schemas be designed to give AI agents the best experience? Specifically: (1) Should `capture_url` block until complete (poll internally) or return the capture ID for the agent to poll via `get_capture`? (2) Should `get_capture` also serve as the list/search tool, or should there be a 4th `list_captures` tool? (3) What should the tool output format be -- the full JSON response, or a curated summary optimized for LLM context windows? (4) The task scope says 3 tools, but the backlog mentions "R1 (list endpoint) must exist -- agents need to retrieve their captures." Should we add a `list_captures` tool as a 4th tool?

## Context

Read these files for full API context:
- `openapi.yaml` — endpoint contracts, request/response shapes
- `src/index.js` — handler implementations, routing
- `src/kv.js` — data access layer
- `src/verify.js` — verification logic

Working directory: /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/snappy-bouncing-sloth

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that aren't already part of the planning, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: api-design-minion

### Recommendations
<your expert recommendations>

### Proposed Tasks
<specific tasks that should be in the execution plan>

### Risks and Concerns
<things that could go wrong from your domain perspective>

### Additional Agents Needed
<or "None" if the current team is sufficient>

6. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-uxrItw/mcp-server-web-evidence/phase2-api-design-minion.md
