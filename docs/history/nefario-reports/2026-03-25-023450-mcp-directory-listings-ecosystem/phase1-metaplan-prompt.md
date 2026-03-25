MODE: META-PLAN

You are creating a meta-plan — a plan for who should help plan.

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

**Scope**:
- In: Directory submissions, integration example documents, awesome-list PRs, web archiving community outreach, metadata/manifest files required by directories
- Out: Paid directory placements, conference talks, blog posts (separate effort), social media campaigns

**Constraints**:
- Depends on R15 (MCP server - DONE, at https://api.webresourceledger.com/mcp)
- Depends on R20 (@w-r-l/verify - DONE, published v0.2.1 on npm)
- Depends on R19 (docs site - DONE, at https://docs.webresourceledger.com)
- Directory acceptance is not guaranteed -- success criteria is submission, not acceptance
- Integration examples must work against production API, not mocks
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
- No existing directory submission files (no smithery.yaml, no .well-known/mcp.json)

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/luminous-chasing-lampson

## External Skill Discovery
Scan .claude/skills/ and .skills/ for SKILL.md files.

## Instructions
1. Read relevant files to understand the codebase context
2. Discover external skills
3. Analyze the task against your delegation table
4. Identify which specialists should be CONSULTED FOR PLANNING (not execution — planning)
5. For each specialist, write a specific planning question that draws on their unique expertise
6. Return the meta-plan in the structured format
7. Write your complete meta-plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-FOw8HK/mcp-directory-listings-ecosystem/phase1-metaplan.md
