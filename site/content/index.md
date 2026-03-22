---
layout: layouts/doc.njk
title: Getting Started
description: Capture a web page with cryptographic proof of authenticity in three steps. Ed25519 signatures and RFC 3161 timestamps that anyone can independently verify.
---

# Getting Started

WRL captures web pages with cryptographic proof of authenticity -- Ed25519 signatures and RFC 3161 timestamps that anyone can independently verify.

This guide walks you from your first API call to a verified capture in under five minutes.

## Prerequisites

- An API key with `capture` scope. See [Authentication](/authentication/) if you need to create one.
- `curl` or any HTTP client.

## Step 1: Capture a page

Submit a URL to capture. WRL queues the job and returns a capture ID immediately.

```bash
curl -X POST https://wrl.example.com/v1/captures \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

```json
{
  "id": "cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
  "statusUrl": "https://wrl.example.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/status",
  "note": "Use GET /v1/captures to list and search your captures."
}
```

Save the `id`. You will use it in the next two steps.

The capture runs in the background. WRL takes a screenshot, saves the rendered HTML and HTTP response headers, and assembles a cryptographically signed WACZ bundle. This typically takes 5--15 seconds.

## Step 2: Check the result

Wait a few seconds, then fetch the capture record using the ID.

```bash
curl https://wrl.example.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6
```

When the capture is complete, the response includes all artifact links and a verification URL.

```json
{
  "id": "cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
  "status": "complete",
  "url": "https://example.com",
  "createdAt": "2026-03-22T10:30:00.000Z",
  "completedAt": "2026-03-22T10:30:12.481Z",
  "renderQuality": "full",
  "artifacts": {
    "screenshot": "https://wrl.example.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/artifacts/screenshot",
    "html": "https://wrl.example.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/artifacts/html",
    "headers": "https://wrl.example.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/artifacts/headers"
  },
  "wacz": {
    "url": "https://wrl.example.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/artifacts/wacz",
    "bundleHash": "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "size": 2847362
  },
  "verifyUrl": "https://wrl.example.com/v1/verify/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"
}
```

> **Note:** The capture ID acts as the access secret for retrieving artifacts. No Authorization header is required when you have the ID. Share the `verifyUrl` freely -- it renders as a human-readable verification page in any browser.

If the status is still `pending` when you check, wait a few more seconds and try again. The status URL in the Step 1 response is a convenient shortcut for checking just the lifecycle state. For full polling details and status values, see the [API Reference](/api-reference/).

## Step 3: Verify the evidence

> **Note:** You need Node.js 20 or later for this step. If you only need to capture and retrieve pages, you can skip this step and share the `verifyUrl` from Step 2 instead.

The `@w-r-l/verify` CLI performs offline cryptographic verification against the operator's published signing key. It confirms the capture has not been tampered with since it was created.

Pass the capture URL directly -- the CLI fetches the WACZ bundle and resolves the signing key automatically.

```bash
npx @w-r-l/verify https://wrl.example.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6
```

When all checks pass, the output looks like this:

```
Verification PASSED

  File integrity     PASS
  Bundle integrity   PASS
  Digital signature  PASS
  Timestamp imprint  PASS
  Timestamp chain    PASS

Captured URL:  https://example.com
Signed at:     2026-03-22T10:30:12.350Z
Timestamp:     2026-03-22T10:30:12.481Z
TSA:           DigiCert Timestamp Authority
```

You just captured a web page with cryptographic proof. The Ed25519 signature and RFC 3161 timestamp prove this content existed at this moment -- and anyone can verify it.

## What's next

<div class="card-grid">

**[Authentication](/authentication/)**
Manage API keys, understand scopes, and set up per-tenant access.

**[Verification](/verification/)**
Understand the trust model behind Ed25519 signatures and RFC 3161 timestamps.

**[MCP Server](/mcp/)**
Use WRL with AI agents in Claude Code, Cursor, Windsurf, and other MCP clients.

**[Batch Captures](/batch/)**
Submit multiple URLs in a single request and handle per-item results.

**[Webhooks](/webhooks/)**
Receive real-time notifications when captures complete or fail.

**[API Reference](/api-reference/)**
Full endpoint details, request and response schemas, status codes, and rate limits.

</div>
