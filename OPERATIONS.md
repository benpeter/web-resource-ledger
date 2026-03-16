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
wrangler deploy
```

Run smoke test manually after:
```bash
SMOKE_URL=<YOUR_PRODUCTION_URL> SMOKE_API_KEY=<key> SMOKE_SKIP_CAPTURE=1 ./scripts/smoke-test.sh
```

---

## GitHub Environment Setup

### `production` environment

**Secrets:**

| Name | Description |
|------|-------------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with Workers deploy permission |
| `WRL_PROD_CAPTURE_API_KEY` | Bearer token for the capture API |
| `WRL_PROD_SIGNING_KEY` | Ed25519 private key (PKCS8 DER, base64) |
| `WRL_PROD_CORALOGIX_SEND_KEY` | Coralogix log ingestion key |
| `WRL_PROD_IP_HASH_SEED` | Random seed for IP hashing |

**Variables:**

| Name | Value |
|------|-------|
| `WRL_PROD_BASE_URL` | `<YOUR_PRODUCTION_URL>` |

**Protection rules:** Add required reviewer to gate production deploys.

### `staging` environment

**Secrets:**

| Name | Description |
|------|-------------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with Workers deploy permission |
| `WRL_STAGING_CAPTURE_API_KEY` | Bearer token for the staging capture API |
| `WRL_STAGING_SIGNING_KEY` | Ed25519 private key for staging |
| `WRL_STAGING_CORALOGIX_SEND_KEY` | Coralogix log ingestion key for staging |
| `WRL_STAGING_IP_HASH_SEED` | Random seed for staging IP hashing |

**Variables:**

| Name | Value |
|------|-------|
| `WRL_STAGING_BASE_URL` | `<YOUR_STAGING_URL>` |

**Protection rules:** Do NOT add required reviewer -- staging must deploy without approval
(the production pipeline's `staging-smoke` job polls staging before every prod deploy).
