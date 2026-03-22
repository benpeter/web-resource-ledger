# R15: MCP Server for Web Evidence Capture

**Source**: GitHub Issue #45

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
