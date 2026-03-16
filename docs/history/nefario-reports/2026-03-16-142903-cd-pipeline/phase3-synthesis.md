# Phase 3: Synthesis -- R14 Production CD Pipeline

## Conflict Resolutions

### Conflict 1: Staging gate mechanism

**iac-minion** wants a self-contained workflow: staging smoke as Job 1 inside `deploy-production.yml`, then deploy as Job 2 (with `needs: staging-smoke`), then production smoke as Job 3.

**test-minion** wants `workflow_run` trigger: production workflow fires on successful completion of the staging deploy workflow.

**Resolution: iac-minion wins -- self-contained workflow.**

Rationale:
- `workflow_run` creates a separate workflow run that is harder to observe. The production deploy appears as a disconnected run in the Actions UI, not visibly linked to the staging run that triggered it. For a single operator, seeing the full pipeline as one run is clearer.
- `workflow_run` events run using the workflow file from the default branch HEAD, not the triggering commit. This creates a subtle mismatch that iac-minion correctly identifies as harder to reason about.
- The self-contained approach keeps the entire deploy-to-production visible as a single workflow run: staging smoke -> approval gate -> deploy -> production smoke. If staging smoke fails, the workflow fails before reaching the approval gate. No human attention wasted.
- The iac-minion correctly notes the tradeoff: the staging smoke job validates staging health, not strict code parity with the tag. For a solo project with linear history on main, this is acceptable -- staging always runs the same or newer code than any tag being deployed.
- The self-contained approach also supports `workflow_dispatch` for rollbacks and manual deploys, which `workflow_run` does not (it only fires on staging completions).

### Conflict 2: Tag triggers

**iac-minion** wants both `push: tags: ['v*']` and `workflow_dispatch`.

**ux-strategy-minion** sees tags as unnecessary cognitive load for a solo developer and recommends Option D (staging-first with approval gate, no tags needed).

**Resolution: ux-strategy-minion wins -- workflow_dispatch only, no tag triggers.**

Rationale:
- The ux-strategy-minion's Kano analysis is compelling: tags are an "indifferent" feature for a single developer. Cloudflare Workers have built-in version history; git tags add a naming convention to remember with no proportional benefit.
- The security-minion raised legitimate risks around tag triggers (non-main commits, tag mutation, typosquatting). While mitigable, each mitigation is additional complexity (ancestry checks, tag protection rules, strict regex patterns). Avoiding tag triggers sidesteps all of these.
- The workflow_dispatch trigger is sufficient for all use cases: regular deploys (trigger manually or let it auto-flow from staging approval), rollbacks (enter a previous SHA or branch), and re-deploys (trigger again). workflow_dispatch with the `production` environment protection provides the approval gate.
- However, we adopt a hybrid: the workflow is triggered **automatically** via successful staging smoke (self-contained as per Conflict 1), giving the Option D flow (push -> staging auto-deploys -> staging smoke passes -> approval gate appears -> approve -> production deploys -> production smokes). The `workflow_dispatch` input is kept as an escape hatch for rollbacks and emergency deploys. No tag triggers.
- This gives the developer the "boring" deploy experience ux-strategy-minion described: push, see green staging, click approve, see green production. Zero recall, one click.

**Note: We keep `workflow_dispatch` with an optional `ref` input** per iac-minion's recommendation. This enables rollback-by-redeploy (enter a previous SHA to redeploy it) without needing tag triggers. The `ref` input defaults to `github.sha` from the triggering context.

Wait -- re-reading the conflict more carefully: if we drop tag triggers, how does the production workflow get triggered? Let me reconsider.

The self-contained approach from Conflict 1 means the production workflow has staging smoke as Job 1. But what *triggers* the production workflow itself?

Options:
1. **Same trigger as staging** (`push: branches: [main]`): Both workflows trigger on push to main. The production workflow runs its own staging smoke check (redundant with the staging workflow, but self-contained). This is what ux-strategy-minion's Option D implies if we collapse it into one workflow-per-push.
2. **workflow_dispatch only**: Production deploy is always manually triggered. This loses the "automatic flow to approval gate" that Option D provides.
3. **Push to main + workflow_dispatch**: The workflow triggers on every push to main, runs staging smoke, presents approval gate, then deploys to production. This is Option D.

