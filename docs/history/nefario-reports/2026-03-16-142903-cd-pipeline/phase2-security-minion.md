# Security Minion -- Production CD Pipeline Review

## Recommendations

### 1. Production Secrets MUST Be Scoped to a GitHub `production` Environment

**Verdict: Yes, mandatory.**

The staging workflow already correctly scopes secrets to a `staging` environment (line 30 of `deploy-staging.yml`). The production workflow must mirror this with a `production` environment. This is not optional -- it is the primary mechanism that gates secret access to approved deployments only.

Without environment scoping, any workflow job in the repository can reference production secrets by name. On a public repository, this means any workflow triggered by `pull_request_target` or a compromised action could attempt to access them. Environment protection rules (required reviewers, wait timers, branch restrictions) only function when secrets are bound to an environment.

**Specific configuration for the `production` environment:**
- **Required reviewers**: At minimum one reviewer (Ben) before any deployment runs
- **Branch restriction**: Only the `main` branch (or tags matching `v*` that point to commits on `main`) should be allowed to deploy to production
- **Wait timer**: Consider a 5-minute wait after approval -- this gives time to abort if staging smoke tests reveal a delayed failure
- **Deployment branches**: Restrict to `main` and tag patterns like `v*`

The production secrets should be:
- `CLOUDFLARE_API_TOKEN` (production-scoped -- see item 2)
- `WRL_CAPTURE_API_KEY` (production value)
- `WRL_SIGNING_KEY` (production value)
- `WRL_CORALOGIX_SEND_KEY` (production value)
- `WRL_IP_HASH_SEED` (production value)

The staging environment already demonstrates this pattern well. Production must follow it exactly.

### 2. Separate Cloudflare API Token for Production -- Strongly Recommended

**Verdict: Yes, create a dedicated production token with tighter scope.**

The current staging workflow uses `secrets.CLOUDFLARE_API_TOKEN`. If the same token is used for production, a compromise of the staging environment (or any workflow that can access staging secrets) grants production deploy capability. This violates least privilege.

**Create two Cloudflare API tokens:**

| Token | Scope | Used By |
|-------|-------|---------|
| `CLOUDFLARE_API_TOKEN` (staging) | Account: Workers Scripts (edit), Workers KV Storage (edit), Workers R2 Storage (edit), scoped to staging worker only if Cloudflare supports resource-level scoping | `deploy-staging.yml` |
| `CLOUDFLARE_PROD_API_TOKEN` (production) | Same permissions, scoped to production worker | `deploy-production.yml` |

Cloudflare's "Edit Cloudflare Workers" token template is overly broad. The minimum permissions needed for `wrangler deploy` with this project's bindings (R2, KV, rate limiters, Browser) are:
- **Account**: Workers Scripts (Edit), Workers KV Storage (Edit), Workers R2 Storage (Edit)
- **Zone**: Workers Routes (Edit) -- only if using routes (not needed if using `*.workers.dev`)

If Cloudflare does not support per-Worker scoping on tokens, at minimum use separate tokens so they can be rotated independently and revocation of one does not affect the other.

**Risk this mitigates:** Staging environment compromise cannot escalate to production deployment. Each token can be independently rotated. Audit trails clearly distinguish which token performed which deployment.

### 3. Tag-Based Trigger Risks on a Public Repository

**Verdict: Acceptable risk with proper controls. Not the top concern.**

The threat model for tag-based triggers:

**Who can push tags?** Only users with write access to the repository. Forks cannot push tags to the upstream repository. GitHub's security model ensures that `on: push: tags` events can only be triggered by authenticated collaborators with write permission. This is fundamentally different from `pull_request_target`, which can be triggered by any fork author.

**What are the residual risks?**

1. **Compromised collaborator account**: An attacker who compromises a collaborator's GitHub credentials can push a tag pointing to any commit (including one they authored via a merged PR with subtle malicious changes). **Mitigation**: Require MFA on all collaborator accounts. This is table stakes.

