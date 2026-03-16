MODE: META-PLAN

You are creating a meta-plan — a plan for who should help plan.

## Task

Combined task from issues #39 and #37:

### Issue #39: R9: Staging environment with automated deploy

Outcome: Every push to main is automatically deployed to a staging environment with isolated bindings, enabling validation before manual production deploy.

Success criteria:
- wrangler.toml has a staging environment with isolated KV namespace and R2 bucket
- GitHub Actions workflow deploys to staging on push to main
- Basic smoke test script validates staging deployment (health check + capture round-trip)
- Staging and production use separate API keys
- Staging environment accessible for manual testing

Scope:
- In: wrangler.toml env section, GitHub Actions workflow for staging deploy, smoke test script, separate staging secrets
- Out: Production CD automation (R14), preview deployments per PR, load testing

### Issue #37: R7: Content moderation policy and Terms of Service

Outcome: The operator has legal cover for stored content and an abuse reporting mechanism, which is required before any public promotion of WRL.

Success criteria:
- Terms of Service document published, prohibiting illegal use and outlining operator rights
- Content moderation policy published with abuse reporting mechanism (email or endpoint)
- ToS/policy accessible from API responses (Link header or dedicated endpoint)
- Documents reviewed for legal soundness (not legal advice — reasonable template)

Scope:
- In: ToS document, content moderation policy, abuse contact mechanism, linking from API/verification page
- Out: Automated content scanning (separate item), DMCA process, legal counsel engagement

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario/r9-r7-staging-and-tos

## External Skill Discovery
No external skills discovered. No .claude/skills/ or .skills/ directories contain SKILL.md files in the working directory.

## Codebase Context

This is a Cloudflare Worker project (JavaScript, Wrangler):
- `wrangler.toml`: Single environment with KV, R2, Browser, rate limiter bindings
- `src/index.js`: Route handler with health, capture, verify, signing-key endpoints
- `.github/workflows/ci.yml`: CI workflow running tests + lint on push/PR
- `src/auth.js`: Bearer API key auth (single key via CAPTURE_API_KEY env var)
- `src/verify-page.js`: Static HTML verification page
- `src/responses.js`: RFC 7807 problem+json responses
- Tests: vitest with @cloudflare/vitest-pool-workers
- No existing staging environment or deploy workflow

## Instructions
1. Read relevant files to understand the codebase context
2. No external skills were discovered.
3. Analyze the task against your delegation table
4. Identify which specialists should be CONSULTED FOR PLANNING
   (not execution — planning). These are agents whose domain
   expertise is needed to create a good plan.
5. For each specialist, write a specific planning question that
   draws on their unique expertise.
6. Return the meta-plan in the structured format.
7. Write your complete meta-plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-N3xSCR/staging-and-tos/phase1-metaplan.md`
