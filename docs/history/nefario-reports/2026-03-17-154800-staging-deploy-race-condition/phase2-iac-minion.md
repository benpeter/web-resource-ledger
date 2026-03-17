## Domain Plan Contribution: iac-minion

### Analysis of the Two Options

**Option 1: `workflow_run` trigger** is the correct choice. Here is the detailed analysis.

#### Why `workflow_run` wins

The race condition is a workflow ordering problem. `workflow_run` solves ordering problems at the platform level -- GitHub Actions guarantees the child workflow only triggers after the parent workflow completes. This is a structural fix, not a behavioral one. There is no polling, no timing window, no code change to the Worker itself.

The commit-SHA verification approach (Option 2) would work but violates KISS and YAGNI:
- It adds a polling loop to the smoke test script (new failure mode: timeout, flaky network)
- It requires modifying the `/health` endpoint to include a commit SHA (a code change to the Worker, which the scope explicitly flags as "out unless needed")
- It requires injecting `GITHUB_SHA` into the Wrangler deploy as an environment variable or build-time substitution
- The polling loop must handle the window where the old deploy is still serving -- how long to wait? What backoff? This is the exact class of timing problem that structural solutions eliminate
- It solves the symptom (smoke tests stale code) instead of the cause (workflows run in parallel when they should be sequential)

#### Answering the Specific Questions

**(a) How does `workflow_dispatch` on deploy-production still work for rollbacks?**

`workflow_run` and `workflow_dispatch` are independent trigger types. A workflow can have multiple `on:` triggers. The production workflow will have:

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

When triggered via `workflow_dispatch`, the workflow runs exactly as it does today -- the `workflow_run` trigger is irrelevant. The `ref` input works the same way. Rollbacks are unaffected.

**(b) Does the production workflow correctly receive the commit SHA from the triggering staging run?**

Yes, but the mechanism differs from `push` trigger. With `workflow_run`:
- `github.event.workflow_run.head_sha` -- the commit SHA that triggered the staging workflow
- `github.sha` -- the SHA of the *most recent commit on main* at the time the production workflow starts (this can differ if another push landed between staging start and staging completion)

For correctness, the production workflow must use `github.event.workflow_run.head_sha` for checkout, not `github.sha`. This is critical: if two pushes land in quick succession, `github.sha` could point to the second push while the `workflow_run` event is for the first push's staging deploy.

For `workflow_dispatch`, the existing `inputs.ref || github.sha` pattern still works correctly.

The checkout ref expression becomes:
```yaml
ref: ${{ inputs.ref || github.event.workflow_run.head_sha || github.sha }}
```

The `||` chain handles all three trigger types:
1. `workflow_dispatch` with explicit ref: uses `inputs.ref`
2. `workflow_dispatch` without ref: `inputs.ref` is empty, falls through to `github.sha`
3. `workflow_run`: `inputs.ref` is empty (not a dispatch), uses `workflow_run.head_sha`

**(c) Edge cases**

| Edge Case | Behavior | Mitigation |
|-----------|----------|------------|
| **Staging deploy fails** | `workflow_run` fires with `conclusion == 'failure'`. Production workflow starts but must check conclusion. | Add `if: github.event.workflow_run.conclusion == 'success'` on the first job, or a conditional check step. Without this, the production workflow runs (and fails at staging-smoke) even when staging deploy failed. |
| **Concurrent pushes** | Each push triggers its own staging deploy. Each staging completion triggers its own production deploy. Two production workflows may run concurrently for different SHAs. | For a single-developer project this is unlikely. If it matters, add `concurrency: group: deploy-production` to serialize production deploys. The latest one wins. |
| **Manual staging deploy (`workflow_dispatch` on staging)** | `workflow_run` triggers on *any* completion of "Deploy to Staging", including `workflow_dispatch` runs. This means a manual staging deploy also triggers production. | This is actually desirable -- if you manually deploy to staging and it succeeds, promoting to production is the right default. If not desired, add `if: github.event.workflow_run.event == 'push'` to filter. |
| **Production `workflow_dispatch` while staging is running** | Works independently. The dispatch runs its own staging-smoke check. | No mitigation needed -- this is the rollback path and should bypass the staging deploy chain. |
| **Staging workflow name rename** | `workflow_run.workflows` matches by *name* string, not filename. If someone renames the staging workflow's `name:` field, the trigger breaks silently. | Document this coupling in a comment in the production workflow. |
| **`workflow_run` does not inherit the push check suite** | The production workflow appears as a separate run in GitHub Actions, not grouped with the push that triggered it. | Cosmetic only. Add a step that logs the triggering SHA and links to the staging run for traceability. |

#### The staging-smoke job becomes redundant for `workflow_run` triggers

