# Meta-Plan: R15 -- MCP Server for Web Evidence

## Planning Consultations

### Consultation 1: MCP Transport Architecture

- **Agent**: mcp-minion
- **Planning question**: The WRL codebase is a vanilla JS Cloudflare Worker with a hand-rolled regex router (`src/index.js`). The MCP TypeScript SDK provides `WebStandardStreamableHTTPServerTransport` from `@modelcontextprotocol/server` for web-standard runtimes, and `McpServer` for tool registration (using Zod schemas). Two architectural approaches exist: (1) Add the MCP SDK as a dependency and mount the transport at `/mcp` alongside the existing REST routes, sharing the same Worker fetch handler; (2) Build a separate Worker or use a sub-router that delegates to the SDK transport. Given that the project philosophy is YAGNI/KISS with minimal dependencies, but the SDK requires both `@modelcontextprotocol/server` and `zod` as dependencies -- what is the right integration pattern? Should we use stateless mode (`sessionIdGenerator: undefined`) since the tools are simple request-response wrappers? How should auth (existing Bearer token) be handled -- before the MCP transport sees the request, or inside tool handlers?
- **Context to provide**: `src/index.js` (router pattern, auth flow), `wrangler.toml` (Worker config), `package.json` (current deps), `src/auth.js` (verifyApiKey), MCP SDK docs for `WebStandardStreamableHTTPServerTransport`
- **Why this agent**: MCP protocol expert -- knows transport semantics, stateful vs stateless tradeoffs, how auth integrates with MCP's own protocol layer, and what MCP clients expect

### Consultation 2: Tool Schema Design

- **Agent**: api-design-minion
- **Planning question**: The three MCP tools (`capture_url`, `get_capture`, `verify_capture`) map to existing REST endpoints: `POST /v1/captures`, `GET /v1/captures/{id}`, `GET /v1/verify/{id}`. The REST API uses RFC 7807 problem responses, async 202 with polling for capture, cursor-paginated list, and content negotiation for verification. How should the tool schemas be designed to give AI agents the best experience? Specifically: (1) Should `capture_url` block until complete (poll internally) or return the capture ID for the agent to poll via `get_capture`? (2) Should `get_capture` also serve as the list/search tool, or should there be a 4th `list_captures` tool? (3) What should the tool output format be -- the full JSON response, or a curated summary optimized for LLM context windows? (4) The task scope says 3 tools, but the backlog mentions "R1 (list endpoint) must exist -- agents need to retrieve their captures." Should we add a `list_captures` tool as a 4th tool?
- **Context to provide**: `openapi.yaml` (endpoint contracts), handler implementations in `src/index.js`, existing response shapes
- **Why this agent**: API design expertise for translating REST semantics into tool-call semantics -- different interaction model (request-response tools vs REST resources)

### Consultation 3: Documentation and Directory Listing Strategy

- **Agent**: user-docs-minion
- **Planning question**: The success criteria include "documentation includes MCP server configuration examples" and "listed in MCP server directories." What documentation artifacts are needed? Specifically: (1) What does an MCP server config snippet look like for Claude Code (`claude_desktop_config.json` or equivalent), Cursor, and other MCP clients? (2) Which MCP server directories exist and what is the submission process for each? (3) Should the README get an MCP section, or should there be a dedicated `docs/mcp.md`? (4) What level of tutorial content is needed -- just config snippets, or a full "capture your first page via MCP" walkthrough?
- **Context to provide**: Current README structure, the positioning as "the MCP server for web evidence," target audience (AI agent developers and LLM power users)
- **Why this agent**: User-facing documentation expertise -- knows what end users (agent developers configuring MCP servers) need to get started

### Consultation 4: Dependency and Build Impact

- **Agent**: iac-minion
- **Planning question**: Adding `@modelcontextprotocol/server` and `zod` to the Worker introduces new dependencies to a project that currently has only 3 runtime deps (`@cloudflare/playwright`, `fflate`, `@duckduckgo/autoconsent`). What is the impact on: (1) Worker bundle size (Cloudflare has a 10MB compressed limit for Workers with browser binding)? (2) Cold-start latency? (3) CI build time? (4) Should the MCP route be in the same Worker or a separate Worker (same wrangler.toml with service bindings, or separate project)? The project uses `wrangler` for builds with no bundler config -- will the SDK's ESM exports work cleanly?
- **Context to provide**: `wrangler.toml`, `package.json`, current Worker entry point pattern, Cloudflare Worker size limits
- **Why this agent**: Infrastructure expertise -- understands Cloudflare Worker constraints, bundle size tradeoffs, deployment architecture

## Cross-Cutting Checklist

