# Meta-Plan: Sync MCP Server with API Surface + Drift Prevention

## Planning Consultations

### Consultation 1: MCP tool design for expanded API surface

- **Agent**: mcp-minion
- **Planning question**: The WRL MCP server currently exposes 4 tools (capture_url, get_capture, list_captures, verify_capture) but the OpenAPI spec defines ~25 endpoints across 9 tags (health, captures, verification, signing, admin, webhooks, account, notifications, schedules). Which endpoints should become MCP tools vs. MCP resources vs. omitted? Specifically: (a) Should admin endpoints (key management, cache purge, usage) be tools given they require a different auth scheme (adminAuth vs bearerAuth)? (b) Should artifact/certificate download endpoints become tools or resources? (c) How should batch capture be modeled -- single tool with array input or separate tool? (d) What's the right tool naming convention for the expanded set? The current tools use snake_case verb_noun (capture_url, get_capture). With ~15+ new tools, should we namespace (e.g., webhook_create, schedule_list) or keep flat?

- **Context to provide**: `src/mcp.js` (current 4-tool implementation), `openapi.yaml` (full API surface with all endpoint definitions, parameters, response schemas), the existing auth model (bearerAuth for tenant ops, adminAuth for infrastructure ops)

- **Why this agent**: MCP protocol expertise -- knows when to use tools vs. resources, understands tool schema design patterns, transport considerations, and how MCP clients discover capabilities. Critical for deciding the tool surface before implementation.

### Consultation 2: API-MCP sync detection mechanism

- **Agent**: api-spec-minion
- **Planning question**: We need a CI check that detects when the OpenAPI spec (`openapi.yaml`) and MCP server (`src/mcp.js`) are out of sync. Three approaches: (a) Parse OpenAPI paths and compare against tool names registered in mcp.js, failing if an endpoint exists without a corresponding tool (or an explicit exclusion entry). (b) Generate a tool manifest from OpenAPI at build time and compare against the runtime tool list. (c) A contract test that initializes the MCP server, calls tools/list, and asserts the tool count/names match a snapshot derived from the spec. Which approach is most maintainable given this is a single-file MCP server on Cloudflare Workers with vitest tests? How should we handle intentional exclusions (endpoints that should NOT become MCP tools)?

- **Context to provide**: `openapi.yaml` (spec structure, tags, paths), `src/mcp.js` (tool registration pattern using `server.tool()`), `.github/workflows/ci.yml` (current CI structure), `test/mcp.test.js` (existing test patterns), `package.json` (tooling available)

- **Why this agent**: OpenAPI spec expertise -- understands spec parsing, contract-first workflows, and how to build reliable sync checks between a spec and implementation. Knows the tradeoffs of snapshot-based vs. generative approaches.

### Consultation 3: Test strategy for expanded MCP tools

- **Agent**: test-minion
- **Planning question**: The current `test/mcp.test.js` tests 4 tools against cloudflare:test (workerd miniflare). Adding ~10-15 new tools means significant test expansion. (a) What's the right testing strategy -- should each tool get its own describe block with happy path + error cases, or should we use a data-driven/parameterized approach for tools that follow similar patterns (e.g., all GET-by-ID tools)? (b) Some new tools (batch capture, visual diff, schedules) require more complex fixture setup. How should we handle this without the test file becoming unwieldy? (c) The sync detection test (from Consultation 2) -- should it live in the MCP test file or as a separate spec-level test? (d) Should we add an integration test that hits staging with a real MCP client for core flows (capture, list, get, verify)?

- **Context to provide**: `test/mcp.test.js` (current test patterns, helpers, fixture setup), `test/fixtures.js` (shared test utilities), the vitest + cloudflare:test setup, staging URLs

- **Why this agent**: Test architecture expertise. The test expansion is significant and getting the structure right prevents a test file that's harder to maintain than the code it tests.

### Consultation 4: UX strategy for MCP tool surface

- **Agent**: ux-strategy-minion
- **Planning question**: An MCP server's tool list is its "UI" for AI agents. With the expansion from 4 to ~15+ tools, cognitive load increases for both the AI client (which tools to pick) and the human reviewing agent actions. (a) Should we group tools by domain (capture tools, admin tools, account tools) via naming convention, or keep a flat namespace? (b) Which endpoints should be excluded from MCP because they don't serve a coherent agent workflow (e.g., is unsubscribe-from-notifications useful as an MCP tool)? (c) Should tool descriptions follow a consistent template (what it does, when to use it, what scope is needed)? (d) The current tools have quite detailed descriptions -- should new tools maintain this verbosity or be more concise given the larger tool count?

- **Context to provide**: Current tool names and descriptions from `src/mcp.js`, the full endpoint list from `openapi.yaml` with their tags and descriptions

- **Why this agent**: Every plan needs journey coherence review. MCP tool surface is a UX problem -- the "user" is an AI agent, but the principles of discoverability, naming consistency, and cognitive load still apply. UX-strategy can identify which endpoints form coherent agent workflows and which are operational noise.

