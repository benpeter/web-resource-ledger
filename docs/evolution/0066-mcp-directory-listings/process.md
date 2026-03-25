# Process: MCP Directory Listings and Ecosystem

## TL;DR

A 3-specialist team (devx-minion, mcp-minion, product-marketing-minion) planned
the work, 5 mandatory + 2 discretionary reviewers (gru, user-docs-minion) vetted
the plan, and a single devx-minion agent executed the foundation task while 7
parallel agents handled external submissions. The planning phase caught three
documentation bugs (wrong tool name, phantom tool, phantom parameter) that would
have propagated into every directory listing. External submissions went to 5
targets: 2 awesome-mcp-servers repos, MCP.so, iipc/awesome-web-archiving, and
awesome-nodejs-security. Total: 10 files changed in-repo, 4 PRs and 1 comment
on external repos.

## Phase 1: Meta-Plan

Nefario identified three specialists for planning:

- **mcp-minion** — MCP registry expertise, directory submission mechanics,
  transport compatibility assessment
- **devx-minion** — Developer experience for client configs, docs structure,
  integration example quality
- **product-marketing-minion** — Positioning strategy for directory descriptions,
  category selection, audience framing

Notable exclusions: security-minion (no new attack surface — changes are markdown
and JSON manifests), test-minion (no executable code changes), frontend-minion
(no UI work). All three would review in Phase 3.5 as mandatory reviewers.

The team was approved without adjustment.

## Phase 2: Specialist Planning

### mcp-minion

Primary contribution: identified the submission mechanics for each directory.
Recommended Official MCP Registry (via `mcp-publisher` CLI), Glama (auto-index
via `glama.json`), MCP.so (GitHub issue submission), and Smithery (Docker
container). Flagged Smithery's Docker requirement as a potential blocker for
WRL's Cloudflare Worker architecture.

Proposed the `server.json` schema upgrade from 2025-10-17 to 2025-12-11 with
structured headers array format. Recommended `capture_url` naming fix in docs
as a precondition.

### devx-minion

Primary contribution: audited all 6 MCP client config formats. Identified that
VS Code/Copilot uses a different secure input pattern (`${input:wrl-api-key}`)
than other clients. Flagged Cline's Streamable HTTP support as unverified
(cline/cline#3315). Recommended ordering client configs by market share.

Found the `capture_page` → `capture_url` naming bug in `site/content/mcp.md`
and the phantom `batch_capture` tool section.

### product-marketing-minion

Primary contribution: the "small pond" category strategy. Argued that WRL should
be listed in the Legal category of punkpeye/awesome-mcp-servers (2 entries)
rather than Search & Data Extraction (50+ entries). Same logic for Security
category in appcypher/awesome-mcp-servers. Recommended audience-appropriate
framing: MCP directories get agent-capability language, IIPC gets WACZ/signing
language with no AI jargon.

## Phase 3: Synthesis

Nefario consolidated into an 8-task plan with one approval gate on Task 1
(foundation work). Key conflict resolutions:

### Smithery: Skip

mcp-minion recommended submitting to Smithery. Nefario decided to skip based on
the Docker architecture mismatch. This turned out to be partially wrong — gru
later noted in Phase 3.5 that Smithery had added URL-based publishing for remote
servers. The skip stood because three other directories (Official Registry,
Glama, MCP.so) already exceeded the "at least two" success criterion.

### Category Selection: Legal over Search & Data Extraction

mcp-minion recommended "Search & Data Extraction." product-marketing-minion
recommended "Legal." Nefario chose Legal — the small-pond positioning was more
compelling than topical accuracy. WRL's cryptographic signing and evidence-grade
captures map naturally to legal use cases.

### server.json Version: 1.0.0

Both margo and gru pushed back on the 1.0.0 version bump. Margo noted it
implies a semver stability commitment on the MCP tool interface. Gru noted the
`src/mcp.js` McpServer constructor still reports 0.1.0, creating a handshake
mismatch. The plan explicitly scoped `src/mcp.js` as out of bounds for this
phase. The version bump stood but the divergence was documented in decisions.md.

### MCP.so Submission: Comment, Not Issue

gru caught that MCP.so submissions are comments on the pinned issue #1, not new
issues. The Task 5 prompt was corrected from `gh issue create` to
`gh issue comment 1`.

## Phase 3.5: Architecture Review

7 reviewers total (5 mandatory + 2 discretionary):

| Reviewer | Verdict | Key Finding |
|----------|---------|-------------|
| lucy | ADVISE | Traced all 7 success criteria to plan tasks. Found Glama relies on passive auto-indexing with no verification step. Noted 1.0.0 vs "In Development" audience-appropriate divergence. |
| margo | ADVISE | Plan is proportional. Questioned 1.0.0 semver commitment. Warned Task 8 target (awesome-nodejs-security) may not fit. |
| security-minion | APPROVE | No security concerns — changes are markdown and JSON. |
| test-minion | APPROVE | No executable code changes to test. |
| ux-strategy-minion | ADVISE | Moved "Try it" callout from after client configs to before Setup section — conversion signal should precede commitment. |
| gru | ADVISE | Smithery skip rationale outdated. MCP.so submission format wrong. server.json/mcp.js version divergence. |
| user-docs-minion | ADVISE | Mandated explicit Cline Streamable HTTP caveat in published docs. |

No BLOCKs. All ADVISE notes were incorporated into task prompts before execution.

## Phase 4: Execution

### Task 1: Foundation (Gate)

devx-minion executed the foundation task: fixed `capture_page` → `capture_url`
in 7+ places, removed phantom `batch_capture` section, updated `server.json`
to 2025-12-11 schema with 1.0.0 version, created `glama.json`, added VS Code
and Cline client configs, moved "Try it" callout before Setup section, added
all 7 real `list_captures` parameters.

Lucy's gate review caught a third doc-code inconsistency: `list_captures`
documented a phantom `cursor` parameter while the actual implementation uses
`offset`. This was fixed immediately — same class of bug as `capture_page`,
just in a different tool's parameter list. All 7 real parameters (`status`,
`limit`, `offset`, `url`, `created_after`, `created_before`, `sort`) were
added to both doc files.

