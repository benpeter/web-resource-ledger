## Task: Create the production CD pipeline for WRL

You are implementing the production deployment workflow for a Cloudflare Workers project (Web Resource Ledger). The staging environment and its workflow already exist and work. Your job is to create the production counterpart.

### Context

**Project**: Cloudflare Worker deployed via `wrangler-action`. The Worker processes web captures and stores them in R2/KV.

**Existing staging workflow**: `.github/workflows/deploy-staging.yml` -- triggers on push to main, runs tests, deploys to staging with `--env staging`, runs smoke tests. This is the reference implementation. Match its patterns (SHA-pinned actions, permissions, timeout-minutes, secret naming).

**Existing smoke test**: `scripts/smoke-test.sh` -- environment-agnostic, takes `SMOKE_URL` and `SMOKE_API_KEY` env vars, supports `SMOKE_SKIP_CAPTURE=1`. No changes needed to this script.

**wrangler.toml**: Top-level config IS production (Worker name `wrl`). `[env.staging]` overrides for staging. The production deploy does NOT use `--env` or `environment:` in the wrangler action -- just deploy with default config.

### What to build

**File 1: `.github/workflows/deploy-production.yml`**

Triggers:
```yaml
on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      ref:
        description: 'Git ref to deploy (tag, branch, or SHA). Defaults to triggering ref. Used for rollbacks.'
        required: false
        type: string
```

Jobs (3 sequential):

1. **`staging-smoke`** -- Validate that staging is healthy before allowing production deploy.
   - `timeout-minutes: 5`
   - `environment: staging` (to access staging secrets/vars)
   - Steps: checkout, run `scripts/smoke-test.sh`
   - Env: `SMOKE_URL: ${{ vars.WRL_STAGING_BASE_URL }}`, `SMOKE_API_KEY: ${{ secrets.WRL_STAGING_CAPTURE_API_KEY }}`
   - This does NOT deploy to staging. It just confirms staging is green.

2. **`deploy`** (`needs: staging-smoke`) -- Deploy to production via `cloudflare/wrangler-action`.
   - `environment: production` -- triggers GitHub's environment protection rules
   - `timeout-minutes: 5`
   - Steps: checkout (using `${{ inputs.ref || github.sha }}`), setup-node, npm ci, wrangler deploy
   - Use SAME SHA-pinned actions as deploy-staging.yml:
     - `actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683` (v4.2.2)
     - `actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020` (v4.4.0)
     - `cloudflare/wrangler-action@da0e0edf58b41e3cd8317c1a9dbb2f0cd2791a54` (v3.14.0)
   - DO NOT pass `environment:` to wrangler-action (top-level wrangler.toml = production)
   - Secrets:
     ```yaml
     secrets: |
       CAPTURE_API_KEY
       SIGNING_KEY
       CORALOGIX_SEND_KEY
       IP_HASH_SEED
     env:
       CAPTURE_API_KEY: ${{ secrets.WRL_PROD_CAPTURE_API_KEY }}
       SIGNING_KEY: ${{ secrets.WRL_PROD_SIGNING_KEY }}
       CORALOGIX_SEND_KEY: ${{ secrets.WRL_PROD_CORALOGIX_SEND_KEY }}
       IP_HASH_SEED: ${{ secrets.WRL_PROD_IP_HASH_SEED }}
     ```
   - The `apiToken` uses `${{ secrets.CLOUDFLARE_API_TOKEN }}` from the production environment

3. **`smoke`** (`needs: deploy`) -- Run smoke tests against production.
   - `timeout-minutes: 5`
   - `environment: production`
   - Steps: checkout, run smoke-test.sh
   - Env: `SMOKE_URL: ${{ vars.WRL_PROD_BASE_URL }}`, `SMOKE_API_KEY: ${{ secrets.WRL_PROD_CAPTURE_API_KEY }}`, `SMOKE_SKIP_CAPTURE: "1"`

Workflow-level settings:
- `permissions: contents: read, deployments: write`
- Comment at top: `# Rollback: see OPERATIONS.md`

**File 2: `OPERATIONS.md`** (repo root)

A lean operations document for a single developer. Write for "tired Ben at 2am" -- exact commands, not explanations. Target 80-120 lines.

Structure:
- Environments table (production + staging, URLs as placeholders with angle brackets like `<YOUR_PRODUCTION_URL>` to make the gap explicit)
- Monitoring (health endpoint, Coralogix, GitHub Actions)
- Deploy to Production (normal flow described briefly, manual trigger steps)
- Rollback section with:
  - Decision tree (deploy failed? smoke failed? something else wrong?)
  - Rolling back via workflow_dispatch (preferred, step-by-step)
  - Rolling back via wrangler CLI (emergency, bypasses CD)
  - IMPORTANT: Secrets are NOT rolled back with code -- document explicitly
  - After a rollback: include a sentence that the rollback is temporary -- the next push to main re-deploys the broken commit unless a revert has been merged to main first
- Manual Deploy (emergency bypass section)
- GitHub Environment Setup (list all secrets and vars, protection rules)

**File 3: Update `README.md`** -- Add a one-line reference to OPERATIONS.md in an appropriate section.

### Advisories from architecture review (incorporate these)

1. [security] Ensure `WRL_PROD_*` naming is used consistently across workflow AND OPERATIONS.md -- a divergence would break the first deploy.
2. [security] Use `inputs.ref || github.sha` pattern for the workflow_dispatch ref input in checkout.
3. [ux-strategy] In the "After a rollback" section, explicitly state that the rollback is temporary and the next push to main re-deploys the bad commit unless a revert is merged first.
4. [user-docs] Use angle-bracket placeholders like `<YOUR_PRODUCTION_URL>` instead of fake URLs that look real.
5. [lucy] The staging environment GitHub configuration should NOT have required reviewer protection rules (or the staging-smoke job in the production workflow would block on staging approval). Note this assumption in OPERATIONS.md's GitHub Environment Setup section.

### What NOT to do

- Do NOT modify `scripts/smoke-test.sh`
- Do NOT modify `wrangler.toml`
- Do NOT add `[env.production]` to wrangler.toml
- Do NOT add tag triggers
- Do NOT add automatic rollback logic
- Do NOT add version checks, response time assertions, or other smoke test enhancements
- Do NOT add wait timers to environment protection config notes
- Do NOT create separate rollback or health-check workflows
- Do NOT add Slack/email notification steps

### Reference files to read

Read these files to understand the existing patterns:
- `.github/workflows/deploy-staging.yml` -- the staging workflow to mirror
- `scripts/smoke-test.sh` -- the smoke test script (do not modify)
- `wrangler.toml` -- deployment configuration (do not modify)
- `README.md` -- to add the OPERATIONS.md link

### Deliverables
1. `.github/workflows/deploy-production.yml` (~80-100 lines YAML)
2. `OPERATIONS.md` (80-120 lines)
3. `README.md` (one-line addition linking to OPERATIONS.md)

When you finish your task, report:
- File paths with change scope and line counts
- 1-2 sentence summary of what was produced
