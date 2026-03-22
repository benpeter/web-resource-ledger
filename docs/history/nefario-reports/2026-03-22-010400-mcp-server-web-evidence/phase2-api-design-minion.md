# Domain Plan Contribution: api-design-minion

## Recommendations

### Q1: Should `capture_url` block until complete or return immediately?

**Recommendation: Block internally with a timeout, returning the final result.**

The REST API correctly uses 202 + polling for HTTP clients. But MCP tools have a fundamentally different interaction model: an AI agent calling a tool expects a result it can reason about. Returning a capture ID and telling the agent "now call `get_capture` in a loop" creates a multi-step workflow the LLM has to orchestrate, wasting tokens and introducing failure modes (wrong poll interval, premature abandonment, infinite loops).

The MCP server should poll the `/v1/captures/{id}/status` endpoint internally (using the existing `Retry-After: 5` hint) and return the completed capture record once status reaches `complete` or `failed`. This is the "thin adapter" philosophy: the MCP layer absorbs the async complexity that exists for HTTP reasons, presenting a synchronous-feeling tool to the agent.

**Critical constraints:**
- **Timeout**: MCP Streamable HTTP has no specified call timeout, but LLM clients do. Claude Code appears to use ~120s. The capture pipeline worst-case is ~27s (20s nav + 3s settle + 2s consent + 2s post). Set MCP-side poll timeout at 60s -- generous for the pipeline, well within client patience.
- **Progress signaling**: The MCP spec allows servers to send JSON-RPC notifications before the final response on an SSE stream. Use this to send progress notifications (e.g., `notifications/progress` with `"status": "pending"`) while polling, so the client knows the tool has not hung. This is a direct affordance of Streamable HTTP.
- **Error passthrough**: If the capture fails (`status: 'failed'`), return it as a tool result with `isError: false` -- the failure is a domain result, not a protocol error. Include the `error` and `retryable` fields so the agent can decide whether to retry. Reserve `isError: true` for infrastructure failures (network timeout, auth failure, malformed request).

**Alternatives rejected:**
- *Return capture ID immediately*: Forces agent to orchestrate polling. Agents are bad at this -- they'll over-poll or under-poll, burn tokens on status check tool calls, and the UX is terrible compared to "call tool, get result."
- *Webhook callback*: MCP has no callback mechanism. Not applicable.
- *SSE streaming of capture progress*: Technically possible via Streamable HTTP, but adds implementation complexity for negligible agent benefit. The agent doesn't need per-second updates -- it needs the final result.

### Q2: Should `get_capture` serve double duty as list/search, or should there be a separate tool?

**Recommendation: `get_capture` is for single-capture retrieval by ID only. Add `list_captures` as a 4th tool.**

These are semantically different operations with different input schemas, different auth requirements, and different output shapes:

| Aspect | `get_capture` | `list_captures` |
|--------|--------------|-----------------|
| Input | `captureId` (required) | `status`, `limit`, `cursor` (all optional) |
| Auth | None (ID is the secret) | API key required (`read` scope) |
| Output | Single `CaptureRecord` with artifact URLs | Array of `CaptureSummary` (no artifact URLs) |
| REST endpoint | `GET /v1/captures/{id}` | `GET /v1/captures` |

Overloading one tool to handle both "get by ID" and "list with filters" creates ambiguity in the input schema (is `captureId` required or optional?) and confuses the LLM about when to use which mode. Two distinct tools with clear names and schemas are what MCP is designed for.

The prompt.md scope says "3 tools" but also says "R1 (list endpoint) must exist -- agents need to retrieve their captures." That constraint is stronger than the arbitrary tool count. An agent that captures a URL and then cannot find its captures later is broken. The 4th tool is not scope creep -- it completes the user story.

### Q3: What should the tool output format be?

**Recommendation: Curated summary optimized for LLM context windows, not raw JSON passthrough.**

MCP tool results are consumed by LLMs, not by code parsers. The LLM will stuff the entire tool result into its context window. Raw API responses include fields that are noise for an agent (render stage timing, WACZ bundle hashes, signing metadata). This wastes tokens and dilutes signal.

**Output format per tool:**

**`capture_url` result (on success):**
```
Captured {url} successfully.

Capture ID: {id}
Status: complete
Captured at: {completedAt}
Render quality: {renderQuality}

Artifacts:
- Screenshot: {artifacts.screenshot}
- HTML: {artifacts.html}
- Headers: {artifacts.headers} (if present)
- WACZ bundle: {wacz.url} (if present)

Verification: {verifyUrl} (if present)
```

Return as a single `text` content item. The agent gets everything it needs to report to the user or take next steps, in ~100 tokens instead of ~400.

**`capture_url` result (on failure):**
```
Capture of {url} failed.

Error: {error}
Retryable: {retryable}
Capture ID: {id}
```

**`get_capture` result:**
Same format as capture_url success, since the underlying data is identical.

