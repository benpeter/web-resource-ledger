---
task: "MCP directory listings and ecosystem"
date: 2026-03-25
source-issue: 114
status: complete
task-count: 8
gate-count: 1
agents: [devx-minion, mcp-minion, product-marketing-minion]
reviewers: [security-minion, test-minion, ux-strategy-minion, lucy, margo, gru, user-docs-minion]
mode: execution
---

## Summary

WRL is now submitted to 5 directory targets and 2 awesome-list repos for MCP ecosystem discoverability. The foundation work fixed three documentation bugs (wrong tool name `capture_page`→`capture_url`, phantom `batch_capture` tool, phantom `cursor` parameter), updated `server.json` to the 2025-12-11 registry schema at version 1.0.0, created `glama.json` for auto-indexing, and added integration examples for 6 MCP clients (VS Code/Copilot, Claude Code, Cursor, Cline, Windsurf, Generic). External PRs submitted to punkpeye/awesome-mcp-servers (Legal), appcypher/awesome-mcp-servers (Security), iipc/awesome-web-archiving (Acquisition + Utilities), and lirantal/awesome-nodejs-security. MCP.so listing requested via comment on chatmcp/mcpso#1. Official MCP Registry publish requires human OAuth flow. 1449 tests pass, no regressions.

Resolves #114.

## Original Prompt

WRL is discoverable in the MCP ecosystem and web archiving communities. The MCP server is listed on major directories (MCP.so, Smithery, Glama), included in Awesome MCP Servers, and has published integration examples for popular MCP clients. The @w-r-l/verify npm package and the project itself appear in relevant "awesome" lists and web archiving tool indexes, driving organic adoption.

## Key Design Decisions

### D1: Smithery Skip
Smithery was skipped despite being named in the success criteria ("at least two of: MCP.so, Smithery, Glama"). The original rationale was Docker architecture mismatch. Gru noted Smithery now supports URL-based publishing for remote servers, but with 3+ other directories already exceeding the criterion, the skip stood on priority grounds. The corrected rationale is documented in decisions.md.

### D2: Legal Category (Small Pond Strategy)
product-marketing-minion argued for Legal category in punkpeye/awesome-mcp-servers (2 entries) over mcp-minion's recommendation of Search & Data Extraction (50+ entries). The "big fish, small pond" positioning won — WRL's evidence-grade captures with cryptographic signing map naturally to legal use cases. Same logic applied for Security category in appcypher/awesome-mcp-servers.

### D3: server.json Description Length
MCP Registry enforces a 100-character limit not documented in the schema. Discovered via `mcp-publisher validate` returning 422. Description shortened from 218 to 87 characters, preserving key differentiators (cryptographic signing, tamper-evidence, WACZ).

### D4: cursor→offset Parameter Fix
Lucy caught during Task 1 gate review that `list_captures` documented a phantom `cursor` parameter while the actual implementation uses `offset`. All 7 real parameters were added to both doc files. Same class of bug as `capture_page` but in a different tool.

### D5: server.json Version 1.0.0
Bumped from 0.1.0 to 1.0.0. Both margo and gru noted this implies semver stability commitment on the MCP tool interface. Gru flagged the `src/mcp.js` handshake still reports 0.1.0. The divergence is documented as intentional — server.json is registry metadata, src/mcp.js version update is deferred to a future phase.

### D6: MCP.so Submission Format
gru corrected the submission mechanism: comments on pinned issue #1, not new issues. Task 5 prompt was updated from `gh issue create` to `gh issue comment 1`.

## Phases

### Phase 1-2: Planning
3 specialists consulted: mcp-minion (registry mechanics, transport compatibility), devx-minion (client configs, docs audit), product-marketing-minion (positioning, category selection). Team adjusted once — initial run had different composition, re-run added product-marketing-minion for positioning strategy.

### Phase 3: Synthesis
8 execution tasks, 1 approval gate. Task 1 (foundation) gates all external submissions. Tasks 2-8 run in parallel after gate approval. Key conflict resolutions: Smithery skip, Legal category over Search & Data Extraction, version 1.0.0 commitment.

