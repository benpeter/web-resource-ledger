---
layout: layouts/doc.njk
title: Batch Captures
description: Submit up to 20 URLs in a single batch capture request, handle per-item results, and poll for completion via the WRL API.
---

# Batch Captures

The batch endpoint lets you submit up to 20 URLs in a single request (a self-hosted operator can raise this to 100 with `MAX_BATCH_SIZE`). Each URL counts against your per-tenant rate limit of 10 captures a minute (unless it was raised), so a batch larger than what is left of that minute is refused with `429`. With the default limit, send at most 10 URLs a minute. To get the URLs from a sitemap, use `POST /v1/sitemap`. WRL processes each URL independently and returns a per-item result. Some URLs may be accepted while others fail validation -- the batch does not abort on partial errors.

## Prerequisites

- An API key with `capture` scope. See [Authentication](/authentication/).

---

## Pattern 1: Submit and poll

### Submit the batch

Send a `POST /v1/captures/batch` request with an array of URL objects.

```bash
curl -X POST https://api.webresourceledger.com/v1/captures/batch \
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
      "statusUrl": "https://api.webresourceledger.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/status"
    },
    {
      "status": 202,
      "url": "https://example.org/about",
      "id": "cap_b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7",
      "statusUrl": "https://api.webresourceledger.com/v1/captures/cap_b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7/status"
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
curl https://api.webresourceledger.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/status
```

```json
{
  "id": "cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
  "status": "complete",
  "captureUrl": "https://api.webresourceledger.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"
}
```

When `status` is `complete`, fetch the full capture record at the `captureUrl` to get artifact links. When `status` is `pending`, wait and check again. When `status` is `failed`, the response includes an `error` message and a `retryable` boolean.

Captures typically complete in 20--60 seconds. For the full set of status values and the complete polling lifecycle, see the [API Reference](/api-reference/).

---

## Pattern 2: Error handling

### Per-item failures

Some URLs in a batch may fail even when others are accepted. A per-item failure does not affect the rest of the batch.

```bash
curl -X POST https://api.webresourceledger.com/v1/captures/batch \
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
      "statusUrl": "https://api.webresourceledger.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/status"
    },
    {
      "status": 422,
      "url": "https://192.168.1.1/internal",
      "error": {
        "type": "about:blank",
        "status": 422,
        "title": "Unprocessable Content",
        "detail": "Host resolves to a private IP address"
      }
    },
    {
      "status": 202,
      "url": "https://example.org/about",
      "id": "cap_b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7",
      "statusUrl": "https://api.webresourceledger.com/v1/captures/cap_b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7/status"
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

### Whole-batch failures

The entire batch fails (not 207) in these cases:

| Status | Cause |
|--------|-------|
| `400` | Request body is missing or malformed. The `urls` array is absent, not an array, empty, or longer than 20 URLs. |
| `401` | Missing or invalid `Authorization` header. |
| `403` | The API key lacks the `capture` scope, or the account can't capture: it is blocked for non-payment or scheduled for deletion. |
| `415` | `Content-Type` is not `application/json`. |
| `429` | The batch has more URLs than are left of your per-tenant rate limit this minute (`limitType: 'tenant'`), or it would go past the monthly quota (`limitType: 'quota'`). No URL is accepted. |
| `503` | Service is at capacity. Retry after the `Retry-After` header value (seconds). |

### Rate limits and quotas

Rate limits apply per URL, not per request. A batch of 10 URLs uses all 10 captures of a minute at the default limit. A batch with more URLs than are left of the minute is refused as a whole: the response is a single `429` with `limitType: 'tenant'`, not a `207` with per-item errors, and no URL is accepted. Wait the seconds in `Retry-After` and send the batch again, or split it into smaller batches.

Monthly quota checks work the same way: the entire batch is rejected upfront if it would exceed the remaining quota, with a single `429` and `limitType: 'quota'`.

For detailed information about rate limits and monthly quotas, see [Limits & Quotas](/limits/).
