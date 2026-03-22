# Phase 2: User-Docs-Minion Planning Consultation

You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise
to help build a comprehensive plan.

## Project Task

**Outcome**: Any MCP-compatible AI agent can capture and verify web pages as part of its workflow, positioning WRL as "the MCP server for web evidence" — a niche with zero current occupants.

**Success criteria**:
- MCP server exposes 3 tools: `capture_url`, `get_capture`, `verify_capture`
- Streamable HTTP transport (Cloudflare Workers compatible)
- Documentation includes MCP server configuration examples
- Listed in MCP server directories

## Your Planning Question

What documentation artifacts are needed? Specifically: (1) What does an MCP server config snippet look like for Claude Code (`claude_desktop_config.json` or similar), Cursor, and other MCP clients? (2) Which MCP server directories exist and what is the submission process for each? (3) Should the README get an MCP section, or should there be a dedicated `docs/mcp.md`? (4) What level of tutorial content is needed -- just config snippets, or a full "capture your first page via MCP" walkthrough?

## Context

Read these files:
- `README.md` — current README structure
- `docs/` directory structure — existing documentation

Working directory: /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/snappy-bouncing-sloth

The MCP server will be accessible at the production URL (wrl.benpeter.workers.dev) with an `/mcp` endpoint. Auth uses a Bearer token (WRL API key). The target audience is AI agent developers and LLM power users configuring MCP servers in their tools.

## Instructions
1. Read relevant files to understand the current state
2. Research current MCP server directories and submission processes (web search)
3. Research config format for major MCP clients (Claude Code, Claude Desktop, Cursor)
4. Apply your domain expertise to the planning question
5. Identify risks, dependencies, and requirements from your perspective
6. Return your contribution in this format:

## Domain Plan Contribution: user-docs-minion

### Recommendations
<your expert recommendations>

### Proposed Tasks
<specific tasks>

### Risks and Concerns
<things that could go wrong>

### Additional Agents Needed
<or "None">

7. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-uxrItw/mcp-server-web-evidence/phase2-user-docs-minion.md
