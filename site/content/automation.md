---
layout: layouts/doc.njk
title: Zapier, Make and n8n
description: Capture URLs from Zapier, Make or n8n with the platform's HTTP request step and a webhook trigger. WRL has no app there yet, so an API key is all you need.
---

# Zapier, Make and n8n

With Zapier, Make or n8n you can capture a URL whenever a spreadsheet gets a new row, a form is submitted or an RSS feed has a new item, and run more steps when the capture is done.

WRL has no app in their directories yet, so each guide below uses the platform's generic HTTP request step and webhook trigger with a WRL API key.

## Prerequisites

- An API key with `capture` scope. See [Authentication](/authentication/).

---

## What you build

A capture runs in the background. WRL answers the request that starts it right away, and the capture typically completes 20-60 seconds later. So you build two automations: the first sends the URL to WRL, and the second starts when WRL posts a `capture.complete` event to the platform's webhook URL.

### Start a capture

The request is the same on all three platforms:

```bash
curl -X POST https://api.webresourceledger.com/v1/captures \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

WRL answers `202` with the capture's `id` and a `statusUrl`. Store the `id` where the URL came from (the spreadsheet row, for example), so the second automation can find that row again. WRL accepts 10 captures a minute per account by default and answers `429` beyond that; see [Limits & Quotas](/limits/).

### Register the platform's webhook URL

The platform's webhook trigger gives you a URL. Register it with WRL once, from a terminal:

```bash
curl -X POST https://api.webresourceledger.com/v1/webhooks \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://hooks.zapier.com/hooks/catch/123456/abcde",
    "events": ["capture.complete", "capture.failed"],
    "name": "zapier-captures"
  }'
```

The answer has a `secret` that WRL shows only once; save it if you plan to check signatures. From then on WRL posts an event to the URL whenever a capture in your account completes or fails, including captures from the dashboard or a [schedule](/schedules/). An account can have 5 webhooks, and each platform URL uses one.

### Fields to map

| Field | What it is |
|-------|------------|
| `type` | `capture.complete` or `capture.failed`. Filter on it before your own steps. |
| `data.captureId` | The capture ID, the same as `id` in the answer to `POST /v1/captures`. |
| `data.verificationUrl` | The verification page. Anyone can open it without an account. |
| `data.artifacts` | Links named `screenshot`, `html` and `headers`. They need no API key. |
| `data.error` | On `capture.failed`, why the capture failed. |
| `id` | The event ID, the same on a retried delivery. |

[Event types](/webhooks/#event-types) shows the full bodies.

### Signatures

WRL signs each event (the `X-WRL-Signature-256` header), but the platforms' webhook triggers don't check the signature: whoever knows the trigger URL can send it a made-up event. Keep the URL secret.

A check needs a step that computes the signature from the request headers and the unparsed body. Each platform section says where to get them, and [Verifying signatures](/webhooks/#verifying-signatures) has the scheme and code. Without code, take only `data.captureId` from the event and fetch the record with `GET /v1/captures/{id}`, so the links you store come from WRL.

### Polling instead

To stay in one automation, wait, then send a GET to the `statusUrl`. `status` is `pending` until the capture is `complete` or `failed`. When it is `complete`, the answer has a `captureUrl`; a GET on that returns the record, with the links in `artifacts` and the verification link in `verifyUrl`.

Send the API key on these requests too: without one they count against a limit of 60 a minute per IP address. A capture that WRL retries can stay pending for several minutes, so one check after a minute can come too early.

---

## Zapier

Webhooks by Zapier needs a paid Zapier plan: Professional, Team or Enterprise.

To start a capture, add a Webhooks by Zapier action with the event POST:

| Field | Value |
|-------|-------|
| URL | `https://api.webresourceledger.com/v1/captures` |
| Payload Type | JSON |
| Data | `url` on the left, the URL from your trigger on the right |
| Headers | `Authorization` on the left, `Bearer YOUR_API_KEY` on the right |

