You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise
to help build a comprehensive plan.

## Project Task

Fix the race condition between deploy-staging.yml and deploy-production.yml workflows.

Both workflows trigger on `push: branches: [main]`. The production workflow's `staging-smoke` job can run before the staging deploy completes, testing stale code. The goal is to guarantee that production's staging-smoke gate only proceeds after the staging deploy for the same commit has completed successfully.

Two options identified by a prior advisory:
1. **`workflow_run` trigger** — `deploy-production.yml` triggers on `deploy-staging.yml` completion instead of `push`. Guarantees ordering. Trade-off: production deploy no longer appears in the same Actions run as the push.
2. **Commit-SHA verification** — Staging smoke step checks that the `/health` endpoint reports the expected commit SHA before proceeding. Requires adding SHA to the health response. Trade-off: adds a polling loop and a code change.

### Success criteria
- `deploy-production.yml` only runs its staging-smoke gate after the staging deploy for the same commit has completed successfully
- No change to the branching model (single-branch, push-to-main stays)
- OPERATIONS.md updated if workflow triggers change
- OPERATIONS.md documents `workflow_dispatch` on `deploy-staging.yml` for ad-hoc staging deploys

### Scope
**In:** Workflow trigger ordering, OPERATIONS.md updates, documenting ad-hoc staging deploy via `workflow_dispatch`
**Out:** Staging branch, tag-based promotion, production capture smoke (`SMOKE_SKIP_CAPTURE`), `/health` endpoint changes (unless needed for SHA verification)

## Your Planning Question

Given the two options -- `workflow_run` trigger (deploy-production triggers on deploy-staging completion) vs. commit-SHA verification (polling `/health` for expected SHA) -- which approach is simpler and more reliable for a single-developer, push-to-main Cloudflare Workers project? Specifically: (a) With `workflow_run`, how does `workflow_dispatch` on deploy-production still work for rollbacks (the `ref` input)? (b) Does the production workflow correctly receive the commit SHA from the triggering staging run? (c) What are the edge cases (staging deploy failure, concurrent pushes, manual triggers)? Propose the concrete workflow YAML changes for the recommended approach.

## Context

Read these files for full context:
- `.github/workflows/deploy-staging.yml` — current staging workflow
- `.github/workflows/deploy-production.yml` — current production workflow
- `OPERATIONS.md` — current operations documentation
- `scripts/smoke-test.sh` — current smoke test script

Working directory: /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/staging-deploy-race-condition

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

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-xrXhca/staging-deploy-race-condition/phase2-iac-minion.md`
