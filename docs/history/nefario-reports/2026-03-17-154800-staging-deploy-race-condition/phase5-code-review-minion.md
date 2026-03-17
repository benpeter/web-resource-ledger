# Code Review -- staging-deploy-race-condition

Reviewer: code-review-minion
Files reviewed:
- `.github/workflows/deploy-production.yml`
- `OPERATIONS.md`
- `CONTRIBUTING.md`

Reference: phase3-synthesis.md (execution plan and success criteria)

---

## VERDICT: ADVISE

Two findings. Neither is a correctness defect in the race-condition fix itself -- the core logic is correct. One is a missing spec deliverable (concurrency group) that was explicitly required in the synthesis plan; the other is a missing observability step. The `if` conditions, ref resolution chain, and documentation are all correct.

---

## FINDINGS

### [ADVISE] .github/workflows/deploy-production.yml -- missing concurrency group
AGENT: iac-minion
FIX: Add the following block at the top level of the workflow file, after the `permissions` block and before the `jobs:` block:

```yaml
concurrency:
  group: deploy-production
  cancel-in-progress: false
```

The synthesis plan (phase3-synthesis.md lines 49-55) listed this as a required deliverable: "Add concurrency group (top-level, after permissions)". It is absent from the produced file. Without it, two simultaneous `workflow_run` events (e.g., two rapid merges to `main` with fast staging runs) can produce overlapping production deploys. The `cancel-in-progress: false` setting is specifically required to let in-flight deploys finish rather than be cancelled. This is a correctness gap relative to the plan's success criteria and a real operational risk on busy branches, though its probability is low on a solo project.

---

### [NIT] .github/workflows/deploy-production.yml:46 -- missing traceability logging step
AGENT: iac-minion
FIX: Add the following step as the first step in the `deploy` job (before the `actions/checkout` step):

```yaml
      - name: Log deploy context
        run: |
          echo "Trigger: ${{ github.event_name }}"
          echo "Deploy ref: ${{ inputs.ref || github.event.workflow_run.head_sha || github.sha }}"
          echo "Staging run: ${{ github.event.workflow_run.html_url || 'N/A (manual dispatch)' }}"
```

The synthesis plan (phase3-synthesis.md lines 83-89) required this step explicitly. It is not blocking -- the workflow is functionally correct without it -- but it was a stated deliverable. The expressions are safe: all values are read from `github` context and `inputs`, not from user-controlled PR content, so there is no injection risk in the `run:` shell context. Adding it closes the observability gap when diagnosing which staging run triggered a given production deploy.

---

## Passing Checks

The following items were explicitly verified and are correct:

**Trigger logic:**
- `workflow_run` fires on "Deploy to Staging" -- string matches `name:` field in `deploy-staging.yml` line 1 exactly.
- `types: [completed]` and `branches: [main]` are correct.
- Coupling comment is present at lines 6-7.
- `workflow_dispatch` with optional `ref` input is preserved for rollbacks.

**`if` condition correctness:**
- `staging-smoke` job: `if: github.event_name == 'workflow_dispatch'` is syntactically valid YAML and a valid GitHub Actions expression. Correctly skips staging smoke for `workflow_run` triggers.
- `deploy` job: `always() && (...)` is the correct pattern to prevent GitHub Actions from propagating a skipped `staging-smoke` to `deploy`. Without `always()`, a skipped dependency causes the dependent job to also skip silently.
- `conclusion == 'success'` guard on line 40 is present. Failed staging runs will NOT trigger production deploys.
- `needs.staging-smoke.result == 'success'` on line 41 correctly gates `workflow_dispatch` path on the smoke result.
- Both `if` branches are mutually exclusive by `github.event_name` -- no ambiguity.

**Ref resolution chain:**
- `inputs.ref || github.event.workflow_run.head_sha || github.sha` on line 49 is correct.
- `inputs.ref` handles rollbacks (user-specified SHA/tag/branch).
- `github.event.workflow_run.head_sha` is the commit that triggered the staging workflow -- correct for `workflow_run` context. Using `github.sha` here would re-introduce the race condition in a different form (HEAD may have advanced).
- `github.sha` fallback is unreachable in normal operation but harmless as a safety net.

**Injection vectors:**
- `run:` steps contain only `npm ci` and `./scripts/smoke-test.sh`. No user-controlled inputs are interpolated into shell commands.
- `inputs.ref` is used only in the `ref:` input to `actions/checkout` (an action parameter), not in a `run:` shell command. No injection risk.

**`smoke` job (post-deploy):**
- `needs: deploy` with no `if` guard is correct. When `deploy` is skipped (staging failed), GitHub Actions automatically skips `smoke` via the `needs` dependency chain. No guard needed.

**Documentation accuracy:**
- OPERATIONS.md "Deploy to Staging" section accurately describes automatic and manual trigger paths.
- OPERATIONS.md "Deploy to Production" section correctly describes `workflow_run` trigger, skipped `staging-smoke` for automatic triggers, and `staging-smoke` running for `workflow_dispatch` rollbacks.
- OPERATIONS.md rollback Option A correctly notes that `staging-smoke` tests whatever is currently on staging (not the rollback SHA) and warns this bypasses the staging-first guarantee.
- OPERATIONS.md staging environment protection rules note correctly explains that adding a reviewer gate blocks the entire deploy chain.
- CONTRIBUTING.md lines 41-53 correctly describe the full two-stage pipeline topology, including that CLI deploys do NOT trigger production.
- All documentation is internally consistent with the workflow YAML behavior.

**Unchanged from pre-existing state (correct):**
- Permissions block (`contents: read`, `deployments: write`) -- unchanged and appropriate.
- All action version pins -- unchanged.
- `smoke` job environment references -- unchanged.
