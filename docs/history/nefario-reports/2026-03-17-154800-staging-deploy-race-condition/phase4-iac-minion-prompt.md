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
     # COUPLING: "Deploy to Staging" must match the `name:` field in deploy-staging.yml.
     # Renaming that workflow without updating this reference breaks the production trigger silently.
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

2. **Make staging-smoke conditional on trigger type:**
   The `staging-smoke` job should only run for `workflow_dispatch` triggers (rollback scenario). For `workflow_run` triggers, staging already ran its own smoke test.
   ```yaml
   staging-smoke:
     if: github.event_name == 'workflow_dispatch'
   ```

3. **Update the deploy job's `if` condition:**
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

4. **Fix the checkout ref in the deploy job:**
   ```yaml
   ref: ${{ inputs.ref || github.event.workflow_run.head_sha || github.sha }}
   ```
   CRITICAL: Use `github.event.workflow_run.head_sha`, NOT `github.sha`. In a `workflow_run` context, `github.sha` points to the default branch HEAD at trigger time, which may have advanced if another push landed. `head_sha` is the commit that triggered the staging workflow.

5. **Keep the existing comment** on line 1: `# Rollback: see OPERATIONS.md`

6. **DO NOT add a concurrency group** — the workflow_run trigger already serializes deploys through the staging workflow. Adding one is YAGNI for a solo-developer project.

7. **DO NOT add a traceability logging step** — GitHub Actions UI already shows trigger type, triggering run link, and checked-out ref. Adding a logging step duplicates information available one click away.

### Security advisory (incorporated)

If you reference `inputs.ref` in any `run:` step, route it through an environment variable instead of direct `${{ }}` interpolation. Example:
```yaml
env:
  DEPLOY_REF: ${{ inputs.ref || github.event.workflow_run.head_sha || github.sha }}
```
Then reference as `$DEPLOY_REF` in shell. This prevents CWE-78 injection via workflow_dispatch inputs.

However, since we are NOT adding a traceability logging step, this should not be needed. The only place `inputs.ref` appears is in the `ref:` field of the checkout action, which is not a shell context.

### What NOT to do

- Do NOT modify `deploy-staging.yml` — it already has `workflow_dispatch` and the correct `name:` field
- Do NOT change the `smoke` job (post-deploy production smoke) — it stays as-is
- Do NOT add any `/health` endpoint changes or SHA verification logic
- Do NOT change permissions or environment references
- Do NOT change action versions or pin hashes
- Do NOT add a concurrency group
- Do NOT add a traceability logging step

### Deliverables

Updated `.github/workflows/deploy-production.yml`

### Success criteria

- The workflow has `workflow_run` and `workflow_dispatch` triggers (no `push` trigger)
- `workflow_run` fires only on the "Deploy to Staging" workflow
- Deploy job only proceeds when staging completed successfully
- Deploy job checks out the correct SHA via `head_sha` for `workflow_run` triggers
- `staging-smoke` job is skipped for `workflow_run` triggers, runs for `workflow_dispatch`
- No concurrency group, no traceability logging step
- Coupling comment present near workflow_run trigger

When you finish your task, mark it completed with TaskUpdate and send a message to the team lead with:
- File paths with change scope and line counts
- 1-2 sentence summary of what was produced
- The approach you chose, what alternative(s) you considered but rejected, and a brief reason for each rejection