**`list_captures` result:**
```
Found {count} captures (showing page of {limit}, {hasMore ? "more available" : "no more pages"}):

1. {id} | {status} | {url} | {createdAt}
2. {id} | {status} | {url} | {createdAt}
...

{if hasMore: "Next page cursor: {cursor}"}
```

Tabular but compact. Agents can scan the list and pick an ID to inspect further.

**`verify_capture` result:**
```
Verification result for {captureId}: {verified ? "VERIFIED" : "NOT VERIFIED"}

Checks:
- Artifact hashes: {status} {detail if failed}
- Bundle hash: {status} {detail if failed}
- Signature: {status} {detail if failed}
- Timestamp: {status} {detail if present}

{if signing:
Signed at: {signing.signedAt}
Bundle hash: {signing.bundleHash}
}
```

**Why text over structured JSON:**
MCP tool results are `content[]` arrays with typed items. The natural choice is `{ type: "text", text: "..." }`. While `application/json` embedded resource types exist, they add indirection without benefit -- the LLM will parse the text either way, and a well-formatted text summary is more token-efficient than nested JSON. The artifact URLs are included as plain text so the agent can reference them in its response to the user.

### Q4: Should we add `list_captures` as a 4th tool?

**Yes, unambiguously.** See Q2 above. The prompt.md itself says "R1 (list endpoint) must exist -- agents need to retrieve their captures." Shipping an MCP server that can create evidence but cannot retrieve it by anything other than exact ID makes the product unusable for the primary use case (agent captures a URL, later needs to find what it captured).

The tool count should be 4: `capture_url`, `get_capture`, `list_captures`, `verify_capture`.

### Tool Input Schemas

Design these with LLM ergonomics in mind. Every property needs a clear `description` because that is what the LLM reads to decide how to call the tool.

**`capture_url`:**
```json
{
  "name": "capture_url",
  "description": "Capture a web page as tamper-evident evidence. Takes a screenshot, saves rendered HTML, and creates a cryptographically signed WACZ bundle with an independent RFC 3161 timestamp. Returns the completed capture with artifact URLs. Typically completes in 5-15 seconds.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "url": {
        "type": "string",
        "description": "The URL to capture. Must be http:// or https://."
      }
    },
    "required": ["url"]
  }
}
```

**`get_capture`:**
```json
{
  "name": "get_capture",
  "description": "Retrieve metadata and artifact URLs for a completed capture by its ID. Use this when you have a specific capture ID and need its details. Does not require authentication -- the capture ID itself acts as the access credential.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "capture_id": {
        "type": "string",
        "description": "The capture ID (e.g., cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6).",
        "pattern": "^cap_[a-f0-9]{32}$"
      }
    },
    "required": ["capture_id"]
  }
}
```

**`list_captures`:**
```json
{
  "name": "list_captures",
  "description": "List your captures with optional filtering. Returns summaries (not full details) in chronological order. Use get_capture with a specific ID to retrieve full details and artifact URLs.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "status": {
        "type": "string",
        "enum": ["pending", "complete", "failed"],
        "description": "Filter by capture status. Omit to return all statuses."
      },
      "limit": {
        "type": "integer",
        "minimum": 1,
        "maximum": 100,
        "description": "Maximum number of results to return. Default: 20."
      },
      "cursor": {
        "type": "string",
        "description": "Pagination cursor from a previous list_captures result. Omit for the first page."
      }
    },
    "required": []
  }
}
```

**`verify_capture`:**
```json
{
  "name": "verify_capture",
  "description": "Cryptographically verify that a capture's evidence bundle has not been tampered with. Checks artifact hashes, bundle integrity, Ed25519 signature, and RFC 3161 independent timestamp. A 'verified' result means the evidence is intact since capture time.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "capture_id": {
        "type": "string",
        "description": "The capture ID to verify (e.g., cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6).",
        "pattern": "^cap_[a-f0-9]{32}$"
      }
    },
    "required": ["capture_id"]
  }
}
```

### Authentication Design

MCP auth for this server should be straightforward: the existing WRL API key passed via the MCP protocol's auth mechanism. For the Streamable HTTP transport, the MCP spec says servers SHOULD implement proper authentication. The simplest approach:

- Accept the API key as a Bearer token in the HTTP Authorization header on the MCP endpoint itself (the Streamable HTTP POST requests).
- The MCP server extracts this on the initialization request and uses it for all subsequent REST API calls to the WRL backend.
- `get_capture` and `verify_capture` do not require auth on the REST side (ID-as-secret and public endpoint respectively), so only `capture_url` and `list_captures` actually need the key forwarded.
- If no API key is provided, `capture_url` and `list_captures` should return tool errors explaining that authentication is required.

This avoids inventing a new auth scheme. The MCP client configuration simply includes the API key the same way it would for any authenticated MCP server.

### MCP Endpoint URL Design

Single endpoint at `/mcp` on the same Worker. The MCP server and REST API share the same origin. Example: `https://wrl.benpeter.workers.dev/mcp`.

This keeps deployment simple (one Worker, one wrangler.toml) and avoids the operational complexity of a separate service. The `/mcp` route is handled by the MCP transport layer; all other routes continue to serve the REST API.

