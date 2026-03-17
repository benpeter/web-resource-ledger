## Task: Update deployment documentation for workflow_run trigger model

The production deploy workflow (`deploy-production.yml`) has been changed from triggering on `push: branches: [main]` to triggering via `workflow_run` after the staging workflow completes. You need to update OPERATIONS.md and CONTRIBUTING.md to reflect this change.

### Context

**Old model:** Both `deploy-staging.yml` and `deploy-production.yml` trigger on `push: branches: [main]`. They run concurrently. The production workflow's `staging-smoke` job might test stale staging code.

**New model:** Only `deploy-staging.yml` triggers on push. After it completes successfully, `deploy-production.yml` triggers automatically via `workflow_run`. The production workflow skips its `staging-smoke` job (staging already smoke-tested itself) and proceeds directly to deploy. For `workflow_dispatch` rollbacks, `staging-smoke` still runs.

Key behavioral details you must accurately document:
- A manual staging deploy via `workflow_dispatch` on `deploy-staging.yml` ALSO triggers the production workflow (via `workflow_run`). This is intentional.
- `workflow_dispatch` on `deploy-production.yml` still works for rollbacks, unchanged.
- The workflow name "Deploy to Staging" is coupled by string match to the production trigger. Renaming breaks the chain silently.

### Changes to OPERATIONS.md

**1. Add monitoring link for staging workflow**
In the Monitoring section, add the staging workflow link alongside the existing production one:
```
**GitHub Actions:**
- Production: https://github.com/benpeter/web-resource-ledger/actions/workflows/deploy-production.yml
- Staging: https://github.com/benpeter/web-resource-ledger/actions/workflows/deploy-staging.yml
```

**2. Add "Deploy to Staging" section**
Insert a new section between Monitoring and "Deploy to Production". Content:
- Automatic: every push to `main` triggers test, deploy, and smoke jobs in `deploy-staging.yml`
- After a successful staging deploy, the production pipeline triggers automatically (cross-reference the Deploy to Production section)
- Manual (GitHub UI): Go to Actions > Deploy to Staging > Run workflow. This deploys HEAD of `main` and also triggers the production pipeline on completion
- Manual (CLI): `wrangler deploy --env staging` for direct staging deploy (does NOT trigger the production pipeline)
- Note: `deploy-staging.yml` has no inputs — `workflow_dispatch` deploys HEAD of the selected branch

**3. Rewrite "Deploy to Production" section**
Replace the current trigger description. New content:
- The production pipeline triggers automatically after `deploy-staging.yml` completes successfully — NOT on push to `main`
- Pipeline steps: `deploy` (deploys to production) -> `smoke` (verifies production health)
- Note that `staging-smoke` is skipped for automatic triggers because staging already passed its own smoke test
- For `workflow_dispatch` (rollback) triggers, `staging-smoke` runs to confirm staging is healthy before deploying
- Keep the manual trigger instructions (Actions > Deploy to Production > Run workflow) as-is

**4. Update rollback section -- Option A**
Line 55 currently says "the pipeline runs staging-smoke, deploys the old SHA, runs smoke". Update to clarify:
- `workflow_dispatch` rollbacks run `staging-smoke` (tests whatever is currently on staging — not the rollback SHA), then deploy the old SHA, then run production smoke
- This path bypasses the staging-first guarantee — it deploys directly to production without first deploying to staging
- Also update the "rollback is temporary" warning: the next push to `main` triggers the full staging→production chain (not just a production deploy as before)

**5. Update staging environment protection rules note**
Lines 180-181 currently say: "Do NOT add required reviewer -- staging must deploy without approval (the production pipeline's `staging-smoke` job polls staging before every prod deploy)."
Replace with: "Do NOT add required reviewer -- staging must deploy without approval. The production pipeline triggers automatically after staging completes (`workflow_run`). Adding a reviewer gate to staging blocks the entire deploy chain."

### Changes to CONTRIBUTING.md

**Update "Staging & Deployment" section (around lines 39-44)**
Currently only describes the staging workflow. Add that after staging completes successfully, the production workflow triggers automatically. The full pipeline is:
merge to `main` -> staging test/deploy/smoke (`deploy-staging.yml`) -> production deploy/smoke (`deploy-production.yml`)

Use consistent framing across both docs:
- Actions path = staging + production chain
- CLI path (`wrangler deploy --env staging`) = staging only, no production chain

Keep the existing manual deploy instructions, secret setup, and smoke test sections unchanged.

### What NOT to do

- Do NOT modify any workflow YAML files
- Do NOT change README.md
- Do NOT restructure sections beyond what is specified above
- Do NOT add excessive detail about GitHub Actions internals (keep it operator-focused)
- Do NOT change the Secret Surfaces, GitHub Environment Setup, or other unrelated sections

### Deliverables

- Updated `OPERATIONS.md`
- Updated `CONTRIBUTING.md`

### Success criteria

- OPERATIONS.md has a "Deploy to Staging" section documenting automatic and manual staging deploys
- "Deploy to Production" section accurately describes the `workflow_run` trigger model
- Rollback documentation clarifies staging-smoke behavior during `workflow_dispatch` rollbacks
- Staging environment protection rules note explains the `workflow_run` dependency
- CONTRIBUTING.md describes the full two-stage pipeline topology
- `workflow_dispatch` on `deploy-staging.yml` is documented for ad-hoc staging deploys
- Monitoring section links to both workflow runs pages
- Consistent framing: Actions = chain, CLI = staging only

Working directory: /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/staging-deploy-race-condition

When you finish your task, mark it completed with TaskUpdate and send a message to the team lead with:
- File paths with change scope and line counts
- 1-2 sentence summary of what was produced
