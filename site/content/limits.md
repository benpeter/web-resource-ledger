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

To check usage without submitting a capture, call the account usage endpoint with an API key that has the `read` scope (a `capture` key includes it). The MCP tool `get_usage` returns the same numbers.

```bash
curl https://api.webresourceledger.com/v1/account/usage \
  -H "Authorization: Bearer YOUR_API_KEY"
```

The response has `captures` and `storageBytes`, each with `used`, `limit` and `remaining` (`limit` and `remaining` are null when there is no limit), the billing status and `resetsAt`.

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
  "detail": "Free tier limit reached (200/200). Add a payment method to continue capturing. Resets 2026-04-01T00:00:00.000Z.",
  "limitType": "quota",
  "quota": {
    "limit": 200,
    "used": 200,
    "resource": "captures",
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

### MCP Captures and Quotas

The MCP tools `capture_url` and `batch_capture` check the same quota, and `batch_capture` checks it for the whole batch. Instead of a `429` they answer with a tool error whose text is the `detail` above, for example "Free tier limit reached (200/200). Add a payment method to continue capturing. Resets 2026-04-01T00:00:00.000Z."

### Accounts That Can't Capture

An account that is blocked for non-payment, or that has a pending deletion, can't capture at all. Capture requests answer `403` instead of `429`, and the MCP capture tools return the same text as a tool error:

- "Account is blocked. Contact support to restore access."
- "This account is scheduled for deletion on 2026-12-14 and can't capture. Contact support to cancel the deletion."

Retrying doesn't help; contact [hello@webresourceledger.com](mailto:hello@webresourceledger.com). A deletion can be cancelled during the 30 days before it is carried out (see [Data Retention](/security/data-retention/)).

---

## Schedule Limit

Each account can have 10 [schedules](/schedules/); paused schedules count toward the limit. Creating one more answers `429` with `limitType: "schedules"`, and the MCP `create_schedule` tool returns the same text as a tool error:

- "Schedule limit reached (10). Delete an existing schedule to create a new one."

There is no `Retry-After` header because waiting doesn't free a slot; deleting a schedule does. Each scheduled run uses one capture from the monthly quota.

---

## Rate Limits

Rate limits protect against short bursts of traffic. They apply independently of quotas -- you can hit a rate limit even when quota is plentiful, and you can exhaust quota without ever hitting a rate limit.

### Per-IP Limits

Unauthenticated or low-trust requests are subject to per-IP rate limiting. The limit applies to the originating IP address.

| What | Limit per IP address |
|---|---|
| Verification and signing keys (`/v1/verify/{id}`, `/.well-known/signing-key`, `/.well-known/signing-keys`), artifact and certificate downloads without an API key, and MCP tool listing without a key | 60 a minute, shared |
| `GET /v1/account/usage`, sign-in and the dashboard's account routes | 10 a minute, shared |

### Per-Tenant Limits

Authenticated requests are rate-limited per tenant. The window is 60 seconds, rolling.

| What | Default per tenant |
|---|---|
| Captures (each URL in a batch counts) | 10 a minute |
| Sitemap reads (`POST /v1/sitemap`) | 10 a minute |

If you need a higher capture limit, email [hello@webresourceledger.com](mailto:hello@webresourceledger.com).

### Rate Limit Response

```
HTTP/1.1 429 Too Many Requests
Retry-After: 42
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 42
Content-Type: application/json
```

```json
{
  "type": "about:blank",
  "status": 429,
  "title": "Too Many Requests",
  "detail": "Per-tenant rate limit exceeded.",
  "limitType": "tenant"
}
```

- `limitType` is `'tenant'` for per-tenant limits, or absent for per-IP limits
- `Retry-After` is an integer number of seconds until the window resets

When you receive a rate-limit `429`, wait the number of seconds in `Retry-After` before retrying. For batch requests, rate limits apply per URL -- see [Batch Captures](/batch/) for details.

---

## Screenshot Size

Pages render in a window 1,280 CSS pixels wide, and screenshots cover the top 8,000 CSS pixels of a page. Screenshots are taken at twice that resolution, so the largest is 2,560 by 16,000 pixels. On a taller page the screenshot stops there; the rendered HTML in the WACZ bundle still holds the whole page.

The capture record says when that happened: `render.screenshotClipped` is `true`, `render.pageHeight` is the page's height and `render.screenshotHeight` how much of it the screenshot shows. The same three fields are signed into the WACZ bundle's `captureQuality`, the verification page notes it under the screenshot, and MCP `get_capture` mentions it.

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
| WRL lost track of this capture before it finished | A problem on WRL's side: the capture was still pending 24 hours after it was submitted. Submit it again. | No |

After repeated attempts the message ends with "WRL tried 4 times." Failed captures don't count against your monthly quota.

A page that times out after its HTML has loaded doesn't fail. WRL captures it as it stands and marks it `"renderQuality": "partial"`; it is signed, timestamped and counted like any other capture. See [Partial captures](/verification/#partial-captures).

## Custom Quotas (Operators)

Operators can override the default tier quotas, the schedule limit and the capture rate limit for individual tenants via the admin API. This is useful for granting higher limits to enterprise tenants or restricting a specific tenant below the tier default.

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
| `schedules.maxSchedules` | integer | Maximum number of schedules, 1 to 100. Replaces the default of 10. |
| `rateLimit.capture.limit` | integer | Captures per window for this tenant. Replaces the default of 10; values above 100 are treated as 100. |
| `rateLimit.capture.period` | integer | Window length in seconds, `10` or `60`. Defaults to 60. |

A `PUT` replaces the tenant's whole configuration, so send every override you want to keep. To remove a custom override and return the tenant to their tier default, leave the field out, or set its group (for example `quotas`) to `null`; a single field set to `null` is rejected with `400`. `GET /v1/admin/tenants/{tenantId}/config` shows the current configuration.
