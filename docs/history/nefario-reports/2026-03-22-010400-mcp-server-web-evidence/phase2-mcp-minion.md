## Domain Plan Contribution: mcp-minion

### Recommendations

#### 1. Use the MCP TypeScript SDK directly -- not Cloudflare's `agents` package

**Decision**: Import `McpServer` from `@modelcontextprotocol/sdk/server/mcp.js` and `WebStandardStreamableHTTPServerTransport` from `@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js`. Do NOT use Cloudflare's `agents` package (`createMcpHandler` from `agents/mcp`).

**Evidence**:
- The `agents` package (npm: `agents`) pins MCP SDK at 1.26.0 and drags in partyserver, nanoid, yargs, mimetext, picomatch -- none of which WRL needs. It's 11 transitive deps for a convenience wrapper around the same SDK classes we'd use directly.
- `WebStandardStreamableHTTPServerTransport` uses only web-standard APIs (Request, Response, ReadableStream). I verified it works in Cloudflare Workers local dev with `nodejs_compat` -- full initialize/tool-call round-trip succeeds.
- Bundle impact is manageable: the MCP SDK + Zod adds ~885KB uncompressed / 160KB gzipped. Current WRL bundle is 3.5MB / 727KB gzipped. Combined total ~4.4MB / ~890KB gzipped -- well under CF Workers limits (10MB compressed on paid plans).

#### 2. Add `zod` (v4) and `@modelcontextprotocol/sdk` as production dependencies

**Dependencies to add**:
```json
{
  "zod": "^4.3.6",
  "@modelcontextprotocol/sdk": "^1.27.1"
}
```

