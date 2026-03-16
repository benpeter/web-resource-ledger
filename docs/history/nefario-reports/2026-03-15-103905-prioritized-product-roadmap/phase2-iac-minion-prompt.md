You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Advisory Context
This is an advisory-only orchestration. Your contribution will feed into a team recommendation, not an execution plan. Focus on analysis, trade-offs, and recommendations rather than implementation tasks.

## Project Task
Review backlog and produce a prioritized product roadmap for WRL (Web Resource Ledger), a tamper-evident web archival service on Cloudflare Workers.

## Your Planning Question
The backlog has operational items spanning CI/CD enhancements, queue migration, scaling options, and storage considerations.

1. What infrastructure changes are prerequisites for other roadmap items (e.g., does per-tenant auth need D1 for key storage, or can KV handle it)?
2. The "Scaling Beyond Session Reuse" section lists 4 options (pre-warming, Queues, DO, Containers) -- at what scale threshold do these become relevant, and should any be planned proactively?
3. CD (deployment automation) is deferred -- when should it become a priority relative to other work?
4. Preview deployments on PRs -- worth it for a single-developer project?

Note: security-minion owns the auth sequencing and api-design-minion owns the API contract evolution -- focus on the infrastructure enablement and operational readiness that other agents' plans depend on.

## Context
Read these files for context:
- `docs/backlog.md` -- Operations, Storage, Scaling sections
- `wrangler.toml` -- current Cloudflare configuration
- `.github/workflows/` -- current CI setup

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that aren't already part of the planning, say so and explain why
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

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-oZkd87/prioritized-product-roadmap/phase2-iac-minion.md`
