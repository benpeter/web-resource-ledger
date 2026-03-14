You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise
to help build a comprehensive plan.

## Project Task
OpenAPI spec completion, security hardening, and signing-key endpoint for a Cloudflare Worker-based web resource ledger service. All API endpoints exist (Steps 3-7 complete). This step hardens the service for production.

Work items include:
- Global backpressure handler: returns 503 with `Retry-After` header when Worker concurrency limit is approached

## Your Planning Question
The issue asks for 503 with `Retry-After` when Worker concurrency limit is approached, but Cloudflare Workers don't expose a concurrency gauge to Worker code. Rate limiting already exists per-IP. What's actually feasible? Options: (a) global-key rate limiter, (b) Durable Object counter, (c) accept platform-level 503 and document it, (d) other. Project philosophy is YAGNI/KISS -- prefer the simplest approach that meets production needs.

## Context
Read these files for context:
- /Users/ben/github/benpeter/web-resource-ledger/wrangler.toml (rate limiter config)
- /Users/ben/github/benpeter/web-resource-ledger/src/index.js
- /Users/ben/github/benpeter/web-resource-ledger/CLAUDE.md (engineering philosophy)

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that
   aren't already part of the planning, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: edge-minion

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

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-RcvJmc/openapi-spec-security-hardening/phase2-edge-minion.md`
