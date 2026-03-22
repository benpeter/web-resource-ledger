---
task: "R15: MCP Server for Web Evidence Capture"
date: 2026-03-22
slug: mcp-server-web-evidence
mode: execution
source-issue: 45
task-count: 5
gate-count: 1
compaction-events: 2
---

## Summary

Built an MCP server adapter for the WRL Cloudflare Worker, exposing 4 tools (`capture_url`, `get_capture`, `list_captures`, `verify_capture`) via Streamable HTTP transport at `/mcp`. Any MCP-compatible AI agent can now capture and verify web pages as tamper-evident evidence. Thin adapter pattern: all tool handlers call existing business logic directly with zero new capture capabilities. 519 lines of server code, 482 lines of tests, 321 lines of documentation. 22 new tests, 607 total suite, 0 failures.

## Original Prompt

GitHub Issue #45: R15 -- MCP server for web evidence capture

Any MCP-compatible AI agent can capture and verify web pages as part of its workflow, positioning WRL as "the MCP server for web evidence" -- a niche with zero current occupants.

Success criteria: MCP server exposes tools (capture_url, get_capture, verify_capture), Streamable HTTP transport (Cloudflare Workers compatible), tools map directly to existing REST API, MCP client can complete a full capture-verify round-trip, documentation includes MCP server config examples, listed in MCP server directories.

## Key Design Decisions

1. **WebStandardStreamableHTTPServerTransport over agents package** -- The web-standard transport class uses only `Request`/`Response`/`ReadableStream`, all available on Workers with `nodejs_compat`. The Cloudflare `agents` package was rejected (258 transitive deps, 293KB bloat) despite iac-minion's recommendation.

2. **Async capture with poll pattern over blocking** -- `capture_url` returns immediately with a capture ID. Agents poll via `get_capture`. Blocking was rejected because it requires polling KV in a loop, consuming CPU quota and diverging from the REST API's fire-and-forget pattern.

3. **Auth before transport** -- Bearer token verified at HTTP level before MCP transport is constructed. Unauthenticated requests never reach the protocol layer.

4. **performVerification extraction** -- Shared function in `src/verify.js` handles KV lookup → key resolution → R2 fetch → WACZ verify, eliminating duplication between REST and MCP handlers.

5. **tenantId as rate limit key** -- MCP clients are server-side processes without `CF-Connecting-IP`. Using `auth.tenantId` ensures rate limits apply per-tenant regardless of proxy topology.

6. **Four tools (not three)** -- Added `list_captures` beyond the original 3-tool spec because issue #45 explicitly required it: "R1 (list endpoint) must exist -- agents need to retrieve their captures."

## Phases

### Phase 1: Meta-Plan
Identified 5 planning specialists: mcp-minion (protocol/SDK), api-design-minion (tool interface), iac-minion (Workers deployment), security-minion (auth/rate-limit/SSRF), devx-minion (DX/docs).

### Phase 2: Specialist Planning
5 specialists contributed. Main disagreement: iac-minion said raw MCP SDK needs `agents` package for Workers; mcp-minion said `WebStandardStreamableHTTPServerTransport` works natively. Secondary disagreement: api-design-minion wanted 60s blocking capture; mcp-minion wanted async.

### Phase 3: Synthesis
Resolved 2 conflicts. Produced 5-task plan with 1 gate after Task 2 (MCP server core). Tasks: (1) add dependencies, (2) create MCP server + extract verify, (3) mount route, (4) tests, (5) documentation.

### Phase 3.5: Architecture Review
6 reviewers (5 mandatory + user-docs-minion). Results: 6 APPROVE/ADVISE, 0 BLOCK. Margo caught `@cfworker/json-schema` as YAGNI (removed). Security reinforced verify extraction and URL sanitization.

### Phase 4: Execution
5 tasks in 4 batches. 1 approval gate after Task 2 where lucy caught `r.id` vs `r.captureId` bug in `list_captures`. All tasks completed successfully. 607 tests passing.

### Phase 5: Code Review
3 reviewers (code-review-minion, lucy, margo). All ADVISE, 0 BLOCK. Findings:
- Cross-tenant access in get_capture/verify_capture: intentional (matches REST design)
- `'mcp'` in cip parameter: valid log correlation tag
- Pattern repetition (`log() ?? Promise.resolve()`): future refactoring candidate

### Phase 6: Tests
607 tests passed, 0 failed. No new failures.

### Phase 8: Documentation
8a assessment: all documentation items addressed in Phase 4 (docs/mcp.md, README, server.json). 0 items remaining. Phase 8b skipped (empty checklist).

## Execution

| Task | Agent | Deliverable | Status |
|------|-------|-------------|--------|
| 1. Add MCP dependencies | mcp-minion | package.json, package-lock.json | Done |
| 2. MCP server + verify extraction | mcp-minion | src/mcp.js, src/verify.js, src/index.js | Done |
| 3. Mount /mcp route | mcp-minion | src/index.js | Done |
| 4. MCP tests | mcp-minion | test/mcp.test.js (22 tests) | Done |
| 5. Documentation + registry | user-docs-minion | docs/mcp.md, server.json, README.md | Done |

## Decisions

### Gate 1: MCP Server Core (Task 2)
- **Decision**: Approve MCP server implementation with 4 tools
- **Bug found**: `r.id` in list_captures should be `r.captureId` -- fixed before approval
- **Rationale**: Correct thin adapter pattern, direct function calls, proper auth/rate-limit chain

## Verification

Verification: code review passed (3 ADVISE, 0 BLOCK), tests passed (607/607). (Documentation: not applicable -- all items addressed in Phase 4.)

## Agent Contributions

| Agent | Phase | Role |
|-------|-------|------|
| mcp-minion | planning, execution | Protocol expertise, SDK selection, server implementation, tests |
| api-design-minion | planning | Tool interface design, output format recommendations |
| iac-minion | planning | Workers compatibility analysis (agents package -- rejected) |
| security-minion | planning, review | Auth chain, rate limiting, verify extraction, URL sanitization |
| devx-minion | planning | Tool descriptions, stop conditions, isError semantics |
| user-docs-minion | review, execution | Documentation, setup guides, tutorial, registry metadata |
| test-minion | review | Test coverage review |
| ux-strategy-minion | review | Journey coherence review |
| lucy | review, execution | Convention adherence, gate review (caught r.id bug) |
| margo | review | YAGNI enforcement (cut @cfworker/json-schema), pattern review |
| code-review-minion | review | Cross-tenant access analysis, code quality |

## Session Resources

<details>
<summary>Skills Invoked</summary>

- `/nefario` -- orchestration workflow

</details>

<details>
<summary>Compaction</summary>

2 compaction events during this session. Report completeness verified against scratch files.

</details>

## Working Files

Companion directory: `docs/history/nefario-reports/2026-03-22-010400-mcp-server-web-evidence/`

Contains 29 files: phase prompts, specialist contributions, synthesis plan, review verdicts, and execution task prompts.
