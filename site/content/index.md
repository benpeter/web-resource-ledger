---
layout: layouts/doc.njk
title: Getting Started
description: Capture a web page with cryptographic proof in three steps. Ed25519 signatures and RFC 3161 timestamps — web capture API quickstart guide.
---

# Getting Started

WRL captures web pages with cryptographic proof of authenticity -- Ed25519 signatures and RFC 3161 timestamps that anyone can independently verify.

This guide walks you from your first API call to a verified capture in under five minutes.

## No code: capture from the browser

You don't need the API to capture a page. [Sign in](https://api.webresourceledger.com/ui?from=docs) with GitHub or an emailed link, paste a URL into the capture form in the [web UI](https://api.webresourceledger.com/ui), and WRL produces the same signed, timestamped bundle as an API call. Each capture has a verification page you can share with anyone, no account needed.

The rest of this guide uses the API.

## Prerequisites

- An API key with `capture` scope. See [Authentication](/authentication/) if you need to create one.
- `curl` or any HTTP client.

## Step 1: Capture a page

Submit a URL to capture. WRL queues the job and returns a capture ID immediately.

```bash
curl -X POST https://api.webresourceledger.com/v1/captures \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

```json
{
  "id": "cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
  "statusUrl": "https://api.webresourceledger.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/status",
  "note": "Use GET /v1/captures to list and search your captures."
}
```

Save the `id`. You will use it in the next two steps.

The capture runs in the background. WRL takes a screenshot, saves the rendered HTML and HTTP response headers, and assembles a cryptographically signed WACZ bundle. This typically takes 5--15 seconds.

## Step 2: Check the result

Poll the `statusUrl` from Step 1 every few seconds until `status` is `complete` or `failed`.

```bash
curl https://api.webresourceledger.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/status \
  -H "Authorization: Bearer YOUR_API_KEY"
```

```json
{ "id": "cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6", "status": "pending" }
```

A failed capture returns `"status": "failed"` with an `error` explaining why (see [why captures fail](/limits/#why-captures-fail)). Once the status is `complete`, fetch the capture record:

```bash
curl https://api.webresourceledger.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6 \
  -H "Authorization: Bearer YOUR_API_KEY"
```

The record lists all artifact links and a verification URL. Until the capture is complete, this endpoint answers `404`.

```json
{
  "id": "cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
  "status": "complete",
  "url": "https://example.com",
  "createdAt": "2026-03-22T10:30:00.000Z",
  "completedAt": "2026-03-22T10:30:12.481Z",
  "renderQuality": "full",
  "artifacts": {
    "screenshot": "https://api.webresourceledger.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/artifacts/screenshot",
    "html": "https://api.webresourceledger.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/artifacts/html",
    "headers": "https://api.webresourceledger.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/artifacts/headers"
  },
  "wacz": {
    "url": "https://api.webresourceledger.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/artifacts/wacz",
    "bundleHash": "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "size": 2847362
  },
  "verifyUrl": "https://api.webresourceledger.com/v1/verify/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"
}
```

> **Note:** Share the `verifyUrl` freely -- it renders as a human-readable verification page in any browser and requires no authentication. Capture URLs are directly shareable -- anyone with the capture ID can access the capture and its artifacts.

For full polling details and status values, see the [API Reference](/api-reference/).

## Step 3: Verify the evidence

> **Note:** You need Node.js 20 or later for this step. If you only need to capture and retrieve pages, you can skip this step and share the `verifyUrl` from Step 2 instead.

The `@w-r-l/verify` CLI performs offline cryptographic verification against the operator's published signing key. It confirms the capture has not been tampered with since it was created.

Pass the capture URL directly -- the CLI fetches the WACZ bundle and resolves the signing key automatically.

```bash
npx @w-r-l/verify https://api.webresourceledger.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6
```

When all checks pass, the output looks like this:

```
Verification PASSED

  File integrity     PASS
  Bundle integrity   PASS
  Digital signature  PASS
  Time verification  PASS
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

**[Legal Evidence](/legal-evidence/)**
How WRL captures map to FRE 901/902 authentication requirements and eIDAS qualified timestamps.

**[MCP Server](/mcp/)**
Use WRL with AI agents in Claude Code, Cursor, Windsurf, and other MCP clients.

**[Batch Captures](/batch/)**
Submit multiple URLs in a single request and handle per-item results.

**[Limits & Quotas](/limits/)**
Understand rate limits, monthly capture and storage quotas, and how to read quota headers.

**[Webhooks](/webhooks/)**
Receive real-time notifications when captures complete or fail.

**[API Reference](/api-reference/)**
Full endpoint details, request and response schemas, status codes, and rate limits.

**[Architecture](/architecture/)**
How WRL processes captures, signs bundles, and maintains the integrity chain.

**[Security and Compliance](/security/)**
Security whitepaper, DPA, subprocessor list, incident response policy, and data retention policy for enterprise buyers.

</div>
