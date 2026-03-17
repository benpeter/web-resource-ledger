MODE: META-PLAN

You are creating a meta-plan — a plan for who should help plan.

## Task
Should we create a separate branch, say staging, that deploys to staging when merges happen, and only main deploys to prod?

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario-advisory-branch-envs

## Current State (pre-gathered context)

### Deployment Workflows
- `deploy-staging.yml`: triggers on `push: branches: [main]`, runs tests, deploys via `wrangler deploy --env staging`, runs smoke test
- `deploy-production.yml`: triggers on `push: branches: [main]`, runs staging smoke gate first, then deploys to prod, then runs prod smoke
- `ci.yml`: triggers on `push: branches: [main]` and `pull_request: branches: [main]`

### Infrastructure
- Cloudflare Workers with wrangler.toml: top-level = production, `[env.staging]` = staging
- Fully isolated staging: separate KV, R2, rate limiters, Coralogix logging
- GitHub environments: `production` (with reviewer gate), `staging` (no approval required)
- Solo developer project (single maintainer)

### Key Design Principles (from CLAUDE.md)
- YAGNI, KISS, Lean and Mean
- Ops reliability wins over elegance
- Solo developer — cognitive overhead matters

## External Skill Discovery
Scan .claude/skills/ and .skills/ in the working directory for SKILL.md files.

## Instructions
1. Read relevant files to understand the codebase context (context already gathered above)
2. Discover external skills
3. Analyze the task against your delegation table
4. Identify which specialists should be CONSULTED FOR PLANNING (not execution — planning). These are agents whose domain expertise is needed to create a good plan.
5. For each specialist, write a specific planning question that draws on their unique expertise.
6. Return the meta-plan in the structured format.
7. Write your complete meta-plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-jbkVHU/staging-branch-deploy-strategy/phase1-metaplan.md`
