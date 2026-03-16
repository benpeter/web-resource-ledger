MODE: META-PLAN

You are creating a meta-plan — a plan for who should help plan.

## Task
<github-issue>
**Outcome**: Production deployments are reproducible, gated by approval, and have rollback capability — required before external users depend on WRL uptime.

**Success criteria**:
- GitHub Actions workflow for production deploy (triggered by tag or manual dispatch)
- GitHub environment protection rules require approval before production deploy
- Post-deploy health check validates the deployment (smoke test against production)
- Rollback procedure documented and tested (previous version tag)
- Staging smoke tests pass before production deploy is permitted

**Scope**:
- In: GitHub Actions production workflow, environment protection rules, post-deploy health check, rollback documentation
- Out: Blue-green deployment, canary releases, infrastructure-as-code for environments

**Constraints**:
- R9 (staging environment) should exist first for pre-production validation
- Ship before first external user onboarding
</github-issue>

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario/r14-cd-pipeline

## Existing Infrastructure Context
- Cloudflare Workers project (wrangler.toml has staging env, no production env section)
- Existing CI workflow: .github/workflows/ci.yml (tests + lint on PRs and pushes to main)
- Existing staging deploy: .github/workflows/deploy-staging.yml (test -> deploy via wrangler -> smoke test)
- Existing smoke test script: scripts/smoke-test.sh (health check, security headers, signing key, capture round-trip)
- Package scripts: npm test (vitest), npm run lint:api (redocly), npm run smoke
- Secrets pattern: CLOUDFLARE_API_TOKEN, WRL_STAGING_* secrets in GitHub

## External Skill Discovery
No external skills detected (.claude/skills/ and .skills/ are empty).

## Instructions
1. Read relevant files to understand the codebase context
2. No external skills discovered.
3. Analyze the task against your delegation table
4. Identify which specialists should be CONSULTED FOR PLANNING
   (not execution — planning). These are agents whose domain
   expertise is needed to create a good plan.
5. For each specialist, write a specific planning question that
   draws on their unique expertise.
6. Return the meta-plan in the structured format.
7. Write your complete meta-plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-1qY3H1/cd-pipeline/phase1-metaplan.md
