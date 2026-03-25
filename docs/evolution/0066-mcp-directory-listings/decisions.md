# Decisions: MCP Directory Listings and Ecosystem

## server.json Schema Version

**Chosen:** 2025-12-11 schema with `remotes` array and structured `headers`
**Over:** 2025-10-17 schema with object-style headers
**Why:** Latest schema is required by the Official MCP Registry. The structured headers array (`name`, `description`, `isRequired`, `isSecret`) provides better UX in MCP clients that auto-generate configuration forms.

## server.json Version Bump to 1.0.0

**Chosen:** Version 1.0.0
**Over:** Keeping 0.1.0
**Why:** Directory listings signal production readiness. 1.0.0 communicates stability commitment. The MCP server has been live and functional — pre-release versioning was no longer appropriate for ecosystem listings. Note: `src/mcp.js` still reports 0.1.0 in the McpServer constructor (not modified in this phase per plan scope).

## server.json Description Length

**Chosen:** 87-character description ("Capture web pages as cryptographically signed, tamper-evident evidence with WACZ archives.")
**Over:** 218-character description listing all four tools
**Why:** MCP Registry validation rejects descriptions over 100 characters. Shortened to preserve key differentiators (cryptographic signing, tamper-evidence, WACZ) while meeting the constraint. Tool names are discoverable via the MCP protocol itself.

## Smithery Skip

**Chosen:** Skip Smithery directory
**Over:** Submitting to Smithery
**Why:** mcp-minion found Smithery's architecture requires Docker containerization. WRL is a remote HTTP MCP server, not a stdio server. While Smithery added remote HTTP support, the submission process still expects Docker-based packaging. With 3+ other directories (Official Registry, Glama, MCP.so, PulseMCP) plus 2 awesome-lists, skipping Smithery is justified.

## Awesome MCP Servers Category: Legal

**Chosen:** Legal category (punkpeye/awesome-mcp-servers)
**Over:** "Search & Data Extraction" (mcp-minion's recommendation)
**Why:** product-marketing-minion's "small pond" strategy — Legal has only 2 entries vs. dozens in Search & Data Extraction. WRL is more discoverable with fewer competitors. The evidence-grade capture with cryptographic signing and timestamps maps naturally to legal/compliance use cases.

## appcypher/awesome-mcp-servers Category: Security

**Chosen:** Security section
**Over:** Research & Data
**Why:** Cryptographic signing, tamper-evidence verification, and integrity checking are security-adjacent capabilities. The Security section has fewer entries than Research & Data, maintaining the small-pond positioning strategy.

## awesome-web-archiving Dual Entry

**Chosen:** Two entries — WRL in Acquisition, @w-r-l/verify in Utilities
**Over:** Single entry for WRL only
**Why:** The repo has distinct sections for capture tools (Acquisition) and verification/processing tools (Utilities). @w-r-l/verify is a standalone npm package (0.2.1 published) with its own CLI, warranting its own entry. This also satisfies the success criterion for @w-r-l/verify awesome-list submission.

## Doc Bug Fixes (capture_page, batch_capture, cursor)

**Chosen:** Fix all three doc-code inconsistencies in Task 1
**Over:** Fixing only the naming issues
**Why:** Lucy's review caught that `list_captures` documented a phantom `cursor` parameter while the actual implementation uses `offset`. All 7 real parameters (`status`, `limit`, `offset`, `url`, `created_after`, `created_before`, `sort`) were added. Directory listings drive users to these docs — accuracy is critical for the "tested and working" success criterion.

## Client Config Order

**Chosen:** VS Code, Claude Code, Cursor, Cline, Windsurf, Generic
**Over:** Alphabetical or arbitrary order
**Why:** VS Code has the largest market share among MCP-supporting editors. Claude Code and Cursor are the most active MCP ecosystems. Cline and Windsurf are newer. This order matches likely user priority.

## Official MCP Registry: Human Action Required

**Chosen:** Flag as HUMAN_ACTION_REQUIRED with pre-validated server.json
**Over:** Attempting automated publish
**Why:** `mcp-publisher login github` requires interactive OAuth device flow (visit URL, enter code). Cannot be automated in this session. The server.json passes `mcp-publisher validate` — human only needs to authenticate and publish.
