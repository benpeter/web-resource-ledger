## Domain Plan Contribution: api-spec-minion

### Recommendations

**Recommended approach: Option (c) -- contract test that calls `tools/list` and asserts against a spec-derived snapshot, with enhancements.**

Here is my reasoning across the three options:

**(a) Parse OpenAPI paths and compare against registered tool names** -- This sounds simple but the mapping between OpenAPI `operationId`s and MCP tool names is not 1:1. The spec has 28 operationIds; the MCP server exposes 4 tools. Most API endpoints (admin, webhooks, schedules, notifications, health, artifacts, diff, certificate, signing keys, batch) are intentionally excluded from MCP. This approach would require a large exclusion list that dwarfs the inclusion list, making it noisy and fragile.

**(b) Generate tool manifest from spec at build time** -- Over-engineered for this project. The MCP server is a single 553-line file with hand-crafted tool handlers that call business logic directly. Tool descriptions, parameter schemas, and response formatting are MCP-specific and do not map mechanically from OpenAPI response schemas. A code generator would produce a less useful MCP server than what exists today.

**(c) Contract test with `tools/list` assertion** -- This is the right fit. The existing test file already calls `tools/list` and asserts on tool count and names (lines 96-133 of `test/mcp.test.js`). The approach needs two additions:

1. **Spec-derived expected set**: Read `openapi.yaml` at test time, extract the operationIds that *should* be MCP tools, and assert the MCP server matches.
2. **Explicit exclusion manifest**: A declarative list of operationIds intentionally excluded from MCP, with reasons.

**How intentional exclusions should be handled:**

Create a small manifest file (or a clearly marked section in `src/mcp.js`) that declares the mapping:

```js
// mcp-coverage.json or inline in test
{
  "tools": {
    "capture_url": { "operationId": "createCapture" },
    "get_capture": { "operationId": "getCapture" },
    "list_captures": { "operationId": "listCaptures" },
    "verify_capture": { "operationId": "verifyCapture" }
  },
  "excluded": {
    "getHealth": "Infrastructure endpoint, not useful as MCP tool",
    "preflightCaptures": "CORS preflight, not an API operation",
    "getCaptureStatus": "Subset of getCapture, redundant for MCP",
    "getCaptureArtifact": "Binary download, not representable as MCP tool content",
    "getCaptureCertificate": "Binary PDF download",
    "batchCapture": "Deferred -- not yet needed in MCP",
    "diffCaptures": "Deferred -- not yet needed in MCP",
    "getSigningKey": "Infrastructure endpoint",
    "getSigningKeys": "Infrastructure endpoint",
    "adminCreateKey": "Admin-only, requires adminAuth",
    "adminListKeys": "Admin-only, requires adminAuth",
    "adminRevokeKey": "Admin-only, requires adminAuth",
    "adminGetUsage": "Admin-only, requires adminAuth",
    "adminCachePurge": "Admin-only, requires adminAuth",
    "createWebhook": "Deferred -- webhook management via MCP",
    "listWebhooks": "Deferred -- webhook management via MCP",
    "deleteWebhook": "Deferred -- webhook management via MCP",
    "pingWebhook": "Deferred -- webhook management via MCP",
    "getAccountUsage": "Deferred -- account tools via MCP",
    "getNotificationPreferences": "Deferred -- notification tools via MCP",
    "updateNotificationPreferences": "Deferred -- notification tools via MCP",
    "getUnsubscribePage": "Browser-rendered HTML page, not an API",
    "processUnsubscribe": "Browser form handler, not an API",
    "createSchedule": "Deferred -- schedule management via MCP",
    "listSchedules": "Deferred -- schedule management via MCP",
    "getSchedule": "Deferred -- schedule management via MCP",
    "deleteSchedule": "Deferred -- schedule management via MCP"
  }
}
```

The test then asserts: `(MCP tool operationIds) + (excluded operationIds) == (all spec operationIds)`. Any new operationId added to the spec that is not in either set causes a test failure, forcing an explicit decision: add it to MCP or add it to the exclusion list with a reason.

### Proposed Tasks

**Task 1: Create MCP coverage manifest**
- Deliverable: `test/mcp-coverage.json` containing the tool-to-operationId mapping and the exclusion list with reasons
- Dependencies: None
- Effort: Small

**Task 2: Write the sync detection test**
- Deliverable: A new `describe` block in `test/mcp.test.js` (or a new `test/mcp-sync.test.js` file) that:
  1. Reads `openapi.yaml` using the `yaml` package (already a devDependency)
  2. Extracts all `operationId` values from `paths`
  3. Reads `test/mcp-coverage.json`
  4. Asserts: every operationId is either mapped to a tool or explicitly excluded
  5. Asserts: every mapped tool name appears in the `tools/list` response (can reuse existing test pattern)
  6. Asserts: no mapped operationId is also in the excluded list (no contradictions)
  7. Asserts: no excluded operationId is missing from the spec (stale exclusions)
- Dependencies: Task 1
- Effort: Medium
- Note: The `yaml` package is already in devDependencies (v2.8.2). The test can read `openapi.yaml` from disk using `fs` -- vitest runs in Node context for the test orchestration even though the worker code runs in workerd. However, verify this works with `cloudflare:test` pool -- if `fs` is not available in the test context, the manifest comparison can be done as a separate vitest test file that runs in Node pool rather than workerd pool.

**Task 3: Verify parameter parity (optional but recommended)**
- Deliverable: Extend the sync test to compare MCP tool `inputSchema` property names against the OpenAPI spec's request parameters/body properties for each mapped operationId
- Dependencies: Task 2
- Effort: Medium
- Rationale: Tool names drifting is one failure mode; tool parameters drifting is another. If `list_captures` gains a new query parameter in the spec but the MCP tool's Zod schema is not updated, the tool silently lacks functionality.

**Task 4: CI integration**
- Deliverable: The sync test runs as part of `npm test` (already in CI). No separate CI step needed -- vitest picks up the new test automatically.
- Dependencies: Task 2
- Effort: Trivial (zero config if added to existing test dir)

### Risks and Concerns

1. **`fs` access in cloudflare:test pool**: The existing tests use `cloudflare:test` which runs in workerd. Reading `openapi.yaml` from disk requires Node.js `fs`. The sync test may need to run in a separate vitest config with `pool: 'forks'` instead of `pool: '@cloudflare/vitest-pool-workers'`. Verify this before implementation. If needed, a small standalone test file with its own vitest config (or using vitest's `poolMatchGlobs`) can solve this.

2. **Manifest maintenance burden**: The exclusion list has ~24 entries. This is a one-time cost; ongoing maintenance only triggers when new operationIds are added to the spec (which is exactly when you want the reminder). The "reason" field in exclusions ensures future developers understand why an endpoint was excluded, not just that it was.

3. **Parameter name mapping is not trivial**: OpenAPI uses `camelCase` for path/query params while the MCP tool uses `snake_case` (e.g., `captureId` in spec vs `capture_id` in MCP Zod schema). The parameter parity test (Task 3) needs a naming convention normalizer or an explicit mapping. Keep this optional for v1.

4. **False sense of coverage**: This test detects structural drift (missing tools, missing parameters) but not behavioral drift (e.g., the MCP tool returns different data than the REST endpoint for the same operation). Behavioral parity is better covered by the existing tool-level tests that exercise real business logic.

### Additional Agents Needed

None. This is a spec-to-implementation sync problem that falls squarely within api-spec-minion's domain for the manifest design and test structure. The implementation of the test itself is straightforward vitest work that any implementation agent can handle.
