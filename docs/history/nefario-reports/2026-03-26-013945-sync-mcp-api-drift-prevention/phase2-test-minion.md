## Domain Plan Contribution: test-minion

### Recommendations

#### 1. Per-tool describe blocks, not data-driven

The existing test file uses per-tool describe blocks with explicit test cases. This is the right pattern for MCP tools and should be continued, not replaced with a data-driven approach. Reasons:

- Each tool has unique fixture setup (capture_url needs queue mocking, verify_capture needs WACZ/signing key state, batch needs multiple URLs, schedules need cron data). A data-driven table would either be too generic to test meaningfully or become as complex as the describe blocks themselves.
- The current pattern makes test failures immediately diagnosable -- you see "tool: get_capture -- not found" in the output, not "row 7 of tool matrix".
- New tools like `batch_capture`, `diff_captures`, `list_schedules` each have domain-specific edge cases (batch partial failures, diff requiring two complete captures, schedule cron validation) that read better as explicit tests.

**Recommendation**: Keep per-tool describe blocks. Extract shared helpers (already done with `mcpPost`, `toolCall`, `initRequest`) and add any new ones needed (e.g., `seedCompleteCapture` that combines create+complete in one call).

#### 2. Fixture setup strategy for complex tools

Current fixture setup is already well-structured (seedApiKey, seedCapture, seedSchedule, seedWebhook in `test/fixtures.js`). For the new tools:

- **batch_capture**: No special fixtures needed -- it submits multiple URLs. Test the tool response shape (array of capture IDs or partial errors). The queue mock from `cloudflare:test` handles dispatch.
- **diff_captures**: Needs two complete captures. Add a `seedCompleteCaptureWithArtifacts` helper to `fixtures.js` that creates a capture row AND puts R2 objects, since diff needs actual artifact data to compare. The existing `completeCapture` helper is close but doesn't seed R2.
- **schedules (create/list/get/delete)**: `seedSchedule` already exists in fixtures.js. Schedule tools are CRUD -- straightforward DB fixture setup.
- **webhooks (create/list/delete/ping)**: `seedWebhook` already exists. Same CRUD pattern.
- **get_certificate**: Needs a complete capture with WACZ data. Reuse the same `seedCompleteCaptureWithArtifacts` helper.
- **get_usage/admin tools**: `seedUsageCounter` exists. Admin tools need admin auth -- add a constant for admin key auth header.

#### 3. Sync detection test -- the key deliverable

This is the highest-value test in the entire task. It should live in `test/mcp.test.js` (or a dedicated `test/mcp-sync.test.js`) and run in the existing `npm test` CI step, not as a separate job. It must fail CI when the MCP server drifts from the OpenAPI spec.

**Approach**: Parse `openapi.yaml` at test time and compare against the MCP server's `tools/list` response. The test should verify:

1. **Completeness**: Every non-admin, non-health operationId in the OpenAPI spec that should be an MCP tool IS an MCP tool. Maintain an explicit allowlist of operations intentionally excluded from MCP (admin endpoints, health, CORS preflight, unsubscribe page).
2. **Parameter alignment**: For each tool, its `inputSchema` properties should match the OpenAPI spec's request parameters/body properties. This catches renamed or removed parameters.
3. **No orphan tools**: Every MCP tool name maps back to an OpenAPI operationId. Catches tools that outlive the API endpoint they wrap.

**Implementation sketch**:
```js
import { readFileSync } from 'node:fs';
import yaml from 'yaml'; // or js-yaml -- check what's already in devDeps

describe('MCP-OpenAPI sync', () => {
  const EXCLUDED_OPERATIONS = new Set([
    'getHealth', 'preflightCaptures',
    'adminCreateKey', 'adminListKeys', 'adminRevokeKey',
    'adminGetUsage', 'adminCachePurge',
    'getUnsubscribePage', 'processUnsubscribe',
  ]);

  const TOOL_TO_OPERATION = {
    'capture_url': 'createCapture',
    'get_capture': 'getCapture',
    'list_captures': 'listCaptures',
    'verify_capture': 'verifyCapture',
    // ... new tools added here
  };

  it('every non-excluded API operation has a corresponding MCP tool', () => {
    // Parse openapi.yaml, extract operationIds
    // Compare against TOOL_TO_OPERATION values
    // Fail if any non-excluded operation is missing
  });

  it('every MCP tool maps to a valid API operation', () => {
    // tools/list response tool names all appear in TOOL_TO_OPERATION keys
  });

  it('MCP tool parameters match OpenAPI spec parameters', () => {
    // For each tool, compare inputSchema.properties keys
    // against OpenAPI path params + query params + body properties
  });
});
```

The explicit `EXCLUDED_OPERATIONS` set and `TOOL_TO_OPERATION` map are intentional -- they force a developer adding a new API endpoint to consciously decide whether it gets an MCP tool. If they add an endpoint and don't update either set, the test fails.

#### 4. Staging integration test -- yes, but scoped

Add a staging integration test for MCP specifically, but keep it narrow: one test that does `initialize` -> `tools/list` -> `capture_url` -> poll `get_capture` -> `verify_capture`. This validates the full MCP flow against real infrastructure.

This should live in `test/integration/mcp-staging.test.js` and run in the existing `test-integration` CI job (which already has `continue-on-error: true` for infrastructure flakiness). It needs a staging API key as a CI secret.

Do NOT test every tool against staging. The sync detection test (recommendation 3) provides coverage completeness. The staging test validates that the MCP transport, auth, and one end-to-end flow actually work over the wire.

