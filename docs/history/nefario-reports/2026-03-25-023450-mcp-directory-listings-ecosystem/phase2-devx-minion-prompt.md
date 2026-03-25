You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task

R35: MCP directory listings and ecosystem (GitHub Issue #114)

Make WRL discoverable in the MCP ecosystem and web archiving communities. List the MCP server on major directories (MCP.so, Smithery, Glama), submit to Awesome MCP Servers, publish integration examples for MCP clients.

## Your Planning Question

Beyond Claude Code, Cursor, and Windsurf (already documented), which MCP clients should we target for integration examples? The success criteria requires "at least one other MCP client." Candidates include: VS Code with Copilot (GitHub MCP support), Cline, Continue, Zed, or custom SDK usage. Which have the largest user base and best MCP support? What should each example cover -- config snippet only, or a worked usage scenario? How should examples be structured in the repo? Consider that directory traffic will land on the docs site -- should examples be self-contained enough to serve as quick-start entry points? Note: devx-minion owns integration example quality and structure, while product-marketing-minion owns positioning copy in directory listings.

## Context

- Existing integration docs: docs/mcp.md and site/content/mcp.md (Claude Code, Cursor, Windsurf, generic MCP client sections)
- Transport: Streamable HTTP (not stdio)
- Auth: Bearer token header (Authorization: Bearer YOUR_API_KEY)
- Docs site: https://docs.webresourceledger.com
- MCP tools: capture_url, get_capture, list_captures, verify_capture
- The "Generic MCP client" section already exists in docs

Read the existing integration docs at:
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/luminous-chasing-lampson/docs/mcp.md
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/luminous-chasing-lampson/site/content/mcp.md

## Instructions
1. Read the existing MCP docs to understand what's already documented
2. Research current MCP client landscape (use WebSearch)
3. Apply your domain expertise to the planning question
4. Identify risks, dependencies, and requirements
5. If you believe additional specialists should be involved, say so
6. Return your contribution in this format:

## Domain Plan Contribution: devx-minion

### Recommendations
<your expert recommendations>

### Proposed Tasks
<specific tasks for the execution plan>

### Risks and Concerns
<things that could go wrong>

### Additional Agents Needed
<or "None">

7. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-FOw8HK/mcp-directory-listings-ecosystem/phase2-devx-minion.md