## Proposed Tasks

1. **Define MCP tool schemas** -- Write the 4 tool definitions (`capture_url`, `get_capture`, `list_captures`, `verify_capture`) with input schemas and descriptions as specified above. These are the contract that LLMs will read.

2. **Implement poll-and-wait adapter for `capture_url`** -- Internal polling loop that calls `/v1/captures/{id}/status` every 5 seconds with a 60-second timeout. Returns the completed capture metadata or the failure reason. Sends MCP progress notifications during polling if the transport supports SSE streaming.

3. **Implement response formatters** -- Four functions that transform raw REST API JSON responses into LLM-optimized text summaries as described in the output format section. These sit between the REST client calls and the MCP tool result construction.

4. **Implement MCP Streamable HTTP transport on the Worker** -- Add `/mcp` route to `src/index.js`. Use Cloudflare's `@anthropic-ai/sdk` or the `agents` package's `createMcpHandler` if it fits, otherwise implement the Streamable HTTP spec directly (POST for client messages, optional SSE for streaming responses, session management).

5. **Wire auth passthrough** -- Extract Bearer token from MCP initialization and forward to REST API calls for `capture_url` and `list_captures`. Return clear tool-level errors when auth is missing for tools that require it.

6. **Integration test: full round-trip** -- Test that covers: initialize MCP session, call `capture_url`, get result, call `verify_capture` on the result, call `list_captures` to find the capture. This is the success criterion from the prompt.

7. **Document MCP server configuration** -- Write configuration examples for Claude Code (settings.json), Cursor, and generic MCP clients. Include the server URL and API key setup.

## Risks and Concerns

1. **Poll timeout vs. capture pipeline time**: The capture pipeline is designed for 27s worst-case, but edge cases (slow sites, browser pool contention) could push it to 40-50s. A 60s MCP timeout should handle this, but if the Worker's `ctx.waitUntil` budget is 30s, the capture could still be processing when the MCP poll times out. **Mitigation**: Return partial result with `"status": "pending"` and the capture ID so the agent can follow up with `get_capture` later. This is the fallback, not the primary path.

2. **Context window bloat**: If we pass raw JSON through, a single verification result is ~1KB of JSON. Multiply by a few tool calls in a conversation and we're consuming meaningful context window space. **Mitigation**: The curated text format in the recommendations above keeps results to ~100-200 tokens per call.

3. **MCP session statefulness on Cloudflare Workers**: Workers are stateless by default. The MCP Streamable HTTP transport supports session IDs but does not require them. For this server, sessions are unnecessary -- each tool call is independent and stateless. The API key in the request header provides identity. **Recommendation**: Do not assign `Mcp-Session-Id`. Return responses directly as `application/json` (not SSE) for simple tool calls. Only use SSE for `capture_url` if progress notifications are implemented.

4. **Scope tension: 3 tools vs. 4 tools**: The prompt says 3 tools, but the constraints require list functionality. Shipping without `list_captures` creates an incomplete product that does not meet the "agents need to retrieve their captures" constraint. **Recommendation**: Communicate clearly that 4 tools are required, and the 4th is not scope creep but a constraint from the prompt.md itself.

5. **`get_capture` auth model leaks through MCP**: The REST API uses capture-ID-as-secret (no auth required for `GET /v1/captures/{id}`). This means any agent that knows a capture ID can retrieve it, even without the API key. This is by design in the REST API, but worth documenting explicitly in the MCP tool description so agents (and their users) understand the security model.

6. **Rate limiting interaction**: MCP tool calls will hit the same rate limiters as direct REST API calls. An agent calling `capture_url` (which internally polls status multiple times) will consume rate limit tokens for the status endpoint. The status endpoint uses the `capture` rate limit group. **Mitigation**: Internal polling from the Worker to itself may not hit the rate limiter if implemented as internal function calls rather than HTTP requests. Recommend calling `handleCaptureStatus` directly (or the KV layer) instead of making HTTP requests to the Worker's own URL.

7. **Cloudflare Workers MCP SDK maturity**: The `@anthropic-ai/sdk` and `agents` package MCP support on Workers is relatively new. Verify the SDK version supports the full Streamable HTTP spec, particularly non-SSE JSON responses for simple tool calls. If the SDK is too opinionated (e.g., forces Durable Objects for state), a lightweight custom implementation may be simpler and more aligned with the project's lean philosophy.

## Additional Agents Needed

- **mcp-minion**: Should be consulted for MCP protocol specifics -- particularly the Streamable HTTP transport implementation details, MCP SDK selection (Cloudflare agents package vs. custom), and MCP client configuration patterns. The tool schema design is an API design concern (covered here), but the transport layer and protocol-level session management is MCP domain expertise.

- **edge-minion / iac-minion**: Should validate that the `/mcp` route addition works within the existing Worker architecture, particularly around the `ctx.waitUntil` budget for the poll-and-wait pattern in `capture_url`, and whether internal function calls (vs. HTTP self-calls) are the right approach for polling capture status.