2. **Tag pointing to non-main commit**: A collaborator (or compromised account) could push a tag pointing to a commit on a feature branch or even a detached HEAD. The workflow would then deploy that arbitrary commit to production. **Mitigation**: The production workflow MUST verify the tagged commit is on `main`:
   ```yaml
   - name: Verify tag is on main
     run: |
       git fetch origin main
       if ! git merge-base --is-ancestor "$GITHUB_SHA" origin/main; then
         echo "ERROR: Tagged commit is not on main branch"
         exit 1
       fi
   ```

3. **Tag mutation (force-push)**: An attacker could delete and recreate a tag pointing to a different commit. **Mitigation**: GitHub environment protection rules with required reviewers catch this because the approval is per-run, not per-tag. Additionally, enable tag protection rules in the repository settings to prevent deletion/modification of `v*` tags.

4. **Typosquatting tags**: If the workflow uses `tags: ['v*']`, an attacker with write access could push `v1.0.0-malicious` which would match. **Mitigation**: Use a strict pattern like `v[0-9]+.[0-9]+.[0-9]+` in the workflow filter, or use `workflow_dispatch` as the primary trigger and tags only for versioning/tracking (not triggering).

**Recommended approach:** Use `workflow_dispatch` as the primary production deploy trigger (explicit human action), with optional tag-push as a convenience trigger. Both paths must go through the `production` environment protection gate.

### 4. Action Version Pinning Audit

**Verdict: Current pinning is excellent. One item to verify.**

All three-party actions in the existing workflows are pinned to full commit SHAs with version comments:

| Action | Pinned SHA | Version |
|--------|-----------|---------|
| `actions/checkout` | `11bd71901bbe5b1630ceea73d27597364c9af683` | v4.2.2 |
| `actions/setup-node` | `49933ea5288caeca8642d1e84afbd3f7d6820020` | v4.4.0 |
| `cloudflare/wrangler-action` | `da0e0edf58b41e3cd8317c1a9dbb2f0cd2791a54` | v3.14.0 |

