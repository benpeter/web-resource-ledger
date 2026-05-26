# WRL Deploy Pipeline

Merging a PR to `main` deploys to **both staging and production** automatically — there is no separate manual step for prod.

## Chain

```
PR merged to main
        |
        v
.github/workflows/deploy-staging.yml  (on: push to main)
  test  -->  deploy (wrangler --env=staging)  -->  smoke (./scripts/smoke-test.sh against staging)
        |                                                                 |
        |  (staging deploy passes)                                        |
        v                                                                  |
.github/workflows/deploy-production.yml  (on: workflow_run "Deploy to Staging" completed=success)
  deploy (wrangler --env=production)  -->  smoke (./scripts/smoke-test.sh against prod)

  AND IN PARALLEL:

.github/workflows/e2e-tests.yml  (on: workflow_run "Deploy to Staging" completed=success)
```

The trigger between staging-success and prod-deploy is the `workflow_run` event, gated on
`github.event.workflow_run.conclusion == 'success'`. So if **any** job in
`deploy-staging.yml` (test, deploy, smoke) fails, prod is **not** deployed.

## Implication for Claude

After merging a PR to main:
- **Watch BOTH workflows.** `gh run watch <staging-run-id>` confirms staging green; then a
  new `Deploy to Production` run starts via `workflow_run`. Watch that too.
- **Take action if either fails.** Staging failure → diagnose + push fix to a new branch.
  Prod deploy failure (rare, but possible — D1 drift, secret mismatch, wrangler deploy quota) → check OPERATIONS.md for rollback.
- **Do NOT manually trigger `deploy-production.yml`** unless rolling back. The
  `workflow_dispatch` path on that workflow is intended for rollback only (uses `inputs.ref`).
- Total chain time is typically ~6-7 minutes wall (staging ~3.5min + prod ~1min + smoke).
  E2E tests run in parallel after staging and add another ~2-3 minutes.

## Known issue: prod smoke job skips on workflow_run

The `smoke` job in `deploy-production.yml` is **skipped** on every workflow_run trigger — the
default `needs: deploy` evaluation propagates the skip from the no-op `staging-smoke` job
through the chain even when `deploy` itself succeeded. Prod is not currently smoke-tested
post-deploy via CI. Run smoke manually after merge if you need post-deploy verification:

```bash
source ~/.secrets
SMOKE_URL=https://api.webresourceledger.com \
  SMOKE_API_KEY="$WRL_CAPTURE_API_KEY" \
  SMOKE_SKIP_CAPTURE=1 \
  ./scripts/smoke-test.sh
```

This is a workflow gap, not a deployment gap — the prod deploy itself is verified by the
wrangler exit code. Tracked as a backlog cleanup item.

## Build identity check

Production exposes commit/version/timestamp at `/health`:

```bash
curl -s https://api.webresourceledger.com/health | jq '.build'
```

Use this to confirm a deploy actually landed (not just that the workflow reported success).
