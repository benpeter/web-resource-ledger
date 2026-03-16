## Domain Plan Contribution: iac-minion

### Recommendations

#### Decision 1: Trigger Strategy -- Both tag push AND workflow_dispatch

Use **both** triggers. Tag push (`v*`) is the happy path for regular releases: tag a commit, production deploy kicks off automatically. `workflow_dispatch` is the escape hatch for rollbacks, emergency deploys, and re-deploys of an existing tag (e.g., after a secret rotation that doesn't change code).

For `workflow_dispatch`, accept an optional `ref` input that defaults to the triggering branch/tag. This lets an operator type in a previous tag (e.g., `v0.3.1`) to redeploy it without needing to push a new tag.

```yaml
on:
  push:
    tags: ['v*']
  workflow_dispatch:
    inputs:
      ref:
        description: 'Git ref to deploy (tag, branch, or SHA). Defaults to current ref.'
        required: false
        type: string
```

When triggered by tag push, `github.ref` is `refs/tags/v*` -- use that directly. When triggered by `workflow_dispatch` with a `ref` input, checkout that ref. This single mechanism handles both regular releases and rollbacks elegantly.

#### Decision 2: Staging Gate -- Call the staging smoke test as a prerequisite job

**Do not use `workflow_run`** -- it creates a separate workflow run that's hard to observe and reason about. Instead, make the production workflow self-contained with an explicit staging validation gate:

1. **Job 1: `staging-smoke`** -- Run the existing smoke test against staging. This validates that the code currently in staging (which should match what's about to go to production, since staging deploys on every push to main) is healthy. This job does NOT deploy to staging -- it just validates.
2. **Job 2: `deploy`** (`needs: staging-smoke`) -- Deploy to production. Uses the `production` environment, which triggers GitHub's environment protection rules (approval required).
3. **Job 3: `smoke`** (`needs: deploy`) -- Run smoke tests against production.

This approach is simpler than cross-workflow coordination and keeps the entire deploy pipeline visible as a single workflow run. If staging smoke fails, the workflow fails before reaching the approval gate -- no human attention wasted.

**Important nuance**: The staging smoke job validates staging health, not staging code parity with the tag being deployed. For a solo project this is acceptable. The staging environment is deployed on every push to main (via `deploy-staging.yml`), and tags are created from main, so staging always runs the same code (or newer) than any tag being deployed. Document this assumption.

#### Decision 3: Separate CLOUDFLARE_API_TOKEN -- Yes, separate tokens per environment

Use **separate tokens** scoped to each environment. This is a fundamental security principle:

- `staging` environment: `CLOUDFLARE_API_TOKEN` scoped to staging Worker
- `production` environment: `CLOUDFLARE_API_TOKEN` scoped to production Worker

Cloudflare API tokens support resource-level scoping -- create a token per Worker/zone combination. This limits blast radius: a leaked staging token cannot modify production. Store each in its respective GitHub environment's secrets.

Both environments also need their own sets of Worker secrets (`CAPTURE_API_KEY`, `SIGNING_KEY`, `CORALOGIX_SEND_KEY`, `IP_HASH_SEED`). The staging workflow already follows this pattern with `WRL_STAGING_*` prefixed secrets. Production secrets should follow suit: `WRL_PROD_CAPTURE_API_KEY`, etc.

#### Decision 4: GitHub Environment Protection Rules

Configure the `production` environment with:

1. **Required reviewers**: Ben (or the repo owner) must approve before deploy proceeds. Since this is a solo project, one reviewer is sufficient. This creates a human gate between "staging passed" and "production deploys."
2. **Deployment branches**: Restrict to tags matching `v*` and the `main` branch. This prevents accidental deploys from feature branches via `workflow_dispatch`.
3. **Wait timer**: No wait timer. For a solo project, the approval gate is sufficient. Wait timers add latency without proportional safety for a single-operator setup.

GitHub will show the approval request in the Actions UI when the `deploy` job (which uses `environment: production`) is reached, after the staging smoke tests pass.

#### Decision 5: Rollback Mechanism -- Redeploy a previous tag via workflow_dispatch

**Redeploy a previous tag** rather than using `wrangler rollback`. Reasons:

1. **`wrangler rollback`** rolls back to the immediately previous version and only works once (you can't roll back to N-2). It's also not idempotent.
2. **Redeploying a tag** is idempotent, auditable (the tag is the record), and can target any previous version. The `workflow_dispatch` with a `ref` input already enables this.
3. The deploy workflow itself becomes the rollback procedure: trigger `workflow_dispatch`, enter the previous tag (e.g., `v0.3.1`), approve, done.

Rollback documentation should be a short section in the repo (e.g., `docs/runbooks/rollback.md`) with the exact steps. No separate rollback workflow needed.

**One caveat**: Worker secrets are not versioned. If a rollback is needed because of a secret change (not code), the operator must also revert the secret via `wrangler secret put`. Document this.

#### Decision 6: wrangler.toml -- Keep top-level as production, NO explicit [env.production]

The current `wrangler.toml` uses the top-level configuration as production and `[env.staging]` as the staging override. **Keep this pattern.** Reasons:

1. **It already works.** The staging workflow uses `environment: staging` in the wrangler action. Production deploys omit the environment flag and get top-level config. No change needed.
2. Adding `[env.production]` would require changing the deploy command to use `--env production`, which changes the Worker name to `wrl-production` (Wrangler appends the env name). That's a breaking change to the existing production Worker.
3. The Wrangler convention is that top-level = production. The codebase already follows this convention.

The deploy step in the production workflow should NOT pass an `environment` parameter to `wrangler-action` -- just let it use the top-level config.

### Proposed Tasks

#### Task 1: Create `deploy-production.yml` workflow

**Deliverable**: `.github/workflows/deploy-production.yml`

**Structure**:
```
Jobs:
  staging-smoke (runs smoke-test.sh against staging URL)
    -> deploy (environment: production, needs: staging-smoke)
      -> smoke (runs smoke-test.sh against production URL)
```

**Dependencies**: Existing `scripts/smoke-test.sh` (already written and proven).

**Key implementation details**:
- Pin all actions to full commit SHA (matching existing workflow pattern)
- Use `cloudflare/wrangler-action` at the same SHA as `deploy-staging.yml`
- The `deploy` job uses `environment: production` (triggers protection rules)
- Production smoke test uses `SMOKE_SKIP_CAPTURE: 1` for the initial deploy (see risks below), then remove once production secrets are confirmed
- Set `timeout-minutes` on all jobs (5 for smoke, 5 for deploy)
- Production secrets follow the `WRL_PROD_*` naming pattern

**Estimated size**: ~80 lines YAML

#### Task 2: Configure GitHub environments via `gh` CLI or manual setup

**Deliverable**: Documentation of required GitHub environment configuration (cannot be fully automated via workflow files alone -- environment protection rules require GitHub API or UI configuration).

**Steps**:
1. Create `production` environment (if not exists)
2. Add required reviewer (repo owner)
3. Set deployment branches to `v*` tags and `main`
4. Add secrets: `CLOUDFLARE_API_TOKEN`, `WRL_PROD_CAPTURE_API_KEY`, `WRL_PROD_SIGNING_KEY`, `WRL_PROD_CORALOGIX_SEND_KEY`, `WRL_PROD_IP_HASH_SEED`
5. Add variables: `WRL_PROD_BASE_URL` (production Worker URL)

**Dependencies**: Cloudflare API token creation (scoped to production Worker).

#### Task 3: Create rollback runbook

**Deliverable**: `docs/runbooks/rollback.md`

**Content**:
- How to identify the last known-good tag
- How to trigger rollback via `workflow_dispatch`
- How to verify rollback succeeded (smoke test runs automatically)
- How to handle secret-related rollbacks (manual `wrangler secret put`)
- How to check Cloudflare dashboard for Worker version confirmation

**Dependencies**: Task 1 (the workflow must exist for the runbook to reference it).

#### Task 4: Parameterize smoke test for production use

**Deliverable**: Modifications to `scripts/smoke-test.sh` (if needed).

**Analysis**: The existing smoke test is already environment-agnostic -- it takes `SMOKE_URL` and `SMOKE_API_KEY` as env vars and has `SMOKE_SKIP_CAPTURE` for skipping the capture round-trip. No changes needed to the script itself. The production workflow just passes different env var values.

This is a "verify and document" task, not an implementation task.

### Risks and Concerns

#### Risk 1: Production smoke test capture round-trip cost (LOW)

The smoke test creates a real capture against `https://example.com`. In production, this consumes a browser session and creates real data. This is acceptable for a smoke test (it's a single capture), but:
- The capture will be stored permanently in the production R2 bucket
- Each deploy creates one test capture

**Mitigation**: Accept this as the cost of confidence. One small WACZ per deploy is negligible. The `SMOKE_SKIP_CAPTURE=1` option exists if this becomes a concern, but a full round-trip test is more valuable than skipping it.

#### Risk 2: Tag-staging code parity assumption (LOW)

The staging gate validates staging health but doesn't strictly verify that staging runs the exact code being tagged for production. If someone pushes a tag from a commit that's behind `main` (i.e., main has newer commits), staging might have newer code than what's being deployed to production.

**Mitigation**: For a solo project with linear history on main, this is extremely unlikely. Tags should always be created from the HEAD of main. Document this convention. A strict check (comparing the tag's SHA against the last staging deploy) is over-engineering for the current project size.

#### Risk 3: Secrets not set in production environment (MEDIUM)

The first production deploy will fail if the GitHub environment secrets aren't configured beforehand. Unlike code, secrets must be set manually.

**Mitigation**: Task 2 explicitly covers this. Add a pre-flight check in the workflow that fails fast with a clear error if secrets are missing (the wrangler action will fail anyway, but a clear error message saves debugging time).

#### Risk 4: Cloudflare API token scope (MEDIUM)

If the current `CLOUDFLARE_API_TOKEN` is shared between staging and production (or is an overly broad "edit all Workers" token), a compromise of the staging token could affect production.

**Mitigation**: Task 2 requires creating a production-scoped token. Verify the staging token is also scoped. Document the token scoping in the runbook.

#### Risk 5: No automatic rollback on failed production smoke (LOW)

If the production smoke test fails after deploy, the workflow fails but the bad version remains deployed. There is no automatic rollback.

**Mitigation**: This is intentional for an MVP CD pipeline. Automatic rollback sounds appealing but introduces its own risks (rolling back to a version with a different problem, cascading rollbacks, rollback of secret-dependent changes). For a solo project, a failed smoke test triggers a Slack/email notification (GitHub default), and the operator manually triggers rollback via `workflow_dispatch`. Add automatic rollback to the backlog as a `[consider]` item with the trigger "when deploy frequency exceeds 1/day or team size > 1."

### Additional Agents Needed

None. The workflow design, environment configuration, smoke testing, and rollback procedures are squarely within infrastructure/CD domain expertise. The existing smoke test script was well-designed and is reusable without modification. The security considerations (token scoping, secret isolation) are standard CD pipeline concerns that don't require a dedicated security review for this scope.

If the scope later expands to include Cloudflare-specific deployment strategies (e.g., gradual rollouts using Cloudflare's traffic splitting), consulting the **edge-minion** would be appropriate. But that's explicitly out of scope per the task definition.
