# Lucy Review: MCP Server for Web Evidence

## Verdict: ADVISE

The plan is well-aligned with the original request and project conventions. The three conflict resolutions are sound and well-reasoned. Two minor issues worth noting before execution.

---

## Requirements Traceability

| Requirement (from prompt.md) | Plan Element | Status |
|------------------------------|-------------|--------|
| MCP server exposes 3 tools: capture_url, get_capture, verify_capture | Task 2: 4 tools (adds list_captures) | COVERED + justified extension (see Decisions below) |
| Streamable HTTP transport (Workers compatible) | Task 2: WebStandardStreamableHTTPServerTransport | COVERED |
| Tools map directly to existing REST API endpoints | Task 2: direct function calls to existing business logic | COVERED |
| MCP client can complete full capture-verify round-trip | Task 4: test #15, Task 6 verification step #3 | COVERED |
| Documentation includes MCP server configuration examples | Task 5: docs/mcp.md with Claude Code, Cursor, Windsurf configs | COVERED |
| Listed in MCP server directories | Task 5: server.json (submission deferred to post-deploy) | COVERED |
| Scope-out: no new capture capabilities | Plan creates no new API functionality; thin adapter only | RESPECTED |
| Scope-out: no agent-specific UX | No agent-specific UI or workflow beyond tool descriptions | RESPECTED |
| Scope-out: no MCP auth beyond API key | Bearer token reuses existing API key auth | RESPECTED |
| Constraint R1: list endpoint must exist | Already implemented (kv.js:192, index.js:261); exposed as list_captures tool | COVERED |
| Constraint R11: TSA recommended first | Already implemented (backlog shows R11 DONE) | SATISFIED |

No orphaned tasks. No unaddressed requirements.

---

## Conflict Resolution Assessment

**1. Same Worker vs. Separate Worker** -- SOUND. The rationale (KISS, YAGNI, single-operator project, ~8.5% of bundle limit) aligns directly with the Helix Manifesto principles in CLAUDE.md. A separate Worker for ~100 lines of glue code would be textbook over-engineering for this project.

**2. Raw MCP SDK vs. agents package** -- SOUND. 130KB vs 293KB, 3 deps vs 258 transitive -- this is the "lean and mean" principle applied correctly. The agents package's kitchen-sink approach directly contradicts the Helix Manifesto.

**3. Async polling vs. blocking** -- SOUND. The plan correctly identifies that ctx.waitUntil() is fire-and-forget by design. Blocking would require polling KV in a loop inside the request handler, which is wasteful and risks hitting CPU time limits. The existing architecture is fundamentally async; the MCP layer should not fight it.

---

## 4th Tool (list_captures) -- Scope Creep Assessment

**Not scope creep.** The prompt's success criteria say "3 tools" but the prompt's own constraint R1 says "agents need to retrieve their captures." The `listCaptures` function already exists in `src/kv.js` (line 192) and `handleListCaptures` already exists in `src/index.js` (line 261). Exposing it as an MCP tool is wrapping existing functionality, not building new capability. An agent that can capture but cannot list its captures has a broken workflow. The 4th tool is a ~20-line handler calling an existing function -- proportional to the need.

---

## Findings

1. [COMPLIANCE]: Zod v4 version claim needs verification at execution time
   SCOPE: Task 1, `package.json` dependency `"zod": "^4.3.6"`
   CHANGE: The mcp-minion executing Task 1 should verify that `@modelcontextprotocol/sdk` v1.27.x actually supports Zod v4 as a peer dependency. At the time the plan was written, the MCP SDK may have been pinned to Zod v3. If the SDK's `peerDependencies` require Zod v3, install v3 instead. Run `npm info @modelcontextprotocol/sdk peerDependencies` to check before installing.
   WHY: Zod v4 is a breaking change from v3 (different API surface, different package entry points). Installing Zod v4 when the SDK expects v3 could cause runtime schema validation failures that would only surface during MCP tool calls, not at build time. The plan's dry-run bundle check would pass but tool invocations would fail.
   TASK: Task 1

2. [CONVENTION]: Evolution log directory not addressed in plan
   SCOPE: `docs/evolution/` directory, CLAUDE.md "Evolution Log" section
   CHANGE: The orchestration must create the evolution log directory (prompt.md, decisions.md, outcome.md) for this phase per CLAUDE.md rules. This is a project-level obligation on the orchestration session, not a task for a minion -- but it should be acknowledged in the plan so it is not forgotten during wrap-up.
   WHY: CLAUDE.md states "Every significant development phase must be documented in docs/evolution/. This is non-negotiable." The plan's verification steps (lines 668-676) do not mention evolution log creation. The CLAUDE.md Precedence section explicitly warns that "the skill didn't tell me to" is not a valid reason to skip this.
   TASK: Cross-cutting (orchestration responsibility)

---

## CLAUDE.md Compliance Summary

| Directive | Status |
|-----------|--------|
| YAGNI | PASS -- no speculative features; 4th tool justified by R1 |
| KISS | PASS -- single Worker, raw SDK, text output, stateless per-request |
| Lean and Mean | PASS -- raw SDK (3 deps) over agents package (258 deps) |
| Fail loudly | PASS -- `isError: true` for infra failures, descriptive text for domain errors |
| Test real boundaries | PASS -- Task 4 includes full protocol round-trip test |
| Prefer lightweight/vanilla | PASS -- no frameworks introduced |
| Evolution log required | ADVISE -- not in plan's verification steps (finding #2 above) |
| Serverless-first default | PASS -- same Cloudflare Worker, no infrastructure change |
