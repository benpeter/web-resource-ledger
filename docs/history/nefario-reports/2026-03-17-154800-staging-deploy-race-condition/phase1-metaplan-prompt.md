MODE: META-PLAN

You are creating a meta-plan — a plan for who should help plan.

## Task

<github-issue>
## Outcome

The production deploy workflow (`deploy-production.yml`) is guaranteed to smoke-test the *current* staging deployment — not a stale version from a previous push. The race condition between `deploy-staging.yml` and `deploy-production.yml` (both triggered by `push: branches: [main]`) is eliminated.

## Success criteria

- `deploy-production.yml` only runs its staging-smoke gate after the staging deploy for the same commit has completed successfully
- No change to the branching model (single-branch, push-to-main stays)
- OPERATIONS.md updated if workflow triggers change
- OPERATIONS.md documents `workflow_dispatch` on `deploy-staging.yml` for ad-hoc staging deploys

## Scope

**In:** Workflow trigger ordering (`workflow_run` or commit-SHA verification), OPERATIONS.md updates, documenting ad-hoc staging deploy via `workflow_dispatch`

**Out:** Staging branch, tag-based promotion, production capture smoke (`SMOKE_SKIP_CAPTURE`), `/health` endpoint changes (unless needed for SHA verification)

## Context

The nefario advisory ([2026-03-17 report](docs/history/nefario-reports/2026-03-17-021553-staging-branch-deploy-strategy.md)) evaluated whether to introduce a staging branch. All five specialists unanimously recommended against it — the current single-branch model already provides staging-before-production safety.

However, they identified one genuine gap: both deploy workflows trigger on `push: branches: [main]` with no formal ordering. The production workflow's `staging-smoke` job can run before the staging deploy completes, testing stale code. This is the one safety property the current model doesn't fully deliver.

### Options identified by the advisory

1. **`workflow_run` trigger** — `deploy-production.yml` triggers on `deploy-staging.yml` completion instead of `push`. Guarantees ordering. Trade-off: production deploy no longer appears in the same Actions run as the push.
2. **Commit-SHA verification** — Staging smoke step checks that the `/health` endpoint reports the expected commit SHA before proceeding. Requires adding SHA to the health response. Trade-off: adds a polling loop and a code change.

### Related decisions

- Staging branch model evaluated and rejected (see advisory report)
- Re-evaluate branching model if team size > 1
</github-issue>

## Working Directory

/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/staging-deploy-race-condition

## Key codebase context

### deploy-staging.yml (current)
- Triggers on `push: branches: [main]` and `workflow_dispatch`
- Jobs: test -> deploy (wrangler, env staging) -> smoke (smoke-test.sh against staging URL)

### deploy-production.yml (current)
- Triggers on `push: branches: [main]` and `workflow_dispatch` (with optional ref input)
- Jobs: staging-smoke (runs smoke-test.sh against staging URL) -> deploy (wrangler to production) -> smoke (production smoke, SMOKE_SKIP_CAPTURE=1)
- The staging-smoke job has NO dependency on deploy-staging.yml completing first

### OPERATIONS.md
- Documents the deploy pipeline, rollback procedures, secret surfaces
- Will need updates if workflow triggers change

### scripts/smoke-test.sh
- Checks: /health, security headers, signing-key, capture round-trip (optional)
- Currently does NOT verify commit SHA

## External Skill Discovery

No external skills detected in .claude/skills/ or .skills/.

## Instructions
1. Read relevant files to understand the codebase context
2. Discover external skills:
   a. Scan .claude/skills/ and .skills/ in the working directory for SKILL.md files
   b. Read frontmatter (name, description) for each discovered skill
   c. For skills whose description matches the task domain, classify as
      ORCHESTRATION or LEAF (see External Skill Integration in your Core Knowledge)
   d. Check the project's CLAUDE.md for explicit skill preferences
   e. Include discovered skills in your meta-plan output
3. Analyze the task against your delegation table
4. Identify which specialists should be CONSULTED FOR PLANNING
   (not execution — planning). These are agents whose domain
   expertise is needed to create a good plan.
5. For each specialist, write a specific planning question that
   draws on their unique expertise.
6. Return the meta-plan in the structured format.
7. Write your complete meta-plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-xrXhca/staging-deploy-race-condition/phase1-metaplan.md`