- **Testing**: Include test-minion for planning. The MCP integration introduces a new protocol surface -- need to determine testing strategy. Can we use the existing `@cloudflare/vitest-pool-workers` test setup to test MCP tool calls? Do we need integration tests that exercise the full MCP protocol handshake? Should the round-trip test (success criteria: "MCP client can complete a full capture-verify round-trip") be manual or automated?
- **Security**: Include security-minion for planning. The MCP transport creates a new attack surface on the Worker. Key questions: How does auth work when MCP clients send tool calls -- is the Bearer token passed as MCP protocol metadata, or does it go in the HTTP Authorization header on the transport request? Does the stateless transport mode avoid session hijacking concerns? Are there prompt injection risks with tool input validation (URL parameter in `capture_url`)?
- **Usability -- Strategy**: ALWAYS include. How does an AI agent's workflow with WRL differ from a human developer's? What is the agent's "job to be done" -- is it "capture a page and get proof," "monitor a page over time," or "verify an existing capture"? The tool naming and descriptions are the UX for AI agents. Should tool descriptions include example workflows?
- **Usability -- Design**: Exclude. No user-facing UI is produced in this task. The "interface" is MCP tool schemas consumed by AI agents, which is covered by api-design-minion and ux-strategy-minion.
- **Documentation**: ALWAYS include (see Consultation 3 above). Both software-docs-minion (OpenAPI spec updates, architecture docs) and user-docs-minion (MCP config examples, directory listings) are relevant.
- **Observability**: Include observability-minion for planning. MCP tool calls will generate log events. Should they use the existing Coralogix logging (`src/log.js`) with MCP-specific event types? How do we correlate MCP tool calls with the underlying REST operations they trigger? Should there be MCP-specific rate limiting or does the existing per-IP rate limiting suffice?

## Notable Exclusions

- **frontend-minion**: No frontend components -- MCP servers are consumed programmatically by AI agents, not through a browser UI.
- **edge-minion**: The MCP endpoint is served from the same Cloudflare Worker; no CDN, caching, or edge routing decisions beyond what already exists.
- **product-marketing-minion**: While "listed in MCP server directories" is a success criterion, the actual directory submission is a mechanical task (fill out forms, submit PRs). The positioning ("the MCP server for web evidence") is already defined in the task scope. Marketing copy is not in scope.

## Anticipated Approval Gates

1. **MCP integration architecture** (MUST gate): Whether to add the SDK as a dependency vs. implement the protocol manually; same Worker vs. separate Worker; stateless vs. stateful transport. This is a hard-to-reverse architectural decision with downstream impact on all implementation tasks.

2. **Tool schema design** (MUST gate): The tool names, descriptions, input/output schemas, and behavioral semantics (blocking vs. async capture) define the public API contract that MCP clients will depend on. Hard to change once published to directories.

## Rationale

This task is primarily an **integration** challenge -- bridging the MCP protocol to an existing REST API. The core risk is getting the architecture right (SDK integration pattern, auth flow, transport mode) and the tool UX right (schema design for AI agent ergonomics). The four planning consultations cover:

- **mcp-minion**: Protocol-level integration decisions (transport, auth, stateful/stateless)
- **api-design-minion**: Tool schema design (translating REST to tool semantics)
- **user-docs-minion**: Documentation and directory listing (the "go-to-market" for an MCP server)
- **iac-minion**: Build and deployment impact (dependency weight, bundle size, Worker architecture)

Cross-cutting agents (test, security, observability, ux-strategy) add depth to the plan without needing separate planning consultations -- their concerns are woven into the specialist questions above, and they will participate in execution and review.

## Scope

**What this achieves**: WRL becomes accessible to any MCP-compatible AI agent (Claude Code, Cursor, Windsurf, custom agents) as a tool provider. An agent can capture a URL, retrieve the capture, and verify its integrity -- all through standard MCP tool calls. This positions WRL as infrastructure for AI-driven web evidence workflows.

**In scope**:
- Thin MCP adapter layer (new source file(s) in `src/`)
- 3 tool definitions: `capture_url`, `get_capture`, `verify_capture` (possibly 4 with `list_captures`)
- Streamable HTTP transport mounted at `/mcp` on the existing Worker
- Auth via existing Bearer token mechanism
- Documentation: MCP config examples, directory listing submissions
- OpenAPI spec update (if the `/mcp` endpoint warrants it -- MCP has its own protocol, may not need OpenAPI)
- Tests for MCP tool handlers
- Evolution log entry

**Out of scope**:
- New capture capabilities beyond existing API
- Agent-specific UX (custom tool descriptions per agent)
- MCP auth beyond existing API key (no OAuth, no MCP-native auth)
- MCP resources or prompts (tools only)
- Separate Worker deployment (likely -- but this is a planning question)

## External Skill Integration

No external skills detected in project.
