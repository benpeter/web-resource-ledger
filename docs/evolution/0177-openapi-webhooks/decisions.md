# Decisions

- One webhook, `captureEvent`, with `operationId: deliverWebhookEvent`: every
  event type goes out as the same request to the same URL, and `type` in the
  body (and `X-WRL-Event`) tells them apart. Separate entries per event type
  would repeat the same headers four times.
- Header parameters for everything the dispatcher sends that a receiver reads:
  `X-WRL-Signature-256`, `X-WRL-Timestamp`, `X-WRL-Event`, `X-WRL-Delivery`
  and `User-Agent`. `Content-Type` is implied by the request body.
- The description states the delivery rules from `src/webhook-dispatch.js` and
  `src/webhooks.js`: a 2xx within 10 seconds counts, 5xx, 408, 429, timeouts
  and connection errors are retried after 1, 5 and 15 minutes with the same
  event id, other 4xx are not, and a ping goes out once with a 5-second
  timeout.
- `security: []`, because redocly's `security-defined` rule wants it and WRL
  uses no auth scheme when it calls you; it signs the body. The API reference
  hides the auth badge for webhook cards, since "No auth" would mislead.
- `site/_data/api.js` renders webhooks under their tag, with
  `{your webhook URL}` as the path, through the same `buildOperation()` as the
  paths.
- Left: the `Deprecation` and `Sunset` header components (phase 0065). They
  wait for the first deprecated endpoint.
