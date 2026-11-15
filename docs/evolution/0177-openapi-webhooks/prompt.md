# Prompt

Same session as phases 0133 to 0176, not from the backlog. After phase 0176,
`npm run lint:api` still warned that `WebhookEventPayload` is never used: the
schema of the body WRL sends to webhook endpoints existed, but nothing in the
spec pointed at it, so neither the API reference nor a client generator showed
it. The spec is OpenAPI 3.1, which has a top-level `webhooks` section for
requests the API sends instead of receives.
