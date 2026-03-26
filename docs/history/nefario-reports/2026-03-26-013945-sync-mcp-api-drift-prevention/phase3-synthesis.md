## Delegation Plan

**Team name**: sync-mcp-api-surface
**Description**: Update the WRL MCP server to reflect the current API surface (11 tools), add a CI drift-detection test, and update documentation.

### Conflict Resolutions

**1. Tool count and scope**

The success criterion says "All current API endpoints are represented as MCP tools." Taken literally, this means ~31 operationIds. That is clearly wrong -- admin endpoints, CORS preflight, health checks, unsubscribe pages, and billing flows are not agent jobs. mcp-minion proposed 11 tools. ux-strategy-minion proposed up to 15 (8 core + 7 automation including webhooks).

**Resolution**: 11 tools. mcp-minion's list is the right scope. Webhooks are deferred -- ux-strategy-minion's own Tier 2 acknowledged these are "lower priority" and the project follows YAGNI. Schedules (list/create/delete) are included because an agent managing recurring captures is a core job. Webhooks require the agent to know infrastructure URLs (callback endpoints), which is a poor fit for MCP. The `get_artifact` tool that ux-strategy proposed is excluded -- `get_capture` already returns artifact URLs, and a separate download tool would return binary content that MCP handles poorly (mcp-minion's reasoning is sound). The success criterion is reinterpreted as: "All tenant-facing agent jobs are reachable through MCP tools. All other operationIds are explicitly listed in an exclusion manifest with reasons."

Chosen: 11 tools (4 existing + 7 new)
Over: 15 tools (including webhooks) per ux-strategy-minion
Why: YAGNI -- webhooks need infra URLs agents don't have. 11 tools covers all core + schedule jobs without crossing the cognitive load threshold.

**2. Drift detection mechanism**

api-spec-minion wants a `mcp-coverage.json` manifest. test-minion wants inline `EXCLUDED_OPERATIONS` / `TOOL_TO_OPERATION` maps in the test. Both want the same invariant: `mapped + excluded == all operationIds`.

**Resolution**: Inline in the test file, not a separate JSON manifest. The manifest is 4 lines of tool mappings and ~20 lines of exclusions -- a separate JSON file is overhead for this size. The test file is the single source of truth for the sync assertion. If the map grows, extraction can happen later (YAGNI). The test lives in its own file `test/mcp-sync.test.js` because it needs Node `fs` access to read `openapi.yaml`, and the main test suite runs in the cloudflare:test workerd pool. The sync test will use vitest's `poolMatchGlobs` or a separate vitest workspace to run in Node (`forks` pool).

Chosen: Inline maps in `test/mcp-sync.test.js` running in Node pool
Over: Separate `mcp-coverage.json` manifest per api-spec-minion
Why: KISS -- 25 lines of map data don't warrant a separate file. Node pool solves the `fs` access problem cleanly.

**3. Parameter parity checking**

api-spec-minion and test-minion both suggested checking that MCP tool inputSchema properties match OpenAPI parameters. Both acknowledged the snake_case/camelCase mapping problem makes this fragile.

**Resolution**: Defer parameter-level checking. The operationId-level completeness check is the high-value deliverable. Parameter parity is a nice-to-have that adds mapping complexity and maintenance burden disproportionate to its value. The per-tool tests (which exercise real business logic) catch parameter regressions more reliably than structural comparison.

Chosen: OperationId completeness only, no parameter parity
Over: Parameter-level spec comparison per api-spec-minion Task 3
Why: Per-tool tests already catch parameter regressions. The camelCase/snake_case mapping would be fragile and require its own maintenance.

**4. Documentation approach**

software-docs-minion wants a generator script that extracts tool definitions from `src/mcp.js` and generates markdown. This is elegant but violates KISS for 11 tools that change infrequently.

**Resolution**: Manual docs update, no generator script. The drift-detection CI test already catches when tools are added/removed without updating the exclusion list. A docs generator adds a build step, a script to maintain, and coupling to the `server.tool()` call pattern. For 11 tools, manual documentation is faster to write and maintain than building and debugging a generator. The consolidation of `docs/mcp.md` and `site/content/mcp.md` is also deferred -- it is out of scope for this task (the issue says nothing about site build changes).

Chosen: Manual docs update to `docs/mcp.md`
Over: Auto-generated tool reference per software-docs-minion
Why: KISS/YAGNI -- 11 tools don't justify a generator script. CI sync test prevents the drift the generator was meant to solve.

### Task 1: Add 7 new MCP tool definitions
- **Agent**: mcp-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: none
- **Approval gate**: yes
- **Gate reason**: This defines the MCP tool surface that downstream tasks (tests, docs, drift detection) all depend on. Multiple valid approaches exist for tool response formatting, scope checks, and error handling. Hard to reverse once tests and docs are built against it.
- **Gate rationale**: |
    Chosen: 11 tools covering capture, verify, diff, schedules, usage, certificate
    Over: 15 tools (adding webhooks, notifications, artifacts), or 4 tools (status quo)
    Why: 11 covers all tenant-facing agent jobs without crossing cognitive load threshold or requiring infra knowledge (webhooks)
- **Prompt**: |
    ## Task: Add 7 new MCP tool definitions to src/mcp.js

    You are updating the WRL MCP server to reflect the current API surface. The MCP server is at `src/mcp.js` (553 lines, 4 tools currently). You are adding 7 new tools for a total of 11.

    ### Context

    The MCP server is a single-file module that creates an McpServer instance with tool registrations. Each tool uses Zod for input validation, calls existing business logic functions directly (no HTTP self-calls), and returns MCP TextContent. Auth is handled before the MCP transport is constructed -- tool handlers receive an `auth` object with `tenantId`, `scopes`, `keyName`, `keyHashPrefix`, `authMethod`.

    The server runs on Cloudflare Workers via `@cloudflare/vitest-pool-workers`. It uses stateless mode (one McpServer per request).

    ### New tools to add

    | Tool | operationId | Business logic | Scope required |
    |------|-------------|----------------|----------------|
    | `batch_capture` | batchCapture | See `handleBatchCapture` in `src/index.js` -- extracts URLs, validates, enqueues. Import needed functions from `src/db.js`, `src/url-validation.js`, `src/kv.js`. | capture |
    | `diff_captures` | diffCaptures | Import `diffHtml`, `diffHeaders`, `diffScreenshot`, `computeChangeSummary` from `src/diff.js`. Need to fetch artifacts from R2 for both captures, run diff functions, return text summary. | read (implicit) |
    | `get_usage` | getAccountUsage | Import `getUsage`, `computePeriod` from `src/db.js`. Returns current period usage (captures, eidas_timestamps). | read (implicit) |
    | `list_schedules` | listSchedules | Import `listSchedules` from `src/db.js`. | read (implicit) |
    | `create_schedule` | createSchedule | Import `createSchedule` from `src/db.js`. Needs URL validation, cron expression, name. | capture |
    | `delete_schedule` | deleteSchedule | Import `deleteSchedule` from `src/db.js`. | read (implicit) |
    | `get_certificate` | getCaptureCertificate | Import `generateCertificate` from `src/certificate.js`. Returns certificate data as text (not binary PDF). The certificate generator returns structured data -- format it as readable text. | read (implicit) |

    ### Implementation guidance

    1. **Follow existing patterns exactly.** Look at `capture_url`, `get_capture`, `list_captures`, `verify_capture` for the pattern: Zod schema, scope check (if needed), business logic call, text formatting, error handling.

    2. **Tool descriptions**: Use this template (from ux-strategy-minion):
       - Sentence 1: What it does and what it returns
       - Sentence 2: Timing expectations or constraints
       - Sentence 3: What to do next (workflow continuation)
       Keep descriptions concise (3 lines max like existing tools).

    3. **Naming**: Flat `verb_noun` pattern. Already decided: `batch_capture`, `diff_captures`, `get_usage`, `list_schedules`, `create_schedule`, `delete_schedule`, `get_certificate`.

    4. **Scope checks**: Only `batch_capture` and `create_schedule` need explicit `capture` scope checks (like `capture_url` does). Other tools are read-only and the default read scope suffices.

    5. **batch_capture specifics**:
       - Input: `{ urls: z.array(z.string()).max(20) }`
       - Each URL needs validation via `validateUrl()`
       - Enqueue each valid URL to the CAPTURE_QUEUE (look at `handleBatchCapture` in index.js for the pattern)
       - Return text summary: "N/M URLs accepted" plus per-item status
       - Rate limit check per-tenant before enqueuing

    6. **diff_captures specifics**:
       - Input: `{ base_id: z.string(), target_id: z.string(), include: z.string().optional() }`
       - Both captures must exist and be complete
       - Fetch artifacts from R2, run diff functions, format as text report
       - Look at the diff route handler in `src/index.js` for the full flow

    7. **get_certificate specifics**:
       - Returns formatted text (certificate details, signatures, timestamps), NOT binary PDF
       - The `generateCertificate` function returns structured data -- extract the key fields and format as readable text

    8. **create_schedule specifics**:
       - Input: URL, name, cron expression
       - Validate URL, validate cron (look at `handleCreateSchedule` in `src/schedules.js` for validation)
       - Generate schedule ID (`sch_` + 32 hex chars)

    9. **Bump version** from `'0.1.0'` to `'0.2.0'` in the McpServer constructor.

    10. **Keep the file single-file** unless it exceeds ~1000 lines. At 553 + ~300 for 7 new tools, it should stay under.

    ### What NOT to do
    - Do NOT add webhook tools (deferred -- YAGNI)
    - Do NOT add admin tools (different auth boundary)
    - Do NOT add notification tools (UI concern, not agent job)
    - Do NOT add artifact download tool (get_capture returns URLs, binary content is poor MCP fit)
    - Do NOT create a separate MCP server file or split into modules
    - Do NOT change existing tool behavior (only add new ones and bump version)

    ### Files to modify
    - `src/mcp.js` -- add 7 tool registrations, add imports, bump version

    ### Files to read (for reference, do not modify)
    - `src/index.js` -- route handlers show the business logic flow
    - `src/db.js` -- database functions (createSchedule, listSchedules, getSchedule, deleteSchedule, getUsage, computePeriod, getCapture, listCaptures)
    - `src/diff.js` -- diff functions (diffHtml, diffHeaders, diffScreenshot, computeChangeSummary)
    - `src/certificate.js` -- generateCertificate function
    - `src/schedules.js` -- schedule route handlers (for validation patterns)
    - `src/url-validation.js` -- validateUrl function
    - `src/auth.js` -- hasScope function
    - `src/kv.js` -- rateLimitCounter (for batch rate limiting)

    ### Deliverables
    - Updated `src/mcp.js` with 11 total tools and version 0.2.0

    ### Success criteria
    - All 7 new tools registered with Zod schemas, handlers, and descriptions
    - Scope checks on batch_capture and create_schedule
    - Version bumped to 0.2.0
    - File stays under ~900 lines
    - No new dependencies added

- **Deliverables**: Updated `src/mcp.js` with 11 tools, version 0.2.0
- **Success criteria**: All 7 new tools have Zod schemas, handlers, descriptions, appropriate scope checks. File under ~900 lines. No new dependencies.

### Task 2: Write drift detection test
- **Agent**: test-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |
    ## Task: Create MCP-OpenAPI drift detection test

    You are creating a test that prevents the MCP server's tool surface from silently drifting behind the OpenAPI spec. This is the highest-value deliverable in the plan -- it is the CI safety net that makes the sync permanent.

    ### Context

    The WRL project uses vitest with `@cloudflare/vitest-pool-workers`. The main tests run in a workerd pool (cloudflare:test). However, this test needs Node.js `fs` to read `openapi.yaml`, so it must run in a Node pool.

    The `yaml` package (v2.8.2) is already in devDependencies.

    There are 31 operationIds in `openapi.yaml`. After Task 1, 11 of them are MCP tools. The remaining 20 are intentionally excluded.

    ### Implementation

    Create `test/mcp-sync.test.js` with these assertions:

    1. **Parse `openapi.yaml`**: Read the file with `fs.readFileSync`, parse with `yaml`. Extract all operationIds from the `paths` object.

    2. **Define the mapping inline** (not a separate JSON file):

    ```js
    const TOOL_TO_OPERATION = {
      'capture_url': 'createCapture',
      'batch_capture': 'batchCapture',
      'get_capture': 'getCapture',
      'list_captures': 'listCaptures',
      'verify_capture': 'verifyCapture',
      'diff_captures': 'diffCaptures',
      'get_usage': 'getAccountUsage',
      'list_schedules': 'listSchedules',
      'create_schedule': 'createSchedule',
      'delete_schedule': 'deleteSchedule',
      'get_certificate': 'getCaptureCertificate',
    };

    const EXCLUDED_OPERATIONS = {
      'getHealth': 'Infrastructure health check, not an agent task',
      'preflightCaptures': 'CORS preflight, not an API operation',
      'getCaptureStatus': 'Subset of getCapture, redundant for MCP',
      'getCaptureArtifact': 'Binary download, not representable as MCP text content',
      'getSigningKey': 'Public key infrastructure, not an agent task',
      'getSigningKeys': 'Public key infrastructure, not an agent task',
      'adminCreateKey': 'Admin auth boundary, not tenant MCP',
      'adminListKeys': 'Admin auth boundary, not tenant MCP',
      'adminRevokeKey': 'Admin auth boundary, not tenant MCP',
      'adminGetUsage': 'Admin auth boundary, not tenant MCP',
      'adminCachePurge': 'Admin auth boundary, not tenant MCP',
      'createWebhook': 'Deferred -- requires infrastructure URLs agents lack',
      'listWebhooks': 'Deferred -- webhook management via MCP',
      'deleteWebhook': 'Deferred -- webhook management via MCP',
      'pingWebhook': 'Deferred -- webhook management via MCP',
      'getNotificationPreferences': 'UI/settings concern, not agent workflow',
      'updateNotificationPreferences': 'UI/settings concern, not agent workflow',
      'getUnsubscribePage': 'Browser-rendered HTML page, not an API',
      'processUnsubscribe': 'Browser form handler, not an API',
      'getSchedule': 'Read-only detail -- listSchedules covers the use case',
    };
    ```

    Note: `getSchedule` is excluded because `list_schedules` returns full schedule objects. A separate `get_schedule` tool adds no distinct value. Adjust if Task 1 includes it.

    3. **Three test assertions**:

    ```js
    it('every API operationId is either mapped to an MCP tool or explicitly excluded', () => {
      const specOps = new Set(allOperationIds);
      const mapped = new Set(Object.values(TOOL_TO_OPERATION));
      const excluded = new Set(Object.keys(EXCLUDED_OPERATIONS));
      const covered = new Set([...mapped, ...excluded]);
      const uncovered = [...specOps].filter(op => !covered.has(op));
      expect(uncovered).toEqual([]);
    });

    it('no operationId is both mapped and excluded', () => {
      const mapped = new Set(Object.values(TOOL_TO_OPERATION));
      const excluded = new Set(Object.keys(EXCLUDED_OPERATIONS));
      const overlap = [...mapped].filter(op => excluded.has(op));
      expect(overlap).toEqual([]);
    });

    it('no stale exclusions (every excluded operationId exists in the spec)', () => {
      const specOps = new Set(allOperationIds);
      const excluded = Object.keys(EXCLUDED_OPERATIONS);
      const stale = excluded.filter(op => !specOps.has(op));
      expect(stale).toEqual([]);
    });
    ```

    4. **Pool configuration**: This test needs Node `fs`. Add a `poolMatchGlobs` entry to `vitest.config.ts`:

    ```js
    test: {
      poolMatchGlobs: [
        ['test/mcp-sync.test.js', 'forks'],
      ],
      // ... existing config
    }
    ```

    If `poolMatchGlobs` is not supported by the cloudflare vitest pool, create a separate `vitest.sync.config.ts` that uses the default Node pool and only includes `test/mcp-sync.test.js`. Add a corresponding npm script: `"test:sync": "vitest run --config vitest.sync.config.ts"` and ensure CI runs both.

    ### What NOT to do
    - Do NOT check parameter parity (deferred -- fragile camelCase/snake_case mapping)
    - Do NOT create a separate JSON manifest file -- keep mappings inline in the test
    - Do NOT modify the MCP server code
    - Do NOT import from `cloudflare:test` -- this test runs in Node

    ### Files to create
    - `test/mcp-sync.test.js`

    ### Files to modify
    - `vitest.config.ts` -- add poolMatchGlobs (or create `vitest.sync.config.ts` + npm script)
    - `package.json` -- add npm script if separate config needed

    ### Deliverables
    - `test/mcp-sync.test.js` that fails when a new operationId is added to `openapi.yaml` without being mapped or excluded
    - Vitest configuration that runs this test in Node pool
    - Test passes with current state

    ### Success criteria
    - `npm test` (or `npm run test:sync`) runs the sync test and passes
    - Adding a fake operationId to the spec causes the test to fail
    - Removing a mapped tool from the exclusion list causes the test to fail

- **Deliverables**: `test/mcp-sync.test.js`, vitest config changes
- **Success criteria**: Test passes with current state. Adding a new operationId to openapi.yaml without updating the test causes CI failure.

### Task 3: Add per-tool tests for new MCP tools
- **Agent**: test-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |
    ## Task: Add tests for 7 new MCP tools

    You are adding test coverage for the 7 new MCP tools added in Task 1. Follow the existing test patterns in `test/mcp.test.js` exactly.

    ### Context

    The test file is at `test/mcp.test.js` (419 lines, 4 tool test blocks). It uses:
    - `cloudflare:test` for `env` and `SELF`
    - `mcpPost(body, authHeader)` helper for JSON-RPC requests
    - `initRequest()` for MCP initialize
    - `toolCall(name, args, id)` for tool invocations
    - `seedApiKey(env.DB, key, overrides)` from `test/fixtures.js`
    - `createCapture(db, id, url, ip, tenantId)` from `src/db.js`
    - Per-tool `describe` blocks with happy-path and error cases

    The test pool is `@cloudflare/vitest-pool-workers` (workerd). DB fixtures use D1 directly. R2 objects can be put via `env.CAPTURES` bucket.

    ### Tools to test

    For each new tool, create a `describe('tool: <name>')` block with:
    - Happy path test (valid input, expected text output)
    - Error path test (missing/invalid input, scope failures)

    1. **batch_capture**: Test with 2-3 URLs, verify per-item results in response text. Test with invalid URLs mixed in. Test scope check (key without `capture` scope).

    2. **diff_captures**: Needs two complete captures with R2 artifacts. Use `seedApiKey` + `createCapture` + `completeCapture` + R2 puts for both. Verify diff summary in response. Test with non-existent capture ID.

    3. **get_usage**: Seed usage counters via `incrementUsage` from `src/db.js`. Verify usage numbers in response.

    4. **list_schedules**: Seed schedules via `createSchedule` from `src/db.js`. Verify list in response. Test empty list.

    5. **create_schedule**: Test with valid URL + cron. Verify schedule created. Test with invalid URL. Test scope check.

    6. **delete_schedule**: Seed a schedule, delete it, verify gone. Test with non-existent schedule ID.

    7. **get_certificate**: Needs a complete capture with WACZ data. Verify certificate text in response. Test with pending capture.

    Also update the `'lists all N WRL tools'` test from 4 to 11 and update the `expect(names).toContain(...)` assertions for all 11 tool names.

    ### What NOT to do
    - Do NOT use data-driven/table-driven test patterns -- keep per-tool describe blocks
    - Do NOT test the drift detection (that is a separate test file)
    - Do NOT modify `src/mcp.js`
    - Do NOT split the test file unless it exceeds ~1000 lines -- try to keep it in one file first

    ### Files to modify
    - `test/mcp.test.js` -- add 7 describe blocks, update tool count assertion

    ### Files to read (for fixture patterns)
    - `test/fixtures.js` -- seed functions
    - `src/db.js` -- createSchedule, incrementUsage, completeCapture
    - `src/diff.js` -- understand what artifacts diff needs

    ### Deliverables
    - Updated `test/mcp.test.js` with tests for all 11 tools
    - tools/list assertion updated to 11

    ### Success criteria
    - All new tests pass with `npm test`
    - Each tool has at least one happy-path and one error-path test
    - tools/list asserts 11 tools with correct names

- **Deliverables**: Updated `test/mcp.test.js` with tests for all 11 tools
- **Success criteria**: All tests pass. Each new tool has happy-path and error-path coverage. tools/list asserts 11 tools.

### Task 4: Update MCP documentation
- **Agent**: software-docs-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |
    ## Task: Update MCP documentation for 11 tools

    You are updating `docs/mcp.md` to document all 11 MCP tools (4 existing + 7 new). Also update `site/content/mcp.md` to match.

    ### Context

    Two MCP doc files exist:
    - `docs/mcp.md` -- repo-level documentation
    - `site/content/mcp.md` -- docs site content

    Both need to reflect the expanded tool surface. Keep them consistent (same tool documentation content).

    ### Structure

    Organize the tools by domain with a summary table at the top:

    ```markdown
    ## Available Tools (11)

    | Tool | Description | Scope |
    |------|-------------|-------|
    | capture_url | Capture a web page as evidence | capture |
    | batch_capture | Capture multiple URLs at once | capture |
    | get_capture | Get capture status and details | read |
    | list_captures | List captures with filters | read |
    | verify_capture | Verify capture integrity | read |
    | diff_captures | Compare two captures | read |
    | get_usage | Get current period usage | read |
    | list_schedules | List recurring capture schedules | read |
    | create_schedule | Create a recurring capture schedule | capture |
    | delete_schedule | Delete a capture schedule | read |
    | get_certificate | Get evidence certificate | read |
    ```

    Then group detailed documentation by domain:

    ### Capture Tools
    - capture_url, batch_capture, get_capture, list_captures

    ### Verification & Analysis
    - verify_capture, diff_captures, get_certificate

    ### Account & Scheduling
    - get_usage, list_schedules, create_schedule, delete_schedule

    For each tool, document:
    - Description (from tool registration)
    - Parameters table (name, type, required, description)
    - Required scope
    - Example usage context (one sentence)

    ### Intentional Omissions section

    Add a section explaining which API endpoints are NOT MCP tools and why:
    - Admin endpoints (different auth boundary)
    - Webhook endpoints (deferred -- require infrastructure URLs)
    - Binary artifact downloads (MCP returns text, not binary)
    - Health/CORS/signing-key infrastructure endpoints
    - Notification/unsubscribe UI endpoints

    This section helps developers understand the MCP surface design, and directs them to the drift-detection test for the authoritative exclusion list.

    ### What NOT to do
    - Do NOT create a documentation generator script
    - Do NOT consolidate the two doc files into one (out of scope)
    - Do NOT add multi-tool workflow examples beyond what already exists (keep scope tight)
    - Do NOT document internal implementation details (handler code, business logic functions)

    ### Files to modify
    - `docs/mcp.md`
    - `site/content/mcp.md`

    ### Files to read (for accurate tool info)
    - `src/mcp.js` -- tool registrations (after Task 1, will have 11 tools)

    ### Deliverables
    - Updated `docs/mcp.md` with all 11 tools documented
    - Updated `site/content/mcp.md` to match
    - "Intentional Omissions" section in both files

    ### Success criteria
    - All 11 tools documented with parameters, scopes, descriptions
    - Summary table at top
    - Intentional omissions section present
    - Both doc files consistent

- **Deliverables**: Updated `docs/mcp.md` and `site/content/mcp.md`
- **Success criteria**: All 11 tools documented with parameters and scopes. Intentional omissions section explains what is excluded and why.

### Cross-Cutting Coverage

- **Testing**: Task 2 (drift detection) and Task 3 (per-tool tests) cover testing. Phase 6 runs tests post-execution.
- **Security**: mcp-minion's design keeps admin endpoints out of the tenant MCP server (different auth boundary). Scope checks on capture/schedule tools enforce authorization. No new attack surface beyond existing API. security-minion review in Phase 3.5 validates.
- **Usability -- Strategy**: ux-strategy-minion's input shaped the tool selection (11 not 31), naming convention (flat verb_noun), and description template (3-sentence pattern). Included in Phase 3.5 review.
- **Usability -- Design**: Not applicable -- no UI changes. MCP tools are consumed programmatically by AI agents.
- **Documentation**: Task 4 covers docs. Phase 8 runs documentation assessment post-execution.
- **Observability**: Not applicable -- MCP tools call existing business logic that already has logging/metrics. No new runtime components.

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - None selected. This plan adds tools to an existing MCP server using existing business logic. No new UI, no new runtime components, no new user-facing documentation site changes, no coordinated observability needs.
- **Not selected**:
  - ux-design-minion: No UI components produced
  - accessibility-minion: No web-facing HTML/UI produced
  - sitespeed-minion: No web-facing runtime code changes
  - observability-minion: MCP tools reuse existing instrumented business logic
  - user-docs-minion: docs/mcp.md update is a reference page, not a user guide

### Decisions

- **Tool surface size**
  Chosen: 11 tools (add diff, batch, schedules, usage, certificate)
  Over: 15 tools per ux-strategy (adding webhooks, get_artifact), or 4 tools (status quo)
  Why: 11 covers all core agent jobs. Webhooks need infra URLs. get_artifact returns binary. YAGNI for the rest.

- **Drift detection approach**
  Chosen: operationId completeness test with inline maps in Node-pool test file
  Over: Separate JSON manifest (api-spec-minion), parameter parity checking (api-spec-minion/test-minion)
  Why: Inline maps are simpler for 25 entries. Parameter parity has camelCase/snake_case fragility. Per-tool tests catch parameter regressions.

- **Documentation approach**
  Chosen: Manual docs update
  Over: Auto-generated tool reference with CI sync check (software-docs-minion)
  Why: 11 tools don't justify generator tooling. Drift test catches structural changes already.

- **getSchedule exclusion**
  Chosen: Exclude from MCP tools (list_schedules returns full objects)
  Over: Include as separate tool per mcp-minion
  Why: list_schedules already returns all schedule details. A get_schedule tool adds no agent value -- same data, one more tool to consider.

### Risks and Mitigations

1. **Business logic imports may not be cleanly extractable** (mcp-minion Risk #1). The route handlers in `src/index.js` orchestrate multiple functions. MCP tool handlers need to replicate this orchestration. Mitigation: read the route handlers carefully and compose the same function calls. Verified: key functions (`createSchedule`, `diffHtml`, `generateCertificate`, `getUsage`) are already exported from their respective modules.

2. **Node pool for sync test may conflict with cloudflare:test config** (api-spec-minion Risk #1). The vitest config uses `@cloudflare/vitest-pool-workers` globally. Adding `poolMatchGlobs` may not be supported by the Cloudflare pool plugin. Mitigation: if `poolMatchGlobs` fails, create a separate `vitest.sync.config.ts` with standard Node pool and a dedicated npm script.

3. **Drift detection false positives on new endpoints** (mcp-minion Risk #5). New operationIds in the spec will fail CI until someone adds them to the tool map or exclusion list. Mitigation: clear error message in test output explaining what to do. This is a feature, not a bug -- it forces explicit decisions.

4. **mcp.js file size after 7 new tools**. Estimated ~850 lines (553 + ~40 per tool). Still under the ~1000 line threshold. If it exceeds, the tool handlers share enough structure to stay readable in a single file.

### Execution Order

```
Batch 1 (parallel):
  Task 1: Add 7 new MCP tool definitions  [GATE]

Batch 2 (parallel, after Task 1 approval):
  Task 2: Write drift detection test
  Task 3: Add per-tool tests for new tools
  Task 4: Update MCP documentation

Post-execution:
  Phase 5: Code review (code-review-minion, lucy, margo)
  Phase 6: Test execution (npm test)
  Phase 8: Documentation assessment
```

### External Skills

No external skills detected relevant to this task.

### Verification Steps

1. `npm test` passes -- all unit tests including new tool tests and drift detection
2. The drift detection test catches a simulated new operationId (manual verification: temporarily add a fake operationId to openapi.yaml, confirm test fails)
3. `docs/mcp.md` lists all 11 tools with parameters and scopes
4. `src/mcp.js` registers exactly 11 tools with version 0.2.0
5. MCP `tools/list` returns 11 tools with correct names (verified by existing test pattern)
