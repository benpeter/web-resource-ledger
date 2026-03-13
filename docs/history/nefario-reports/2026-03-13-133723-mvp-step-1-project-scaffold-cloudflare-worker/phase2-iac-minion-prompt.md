You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise
to help build a comprehensive plan.

## Project Task

Scaffold a Cloudflare Worker project for the WRL (Web Resource Ledger) MVP. This is Step 1 — nothing exists yet. Deliverables: wrangler.toml, vanilla JS Worker entry point with route dispatch, GET /health endpoint, RFC 9457 error utility, Vitest + @cloudflare/vitest-pool-workers test infrastructure.

Key constraints:
- Plain JavaScript, not TypeScript
- Helix Manifesto: YAGNI, KISS, Lean and Mean
- Cloudflare-native serverless stack
- Single Worker, R2 bucket, KV namespace, Browser Rendering bindings
- Manual deploy via `wrangler deploy` (no CI/CD)
- ~$5/month target cost

## Your Planning Question

What is the minimal `wrangler.toml` configuration for a Worker with R2, KV, and Browser Rendering bindings that works in both `wrangler dev` (local Miniflare) and production? What are the gotchas with binding declarations for resources that don't exist yet (R2 bucket, KV namespace not created)? Should we use `wrangler.toml` environments or keep it flat for MVP?

## Context

Technology stack from docs/MVP.md:
- API server: Cloudflare Worker
- Headless browser: Cloudflare Browser Rendering
- Blob storage: Cloudflare R2 (content-addressed keys)
- Metadata: Workers KV
- Deployment: `wrangler deploy` (manual)

The Worker will grow to handle 4 API endpoints plus health. This is the foundation step.

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that
   aren't already part of the planning, say so and explain why
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

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-Awa7DQ/mvp-step-1-project-scaffold-cloudflare-worker/phase2-iac-minion.md`
