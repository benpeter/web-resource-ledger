---
layout: layouts/doc.njk
title: Batch Captures
description: Submit multiple URLs in a single request, handle per-item results, and poll for completion.
---

# Batch Captures

The batch endpoint lets you submit up to 100 URLs in a single request. WRL processes each URL independently and returns a per-item result. Some URLs may be accepted while others fail validation -- the batch does not abort on partial errors.

## Prerequisites

- An API key with `capture` scope. See [Authentication](/authentication/).

---

## Pattern 1: Submit and poll

### Submit the batch

Send a `POST /v1/captures/batch` request with an array of URL objects.

```bash
curl -X POST https://wrl.example.com/v1/captures/batch \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "urls": [
      {"url": "https://example.com"},
      {"url": "https://example.org/about"}
    ]
  }'
```

The response is `207 Multi-Status`. Each item in `items` corresponds to the URL at the same position in your input array.

```json
{
  "items": [
    {
      "status": 202,
      "url": "https://example.com",
      "id": "cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
      "statusUrl": "https://wrl.example.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/status"
    },
    {
      "status": 202,
      "url": "https://example.org/about",
      "id": "cap_b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7",
      "statusUrl": "https://wrl.example.com/v1/captures/cap_b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7/status"
    }
  ],
  "summary": {
    "total": 2,
    "accepted": 2,
    "failed": 0
  }
}
```

Items with `"status": 202` have been accepted. Collect their `id` values -- you will use them to poll for results.

### Poll for completion

Wait a few seconds, then check each accepted capture individually using its ID.

```bash
curl https://wrl.example.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/status
```

```json
{
  "id": "cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
  "status": "complete",
  "captureUrl": "https://wrl.example.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"
}
```

When `status` is `complete`, fetch the full capture record at the `captureUrl` to get artifact links. When `status` is `pending`, wait and check again. When `status` is `failed`, the response includes an `error` message and a `retryable` boolean.

Captures typically complete in 5--15 seconds. For the full set of status values and the complete polling lifecycle, see the [API Reference](/api-reference/).

---

## Pattern 2: Error handling

### Per-item failures

Some URLs in a batch may fail even when others are accepted. A per-item failure does not affect the rest of the batch.

```bash
curl -X POST https://wrl.example.com/v1/captures/batch \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "urls": [
      {"url": "https://example.com"},
      {"url": "https://192.168.1.1/internal"},
      {"url": "https://example.org/about"}
    ]
  }'
```

```json
{
  "items": [
    {
      "status": 202,
      "url": "https://example.com",
      "id": "cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
      "statusUrl": "https://wrl.example.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/status"
    },
    {
      "status": 422,
      "url": "https://192.168.1.1/internal",
      "error": {
        "type": "about:blank",
        "status": 422,
        "title": "Unprocessable Entity",
        "detail": "URL resolves to a private IP address."
      }
    },
    {
      "status": 202,
      "url": "https://example.org/about",
      "id": "cap_b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7",
      "statusUrl": "https://wrl.example.com/v1/captures/cap_b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7/status"
    }
  ],
  "summary": {
    "total": 3,
    "accepted": 2,
    "failed": 1
  }
}
```

The `summary` tells you how many items succeeded and how many failed. Iterate `items` to find which specific URLs failed and why.

Common per-item error codes:

| Status | Cause |
|--------|-------|
| `400` | Malformed URL or missing `url` field in the item. |
| `422` | URL is valid but not capturable (private IP, unsupported scheme). |
| `429` | Rate limit exceeded for this item. Wait and resubmit. |

### Whole-batch failures

The entire batch fails (not 207) in these cases:

| Status | Cause |
|--------|-------|
| `400` | Request body is missing or malformed. The `urls` array is absent or not an array. |
| `401` | Missing or invalid `Authorization` header. |
| `503` | Service is at capacity. Retry after the `Retry-After` header value (seconds). |

### Rate limits

Rate limits apply per URL, not per request. Submitting a batch of 10 URLs consumes 10 tokens from your rate limit. If you are near the limit, some items may return `429` while others are accepted. The `summary.failed` count will reflect this.

When you receive `429` items, wait for the window to reset (indicated by the `Retry-After` header on rate-limited responses) and resubmit only the rejected URLs.
