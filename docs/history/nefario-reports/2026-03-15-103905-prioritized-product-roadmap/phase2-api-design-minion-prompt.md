You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Advisory Context
This is an advisory-only orchestration. Your contribution will feed into a team recommendation, not an execution plan. Focus on analysis, trade-offs, and recommendations rather than implementation tasks.

## Project Task
Review backlog and produce a prioritized product roadmap for WRL (Web Resource Ledger), a tamper-evident web archival service on Cloudflare Workers.

## Your Planning Question
The MVP has 4 endpoints and the backlog's #1 API item is `GET /v1/captures` (list/search).

1. What should the list endpoint look like to be useful without over-engineering (filtering, pagination, sorting are all separate backlog items)?
2. Rate limit headers (`X-RateLimit-*`) are partially done -- what's the right scope for completing them?
3. Among the `[consider]` API items (webhooks, batch capture, SSE/WebSocket, CORS for capture POST), which would most improve the developer experience for realistic integration patterns?
4. How does the API need to evolve to support per-tenant keys without breaking the existing v1 contract?

Note: security-minion covers the threat model for per-tenant auth, and iac-minion covers infrastructure prerequisites -- keep your focus on the API contract, developer experience, and backward compatibility dimensions.

## Context
Read these files for context:
- `docs/backlog.md` -- API section
- `openapi.yaml` -- current API spec
- `src/index.js` -- current endpoint implementations

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that aren't already part of the planning, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: api-design-minion

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

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-oZkd87/prioritized-product-roadmap/phase2-api-design-minion.md`
