## Delegation Plan

**Team name**: staging-deploy-race-condition
**Description**: Fix the race condition between deploy-staging.yml and deploy-production.yml (#86) by switching the production workflow trigger from `push` to `workflow_run`, guaranteeing staging completes before production proceeds. Update OPERATIONS.md and CONTRIBUTING.md to document the new pipeline topology.

### Task 1: Modify deploy-production.yml to use workflow_run trigger
- **Agent**: iac-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: none
- **Approval gate**: yes
- **Gate reason**: This changes the production deployment trigger -- the most critical CI/CD control in the project. Incorrect `if` conditions or ref resolution would deploy untested code to production. High blast radius (all downstream docs tasks depend on the final workflow shape) and hard to reverse (a broken trigger could cause a missed deploy or a deploy-on-failure).
- **Gate rationale**: |
    Chosen: `workflow_run` trigger with `conclusion == 'success'` guard and conditional `staging-smoke` job
    Over: (1) SHA-polling approach where production waits for staging to deploy the same commit SHA via `/health` endpoint -- rejected because it adds a polling loop, requires `/health` code changes (out of scope), and solves the symptom not the cause; (2) keeping `push` trigger with a `sleep`/delay -- rejected because timing-based solutions are inherently fragile
    Why: `workflow_run` is a structural platform-level fix with zero application code changes, no timing windows, and no new failure modes
- **Prompt**: |
    ## Task: Fix deploy-production.yml race condition with workflow_run trigger

    You are modifying `.github/workflows/deploy-production.yml` to fix a race condition where the production workflow's `staging-smoke` job can run before the staging deploy completes, testing stale code (Issue #86).

    ### Current state

    Both `deploy-staging.yml` and `deploy-production.yml` trigger on `push: branches: [main]`. They run concurrently. The production workflow's `staging-smoke` job may execute before staging has deployed the new code.

    ### What to do

    Replace the `push: branches: [main]` trigger in `deploy-production.yml` with a `workflow_run` trigger that fires after `deploy-staging.yml` completes. Keep `workflow_dispatch` for rollbacks.

    Specific changes to `.github/workflows/deploy-production.yml`:

    1. **Replace trigger block:**
       ```yaml
       on:
         workflow_run:
           workflows: ["Deploy to Staging"]
           types: [completed]
           branches: [main]
         workflow_dispatch:
           inputs:
             ref:
               description: 'Git ref to deploy (tag, branch, or SHA). Defaults to triggering ref. Used for rollbacks.'
               required: false
               type: string
       ```
       CRITICAL: The workflow name string "Deploy to Staging" must match the `name:` field in `deploy-staging.yml` exactly.

    2. **Add concurrency group** (top-level, after `permissions`):
       ```yaml
       concurrency:
         group: deploy-production
         cancel-in-progress: false
       ```
       `cancel-in-progress: false` ensures an in-flight deploy finishes rather than being cancelled. Newer deploys queue.

    3. **Make staging-smoke conditional on trigger type:**
       The `staging-smoke` job should only run for `workflow_dispatch` triggers (rollback scenario). For `workflow_run` triggers, staging already ran its own smoke test.
       ```yaml
       staging-smoke:
         if: github.event_name == 'workflow_dispatch'
       ```

    4. **Update the deploy job's `if` condition:**
       The deploy job must handle both trigger types and the fact that `staging-smoke` may be skipped:
       ```yaml
       deploy:
         needs: staging-smoke
         if: |
           always() && (
             (github.event_name == 'workflow_run' && github.event.workflow_run.conclusion == 'success') ||
             (github.event_name == 'workflow_dispatch' && needs.staging-smoke.result == 'success')
           )
       ```
       CRITICAL: Without `always()`, a skipped `staging-smoke` job causes `deploy` to also be skipped. Without the `conclusion == 'success'` check, staging failures trigger production deploys.

    5. **Fix the checkout ref in the deploy job:**
       ```yaml
       ref: ${{ inputs.ref || github.event.workflow_run.head_sha || github.sha }}
       ```
       CRITICAL: Use `github.event.workflow_run.head_sha`, NOT `github.sha`. In a `workflow_run` context, `github.sha` points to the default branch HEAD at trigger time, which may have advanced if another push landed. `head_sha` is the commit that triggered the staging workflow.

    6. **Add a traceability logging step** at the start of the deploy job (before checkout):
       ```yaml
       - name: Log deploy context
         run: |
           echo "Trigger: ${{ github.event_name }}"
           echo "Deploy ref: ${{ inputs.ref || github.event.workflow_run.head_sha || github.sha }}"
           echo "Staging run: ${{ github.event.workflow_run.html_url || 'N/A (manual dispatch)' }}"
       ```

    7. **Add a comment** near the `workflow_run` trigger noting the workflow name coupling:
       ```yaml
       # COUPLING: "Deploy to Staging" must match the `name:` field in deploy-staging.yml.
       # Renaming that workflow without updating this reference breaks the production trigger silently.
       ```

    8. **Keep the existing comment** on line 1: `# Rollback: see OPERATIONS.md`

    ### What NOT to do

    - Do NOT modify `deploy-staging.yml` -- it already has `workflow_dispatch` and the correct `name:` field
    - Do NOT change the `smoke` job (post-deploy production smoke) -- it stays as-is
    - Do NOT add any `/health` endpoint changes or SHA verification logic
    - Do NOT change permissions or environment references
    - Do NOT change action versions or pin hashes

    ### Deliverables

    Updated `.github/workflows/deploy-production.yml`

    ### Success criteria

    - The workflow has `workflow_run` and `workflow_dispatch` triggers (no `push` trigger)
    - `workflow_run` fires only on the "Deploy to Staging" workflow
    - Deploy job only proceeds when staging completed successfully
    - Deploy job checks out the correct SHA via `head_sha` for `workflow_run` triggers
    - `staging-smoke` job is skipped for `workflow_run` triggers, runs for `workflow_dispatch`
    - Concurrency group prevents overlapping production deploys
    - Traceability step logs trigger type, deploy ref, and staging run URL
- **Deliverables**: Updated `.github/workflows/deploy-production.yml`
- **Success criteria**: Workflow has correct triggers, guards, ref resolution, conditional jobs, concurrency group, and traceability logging

### Task 2: Update OPERATIONS.md and CONTRIBUTING.md
- **Agent**: user-docs-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |
    ## Task: Update deployment documentation for workflow_run trigger model

    The production deploy workflow (`deploy-production.yml`) has been changed from triggering on `push: branches: [main]` to triggering via `workflow_run` after the staging workflow completes. You need to update OPERATIONS.md and CONTRIBUTING.md to reflect this change.

    ### Context

    **Old model:** Both `deploy-staging.yml` and `deploy-production.yml` trigger on `push: branches: [main]`. They run concurrently. The production workflow's `staging-smoke` job might test stale staging code.

    **New model:** Only `deploy-staging.yml` triggers on push. After it completes successfully, `deploy-production.yml` triggers automatically via `workflow_run`. The production workflow skips its `staging-smoke` job (staging already smoke-tested itself) and proceeds directly to deploy. For `workflow_dispatch` rollbacks, `staging-smoke` still runs.

    Key behavioral details you must accurately document:
    - A manual staging deploy via `workflow_dispatch` on `deploy-staging.yml` ALSO triggers the production workflow (via `workflow_run`). This is intentional.
    - `workflow_dispatch` on `deploy-production.yml` still works for rollbacks, unchanged.
    - The production workflow has a concurrency group (`deploy-production`, cancel-in-progress: false) -- concurrent production deploys queue rather than cancel.
    - The workflow name "Deploy to Staging" is coupled by string match to the production trigger. Renaming breaks the chain silently.

    ### Changes to OPERATIONS.md

    **1. Add monitoring link for staging workflow**
    In the Monitoring section (around line 21), add the staging workflow link alongside the existing production one:
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
    - Manual (CLI): `wrangler deploy --env staging` for emergency bypass (does NOT trigger production pipeline)
    - Note: `deploy-staging.yml` has no inputs -- `workflow_dispatch` deploys HEAD of the selected branch

    **3. Rewrite "Deploy to Production" section**
    Replace the current trigger description. New content:
    - The production pipeline triggers automatically after `deploy-staging.yml` completes successfully -- NOT on push to `main`
    - Pipeline steps: `deploy` (deploys to production) -> `smoke` (verifies production health)
    - Note that `staging-smoke` is skipped for automatic triggers because staging already passed its own smoke test
    - For `workflow_dispatch` (rollback) triggers, `staging-smoke` runs to confirm staging is healthy before deploying
    - Keep the manual trigger instructions (Actions > Deploy to Production > Run workflow) as-is

    **4. Update rollback section -- Option A**
    Line 55 currently says "the pipeline runs staging-smoke, deploys the old SHA, runs smoke". Update to clarify:
    - `workflow_dispatch` rollbacks run `staging-smoke` (tests whatever is currently on staging -- not the rollback SHA), then deploy the old SHA, then run production smoke
    - This path bypasses the staging-first guarantee -- it deploys directly to production without first deploying to staging

    **5. Update staging environment protection rules note**
    Lines 180-181 currently say: "Do NOT add required reviewer -- staging must deploy without approval (the production pipeline's `staging-smoke` job polls staging before every prod deploy)."
    Replace with: "Do NOT add required reviewer -- staging must deploy without approval. The production pipeline triggers automatically after staging completes (`workflow_run`). Adding a reviewer gate to staging blocks the entire deploy chain."

    ### Changes to CONTRIBUTING.md

    **Update "Staging & Deployment" section (lines 39-44)**
    Currently only describes the staging workflow. Add that after staging completes successfully, the production workflow triggers automatically. The full pipeline is:
    merge to `main` -> staging test/deploy/smoke (`deploy-staging.yml`) -> production deploy/smoke (`deploy-production.yml`)

    Keep the existing manual deploy instructions, secret setup, and smoke test sections unchanged.

    ### What NOT to do

    - Do NOT modify any workflow YAML files
    - Do NOT change README.md (its staging description remains accurate)
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
- **Deliverables**: Updated `OPERATIONS.md` and `CONTRIBUTING.md`
- **Success criteria**: All deploy documentation accurately reflects the new workflow_run trigger model

### Cross-Cutting Coverage

- **Testing**: No dedicated execution task needed. The change is to GitHub Actions workflow YAML -- correctness is verified by reviewing the workflow logic (approval gate on Task 1) and validated on first push to main after merge. Phase 6 will run existing unit/integration tests to confirm no regressions. There are no workflow-testing frameworks in use; the workflow itself is the test.
- **Security**: No new attack surface. The workflow permission block is unchanged. No new secrets, endpoints, or user input handling. The `workflow_run` trigger inherits the same security model as `push`. Excluded from execution tasks but mandatory reviewers (security-minion) will review the plan in Phase 3.5.
- **Usability -- Strategy**: No user-facing changes. The deploy pipeline is an internal operations concern. ux-strategy-minion participates in Phase 3.5 review to confirm the documentation is coherent for operators.
- **Usability -- Design**: Not applicable. No UI components or user-facing interfaces.
- **Documentation**: Covered by Task 2 (OPERATIONS.md and CONTRIBUTING.md updates). Phase 8 will assess whether additional documentation is needed.
- **Observability**: No new runtime components. The traceability logging step in Task 1 adds deploy context to GitHub Actions logs. No changes to Coralogix, metrics, or alerting. Excluded.

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - None selected. Rationale below.
- **Not selected**:
  - ux-design-minion: No UI components produced. Both tasks modify workflow YAML and markdown documentation.
  - accessibility-minion: No web-facing HTML/UI produced.
  - sitespeed-minion: No web-facing runtime code produced.
  - observability-minion: No new runtime components requiring coordinated logging/metrics/tracing. The traceability step is a single `echo` in GitHub Actions.
  - user-docs-minion: Task 2 already covers documentation. The user-docs-minion is an executing agent, not a reviewer for this plan.

### Decisions

- **Staging-smoke job: skip vs. keep for workflow_run triggers**
  Chosen: Skip `staging-smoke` on `workflow_run` triggers (conditional `if: github.event_name == 'workflow_dispatch'`)
  Over: Running `staging-smoke` unconditionally on all triggers (iac-minion initially noted it as "redundant but harmless")
  Why: The staging workflow already runs its own smoke test. Re-running the same smoke test adds ~1-2 minutes to every production deploy with zero additional signal. For `workflow_dispatch` rollbacks, the smoke test provides value because staging may not have been recently verified.

- **CONTRIBUTING.md update scope**
  Chosen: Update CONTRIBUTING.md to describe the full two-stage pipeline topology (user-docs-minion recommendation)
  Over: Leaving CONTRIBUTING.md unchanged (not raised by iac-minion, who focused only on OPERATIONS.md)
  Why: CONTRIBUTING.md lines 39-44 describe the deploy pipeline to contributors. Leaving it outdated creates a mental model mismatch. The change is a few sentences -- low effort, high clarity.

- **Manual staging deploy triggering production**
  Chosen: Document that manual staging deploys via `workflow_dispatch` also trigger the production workflow as intentional behavior
  Over: Adding `if: github.event.workflow_run.event == 'push'` filter to prevent manual staging deploys from triggering production (iac-minion noted this as an option)
  Why: If staging deploy succeeds, promoting to production is the right default regardless of how the staging deploy was triggered. Adding a filter creates a surprising inconsistency and an undocumented "staging-only deploy" that might confuse operators.

### Risks and Mitigations

1. **Missing `conclusion == 'success'` guard**: If the `if` condition on the deploy job omits the success check, a failed staging deploy triggers a production deploy. Mitigation: Task 1 prompt explicitly highlights this as CRITICAL, and the approval gate will verify.

2. **Wrong SHA ref (`github.sha` vs `head_sha`)**: Using `github.sha` in a `workflow_run` context deploys whatever is on HEAD, not what was staged. This is the race condition in a different form. Mitigation: Task 1 prompt explicitly highlights this as CRITICAL with explanation.

3. **Workflow name coupling**: Renaming `deploy-staging.yml`'s `name:` field breaks the `workflow_run` trigger silently. Mitigation: Comment in both workflow files documenting the coupling.

4. **`needs` with skipped jobs**: GitHub Actions skips dependent jobs when their dependency is skipped (via `if:`), unless `always()` is used. Missing this causes the deploy job to silently never run on `workflow_run` triggers. Mitigation: The `if: always() && (...)` pattern handles this; Task 1 prompt explains the gotcha.

5. **Documentation accuracy on manual staging deploys**: user-docs-minion raised uncertainty about whether `workflow_dispatch` triggers on staging actually fire `workflow_run` on production. Per GitHub docs, `workflow_run` triggers for all completions of the named workflow regardless of how they were triggered (push, workflow_dispatch, schedule, etc.). Task 2 prompt documents this as intentional behavior.

### Execution Order

```
Batch 1: Task 1 (iac-minion) -- workflow YAML change
  |
  v
[APPROVAL GATE: Task 1]
  |
  v
Batch 2: Task 2 (user-docs-minion) -- documentation updates
  |
  v
[Phase 3.5: Architecture review -- 5 mandatory reviewers]
```

Note: Phase 3.5 reviews the plan before execution begins. The approval gate on Task 1 occurs during execution (Phase 4). Task 2 is blocked by Task 1 because the documentation must reflect the final workflow shape.

### Verification Steps

1. **Workflow YAML correctness**: Review `deploy-production.yml` for correct trigger block, `if` conditions, ref resolution chain, concurrency group, and traceability step
2. **Documentation consistency**: Verify OPERATIONS.md and CONTRIBUTING.md descriptions match the actual workflow behavior
3. **Rollback path preserved**: Confirm `workflow_dispatch` trigger is present alongside `workflow_run` in `deploy-production.yml`
4. **Push-to-main test**: After merge, push a commit to `main` and verify: staging workflow runs first, production workflow triggers only after staging completes successfully, deploy job checks out the correct SHA
5. **Staging failure test**: If feasible, trigger a staging workflow that fails and verify production does NOT trigger a deploy