Zapier builds the JSON body from the Data row and splits WRL's answer into fields.

For the result, make a second Zap with a Webhooks by Zapier trigger and the event Catch Hook. Copy the URL from the trigger's Test tab and register it. Start a capture, wait until it is done, then click **Test trigger** so Zapier reads the fields.

For a signature check, use the event Catch Raw Hook, which passes on the unparsed body and the headers, and a Code by Zapier step.

To poll, add a Delay step with the event Delay For (1 minute is Zapier's shortest delay) and a Webhooks by Zapier GET on the `statusUrl`. If many rows arrive together, a Delay step with the event Delay After Queue before the POST releases the runs one at a time.

---

## Make

To start a capture, add the module HTTP > Make a request:

| Field | Value |
|-------|-------|
| Authentication type | API key |
| Credentials | A new key: Key `Bearer YOUR_API_KEY`, API key placement in the header, API key parameter name `Authorization`, Allowed service origins `https://api.webresourceledger.com` |
| URL | `https://api.webresourceledger.com/v1/captures` |
| Method | POST |
| Body content type | application/json |
| Body input method | Data structure with one text field `url`, mapped to the URL from your trigger |
| Parse response | Yes, so later modules can map `id` and `statusUrl` once the module has run |

For the result, start a second scenario with the module Webhooks > Custom webhook. Click **Add**, name the webhook and save, then copy the URL Make generates and register it. Start a capture while Make is listening, so it reads the field names from the event. A Make webhook belongs to one scenario, so each scenario needs its own WRL webhook.

For a signature check, turn on Get request headers and JSON pass-through in the webhook's advanced settings. Pass-through hands on the body as one text string, not as mapped fields. Make's `sha256` function accepts a key for the HMAC.

To poll, add Tools > Sleep (up to 300 seconds) and a second Make a request module with GET on the `statusUrl` and the same credentials.

---

## n8n

To start a capture, add an HTTP Request node:

| Field | Value |
|-------|-------|
| Method | POST |
| URL | `https://api.webresourceledger.com/v1/captures` |
| Authentication | The generic credential type Bearer auth, with the API key in the credential's Bearer Token field |
| Send Body | On, Body Content Type JSON, one body parameter named `url` with the URL from your trigger |

For the result, start a second workflow with the Webhook node. Set HTTP Method to POST and set Respond to Immediately: WRL waits only 10 seconds for the answer. Register the node's Production URL and publish the workflow: the URL works only while the workflow is published. WRL delivers to `https` URLs only, so a self-hosted n8n needs a public HTTPS address.

n8n puts the event under `body`, so the verification link is `$json.body.data.verificationUrl`.

For a signature check, add the node option Raw Body and a Code node. On n8n Cloud the Code node can use Node's `crypto` module; a self-hosted n8n has to allow built-in modules first.

To poll, build a loop: a Wait node (After Time Interval), an HTTP Request node with GET on the `statusUrl`, and an If node that goes back to the Wait node while `status` is `pending`.

---

## API keys

Starting captures and registering webhooks need a key with the `capture` scope; there is no narrower one for them. An automation that only lists captures or reads usage needs just `read`. Create a key per platform under Settings → API Keys in the [dashboard](https://api.webresourceledger.com/ui), so you can revoke one without breaking the others.

Keep the key in the platform's credential store, not in a header field: the Credentials field in Make, a credential in n8n. Webhooks by Zapier has no such store for a header, so the key is in the step's Headers row, where anyone editing the Zap can read it. API by Zapier, a beta app that also needs a paid plan, keeps the key in a connection, and its API Request action can replace the POST step.

## Related

- [Webhooks](/webhooks/): event types, signatures and retries
- [Batch Captures](/batch/): up to 20 URLs in one request
- [Scheduled Captures](/schedules/): recapture a URL on a cron schedule
- [Authentication](/authentication/): API keys and scopes
