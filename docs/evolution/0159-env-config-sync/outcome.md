# Outcome

- Red first (fa469e0), then green (0a84023).
- `test/env-sync.test.js` in the sync suite (`npm run test:sync`, run by CI).
- INTERNALS: `PIRSCH_ACCESS_KEY` secret; `ANALYTICS_EXCLUDE_TENANTS`,
  `VERIFICATION_BASE_URL` and `MAX_BATCH_SIZE` variables; `TSA_URL` is `http://`
  as in `wrangler.toml`; staging rows for `VERIFICATION_BASE_URL` and the missing
  Pirsch key; `STRIPE_PUBLISHABLE_KEY` rows removed.
- OPERATIONS.md: the Worker secret table lists all 13 production secrets with
  whether each is required; the deletion runbook says what a 503 from the cache
  purge means and how long cached verification responses last without it.
- `wrangler.toml`: staging `VERIFICATION_BASE_URL`, `STRIPE_PUBLISHABLE_KEY` gone
  from both environments (and from the test configs), secret comments complete.
- Data-retention page: the edge-cache paragraph says what is cached and for how
  long. `src/webhook-dispatch.js`: comment on the `VERIFICATION_BASE_URL` default
  corrected (it said the Worker hostname).

## Backlog changes

- New `needs-ben` item: create the Cache Purge token and set
  `CLOUDFLARE_CACHE_PURGE_TOKEN` on production and staging.