The `server.json` description hit a 100-character registry limit discovered
via `mcp-publisher validate`. Shortened from 218 to 87 characters in a
follow-up commit.

### Tasks 2-8: External Submissions (Parallel)

7 agents ran in parallel after the Task 1 gate:

- **Task 2 (Official MCP Registry)**: `mcp-publisher validate` passes. Cannot
  publish — requires interactive OAuth device flow. Flagged as HUMAN_ACTION_REQUIRED.
- **Task 3 (punkpeye/awesome-mcp-servers)**: PR submitted to Legal category.
- **Task 4 (appcypher/awesome-mcp-servers)**: PR submitted to Security category.
- **Task 5 (MCP.so)**: Comment submitted on chatmcp/mcpso#1.
- **Task 6 (PulseMCP)**: Auto-indexes after registry listing. Flagged as
  HUMAN_ACTION_REQUIRED.
- **Task 7 (iipc/awesome-web-archiving)**: PR submitted with dual entry (WRL
  in Acquisition, @w-r-l/verify in Utilities).
- **Task 8 (@w-r-l/verify awesome list)**: PR submitted to lirantal/awesome-nodejs-security.

## Phases 5-8: Post-Execution Verification

- **Phase 5 (Code Review)**: Lucy and margo reviewed 10 changed files. Changes
  are documentation and JSON manifests — no logic-bearing code. No BLOCKs.
- **Phase 6 (Tests)**: `npm test` passed (1449 tests, 0 failures). `npm run lint:api`
  passed (OpenAPI spec unmodified).
- **Phase 8a (Doc Assessment)**: 0 actionable items — the changes ARE the
  documentation. No Phase 8b needed.

## Human Interventions

This phase ran in autonomous mode with Lucy as gate decision-maker. No human
interventions occurred during execution. Two items flagged for human follow-up:

1. **Official MCP Registry publish**: `mcp-publisher login github && mcp-publisher publish`
   (interactive OAuth device flow)
2. **PulseMCP submission**: Manual after registry listing, or auto-indexes

## Where to Read More

- **Specialist planning contributions**: `docs/history/nefario-reports/2026-03-25-023450-mcp-directory-listings-ecosystem/`
- **Synthesis plan**: `phase3-synthesis.md` in the companion directory
- **Review verdicts**: `phase3.5-*.md` files in the companion directory
- **Decisions with rationale**: `docs/evolution/0066-mcp-directory-listings/decisions.md`
- **Outcome and success criteria**: `docs/evolution/0066-mcp-directory-listings/outcome.md`