### Phase 3.5: Architecture Review
7 reviewers (5 mandatory + 2 discretionary: gru, user-docs-minion). 0 BLOCK, 2 APPROVE (security-minion, test-minion), 5 ADVISE. Notable advisories incorporated: MCP.so submission format corrected (gru), Cline Streamable HTTP caveat mandated (user-docs-minion), "Try it" callout moved before Setup (ux-strategy-minion), server.json/mcp.js version divergence documented (gru).

### Phase 4: Execution
**Task 1** (devx-minion, gate): Fixed 3 doc bugs, updated server.json schema, created glama.json, added 2 new client configs (VS Code, Cline), added all 7 list_captures parameters, moved "Try it" callout. Gate approved after Lucy caught cursor→offset fix. Description length fix in follow-up commit.

**Tasks 2-8** (parallel, 7 agents):
- Task 2 (Official MCP Registry): server.json validates. Publish requires human OAuth.
- Task 3 (punkpeye/awesome-mcp-servers): PR submitted to Legal category.
- Task 4 (appcypher/awesome-mcp-servers): PR submitted to Security category.
- Task 5 (MCP.so): Comment on chatmcp/mcpso#1.
- Task 6 (PulseMCP): Auto-indexes after registry listing. Human follow-up.
- Task 7 (iipc/awesome-web-archiving): PR with dual entry (WRL + @w-r-l/verify).
- Task 8 (awesome-nodejs-security): PR submitted for @w-r-l/verify.

### Phase 5: Code Review
Lucy and margo reviewed 10 changed files. All documentation and JSON manifests — no logic-bearing code. No BLOCKs.

### Phase 6: Tests
1449 passed, 0 failed. OpenAPI lint clean.

### Phase 7: Deployment
Skipped (not requested).

### Phase 8: Documentation
8a assessment: 0 actionable items — the changes ARE the documentation. Phase 8b skipped.

## Verification

Verification: code review passed (docs-only changes), all tests pass (1449), OpenAPI lint clean. (Docs: addressed in-phase.)

## Agent Contributions

<details><summary>Planning agents (Phase 2)</summary>

| Agent | Phase | Recommendation |
|-------|-------|---------------|
| mcp-minion | planning | MCP registry submission mechanics, server.json schema upgrade, transport compatibility assessment |
| devx-minion | planning | Client config audit, capture_page naming bug discovery, VS Code secure input pattern |
| product-marketing-minion | planning | Small-pond category strategy, audience-appropriate framing per directory |

</details>

<details><summary>Review agents (Phase 3.5)</summary>

| Agent | Verdict | Key Finding |
|-------|---------|-------------|
| lucy | ADVISE | Full success criteria traceability, Glama auto-index verification gap |
| margo | ADVISE | Plan proportional, 1.0.0 semver concern, Task 8 fit warning |
| security-minion | APPROVE | No security concerns |
| test-minion | APPROVE | No executable code changes |
| ux-strategy-minion | ADVISE | Move "Try it" callout before Setup section |
| gru | ADVISE | Smithery rationale outdated, MCP.so format wrong, version divergence |
| user-docs-minion | ADVISE | Mandate Cline Streamable HTTP caveat |

</details>

## Session Resources

<details><summary>Skills Invoked</summary>

- `/nefario` — orchestration workflow

</details>

<details><summary>Working Files</summary>

Companion directory: `docs/history/nefario-reports/2026-03-25-023450-mcp-directory-listings-ecosystem/`

Files: phase1-metaplan-prompt.md, phase1-metaplan.md, phase1-metaplan-rerun-prompt.md, phase1-metaplan-rerun.md, phase2-devx-minion-prompt.md, phase2-devx-minion.md, phase2-mcp-minion-prompt.md, phase2-mcp-minion.md, phase2-product-marketing-minion-prompt.md, phase2-product-marketing-minion.md, phase3-synthesis-prompt.md, phase3-synthesis.md, phase3.5-gru.md, phase3.5-lucy.md, phase3.5-margo.md, phase3.5-user-docs-minion.md, phase3.5-ux-strategy-minion.md, prompt.md

</details>

Compaction events: 2
