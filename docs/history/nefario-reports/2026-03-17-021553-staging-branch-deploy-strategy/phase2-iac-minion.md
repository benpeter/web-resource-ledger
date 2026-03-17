## Domain Plan Contribution: iac-minion

### Current State Analysis

Four workflows currently trigger on `push: branches: [main]`:

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ci.yml` | push main + PR to main | Tests, lint, integration tests |
| `deploy-staging.yml` | push main | Test -> deploy staging -> smoke staging |
| `deploy-production.yml` | push main | Smoke staging -> deploy prod (approval gate) -> smoke prod |
| `vibe-coded-badge.yml` | push main | Update badge in README |

The production workflow has a clever safety net: its `staging-smoke` job runs the smoke test against the *already-deployed* staging environment before deploying to production. This works because both workflows trigger on the same push event, and `deploy-staging.yml` deploys first (it has fewer jobs in its chain). However, this is a race condition -- there is no formal dependency between the two workflows. If staging deploy is slow or fails, the production workflow's `staging-smoke` could pass against *stale* staging code.

### Recommendations

**Do not introduce a `staging` branch. Keep the current single-branch model.**

Here is the detailed reasoning:

#### 1. The staging-branch model solves a problem this project does not have

A staging branch is valuable when:
- Multiple developers need to batch and validate changes before production
- There is a QA team that tests on staging independently
- Regulatory gates require staging sign-off separate from code review

None of these apply. This is a solo developer project. The current flow (push to main -> deploy staging -> smoke -> deploy prod with approval gate) already provides the exact safety guarantees a staging branch would, with less ceremony.

#### 2. Concrete workflow changes required (if proceeding anyway)

For completeness, here is what would need to change:

**`ci.yml`:**
```yaml
on:
  push:
    branches: [main, staging]
  pull_request:
    branches: [main, staging]
```

**`deploy-staging.yml`:**
```yaml
on:
  push:
    branches: [staging]   # Changed from main
  workflow_dispatch:
```

**`deploy-production.yml`:**
```yaml
on:
  push:
    branches: [main]      # Unchanged
  workflow_dispatch:
    inputs:
      ref:
        description: 'Git ref to deploy'
        required: false
        type: string
