# Domain Plan Contribution: user-docs-minion

## Recommendations

### 1. Documentation Architecture: Dedicated `docs/mcp.md` + README Section

**Recommendation: Both.** Add a concise MCP section to the README (4-6 lines with a link) AND create a dedicated `docs/mcp.md` page.

**Rationale:**
- The README is already long (420+ lines). Adding full MCP config snippets for 4+ clients would bloat it and dilute the current REST API flow.
- The README MCP section serves as a discovery point: "WRL is available as an MCP server" with a one-liner and a link.
- `docs/mcp.md` is the real landing page: config snippets, tool descriptions, a quickstart walkthrough, and troubleshooting.
- This mirrors the existing pattern where README points to OPERATIONS.md, CONTRIBUTING.md, and openapi.yaml for deeper content.

**README addition (proposed location: after "Offline verification" section, before "Finding and sharing captures"):**

```markdown
#### MCP server (AI agent integration)

WRL is available as an MCP server for AI agents. Configure your MCP client
to connect to `https://wrl.example.com/mcp` with your API key as a Bearer
token. See [docs/mcp.md](docs/mcp.md) for setup instructions for Claude Code,
Claude Desktop, Cursor, Windsurf, and other MCP clients.
```

### 2. MCP Client Configuration Snippets

Based on verified research, here are the exact config formats needed. The documentation must include snippets for the four major MCP clients:

#### Claude Code (CLI command + JSON equivalent)
```bash
claude mcp add wrl --transport http \
  --header "Authorization: Bearer YOUR_WRL_API_KEY" \
  https://wrl.example.com/mcp
```

JSON alternative (`claude mcp add-json`):
```json
{
  "type": "http",
  "url": "https://wrl.example.com/mcp",
  "headers": {
    "Authorization": "Bearer YOUR_WRL_API_KEY"
  }
}
```

#### Claude Desktop
Claude Desktop does NOT support remote servers via `claude_desktop_config.json`. Remote MCP servers are configured through **Settings > Connectors** in the UI. The documentation should state this clearly and note that OAuth is the preferred auth mechanism for Claude Desktop connectors. For API-key-based servers like WRL, Claude Desktop may require the MCP server to support OAuth or users may need to use the stdio bridge pattern. This is a potential gap that needs verification during implementation.

#### Cursor (`.cursor/mcp.json`)
```json
{
  "mcpServers": {
    "wrl": {
      "url": "https://wrl.example.com/mcp",
      "headers": {
        "Authorization": "Bearer ${env:WRL_API_KEY}"
      }
    }
  }
}
```

Note: Cursor supports `${env:VAR}` interpolation for secrets.

#### Windsurf (`~/.codeium/windsurf/mcp_config.json`)
```json
{
  "mcpServers": {
    "wrl": {
      "serverUrl": "https://wrl.example.com/mcp",
      "headers": {
        "Authorization": "Bearer ${env:WRL_API_KEY}"
      }
    }
  }
}
```

Note: Windsurf uses `serverUrl` not `url` for remote HTTP servers. Also supports `${env:VAR}` interpolation.

### 3. MCP Server Directories: Submission Strategy

Based on research, there are two tiers of directories worth targeting:

#### Tier 1: Official / High-Signal (submit at launch)

| Directory | Submission Process | Priority |
|-----------|-------------------|----------|
| **Official MCP Registry** (`registry.modelcontextprotocol.io`) | Use `mcp-publisher` CLI. Requires: `server.json` with remotes array, GitHub auth (`io.github.benpeter/wrl`), npm package optional (remote-only is valid). Publish with `mcp-publisher publish`. | **Highest** -- this is what Claude Code, Claude Desktop, and other Anthropic products query. |
| **awesome-mcp-servers** (`github.com/punkpeye/awesome-mcp-servers`) | GitHub PR to add entry under appropriate category (likely "Search & Data Extraction" or a new "Web Archiving / Evidence" category). Format: repo link + language badge + scope badge. | **High** -- 70k+ stars, the de facto community list. |
| **modelcontextprotocol/servers** (`github.com/modelcontextprotocol/servers`) | GitHub PR. This is the official reference servers repo. Would require the server to be high-quality and well-documented. | **High** -- but may be selective. |

#### Tier 2: Community Aggregators (submit after launch)

| Directory | Notes |
|-----------|-------|
| **Glama** (`glama.ai/mcp/servers`) | 19k+ servers. Has "Add Server" button. Can claim server for admin access. |
| **PulseMCP** (`pulsemcp.com/servers`) | 8k+ servers. Auto-indexes from GitHub. |
| **mcp.so** | 18k+ servers. Community-driven. |
| **Smithery** (`smithery.ai`) | Smaller but curated. |

**Recommendation:** Focus on Tier 1 at launch. Tier 2 directories often auto-discover servers from GitHub and the official registry, so they may list WRL without manual submission.

#### Registry `server.json` for WRL

```json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  "name": "io.github.benpeter/wrl",
  "title": "Web Resource Ledger",
  "description": "Capture web pages with cryptographic proof. Screenshots, rendered HTML, and Ed25519-signed WACZ bundles with RFC 3161 timestamps.",
  "version": "1.0.0",
  "repository": {
    "url": "https://github.com/benpeter/web-resource-ledger",
    "source": "github"
  },
  "remotes": [
    {
      "type": "streamable-http",
      "url": "https://wrl.benpeter.workers.dev/mcp",
      "headers": [
        {
          "name": "Authorization",
          "description": "Bearer token with your WRL API key (e.g., 'Bearer wrl_live_...')",
          "isRequired": true,
          "isSecret": true
        }
      ]
    }
  ]
}
```

This file should live at `server.json` in the repo root.

### 4. Tutorial Depth: Quick Config + Full Walkthrough

**Recommendation: Both levels.** The `docs/mcp.md` page should use progressive disclosure:

1. **Quick setup** (top of page, 3 steps): Install config, set env var, verify connection. This is for users who know MCP and just need the snippet. Target: under 60 seconds to working connection.

2. **Full walkthrough** (below, expandable or separate section): "Capture your first page via MCP" -- a guided tutorial showing the complete capture-poll-verify roundtrip from an AI agent's perspective. This is critical because:
   - The three WRL tools have a workflow dependency (capture, then poll, then verify) that needs explanation.
   - Users unfamiliar with WRL need to understand what they get back (screenshots, HTML, signed WACZ, verification URL).
   - The polling pattern (`get_capture` until `status: complete`) is non-obvious for an MCP tool.
   - A concrete example makes the value proposition tangible: "Your AI agent just captured cryptographic evidence of a web page."

3. **Tool reference** (bottom): Table of the 3 tools with parameters, return values, and error cases. This is the reference section for ongoing use.

### 5. Proposed `docs/mcp.md` Structure

```
# MCP Server