**Final resolution: Push to main + workflow_dispatch.** This means every push to main triggers both the staging deploy workflow AND the production deploy workflow. The production workflow starts by validating staging health (Job 1), then presents the approval gate (Job 2 with `environment: production`), then deploys (Job 2 continues), then smokes production (Job 3). The `workflow_dispatch` input is the escape hatch for rollbacks.

This is the cleanest mapping of ux-strategy-minion's Option D. No tags. Every merge to main flows to the approval gate automatically.

### Conflict 3: Smoke test changes (version check + response time)

**test-minion** wants two additions: (1a) `SMOKE_EXPECT_VERSION` that checks a commit SHA from the health endpoint, and (1b) response time assertion.

**Evaluation against YAGNI/KISS:**

**1a -- Version check: DEFERRED.** This requires modifying the Worker's health endpoint to return a version field (adding `env.DEPLOY_SHA` or similar), modifying the smoke test to check it, and passing `--var DEPLOY_SHA:$GITHUB_SHA` in all deploy steps. Three moving parts for a failure mode (deploy succeeds but nothing changed) that has not been observed. The smoke test already validates headers, signing key, and health -- if the old version had a bug that this deploy fixes, the smoke test catches it. For a solo project where deploys are infrequent, this is premature. Add to backlog as `[consider]` with trigger "when a deploy silently fails to update the Worker."

**1b -- Response time assertion: DEFERRED.** The smoke test runs from GitHub Actions runners, not edge. Network latency from GitHub to Cloudflare adds 100-500ms of variability, making any threshold either too generous (useless) or too strict (flaky). The CLAUDE.md <300ms mandate applies to edge latency, not CI-to-edge. Not actionable from GitHub Actions without a dedicated monitoring setup. Add to backlog as `[consider]` with trigger "when Coralogix/RUM shows latency regression."

**Result: No changes to the smoke test script.** The existing script is sufficient for the production workflow. It is already environment-agnostic and supports `SMOKE_SKIP_CAPTURE`.

## Delegation Plan

**Team name**: r14-cd-pipeline
**Description**: Production CD pipeline with environment protection, approval gate, and rollback capability for WRL (Cloudflare Workers).

### Task 1: Create production deploy workflow and operations documentation