```

The `staging-smoke` job in `deploy-production.yml` would remain -- it still validates staging is healthy before prod deploy. But it becomes a weaker guarantee: staging now runs *different code* than what is about to deploy to production. The smoke test confirms staging infrastructure is alive, not that the production-bound code works on staging. This is strictly worse than the current model where staging runs the *same commit* being deployed to prod.

**`vibe-coded-badge.yml`:** Stays on `main` only (badges reflect production state).

**New requirement -- branch sync workflow or merge discipline:**
You would need either:
- A policy to always merge `staging` into `main` (fast-forward or merge commit)
- Or a workflow that auto-creates a PR from staging to main after staging smoke passes

**GitHub branch protection:**
- `staging` branch: require PR, require CI passing, no approval required
- `main` branch: require PR from staging (or direct push for hotfixes), require CI passing

#### 3. Failure modes of the staging-branch model

**Branch divergence:** The most dangerous failure mode. If `staging` accumulates commits that are not merged to `main`, the two environments drift. When they eventually merge, you get a large, hard-to-validate diff. For a solo developer, this creates cognitive overhead tracking what is where.

**Hotfix bypass dilemma:** When production is broken, you need to fix it fast. With a staging branch:
- Option A: Push fix to staging, wait for staging deploy + smoke, merge to main, wait for prod deploy. Slow.
- Option B: Push directly to main, bypassing staging. Now main has a commit staging does not. Divergence begins.
- Option C: Push to both branches simultaneously. Error-prone, easy to forget one.

The current model handles hotfixes cleanly: push to main, staging deploys first, smoke passes, prod deploys. One action, one path.

**Merge conflicts:** Even with one developer, rebasing staging onto main (or vice versa) after a hotfix creates unnecessary toil. With the current model, there is only one branch and zero merge conflicts.

**Stale staging:** If you push to staging but do not merge to main for days, staging runs code that production never will. Any smoke tests passing on staging are misleading -- they validate a state that may never reach production.

**CI duplication:** CI must now run on both branches. The code-change detection in `ci.yml` uses `github.event.pull_request.base.sha || github.event.before` which works for both, but you now have twice the CI runs for effectively the same code (once on staging push, once on main merge).

#### 4. What actually improves safety for this project

Instead of a staging branch, the current model can be tightened:

**A. Fix the race condition between staging deploy and production staging-smoke.** The production workflow's `staging-smoke` job has no formal dependency on the staging deploy workflow completing. Options:
- Use `workflow_run` trigger: production workflow triggers *after* staging workflow completes successfully, instead of both triggering on push.
- Or add an explicit step in `staging-smoke` that polls for the staging deployment matching the current commit SHA (check the `/health` endpoint for a version field).

**B. Add a version/commit SHA to the `/health` endpoint.** This lets smoke tests verify they are testing the *correct* deployment, not a stale one. The `staging-smoke` job in the production workflow can then assert the deployed SHA matches the commit being pushed.

**C. Keep the reviewer gate on the `production` GitHub environment.** This already provides the "pause and think" moment that a staging branch is often used to create.

### Proposed Tasks

If the advisory outcome is to keep the current model (recommended):

1. **Fix the staging-production race condition**
   - Change `deploy-production.yml` to use `workflow_run` trigger on `deploy-staging.yml` completion, OR add SHA verification to the staging-smoke step
   - Deliverable: Updated `deploy-production.yml`
   - Dependencies: May require adding commit SHA to the `/health` endpoint response

2. **Add commit SHA to `/health` response**
   - Include the deployed git SHA in the health check response so smoke tests can verify correct deployment
   - Deliverable: Code change in the health endpoint, updated smoke test to optionally verify SHA
   - Dependencies: None

If the advisory outcome is to proceed with a staging branch (not recommended):

1. **Update workflow triggers**
   - Modify all four workflows as described above
   - Deliverable: Updated workflow files
   - Dependencies: None

2. **Create branch protection rules**
   - Configure staging and main branch protection in GitHub
   - Deliverable: GitHub settings (manual or via `gh api`)
   - Dependencies: Staging branch must exist

3. **Create staging-to-main promotion workflow**
   - Auto-create PR from staging to main after staging smoke passes
   - Deliverable: New workflow file
   - Dependencies: Workflows updated

4. **Update OPERATIONS.md**
   - Document new branch model, merge procedures, hotfix procedures
   - Deliverable: Updated OPERATIONS.md
   - Dependencies: All workflow changes complete

5. **Update rollback procedures**
   - Rollback now has two surfaces (staging and production) with potentially different code
   - Deliverable: Updated rollback section in OPERATIONS.md
   - Dependencies: New model documented

### Risks and Concerns

**Risk: The staging-branch model adds complexity without proportional safety for a solo developer project.** The current model already deploys to staging before production on every push. A staging branch adds branch management overhead, merge discipline requirements, and introduces failure modes (divergence, stale staging, hotfix bypass) that do not exist today. This violates YAGNI and KISS.

**Risk: The `staging-smoke` job in `deploy-production.yml` has a race condition today.** Both workflows trigger simultaneously on push to main. If the staging deploy is slow, the production workflow's smoke test runs against stale staging code. This is the real safety gap to fix, and a staging branch does not fix it -- it makes it worse by design (staging and production would always run different code).

**Risk: `workflow_dispatch` rollback path becomes complicated with a staging branch.** Today, you can roll back production by dispatching with a specific SHA. With a staging branch, a rollback SHA on main may not exist on staging, making the `staging-smoke` gate meaningless for rollback deploys. The `ref` input would need special handling.

**Concern: The vibe-coded-badge workflow has a 100-minute timeout.** This is unrelated to the branch model question but is notably long for a badge update. Worth a separate review.

### Additional Agents Needed

None. The current team is sufficient for this advisory. The question is fundamentally about CI/CD workflow design and git branching strategy, which falls squarely within infrastructure-as-code scope. If the health endpoint change (adding commit SHA) is pursued, that touches application code, but the change is trivial enough that it does not require a separate specialist.
