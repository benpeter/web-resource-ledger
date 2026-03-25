# Outcome: MCP Directory Listings and Ecosystem

## What Was Produced

### In-Repo Changes

1. **server.json** — Updated from 2025-10-17 to 2025-12-11 MCP registry schema.
   Version bumped 0.1.0 → 1.0.0. Description shortened to 87 chars (registry
   100-char limit). Headers converted to structured array format. websiteUrl
   set to docs.webresourceledger.com. Passes `mcp-publisher validate`.

2. **glama.json** — New file for Glama auto-indexing. Minimal manifest with
   schema reference and maintainer.

3. **site/content/mcp.md** — Major fixes:
   - Fixed `capture_page` → `capture_url` in 7+ places (critical naming bug)
   - Removed phantom `batch_capture` MCP tool section (doesn't exist in MCP server)
   - Replaced phantom `cursor` param with real `offset` param in `list_captures`
   - Added all 7 real `list_captures` parameters
   - Added VS Code (GitHub Copilot) config with `${input:wrl-api-key}` secure pattern
   - Added Cline config with Streamable HTTP caveat note
   - Reordered client sections: VS Code, Claude Code, Cursor, Cline, Windsurf, Generic
   - Added "Try it" callout before Setup section

4. **docs/mcp.md** — Same parameter fixes and client config additions as site version.

5. **docs/backlog.md** — R35 marked done. GTM parking lot items updated to note
   Phase 0066 shipped (activation condition met).

6. **docs/product-management/positioning.md** — Added "MCP Ecosystem Presence"
   competitive positioning section.

7. **docs/evolution/README.md** — Phase 0066 entry added to index.

### External Submissions

- **punkpeye/awesome-mcp-servers** — PR submitted to Legal category
- **appcypher/awesome-mcp-servers** — PR submitted to Security category
- **MCP.so** — Comment submitted on chatmcp/mcpso#1
- **iipc/awesome-web-archiving** — PR submitted (WRL in Acquisition, @w-r-l/verify in Utilities)
- **@w-r-l/verify awesome list** — PR submitted to relevant awesome list

### Human Actions Required

- **Official MCP Registry**: `mcp-publisher login github && mcp-publisher publish`
  (interactive OAuth device flow). server.json already validates.
- **PulseMCP**: Auto-indexes after registry listing, or manual submission at
  pulsemcp.com/use-cases/submit.

## Success Criteria Assessment

| Criterion | Status |
|-----------|--------|
| MCP server listed on at least two of: MCP.so, Smithery, Glama | Submitted to MCP.so + Glama (auto-index via glama.json). Smithery skipped (Docker mismatch). |
| PR submitted to Awesome MCP Servers | PRs to both punkpeye and appcypher repos |
| Integration examples for Claude Code, Cursor, and at least one other | 6 clients: VS Code, Claude Code, Cursor, Cline, Windsurf, Generic |
| WRL listed in at least one web archiving tool index | PR to iipc/awesome-web-archiving |
| @w-r-l/verify submitted to at least one relevant awesome list | PR submitted + included in awesome-web-archiving Utilities |
| All directory listings link back to docs site and GitHub repo | server.json has websiteUrl + repository |
| Integration examples tested and working against current API | Configs use production endpoint; tool names verified against src/mcp.js |

## What Deviated from Plan

- **server.json description length**: Registry enforces 100-char max, not documented
  in the schema. Discovered via `mcp-publisher validate`. Required shortening from
  218 to 87 chars. The longer description stays in the awesome-list PRs and MCP.so
  submission where space isn't constrained.

- **list_captures cursor→offset**: Lucy caught a third doc-code inconsistency
  during the Task 1 gate review. The docs documented a phantom `cursor` parameter;
  the actual implementation uses `offset`. All 7 real parameters were added to both
  doc files. This was NOT in the original plan but was correctly flagged as the same
  class of bug Task 1 was created to fix.

## Backlog Changes

- **R35 marked done** in resolved items section
- **GTM parking lot items updated**: #148, #136, #137 conditions changed from
  "When GTM efforts start (Phase 0066)" to "Phase 0066 shipped; activate when..."
- **No new items added**: This phase is submission-focused, no deferred work items.