**Rationale**: The MCP SDK requires Zod as a peer dependency (it's not optional). The SDK uses Zod for tool schema validation -- this is core protocol behavior, not optional ergonomics. The `zod` package adds ~310KB to the bundle; the SDK adds ~147KB on top. Both are tree-shaken by wrangler's esbuild bundler. The project philosophy is "minimal dependencies" but these two are load-bearing protocol requirements, not convenience libraries.

**Optional but recommended**: Add `@cfworker/json-schema` (~45KB overhead). The SDK's `Server` base class unconditionally imports `ajv` for its `AjvJsonSchemaValidator`, which works under `nodejs_compat` but is technically a Node.js-oriented library. Passing `CfWorkerJsonSchemaValidator` as a server option is the clean Workers-compatible path. This prevents potential breakage if Cloudflare's `nodejs_compat` behavior changes.

#### 3. Mount MCP at `/mcp` alongside existing REST routes in the same Worker

**Architecture**: Single Worker, single `fetch` handler. Add an MCP route check *before* the existing regex router, because the MCP transport needs to handle POST, GET, and DELETE on the same path.

**Pattern** (conceptual, in `src/index.js`):
```javascript
// At the top of the fetch handler, before the regex router:
if (pathname === '/mcp' || pathname === '/mcp/') {
  return handleMcp(request, env, ctx);
}
// ... existing regex router continues below
```

**Why not a separate Worker**: A separate Worker would require a separate deployment, separate wrangler config, separate KV/R2 bindings, and either service bindings or network hops to reach the existing API. This violates YAGNI and KISS. The MCP handler is ~50 lines of glue code -- it creates a transport, registers tools, connects, and delegates. It shares the same auth module, the same KV bindings, and the same domain.

#### 4. Use stateless mode (`sessionIdGenerator: undefined`)

**Decision**: Stateless MCP transport. Create a new `McpServer` + `WebStandardStreamableHTTPServerTransport` per request.

**Evidence and reasoning**:
- All three tools (`capture_url`, `get_capture`, `verify_capture`) are simple request-response wrappers over existing REST endpoints. No server-side state persists between MCP calls.
- MCP SDK 1.26.0+ enforces that stateless transports cannot be reused across requests (throws "Stateless transport cannot be reused across requests"). This security fix prevents cross-client response leakage. Fresh instances per request is the correct pattern.
- The SDK's Hono example (`honoWebStandardStreamableHttp.js`) demonstrates exactly this pattern: `const transport = new WebStandardStreamableHTTPServerTransport()` with no options, plus `const server = getServer()` -- both fresh per request.
- `enableJsonResponse: true` should be set. The tools are synchronous request-response (no streaming needed). JSON mode avoids SSE overhead and simplifies client integration. MCP clients that support Streamable HTTP accept both modes.

#### 5. Auth before MCP transport -- at the Worker routing level

**Decision**: Extract and verify the Bearer token from the Authorization header *before* passing the request to the MCP transport's `handleRequest()`. If auth fails, return the existing `problemResponse(401, ...)` directly.

**Why**:
- The MCP transport's `handleRequest()` expects a web-standard Request and returns a web-standard Response. It does not know about WRL's auth system.
- The SDK provides `authInfo` in `HandleRequestOptions` that gets passed through to tool handlers. We should use this to thread the verified tenant context into tool handlers.
- Auth at the routing level means:
  1. Invalid API keys never touch the MCP SDK (fast fail, consistent error format).
  2. Tool handlers receive the authenticated `tenantId` and `scopes` via `extra.authInfo`.
  3. The existing `verifyApiKey()` function works unchanged -- it returns `{ ok, tenantId, scopes, ... }`.
  4. Rate limiting is handled at the routing level, same as existing endpoints.

**Implementation sketch**:
```javascript
async function handleMcp(request, env, ctx) {
  // Auth check (require 'read' scope minimum for all MCP access)
  const auth = await verifyApiKey(request, env, { requiredScope: 'read' });
  if (!auth.ok) return auth.response;

  // Rate limit (reuse capture limiter)
  // ...

  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
  });
  const server = createMcpServer(env, auth);
  await server.connect(transport);
  return transport.handleRequest(request, { authInfo: auth });
}
```

#### 6. Three tools with layered design -- no API-wrapper-one-on-one anti-pattern

**Tool definitions**:

| Tool Name | Maps To | Auth Scope | Description for LLM |
|-----------|---------|------------|---------------------|
| `capture_url` | `POST /v1/captures` | `capture` | Capture a web page as tamper-evident evidence. Returns a capture ID for polling. The capture runs asynchronously -- poll `get_capture` until status is `complete`. |
| `get_capture` | `GET /v1/captures/{id}` + `GET /v1/captures/{id}/status` | `read` | Get capture status and metadata. Returns status (`pending`, `complete`, `failed`), URLs to artifacts (screenshot, HTML, WACZ), and verification URL. If status is `pending`, wait and retry. |
| `verify_capture` | `GET /v1/verify/{id}` | (none -- public) | Verify the cryptographic integrity of a captured web page. Returns whether the WACZ bundle passes all integrity checks (artifact hashes, bundle hash, Ed25519 signature). |

**Design notes**:
- `get_capture` combines status-polling and metadata retrieval into a single tool. An agent calling `capture_url` naturally needs to check status, then get the full record once complete. Making these separate tools would force the agent to learn two tools for one logical operation. The tool handler checks status first (via `getCapture` from KV) and returns the appropriate response based on state.
- `capture_url` needs `capture` scope. `get_capture` needs `read` scope. `verify_capture` is public (mirrors the REST API). Scope checking happens inside tool handlers because the auth gate at the route level only requires the minimum (`read`).
- Tool descriptions are written for LLM consumption -- they explain the *workflow* (capture, poll, verify), not just what the endpoint does. This is critical for agent task completion rates.

#### 7. CORS for `/mcp` endpoint

The MCP spec requires specific CORS headers for browser-based MCP clients. The transport itself does not set CORS headers -- this is the server's responsibility. Add CORS handling for `/mcp`:

```
Access-Control-Allow-Origin: * (or from CORS_ORIGINS env var)
Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, mcp-session-id, mcp-protocol-version, Last-Event-ID
Access-Control-Expose-Headers: mcp-session-id, mcp-protocol-version
```

Since the WRL already has CORS infrastructure for `/v1/captures`, extend the same pattern to `/mcp`.

#### 8. Tool output format -- dual format with structured data

Each tool should return both human-readable text and structured data in `content`:

```javascript
return {
  content: [
    { type: "text", text: `Capture ${captureId} is complete. URL: ${url}\nVerification: ${verifyUrl}` },
  ],
  // Structured data available in MCP SDK result
  structuredContent: { id: captureId, status: "complete", url, verifyUrl, artifacts }
};
```

Wait -- looking at the SDK more carefully, `structuredContent` requires `outputSchema` to be defined. For KISS, we can use text-only content with JSON embedded, or define output schemas. Given the project philosophy, start with text content that includes the key data in a parseable format. If agents need structured output, add `outputSchema` in a follow-up.

**Revised approach**: Return text content with clear, structured text that LLMs can parse. Include resource links where appropriate.

### Proposed Tasks

#### Task 1: Add MCP dependencies

**What**: Add `@modelcontextprotocol/sdk`, `zod`, and `@cfworker/json-schema` to `package.json` dependencies.

**Deliverables**:
- Updated `package.json` with three new production dependencies
- Verified `npm install` succeeds
- Verified `wrangler deploy --dry-run` succeeds (bundle under limits)

**Dependencies**: None (first task)

#### Task 2: Create `src/mcp.js` -- MCP server factory and tool definitions

**What**: Create a single file that exports a `createMcpServer(env, auth)` factory function and a `handleMcp(request, env, ctx)` request handler. The factory registers the three tools. The handler does auth, rate limiting, transport creation, and delegation.

**Deliverables**:
- `src/mcp.js` with:
  - `createMcpServer(env, auth)` -- returns a configured McpServer instance
  - `handleMcp(request, env, ctx)` -- full request lifecycle
  - Three tool registrations: `capture_url`, `get_capture`, `verify_capture`
- Each tool calls the existing business logic directly (not HTTP self-calls):
  - `capture_url`: validates URL, calls `createCapture()`, calls `performCapture()` via `ctx.waitUntil()`, returns capture ID and status URL
  - `get_capture`: calls `getCapture()` from KV, returns status/metadata/artifact URLs
  - `verify_capture`: calls `getCapture()` + `verifyWacz()`, returns verification result

**Dependencies**: Task 1

**Critical implementation note**: The tool handlers should call the same business logic functions that the REST handlers call (e.g., `validateUrl()`, `createCapture()`, `getCapture()`, `verifyWacz()`) -- NOT make HTTP requests to the REST API. This avoids network hops, double auth, and keeps the MCP layer thin.

#### Task 3: Mount `/mcp` route in `src/index.js`

**What**: Add the MCP route check before the existing regex router. Handle CORS preflight for `/mcp`. Include the same security headers as other routes.

**Deliverables**:
- Updated `src/index.js` with MCP routing
- CORS OPTIONS handling for `/mcp`
- Security headers applied to MCP responses

**Dependencies**: Task 2

#### Task 4: Tests for MCP tools

**What**: Unit tests for the MCP tool handlers. Integration test for a full capture-verify round-trip via MCP protocol.

**Deliverables**:
- `test/mcp.test.js` -- unit tests for each tool (happy path, error cases, auth failures)
- Integration test that sends JSON-RPC initialize, tools/list, tools/call for each tool
- Verify tool descriptions are present and useful

**Dependencies**: Task 3

#### Task 5: Documentation -- MCP server configuration examples

**What**: Document how to configure Claude Code, Claude Desktop, and generic MCP clients to connect to the WRL MCP server.

**Deliverables**:
- MCP configuration section in README or dedicated docs page
- Claude Code configuration example (HTTP transport)
- Generic MCP client configuration example
- Example workflow: capture -> poll -> verify

**Dependencies**: Task 4

### Risks and Concerns

#### R1: Bundle size growth (Medium likelihood, Low impact)

Adding ~160KB gzipped to the Worker bundle. Current total would be ~890KB gzipped. CF Workers paid plan limit is 10MB. Risk is low unless other large dependencies are added concurrently.

**Mitigation**: Monitor bundle size in CI. The `wrangler deploy --dry-run` output reports size.

#### R2: MCP SDK version churn (High likelihood, Low impact)

The MCP SDK is actively evolving (current: 1.27.1). Breaking changes have occurred between versions (e.g., 1.26.0 security fix for stateless transport reuse). The spec itself was just donated to Linux Foundation.

**Mitigation**: Pin to a specific minor version (`~1.27.1`). Test on upgrade. The WebStandardStreamableHTTPServerTransport API surface is small and stable (constructor + handleRequest).

#### R3: `nodejs_compat` dependency for ajv (Low likelihood, Medium impact)

The MCP SDK's `Server` class unconditionally imports `AjvJsonSchemaValidator`, which pulls in the `ajv` package. This works under Cloudflare's `nodejs_compat` flag (which WRL already uses), but if `nodejs_compat` behavior changes or ajv does something incompatible, it could break.

**Mitigation**: Use `CfWorkerJsonSchemaValidator` from `@cfworker/json-schema` (optional peer dep) as the `jsonSchemaValidator` option. This replaces the ajv code path entirely. Costs ~45KB extra bundle size but removes the Node.js compatibility concern.

#### R4: `capture_url` tool is async -- agent polling UX (Medium likelihood, Medium impact)

The `capture_url` tool returns immediately with a capture ID (status: `pending`). The agent must then poll `get_capture` until status changes to `complete`. This is the correct pattern (captures take 5-30 seconds), but some MCP clients may not handle multi-step tool workflows well.

**Mitigation**: Write clear tool descriptions that explain the polling workflow. The `capture_url` response should explicitly say "Poll get_capture with this ID until status is 'complete'". Consider adding a `note` field with retry guidance. In future, MCP's experimental task/async support could make this smoother, but for now, explicit instructions in tool output are the pragmatic solution.

#### R5: Zod v4 is relatively new (Low likelihood, Low impact)

The MCP SDK supports `"zod": "^3.25 || ^4.0"`. Zod v4 was released in 2025. The SDK's zod-compat layer handles both v3 and v4. WRL currently has no Zod dependency, so there's no version conflict risk.

**Mitigation**: Use Zod v4 (smaller, faster). The SDK example code uses `zod/v4`. If issues arise, downgrade to Zod v3.25+ is straightforward since the SDK's compat layer handles both.

#### R6: Rate limiting scope for MCP endpoint (Low likelihood, Medium impact)

The `/mcp` endpoint handles three logical operations in one route. A single rate limiter bucket for `/mcp` would conflate reads (cheap) with captures (expensive). An agent doing rapid `get_capture` polls could hit the same rate limit as `capture_url`.

**Mitigation**: Apply rate limiting inside tool handlers, not at the route level. Use existing rate limiters: `CAPTURE_RATE_LIMITER` for `capture_url`, `VERIFY_RATE_LIMITER` for `verify_capture`, and a lighter limit (or none) for `get_capture` status checks. This matches the REST API's per-endpoint rate limiting.

### Additional Agents Needed

None. The current team (mcp-minion for protocol integration, api-design-minion for tool surface design, iac-minion for deployment concerns, user-docs-minion for documentation) covers all aspects. The implementation is a thin adapter layer -- no new infrastructure, no new auth system, no complex architecture. The MCP SDK does the heavy protocol lifting; WRL's existing business logic does the domain work. The glue code between them is straightforward JavaScript.
