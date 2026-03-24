MODE: META-PLAN

You are creating a meta-plan — a plan for who should help plan.

## Task
<github-issue>
**Outcome**: The existing /health endpoint returns build identity metadata (commit SHA, version, deploy timestamp, environment), enabling CI pipelines to confirm a specific commit is live after deploy and humans to instantly see what's running. This closes the verification gap where successful deploys cannot be confirmed without checking the Cloudflare dashboard.

**Success criteria**:
- GET /health response includes commit (full 40-char SHA), version (from package.json), env (production|staging), and deployedAt (ISO 8601 UTC)
- Existing status and legal fields preserved — no breaking changes
- CI smoke test asserts deployed commit matches $GITHUB_SHA (with retry loop for global rollout lag)
- Response includes Cache-Control: no-store
- Handler remains synchronous with zero I/O — no KV reads, no D1 queries
- Build metadata injected at deploy time via wrangler --define (burned into bundle, not runtime vars)
- Both deploy workflows (staging + production) updated to pass build metadata
- Response time stays under 10ms

**Scope**:
- In: handleHealth() response shape, wrangler.toml define stanza, deploy workflow changes (both envs), smoke-test.sh commit verification with retry
- Out: Deep health checks (D1/KV/R2 reachability), separate readiness endpoint, global version headers on all API responses, HTML/text format variants, new routes (reuse /health)

**Constraints**:
- Extend existing /health route — do not create a new route or /.well-known/ path
- Use wrangler --define for build metadata injection (not [vars], not secrets, not KV)
- Do not expose dependency versions, internal IDs, or infrastructure details
</github-issue>

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger

## External Skill Discovery
Before analyzing the task, scan for project-local skills. If skills are discovered, include an "External Skill Integration" section in your meta-plan (see your Core Knowledge for the output format).

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
7. Write your complete meta-plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-8ffwn7/extend-health-build-metadata/phase1-metaplan.md
