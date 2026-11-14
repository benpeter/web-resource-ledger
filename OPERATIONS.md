# WRL Operations

## Environments

| Environment | URL | Worker Name |
|-------------|-----|-------------|
| Production  | `https://api.webresourceledger.com` | `wrl` |
| Staging     | `https://staging.webresourceledger.com` | `wrl-staging` |

For D1 schema, binding names, KV/R2 key patterns, and API route map, see [`docs/INTERNALS.md`](docs/INTERNALS.md).

---

## Monitoring

**Health check:**
```bash
curl https://api.webresourceledger.com/health
```
The response includes a `build` object with `commit`, `version`, `env`, and `deployedAt` — use `.build.commit` to confirm which code is live.

**Coralogix:** Filter by `applicationName:wrl` (production) or `applicationName:wrl-staging`.

**Alert rules:** See [docs/operations/alerts.md](docs/operations/alerts.md) for alert definitions, thresholds, and provisioning.

**Audit log schema:** See [docs/audit-log-schema.md](docs/audit-log-schema.md) for event names, fields, and Coralogix queries.

**GitHub Actions:**
- Production: https://github.com/benpeter/web-resource-ledger/actions/workflows/deploy-production.yml
- Staging: https://github.com/benpeter/web-resource-ledger/actions/workflows/deploy-staging.yml

---

## Deploy to Staging

Every push to `main` automatically runs three jobs in sequence in `deploy-staging.yml`: test, deploy, and smoke. All three must pass.

