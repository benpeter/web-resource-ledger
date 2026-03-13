MODE: META-PLAN

You are creating a meta-plan — a plan for who should help plan.

## Task

<github-issue>
## Goal
A Worker that responds to HTTP requests with health check passing in wrangler dev and deployed.

## Context
This is the foundation. Nothing exists yet. This step establishes the project scaffold, test infrastructure, and shared error utilities that all subsequent steps build on.

## Work Items
- [ ] `wrangler.toml` with Worker name, R2 bucket binding, KV namespace binding, and Browser Rendering binding
- [ ] Vanilla JS Worker entry point with minimal route dispatch (method + path matching)
- [ ] `GET /health` returns `{ "status": "ok" }` with HTTP 200
- [ ] RFC 9457 `application/problem+json` error response pattern established as shared utility
- [ ] Vitest + `@cloudflare/vitest-pool-workers` configured so tests run inside the Miniflare runtime
- [ ] Verify `wrangler dev` starts without errors
- [ ] Verify `vitest run` passes

## Acceptance Criteria
- `curl http://localhost:8787/health` returns HTTP 200 with `{"status":"ok"}`
- `vitest run` passes with at least one test for the health endpoint
- `wrangler dev` starts without errors

## Dependencies
- Blocked by: none
- Blocks: #2

## Technical Notes
- Use plain JavaScript, not TypeScript
- Tests must run inside the Miniflare runtime (via `@cloudflare/vitest-pool-workers`), not in Node
- RFC 9457 error shape: `{ type, title, status, detail }` with `Content-Type: application/problem+json` — establish this as a shared utility now so all subsequent steps use it consistently
</github-issue>

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger

## Project Context
This is the WRL (Web Resource Ledger) project — a Cloudflare Worker-based service for capturing and verifying web resources. The project is brand new — only planning documents exist (docs/MVP.md, docs/evolution/). No code has been written yet.

Key constraints from CLAUDE.md and MVP.md:
- Helix Manifesto: YAGNI, KISS, Lean and Mean
- Plain JavaScript, not TypeScript
- Vanilla-first (no frameworks)
- Cloudflare-native serverless stack
- Tests in Miniflare runtime via @cloudflare/vitest-pool-workers

## External Skill Discovery
Before analyzing the task, scan for project-local skills. If skills are
discovered, include an "External Skill Integration" section in your meta-plan
(see your Core Knowledge for the output format).

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
7. Write your complete meta-plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-Awa7DQ/mvp-step-1-project-scaffold-cloudflare-worker/phase1-metaplan.md`
