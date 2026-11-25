# Decisions

- `GET /v1/captures/{id}` and `/status` called without a key now count
  against the per-IP verify limiter (60 a minute), like artifacts and the
  certificate already did. A caller with a key is not limited there.
  `limitPublicCaptureRequest()` holds the check; the artifact and
  certificate handlers use it too, and the `security.rate_limit` log names
  the route (`capture_public`, `status_public`, `artifact_public`,
  `certificate_public`).
- Every response of the API Worker carries `X-Robots-Tag: noindex`, not only
  the capture routes. Nothing on that host belongs in search results: the
  verification pages and artifacts show pages tenants captured, often as
  evidence, and the dashboard is behind a sign-in. The docs and the landing
  page run as separate Workers and are not affected.
- Error fields: the public status and record show `error` and `retryable`.
  Every stored error is a fixed sentence from `categorizeError()` or "Queue
  dispatch failed", so no stack or internal detail reaches them. Nothing
  changed.
- `scheduleId` stays in the public capture record. A test already expects it
  there, and the id is useless without the tenant's key.
- A wrong key on a public route already got 401 (a wrong key is not read as
  no key); the new tests cover the record, status, artifacts and certificate.
- Not done: per-endpoint limits beyond that. One shared 60 a minute per IP
  has been enough so far.
