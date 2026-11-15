# Decisions

- The code adds these fields to problem responses through `problemResponse()`'s
  fourth argument: `limitType` and `quota` on a 429, `threatTypes` on the 422
  from threat screening, `quarantineReason` and `quarantinedAt` on a 451,
  `purgeAfter` on the admin 409. Only `purgeAfter` was documented, on its
  response, as an `allOf` of `ProblemDetail` and the extra property.
- Same shape for the others instead of optional properties on `ProblemDetail`,
  so each field shows where it can come back: `ProblemLimit` (all 429s, using
  `QuotaDetail`), `ProblemThreat` (the 422 of `POST /v1/captures`; the batch
  per-item 422 has no `threatTypes`) and `ProblemQuarantined` (the 451s with
  quarantine fields).
- `GET /v1/verify/{captureId}` answers 451 for a quarantined capture, with the
  quarantine fields, and the diff route answers 451 when either capture is
  quarantined, without them. Neither was in the spec; both are now. The two
  documented 451 examples gave a `detail` WRL doesn't send.
- `test/problem-fields-sync.test.js` reads every `problemResponse()` call in
  `src/` and fails when a field of its fourth argument isn't a property of a
  schema extending `ProblemDetail`. It skips strings and template literals,
  including nested ones, when it splits the arguments.
- Left: three unused components (`WebhookEventPayload`, the `Deprecation` and
  `Sunset` headers). They are lint warnings, not wrong statements.
