# MCP Server

WRL is available as an [MCP](https://modelcontextprotocol.io/) server, enabling AI agents to capture and verify web pages as tamper-evident evidence. Any MCP client can instruct WRL to capture a URL, retrieve capture status and artifacts, or verify cryptographic integrity — all without leaving the agent workflow.

The MCP server uses Streamable HTTP transport at `https://api.webresourceledger.com/mcp`. Authentication requires a WRL API key with at minimum `read` scope. Capture operations additionally require `capture` scope.

> **Try it:** Ask your agent: *"Capture https://example.com as evidence and verify it."*

## Quick Setup

### VS Code (GitHub Copilot)

Add to `.vscode/mcp.json` in your project directory:

```json
{
  "servers": {
    "wrl": {
      "type": "http",
      "url": "https://api.webresourceledger.com/mcp",
      "headers": {
        "Authorization": "Bearer ${input:wrl-api-key}"
      }
    }
  },
  "inputs": [
    {
      "type": "promptString",
      "id": "wrl-api-key",
      "description": "WRL API key (capture + read scopes)",
      "password": true
    }
  ]
}
```

VS Code prompts for the API key on first use and stores it securely.

### Claude Code

```bash
claude mcp add wrl --transport http \
  --header "Authorization: Bearer YOUR_WRL_API_KEY" \
  https://api.webresourceledger.com/mcp
```

### Cursor

Add to `.cursor/mcp.json` in your project directory, or `~/.cursor/mcp.json` globally:

```json
{
  "mcpServers": {
    "wrl": {
      "url": "https://api.webresourceledger.com/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_WRL_API_KEY"
      }
    }
  }
}
```

### Cline

Open Cline sidebar > MCP Servers > Configure, then add:

```json
{
  "mcpServers": {
    "wrl": {
      "url": "https://api.webresourceledger.com/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_WRL_API_KEY"
      }
    }
  }
}
```

> **Note:** Cline's Streamable HTTP transport support may vary by version. If the connection fails, check [cline/cline#3315](https://github.com/cline/cline/issues/3315) for current status.

### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`. Note: Windsurf uses `serverUrl`, not `url`:

```json
{
  "mcpServers": {
    "wrl": {
      "serverUrl": "https://api.webresourceledger.com/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_WRL_API_KEY"
      }
    }
  }
}
```

### Other MCP Clients

WRL supports the MCP Streamable HTTP transport. Configure your client with:

- **Endpoint:** `https://api.webresourceledger.com/mcp`
- **Transport:** Streamable HTTP (POST)
- **Authorization:** `Bearer YOUR_WRL_API_KEY` header on every request

Replace `YOUR_WRL_API_KEY` with a key that has `read` scope for retrieval tools, or `capture` scope to also submit new captures. See the README for how to obtain a key.

## Available Tools

### capture_url

Capture a web page as tamper-evident evidence. Takes a screenshot, saves rendered HTML and HTTP headers, and creates a cryptographically signed WACZ bundle with Ed25519 signature and RFC 3161 timestamp. Returns a capture ID — use `get_capture` to check progress. Typically completes in 5-15 seconds. If still pending after 30 seconds, the capture may have failed.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | yes | The URL to capture (http:// or https://) |

**Requires:** `capture` scope

**Example output:**

```
Capture submitted for: https://example.com
Capture ID: cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6

Use get_capture to check status. Captures typically complete in 5-15 seconds.
Status URL: https://api.webresourceledger.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/status
```

---

### get_capture

Get the status and details of a capture by ID. Returns status (`pending`, `complete`, or `failed`) and, when complete, artifact URLs for screenshot, HTML, WACZ bundle, and a verification link.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `capture_id` | string | yes | The capture ID (format: `cap_` followed by 32 hex characters) |

**Requires:** `read` scope

**Example output (pending):**

```
Capture cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6 is pending.
URL: https://example.com
Created: 2025-06-01T10:30:00.000Z

Check again in a few seconds.
```

**Example output (complete):**

```
Capture cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6 is complete.
URL: https://example.com
Created: 2025-06-01T10:30:00.000Z
Completed: 2025-06-01T10:30:12.481Z
Render quality: full

Artifacts:
  Screenshot: https://api.webresourceledger.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/artifacts/screenshot
  HTML: https://api.webresourceledger.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/artifacts/html
  Headers: https://api.webresourceledger.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/artifacts/headers
  WACZ bundle: https://api.webresourceledger.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/artifacts/wacz (2847362 bytes)

Verify integrity: https://api.webresourceledger.com/v1/verify/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6
  Or use the verify_capture tool with this capture ID.
```

---

### list_captures

List recent captures with optional filters. Returns summaries in reverse chronological order (newest first by default). Use `get_capture` with a specific ID for full artifact details.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `status` | string | no | Filter by status: `pending`, `complete`, or `failed` |
| `limit` | integer | no | Number of results to return (1–100, default 20) |
| `offset` | integer | no | Number of captures to skip for pagination (default 0) |
| `url` | string | no | Filter by URL prefix |
| `created_after` | string | no | ISO 8601 datetime -- only captures after this time |
| `created_before` | string | no | ISO 8601 datetime -- only captures before this time |
| `sort` | string | no | Sort order: `-created_at` (default, newest first) or `created_at` |

**Requires:** `read` scope

**Example output:**

```
Found 2 capture(s):

  ID: cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6
  URL: https://example.com
  Status: complete
  Created: 2025-06-01T10:30:00.000Z
  Completed: 2025-06-01T10:30:12.481Z
  Render quality: full

  ID: cap_b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7
  URL: https://news.example.com/article
  Status: complete
  Created: 2025-06-01T09:15:00.000Z
  Completed: 2025-06-01T09:15:09.203Z
  Render quality: full
```

---

### verify_capture

Verify the cryptographic integrity of a captured web page. Checks artifact hashes, WACZ bundle hash, Ed25519 signature, and RFC 3161 timestamp. Confirms the evidence has not been tampered with since capture.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `capture_id` | string | yes | The capture ID to verify |

**Requires:** `read` scope

**Example output:**

```
Verification PASSED for capture cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6.
Captured URL: https://example.com
Captured: 2025-06-01T10:30:00.000Z
Completed: 2025-06-01T10:30:12.481Z

Checks:
  artifactHashes: PASS
  bundleHash: PASS
  signature: PASS
  timestamp: PASS

Signing metadata:
  Signed at: 2025-06-01T10:30:12.350Z
  Timestamp: 2025-06-01T10:30:12.481Z
  TSA: http://timestamp.digicert.com
```

## Tutorial: Capture and Verify a Web Page

This walkthrough shows the complete evidence workflow using MCP tool calls.

### Step 1: Submit the capture

Call `capture_url` with the page you want to preserve.

```
Tool: capture_url
Input: { "url": "https://example.com/important-page" }
```

```
Capture submitted for: https://example.com/important-page
Capture ID: cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6

Use get_capture to check status. Captures typically complete in 5-15 seconds.
Status URL: https://api.webresourceledger.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/status
```

Save the capture ID. You will need it for the next steps.

### Step 2: Wait for the capture to complete

Wait a few seconds, then call `get_capture` to check status.

```
Tool: get_capture
Input: { "capture_id": "cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6" }
```

If the capture is still processing, you will see:

```
Capture cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6 is pending.
URL: https://example.com/important-page
Created: 2025-06-01T10:30:00.000Z

Check again in a few seconds.
```

Call `get_capture` again after a few seconds. When the capture completes, the response includes all artifact URLs and a verification link.

**Stop condition:** If the capture is still pending after 30 seconds, it may have failed. Call `get_capture` once more to retrieve the error message, then retry with a new `capture_url` call if the error is retryable.

```
Capture cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6 is complete.
URL: https://example.com/important-page
Created: 2025-06-01T10:30:00.000Z
Completed: 2025-06-01T10:30:12.481Z
Render quality: full

Artifacts:
  Screenshot: https://api.webresourceledger.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/artifacts/screenshot
  HTML: https://api.webresourceledger.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/artifacts/html
  Headers: https://api.webresourceledger.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/artifacts/headers
  Screenshot (before consent): https://api.webresourceledger.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/artifacts/screenshot-before
  WACZ bundle: https://api.webresourceledger.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/artifacts/wacz (2847362 bytes)

Verify integrity: https://api.webresourceledger.com/v1/verify/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6
  Or use the verify_capture tool with this capture ID.
```

### Step 3: Verify cryptographic integrity

Call `verify_capture` to confirm the evidence has not been modified since capture.

```
Tool: verify_capture
Input: { "capture_id": "cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6" }
```

```
Verification PASSED for capture cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6.
Captured URL: https://example.com/important-page
Captured: 2025-06-01T10:30:00.000Z
Completed: 2025-06-01T10:30:12.481Z

Checks:
  artifactHashes: PASS
  bundleHash: PASS
  signature: PASS
  timestamp: PASS

Signing metadata:
  Signed at: 2025-06-01T10:30:12.350Z
  Timestamp: 2025-06-01T10:30:12.481Z
  TSA: http://timestamp.digicert.com
```

All four checks passing confirms: the screenshot, HTML, and HTTP headers match what was captured; the WACZ bundle has not been altered; the Ed25519 signature is valid; and an independent RFC 3161 timestamp authority recorded the capture time.

The verification link from step 2 also renders as a human-readable page in any browser — share it freely.

## Troubleshooting

### "Insufficient scope: API key does not grant 'capture' scope"

Your API key has `read` scope but not `capture` scope. `list_captures`, `get_capture`, and `verify_capture` work with `read` scope. `capture_url` requires `capture` scope. Contact your WRL operator to provision a key with the required scopes.

### "Rate limit exceeded. Try again in 60 seconds."

WRL enforces per-tenant rate limits on captures and verifications. Wait 60 seconds and retry. If you need higher throughput, contact your WRL operator.

### "Service is at capacity. Retry in 10 seconds."

A global capacity limit applies across all tenants. Retry after 10 seconds.

### Capture stuck in pending

Captures normally complete in 5–15 seconds. If `get_capture` returns pending after 30 seconds:

1. Call `get_capture` one more time — it may have just completed, or the failure record may now be written.
2. If still pending, the background job may have been dropped. Submit a new capture with `capture_url`.

### "Capture not found or not yet complete"

`verify_capture` only works on complete captures. If you call it while a capture is still pending, wait for it to complete and try again. If the ID does not exist, confirm you are using the correct capture ID.

### "WACZ bundle exceeds maximum verifiable size (100 MB)"

The page produced a WACZ bundle larger than 100 MB. Verification is not available for captures this large. Use the REST API's `/v1/verify/{id}` endpoint if your WRL deployment supports an increased limit.
