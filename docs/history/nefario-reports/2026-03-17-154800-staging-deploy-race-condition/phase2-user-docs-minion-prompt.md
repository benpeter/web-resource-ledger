You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise
to help build a comprehensive plan.

## Project Task

Fix the race condition between deploy-staging.yml and deploy-production.yml workflows.

Both workflows trigger on `push: branches: [main]`. The production workflow's `staging-smoke` job can run before the staging deploy completes, testing stale code. The goal is to guarantee that production's staging-smoke gate only proceeds after the staging deploy for the same commit has completed successfully.

The likely solution is changing deploy-production.yml to use `workflow_run` trigger instead of `push`, which means the production workflow fires after the staging workflow completes rather than simultaneously.

### Success criteria
- OPERATIONS.md updated if workflow triggers change
- OPERATIONS.md documents `workflow_dispatch` on `deploy-staging.yml` for ad-hoc staging deploys

## Your Planning Question

What sections of OPERATIONS.md need to change if the production workflow's trigger changes from `push` to `workflow_run`? The issue scope also requires documenting `workflow_dispatch` on `deploy-staging.yml` for ad-hoc staging deploys. Review the current OPERATIONS.md and identify all sections that reference the deploy flow, manual triggers, or the staging-smoke relationship. What would the updated content look like?

## Context

Read these files for full context:
- `OPERATIONS.md` — current operations documentation
- `.github/workflows/deploy-staging.yml` — current staging workflow
- `.github/workflows/deploy-production.yml` — current production workflow

Working directory: /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/staging-deploy-race-condition

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that
   aren't already part of the planning, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: user-docs-minion

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

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-xrXhca/staging-deploy-race-condition/phase2-user-docs-minion.md`
