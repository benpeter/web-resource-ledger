# Decisions

- `PATCH /v1/webhooks/{id}` takes any of `url`, `events`, `name`, `active`,
  validated like at registration, and sets `updated_at`. The `active` column
  existed since phase 0003 and dispatch already skipped inactive webhooks;
  nothing could set it. The secret is not changed here: rotation stays
  register-new, delete-old.
- Pausing drops events instead of holding them: queued messages would need
  a store WRL doesn't have. Deliveries already queued still go out.
- `POST /v1/webhooks/{id}/redeliver` with a `captureId` rebuilds the event
  from the capture's current status and queues it for that webhook only,
  with the normal retries. WRL keeps no delivered payloads, so the event has
  a new id; the docs say to recognize it by `data.captureId`. 409 when the
  webhook is paused, not subscribed to the event type, or the capture is
  still pending.
- Not done from #62: the exhaustion alert (a tenant learns about a
  failed delivery from its own endpoint's monitoring, and `webhook.deliver_dlq`
  is in Coralogix for us), schedule-specific events, and requiring
  `VERIFICATION_BASE_URL` (seven call sites share the fallback to the
  production origin; making it required would break self-hosted setups that
  run without it, for little gain).
