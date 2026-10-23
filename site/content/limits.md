---
layout: layouts/doc.njk
title: Limits & Quotas
description: How WRL enforces rate limits (burst protection) and monthly quotas (usage caps), with response examples and operator override instructions.
---

# Limits & Quotas

WRL enforces two types of request limits: **rate limits** (short-term burst protection) and **quotas** (monthly usage caps). Both return `429` responses, but they are distinct and require different handling.

## Rate Limits vs Quotas

| | Rate Limits | Quotas |
|---|---|---|
| **Scope** | Per IP or per tenant | Per tenant |
| **Window** | 60 seconds | Calendar month |
| **Reset** | Rolling window (seconds) | First of next month |
| **429 `limitType`** | `'tenant'` or absent | `'quota'` |
| **`Retry-After` format** | Seconds (integer) | HTTP-date |

---

## Monthly Quotas

Each tenant is assigned a tier that determines their monthly limits.

| Tier | Captures / month | Storage / month |
|---|---|---|
| Free (no payment method) | 200 | 10 GB |
| Pay per capture (payment method on file) | No limit | No limit |

### Checking Usage

Every successful capture response includes `X-Quota-*` headers so you can monitor usage without making a separate request.

| Header | Description |
|---|---|
| `X-Quota-Limit` | Maximum captures allowed in the current billing period |
| `X-Quota-Used` | Captures consumed so far this period |
| `X-Quota-Remaining` | Captures left before the quota is exhausted |

To check usage programmatically without submitting a capture, use the account usage endpoint (requires session auth):

```bash
GET /v1/account/usage
```

### Quota Exceeded Response

When a capture request would exceed the monthly quota, WRL returns a `429` before any capture work is attempted.

```bash
curl -X POST https://api.webresourceledger.com/v1/captures \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

```
HTTP/1.1 429 Too Many Requests
Retry-After: Mon, 01 Apr 2026 00:00:00 GMT
Content-Type: application/json
```

```json
{
  "type": "about:blank",
  "status": 429,
  "title": "Too Many Requests",
  "detail": "Monthly capture quota exceeded. Your quota resets on 2026-04-01.",
  "limitType": "quota",
  "quota": {
    "resource": "captures",
    "limit": 200,
    "used": 200,
    "remaining": 0,
    "resetsAt": "2026-04-01T00:00:00.000Z"
  }
}
```

Key differences from rate-limit `429` responses:

- `limitType` is `'quota'`, not `'tenant'` or absent
- `quota.resource` indicates which limit was hit: `'captures'` or `'storage'`
- `Retry-After` is an HTTP-date string (not a seconds integer) -- it points to the first second of the next billing period

### Batch Captures and Quotas

Batch requests check quota upfront for the entire batch before any capture is queued. If the batch would exceed the remaining quota, the **entire batch is rejected** with a single `429` response -- no items are accepted.

For example, if you have 30 captures remaining and submit a batch of 50 URLs, all 50 are rejected. Resubmit a smaller batch that fits within the remaining quota, or wait until the quota resets.

See [Batch Captures](/batch/) for full batch error handling patterns.

---

## Rate Limits

Rate limits protect against short bursts of traffic. They apply independently of quotas -- you can hit a rate limit even when quota is plentiful, and you can exhaust quota without ever hitting a rate limit.

### Per-IP Limits

Unauthenticated or low-trust requests are subject to per-IP rate limiting. The limit applies to the originating IP address.

### Per-Tenant Limits

Authenticated requests are rate-limited per tenant. The window is 60 seconds, rolling.

### Rate Limit Response

```
HTTP/1.1 429 Too Many Requests
Retry-After: 42
Content-Type: application/json
```

```json
{
  "type": "about:blank",
  "status": 429,
  "title": "Too Many Requests",
  "detail": "Rate limit exceeded. Retry after 42 seconds.",
  "limitType": "tenant"
}
```

- `limitType` is `'tenant'` for per-tenant limits, or absent for per-IP limits
- `Retry-After` is an integer number of seconds until the window resets

When you receive a rate-limit `429`, wait the number of seconds in `Retry-After` before retrying. For batch requests, rate limits apply per URL -- see [Batch Captures](/batch/) for details.

---

## Screenshot Size

Pages render in a window 1,280 CSS pixels wide, and screenshots cover the top 8,000 CSS pixels of a page. Screenshots are taken at twice that resolution, so the largest is 2,560 by 16,000 pixels. On a taller page the screenshot stops there; the rendered HTML in the WACZ bundle still holds the whole page.

## Why Captures Fail

A failed capture has an `error` that says why, in the API status response, the capture record, the `capture.failed` webhook, the failure email and the dashboard. WRL tries a capture up to 4 times, a few minutes apart, when the failure may pass on another try, and reports the reason of the last attempt.

| Message | What happened | Retried |
|---|---|---|
| The site showed a Cloudflare bot check instead of the page | The site answered with a bot check ("Just a moment...") that didn't clear within a few seconds. WRL doesn't get around these checks. | No |
| The site did not respond, possibly because it blocks automated visits or this region | The site sent nothing back at all. | No |
| Page did not finish loading within 20 seconds | The page didn't load in time. | Yes |
| The site's address could not be found (DNS) | The domain doesn't resolve. | Yes |
| The site refused the connection | Nothing accepts connections at that address. | Yes |
| The site's TLS certificate is not valid | The certificate is expired, self-signed or for another name. | No |
| The page loaded but showed nothing (blank page) | The browser loaded the page but nothing appeared. | No |
| The browser showed an error page instead of the site | The browser couldn't open the page and showed its own error page. | No |
| The browser could not take a screenshot of this page | The page loaded, but the browser couldn't capture it. This happens on some pages with heavy animation. | Yes |
| Page exceeded 500 subresource limit / 50MB size limit | The page loads more than WRL captures. | No |
| Could not navigate to the target URL, or a message about the browser session | A problem on WRL's side or the network. | Yes |

After repeated attempts the message ends with "WRL tried 4 times." Failed captures don't count against your monthly quota.

## Custom Quotas (Operators)

Operators can override the default tier quotas for individual tenants via the admin API. This is useful for granting higher limits to enterprise tenants or restricting a specific tenant below the tier default.

```bash
curl -X PUT https://api.webresourceledger.com/v1/admin/tenants/acme-corp/config \
  -H "Authorization: Bearer YOUR_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "quotas": {
      "capturesPerMonth": 25000,
      "storageBytes": 107374182400
    }
  }'
```

```json
{
  "tenantId": "acme-corp",
  "config": {
    "quotas": {
      "capturesPerMonth": 25000,
      "storageBytes": 107374182400
    }
  },
  "updatedAt": "2026-03-23T09:00:00.000Z"
}
```

Request fields:

| Field | Type | Description |
|---|---|---|
| `quotas.capturesPerMonth` | integer | Override for monthly capture limit. Replaces the tier default. |
| `quotas.storageBytes` | integer | Override for storage limit in bytes. Replaces the tier default. |

To remove a custom override and return the tenant to their tier default, omit the field or set it to `null`.
