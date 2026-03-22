## Delegation Plan

**Team name**: mcp-web-evidence
**Description**: Add MCP server to WRL so AI agents can capture and verify web pages via the Model Context Protocol, positioning WRL as "the MCP server for web evidence."

---

### Conflict Resolutions

Before the task list, the three key conflicts resolved during synthesis:

**1. Same Worker vs. Separate Worker**

Chosen: Same Worker, mount at `/mcp`
Over: Separate Worker with service bindings (iac-minion)
Why: A separate Worker violates KISS and YAGNI. The MCP handler is ~100 lines of glue code calling the same business logic functions the REST handlers call. A second Worker means: second wrangler.toml, second package.json, second deployment pipeline, second set of secrets, a service binding that forces HTTP serialization of internal calls, and a two-layer auth model (MCP Worker authenticates callers AND authenticates itself to WRL). All of that complexity serves no purpose when the code fits in one file in the existing Worker. The bundle size increase (~130-160KB gzipped) brings the total to ~870KB -- 8.5% of the 10MB limit. Cold-start impact is ~1ms. The iac-minion's deployment isolation argument has merit for large teams, but this is a single-operator project where deployment blast radius is managed by staging + smoke tests, not service boundaries.

**2. Raw MCP SDK vs. Cloudflare `agents` package**

Chosen: Raw `@modelcontextprotocol/sdk` with `WebStandardStreamableHTTPServerTransport`
Over: Cloudflare `agents` package with `createMcpHandler` (iac-minion)
Why: The mcp-minion verified that `WebStandardStreamableHTTPServerTransport` uses only web-standard APIs (Request, Response, ReadableStream) and works on Workers with `nodejs_compat`. The `agents` package adds 293KB gzipped (vs 130KB for raw SDK + zod), pulls in 258 transitive packages including the AI SDK (440KB), mimetext, partyserver, and yargs -- none of which WRL needs. It also pins MCP SDK v1.26.0, causing duplicate SDK copies in the bundle. The raw SDK approach is leaner (3 deps total vs 258 transitive), avoids the `agents` package's kitchen-sink bloat, and directly aligns with the Helix Manifesto ("lean and mean, minimize dependencies actively"). The `@cfworker/json-schema` optional dep (~45KB) replaces the ajv code path as a safety measure against future `nodejs_compat` changes.

**3. Blocking capture vs. async polling**

Chosen: Async return with polling (mcp-minion)
Over: Internal blocking with 60s timeout (api-design-minion)
Why: The api-design-minion's argument for blocking is compelling for agent UX, but it has a fatal implementation problem: `ctx.waitUntil()` runs the capture asynchronously and there is no way to "await" it from the request handler -- the 202 response is sent before capture starts. To block, the MCP handler would need to poll KV in a loop, which means: (a) multiple KV reads per capture adding cost and latency, (b) holding open a Worker request for up to 60s consuming CPU time quota, (c) risk of hitting the Worker's 30s CPU time limit on paid plans. The existing architecture is fundamentally async-by-design. The MCP tool returns the capture ID with clear instructions to poll `get_capture`. LLMs handle this well -- Claude Code, Cursor, and Windsurf all support multi-step tool workflows. The tool descriptions make the pattern explicit.

---

