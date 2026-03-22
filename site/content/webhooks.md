---
layout: layouts/doc.njk
title: Webhooks
description: Receive real-time notifications when captures complete or fail. Register an HTTPS endpoint and WRL will POST signed events to it automatically.
---

# Webhooks

WRL can push event notifications to your HTTPS endpoint whenever a capture completes or fails. This eliminates the need to poll `/v1/captures` -- instead, your server receives a signed POST request the moment the state changes.

## Prerequisites

- An API key with `capture` scope. See [Authentication](/authentication/).
- An HTTPS endpoint that accepts POST requests and returns a 2xx response.

---

## Register a webhook

Send a `POST /v1/webhooks` request with your endpoint URL, the event types you want to receive, and a name.

```bash
curl -X POST https://wrl.example.com/v1/webhooks \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://hooks.example.com/wrl-events",
    "events": ["capture.complete", "capture.failed"],
    "name": "ci-notifier"
  }'
```

```json
{
  "id": "whk_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
  "url": "https://hooks.example.com/wrl-events",
  "events": ["capture.complete", "capture.failed"],
  "name": "ci-notifier",
  "secret": "whsec_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
  "createdAt": "2026-03-22T12:00:00.000Z",
  "warning": "Store this secret now. It cannot be retrieved after this response."
}
```

**The `secret` is shown exactly once.** Store it in a secrets manager immediately -- it cannot be retrieved later. You will use it to verify the signature on every incoming event.

Constraints:
- URL must use `https`. HTTP endpoints are rejected.
- Maximum 5 webhooks per tenant. To add a sixth, delete one first.
- Maximum URL length: 2048 characters.

---

## Event types

### `capture.complete`

Fired when a capture finishes successfully with all artifacts available.

```json
{
  "id": "evt_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
  "type": "capture.complete",
  "createdAt": "2026-03-22T12:05:00.000Z",
  "data": {
    "id": "cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
    "status": "complete",
    "url": "https://example.com",
    "createdAt": "2026-03-22T12:04:45.000Z",
    "completedAt": "2026-03-22T12:05:00.312Z",
    "renderQuality": "full",
    "artifacts": {
      "screenshot": "https://wrl.example.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/artifacts/screenshot",
      "html": "https://wrl.example.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/artifacts/html",
      "headers": "https://wrl.example.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/artifacts/headers"
    },
    "verifyUrl": "https://wrl.example.com/v1/verify/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"
  }
}
```

### `capture.failed`

Fired when a capture fails after all browser rendering attempts are exhausted.

```json
{
  "id": "evt_b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7",
  "type": "capture.failed",
  "createdAt": "2026-03-22T12:05:10.000Z",
  "data": {
    "id": "cap_b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7",
    "status": "failed",
    "url": "https://example.com/missing-page",
    "createdAt": "2026-03-22T12:04:55.000Z",
    "failedAt": "2026-03-22T12:05:10.000Z",
    "error": "Navigation timeout after 30000ms",
    "retryable": true
  }
}
```

---

## Verifying signatures

WRL signs every event payload so you can confirm requests originate from WRL and have not been tampered with. **Always verify the signature before processing a payload.**

### Headers

Every webhook request includes two headers:

| Header | Description |
|--------|-------------|
| `X-WRL-Signature-256` | HMAC-SHA256 signature in the format `t={timestamp},v1={hex_signature}` |
| `X-WRL-Timestamp` | Unix timestamp (seconds) when the event was dispatched |

### Signing scheme

WRL constructs the signed payload as:

```
signed_payload = "{timestamp}.{raw_request_body}"
signature = HMAC-SHA256(hex_decoded_secret, signed_payload)
```

The `secret` from registration is `whsec_` followed by 64 hex characters representing 32 raw bytes. You must hex-decode the portion after `whsec_` to get the binary HMAC key.

### Node.js

```js
const crypto = require('crypto');

function verifyWebhookSignature(req, secret) {
  // Parse header: t=1711108800,v1=abc123...
  const header = req.headers['x-wrl-signature-256'];
  if (!header) return false;

  const parts = Object.fromEntries(
    header.split(',').map(part => part.split('=', 2))
  );
  const timestamp = parts['t'];
  const signature = parts['v1'];
  if (!timestamp || !signature) return false;

  // Reject stale events (replay attack prevention)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > 300) return false;

  // Hex-decode the secret (strip whsec_ prefix)
  const keyBytes = Buffer.from(secret.replace('whsec_', ''), 'hex');

  // Reconstruct signed payload
  const rawBody = req.body; // must be the raw Buffer, not parsed JSON
  const signedPayload = `${timestamp}.${rawBody}`;

  // Compute expected signature
  const expected = crypto
    .createHmac('sha256', keyBytes)
    .update(signedPayload)
    .digest('hex');

  // Constant-time comparison to prevent timing attacks
  const expectedBuf = Buffer.from(expected, 'hex');
  const actualBuf = Buffer.from(signature, 'hex');
  if (expectedBuf.length !== actualBuf.length) return false;

  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}
```

> **Important:** Pass the raw request body as a `Buffer` or string before any JSON parsing. Parsing and re-serializing JSON changes whitespace and field order, which breaks the signature.

### Python