### Consultation 5: Documentation plan

- **Agent**: software-docs-minion
- **Planning question**: The MCP docs exist in two places: `docs/mcp.md` (repo docs) and `site/content/mcp.md` (docs site). Both currently document 4 tools. (a) Should the tool list in docs be auto-generated from the MCP server (keeping docs in sync automatically) or manually maintained with the CI sync check catching drift? (b) What's the right documentation structure for ~15 tools -- flat list, grouped by domain, or a reference table with links to detailed sections? (c) Should the docs include example MCP conversations showing multi-tool workflows (e.g., "capture, wait, verify" flow)?

- **Context to provide**: `docs/mcp.md`, `site/content/mcp.md`, the expanded tool list (once determined)

- **Why this agent**: Documentation architecture. With a 4x expansion of the tool surface, the docs structure needs to scale without becoming a wall of text.

## Cross-Cutting Checklist

- **Testing**: INCLUDE -- test-minion is Consultation 3. Test expansion for ~15 new tools plus a sync detection mechanism is a core deliverable of this task.
- **Security**: EXCLUDE from planning -- the MCP server already enforces auth (bearerAuth/adminAuth) and scope checks. New tools will follow the same auth pattern. No new attack surface is introduced; we're exposing existing authenticated endpoints through an additional transport. security-minion should review the execution plan in Phase 3.5 but doesn't need to contribute to planning.
- **Usability -- Strategy**: INCLUDE -- ux-strategy-minion is Consultation 4. MCP tool surface design is a UX problem.
- **Usability -- Design**: EXCLUDE from planning -- no visual UI is involved. MCP tools are programmatic interfaces consumed by AI agents, not humans interacting with a visual interface.
- **Documentation**: INCLUDE -- software-docs-minion is Consultation 5. Docs updates are a stated success criterion.
- **Observability**: EXCLUDE from planning -- the existing MCP handler already logs via `ctx.waitUntil(log(...))` with `via: 'mcp'` attribution. New tools will follow the same logging pattern. No new observability infrastructure needed.

## Notable Exclusions

- **security-minion**: New tools reuse existing auth and scope checks -- no new auth model or attack surface. Will review in Phase 3.5.
- **frontend-minion**: No UI components involved; MCP server is a backend JSON-RPC interface.
- **iac-minion**: No CI/CD or infrastructure changes beyond adding a test step to the existing CI workflow, which test-minion and api-spec-minion will cover.

## Anticipated Approval Gates

1. **MCP tool surface design** (MUST gate): Which endpoints become tools, which are excluded, naming conventions. This is a high-blast-radius design decision -- every subsequent task (implementation, tests, docs) depends on it. Hard to reverse once tools are published and clients depend on names. Gate after mcp-minion and ux-strategy-minion contributions are synthesized.

2. **Sync detection approach** (no gate): The mechanism choice (parse-based vs. snapshot vs. contract test) is relatively easy to reverse and self-contained. Will be decided during synthesis based on api-spec-minion input.

## Rationale

This task has two distinct dimensions: (1) expanding the MCP tool surface to match the API, and (2) preventing future drift. The first is primarily an MCP design problem (which endpoints, how they map to tools, naming) with a UX dimension (tool discoverability for AI agents). The second is a spec/contract problem (how to detect mismatches) with a testing dimension (where the check lives, how it runs).

mcp-minion provides the protocol-level design expertise for tool vs. resource decisions. api-spec-minion brings spec parsing and contract-testing knowledge for the drift detection mechanism. test-minion ensures the test expansion is well-structured. ux-strategy-minion keeps the tool surface coherent from a consumer perspective. software-docs-minion plans the documentation structure to scale with the tool count.

## Scope

**In scope**:
- Determine which API endpoints become MCP tools (and which are excluded with rationale)
- Design tool schemas (names, parameters, response formatting) for new tools
- Implement new tools in `src/mcp.js`
- Create a CI-integrated sync detection mechanism (spec vs. MCP tools)
- Expand `test/mcp.test.js` with tests for all new tools
- Update `docs/mcp.md` and `site/content/mcp.md` with current tool list
- Integration test against staging for core flows

**Out of scope**:
- New MCP features beyond current API surface (no new API endpoints)
- MCP server hosting/deployment changes
- OAuth for MCP (session-based auth)
- Changes to the OpenAPI spec itself
- Changes to the underlying API implementation

## External Skill Integration

### Discovered Skills

| Skill | Location | Classification | Domain | Recommendation |
|-------|----------|---------------|--------|----------------|
| ops-runbook | `.claude/skills/ops-runbook/SKILL.md` | LEAF | WRL operational procedures (tenant management, D1 queries, deploys) | Not relevant -- this task is about MCP tool definitions and drift detection, not operational procedures. Exclude. |

### Precedence Decisions

No precedence conflicts. The ops-runbook skill covers operational procedures, not MCP development. No overlap with any specialist agent.
