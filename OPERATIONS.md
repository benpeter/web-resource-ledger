# WRL Operations

## Environments

| Environment | URL | Worker Name |
|-------------|-----|-------------|
| Production  | `<YOUR_PRODUCTION_URL>` | `wrl` |
| Staging     | `<YOUR_STAGING_URL>` | `wrl-staging` |

---

## Monitoring

**Health check:**
```bash
curl <YOUR_PRODUCTION_URL>/health
```

**Coralogix:** Filter by `applicationName:wrl` (production) or `applicationName:wrl-staging`.

**GitHub Actions:** https://github.com/benpeter/web-resource-ledger/actions/workflows/deploy-production.yml

---

## Deploy to Production

Every push to `main` triggers the pipeline automatically:
1. `staging-smoke` -- confirms staging is healthy
2. `deploy` -- deploys to production (requires environment approval if configured)
3. `smoke` -- verifies production health (read-only, skips capture round-trip)

**Manual trigger (normal):**
1. Go to Actions > Deploy to Production > Run workflow
2. Leave "Git ref" blank to deploy HEAD
3. Click Run workflow

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
4. Click Run workflow -- the pipeline runs staging-smoke, deploys the old SHA, runs smoke

**Warning:** Secrets are NOT rolled back with code. If secrets changed after the good commit,
re-set the old values manually with `wrangler secret put`.

**Warning:** The rollback is temporary. The next push to `main` re-deploys whatever is on
`main` at that point. To make the rollback permanent, merge a revert commit to `main` first:
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
curl <YOUR_PRODUCTION_URL>/health
```

---

## Manual Deploy (Emergency Bypass)

If CD is broken and you need to ship without the pipeline:

```bash
npm ci
wrangler secret put CAPTURE_API_KEY
wrangler secret put SIGNING_KEY
wrangler secret put CORALOGIX_SEND_KEY
wrangler secret put IP_HASH_SEED
wrangler secret put ADMIN_KEY
wrangler deploy
```

Run smoke test manually after:
```bash
SMOKE_URL=<YOUR_PRODUCTION_URL> SMOKE_API_KEY=<key> SMOKE_SKIP_CAPTURE=1 ./scripts/smoke-test.sh
```

---

## Per-Tenant API Key Migration (R12)

### Overview

R12 replaces the single shared `CAPTURE_API_KEY` with per-tenant API keys stored in KV. A dual-mode fallback ensures backward compatibility: the worker accepts both the legacy `CAPTURE_API_KEY` and new KV-based tenant keys simultaneously. No downtime or pipeline changes are required.

### Pre-merge

Nothing required. The dual-mode fallback makes the deploy safe with no configuration changes.

### Post-deploy: Set ADMIN_KEY

`ADMIN_KEY` authenticates calls to the admin API (`/v1/admin/keys`). Generate and set it for both environments:

```bash
openssl rand -hex 32
wrangler secret put ADMIN_KEY
wrangler secret put ADMIN_KEY --env staging
```

### Post-deploy: Provision first tenant key

Once `ADMIN_KEY` is set, provision the initial tenant key:

```bash
curl -X POST https://wrl.benpeter.workers.dev/v1/admin/keys \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"tenantId": "default", "name": "primary", "scopes": ["capture", "read"]}'
```

### Verification

1. Test a capture request using the new tenant key returned above
2. List keys: `GET /v1/admin/keys` with `Authorization: Bearer $ADMIN_KEY`
3. Confirm captures are attributed to the correct tenant in Coralogix logs

### Update GitHub environment secrets

Update the following GitHub environment secrets to use a new tenant key instead of the old shared key:

- `WRL_PROD_CAPTURE_API_KEY` -- update to a tenant key provisioned for production
- `WRL_STAGING_CAPTURE_API_KEY` -- update to a tenant key provisioned for staging

### CAPTURE_API_KEY removal (when safe)

Remove the legacy `CAPTURE_API_KEY` secret only after:

1. All callers have been migrated to tenant keys
2. Coralogix logs confirm zero fallback traffic (no requests using the legacy key)

### Rollback

Revert the deploy commit. KV tenant keys are harmless orphans -- they do not affect old code. `ADMIN_KEY` is ignored by the reverted code.

---

## Secret Surfaces

WRL uses three distinct secret surfaces for different purposes. Knowing which surface a secret lives on determines how to set it and when.

| Surface | Set via | Used by | Persists across deploys? |
|---------|---------|---------|--------------------------|
| Worker runtime | `wrangler secret put` | Worker code at execution time | Yes -- one-time setup, survives all deploys |
| GitHub environment | Repo Settings > Environments | CD workflows (deploy auth, smoke tests) | Yes -- until manually changed |
| Local dev (`.dev.vars`) | Manual file edit | `wrangler dev` | N/A -- never deployed |

> **The CD pipeline deploys code only.** Worker runtime secrets (`CAPTURE_API_KEY`, `SIGNING_KEY`, etc.) must be set once via `wrangler secret put` and persist across all subsequent deploys. You do not need to re-set secrets after each deploy.

See README steps 4-8 for secret generation commands and initial setup.

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
| `WRL_PROD_CAPTURE_API_KEY` | See [README step 4](README.md#4-configure-capture-api-key) |
| `WRL_PROD_SIGNING_KEY` | See [README step 6](README.md#6-configure-signing-key) |
| `WRL_PROD_IP_HASH_SEED` | See [README step 7](README.md#7-configure-ip-hash-seed-recommended) |
| `WRL_PROD_CORALOGIX_SEND_KEY` | See [README step 8](README.md#8-configure-coralogix-log-ingestion-required-for-production-observability) |
| `WRL_PROD_ADMIN_KEY` | See [README step 5](README.md#5-configure-admin-key) |

**Variables:**

| Name | Value |
|------|-------|
| `WRL_PROD_BASE_URL` | `<YOUR_PRODUCTION_URL>` |

**Protection rules:** Add required reviewer to gate production deploys.

See README steps 4-8 for generation commands. Worker secrets must be set separately via `wrangler secret put` -- the CD pipeline deploys code only.

The `production` GitHub environment maps to the top-level wrangler.toml config (`wrangler deploy`). The `staging` environment maps to `[env.staging]` (`wrangler deploy --env staging`).

### `staging` environment

**Secrets:**

| Name | Description |
|------|-------------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token -- see [permissions above](#cloudflare-api-token-permissions) |
| `WRL_STAGING_CAPTURE_API_KEY` | See [README step 4](README.md#4-configure-capture-api-key) |
| `WRL_STAGING_SIGNING_KEY` | See [README step 6](README.md#6-configure-signing-key) |
| `WRL_STAGING_IP_HASH_SEED` | See [README step 7](README.md#7-configure-ip-hash-seed-recommended) |
| `WRL_STAGING_CORALOGIX_SEND_KEY` | See [README step 8](README.md#8-configure-coralogix-log-ingestion-required-for-production-observability) |
| `WRL_STAGING_ADMIN_KEY` | See [README step 5](README.md#5-configure-admin-key) |

**Variables:**

| Name | Value |
|------|-------|
| `WRL_STAGING_BASE_URL` | `<YOUR_STAGING_URL>` |

**Protection rules:** Do NOT add required reviewer -- staging must deploy without approval
(the production pipeline's `staging-smoke` job polls staging before every prod deploy).

See README steps 4-8 for generation commands. Worker secrets must be set separately via `wrangler secret put` -- the CD pipeline deploys code only.