After a successful staging deploy, the production pipeline triggers automatically via `workflow_run`. See [Deploy to Production](#deploy-to-production).

Staging deploys run one at a time (`concurrency: deploy-staging`), and so do production deploys (`concurrency: deploy-production`). A push that lands while a deploy is running waits for it; if several pushes wait, only the newest runs and the others show as cancelled.

**Manual trigger (GitHub UI):**
1. Go to Actions > Deploy to Staging > Run workflow
2. Select the branch (no other inputs -- always deploys HEAD of the selected branch)
3. Click Run workflow

This deploys HEAD of the selected branch to staging and, on completion, also triggers the production pipeline.

**Manual trigger (CLI):**
```bash
wrangler deploy --env staging
```

This deploys directly to staging only. It does NOT trigger the production pipeline.

---

## Deploy to Production

The production pipeline triggers automatically after `deploy-staging.yml` completes successfully -- NOT on push to `main`. The pipeline runs two jobs:
1. `deploy` -- deploys to production (requires environment approval if configured)
2. `smoke` -- verifies production health (read-only, skips capture round-trip)

The `staging-smoke` job is skipped for automatic triggers because staging already passed its own smoke test as part of `deploy-staging.yml`.

**Manual trigger (rollback):**
1. Go to Actions > Deploy to Production > Run workflow
2. Leave "Git ref" blank to deploy HEAD
3. Click Run workflow

---

## Database Migrations

Deploys don't apply D1 migrations: the deploy API token has no D1 permissions. A pull request that adds a file to `migrations/` needs it applied to both databases **before it merges**, with a token that has D1 edit rights:

```bash
wrangler d1 migrations list DB --remote                 # production: shows what is pending
wrangler d1 migrations apply DB --remote
wrangler d1 migrations apply DB --remote --env staging
```

Applying first is safe as long as the migration keeps the running code working: add columns and tables, and don't rename or drop what the current code reads. A migration that can't meet that needs its own plan (add first, deploy, drop in a later migration).

If a migration is forgotten and the new code reads it on the capture path, the staging smoke test catches it: the capture round-trip answers 500 and the production deploy doesn't start (this happened with migration 0019). The smoke test doesn't exercise other routes. Apply the migration, then rerun the failed staging job (Actions > the failed run > Re-run failed jobs, or `gh run rerun <run-id> --failed`); production deploys when it passes.

---

## Releases

`package.json` `version` is the API version: CI deploys it as `WRL-API-Version` on every response and as `build.version` in `/health`, and `scripts/check-version-sync.sh` requires `openapi.yaml` `info.version` and the `server.json` `version` to match. Bump it by SemVer: minor for added endpoints, fields or tools, major for breaking changes.

1. On a branch: `npm version X.Y.Z --no-git-tag-version`, set `info.version` in `openapi.yaml` and `version` in `server.json`, and in CHANGELOG.md add `## [X.Y.Z] - <date>` under `## [Unreleased]` plus the compare links at the bottom.
2. Merge the PR and wait for the production deploy (`/health` shows the new `build.version`).
3. Tag the merge commit and publish the release with the CHANGELOG section as notes:

```bash
git tag -a vX.Y.Z <merge-sha> -m "vX.Y.Z" && git push origin vX.Y.Z
gh release create vX.Y.Z --title vX.Y.Z --notes-file <changelog-section.md>
```

Publishing the release runs `.github/workflows/publish-mcp-registry.yml`, which publishes `server.json` to the [MCP Registry](https://registry.modelcontextprotocol.io/v0/servers?search=io.github.benpeter/web-resource-ledger) through GitHub OIDC (no secret). It stops if the tag doesn't match `server.json` and skips a version that is already listed; it can also be run by hand from the Actions tab.

The `v*` tag itself triggers nothing; `verify/v*` tags publish `@w-r-l/verify` (see `packages/verify/`).

---

## Account Deletion

The [data-retention page](https://docs.webresourceledger.com/security/data-retention/) promises: deletion requests by email to hello@webresourceledger.com, confirmed within 2 business days; the account stops capturing at once but stays readable for 30 days; then all its data is removed. Find the tenant id from the GitHub username or sign-in email (`GET /v1/admin/tenants`, or `github_users` / `email_users` in D1).

```bash
source ~/.wrl-keys   # WRL_PROD_ADMIN_KEY
API=https://api.webresourceledger.com
T=gh-424242

# Day 0: request. Captures answer 403, schedules are skipped, data stays readable.
curl -s -X POST "$API/v1/admin/tenants/$T/deletion" -H "Authorization: Bearer $WRL_PROD_ADMIN_KEY"
# -> { deletionRequestedAt, purgeAfter }: reply to the customer with the purgeAfter date.

# Cancel, if the customer changes their mind before purgeAfter
curl -s -X DELETE "$API/v1/admin/tenants/$T/deletion" -H "Authorization: Bearer $WRL_PROD_ADMIN_KEY"

# Day 30 or later: purge. Refused (409) before purgeAfter, or without confirm.
curl -s -X DELETE "$API/v1/admin/tenants/$T?confirm=$T" -H "Authorization: Bearer $WRL_PROD_ADMIN_KEY"
# -> { deleted: { captures, r2Objects }, stripeCustomerId }

# Cached capture responses stay at the edge until purged
curl -s -X POST "$API/v1/admin/cache/purge" -H "Authorization: Bearer $WRL_PROD_ADMIN_KEY" \
  -H "Content-Type: application/json" -d '{"targets":["all"]}'
```

Then, by hand: cancel the subscription and delete the customer in the Stripe dashboard if the response named a `stripeCustomerId`, and tell the customer the deletion is done. Coralogix logs expire on their own and hold no raw personal data. Pending deletions show as `deletionRequestedAt` in `GET /v1/admin/tenants/{tenantId}`; nothing purges automatically.

---

## Rollback

### Decision tree

- **Deploy job failed** -- nothing reached production; fix the code and push
- **Smoke job failed after deploy** -- production is broken; roll back immediately
- **Something looks wrong after a green run** -- roll back and investigate

### Option A: Rollback via workflow_dispatch (preferred)

1. Find the last known-good commit SHA:
   ```bash
   git log --oneline
   ```
2. Go to Actions > Deploy to Production > Run workflow
3. Paste the SHA into the "Git ref" field
4. Click Run workflow -- the pipeline runs `staging-smoke` (tests whatever is currently on staging, not the rollback SHA), deploys the old SHA to production, then runs production smoke

**Warning:** This path bypasses the staging-first guarantee -- it deploys directly to production without first deploying to staging.

**Warning:** Secrets are NOT rolled back with code. If secrets changed after the good commit,
re-set the old values manually with `wrangler secret put`.

**Warning:** The rollback is temporary. The next push to `main` triggers the full staging->production chain and re-deploys whatever is on `main` at that point. To make the rollback permanent, merge a revert commit to `main` first:
```bash
git revert <bad-commit-sha>
git push origin main
```

### Option B: Emergency wrangler CLI (bypasses CD)

Use when GitHub Actions is unavailable or you need to skip approval gates.

```bash
# Deploy a specific commit directly
git checkout <known-good-sha>
wrangler deploy

# Or roll back to a previously uploaded version (lists recent versions)
wrangler versions list
wrangler rollback
```

This bypasses environment protection rules and smoke tests. Verify manually after:
```bash
curl -s https://api.webresourceledger.com/health | jq .build.commit
```

---

## Manual Deploy (Emergency Bypass)

If CD is broken and you need to ship without the pipeline:

```bash
npm ci
wrangler secret put CAPTURE_API_KEY   # legacy -- omit if using per-tenant keys
wrangler secret put ADMIN_KEY
wrangler secret put SIGNING_KEY
wrangler secret put CORALOGIX_SEND_KEY
wrangler secret put IP_HASH_SEED
wrangler deploy
```

Run smoke test manually after:
```bash
SMOKE_URL=https://api.webresourceledger.com SMOKE_API_KEY=<key> SMOKE_SKIP_CAPTURE=1 ./scripts/smoke-test.sh
```

---

## Secret Surfaces

WRL uses three distinct secret surfaces for different purposes. Knowing which surface a secret lives on determines how to set it and when.

| Surface | Set via | Used by | Persists across deploys? |
|---------|---------|---------|--------------------------|
| Worker runtime | `wrangler secret put` | Worker code at execution time | Yes -- one-time setup, survives all deploys |
| GitHub environment | Repo Settings > Environments | CD workflows (deploy auth, smoke tests) | Yes -- until manually changed |
| Local dev (`.dev.vars`) | Manual file edit | `wrangler dev` | N/A -- never deployed |

> **The CD pipeline deploys code only.** Worker runtime secrets (`CAPTURE_API_KEY`, `SIGNING_KEY`, etc.) must be set once via `wrangler secret put` and persist across all subsequent deploys. You do not need to re-set secrets after each deploy.

Worker runtime secrets:

| Secret | Purpose | Required? |
|--------|---------|-----------|
| `CAPTURE_API_KEY` | Legacy static bearer token (fallback when KV key not found) | No -- legacy; remove after tenant key migration |
| `SIGNING_KEY` | Ed25519 private key for WACZ bundle signing | No -- WACZ bundles are skipped without it |
| `IP_HASH_SEED` | HMAC seed for IP address hashing in logs | Recommended |
| `CORALOGIX_SEND_KEY` | Structured log ingestion to Coralogix | Required for production observability |
| `ADMIN_KEY` | Admin API bearer token for key management endpoints | Required for per-tenant key management |

See README steps 4-7 for secret generation commands and initial setup.

---

## Multi-Tenant Key Migration

This section covers migrating from the legacy static `CAPTURE_API_KEY` to per-tenant KV-based API keys. The migration is zero-downtime: the fallback path means existing keys continue working throughout.

### Phase 1: Deploy the new code (nothing breaks)

The new auth logic uses dual-mode fallback: it tries KV lookup first, and falls back to the legacy `CAPTURE_API_KEY` on a KV miss. Existing callers using `CAPTURE_API_KEY` continue working without change.

**Action:** Merge the PR, let CD deploy.

**Verify the deploy:**
```bash
curl https://api.webresourceledger.com/health
```

**Rollback:** Revert the PR and redeploy.

### Phase 2: Set up the admin API

**Start with staging first:**

```bash
# Set admin key on staging
wrangler secret put ADMIN_KEY --env staging
# Enter a strong random value (e.g., openssl rand -hex 32)
```

**Create the first tenant key on staging:**
```bash
curl -X POST https://staging.webresourceledger.com/v1/admin/keys \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"tenantId": "default", "scopes": ["capture"], "name": "default-key"}' | jq .
```

Save the returned key:
```bash
curl ... | jq -r .key > /tmp/wrl-key-default.txt
```

**Verify the new key works on staging:**
```bash
curl -X POST https://staging.webresourceledger.com/v1/captures \
  -H "Authorization: Bearer $(cat /tmp/wrl-key-default.txt)" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'

curl https://staging.webresourceledger.com/v1/captures \
  -H "Authorization: Bearer $(cat /tmp/wrl-key-default.txt)" | jq .
```

**List keys to confirm:**
```bash
curl https://staging.webresourceledger.com/v1/admin/keys \
  -H "Authorization: Bearer $ADMIN_KEY" | jq .
```

**Then repeat on production:**
```bash
wrangler secret put ADMIN_KEY
# Enter the same or a different strong random value for production

curl -X POST https://api.webresourceledger.com/v1/admin/keys \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"tenantId": "default", "scopes": ["capture"], "name": "default-key"}' | jq .
```

> **Note on key propagation:** Newly created keys are usable immediately. Revoked keys may remain valid for up to 60 seconds due to distributed edge caching.

### Phase 3: Retire the legacy key

Before removing `CAPTURE_API_KEY`, confirm no callers are still using it. In Coralogix:

```
applicationName:wrl AND event:"security.legacy_auth_used"
```

Wait until this query returns zero events for 7+ days. Then remove the secret:

```bash
# Wrangler does not support deleting secrets directly -- set to a random value to invalidate it
wrangler secret put CAPTURE_API_KEY
# Enter a random string that no caller has

# Or remove from GitHub environment secrets if also set there
```

**Rollback:** Re-set `CAPTURE_API_KEY` to the original value via `wrangler secret put`.

### Cloudflare API Token Permissions

Required permissions when creating the Cloudflare API token:

- Account > Workers Scripts > Edit
- Account > Workers KV Storage > Edit
- Account > Workers R2 Storage > Edit
- Account > Account Settings > Read
- User > Memberships > Read

Scope the token to the specific account that owns the WRL Workers. Do not use the broad "Edit Cloudflare Workers" template -- it grants more access than needed.

---

## GitHub Environment Setup

### `production` environment

**Secrets:**

| Name | Description |
|------|-------------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token -- see [permissions above](#cloudflare-api-token-permissions) |
| `WRL_PROD_CAPTURE_API_KEY` | See [README step 4](README.md#4-configure-capture-api-key) -- legacy fallback; remove after tenant key migration |
| `WRL_PROD_SIGNING_KEY` | See [README step 5](README.md#5-configure-signing-key) |
| `WRL_PROD_IP_HASH_SEED` | See [README step 6](README.md#6-configure-ip-hash-seed-recommended) |
| `WRL_PROD_CORALOGIX_SEND_KEY` | See [README step 7](README.md#7-configure-coralogix-log-ingestion-required-for-production-observability) |
| `WRL_PROD_ADMIN_KEY` | See [README step 8a](#8a-configure-admin-key) -- required for per-tenant key management |

**Variables:**

| Name | Value |
|------|-------|
| `WRL_PROD_BASE_URL` | `https://api.webresourceledger.com` |

**Protection rules:** Add required reviewer to gate production deploys.

See README steps 4-7 for generation commands. Worker secrets must be set separately via `wrangler secret put` -- the CD pipeline deploys code only.

The `production` GitHub environment maps to the top-level wrangler.toml config (`wrangler deploy`). The `staging` environment maps to `[env.staging]` (`wrangler deploy --env staging`).

### `staging` environment

**Secrets:**

| Name | Description |
|------|-------------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token -- see [permissions above](#cloudflare-api-token-permissions) |
| `WRL_STAGING_CAPTURE_API_KEY` | See [README step 4](README.md#4-configure-capture-api-key) -- legacy fallback; remove after tenant key migration |
| `WRL_STAGING_SIGNING_KEY` | See [README step 5](README.md#5-configure-signing-key) |
| `WRL_STAGING_IP_HASH_SEED` | See [README step 6](README.md#6-configure-ip-hash-seed-recommended) |
| `WRL_STAGING_CORALOGIX_SEND_KEY` | See [README step 7](README.md#7-configure-coralogix-log-ingestion-required-for-production-observability) |
| `WRL_STAGING_ADMIN_KEY` | See [README step 8a](#8a-configure-admin-key) -- required for per-tenant key management |

**Variables:**

| Name | Value |
|------|-------|
| `WRL_STAGING_BASE_URL` | `https://staging.webresourceledger.com` |

**Protection rules:** Do NOT add required reviewer -- staging must deploy without approval. The production pipeline triggers automatically after staging completes (`workflow_run`). Adding a reviewer gate to staging blocks the entire deploy chain.

See README steps 4-7 for generation commands. Worker secrets must be set separately via `wrangler secret put` -- the CD pipeline deploys code only.
