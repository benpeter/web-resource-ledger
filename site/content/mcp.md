---
layout: layouts/doc.njk
title: MCP Server
description: Use WRL with AI agents. Any MCP-compatible client can capture web pages and verify evidence without writing HTTP client code.
---

# MCP Server

Any MCP-compatible agent can capture web pages and verify evidence without writing HTTP client code. WRL exposes all core operations -- capture, retrieve, list, and verify -- as MCP tools that agents call like any other function.

The MCP server uses Streamable HTTP transport. Configure your client once, then let your agent handle the rest.

> **Try it:** Ask your agent: *"Capture https://example.com as evidence and verify it."*

## Setup

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

Replace `YOUR_WRL_API_KEY` with a key that has at least `read` scope. Add `capture` scope if your agent needs to submit new captures.

### Cursor

Add to `.cursor/mcp.json` in your project directory for project-level access, or `~/.cursor/mcp.json` globally:

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

Add to `~/.codeium/windsurf/mcp_config.json`. Windsurf uses `serverUrl` instead of `url`:

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

### Generic MCP client

Configure your client with:

- **Endpoint:** `https://api.webresourceledger.com/mcp`
- **Transport:** Streamable HTTP (POST)
- **Authorization:** `Bearer YOUR_WRL_API_KEY` header on every request

---

## Available tools

### `capture_url`

Capture a web page as tamper-evident evidence. Takes a screenshot, saves rendered HTML and HTTP headers, and creates a cryptographically signed WACZ bundle. Returns a capture ID -- use `get_capture` to check progress.

**Requires:** `capture` scope

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | yes | The URL to capture (`http://` or `https://`) |

**Example output:**

```
Capture submitted for: https://example.com
Capture ID: cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6

Use get_capture to check status. Captures typically complete in 5-15 seconds.
Status URL: https://api.webresourceledger.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/status
```

---

### `get_capture`

Get the status and details of a capture by ID. Returns `pending`, `complete`, or `failed`. When complete, includes artifact URLs for screenshot, HTML, headers, WACZ bundle, and a verification link.

**Requires:** `read` scope

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `capture_id` | string | yes | The capture ID (`cap_` followed by 32 hex characters) |

**Example output (complete):**

```
Capture cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6 is complete.
URL: https://example.com
Created: 2026-03-22T10:30:00.000Z
Completed: 2026-03-22T10:30:12.481Z
Render quality: full

Artifacts:
  Screenshot: https://api.webresourceledger.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/artifacts/screenshot
  HTML:       https://api.webresourceledger.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/artifacts/html
  Headers:    https://api.webresourceledger.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/artifacts/headers
  WACZ bundle: https://api.webresourceledger.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/artifacts/wacz (2847362 bytes)

Verify integrity: https://api.webresourceledger.com/v1/verify/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6
  Or use the verify_capture tool with this capture ID.
```

---

### `list_captures`

List recent captures with optional filters. Returns summaries in reverse chronological order (newest first by default). Use `get_capture` with a specific ID for full artifact details.

**Requires:** `read` scope

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `status` | string | no | Filter by status: `pending`, `complete`, or `failed` |
| `limit` | integer | no | Number of results (1--100, default 20) |
| `offset` | integer | no | Number of captures to skip for pagination (default 0) |
| `url` | string | no | Filter by URL prefix |
| `created_after` | string | no | ISO 8601 datetime -- only captures after this time |
| `created_before` | string | no | ISO 8601 datetime -- only captures before this time |
| `sort` | string | no | Sort order: `-created_at` (default, newest first) or `created_at` |

---

### `verify_capture`

Verify the cryptographic integrity of a capture. Checks artifact hashes, WACZ bundle hash, Ed25519 signature, and RFC 3161 timestamp. Confirms the evidence has not been tampered with since capture.

**Requires:** `read` scope

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `capture_id` | string | yes | The capture ID to verify |

**Example output (all checks passing):**

```
Verification PASSED for capture cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6.
Captured URL: https://example.com
Captured: 2026-03-22T10:30:00.000Z
Completed: 2026-03-22T10:30:12.481Z

Checks:
  artifactHashes: PASS
  bundleHash:     PASS
  signature:      PASS
  timestamp:      PASS

Signing metadata:
  Signed at: 2026-03-22T10:30:12.350Z
  Timestamp: 2026-03-22T10:30:12.481Z
  TSA: http://timestamp.digicert.com
```

---

## Tutorial: capture and verify in 3 tool calls

This walkthrough shows the complete evidence workflow using MCP tools.

### Step 1: Submit the capture

Call `capture_url` with the URL you want to preserve.

```
Tool: capture_url
Input: { "url": "https://example.com/important-page" }
```

```
Capture submitted for: https://example.com/important-page
Capture ID: cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6

Use get_capture to check status. Captures typically complete in 5-15 seconds.
```

Note the capture ID. You will need it for the next steps.

### Step 2: Wait for completion

Wait a few seconds, then call `get_capture`.

```
Tool: get_capture
Input: { "capture_id": "cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6" }
```

If still processing, you will see `is pending` -- call `get_capture` again in a few seconds. When the capture completes, the response includes all artifact URLs and a verification link.

If the capture is still pending after 30 seconds, it may have stalled. Call `get_capture` once more to see if a failure record is now written, then resubmit with a new `capture_url` call if the error is retryable.

### Step 3: Verify cryptographic integrity

```
Tool: verify_capture
Input: { "capture_id": "cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6" }
```

All four checks passing confirms: the screenshot, HTML, and HTTP headers match what was captured; the WACZ bundle has not been altered; the Ed25519 signature is valid; and an independent RFC 3161 timestamp authority recorded the capture time.

---

## Example agent workflows

**Before deploying, preserve evidence of the current state:**
> "Capture the current production homepage and store the capture ID. If anything looks wrong after deploy, we have proof of what it looked like before."

**Verify a capture before citing it in a report:**
> "Before I include this capture URL in the audit report, verify it hasn't been tampered with."

---

## Troubleshooting

### "Insufficient scope: API key does not grant 'capture' scope"

Your API key has `read` scope but not `capture` scope. `list_captures`, `get_capture`, and `verify_capture` work with `read` scope. `capture_url` requires `capture` scope. Contact your WRL operator to provision a key with the required scopes. See [Authentication](/authentication/).

### "Rate limit exceeded. Try again in 60 seconds."

WRL enforces per-tenant rate limits. Wait 60 seconds and retry. If you need higher throughput, contact your WRL operator.

### "Service is at capacity. Retry in 10 seconds."

A global capacity limit applies across all tenants. Retry after 10 seconds.

### Capture stuck in pending

Captures normally complete in 5--15 seconds. If `get_capture` returns pending after 30 seconds:

1. Call `get_capture` one more time -- it may have just completed, or the failure record may now be written.
2. If still pending, the background job may have been dropped. Submit a new capture with `capture_url`.

### "Capture not found or not yet complete"

`verify_capture` only works on complete captures. If you call it while a capture is still pending, wait for completion and try again. If the ID does not exist, confirm you are using the correct capture ID.

### "WACZ bundle exceeds maximum verifiable size (100 MB)"

The page produced a WACZ bundle larger than 100 MB. Verification is not available for captures this large via the MCP tool. Use the REST API's `/v1/verify/{id}` endpoint directly, or contact your WRL operator about increased size limits.