```python
import hashlib
import hmac
import time

def verify_webhook_signature(headers, raw_body: bytes, secret: str) -> bool:
    header = headers.get('X-WRL-Signature-256', '')
    if not header:
        return False

    # Parse header: t=1711108800,v1=abc123...
    parts = dict(part.split('=', 1) for part in header.split(',') if '=' in part)
    timestamp = parts.get('t')
    signature = parts.get('v1')
    if not timestamp or not signature:
        return False

    # Reject stale events (replay attack prevention)
    now = int(time.time())
    if abs(now - int(timestamp)) > 300:
        return False

    # Hex-decode the secret (strip whsec_ prefix)
    key_bytes = bytes.fromhex(secret.replace('whsec_', ''))

    # Reconstruct signed payload
    signed_payload = f'{timestamp}.'.encode() + raw_body

    # Compute expected signature
    expected = hmac.new(key_bytes, signed_payload, hashlib.sha256).hexdigest()

    # Constant-time comparison to prevent timing attacks
    return hmac.compare_digest(expected, signature)
```

> **Important:** Pass `raw_body` as `bytes` read directly from the request before any parsing. In Flask, use `request.get_data()`; in FastAPI, use `await request.body()`.

### Why the timestamp matters

The timestamp prefix prevents replay attacks. Without it, an attacker who captures a valid webhook request could re-send it later (to trigger a capture.complete notification again, for example). The 5-minute staleness check (`abs(now - timestamp) <= 300`) ensures stale replays are rejected even if the signature is valid.

---

## Retry behavior

If your endpoint does not return a 2xx response, WRL retries with exponential backoff:

| Attempt | Delay after previous failure |
|---------|------------------------------|
| 1 (initial) | Immediate |
| 2 | 1 minute |
| 3 | 5 minutes |
| 4 (final) | 15 minutes |

After all retries are exhausted, the event is moved to the dead-letter queue and no further delivery is attempted.

**Non-retryable responses:** 4xx responses other than 408 (Request Timeout) and 429 (Too Many Requests) are treated as permanent failures and are not retried. Your endpoint should return 200 immediately after receiving and queuing the payload -- do not block on processing.

---

## Testing

Use the ping endpoint to verify your endpoint is reachable before relying on live events.

```bash
curl -X POST https://wrl.example.com/v1/webhooks/whk_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/ping \
  -H "Authorization: Bearer YOUR_API_KEY"
```

```json
{
  "success": true,
  "httpStatus": 200,
  "latencyMs": 142
}
```

The ping sends a synthetic event with `type: "ping"` signed with your webhook secret. Your endpoint receives and should verify it exactly like a live event. A ping failure (non-2xx response) does not affect webhook active status -- it is informational only.

---

## Managing webhooks

### List

```bash
curl https://wrl.example.com/v1/webhooks \
  -H "Authorization: Bearer YOUR_API_KEY"
```

```json
{
  "data": [
    {
      "id": "whk_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
      "url": "https://hooks.example.com/wrl-events",
      "events": ["capture.complete", "capture.failed"],
      "name": "ci-notifier",
      "createdAt": "2026-03-22T12:00:00.000Z",
      "active": true
    }
  ]
}
```

Secrets are never included in list responses.

All registered webhooks have `active: true`. There is no way to pause a webhook without deleting it.

### Delete

```bash
curl -X DELETE \
  https://wrl.example.com/v1/webhooks/whk_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6 \
  -H "Authorization: Bearer YOUR_API_KEY"
```

```json
{
  "id": "whk_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
  "deleted": true
}
```

Deletion is immediate. Events that were already dispatched before deletion may still be delivered. The signing secret is discarded and cannot be recovered.

---

## Secret rotation

There is no in-place rotation. To change your webhook secret:

1. Register a new webhook for the same URL and events. Save the new secret.
2. Update your endpoint to accept signatures from both the old and new secrets during the transition window.
3. Delete the old webhook.

The brief gap between creating the new webhook and deleting the old one is safe -- both are active simultaneously. If you cannot tolerate any gap, use the [captures list endpoint](/api-reference/#tag/captures/GET/v1/captures) to detect missed completions by polling while you rotate.

---

## Troubleshooting

**My endpoint is receiving events but signature verification fails.**

Check that you are passing the raw request body to the HMAC function before any JSON parsing. Parsing and re-serializing JSON changes whitespace, which invalidates the signature.

Also confirm you are hex-decoding the secret. The `whsec_` prefix encodes 32 bytes as 64 hex characters. If you pass the raw `whsec_...` string as the HMAC key, the key length is wrong and the signature will never match.

**Events stopped arriving after a few failed attempts.**

After 4 total attempts (initial + 3 retries), delivery stops. Your endpoint must return a 2xx status to be considered successful. Check your server logs for the failed requests. Once you fix the endpoint, any new captures will trigger fresh deliveries -- past failed events are not replayed.

**I'm getting 409 when trying to register a webhook.**

You have reached the 5-webhook limit. List your current webhooks (`GET /v1/webhooks`) and delete one before registering a new one.

**Ping succeeds but live events are not arriving.**

The ping uses the same delivery path as live events, so a successful ping means the endpoint is reachable. Verify your webhook is subscribed to the correct event types (`capture.complete` vs `capture.failed`). If you only subscribed to `capture.complete`, failed captures will not trigger a delivery.