- **Agent**: iac-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |

    ## Task: Create the production CD pipeline for WRL

    You are implementing the production deployment workflow for a Cloudflare Workers project (Web Resource Ledger). The staging environment and its workflow already exist and work. Your job is to create the production counterpart.

    ### Context

    **Project**: Cloudflare Worker deployed via `wrangler-action`. The Worker processes web captures and stores them in R2/KV.

    **Existing staging workflow**: `.github/workflows/deploy-staging.yml` -- triggers on push to main, runs tests, deploys to staging with `--env staging`, runs smoke tests. This is the reference implementation. Match its patterns (SHA-pinned actions, permissions, timeout-minutes, secret naming).

    **Existing smoke test**: `scripts/smoke-test.sh` -- environment-agnostic, takes `SMOKE_URL` and `SMOKE_API_KEY` env vars, supports `SMOKE_SKIP_CAPTURE=1`. No changes needed to this script.

    **wrangler.toml**: Top-level config IS production (Worker name `wrl`). `[env.staging]` overrides for staging. The production deploy does NOT use `--env` or `environment:` in the wrangler action -- just deploy with default config.

    ### What to build

    **File 1: `.github/workflows/deploy-production.yml`**

    Triggers:
    ```yaml
    on:
      push:
        branches: [main]
      workflow_dispatch:
        inputs:
          ref:
            description: 'Git ref to deploy (tag, branch, or SHA). Defaults to triggering ref. Used for rollbacks.'
            required: false
            type: string
    ```

    Jobs (3 sequential):

    1. **`staging-smoke`** -- Validate that staging is healthy before allowing production deploy. Run `scripts/smoke-test.sh` against the staging URL. This does NOT deploy to staging (that happens in the staging workflow). It just confirms staging is green.
       - `timeout-minutes: 5`
       - Uses staging environment vars/secrets for SMOKE_URL and SMOKE_API_KEY
       - `environment: staging` (to access staging secrets)

    2. **`deploy`** (`needs: staging-smoke`) -- Deploy to production via `cloudflare/wrangler-action`.
       - `environment: production` -- this triggers GitHub's environment protection rules (required reviewer approval). The workflow pauses here until approved.
       - `timeout-minutes: 5`
       - Use the SAME SHA-pinned actions as `deploy-staging.yml`:
         - `actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683` (v4.2.2)
         - `actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020` (v4.4.0)
         - `cloudflare/wrangler-action@da0e0edf58b41e3cd8317c1a9dbb2f0cd2791a54` (v3.14.0)
       - DO NOT pass `environment:` to wrangler-action (top-level wrangler.toml = production)
       - Secrets pushed via wrangler-action `secrets:` block, same pattern as staging but with production values:
         ```yaml
         secrets: |
           CAPTURE_API_KEY
           SIGNING_KEY
           CORALOGIX_SEND_KEY
           IP_HASH_SEED
         env:
           CAPTURE_API_KEY: ${{ secrets.WRL_PROD_CAPTURE_API_KEY }}
           SIGNING_KEY: ${{ secrets.WRL_PROD_SIGNING_KEY }}
           CORALOGIX_SEND_KEY: ${{ secrets.WRL_PROD_CORALOGIX_SEND_KEY }}
           IP_HASH_SEED: ${{ secrets.WRL_PROD_IP_HASH_SEED }}
         ```
       - The `apiToken` uses `${{ secrets.CLOUDFLARE_API_TOKEN }}` from the production environment (separate token from staging, same secret name in each environment scope).
       - Handle `workflow_dispatch` ref input: if `inputs.ref` is provided, use it for checkout. Otherwise use default ref.

    3. **`smoke`** (`needs: deploy`) -- Run smoke tests against production.
       - `timeout-minutes: 5`
       - `environment: production` (to access production secrets)
       - Run `scripts/smoke-test.sh` with:
         - `SMOKE_URL: ${{ vars.WRL_PROD_BASE_URL }}`
         - `SMOKE_API_KEY: ${{ secrets.WRL_PROD_CAPTURE_API_KEY }}`
         - `SMOKE_SKIP_CAPTURE: "1"` -- skip capture round-trip in production. Staging already validated this on the same code. Production captures create real R2 data with no cleanup API, and burn Browser Rendering sessions.

    Workflow-level settings:
    - `permissions: contents: read, deployments: write` (matching staging)
    - Include a comment at the top: `# Rollback: see OPERATIONS.md`

    **File 2: `OPERATIONS.md`** (repo root)

    A lean operations document for a single developer. Write for "tired Ben at 2am" -- exact commands, not explanations of what Wrangler is. Target 80-120 lines.

    Structure:
    ```
    # Operations

    ## Environments
    - Production: wrl (wrangler deploy, no --env flag)
    - Staging: wrl-staging (wrangler deploy --env staging)
    - Production URL: (use a placeholder like https://wrl.your-domain.workers.dev)
    - Staging URL: (use a placeholder)

    ## Monitoring
    - Health endpoint: GET /health
    - Coralogix dashboard for logs
    - GitHub Actions for deployment status

    ## Deploy to Production
    The normal flow: push to main -> staging auto-deploys -> staging smoke passes ->
    production workflow shows pending approval -> click "Approve and deploy" ->
    production deploys -> production smoke passes.

    Manual trigger: Actions tab -> Deploy to Production -> Run workflow

    ## Rollback

    ### Diagnosing the problem
    Decision tree:
    - Deploy failed in CI? -> No action needed, old version still live
    - Deploy succeeded but smoke tests failed? -> Old version replaced, need rollback
    - Deploy and smoke passed but something is wrong? -> Check Coralogix, then rollback if needed

    ### Rolling back production
    Two options:
    1. Redeploy previous version via workflow_dispatch (preferred):
       - Go to Actions -> Deploy to Production -> Run workflow
       - Enter the SHA of the last known-good commit in the ref field
       - Find last known-good: git log --oneline (look for the commit before the bad deploy)
       - Approve the deployment when prompted
       - Smoke tests run automatically after deploy

    2. Wrangler CLI (emergency, bypasses CD):
       - wrangler rollback (rolls back to immediately previous version)
       - Verify: curl https://wrl.your-domain.workers.dev/health
       - Note: wrangler rollback only goes back ONE version

    ### Important: Secrets are NOT rolled back
    Worker secrets (CAPTURE_API_KEY, SIGNING_KEY, etc.) are not versioned with code.
    If a deployment included a secret rotation AND a code change that depends on the new
    secret format, rolling back code alone will break things. You must also revert secrets:
      wrangler secret put CAPTURE_API_KEY
    (Paste the old value when prompted)

    ### After a rollback
    - Verify via smoke test or manual curl
    - Fix the issue on a branch, merge to main, let the normal CD pipeline handle it
    - The rollback is temporary -- the next push to main triggers a new production deploy

    ## Manual Deploy (Emergency)
    Bypass the CD pipeline entirely:
      npx wrangler deploy
    This deploys whatever is in your local checkout to production. Use only when
    GitHub Actions is down or the pipeline is broken.

    ## GitHub Environment Setup
    Production secrets (set in GitHub Settings -> Environments -> production):
    - CLOUDFLARE_API_TOKEN (production-scoped Cloudflare API token)
    - WRL_PROD_CAPTURE_API_KEY
    - WRL_PROD_SIGNING_KEY
    - WRL_PROD_CORALOGIX_SEND_KEY
    - WRL_PROD_IP_HASH_SEED
    Production variables:
    - WRL_PROD_BASE_URL (production Worker URL)

    Protection rules:
    - Required reviewer: (repo owner)
    - Deployment branches: main branch
    ```

    Adapt the above structure as you see fit for readability and concision. The key requirement is: scannable, copy-pasteable commands, under 120 lines, written for a single operator under stress.

    **File 3: Update `README.md`** -- Add a one-line reference to OPERATIONS.md in an appropriate section:
    ```markdown
    See [OPERATIONS.md](OPERATIONS.md) for rollback procedures and operational runbook.
    ```
    Find the right place in the existing README structure for this link.

    ### What NOT to do

    - Do NOT modify `scripts/smoke-test.sh` -- it works as-is
    - Do NOT modify `wrangler.toml` -- top-level config is already production
    - Do NOT add `[env.production]` to wrangler.toml
    - Do NOT add tag triggers (`push: tags:`) -- only `push: branches: [main]` and `workflow_dispatch`
    - Do NOT add automatic rollback logic -- manual rollback is the intentional choice
    - Do NOT add version checks, response time assertions, or other smoke test enhancements
    - Do NOT add a wait timer to the environment protection config notes -- approval alone is sufficient
    - Do NOT create separate rollback or health-check workflows
    - Do NOT add Slack/email notification steps

    ### Security requirements (from security-minion review)

    - Production secrets MUST be scoped to the `production` GitHub environment (document this in OPERATIONS.md)
    - Production Cloudflare API token should be separate from staging (same secret name `CLOUDFLARE_API_TOKEN` in each environment scope)
    - Pin all actions to full commit SHAs matching the staging workflow
    - Set workflow `permissions: contents: read, deployments: write`
    - The `OPERATIONS.md` must document that secrets are NOT rolled back with code

    ### Reference files to read

    Read these files to understand the existing patterns:
    - `.github/workflows/deploy-staging.yml` -- the staging workflow to mirror
    - `scripts/smoke-test.sh` -- the smoke test script (do not modify)
    - `wrangler.toml` -- deployment configuration (do not modify)
    - `README.md` -- to add the OPERATIONS.md link

