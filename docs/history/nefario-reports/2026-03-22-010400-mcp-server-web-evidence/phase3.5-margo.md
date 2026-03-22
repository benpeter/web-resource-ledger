# Margo Review: MCP Server Plan

## Verdict: ADVISE

This plan is well-proportioned for the problem. The three conflict resolutions (same Worker, raw SDK, async polling) all chose the simpler path -- good discipline. Five tasks for a new protocol adapter with tests and docs is reasonable, not inflated. The core implementation is one new file calling existing functions. That said, two items warrant attention.

---

### Findings

1. [simplicity]: `@cfworker/json-schema` is a speculative dependency guarding against a hypothetical future `nodejs_compat` breakage.
   SCOPE: `package.json`, Task 1 dependency list
   CHANGE: Drop `@cfworker/json-schema`. If ajv breaks under `nodejs_compat` in a future Cloudflare runtime update, add the workaround then. The plan itself notes ajv "works under nodejs_compat today." A dependency added to prevent a possible future problem is textbook YAGNI.
   WHY: The project currently has 3 production dependencies. This plan adds 3 more, doubling the count. Two (MCP SDK, zod) are essential -- zod is a peer dependency of the SDK and the SDK is the entire point. The third exists only as insurance against a scenario that has not occurred. Every dependency is a maintenance surface. If this breakage does happen, the fix (swap the validator) is a one-line change -- the cost of adding it reactively is near zero.
   TASK: 1

2. [simplicity]: `verify_capture` tool handler duplicates the signing key resolution and verification orchestration from `handleVerifyCapture` instead of extracting a shared function.
   SCOPE: `src/mcp.js`, Task 2 implementation notes
   CHANGE: Before implementing `verify_capture` in the MCP handler, extract the verification orchestration logic from `handleVerifyCapture` in `src/index.js` into a shared function (e.g., in `src/verify.js`). Both the REST handler and the MCP tool handler call this shared function. The plan's instruction to "replicate from handleVerifyCapture" creates two copies of non-trivial logic (archived key resolution, fallback chain, R2 fetch, verification call) that must be kept in sync.
   WHY: The plan correctly chose direct function calls over HTTP self-calls to avoid double auth and network hops. But the verify flow is more complex than the other tools -- it involves key resolution with archived key fallback, R2 object fetching, and multi-step verification. Duplicating this orchestration means any future change to verification logic must be applied in two places. The other three tools (capture, get, list) call single existing functions and need no extraction. Verify is the exception because its orchestration logic lives inline in the REST handler rather than in a callable function.
   TASK: 2

---

### What the plan gets right

- **Same Worker, mounted at /mcp**: Correct call. A second Worker for ~100 lines of glue code would double operational surface for zero benefit.
- **Raw SDK over `agents` package**: 3 deps vs 258 transitive deps. The plan cited specific numbers. Good.
- **Async return, not blocking**: Matches existing architecture. Not fighting the platform.
- **Direct function calls, not HTTP self-calls**: Avoids double auth, double rate limiting, serialization overhead.
- **Text output over JSON**: Pragmatic for LLM context windows. No premature structured output.
- **4 tools including list_captures**: Required by the prompt's own R1 constraint. Not scope creep.
- **Task count (5)**: Proportional. Deps, implementation, routing, tests, docs. No padding.
- **Single approval gate after Task 2**: Right position -- tool contract is the hard-to-change surface.

### Complexity Budget Tally

| Addition | Cost (managed) |
|----------|---------------|
| MCP SDK dependency | 1 |
| zod dependency (peer req) | 1 |
| @cfworker/json-schema dependency | 1 (flagged above -- YAGNI) |
| New file: src/mcp.js | 0 (no new abstraction layer -- thin adapter) |
| Route mount in index.js | 0 (minimal wiring) |

Total: 3 (or 2 if @cfworker/json-schema is dropped). Proportional to the problem.
