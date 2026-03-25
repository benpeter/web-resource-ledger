You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task

R35: MCP directory listings and ecosystem (GitHub Issue #114)

Make WRL discoverable in the MCP ecosystem and web archiving communities. List the MCP server on major directories (MCP.so, Smithery, Glama), submit to Awesome MCP Servers, publish integration examples for MCP clients, submit to web archiving tool indexes and awesome lists.

## Your Planning Question

Two-part question covering both MCP ecosystem and web archiving discoverability.

**Part A -- MCP directories**: What are the current submission requirements for MCP.so, Smithery, and Glama? What manifest files, metadata, or configuration does each directory expect? The project already has a `server.json` (MCP registry schema 2025-10-17) -- is this sufficient for all three, or does each need its own format (e.g., `smithery.yaml`)? Are there additional MCP ecosystem discovery mechanisms (`.well-known/mcp.json`, npm `mcp-server-*` naming conventions) that improve discoverability? What category should WRL be listed under in each directory and in the Awesome MCP Servers list?

**Part B -- Web archiving community**: Which web archiving tool indexes, directories, and community lists should WRL and @w-r-l/verify be submitted to? Candidates: awesome-web-archiving (GitHub), IIPC tools wiki, Webrecorder community listings, COPTR, DigiPres Commons, WACZ-specific lists, npm-focused lists for @w-r-l/verify. For each viable target, what is the submission process and what information does each listing require? Should @w-r-l/verify go to separate lists from the main WRL project?

## Context

- MCP server endpoint: https://api.webresourceledger.com/mcp (Streamable HTTP transport)
- GitHub repo: https://github.com/ArtificialArchitects/web-resource-ledger (Apache 2.0)
- Docs site: https://docs.webresourceledger.com
- NPM package: @w-r-l/verify v0.2.1 (CLI: wrl-verify, zero-install via npx)
- MCP tools: capture_url, get_capture, list_captures, verify_capture
- Auth: Bearer token (per-tenant API key)
- Key features: WACZ format, Ed25519 signing, RFC 3161 timestamps, eIDAS qualified timestamps, FRE 902(13) certificate
- Existing server.json at repo root (MCP registry schema 2025-10-17)
- Existing docs: docs/mcp.md and site/content/mcp.md with Claude Code, Cursor, Windsurf setup

Read the existing server.json at /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/luminous-chasing-lampson/server.json

## Instructions
1. Read relevant files to understand the current state
2. Research current submission requirements for each directory (use WebSearch for current info)
3. Identify which web archiving lists and directories are viable targets
4. Identify risks, dependencies, and requirements from your perspective
5. If you believe additional specialists should be involved, say so and explain why
6. Return your contribution in this format:

## Domain Plan Contribution: mcp-minion

### Recommendations
<your expert recommendations>

### Proposed Tasks
<specific tasks for the execution plan>

### Risks and Concerns
<things that could go wrong>

### Additional Agents Needed
<any specialists not yet involved, or "None">

7. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-FOw8HK/mcp-directory-listings-ecosystem/phase2-mcp-minion.md
