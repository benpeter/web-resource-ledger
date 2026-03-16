You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise
to help build a comprehensive plan.

## Project Task
Production CD pipeline with environment protection for WRL (Cloudflare Workers).

**Outcome**: Production deployments are reproducible, gated by approval, and have rollback capability.

**Success criteria**:
- GitHub Actions workflow for production deploy (triggered by tag or manual dispatch)
- GitHub environment protection rules require approval before production deploy
- Post-deploy health check validates the deployment (smoke test against production)
- Rollback procedure documented and tested (previous version tag)
- Staging smoke tests pass before production deploy is permitted

**Scope**:
- In: GitHub Actions production workflow, environment protection rules, post-deploy health check, rollback documentation
- Out: Blue-green deployment, canary releases, infrastructure-as-code for environments

## Your Planning Question
Design the `deploy-production.yml` workflow. Key decisions: (1) Trigger strategy -- tag push (`v*`), `workflow_dispatch`, or both? (2) How to enforce "staging smoke tests pass first" -- call the staging workflow, use `workflow_run`, or a separate gate step? (3) Separate `CLOUDFLARE_API_TOKEN` for production vs. shared token? (4) GitHub environment protection rules (required reviewers, wait timers, deployment branches)? (5) Rollback mechanism -- `wrangler rollback` via `workflow_dispatch`, or redeploy a previous tag? (6) Should `wrangler.toml` gain an explicit `[env.production]` or keep using top-level defaults?

## Context
Read the following files for existing infrastructure:
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario/r14-cd-pipeline/.github/workflows/deploy-staging.yml
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario/r14-cd-pipeline/.github/workflows/ci.yml
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario/r14-cd-pipeline/wrangler.toml
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario/r14-cd-pipeline/scripts/smoke-test.sh
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario/r14-cd-pipeline/package.json

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that
   aren't already part of the planning, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: iac-minion

### Recommendations
<your expert recommendations for this aspect of the task>

### Proposed Tasks
<specific tasks that should be in the execution plan>
For each task: what to do, deliverables, dependencies

### Risks and Concerns
<things that could go wrong from your domain perspective>

### Additional Agents Needed
<any specialists not yet involved who should be, and why>
(or "None" if the current team is sufficient)
6. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-1qY3H1/cd-pipeline/phase2-iac-minion.md