#### 5. tools/list count assertion update

The existing test `'lists all 4 WRL tools'` with `expect(tools).toHaveLength(4)` is a simple but effective drift detector. When new tools are added, this test fails immediately. Keep this pattern but update the count and the `expect(names).toContain(...)` list for each new tool. This is the cheapest possible sync check and catches the most common mistake (forgetting to register a tool).

### Proposed Tasks

**Task T1: Sync detection test** (blocks all other MCP test work)
- File: `test/mcp-sync.test.js` (or new describe block in `test/mcp.test.js`)
- Parse `openapi.yaml`, compare against `tools/list` response
- Define `EXCLUDED_OPERATIONS` and `TOOL_TO_OPERATION` mapping
- Check completeness (no missing tools), no orphans, parameter alignment
- Runs in `npm test` CI step
- Deliverable: Test that fails when a new API endpoint is added without updating MCP
- Dependency: Need `yaml` or `js-yaml` in devDependencies (check if already present)

**Task T2: Fixture helper additions**
- Add `seedCompleteCaptureWithArtifacts(db, bucket, id, overrides)` to `test/fixtures.js` -- creates capture row + R2 objects in one call
- Add admin auth constant (`ADMIN_AUTH` header) for admin tool tests
- Deliverable: Updated `test/fixtures.js`
- Dependency: None

**Task T3: Per-tool test blocks for new tools** (after T2)
- One describe block per new MCP tool, following existing pattern
- Happy path + error cases for each
- Estimated new tools needing tests (based on OpenAPI surface minus current 4 minus excluded):
  - `batch_capture` (createCapture batch variant)
  - `get_capture_status` (getCaptureStatus)
  - `get_capture_artifact` (getCaptureArtifact)
  - `get_capture_certificate` (getCaptureCertificate)
  - `diff_captures` (diffCaptures)
  - `get_signing_key` / `list_signing_keys`
  - `create_webhook` / `list_webhooks` / `delete_webhook` / `ping_webhook`
  - `get_usage` (getAccountUsage)
  - `create_schedule` / `list_schedules` / `get_schedule` / `delete_schedule`
  - `get_notification_preferences` / `update_notification_preferences`
- Deliverable: Expanded `test/mcp.test.js` (or split into `test/mcp-*.test.js` if it exceeds ~800 lines)
- Dependency: T2 for fixtures, actual MCP tool implementations

**Task T4: Update tools/list count assertion**
- Update `'lists all N WRL tools'` test to match final tool count
- Update `expect(names).toContain(...)` list
- Deliverable: Updated assertion in existing test
- Dependency: T3 (need to know final count)

**Task T5: Staging MCP integration test** (can parallel with T3)
- File: `test/integration/mcp-staging.test.js`
- Single flow: initialize -> tools/list -> capture_url -> get_capture -> verify_capture
- Uses staging API key from CI secret
- Runs in `test-integration` CI job
- Deliverable: New integration test file
- Dependency: Staging API key as GitHub Actions secret (may already exist for existing integration tests)

### Risks and Concerns

1. **Parameter alignment is the hard part of sync detection.** OpenAPI parameters (path params, query params, request body fields) don't map 1:1 to MCP tool inputSchema properties. The mapping requires transformation logic (e.g., `captureId` path param becomes `capture_id` tool parameter). The sync test needs a well-defined mapping, not a naive string comparison. If this mapping is too fragile, reduce scope to completeness check only (operations <-> tools) and defer parameter checking.

2. **Test file size.** Adding ~15 tools with 3-4 tests each means ~60 new tests, potentially 1000+ new lines. If kept in one file, `test/mcp.test.js` would exceed 1400 lines. Consider splitting into `test/mcp-protocol.test.js` (existing protocol tests), `test/mcp-capture-tools.test.js`, `test/mcp-management-tools.test.js`, `test/mcp-sync.test.js`. The cloudflare:test pool handles multiple test files fine.

3. **YAML parser dependency.** The sync detection test needs to parse `openapi.yaml`. Check if `js-yaml` or `yaml` is already in devDependencies before adding. If not, `yaml` (npm) is the modern choice -- small, spec-compliant, zero deps.

4. **Staging integration test reliability.** The existing integration CI job has `continue-on-error: true` because it hits real CF infrastructure. The MCP staging test will have the same flakiness characteristics. This is acceptable -- it's a smoke test, not a gate. But document clearly that staging test failures should be investigated, not ignored.

5. **Admin tools in MCP.** The OpenAPI spec has admin endpoints (key management, cache purge, usage). These probably should NOT be MCP tools (they use a different auth scheme -- `adminAuth` vs `bearerAuth`). The `EXCLUDED_OPERATIONS` set must be reviewed carefully. If admin tools ARE added to MCP, they need separate auth testing.

6. **Scope of "current API surface" is ambiguous.** Not every API endpoint should necessarily become an MCP tool. The sync detection test needs an explicit decision about which operations are in-scope for MCP. This decision should be documented (in the `EXCLUDED_OPERATIONS` set with comments explaining why each is excluded).

### Additional Agents Needed

- **api-design-minion**: Should weigh in on which API operations should become MCP tools and which should be excluded. The admin endpoints, health check, CORS preflight, and notification unsubscribe are clearly out, but operations like `getCaptureCertificate`, `diffCaptures`, and `getSigningKeys` need a design decision about whether they belong in the MCP surface.