## Quick Setup
  ### Claude Code
  ### Cursor
  ### Windsurf
  ### Claude Desktop
  ### Other MCP Clients (generic Streamable HTTP)

## Available Tools
  ### capture_url
  ### get_capture
  ### verify_capture

## Tutorial: Capture Your First Page
  (3-step walkthrough: capture -> poll -> verify)

## Troubleshooting
  - Connection refused / 401 Unauthorized
  - Capture stays in "pending" (timeout)
  - Tool not showing in client

## MCP Server Directories
  (Links to where WRL is listed)
```

### 6. Tool Descriptions (for MCP tool metadata AND docs)

The tool descriptions shown to the AI agent in the MCP tool listing are themselves documentation. They must be clear, actionable, and include enough context for an LLM to use the tools correctly without reading external docs. Proposed descriptions:

**`capture_url`**: "Submit a URL for cryptographic capture. Returns a capture ID for tracking. The capture runs asynchronously -- use get_capture to poll for completion. Produces screenshots (before and after cookie consent), rendered HTML, HTTP headers, and a signed WACZ evidence bundle."

**`get_capture`**: "Get the status and artifacts of a capture by ID. Poll this tool until status is 'complete' or 'failed'. When complete, returns artifact URLs (screenshot, HTML, headers, WACZ) and a shareable verification URL. The capture ID is the access secret -- anyone with it can view the capture."

**`verify_capture`**: "Verify the cryptographic integrity of a capture. Checks artifact hashes, bundle hash, Ed25519 signature, and RFC 3161 timestamp. Returns a verification result with pass/fail for each check. Use this to confirm a capture has not been tampered with."

These descriptions should be reviewed by whoever implements the MCP tool definitions to ensure they match the actual parameter schemas.

## Proposed Tasks

### T1: Create `docs/mcp.md` with full documentation
- Quick setup snippets for Claude Code, Cursor, Windsurf, Claude Desktop, and generic Streamable HTTP
- Tool reference table (parameters, return values, errors)
- "Capture your first page" tutorial walkthrough
- Troubleshooting section
- **Depends on**: MCP server implementation being at least partially done (tool names and parameters finalized)

### T2: Add MCP section to README
- 4-6 line section after "Offline verification", before "Finding and sharing captures"
- One-liner description + link to `docs/mcp.md`
- **Depends on**: T1

### T3: Create `server.json` for MCP Registry
- Registry metadata file in repo root
- Remote server definition with Streamable HTTP transport
- Header definition for Bearer auth
- **Depends on**: MCP endpoint URL being finalized

### T4: Submit to Official MCP Registry
- Install `mcp-publisher` CLI
- Authenticate with GitHub (`io.github.benpeter/wrl` namespace)
- Publish `server.json`
- Verify listing at `registry.modelcontextprotocol.io`
- **Depends on**: T3, MCP server deployed and publicly accessible

### T5: Submit to awesome-mcp-servers
- Open PR to `punkpeye/awesome-mcp-servers`
- Add entry under appropriate category with repo link, TypeScript badge, cloud badge
- **Depends on**: MCP server deployed, `docs/mcp.md` published

### T6: Write MCP tool descriptions
- Draft the `description` field for each of the 3 MCP tools
- These are shown to the AI agent in the tool listing and are the primary "documentation" the agent sees
- Must be accurate enough for an LLM to use the tools correctly without external docs
- **Depends on**: Tool parameter schemas finalized

### T7: Verify Claude Desktop compatibility
- Test whether WRL's Bearer-token auth works with Claude Desktop's Connectors UI
- If not, document the limitation and workaround (or flag for OAuth implementation)
- **Depends on**: MCP server deployed

## Risks and Concerns

### Risk 1: Claude Desktop auth gap
Claude Desktop requires remote MCP servers to be configured through the Settings > Connectors UI, not via `claude_desktop_config.json`. It primarily supports OAuth-based authentication for remote servers. WRL uses API key Bearer tokens, not OAuth. There may be a compatibility gap where Claude Desktop cannot connect to WRL without an OAuth adapter. This needs to be tested early. If confirmed, the docs should document the limitation clearly rather than providing a broken config snippet.

### Risk 2: Polling pattern is unusual for MCP tools
MCP tools are typically request-response. WRL's capture workflow requires polling (`get_capture` in a loop). Most AI agents handle this fine (they can call tools multiple times), but the tool description for `get_capture` must explicitly instruct the agent to poll. If the description is unclear, agents will call `get_capture` once, see `status: pending`, and report failure. The documentation and tool descriptions must make the polling pattern unmistakable.

### Risk 3: MCP Registry is in preview
The official MCP Registry is still in preview as of March 2026 and warns of potential "breaking changes or data resets." The `server.json` schema and `mcp-publisher` CLI may change. Plan for re-submission if the registry resets. Version the `server.json` file in the repo so it can be updated.

### Risk 4: Directory submission timing
Directory submissions should happen AFTER the MCP server is deployed and publicly accessible. Submitting before the server works will result in rejection or a broken listing. The documentation tasks (T1, T2) can be written in parallel with implementation, but T4 and T5 must wait for deployment.

### Risk 5: Config snippet accuracy
MCP client configuration formats vary across clients AND change between client versions. The snippets in this plan are based on current (March 2026) documentation for Claude Code, Cursor, and Windsurf. These formats may change. The docs should include a "last verified" date and link to each client's official MCP documentation for the authoritative format.

### Risk 6: Tool descriptions are load-bearing documentation
For MCP servers, the tool `description` field is often the ONLY documentation the AI agent reads before deciding how to use a tool. If descriptions are vague or inaccurate, agents will misuse the tools. These descriptions deserve the same care as API documentation. They should be reviewed by someone who has tested the actual tool behavior, not just written from the API spec.

## Additional Agents Needed

- **devx-minion**: Needed to review the `server.json` registry file for correctness, validate the `mcp-publisher` workflow, and ensure the MCP tool parameter schemas are well-structured for developer consumption.
- **software-docs-minion**: If `openapi.yaml` needs updating to reflect the `/mcp` endpoint, or if the MCP tool schemas need formal API reference documentation.

No other agents needed -- the user-facing documentation (docs/mcp.md, README, tool descriptions, directory submissions) falls squarely within user-docs-minion scope.
