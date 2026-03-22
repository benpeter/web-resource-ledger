# Task 2: MCP Server + 4 Tool Definitions

Create `src/mcp.js` — the MCP server implementation for WRL. This is a thin adapter that registers MCP tools and delegates to existing business logic functions.

## Pre-step: Extract shared verify orchestrator

Before creating the MCP file, extract the verification orchestration logic from `handleVerifyCapture` in `src/index.js` (steps 2-7, lines ~505-577) into a shared function in `src/verify.js`. This avoids duplicating the signing key resolution, R2 fetch, 100MB size guard, and WACZ verification between the REST handler and the MCP tool.

Create in `src/verify.js`:
```javascript
/**
 * Core verification orchestration: KV lookup → key resolution → R2 fetch → WACZ verify.
 * Shared between REST handler and MCP tool handler.
 *
 * @param {object} deps - { KV, BUCKET, SIGNING_KEY }
 * @param {string} captureId
 * @returns {Promise<{ ok: true, record, result } | { ok: false, reason, detail? }>}
 */
export async function performVerification(deps, captureId) { ... }
```

The function returns either `{ ok: true, record, result }` (where `result` is the verifyWacz output) or `{ ok: false, reason: 'not_found' | 'key_unavailable' | 'r2_missing' | 'too_large', detail? }`.

Then refactor `handleVerifyCapture` in `src/index.js` to call this shared function. The REST handler still handles rate limiting, logging, content negotiation, and HTTP response construction — the extracted function only does the core verification pipeline.

## Main task: Create src/mcp.js

### Architecture

- Use `McpServer` from `@modelcontextprotocol/sdk/server/mcp.js`
- Use `StreamableHTTPServerTransport` from `@modelcontextprotocol/sdk/server/streamableHttp.js`
  (IMPORTANT: Check the actual export name — it may be `StreamableHTTPServerTransport` not `WebStandardStreamableHTTPServerTransport`. Read the SDK source or check node_modules to confirm.)
- Stateless mode: do NOT set sessionIdGenerator (or set to `undefined`)
- `enableJsonResponse: true` on the transport (no SSE streaming needed)
- Auth BEFORE transport: extract Bearer token, verify via `verifyApiKey()` with `requiredScope: 'read'`, pass auth result to tool handlers

### Auth flow

```javascript
// tva
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { verifyApiKey } from './auth.js';
// ... other imports

export async function handleMcp(request, env, ctx) {
  // Only POST is needed for stateless JSON-RPC
  if (request.method !== 'POST') {
    return new Response(null, { status: 405, headers: { Allow: 'POST' } });
  }

  // 1. Auth check (minimum 'read' scope for MCP access)
  const auth = await verifyApiKey(request, env, { requiredScope: 'read' });
  if (!auth.ok) return auth.response;

  // 2. Create transport + server per request (stateless)
  const server = createMcpServer(env, ctx, auth, request);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);

  // 3. Delegate to transport
  return transport.handleRequest(request);
}
```

NOTE on transport class: The SDK export path and class name may vary. Check `node_modules/@modelcontextprotocol/sdk/dist/` to find the correct import. Common patterns:
- `@modelcontextprotocol/sdk/server/streamableHttp.js` → `StreamableHTTPServerTransport`
- It may require `enableJsonResponse` as a constructor option

### Tool definitions (4 tools)

#### capture_url
- **Description**: "Capture a web page as tamper-evident evidence. Takes a screenshot, saves rendered HTML and HTTP headers, and creates a cryptographically signed WACZ bundle with Ed25519 signature and RFC 3161 timestamp. Returns a capture ID — use get_capture to check progress. Typically completes in 5-15 seconds. If still pending after 30 seconds, the capture may have failed."
- **Input**: `{ url: z.string().describe("The URL to capture (http:// or https://).") }`
- **Required scope**: `capture` (check `auth.scopes` inside handler via `hasScope`; return tool error if insufficient)
- **Implementation**:
  1. Rate limit check FIRST (env.CAPTURE_RATE_LIMITER + env.GLOBAL_CAPTURE_LIMITER) — before any DNS resolution
  2. Call `validateUrl(url)`
  3. Generate captureId: `'cap_' + crypto.randomUUID().replace(/-/g, '')`
  4. Call `createCapture(env.KV, captureId, result.url, result.ip, auth.tenantId)`
  5. `ctx.waitUntil(performCapture(env, result.url, result.ip, captureId, auth.tenantId, 'mcp'))`
  6. Return text with capture ID
- **Output format**:
  ```
  Capture started for {url}

  Capture ID: {captureId}
  Status: pending

  Use get_capture with this ID to check progress. Typically completes in 5-15 seconds. If still pending after 30 seconds, the capture may have failed.
  ```
- URL sanitization in output: truncate displayed URL to 200 chars, strip fragment identifier

