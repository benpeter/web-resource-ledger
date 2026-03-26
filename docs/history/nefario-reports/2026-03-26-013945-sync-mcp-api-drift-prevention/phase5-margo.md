# Margo Review: MCP Server Implementation

## Verdict: ADVISE

The implementation is proportional to the need. 11 tools wrapping existing business logic, a drift-detection test, and documentation -- no new frameworks, no unnecessary abstractions. Two non-blocking concerns below.

---

## Finding 1: Substantial logic duplication between MCP handlers and HTTP handlers

**What:** `src/mcp.js` (1340 lines) reimplements the same orchestration sequences found in `src/index.js` -- rate limiting, SSRF validation, DB record creation, queue dispatch, logging, response formatting. The `capture_url` tool alone is ~140 lines reproducing logic from `handleBatchCapture` / the single-capture HTTP handler. `batch_capture` duplicates most of that again. `diff_captures` reimplements the R2 fetch + diff pipeline from `handleDiffCaptures`. Every tool copies the same rate-limit + scope-check + log boilerplate.

**Why this is accidental complexity:** The essential complexity is "expose existing API operations over MCP transport." The accidental complexity is maintaining two parallel implementations of every operation's orchestration logic. When rate-limit behavior changes, or a new validation step is added, both code paths must be updated in lockstep -- and the drift-detection test only catches missing *operations*, not divergent *behavior* within them.

**Simpler alternative:** Extract the shared orchestration into transport-neutral functions that return result objects (not HTTP Responses). Both the HTTP handlers and MCP tool handlers call the same function, then format the result for their respective transport. This would cut `mcp.js` to roughly 300-400 lines of tool registration + formatting, and eliminate the behavioral drift risk entirely.

**Severity:** Non-blocking. The current approach works and ships. But this is the kind of duplication that compounds -- every future change to capture logic, rate limiting, or validation must be applied twice. Recommend extracting shared logic as a fast-follow.

## Finding 2: `batch_capture` MCP tool rate-limits differently than HTTP batch handler

**What:** The HTTP `handleBatchCapture` in `src/index.js` calls `checkCaptureRateLimit(env, auth, clientIp, 'capture', body.urls.length)` -- a single function that handles CF rate limiter, KV counter, IP guard, and global limiter with proper batch-size accounting. The MCP `batch_capture` tool reimplements this as three separate blocks (CF rate limiter called once regardless of batch size, then KV counter with batchSize, then global limiter called once). The CF rate limiter in MCP charges 1 slot for a batch of N URLs; the HTTP handler charges N slots.

**Why this matters:** This is exactly the behavioral divergence that copy-paste orchestration produces. An attacker could use the MCP endpoint to bypass per-URL rate limiting on batch requests.

**Simpler alternative:** Same as Finding 1 -- extract rate-limit orchestration into a shared function. In the immediate term, align the MCP batch rate-limit logic with the HTTP handler's `checkCaptureRateLimit` call.

**Severity:** Non-blocking for the review (rate limits are defense-in-depth, not a single point of failure), but should be fixed before production traffic flows through MCP.

---

## What works well

- **Drift-detection test (`test/mcp-sync.test.js`):** Clean, well-designed guard that forces explicit decisions when `openapi.yaml` gains new operations. The `EXCLUDED_OPERATIONS` map with documented reasons is good practice.
- **No new dependencies for MCP transport:** Uses the existing `@modelcontextprotocol/sdk` (already in deps) and `zod` (already in deps). No dependency bloat.
- **Stateless transport choice:** No session management, no SSE complexity. JSON request/response over POST. Proportional to the need.
- **Tool descriptions:** Rich, actionable descriptions that tell an AI agent what each tool does, when to use it, and what to expect. Good MCP citizenship.
- **Test coverage:** Per-tool tests cover happy path, auth, scope, not-found. Adequate for the surface area.
- **1340 lines in a single file:** Acceptable given the file is a flat list of tool registrations with no abstraction layers. Each tool is self-contained and independently readable. Splitting would add indirection without reducing cognitive load. The file is long but not complex.

## Complexity Budget Tally

| Decision | Column | Cost |
|----------|--------|------|
| New MCP endpoint (serverless) | Managed | 2 |
| `@modelcontextprotocol/sdk` (already present) | -- | 0 |
| `zod` (already present) | -- | 0 |
| New test config (`vitest.sync.config.ts`) | -- | 1 |
| **Total** | | **3** |

Proportional to the problem. No budget concerns.

## Summary

Ship it. Fix the batch rate-limit divergence (Finding 2) before MCP goes to production traffic. Plan the shared-orchestration extraction (Finding 1) as a fast-follow to prevent the duplication from compounding.