- **Deliverables**:
    1. `.github/workflows/deploy-production.yml` (~80-100 lines YAML)
    2. `OPERATIONS.md` (80-120 lines)
    3. `README.md` (one-line addition linking to OPERATIONS.md)
- **Success criteria**:
    - Workflow has 3 jobs: staging-smoke -> deploy (with `environment: production`) -> smoke
    - Workflow triggers on push to main and workflow_dispatch
    - workflow_dispatch accepts optional `ref` input for rollbacks
    - All actions pinned to same SHAs as staging workflow
    - Production smoke uses `SMOKE_SKIP_CAPTURE: "1"`
    - OPERATIONS.md covers rollback (including secret caveat), deploy flow, and emergency manual deploy
    - OPERATIONS.md is under 120 lines
    - README links to OPERATIONS.md

### Cross-Cutting Coverage

- **Testing**: Covered by Phase 6 (post-execution test validation). The existing test suite and smoke test need no modifications. The workflow reuses `scripts/smoke-test.sh` as-is. No new test code is being written, so Phase 6 runs the existing suite to confirm no regressions.
- **Security**: security-minion's requirements are embedded directly in Task 1's prompt: environment-scoped secrets, separate tokens, SHA-pinned actions, minimal permissions. No separate security task needed -- the security constraints are implementation requirements, not a separate deliverable.
- **Usability -- Strategy**: ux-strategy-minion's recommendations drove the architectural decisions (Conflict 2 and Conflict 3). Option D (staging-first with approval gate, no tags) is the implemented design. No separate UX task needed.
- **Usability -- Design**: Not applicable. No user-facing interfaces are being built. The GitHub Actions UI is the interface, and it is GitHub's responsibility.
- **Documentation**: OPERATIONS.md is produced as part of Task 1. software-docs-minion and user-docs-minion coverage happens in Phase 8 (post-execution documentation).
- **Observability**: Not applicable for this phase. The workflow uses GitHub Actions' native logging and deployment status. Coralogix observability for the Worker itself already exists. No new runtime components are being added.

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
    - user-docs-minion: OPERATIONS.md is a user-facing operational document; review ensures it serves the "tired operator at 2am" audience effectively (Task 1, File 2)
