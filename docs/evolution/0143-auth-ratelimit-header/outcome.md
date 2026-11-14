# Outcome

- `src/rate-limits.js`: `auth` 10, no `account`. `src/index.js`: `getRateLimitGroup`
  returns `auth` for `/v1/account/*` and `/v1/billing/*`.
- Tests, red first (a9e5947): `test/rate-limit-headers.test.js` (five routes say 10),
  `test/rate-limits-sync.test.js`.
- `docs/INTERNALS.md` application-layer table (only `capture` and `sitemap` have KV
  counters), `site/content/limits.md` per-IP table, `openapi.yaml` usage description,
  CHANGELOG.

## Backlog changes

None. No backlog item covered this.
