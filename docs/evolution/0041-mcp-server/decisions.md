# Decisions: MCP Server for Web Evidence

## Transport Class Selection

**Chosen:** `WebStandardStreamableHTTPServerTransport` from `@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js`
**Over:** `StreamableHTTPServerTransport` (Node.js-only, uses `http.IncomingMessage`); Cloudflare `agents` package (258 transitive deps, 293KB bloat)
**Why:** Uses only Web Standard APIs (`Request`, `Response`, `ReadableStream`), which are natively available on Cloudflare Workers with `nodejs_compat`. The `agents` package was rejected because it pulls in the full Cloudflare Agents framework for a feature that only needs one transport class.

## Stateless vs Session Mode

**Chosen:** Stateless mode (`sessionIdGenerator: undefined`, `enableJsonResponse: true`)
**Over:** Session-based mode with SSE streaming
**Why:** MCP tool calls are independent request/response exchanges. Sessions add complexity (KV-backed session store, cleanup) with no benefit for this use case. JSON responses are simpler than SSE for stateless interactions.

## Auth Before Transport

**Chosen:** Verify Bearer token before constructing McpServer + transport
**Over:** Auth inside tool handlers, or using MCP SDK auth hooks
**Why:** Rejects unauthenticated requests at the HTTP level before any MCP protocol processing. Same `verifyApiKey` function used by REST endpoints ensures consistent auth behavior.

## Async Capture Pattern

**Chosen:** Fire-and-forget with `ctx.waitUntil()`, client polls via `get_capture`
**Over:** Blocking capture with 60s timeout (proposed by api-design-minion)
**Why:** Blocking would require polling KV in a loop inside `capture_url`, consuming CPU quota and violating the fire-and-forget pattern established by the REST API. The async pattern is already well-tested.

## Four Tools Instead of Three

**Chosen:** `capture_url`, `get_capture`, `list_captures`, `verify_capture`
**Over:** Original spec of three tools (no `list_captures`)
**Why:** The issue constraint "R1 (list endpoint) must exist -- agents need to retrieve their captures" directly called for it. Agents need to recover capture IDs from prior sessions.

## Rate Limit Key: tenantId vs clientIp

**Chosen:** `auth.tenantId` as rate limit key for MCP requests
**Over:** `CF-Connecting-IP` (used by REST handlers)
**Why:** MCP clients are typically server-side processes that don't carry the end-user's IP in `CF-Connecting-IP`. Using tenantId ensures rate limits apply per-tenant regardless of proxy topology.

## Verify Logic Extraction

**Chosen:** Extract `performVerification` to `src/verify.js`, shared between REST and MCP
**Over:** Duplicating verification logic in MCP handler; calling REST API via HTTP self-request
**Why:** Both security-minion and margo flagged duplication risk. HTTP self-requests would consume a subrequest quota and add latency. The extracted function handles KV lookup, key resolution, R2 fetch, size guard, and WACZ verification.

## CORS: Wildcard vs Allowlist

**Chosen:** `Access-Control-Allow-Origin: *` for `/mcp`
**Over:** Reusing the configurable `CORS_ORIGINS` allowlist from `/v1/captures`
**Why:** MCP clients are server-side processes, not browsers. The `/mcp` endpoint is always authenticated (Bearer token required). Wildcard CORS has no security impact for API-key-authenticated server-to-server traffic, and avoids configuration friction for new MCP clients.

## Zod Version

**Chosen:** Zod v4.3.6 (`^4.3.6`)
**Over:** Zod v3.x
**Why:** MCP SDK `^1.27.1` accepts `^3.25 || ^4.0` as peer dependency. Zod v4 is the current version; no reason to install the older major.
