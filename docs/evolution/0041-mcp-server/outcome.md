# Outcome: MCP Server for Web Evidence

## What Was Built

A thin MCP adapter over the existing WRL REST API, exposing four tools via Streamable HTTP transport at `/mcp`. Any MCP-compatible AI agent can now capture and verify web pages as part of its workflow.

### Files Created
- `src/mcp.js` (519 lines) -- MCP server factory and request handler with 4 tool definitions
- `test/mcp.test.js` (482 lines) -- 22 integration tests covering protocol, auth, CORS, all tools
- `docs/mcp.md` (321 lines) -- Setup guides (Claude Code, Cursor, Windsurf), tool reference, tutorial, troubleshooting
- `server.json` (22 lines) -- MCP registry metadata for directory listing

### Files Modified
- `src/verify.js` (+64 lines) -- Extracted `performVerification` shared orchestrator
- `src/index.js` (~+20/-23 lines) -- MCP route mount, verify refactoring to use shared function
- `README.md` (+6 lines) -- MCP section pointing to docs/mcp.md
- `package.json` -- Added `@modelcontextprotocol/sdk: ^1.27.1` and `zod: ^4.3.6`

### Key Numbers
- 4 MCP tools: `capture_url`, `get_capture`, `list_captures`, `verify_capture`
- 22 new tests, 607 total (0 failures)
- 2 new production dependencies (MCP SDK + Zod)
- 0 new business logic -- all tool handlers delegate to existing functions

## Success Criteria Assessment

| Criterion | Status |
|-----------|--------|
| MCP server exposes tools | Done: 4 tools (3 required + list_captures) |
| Streamable HTTP transport | Done: WebStandardStreamableHTTPServerTransport |
| Tools map to existing REST API | Done: direct function calls, no HTTP self-requests |
| MCP client round-trip | Done: test suite exercises full capture-verify flow |
| Documentation with config examples | Done: Claude Code, Cursor, Windsurf, generic |
| Listed in MCP server directories | Done: server.json with registry metadata |

## Surprises

1. **Transport class name**: The SDK exports `WebStandardStreamableHTTPServerTransport` (not `StreamableHTTPServerTransport`), which is the web-standard variant using `Request`/`Response` instead of Node.js `http` module. Had to verify by reading node_modules.

2. **Accept header requirement**: MCP Streamable HTTP transport requires `Accept: application/json, text/event-stream` on POST requests, returning 406 without it. Discovered during test writing.

3. **`r.id` vs `r.captureId` bug**: Initial implementation used `r.id` in `list_captures` output, but KV records store the field as `captureId`. Caught during lucy's gate review before merge.

4. **Zod v4 compatibility**: MCP SDK `^1.27.1` peer dependency accepts both `^3.25 || ^4.0`. Went with v4 as the current major.

## What Was NOT Built

- No new capture capabilities beyond existing API
- No agent-specific UX or agent memory
- No MCP auth beyond API key (no OAuth, no session management)
- No SSE streaming (stateless JSON responses only)
- No separate Worker or wrangler.toml entry

## Backlog Changes

- **Marked done**: #45 R15: MCP server for web evidence [M]
- **No new items deferred**: All scope items completed as specified
- **No parking lot additions**: No deferred work from this phase