#### get_capture
- **Description**: "Get the status and details of a capture by ID. Returns status (pending, complete, failed), and when complete, includes URLs for screenshot, HTML, WACZ bundle, and verification. No additional auth scope needed beyond the route-level read scope."
- **Input**: `{ capture_id: z.string().describe("The capture ID (format: cap_ followed by 32 hex characters).") }`
- **Required scope**: none beyond route-level `read`
- **Implementation**: Call `getCapture(env.KV, captureId)`. Format based on status.
- **Output format** (complete):
  ```
  Capture {captureId} is complete.

  URL: {sanitizedUrl}
  Captured at: {completedAt}

  Artifacts:
  - Screenshot: {origin}/v1/captures/{id}/artifacts/screenshot
  - HTML: {origin}/v1/captures/{id}/artifacts/html
  - WACZ bundle: {origin}/v1/captures/{id}/artifacts/wacz

  Verify integrity: use verify_capture with this capture ID.
  ```
- Pending: "Capture {captureId} is pending. Try again in a few seconds."
- Failed: "Capture {captureId} failed: {error}. {retryable ? 'You can retry with capture_url.' : ''}"
- Not found: return `{ content: [{ type: 'text', text: 'Capture not found...' }], isError: true }`

#### list_captures
- **Description**: "List your recent captures with optional status filter. Returns summaries in reverse chronological order. Use get_capture with a specific ID for full details."
- **Input**: `{ status: z.enum(["pending", "complete", "failed"]).optional().describe("Filter by capture status."), limit: z.number().int().min(1).max(100).optional().describe("Maximum results to return (default 20)."), cursor: z.string().optional().describe("Pagination cursor from a previous list_captures response.") }`
- **Required scope**: `read` (already satisfied by route-level auth)
- **Implementation**: Call `listCaptures(env.KV, auth.tenantId, { cursor, limit, status })`.
- **Output format**:
  ```
  Found {count} captures:

  1. {id} | {status} | {url} | {createdAt}
  2. {id} | {status} | {url} | {createdAt}
  ...

  {if hasMore: "More results available. Use cursor: {nextCursor}"}
  ```
- URL sanitization: truncate to 80 chars in list view

#### verify_capture
- **Description**: "Verify the cryptographic integrity of a captured web page. Checks artifact hashes, WACZ bundle hash, Ed25519 signature, and RFC 3161 timestamp. Confirms the evidence has not been tampered with since capture."
- **Input**: `{ capture_id: z.string().describe("The capture ID to verify.") }`
- **Required scope**: none (public, mirrors REST API)
- **Implementation**:
  1. Rate limit (env.VERIFY_RATE_LIMITER)
  2. Call `performVerification({ KV: env.KV, BUCKET: env.BUCKET, SIGNING_KEY: env.SIGNING_KEY }, captureId)`
  3. Format result as text
- **Output format** (verified):
  ```
  Verification result for {captureId}: VERIFIED

  All integrity checks passed:
  - Artifact hashes: pass
  - Bundle hash: pass
  - Ed25519 signature: pass (signed at {signedAt})
  - RFC 3161 timestamp: {tsaStatus}

  This capture has not been tampered with since {signedAt}.
  ```

### Critical implementation notes

- Import `hasScope` from `./auth.js` for scope checking in capture_url handler
- Import `validateUrl` from `./url-validation.js`
- Import `createCapture`, `getCapture`, `listCaptures` from `./kv.js`
- Import `performCapture` from `./capture.js`
- Import `performVerification` from `./verify.js` (the newly extracted function)
- Import `log` from `./log.js`
- For origin URL construction in get_capture output, use `new URL(request.url).origin`— pass the request URL to the createMcpServer factory
- Use `isError: true` only for infrastructure failures (auth scope insufficient, rate limit, malformed input). Domain outcomes (capture failed, not found for get_capture) use `isError: false` with descriptive text. Exception: `get_capture` not found uses `isError: true` since it indicates bad input.
- Include `// tva` near the top of the file
- For the `z` import: `import { z } from 'zod'`

### What NOT to do

- Do NOT create a separate Worker or wrangler.toml
- Do NOT use the `agents` package
- Do NOT make HTTP requests to the Worker's own REST API
- Do NOT implement blocking/polling inside capture_url
- Do NOT add `structuredContent` or `outputSchema`
- Do NOT modify src/index.js (that's Task 3) — EXCEPT for the verify refactoring

## Files to create
- `src/mcp.js`

## Files to modify
- `src/verify.js` — add `performVerification` export
- `src/index.js` — refactor `handleVerifyCapture` to call `performVerification`

## Context
- Working directory: /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/snappy-bouncing-sloth
- Read src/index.js for handleCreateCapture (line 154), handleGetCapture, handleListCaptures, handleVerifyCapture (line 489)
- Read src/auth.js for verifyApiKey signature and hasScope
- Read src/kv.js for createCapture, getCapture, listCaptures signatures
- Read src/verify.js for verifyWacz
- Read src/capture.js for performCapture
- Read src/url-validation.js for validateUrl
- Read src/signing.js for getSigningKeys
- Read src/log.js for log function
- Run existing tests after the verify refactoring to make sure nothing broke: npm test