- **Not selected**: ux-design-minion (no UI), accessibility-minion (no web UI), sitespeed-minion (no web-facing runtime changes), observability-minion (no new runtime components; existing Coralogix pipeline unchanged)

### Conflict Resolutions

See top of document -- three conflicts resolved:
1. **Staging gate**: self-contained workflow (iac-minion's approach) over workflow_run (test-minion's)
2. **Tag triggers**: dropped (ux-strategy-minion) in favor of push-to-main + workflow_dispatch (iac-minion's dispatch, without tags)
3. **Smoke test changes**: deferred (YAGNI) -- version check and response time both sent to backlog

### Risks and Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Production secrets not set before first deploy | Medium | OPERATIONS.md documents required secrets. Wrangler action fails fast with clear errors if secrets are missing. |
| Shared Cloudflare API token between environments | Medium | Document requirement for separate production-scoped token in OPERATIONS.md. Each GitHub environment holds its own `CLOUDFLARE_API_TOKEN`. |
| Staging smoke passes but production fails (env difference) | Low | Smoke test validates functional behavior (health, headers, signing key). Environment-specific R2/KV binding issues are inherent in multi-env setups. |
| No automatic rollback on failed production smoke | Low | Intentional for MVP. Manual rollback via workflow_dispatch documented in OPERATIONS.md. Backlog item: `[consider] auto-rollback when deploy frequency >1/day or team size >1`. |
| Dual workflow triggers (staging + production both fire on push to main) | Low | Production workflow runs its own staging smoke check independently. If staging is unhealthy, production workflow fails at Job 1. The two workflows are independent and do not conflict. |
| Documentation drift (OPERATIONS.md vs actual commands) | Low | Kept minimal and tied to fundamentals (wrangler deploy, git log). Fewer moving parts = less drift. |

### Execution Order

```
Batch 1: Task 1 (iac-minion: workflow + operations doc + README link)
  -- single task, no parallelism needed --
```

This is a single-task plan. One agent, three deliverables (workflow YAML, OPERATIONS.md, README update), all tightly coupled. Splitting into multiple tasks would create coordination overhead without benefit -- the workflow and its documentation should be written by the same agent to ensure consistency.

### Verification Steps

After Task 1 completes:
1. `deploy-production.yml` syntax is valid YAML and follows the same structure as `deploy-staging.yml`
2. All action SHAs match those in `deploy-staging.yml`
3. Workflow has three jobs with correct `needs:` dependencies
4. `environment: production` is set on the deploy job
5. `SMOKE_SKIP_CAPTURE: "1"` is set on the production smoke job
6. OPERATIONS.md exists, is under 120 lines, and covers rollback with the secrets caveat
7. README.md links to OPERATIONS.md

### Backlog Updates

After execution, add these items to `docs/backlog.md`:

**Operations section (new or update existing):**
- `[consider] Deploy version check in smoke test` -- Add `DEPLOY_SHA` to health endpoint and `SMOKE_EXPECT_VERSION` to smoke test. Trigger: when a deploy silently fails to update the Worker.
- `[consider] Smoke test response time assertion` -- Health check latency threshold from CI. Trigger: when Coralogix/RUM shows latency regression.
- `[consider] Automatic rollback on smoke failure` -- Auto-revert when production smoke fails. Trigger: when deploy frequency >1/day or team size >1.
- `[consider] Tag-based release versioning` -- `v*` tags for semantic versioning. Trigger: when external consumers need stable version references.
