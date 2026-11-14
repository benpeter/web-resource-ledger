# Decisions

- The header follows the limiter, not the other way round. Phase 0134's notes give the
  account limit as 10 a minute per IP, and nobody asked for more; raising the binding
  would also loosen sign-in.
- `RATE_LIMITS.auth` is 10, and `RATE_LIMITS.account` is gone: account and billing routes
  report the `auth` group, because they are limited by the same binding with the same
  per-IP key. Only the header used `account`; tenant overrides only reach `capture`.
- `test/rate-limits-sync.test.js` (sync suite) checks `RATE_LIMITS.verify`, `.admin` and
  `.auth` against the production and staging bindings in `wrangler.toml`. The constants
  only feed the header, so nothing else would notice them drifting again. `capture` and
  `sitemap` are left out: they are KV counters whose defaults sit below the binding
  ceilings on purpose.
- The limits page had no per-IP numbers. It now lists them, because
  `GET /v1/account/usage` takes an API key since phase 0134 and API clients can run into
  the shared 10 a minute.