### Task 1: Add MCP dependencies
- **Agent**: mcp-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |
    Add the MCP TypeScript SDK and its required peer dependency Zod to the WRL Worker project.

    ## What to do

    Add these production dependencies to `/package.json`:
    ```
    "@modelcontextprotocol/sdk": "^1.27.1"
    "zod": "^4.3.6"
    "@cfworker/json-schema": "^0.2.4"
    ```

    Then run `npm install` and verify:
    1. `npm install` completes without errors
    2. `npx wrangler deploy --dry-run --outdir /tmp/wrl-dry-run` succeeds and the bundle is under 1MB gzipped

    ## Why these dependencies

    - `@modelcontextprotocol/sdk` -- the official MCP TypeScript SDK. We use `McpServer` and `WebStandardStreamableHTTPServerTransport` which rely only on web-standard APIs (Request, Response, ReadableStream) and work on Cloudflare Workers with `nodejs_compat`.
    - `zod` (v4) -- required peer dependency of the MCP SDK. Used for tool input schema validation. ~310KB raw, tree-shaken by esbuild.
    - `@cfworker/json-schema` -- replaces the MCP SDK's default ajv JSON schema validator with a Workers-native implementation. Prevents potential breakage if `nodejs_compat` behavior changes. ~45KB.

    ## What NOT to do

    - Do NOT use the Cloudflare `agents` package. It adds 293KB gzipped, 258 transitive packages, and kitchen-sink dependencies (AI SDK, mimetext, partyserver) that WRL does not need.
    - Do NOT add any bundler configuration changes. Standard wrangler esbuild handles the SDK imports.
    - Do NOT modify any existing source files.

    ## Deliverables
    - Updated `package.json` with three new production dependencies
    - Updated `package-lock.json`
    - Console output showing dry-run bundle size

    ## Context
    - Working directory: `/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/snappy-bouncing-sloth`
    - Current dependencies: `@cloudflare/playwright`, `@duckduckgo/autoconsent`, `fflate` (3 total)
    - Current bundle: ~712KB gzipped. Target: under 1MB gzipped after adding MCP deps.
    - `wrangler.toml` already has `nodejs_compat` in compatibility_flags
- **Deliverables**: Updated `package.json` and `package-lock.json` with MCP SDK, Zod, and @cfworker/json-schema
- **Success criteria**: `npm install` succeeds; `wrangler deploy --dry-run` shows bundle under 1MB gzipped

---

### Task 2: Implement MCP server -- tool definitions and request handler
- **Agent**: mcp-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: Task 1
- **Approval gate**: yes
- **Gate reason**: This file defines the MCP tool contract (names, descriptions, input schemas, output format) that agents will interact with and that downstream documentation depends on. The tool descriptions are load-bearing -- they are the primary documentation LLMs read. Hard to change after directory listing.
- **Gate rationale**: |
    Chosen: 4 tools (capture_url, get_capture, list_captures, verify_capture) with async capture and text output format
    Over: 3 tools without list_captures; blocking capture_url with internal polling; raw JSON output
    Why: list_captures is required by the prompt's own R1 constraint ("agents need to retrieve their captures"). Async return matches the existing architecture (ctx.waitUntil is fire-and-forget). Text output optimized for LLM context windows (~100 tokens vs ~400 for raw JSON).
