You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise
to help build a comprehensive plan.

## Project Task
Should we create a separate branch, say staging, that deploys to staging when merges happen, and only main deploys to prod?

## Advisory Context
This is an advisory-only orchestration. Your contribution will feed
into a team recommendation, not an execution plan. Focus on analysis,
trade-offs, and recommendations rather than implementation tasks.

## Your Planning Question
Given all four workflows currently trigger on `push: branches: [main]`, what are the concrete workflow changes needed for a staging-branch model? How does the production workflow's `staging-smoke` gate change? What are the failure modes (branch divergence, hotfix bypass, merge conflicts)?

## Context
Read the following files for full context:
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario-advisory-branch-envs/.github/workflows/deploy-staging.yml
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario-advisory-branch-envs/.github/workflows/deploy-production.yml
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario-advisory-branch-envs/.github/workflows/ci.yml
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario-advisory-branch-envs/wrangler.toml
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario-advisory-branch-envs/OPERATIONS.md

Key facts:
- Solo developer project (single maintainer)
- Cloudflare Workers deployed via wrangler
- wrangler.toml: top-level = production, [env.staging] = staging
- Staging: fully isolated KV, R2, rate limiters, Coralogix
- deploy-production.yml: runs staging-smoke gate BEFORE deploying to prod
- GitHub environments: production (reviewer gate), staging (no approval)
- Engineering philosophy: YAGNI, KISS, Lean and Mean

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
6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-jbkVHU/staging-branch-deploy-strategy/phase2-iac-minion.md`
