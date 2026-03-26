# MCP Server

WRL is available as an [MCP](https://modelcontextprotocol.io/) server, enabling AI agents to capture and verify web pages as tamper-evident evidence. Any MCP client can instruct WRL to capture a URL, retrieve capture status and artifacts, verify cryptographic integrity, compare two captures, manage recurring schedules, and check account usage — all without leaving the agent workflow.

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

| Tool | Description | Scope |
|------|-------------|-------|
| `capture_url` | Capture a web page as evidence | `capture` |
| `batch_capture` | Capture multiple URLs at once | `capture` |
| `get_capture` | Get capture status and details | `read` |
| `list_captures` | List captures with filters | `read` |
| `verify_capture` | Verify capture integrity | `read` |
| `diff_captures` | Compare two captures | `read` |
| `get_usage` | Get current period usage | `read` |
| `list_schedules` | List recurring capture schedules | `capture` |
| `create_schedule` | Create a recurring capture schedule | `capture` |
| `delete_schedule` | Delete a capture schedule | `capture` |
| `get_certificate` | Get evidence certificate metadata | `read` |

---

### Capture Tools

#### capture_url

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

#### batch_capture

Submit up to 20 URLs for capture in a single call. Returns a per-item status report showing accepted captures and any rejected URLs with reasons. Rate limiting charges one slot per URL, not one slot for the batch. Typically enqueues in under 2 seconds; each capture then completes in 5-15 seconds. Use `get_capture` with each returned ID to track progress.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `urls` | array of strings | yes | URLs to capture (http:// or https://, max 20) |

**Requires:** `capture` scope

**Example output:**

```
3/3 URL(s) accepted for capture.

  [accepted] cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6 -- https://example.com
  [accepted] cap_b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7 -- https://example.com/page
  [accepted] cap_c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8 -- https://example.com/other

Use get_capture with each capture ID to check progress.
```

---

#### get_capture

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

#### list_captures

List recent captures with optional filters. Returns summaries in reverse chronological order (newest first by default). Use `get_capture` with a specific ID for full artifact details.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `status` | string | no | Filter by status: `pending`, `complete`, or `failed` |
| `limit` | integer | no | Number of results to return (1–100, default 20) |
| `offset` | integer | no | Number of captures to skip for pagination (default 0) |
| `url` | string | no | Filter by URL prefix (min 4 characters) |
| `created_after` | string | no | ISO 8601 datetime -- only captures after this time |
| `created_before` | string | no | ISO 8601 datetime -- only captures before this time |
| `sort` | string | no | Sort order: `-created_at` (default, newest first) or `created_at` |

**Requires:** `read` scope

**Example output:**

```
Found 2 capture(s) (2 total):

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

### Verification & Analysis

#### verify_capture

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

---

#### diff_captures

Compare two complete captures owned by this account and return a structured diff of HTML, screenshot, and HTTP headers. Both captures must be in `complete` status; pending or failed captures are not eligible. Use the summary to quickly see whether the page changed, then inspect the HTML or headers sections for details.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `base_id` | string | yes | Capture ID of the base (earlier) capture (`cap_` followed by 32 hex characters) |
| `target_id` | string | yes | Capture ID of the target (later) capture to compare against the base |

**Requires:** `read` scope

**Example output:**

```
Diff: cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6 → cap_b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7
Base URL:   https://example.com
Target URL: https://example.com
Overall changed: YES

Summary:
  HTML:       changed (+12 -4)
  Screenshot: changed
  Headers:    changed (1 field(s))

Headers modified:
  ~ last-modified
      was: Mon, 01 Jun 2025 10:00:00 GMT
      now: Tue, 02 Jun 2025 14:00:00 GMT

HTML hunks (2):
  @@ base:42 target:42 @@
  -   <p>Old paragraph content.</p>
  +   <p>Updated paragraph content.</p>
```

---

#### get_certificate

Retrieve certificate metadata for a complete capture, summarizing the FRE 902(13) attestation details, bundle hash, Ed25519 key ID, and timestamp status. Returns formatted text, not a binary PDF. Use the certificate URL in the response to download the actual PDF. Useful for programmatic verification of signing metadata before presenting evidence in a legal context.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `capture_id` | string | yes | The capture ID (`cap_` followed by 32 hex characters) |

**Requires:** `read` scope

**Example output:**

```
Certificate for capture cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6

Captured URL:   https://example.com
Captured at:    2025-06-01T10:30:12.481Z
Render quality: full

Integrity evidence:
  Bundle hash (SHA-256): abc123def456...
  Signing algorithm:     Ed25519
  Key ID:                key_a1b2c3d4
  RFC 3161 timestamp:    ok
  eIDAS qualified ts:    none

Certificate URL (PDF):
  https://api.webresourceledger.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/certificate

Verification URL:
  https://api.webresourceledger.com/v1/verify/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6

Use verify_capture to re-check artifact hashes and signature.
```

---

### Account & Scheduling

#### get_usage

Return current-period quota usage for this account, including capture count, storage bytes, billing status, and reset date. No additional scope is required beyond the `read` scope used for MCP access. Use this to check remaining quota before submitting large batches.

**Parameters:** None

**Requires:** `read` scope

**Example output:**

```
Usage for: acme-corp
Period: 2025-06-01/2025-07-01
Billing status: active
Payment method on file: yes

Captures used:   142 / unlimited
Storage used:    38 KB / unlimited
```

---

#### list_schedules

List all scheduled captures registered for this account, including their URL, cron expression, and next scheduled run time. Use `create_schedule` to add a new schedule or `delete_schedule` to remove one.

**Parameters:** None

**Requires:** `capture` scope

**Example output:**

```
2 schedule(s):

  ID:       sch_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6
  Name:     Daily homepage check
  URL:      https://example.com
  Cron:     0 9 * * *
  Next run: 2025-06-02T09:00:00.000Z
  Created:  2025-06-01T08:00:00.000Z

  ID:       sch_b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7
  Name:     Hourly news feed
  URL:      https://news.example.com/feed
  Cron:     0 * * * *
  Next run: 2025-06-01T11:00:00.000Z
  Created:  2025-05-15T12:00:00.000Z
```

---

#### create_schedule

Register a recurring capture schedule for a URL using a cron expression. Minimum interval is hourly. Returns the new schedule ID and next scheduled run time. Use `list_schedules` to see all schedules or `delete_schedule` to remove one.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | yes | The URL to capture on each scheduled run (http:// or https://) |
| `name` | string | yes | Human-readable name for this schedule (1–128 characters; letters, digits, spaces, and `_ . : -` only) |
| `cron` | string | yes | Cron expression defining the capture frequency (e.g. `0 * * * *` for hourly). Minimum interval: 1 hour. |

**Requires:** `capture` scope

**Example output:**

```
Schedule created.
ID:       sch_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6
Name:     Daily homepage check
URL:      https://example.com
Cron:     0 9 * * *
Next run: 2025-06-02T09:00:00.000Z

Use list_schedules to view all schedules or delete_schedule to remove this one.
```

---

#### delete_schedule

Delete a scheduled capture by ID. Returns 404 for nonexistent or cross-tenant schedules (no information disclosure). Deletion is immediate and irreversible. Use `list_schedules` to find schedule IDs.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `schedule_id` | string | yes | The schedule ID to delete (format: `sch_` followed by 32 hex characters) |

**Requires:** `capture` scope

**Example output:**

```
Schedule deleted: sch_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6
```

---

## Intentional Omissions

Not every WRL API endpoint is exposed as an MCP tool. The following are deliberately excluded:

- **Admin endpoints** (`/v1/admin/*`) — These require `ADMIN_KEY` authentication, not a tenant API key. The auth boundary is different; operators access these directly, not through agent workflows.
- **Webhook endpoints** — Deferred. Webhooks require infrastructure callback URLs that agents do not have, making them unsuitable for the MCP request/response model.
- **Binary artifact downloads** — `get_capture` returns artifact URLs (screenshot, HTML, WACZ). MCP is text-based; binary file transfer belongs in the HTTP layer. Agents receive the URLs and can fetch or present them as needed.
- **Health, CORS, and signing-key endpoints** — Infrastructure endpoints, not agent tasks.
- **Notification and unsubscribe UI endpoints** — Browser-rendered HTML flows, not API operations.
- **Status endpoint** (`/v1/captures/:id/status`) — Redundant with `get_capture`, which returns the same information in a richer format.

The drift-detection test at `test/mcp-sync.test.js` is the authoritative source for which endpoints are included and which are excluded, and why.

---

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

Your API key has `read` scope but not `capture` scope. `list_captures`, `get_capture`, and `verify_capture` work with `read` scope. `capture_url`, `batch_capture`, `list_schedules`, `create_schedule`, and `delete_schedule` require `capture` scope. Contact your WRL operator to provision a key with the required scopes.

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

### "Base capture is not complete" / "Target capture is not complete"

`diff_captures` requires both captures to be in `complete` status. Check each capture with `get_capture` before diffing.

### "Schedule limit reached"

Each account has a per-tenant limit on concurrent schedules. Delete an existing schedule with `delete_schedule` before creating a new one.