This is the gold standard. Tag references (`@v4`) are mutable and vulnerable to tag poisoning attacks (as demonstrated by the [Xygeni GitHub Action compromise](https://www.darkreading.com/application-security/xygeni-github-action-compromised-via-tag-poison)). SHA pinning is the only immutable reference.

**Verification needed:** Confirm that each pinned SHA matches the claimed version. Run:
```bash
for repo_tag in "actions/checkout@v4.2.2" "actions/setup-node@v4.4.0" "cloudflare/wrangler-action@v3.14.0"; do
  repo="${repo_tag%@*}"
  tag="${repo_tag#*@}"
  echo "$repo @ $tag -> $(gh api repos/$repo/git/ref/tags/$tag --jq '.object.sha' 2>/dev/null || echo 'VERIFY MANUALLY')"
done
```

**For the production workflow:** Reuse the same pinned SHAs. When updating action versions in the future, always verify the SHA against the tag before updating. Consider using [Dependabot](https://docs.github.com/en/code-security/dependabot/working-with-dependabot/keeping-your-actions-up-to-date-with-dependabot) with `package-ecosystem: github-actions` to get automated PRs for action updates (which you can review before merging).

The local composite action (`.github/actions/vibe-badge`) is referenced as `./.github/actions/vibe-badge` which is inherently safe -- it runs the code at the checked-out commit.

### 5. `wrangler rollback` Behavior Regarding Secrets

**Verdict: Secrets are NOT rolled back. This is a critical operational detail that must be documented.**

Based on Cloudflare's documentation:

> "Resources connected to your Worker will not be changed during a rollback."

Cloudflare Workers secrets are **not versioned with code deployments**. They are a separate resource attached to the Worker. `wrangler rollback` rolls back the **code version** only. Secrets remain at their current values regardless of which code version is active.

**Implications for the rollback procedure:**

1. **Safe scenario (most common):** Rolling back code due to a bug. Secrets have not changed between versions. Rollback works as expected -- old code runs with current secrets.

2. **Dangerous scenario:** A deployment that included both a code change AND a secret rotation. Rolling back code but NOT secrets means the old code runs with the new secret values. If the code change was required to support a new secret format, the rolled-back code will break.

3. **Secret rotation during rollback:** If a production incident requires reverting to old secrets (e.g., a compromised API key was rotated but the new key is causing issues), you must manually re-set secrets via `wrangler secret put`. This is a separate operation from code rollback.

**Rollback limitations to document:**
- Only the 100 most recent versions are available for rollback
- Rollback is blocked if R2 buckets, KV namespaces, or other bindings have been deleted or modified between versions
- Durable Object migrations between versions block rollback
- Data structure changes may cause runtime errors even if rollback succeeds

**Recommended rollback procedure:**
1. `wrangler rollback [version-id]` to revert code
2. Verify secrets are compatible with the rolled-back version (check if any `wrangler secret put` commands were run as part of the deployment being rolled back)
3. If secrets need reverting, run `wrangler secret put` for each affected secret
4. Run smoke tests against production to verify

**The production workflow should record the pre-deployment version ID** so the rollback target is always known:
```yaml
- name: Record current version
  run: |
    CURRENT_VERSION=$(npx wrangler versions list --json | jq -r '.[0].id')
    echo "ROLLBACK_TARGET=$CURRENT_VERSION" >> "$GITHUB_OUTPUT"
```

## Proposed Tasks

1. **Create GitHub `production` environment** with protection rules: required reviewer, branch restriction to `main`, optional 5-minute wait timer.

2. **Create a dedicated Cloudflare API token for production deployments**, scoped to the minimum permissions needed (Workers Scripts Edit, KV Storage Edit, R2 Storage Edit). Store as `CLOUDFLARE_PROD_API_TOKEN` in the `production` environment secrets.

3. **Store all production Worker secrets** (`WRL_CAPTURE_API_KEY`, `WRL_SIGNING_KEY`, `WRL_CORALOGIX_SEND_KEY`, `WRL_IP_HASH_SEED`) in the `production` GitHub environment, not as repository-level secrets.

4. **Add commit-on-main verification** to the production deploy workflow: a step that fails the job if the tagged commit is not an ancestor of `main`.

5. **Enable tag protection rules** in GitHub repository settings for the `v*` pattern to prevent tag deletion and force-push.

6. **Document rollback procedure** that explicitly covers the secret-not-rolled-back behavior, including the manual `wrangler secret put` steps needed when secrets and code must be reverted together.

7. **Record pre-deployment version ID** in the production workflow for deterministic rollback targeting.

8. **Pin workflow permissions** in the production workflow to `contents: read` and `deployments: write` (matching the staging pattern). Never grant `contents: write` to a deploy workflow.

9. **Verify existing action SHA pins** match their claimed tag versions before copying them to the production workflow.

## Risks and Concerns

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| Production secrets accessible outside `production` environment | High | Medium | Scope all production secrets to the `production` GitHub environment (Task 1, 3) |
| Single Cloudflare API token compromised affects both staging and production | High | Low | Separate tokens per environment (Task 2) |
| Tag pushed pointing to non-main commit deploys untested code | High | Low | Commit-on-main verification step (Task 4) |
| Rollback fails silently because secrets are incompatible with old code | Medium | Low | Document rollback procedure, record version IDs (Task 6, 7) |
| Action version drift introduces vulnerability | Medium | Low | Dependabot for github-actions ecosystem, SHA pinning already in place |
| Collaborator account compromise allows unauthorized production deploy | High | Very Low | MFA on all collaborator accounts, environment protection approval gate |
| `wrangler.toml` exposes KV namespace IDs and R2 bucket names | Informational | N/A | These are non-secret identifiers. No action needed, but note that the staging KV ID is still a placeholder (`STAGING_KV_ID_PLACEHOLDER`) |

**One concern NOT in scope but worth flagging:** The `vibe-coded-badge.yml` workflow uses `secrets.BADGE_PAT` (a Personal Access Token) with `contents: write` permission. This PAT is a repository-level secret (not environment-scoped). If this PAT has broad scope, it is a lateral movement vector. Recommend scoping it to the minimum permissions needed (just `contents: write` on this single repository) and using a fine-grained PAT.

## Additional Agents Needed

- **IaC Minion**: To implement the GitHub environment configuration (protection rules, secrets assignment) and the Cloudflare API token creation. The security minion identifies what needs to exist; IaC minion provisions it.
- **No other agents needed** for the security aspects. The production workflow YAML itself is straightforward and can be built by the implementing agent using these security constraints as requirements.
