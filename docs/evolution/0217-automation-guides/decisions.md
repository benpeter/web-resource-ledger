# Decisions

- Guides first, apps later. A Zapier app, a Make custom app and an n8n
  community node each need an account on that platform (and an npm publish
  for n8n), and all three platforms already have a generic HTTP request step
  and a webhook trigger that work with a WRL API key and WRL webhooks. The
  page `/automation/` shows both automations per platform: one that starts a
  capture, one that starts on `capture.complete`, and polling as the
  alternative.
- Drafted by a claude-fable-5-2 agent from openapi.yaml, webhooks.md,
  batch.md, schedules.md and authentication.md, and from each platform's own
  docs (Zapier Webhooks by Zapier, Make HTTP and Webhooks apps, n8n HTTP
  Request and Webhook nodes). Not run on a platform account; the page names
  the paid Zapier plan that Webhooks by Zapier needs.
- The platforms' webhook triggers don't check WRL's signature. The page says
  so, names where each platform exposes headers and the raw body for a code
  step, and suggests taking only `data.captureId` from an event and fetching
  the record from WRL.
- Registering a webhook still needs curl: the dashboard has no webhook form.
  Left as a possible dashboard item.
