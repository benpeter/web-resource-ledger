MODE: META-PLAN

You are creating a revised meta-plan after a team adjustment.

## Task

<github-issue>
R35: MCP directory listings and ecosystem (GitHub Issue #114)

**Outcome**: WRL is discoverable in the MCP ecosystem and web archiving communities. The MCP server is listed on major directories (MCP.so, Smithery, Glama), included in Awesome MCP Servers, and has published integration examples for popular MCP clients. The @w-r-l/verify npm package and the project itself appear in relevant "awesome" lists and web archiving tool indexes, driving organic adoption.

**Success criteria**:
- MCP server listed on at least two of: MCP.so, Smithery, Glama
- Pull request submitted to Awesome MCP Servers with WRL entry
- Integration examples published for Claude Code, Cursor, and at least one other MCP client
- WRL listed in at least one web archiving tool index or directory
- @w-r-l/verify npm package submitted to at least one relevant "awesome" list
- All directory listings link back to the docs site and GitHub repo
- Integration examples are tested and working against the current API
</github-issue>

## Codebase Context

Key URLs and artifacts:
- MCP server endpoint: https://api.webresourceledger.com/mcp
- GitHub repo: https://github.com/ArtificialArchitects/web-resource-ledger (public)
- Docs site: https://docs.webresourceledger.com
- NPM package: @w-r-l/verify v0.2.1
- Landing page: https://webresourceledger.com
- MCP tools: capture_url, get_capture, list_captures, verify_capture
- Existing MCP docs: docs/mcp.md and site/content/mcp.md (with Claude Code, Cursor, Windsurf setup)
- OpenAPI spec: openapi.yaml
- Existing server.json (MCP registry schema 2025-10-17) in repo
- No existing directory submission files (no smithery.yaml, no .well-known/mcp.json)

## Original Meta-Plan

The following meta-plan was produced for the original team. Use it as context for the revised plan, not as a template to minimally edit.

Read from: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-FOw8HK/mcp-directory-listings-ecosystem/phase1-metaplan.md

## Team Adjustment

Added: none
Removed: user-docs-minion (web archiving community research absorbed by mcp-minion)

Revised team: mcp-minion, devx-minion, product-marketing-minion

## Constraints
- Keep the same scope and task description
- Preserve external skill integration decisions unless the team change removes all agents relevant to a skill's domain
- Generate planning consultations for ALL agents in the revised team
- Re-evaluate the cross-cutting checklist against the new team
- Produce output at the same depth and format as the original
- Do NOT change the fundamental scope of the task
- Do NOT add agents the user did not request (beyond cross-cutting requirements)
- Design planning questions as a coherent set -- each question should address aspects that no other agent on the team covers, and questions should reference cross-cutting boundaries where relevant
- mcp-minion now also covers web archiving directory/community identification in addition to MCP directory requirements

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/luminous-chasing-lampson

## Instructions
1. Read the original meta-plan for context
2. Generate planning consultations for ALL 3 agents in the revised team
3. Ensure mcp-minion's question now includes web archiving directory identification
4. Re-evaluate the cross-cutting checklist
5. Write your complete revised meta-plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-FOw8HK/mcp-directory-listings-ecosystem/phase1-metaplan-rerun.md