When `workflow_run` triggers the production workflow, staging has already been deployed AND smoke-tested (the staging workflow's own `smoke` job passed). The production workflow's `staging-smoke` job would re-run the exact same smoke test against the same staging deployment. This is redundant but harmless -- it serves as a second confirmation that staging is still healthy before deploying to production.

I recommend keeping the `staging-smoke` job but making it conditional: skip it on `workflow_run` triggers (staging just passed its own smoke test) but keep it for `workflow_dispatch` triggers (rollback scenario -- you want to verify staging is healthy before deploying an older ref to production).

Actually, on reflection: for `workflow_dispatch` (rollback), the staging-smoke check tests whatever is currently deployed to staging, which may not be the ref being rolled back. This is the existing behavior and is acceptable -- it confirms staging is not broken, even if it is running different code than the rollback target. Keep the staging-smoke job for `workflow_dispatch` only.

### Proposed Tasks

**Task 1: Modify `deploy-staging.yml` to add `workflow_dispatch` trigger**

The staging workflow already has `workflow_dispatch` (line 6). No change needed here. Confirm this in implementation.

Deliverables: Verification that staging workflow already supports `workflow_dispatch`. No file change.

Dependencies: None.

**Task 2: Modify `deploy-production.yml` to use `workflow_run` trigger**

Replace the `push: branches: [main]` trigger with `workflow_run`. Keep `workflow_dispatch` as-is.

Concrete changes:

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

Add a guard on the first job to skip the entire workflow if staging failed:

```yaml
jobs:
  staging-smoke:
    # Skip when triggered by workflow_run (staging already smoke-tested itself).
    # Run on workflow_dispatch -- confirms staging is healthy before rollback deploy.
    if: github.event_name == 'workflow_dispatch'
    runs-on: ubuntu-latest
    ...

  deploy:
    # On workflow_run: only deploy if staging succeeded.
    # On workflow_dispatch: wait for staging-smoke (if it ran).
    needs: staging-smoke
    if: |
      always() && (
        (github.event_name == 'workflow_run' && github.event.workflow_run.conclusion == 'success') ||
        (github.event_name == 'workflow_dispatch' && (needs.staging-smoke.result == 'success'))
      )
    runs-on: ubuntu-latest
    ...
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
        with:
          ref: ${{ inputs.ref || github.event.workflow_run.head_sha || github.sha }}
```

Add a concurrency group to prevent overlapping production deploys:

```yaml
concurrency:
  group: deploy-production
  cancel-in-progress: false
```

`cancel-in-progress: false` ensures an in-flight deploy completes rather than being cancelled by a newer one. The newer one will queue and run after the current one finishes. This is safer for production.

Deliverables: Updated `deploy-production.yml`.

Dependencies: None (staging workflow already has the right name).

**Task 3: Update OPERATIONS.md**

Document the new trigger model:

1. Update "Deploy to Production" section to explain the `workflow_run` chain:
   - Push to main -> staging deploys -> staging smoke tests -> production workflow triggers automatically -> production deploys -> production smoke tests
2. Document that `workflow_dispatch` on `deploy-staging.yml` is available for ad-hoc staging deploys (already exists, just needs documentation)
3. Note that manual staging deploys also trigger the production pipeline (via `workflow_run`)
4. Note the workflow name coupling: renaming "Deploy to Staging" breaks the production trigger
5. Rollback section stays the same -- `workflow_dispatch` on production still works identically

Deliverables: Updated `OPERATIONS.md`.

Dependencies: Task 2 (need to know final workflow shape).

**Task 4: Add traceability logging step to production workflow**

Add a step at the start of the deploy job that prints the triggering context for debuggability:

```yaml
- name: Log deploy context
  run: |
    echo "Trigger: ${{ github.event_name }}"
    echo "Deploy ref: ${{ inputs.ref || github.event.workflow_run.head_sha || github.sha }}"
    echo "Staging run: ${{ github.event.workflow_run.html_url || 'N/A (manual dispatch)' }}"
```

This is cheap and makes incident investigation much faster -- you can see exactly which staging run triggered a production deploy.

Deliverables: Additional step in `deploy-production.yml`.

Dependencies: Part of Task 2.

### Risks and Concerns

1. **`workflow_run` fires even on failure.** The `types: [completed]` event fires for both success and failure conclusions. Without the `if: github.event.workflow_run.conclusion == 'success'` guard, a failed staging deploy would trigger a production deploy attempt. This is the single most important detail to get right -- miss it and you deploy to production after a staging failure.

2. **Workflow name coupling.** `workflow_run.workflows` matches the `name:` field of the target workflow as a string. If the staging workflow's name is changed from "Deploy to Staging" to anything else, the production trigger breaks silently. Document this with a comment in both workflow files.

3. **`needs` with conditional jobs.** When `staging-smoke` is skipped (via `if: github.event_name == 'workflow_dispatch'`), the `deploy` job's `needs: staging-smoke` requires `if: always()` (or the more specific condition above) to proceed. Without `always()`, a skipped dependency causes the dependent job to also be skipped. This is a common GitHub Actions gotcha.

4. **Ref resolution subtlety.** `github.event.workflow_run.head_sha` is the correct ref for the code that was staged. `github.sha` in a `workflow_run` context points to the default branch HEAD at trigger time, which may have advanced. Using the wrong one would deploy untested code to production -- the exact bug we are fixing, just in a different form.

5. **GitHub Actions UI change.** Production deploys will no longer appear in the same "checks" list as the push. They will appear as separate workflow runs. This is cosmetic but could confuse anyone monitoring the Actions tab. The traceability logging step (Task 4) partially mitigates this by linking back to the staging run.

6. **`concurrency` group behavior.** With `cancel-in-progress: false`, if two staging deploys complete in quick succession, the second production deploy queues behind the first. The second deploy will still run the correct SHA (from its own `workflow_run` event). This is correct behavior but worth understanding.

### Additional Agents Needed

None. This is purely a CI/CD workflow change with OPERATIONS.md documentation. No application code changes, no API design, no security implications beyond what is already covered by the existing workflow permissions model.
