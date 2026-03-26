# Code Review: MCP API Surface Expansion

Reviewer: code-review-minion
Date: 2026-03-26
Files reviewed: src/mcp.js, test/mcp-sync.test.js, test/mcp.test.js, vitest.sync.config.ts, vitest.config.js, .github/workflows/ci.yml, package.json

---

## Summary

The implementation is solid overall. The business logic reuse pattern (calling internal functions directly rather than self-fetch) is correct. Rate limiting, SSRF protection, and error handling are consistently applied. Two issues require fixes before merge: a BLOCK-level tenant isolation gap in `get_capture` and `verify_capture`, and an ADVISE-level rate limit discrepancy in `batch_capture`. All other findings are nits.

---

VERDICT: ADVISE

FINDINGS:

- [BLOCK] src/mcp.js:240-312 -- `get_capture` missing tenant isolation check. The tool fetches the capture record and returns full details (URL, artifacts, WACZ metadata) without verifying `record.tenantId === auth.tenantId`. Any authenticated tenant can enumerate and read any other tenant's capture by guessing or brute-forcing a `cap_` ID. `diff_captures` (line 715) and `get_certificate` (line 1217) both include the check correctly -- `get_capture` was missed.
  FIX: After the null check on line 243, add: `if (record.tenantId !== auth.tenantId) { return { isError: true, content: [{ type: 'text', text: \`Capture not found: ${captureId}\` }] }; }` -- same pattern used at lines 715-726 and 1217-1222.

- [BLOCK] src/mcp.js:419-422 -- `verify_capture` delegates to `performVerification` with no tenant isolation. `performVerification` (src/verify.js:292) does a bare DB lookup with no tenantId filter. A tenant can verify (and confirm existence of) any other tenant's capture ID. The `/v1/verify/:id` HTTP endpoint is intentionally unauthenticated (public verification), but the MCP verify_capture tool runs under tenant auth and should be scoped to the caller's captures.
  FIX: Before calling `performVerification`, fetch the record and check tenantId: `const record = await getCapture(env.DB, captureId); if (!record || record.tenantId !== auth.tenantId) { return { isError: true, content: [{ type: 'text', text: \`Capture not found or not yet complete: ${captureId}\` }] }; }` -- then pass the prefetched record into `performVerification` if that function supports it, or accept the double-fetch as the safe path.

- [ADVISE] src/mcp.js:528-548 -- `batch_capture` CF rate limiter charged once for up to 20 URLs. The comment at line 529 says "called once per URL (per the HTTP batch handler pattern)" but the actual HTTP batch handler calls the limiter once per-URL in a loop for legacy auth (index.js:1214-1222), while for KV auth it calls it once upfront before the loop (index.js:771-776). The MCP batch handler uses KV auth (always -- MCP requires a real API key) so calling it once is consistent with the KV auth path. However the comment is misleading: it implies per-URL calling but only calls once. The KV counter at line 553 correctly charges `batchSize` slots, so the real protection is working. The CF ceiling limiter only subtracts 1 slot regardless of batch size, which means a 20-URL batch consumes 1/20th of the CF rate limit budget compared to 20 individual calls.
  FIX: Either call `CAPTURE_RATE_LIMITER.limit()` in a loop (once per URL, matching the per-URL cost of the single-capture path), or update the comment to accurately state the current behavior and document the intentional design decision. If the single-call is intentional (batch discount), it should be explicit in a comment, not implied by a misleading reference.

- [NIT] src/mcp.js:785-789 -- Silent `catch {}` blocks for header JSON parse failure. This violates the project's "fail loudly, degrade intentionally" principle (CLAUDE.md). The `/* parse failure: treat as missing */` comment acknowledges degradation but does not log it, so operators cannot distinguish a corrupt artifact from a missing one.
  FIX: Add a `ctx.waitUntil(log(...))` call in each catch block at minimum at severity 4, with `event: 'diff.header_parse_fail'` and the error message, so the degradation is observable.

- [NIT] test/mcp.test.js:363-365 -- `list_captures` test asserts "at least one ID visible" (hasId1 || hasId2). Both captures are inserted with `tenantId: 'default'` (the legacy test key's tenant), so both should appear. The weak assertion would pass even if tenant scoping were broken and only foreign data leaked through. Consider asserting both IDs appear, which would also catch a regression if the tenant filter were accidentally inverted.
  FIX: Replace `expect(hasId1 || hasId2).toBe(true)` with `expect(text).toContain(LIST_ID_1); expect(text).toContain(LIST_ID_2);`

- [NIT] test/mcp.test.js:394-414 -- Status filter tests use conditional logic that allows the assertions to pass vacuously. If the filter returns "No captures found", the `expect(text).not.toContain(...)` assertion is skipped entirely. This means a broken filter that returns nothing would still pass. The test correctly seeds both a pending and a complete capture, so "No captures found" should never be the correct response for either filter.
  FIX: Assert the positive case first: `expect(text.toLowerCase()).not.toContain('no captures found')` before the `.not.toContain(otherId)` assertion.

- [NIT] test/mcp-sync.test.js:25-37 -- `TOOL_TO_OPERATION` map only covers the operational mapping direction (tool -> operationId). There is no test asserting that every tool named in `TOOL_TO_OPERATION` actually exists as a registered tool in `src/mcp.js`. If a tool is renamed in code but the map is not updated, the sync test continues to pass while coverage silently regresses. This is a secondary concern given the existing per-tool tests in `mcp.test.js`, but the drift detection test could be more complete.
  FIX: Add a fourth `it` block that imports `src/mcp.js` tool names (or reads them from a `tools/list` call via the sync test runner) and asserts every key in `TOOL_TO_OPERATION` corresponds to a real registered tool.

---

## Notes on Positives

- Rate limiting in `capture_url` is thorough: CF ceiling → KV per-tenant counter → global capacity limiter, all with correct audit logging.
- SSRF validation is applied consistently in `capture_url`, `batch_capture`, and `create_schedule`.
- `diff_captures` tenant isolation (lines 715-726) is correctly implemented and sets the right pattern.
- `get_certificate` tenant isolation (lines 1217-1222) is correctly implemented.
- The stateless-per-request MCP server model is the right approach for CF Workers.
- Auth happens before transport construction, which is the correct layering.
- The drift detection test design in `mcp-sync.test.js` is well-structured. The three-way invariant (mapped + excluded = all operations in spec, no overlap, no stale exclusions) is complete and the exclusion rationale comments are useful for future maintainers.
- `delete_schedule` validates the `sch_` ID format before hitting the database (line 1136), preventing unnecessary DB round-trips for malformed inputs.
