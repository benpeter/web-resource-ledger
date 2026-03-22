# Process: MCP Server for Web Evidence

## TL;DR

A 7-agent team (mcp-minion, api-design-minion, iac-minion, security-minion, devx-minion, user-docs-minion, test-minion) planned and built the MCP server in a single autonomous orchestration session. Five execution tasks ran in 4 batches with 1 approval gate. The main disagreement was whether Cloudflare's `agents` package was needed -- it wasn't. Total: 519 lines of server code, 482 lines of tests, 321 lines of docs, 22 new tests all passing, 607 total suite.

## Planning Phase (Agents Consulted)

### Meta-Plan

Nefario identified 5 planning specialists:

- **mcp-minion**: Protocol and SDK expertise -- which transport class, session model, auth pattern
- **api-design-minion**: Tool interface design -- parameter shapes, output formats, error semantics
- **iac-minion**: Cloudflare Workers deployment -- compatibility, bundle size, wrangler config
- **security-minion**: Auth chain, rate limiting, SSRF/injection in MCP context
- **devx-minion**: Developer experience -- tool descriptions, documentation, client config

### What Each Specialist Argued

**mcp-minion** recommended `McpServer` + `StreamableHTTPServerTransport` (later corrected to `WebStandardStreamableHTTPServerTransport` during execution), stateless mode, auth before transport. Proposed 4 tools including `list_captures`. Argued for curated text output (~100 tokens) over raw JSON (~400 tokens) to be kind to LLM context windows.

**api-design-minion** wanted blocking capture with 60-second timeout so agents get results in one call. Proposed `structuredContent` for rich output. Nefario rejected both: blocking violates `ctx.waitUntil()` fire-and-forget pattern; `structuredContent` is an unreleased MCP spec feature.

**iac-minion** raised a concern that the raw MCP SDK requires Node.js-specific APIs and would fail on Cloudflare Workers, recommending the `agents` package instead. This was the main conflict in synthesis.

**security-minion** flagged verify logic duplication (REST and MCP both need KV lookup → key resolution → R2 fetch → WACZ verify). Recommended extracting to a shared function. Also flagged URL sanitization in tool output (stored prompt injection risk).

**devx-minion** focused on tool descriptions that give agents enough context to use tools correctly without documentation. Recommended the 30-second stop condition for pending captures and the `isError` semantics for infrastructure vs domain failures.

### Where They Disagreed

The main conflict: **iac-minion** said the MCP SDK needs the `agents` package to work on Workers. **mcp-minion** said the raw SDK works fine with `WebStandardStreamableHTTPServerTransport`. Synthesis sided with mcp-minion after analyzing the SDK source: the web-standard transport uses only `Request`, `Response`, and `ReadableStream` -- all available on Workers with `nodejs_compat`. The `agents` package would have added 258 transitive dependencies and 293KB.

**api-design-minion** vs **mcp-minion** on blocking vs async: synthesis chose async because blocking requires polling KV in a loop inside the tool handler, consuming CPU quota and creating a fundamentally different pattern than the REST API.

## Architecture Review (Phase 3.5)

5 mandatory reviewers (security-minion, test-minion, ux-strategy-minion, lucy, margo) + 1 discretionary (user-docs-minion). All returned APPROVE or ADVISE.

**margo** advised against the `@cfworker/json-schema` dependency that iac-minion had recommended. Cut from the plan.

**security-minion** reinforced the verify extraction recommendation and URL sanitization.

**lucy** verified the plan aligned with the "thin adapter" intent -- no scope creep into new capabilities.

## Execution

### Batch 1: Dependencies (Task 1)
mcp-minion added `@modelcontextprotocol/sdk: ^1.27.1` and `zod: ^4.3.6`. Verified bundle stays under 1MB gzipped via `wrangler deploy --dry-run`.

### Batch 2: MCP Server (Task 2) — Approval Gate
mcp-minion created `src/mcp.js` (519 lines) with 4 tools and extracted `performVerification` to `src/verify.js`. Refactored `handleVerifyCapture` in index.js to use the shared function. All 585 existing tests passed after refactoring.

**Gate decision**: Lucy's review caught a bug — `list_captures` used `r.id` but KV records store `captureId`. Fixed before approval.

### Batch 3: Route Mount (Task 3)
mcp-minion mounted `/mcp` in `src/index.js` with CORS preflight handling. Response cloning for CORS headers (Worker responses have immutable headers). All tests still passing.

### Batch 4: Tests + Docs (Tasks 4, 5 in parallel)
mcp-minion wrote 22 integration tests covering protocol lifecycle, auth, CORS, all 4 tools, and error cases. user-docs-minion wrote `docs/mcp.md` with setup guides for Claude Code, Cursor, Windsurf, and generic clients, plus a full tutorial and troubleshooting section. Also created `server.json` for MCP registry listing.

## Post-Execution Review

Three code reviewers ran in parallel:

- **code-review-minion (ADVISE)**: Flagged that `get_capture` and `verify_capture` don't enforce tenant isolation. Acknowledged this mirrors the REST API's intentional design (capture ID as unguessable token).
- **lucy (ADVISE)**: Flagged `'mcp'` passed in the `cip` (hashed IP) parameter slot of `performCapture`. The string is a valid log correlation tag -- not a security issue.
- **margo (ADVISE)**: Flagged `ctx.waitUntil(log(...) ?? Promise.resolve())` pattern repetition and capture_url orchestration duplication. Both are valid observations for future refactoring but out of scope for this phase per YAGNI.

All 607 tests passed. Documentation assessment found 0 unaddressed items.

## Human Interventions

This phase ran in autonomous mode with no interactive human feedback. All gate decisions were made by Lucy as the autonomous gate protocol specifies.

## Where to Read More

- Specialist planning outputs: `docs/history/nefario-reports/` (companion directory)
- Synthesis plan: scratch directory (cleaned up; key decisions preserved in `decisions.md`)
- Issue: [#45](https://github.com/benpeter/web-resource-ledger/issues/45)
