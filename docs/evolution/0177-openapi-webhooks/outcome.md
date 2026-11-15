# Outcome

- Red first (0cbd573): `test/webhook-headers-sync.test.js` also requires every
  header the dispatcher sends to be a header parameter of
  `webhooks.captureEvent.post`, with `WebhookEventPayload` as its body. Then
  green (4501fd9).
- `openapi.yaml`: `webhooks` section. `npm run lint:api`: 3 warnings before,
  2 after (the two unused header components).
- The API reference shows "Event delivery to your endpoint" under Webhooks;
  the webhooks guide links to it. CHANGELOG under added.
- `npm run test:sync` 19 files, 57 tests; `npm run build:docs`.

## Backlog changes

- None.
