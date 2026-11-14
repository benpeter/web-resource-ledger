# Outcome

- `test/routes-sync.test.js`, red first (2eaa5ef): 9 routes missing from the table
  (`GET /admin`, `POST /v1/sitemap`, three admin dashboard routes,
  `PATCH /v1/schedules/{scheduleId}`, three email sign-in routes), the diff route's
  auth, and the two notification routes declared without auth.
- `docs/INTERNALS.md`: the 9 rows, the diff route's auth, the `ADMIN_RATE_LIMITER` and
  `AUTH_RATE_LIMITER` rows.
- `openapi.yaml`: `sessionCookie` scheme, notification routes use it, `bearerAuth` and
  `adminAuth` descriptions. `site/_includes/partials/endpoint.njk`: "Dashboard session"
  badge. CHANGELOG.
- Found on the way, next phase: `X-RateLimit-Limit` on `/auth/*` says 20 and on
  `/v1/account/*` says 30, while `AUTH_RATE_LIMITER` allows 10 a minute per IP across
  both; and the INTERNALS "Application-layer defaults (KV counters)" table lists
  groups that have no KV counter.

## Backlog changes

None. No backlog item covered this.
