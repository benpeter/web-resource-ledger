# Decisions

- INTERNALS "Secrets and Variables" stays the full list. OPERATIONS.md keeps its
  own table because it says which secrets are required; a sync test keeps the two
  lists equal instead of folding one into the other.
- `test/env-sync.test.js` checks four things, all read as text like the other sync
  tests: every `env.NAME` read in `src/` is in an INTERNALS table, every
  production `[vars]` entry is read by `src/`, the fully written INTERNALS variable
  values match `wrangler.toml`, and OPERATIONS.md lists the INTERNALS secrets. A
  fifth check pins the staging `VERIFICATION_BASE_URL`.
- `STRIPE_PUBLISHABLE_KEY` is removed rather than documented: nothing reads it,
  because checkout and the billing portal are Stripe-hosted pages.
- Staging sets `VERIFICATION_BASE_URL = "https://staging.webresourceledger.com"`.
  Without it every link in staging emails (email confirmation, unsubscribe,
  billing) and the `verificationUrl` of staging webhooks pointed at production,
  where staging captures and staging-signed tokens don't exist. Production keeps
  the default.
- `CLOUDFLARE_CACHE_PURGE_TOKEN` isn't set on either Worker, so the last step of
  the account-deletion runbook (`POST /v1/admin/cache/purge`) answers 503 (checked
  on staging). The token with only Zone > Cache Purge has to be created in the
  Cloudflare dashboard: the agent's API token can't create tokens, and reusing it
  would give the Worker far more than purge rights. Filed for Ben. Until then
  cached verification responses expire on their own within 24 hours
  (`max-age=86400`; the Cache API ignores `stale-while-revalidate`); the runbook
  and the data-retention page now say so, and the data-retention page no longer
  claims artifacts are edge-cached (only verification responses and signing keys
  are).
