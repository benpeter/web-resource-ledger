# Phase 3: Synthesis

MODE: SYNTHESIS

You are synthesizing specialist planning contributions into a final execution plan.

## Original Task

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

**Constraints**:
- R1 (list endpoint) must exist — agents need to retrieve their captures
- R11 (TSA) recommended first — "evidence infrastructure for AI" is a stronger pitch with independent timestamps

## Specialist Contributions

Read the following scratch files for full specialist contributions:
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-uxrItw/mcp-server-web-evidence/phase2-mcp-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-uxrItw/mcp-server-web-evidence/phase2-api-design-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-uxrItw/mcp-server-web-evidence/phase2-user-docs-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-uxrItw/mcp-server-web-evidence/phase2-iac-minion.md

## Key consensus across specialists:

### mcp-minion
- Use MCP SDK with WebStandardStreamableHTTPServerTransport in stateless mode
- Mount at /mcp in same Worker
- Auth before transport, thread auth result into tool handlers
- enableJsonResponse: true (no streaming needed)
- ~160KB gzipped bundle impact

### api-design-minion
- 4 tools (add list_captures) — required for agent workflow
- Blocking capture_url with internal polling + SSE progress notifications
- Curated text output format (not raw JSON) for LLM context windows
- Detailed tool schemas with LLM-friendly descriptions

### user-docs-minion
- Dedicated docs/mcp.md + README MCP section
- Config snippets for Claude Code, Cursor, Windsurf, Claude Desktop
- Submit to MCP Registry + awesome-mcp-servers
- Quick-setup + full walkthrough tutorial

### iac-minion
- Separate Worker (wrl-mcp) with service binding to main WRL Worker
- agents package MANDATORY for CF Workers (raw SDK has Node.js deps that won't run on Workers)
- ~293KB gzipped, well within 10MB limit
- Independent deployment via separate wrangler config

## KEY CONFLICT TO RESOLVE

**Same Worker vs Separate Worker + SDK choice:**
- mcp-minion: Use raw @modelcontextprotocol/sdk in same Worker, mount at /mcp
- iac-minion: Raw SDK won't work on CF Workers (has Node.js deps like express, cors, raw-body). Must use Cloudflare's `agents` package which provides WorkerTransport. Recommends separate Worker.

This is a critical architectural decision. The iac-minion actually installed and analyzed the packages. Their finding that the raw SDK carries Node.js-only transitive deps is an empirical finding that should be given weight. However, mcp-minion found that WebStandardStreamableHTTPServerTransport works with web-standard APIs. You need to determine which is correct, or find a middle path.

**Blocking vs Async capture:**
- api-design-minion: Block with internal polling (60s timeout), SSE progress
- mcp-minion: Return capture ID, let agent poll via get_capture

This affects the agent experience significantly.

## External Skills Context

No external skills detected.

## Instructions
1. Review all specialist contributions (read the full files)
2. Resolve the conflicts between recommendations — especially the SDK/Worker architecture conflict
3. Incorporate risks and concerns into the plan
4. Create the final execution plan in structured format
5. Ensure every task has a complete, self-contained prompt
6. Write your complete delegation plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-uxrItw/mcp-server-web-evidence/phase3-synthesis.md
