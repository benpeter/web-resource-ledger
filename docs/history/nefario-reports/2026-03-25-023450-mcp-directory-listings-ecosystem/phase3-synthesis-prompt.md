MODE: SYNTHESIS

You are synthesizing specialist planning contributions into a final execution plan.

## Original Task

R35: MCP directory listings and ecosystem (GitHub Issue #114)

Make WRL discoverable in the MCP ecosystem and web archiving communities. List the MCP server on major directories, submit to Awesome MCP Servers, publish integration examples, submit to web archiving tool indexes.

Success criteria:
- MCP server listed on at least two of: MCP.so, Smithery, Glama
- Pull request submitted to Awesome MCP Servers with WRL entry
- Integration examples published for Claude Code, Cursor, and at least one other MCP client
- WRL listed in at least one web archiving tool index or directory
- @w-r-l/verify npm package submitted to at least one relevant "awesome" list
- All directory listings link back to the docs site and GitHub repo
- Integration examples are tested and working against the current API

## Specialist Contributions

Read the following scratch files for full specialist contributions:
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-FOw8HK/mcp-directory-listings-ecosystem/phase2-mcp-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-FOw8HK/mcp-directory-listings-ecosystem/phase2-devx-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-FOw8HK/mcp-directory-listings-ecosystem/phase2-product-marketing-minion.md

## Key consensus across specialists:

### mcp-minion
- Update server.json to schema 2025-12-11 with new headers format
- Prioritize: Official MCP Registry (via mcp-publisher), Glama (needs glama.json), Awesome MCP Servers (both repos)
- Skip Smithery (Docker architecture mismatch with WRL's Cloudflare Worker)
- Submit to MCP.so and PulseMCP via GitHub issues/forms
- Web archiving: PR to IIPC awesome-web-archiving ("Acquisition" + "Utilities"); COPTR wiki entries
- Risk: repo URL discrepancy, no logo, MCP registry in preview, WACZ signing divergence framing

### devx-minion
- Add VS Code + GitHub Copilot (largest user base, native Streamable HTTP)
- Add Cline (5M+ installs, config similar to Cursor)
- Not recommended: Zed (stdio-only), Continue (pivoted away)
- Structure: config snippet + context + "try it" prompt on single docs page
- CRITICAL: docs/mcp.md uses capture_url vs site/content/mcp.md uses capture_page -- must fix before submissions
- No separate files per client needed

### product-marketing-minion
- Vary positioning by audience: MCP (agent workflow), web archiving (WACZ/standards), legal (eIDAS/FRE)
- "Evidence" is the key differentiator from screenshot tools
- Awesome MCP Servers: "Legal" category (avoid "Browser Automation" graveyard)
- websiteUrl in server.json → docs.webresourceledger.com
- "In Development" status for IIPC listings
- Draft 6 directory-specific descriptions provided
- Wants software-docs-minion for integration guide content

## External Skills Context
No external skills detected.

## Codebase Context

Key URLs:
- MCP server: https://api.webresourceledger.com/mcp
- GitHub: https://github.com/benpeter/web-resource-ledger (NOTE: actual remote is benpeter, not ArtificialArchitects)
- Docs: https://docs.webresourceledger.com
- Landing: https://webresourceledger.com
- NPM: @w-r-l/verify v0.2.1

Key files:
- server.json (existing MCP registry manifest)
- docs/mcp.md (reference docs)
- site/content/mcp.md (published docs site)
- openapi.yaml

## Instructions
1. Review all specialist contributions
2. Resolve any conflicts between recommendations
3. Incorporate risks and concerns into the plan
4. Create the final execution plan in structured format
5. Ensure every task has a complete, self-contained prompt
6. Key conflicts to resolve:
   - capture_url vs capture_page naming inconsistency (devx flagged)
   - Smithery: mcp-minion says skip due to Docker mismatch, but success criteria mentions it
   - Awesome MCP Servers category: mcp-minion says "Search & Data Extraction" or "Security", marketing says "Legal"
   - Whether to include Cline marketplace submission (separate from awesome list)
   - Number of external PRs/submissions to create
7. Write your complete delegation plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-FOw8HK/mcp-directory-listings-ecosystem/phase3-synthesis.md
