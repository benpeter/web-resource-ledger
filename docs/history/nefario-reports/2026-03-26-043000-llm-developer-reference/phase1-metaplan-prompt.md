MODE: META-PLAN

You are creating a meta-plan — a plan for who should help plan.

## Task
<github-issue>
**Outcome**: A structured reference document exists that gives LLMs (and developers) the context needed to operate on WRL — D1 schema, API routes, KV namespaces, R2 buckets, env vars, and wrangler config — so that AI-assisted development sessions don't start with 10 minutes of codebase archaeology.

**Success criteria**:
- Document covers: D1 tables and columns, all API routes with methods, KV/R2 namespace names and purposes, environment variables and secrets (names only, not values), wrangler.toml bindings
- Clear separation between dev-only internals and public API surface
- Document lives in a location discoverable by LLMs (e.g., `llms.txt`, `CLAUDE.md` reference, or `docs/`)
- Accurate against current codebase (not stale)

**Scope**:
- In: D1 schema, API routes, bindings (KV, R2, DO), env vars, worker config
- Out: Public-facing API documentation (already on docs site), operational runbooks, architecture narratives
</github-issue>

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/snuggly-watching-perlis

## External Skill Discovery
Before analyzing the task, scan for project-local skills. If skills are
discovered, include an "External Skill Integration" section in your meta-plan.

Discovered skills:
- ops-runbook: WRL operational procedures — tenant management, D1 queries, secret rotation, Coralogix, Resend, Stripe, captures, deploys. Classification: LEAF (operational reference, not orchestration). Not directly relevant to this task but may contain useful D1/binding references.

## Instructions
1. Read relevant files to understand the codebase context
2. The external skill discovery is complete (see above)
3. Analyze the task against your delegation table
4. Identify which specialists should be CONSULTED FOR PLANNING (not execution — planning)
5. For each specialist, write a specific planning question
6. Return the meta-plan in the structured format
7. Write your complete meta-plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-Y7yIa9/llm-developer-reference/phase1-metaplan.md`