- **Prompt**: |
    Create `src/mcp.js` -- the MCP server implementation for WRL. This is a thin adapter that registers MCP tools and delegates to existing business logic functions.

    ## What to do

    Create a single file `src/mcp.js` that exports:
    1. `handleMcp(request, env, ctx)` -- the request handler for the `/mcp` route
    2. Internally, a `createMcpServer(env, auth)` factory that registers 4 tools

    ## Architecture

    - Use `McpServer` from `@modelcontextprotocol/sdk/server/mcp.js`
    - Use `WebStandardStreamableHTTPServerTransport` from `@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js`
    - Use `CfWorkerJsonSchemaValidator` from `@cfworker/json-schema` as the JSON schema validator (pass as `jsonSchemaValidator` option to McpServer constructor -- check the SDK source to confirm the exact option name)
    - Stateless mode: `sessionIdGenerator: undefined` (create fresh server + transport per request)
    - `enableJsonResponse: true` on the transport (no SSE streaming needed)
    - Auth BEFORE transport: extract Bearer token, verify via `verifyApiKey()` with `requiredScope: 'read'`, pass auth result to tool handlers via `extra.authInfo`

    ## Auth flow

    ```javascript
    async function handleMcp(request, env, ctx) {
      // 1. Auth check (minimum 'read' scope for MCP access)
      const auth = await verifyApiKey(request, env, { requiredScope: 'read' });
      if (!auth.ok) return auth.response;

      // 2. Create transport + server per request (stateless)
      const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
      const server = createMcpServer(env, ctx, auth);
      await server.connect(transport);

      // 3. Delegate to transport
      return transport.handleRequest(request, { authInfo: auth });
    }
    ```

    ## Tool definitions (4 tools)

    ### capture_url
    - **Description**: "Capture a web page as tamper-evident evidence. Takes a screenshot, saves the rendered HTML, and creates a cryptographically signed WACZ bundle. The capture runs asynchronously -- use get_capture to check status and retrieve results. Typically completes in 5-15 seconds."
    - **Input**: `{ url: z.string().describe("The URL to capture. Must be http:// or https://.") }`
    - **Required scope**: `capture` (check `auth.scopes` inside handler; return tool error if insufficient)
    - **Implementation**: Call `validateUrl(url)`, then `createCapture(env.KV, captureId, validatedUrl, ip, auth.tenantId)`, then `ctx.waitUntil(performCapture(...))`. Return text with capture ID and instruction to poll.
    - **Output format** (text):
      ```
      Capture submitted for {url}.

      Capture ID: {captureId}
      Status: pending

      Use get_capture with this ID to check progress. Captures typically complete in 5-15 seconds.
      ```

    ### get_capture
    - **Description**: "Get the status and details of a capture by ID. Returns status (pending, complete, failed), and when complete, includes artifact URLs (screenshot, HTML, WACZ) and a verification URL. The capture ID is the access credential -- no additional auth needed for this tool."
    - **Input**: `{ capture_id: z.string().describe("The capture ID (e.g., cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6).") }`
    - **Required scope**: none (mirrors REST API -- ID is the secret)
    - **Implementation**: Call `getCapture(env.KV, captureId)`. Format based on status.
    - **Output format** (text, when complete):
      ```
      Capture {captureId} is complete.

      URL: {url}
      Captured at: {completedAt}
      Render quality: {renderQuality}

      Artifacts:
      - Screenshot: {origin}/v1/captures/{id}/artifacts/screenshot
      - HTML: {origin}/v1/captures/{id}/artifacts/html
      - WACZ bundle: {origin}/v1/captures/{id}/artifacts/wacz

      Verification: {origin}/v1/verify/{id}
      ```
    - When pending: return text saying status is pending, suggest waiting 5 seconds.
    - When failed: return text with error and retryable flag.
    - When not found: return tool error text "Capture not found."

    ### list_captures
    - **Description**: "List your captures with optional filtering by status. Returns summaries in reverse chronological order. Use get_capture with a specific ID to get full details and artifact URLs."
    - **Input**: `{ status: z.enum(["pending", "complete", "failed"]).optional().describe("Filter by status. Omit to return all."), limit: z.number().int().min(1).max(100).optional().describe("Max results (default 20)."), cursor: z.string().optional().describe("Pagination cursor from a previous list_captures result.") }`
    - **Required scope**: `read` (already satisfied by route-level auth)
    - **Implementation**: Call `listCaptures(env.KV, auth.tenantId, { cursor, limit, status })`.
    - **Output format** (text):
      ```
      Found {count} captures{statusFilter}:

      1. {id} | {status} | {url} | {createdAt}
      2. {id} | {status} | {url} | {createdAt}
      ...

      {if hasMore: "Next page cursor: {cursor}"}
      ```

    ### verify_capture
    - **Description**: "Verify the cryptographic integrity of a capture. Checks artifact hashes, bundle hash, Ed25519 signature, and RFC 3161 timestamp. Returns whether the evidence is intact since capture time."
    - **Input**: `{ capture_id: z.string().describe("The capture ID to verify.") }`
    - **Required scope**: none (public, mirrors REST API)
    - **Implementation**: Follow the same logic as `handleVerifyCapture` in `src/index.js` -- KV lookup, resolve signing key, R2 fetch, `verifyWacz()`. Apply the VERIFY_RATE_LIMITER if available.
    - **Output format** (text):
      ```
      Verification result for {captureId}: VERIFIED

      Checks:
      - Artifact hashes: pass
      - Bundle hash: pass
      - Signature: pass
      - Timestamp: pass (TSA: {tsaName})

      Signed at: {signedAt}
      Bundle hash: {bundleHash}
      ```

    ## Critical implementation notes

    - Tool handlers call existing business logic DIRECTLY (validateUrl, createCapture, getCapture, listCaptures, verifyWacz, etc.) -- NOT HTTP self-calls. This avoids network hops, double auth, and double rate limiting.
    - Import functions from existing modules: `./kv.js`, `./url-validation.js`, `./capture.js`, `./verify.js`, `./signing.js`, `./auth.js`
    - Rate limiting: Apply `CAPTURE_RATE_LIMITER` inside `capture_url` handler, `VERIFY_RATE_LIMITER` inside `verify_capture` handler. `get_capture` and `list_captures` are read-only and use the lighter rate limits (capture limiter for list, none for get).
    - For `capture_url`, generate capture ID the same way as `handleCreateCapture`: `'cap_' + crypto.randomUUID().replace(/-/g, '')`
    - For `verify_capture`, handle the signing key resolution logic (archived keys, fallback to current key) -- replicate from `handleVerifyCapture`
    - For artifact URLs in `get_capture`, construct URLs using the request origin (from the original request, not hardcoded)
    - Use `isError: true` only for infrastructure failures (auth, rate limit, malformed input). Domain failures (capture failed, not found) use `isError: false` with descriptive text.
    - Include `// tva` comment near the top of the file.

    ## What NOT to do

    - Do NOT create a separate Worker or wrangler.toml
    - Do NOT use the `agents` package
    - Do NOT make HTTP requests to the Worker's own REST API
    - Do NOT implement blocking/polling inside capture_url
    - Do NOT add `structuredContent` or `outputSchema` (KISS -- text output is sufficient)
    - Do NOT modify any existing source files (that's Task 3)

    ## Files to create
    - `src/mcp.js`

    ## Existing code to reference
    - `src/index.js` -- see handleCreateCapture, handleGetCapture, handleListCaptures, handleVerifyCapture for the exact business logic flow
    - `src/auth.js` -- verifyApiKey function signature and return shape
    - `src/kv.js` -- createCapture, getCapture, listCaptures function signatures
    - `src/verify.js` -- verifyWacz function
    - `src/signing.js` -- getSigningKeys, verifySignature
    - `src/url-validation.js` -- validateUrl
    - `src/capture.js` -- performCapture
    - `src/responses.js` -- problemResponse (for pre-auth error responses)
    - `src/ip-hash.js` -- computeCip (for rate limit logging)
    - `src/log.js` -- log function
- **Deliverables**: `src/mcp.js` with handleMcp export, 4 tool definitions, auth integration
- **Success criteria**: File exports handleMcp; tool handlers call existing business logic directly; auth is checked before transport; each tool returns LLM-friendly text output

---

### Task 3: Mount `/mcp` route in Worker entry point
- **Agent**: mcp-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: Task 2
- **Approval gate**: no
- **Prompt**: |
    Mount the MCP handler at `/mcp` in the existing Worker entry point and add CORS support for the MCP endpoint.

    ## What to do

    Modify `src/index.js` to:

    1. Import `handleMcp` from `./mcp.js`
    2. Add MCP route handling BEFORE the existing regex router in the fetch handler
    3. Add CORS preflight handling for `/mcp`

    ## Implementation

    In the `fetch` handler, after the pathname normalization and before the existing CORS preflight block:

    ```javascript
    // MCP endpoint -- handle before regex router (MCP transport handles POST, GET, DELETE on same path)
    if (pathname === '/mcp') {
      if (request.method === 'OPTIONS') {
        // CORS preflight for MCP
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, mcp-session-id, mcp-protocol-version',
            'Access-Control-Expose-Headers': 'mcp-session-id, mcp-protocol-version',
            'Access-Control-Max-Age': '7200',
          },
        });
      }
      response = await handleMcp(request, env, ctx);
    }
    ```

    The MCP CORS is more permissive than the REST API CORS (which uses an origin allowlist). MCP clients are server-side processes (Claude Code, Cursor, etc.) that don't send Origin headers, but browser-based MCP clients might. Using `*` is safe because all MCP requests require Bearer auth.

    Make sure the MCP route is checked BEFORE the `if (!response)` block that contains the regex router. The MCP response should still get the security headers at the bottom (Referrer-Policy, X-Content-Type-Options, etc.).

    Also add CORS response headers for MCP POST responses, similar to how the existing code adds them for `/v1/captures`:

    ```javascript
    // CORS response headers for MCP endpoint
    if (pathname === '/mcp' && response) {
      response.headers.set('Access-Control-Allow-Origin', '*');
      response.headers.set('Access-Control-Expose-Headers', 'mcp-session-id, mcp-protocol-version');
    }
    ```

    ## What NOT to do

    - Do NOT change the regex router or any existing routes
    - Do NOT add MCP to the `routes` array (it's handled separately because MCP transport needs to handle multiple HTTP methods on the same path)
    - Do NOT add rate limiting at the route level (rate limiting is inside tool handlers, per-operation)

    ## Files to modify
    - `src/index.js` -- add import and route handling

    ## Context
    - The existing CORS handling uses an origin allowlist from `env.CORS_ORIGINS`
    - The MCP endpoint uses `*` because MCP clients are server-side (no CSRF risk) and all requests require Bearer auth
    - Security headers (Referrer-Policy, X-Content-Type-Options, X-Frame-Options, HSTS, Link) are applied to ALL responses at the bottom of the fetch handler -- MCP responses should get these too
- **Deliverables**: Updated `src/index.js` with MCP route and CORS handling
- **Success criteria**: POST/GET/DELETE to `/mcp` are handled by MCP transport; OPTIONS returns CORS preflight; security headers applied to MCP responses

---

### Task 4: MCP unit and integration tests
- **Agent**: mcp-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: Task 3
- **Approval gate**: no
- **Prompt**: |
    Write tests for the MCP server functionality. Both unit tests for individual tool behaviors and an integration test for the full MCP protocol round-trip.

    ## What to do

    Create `test/mcp.test.js` with tests covering:

    ### Unit tests (tool behavior)

    1. **capture_url -- happy path**: POST to `/mcp` with a JSON-RPC `tools/call` for `capture_url` with a valid URL. Verify response includes capture ID and pending status text.
    2. **capture_url -- missing auth**: Send MCP request without Authorization header. Verify 401 response.
    3. **capture_url -- insufficient scope**: Use an API key with only `read` scope. Verify tool returns an error about `capture` scope being required.
    4. **capture_url -- invalid URL**: Call with an invalid URL (e.g., `ftp://example.com`). Verify tool returns error text.
    5. **get_capture -- pending status**: Create a pending capture in KV, call get_capture. Verify response says pending.
    6. **get_capture -- complete status**: Create a complete capture in KV, call get_capture. Verify response includes artifact URLs and verification URL.
    7. **get_capture -- not found**: Call with non-existent ID. Verify error text.
    8. **list_captures -- happy path**: Create several captures, call list_captures. Verify response lists them.
    9. **list_captures -- with status filter**: Create captures with different statuses, filter by `complete`. Verify only complete captures returned.
    10. **verify_capture -- verified**: Create a complete capture with a signed WACZ in R2, call verify_capture. Verify response says VERIFIED with all checks passing.
    11. **verify_capture -- not found**: Call with non-existent ID. Verify error text.

    ### Protocol tests

    12. **MCP initialize + tools/list**: Send initialize request, verify server info and capabilities. Then send tools/list, verify all 4 tools are listed with correct names and descriptions.
    13. **CORS preflight**: Send OPTIONS to `/mcp`. Verify correct CORS headers.
    14. **Security headers**: Verify MCP responses include Referrer-Policy, X-Content-Type-Options, etc.

    ### Full round-trip test

    15. **Capture → get_capture → verify**: Full sequence: initialize MCP, call capture_url, call get_capture (may need to wait for capture to complete in test env), call verify_capture. This tests the complete agent workflow.

    ## Test infrastructure

    Use the existing vitest + @cloudflare/vitest-pool-workers setup. Tests run in miniflare with real KV, R2, and bindings.

    Follow the patterns in existing test files:
    - `test/auth.test.js` for auth testing patterns
    - `test/capture-retrieval.test.js` for KV/R2 setup patterns
    - `test/list-captures.test.js` for list endpoint testing patterns
    - `test/verify-integration.test.js` for verification testing patterns
    - `test/fixtures.js` for test data helpers

    For MCP protocol interactions, send HTTP requests directly to the Worker's `/mcp` endpoint using the JSON-RPC format:
    ```javascript
    const response = await worker.fetch('http://localhost/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-api-key-for-vitest',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0.0' },
        },
      }),
    });
    ```

    For tool calls after initialization, the stateless transport means each request is independent -- no need to maintain session state between requests. Each request includes auth via the Authorization header.

    Note: With `enableJsonResponse: true`, the transport returns `application/json` responses (not SSE). Parse the response body as JSON and check the `result` field.

    ## What NOT to do

    - Do NOT use the MCP SDK Client for testing -- test at the HTTP level with raw JSON-RPC, since that's what MCP clients actually send
    - Do NOT test the MCP SDK itself -- only test WRL's tool implementations and integration
    - Do NOT create separate test config -- use the existing vitest.config.js

    ## Files to create
    - `test/mcp.test.js`

    ## Context
    - vitest.config.js binds CAPTURE_API_KEY as 'test-api-key-for-vitest'
    - The test API key has legacy auth (capture + read scopes)
    - For scope-restricted tests, create a KV API key record with limited scopes
    - For complete capture tests, create KV records with status: 'complete' and R2 objects for artifacts
    - Look at test/fixtures.js and test/verify-integration.test.js for how to set up signed WACZ bundles for verify tests
- **Deliverables**: `test/mcp.test.js` with unit, protocol, and round-trip tests
- **Success criteria**: All tests pass with `npm test`; coverage of all 4 tools' happy and error paths; full protocol round-trip test

---

### Task 5: MCP documentation and server registry metadata
- **Agent**: user-docs-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: Task 2 (needs finalized tool names/schemas)
- **Approval gate**: no
- **Prompt**: |
    Create MCP documentation for WRL -- both the dedicated docs page and README integration.

    ## What to do

    ### 1. Create `docs/mcp.md`

    Structure with progressive disclosure:

    ```
    # MCP Server

    Brief intro: WRL is available as an MCP server, enabling AI agents to capture
    and verify web pages as part of their workflow.

    ## Quick Setup

    ### Claude Code
    (CLI command + JSON alternative)

    ### Cursor
    (.cursor/mcp.json snippet)

    ### Windsurf
    (~/.codeium/windsurf/mcp_config.json snippet)

    ### Claude Desktop
    (Note: Claude Desktop configures remote servers via Settings > Connectors UI,
    not via config file. Document the limitation -- Bearer token auth may require
    OAuth adapter or stdio bridge.)

    ### Other MCP Clients
    (Generic Streamable HTTP config -- endpoint URL, auth header)

    ## Available Tools

    ### capture_url
    (Description, parameters, example output)

    ### get_capture
    (Description, parameters, example output for each status)

    ### list_captures
    (Description, parameters, example output)

    ### verify_capture
    (Description, parameters, example output)

    ## Tutorial: Capture and Verify a Web Page

    Step-by-step walkthrough of the complete agent workflow:
    1. Call capture_url with a URL
    2. Call get_capture to check status (may need to wait 5-15s)
    3. Call verify_capture to confirm integrity
    Show example tool call/response for each step.

    ## Troubleshooting

    - 401 Unauthorized: API key missing or invalid
    - Capture stays in "pending": Typical capture time is 5-15s, max ~30s
    - Tool not showing in client: Check config format, verify server URL is reachable
    - Rate limiting: capture_url limited to 10/min, verify limited to 60/min
    ```

    ### 2. Add MCP section to README.md

    Add a brief section after the "Offline verification" section (around line 200-ish), before "Finding and sharing captures":

    ```markdown
    #### MCP server (AI agent integration)

    WRL is available as an MCP server for AI coding assistants and agents.
    Connect your MCP client to `https://wrl.benpeter.workers.dev/mcp` with
    your API key. See [docs/mcp.md](docs/mcp.md) for setup instructions.
    ```

    Keep it to 3-5 lines. The README is already long -- this is a pointer, not a tutorial.

    ### 3. Create `server.json` for MCP Registry

    Create `server.json` at the repo root:

    ```json
    {
      "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
      "name": "io.github.benpeter/wrl",
      "title": "Web Resource Ledger",
      "description": "Capture web pages as tamper-evident evidence. Screenshots, rendered HTML, and cryptographically signed WACZ bundles with Ed25519 signatures and RFC 3161 timestamps.",
      "version": "1.0.0",
      "repository": {
        "url": "https://github.com/benpeter/web-resource-ledger",
        "source": "github"
      },
      "remotes": [
        {
          "type": "streamable-http",
          "url": "https://wrl.benpeter.workers.dev/mcp",
          "headers": [
            {
              "name": "Authorization",
              "description": "Bearer token with your WRL API key (e.g., 'Bearer wrl_live_...')",
              "isRequired": true,
              "isSecret": true
            }
          ]
        }
      ]
    }
    ```

    IMPORTANT: Verify the `server.json` schema URL and field names against the current MCP Registry documentation before creating the file. The registry is in preview and the schema may have changed. Use WebSearch or WebFetch to check https://modelcontextprotocol.io/docs/concepts/registry or https://registry.modelcontextprotocol.io for the current schema.

    ## Client config snippet details

    **Claude Code** (CLI):
    ```bash
    claude mcp add wrl --transport http \
      --header "Authorization: Bearer YOUR_WRL_API_KEY" \
      https://wrl.benpeter.workers.dev/mcp
    ```

    **Cursor** (`.cursor/mcp.json`):
    ```json
    {
      "mcpServers": {
        "wrl": {
          "url": "https://wrl.benpeter.workers.dev/mcp",
          "headers": {
            "Authorization": "Bearer ${env:WRL_API_KEY}"
          }
        }
      }
    }
    ```

    **Windsurf** (`~/.codeium/windsurf/mcp_config.json`) -- note `serverUrl` not `url`:
    ```json
    {
      "mcpServers": {
        "wrl": {
          "serverUrl": "https://wrl.benpeter.workers.dev/mcp",
          "headers": {
            "Authorization": "Bearer ${env:WRL_API_KEY}"
          }
        }
      }
    }
    ```

    IMPORTANT: Verify these config formats against current client documentation before writing them. MCP client config formats change between versions. Use WebSearch to check the latest documentation for each client.

    ## What NOT to do

    - Do NOT add full MCP documentation to the README -- keep the README section to 3-5 lines with a link
    - Do NOT submit to MCP directories yet (that happens after deployment)
    - Do NOT invent tool names or descriptions -- use the exact names from `src/mcp.js` (capture_url, get_capture, list_captures, verify_capture)
    - Do NOT document Claude Desktop JSON config -- Claude Desktop uses a UI-based connector setup for remote servers
    - Do NOT add a "last verified" date or version numbers to config snippets -- they'll go stale immediately

    ## Files to create
    - `docs/mcp.md`
    - `server.json` (repo root)

    ## Files to modify
    - `README.md` (add MCP section, ~3-5 lines)

    ## Context
    - README.md is ~420 lines. Keep additions minimal.
    - Production URL: `https://wrl.benpeter.workers.dev/mcp`
    - All 4 tools exist: capture_url, get_capture, list_captures, verify_capture
    - Auth: Bearer token with WRL API key in Authorization header
- **Deliverables**: `docs/mcp.md`, `server.json`, updated README.md
- **Success criteria**: docs/mcp.md has quick setup for 3+ clients, tool reference, tutorial walkthrough, and troubleshooting; README has a brief MCP section with link; server.json has valid registry metadata

---

### Cross-Cutting Coverage

- **Testing**: Covered by Task 4 (MCP-specific tests). Phase 6 post-execution will run the full test suite including existing tests to verify no regressions.
- **Security**: Auth is handled in Task 2 (Bearer token verification before MCP transport). Rate limiting per-tool in Task 2. CORS in Task 3. No new attack surface beyond existing REST API -- MCP tools call the same business logic. Phase 3.5 architecture review includes security-minion for review.
- **Usability -- Strategy**: The tool design (4 tools, text output, polling workflow) was shaped by api-design-minion's recommendations for LLM ergonomics. Tool descriptions are written for AI agent consumption. Phase 3.5 includes ux-strategy-minion.
- **Usability -- Design**: Not applicable -- no user-facing UI. MCP tools are consumed by AI agents programmatically.
- **Documentation**: Covered by Task 5 (docs/mcp.md, README, server.json). Phase 8 post-execution handles any documentation gaps.
- **Observability**: MCP tool handlers use existing logging infrastructure (log function, Coralogix). capture_url logs capture.queued events. verify_capture logs verification. No new observability infrastructure needed -- the MCP layer reuses the same audit trail as REST endpoints.

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - user-docs-minion: The MCP tool descriptions in Task 2 ARE documentation -- they're the primary text agents read. user-docs-minion should review them for clarity before the gate.
    Review focus: Tool description quality, polling workflow explanation clarity, error message usefulness for LLMs.
- **Not selected**:
  - ux-design-minion: No user-facing visual interface produced.
  - accessibility-minion: No HTML/UI output.
  - sitespeed-minion: No web-facing pages; the /mcp endpoint serves JSON-RPC, not browser content.
  - observability-minion: MCP tools reuse existing logging; no new services or observability patterns needed.

### Decisions

- **4 tools vs. 3 tools**
  Chosen: 4 tools (add list_captures)
  Over: 3 tools as stated in success criteria
  Why: The prompt's own constraint says "R1 (list endpoint) must exist -- agents need to retrieve their captures." An agent that captures URLs but cannot find them later is broken. api-design-minion argued this compellingly -- the 4th tool is not scope creep, it completes the user story.

- **Text output vs. JSON output vs. structured output**
  Chosen: Curated text summaries optimized for LLM context windows
  Over: Raw JSON passthrough (wastes ~300 tokens per response on noise fields); structured output with outputSchema (adds complexity for no benefit today)
  Why: MCP tool results go into LLM context windows. A well-formatted text summary is ~100 tokens vs ~400 for raw JSON, and includes only the information an agent needs to take next steps. api-design-minion's analysis on this was persuasive.

- **Direct function calls vs. HTTP self-calls for tool handlers**
  Chosen: Tool handlers call existing business logic functions directly (validateUrl, createCapture, getCapture, etc.)
  Over: Making HTTP requests from the MCP handler to the Worker's own REST API (iac-minion's service binding approach implies this)
  Why: Direct calls avoid network hops, double auth, double rate limiting, and HTTP serialization overhead. The MCP layer is a thin adapter -- it should call the same functions the REST handlers call, not add an HTTP round-trip.

### Risks and Mitigations

1. **MCP SDK version churn** (HIGH likelihood, LOW impact): The SDK is actively evolving. Pin to `~1.27.1`. The `WebStandardStreamableHTTPServerTransport` API surface is small and stable. Test on upgrade. Mitigation: monitor SDK releases, pin version, test before bumping.

2. **Agent polling UX for capture_url** (MEDIUM likelihood, MEDIUM impact): Agents must poll `get_capture` after `capture_url` returns. Some agents may not handle this well. Mitigation: Tool descriptions explicitly instruct the agent to poll. The capture_url response includes the capture ID and clear instructions. Claude Code, Cursor, and Windsurf all handle multi-step tool workflows.

3. **Bundle size growth** (LOW likelihood, LOW impact): Adding ~130-160KB gzipped brings total to ~870KB. Well within 10MB limit. Mitigation: Monitor with `wrangler deploy --dry-run` in CI.

4. **ajv/nodejs_compat fragility** (LOW likelihood, MEDIUM impact): MCP SDK imports ajv unconditionally. Works under `nodejs_compat` today but could break. Mitigation: `@cfworker/json-schema` replaces the ajv code path entirely.

5. **Claude Desktop auth gap** (MEDIUM likelihood, LOW impact): Claude Desktop may not support Bearer token auth for remote MCP servers (requires OAuth). Mitigation: Document the limitation clearly. WRL does not need Claude Desktop support for the primary use case (AI coding assistants use Claude Code/Cursor/Windsurf).

6. **MCP Registry schema changes** (MEDIUM likelihood, LOW impact): Registry is in preview, schema may change. Mitigation: Version `server.json` in repo; re-validate on submission.

### Execution Order

```
Batch 1 (no dependencies):
  Task 1: Add MCP dependencies

Batch 2 (depends on Task 1):
  Task 2: Implement MCP server [APPROVAL GATE]

Batch 3 (depends on Task 2):
  Task 3: Mount /mcp route
  Task 5: MCP documentation (can start once tool names are finalized in Task 2)

Batch 4 (depends on Task 3):
  Task 4: MCP tests
```

Gate position: After Task 2 completes, before Tasks 3/4/5 proceed. This lets the user review the tool contract (names, descriptions, schemas, output format) before it gets wired into routing, tested, and documented.

### Verification Steps

After all tasks complete:
1. Run `npm test` -- all existing tests pass (no regressions) plus new MCP tests pass
2. Run `npx wrangler deploy --dry-run` -- bundle under 1MB gzipped
3. Manual verification: deploy to staging, configure Claude Code to connect to staging MCP endpoint, execute full capture-verify round-trip
4. Verify `docs/mcp.md` has config snippets for Claude Code, Cursor, Windsurf
5. Verify `server.json` validates against MCP Registry schema
6. Verify README has MCP section with link to docs/mcp.md
