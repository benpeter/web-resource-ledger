You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise
to help build a comprehensive plan.

## Project Task

Scaffold a Cloudflare Worker project for the WRL (Web Resource Ledger) MVP. This is Step 1 — nothing exists yet. Deliverables: wrangler.toml, vanilla JS Worker entry point with route dispatch, GET /health endpoint, RFC 9457 error utility, Vitest + @cloudflare/vitest-pool-workers test infrastructure.

Key constraints:
- Plain JavaScript, not TypeScript
- Helix Manifesto: YAGNI, KISS, Lean and Mean
- Tests MUST run inside the Miniflare runtime (via @cloudflare/vitest-pool-workers), not in Node

## Your Planning Question

What is the minimal Vitest + `@cloudflare/vitest-pool-workers` setup for plain JS? What does `vitest.config.js` look like? Colocated tests (e.g., `src/index.test.js`) vs. `test/` directory? How to test the Worker fetch handler in-process via Miniflare pool (SELF.fetch pattern)? Known compatibility issues between Vitest versions and the Cloudflare pool? What versions should we pin?

## Context

- Plain JS (not TS) — vitest config must be .js not .ts
- Miniflare runtime requirement — tests must run inside the workerd runtime, not Node
- Health endpoint is the first test (GET /health returns 200 with {"status":"ok"})
- ~20+ tests coming in later steps (SSRF vectors, signing round-trip, integration tests)
- The test infrastructure established here will be used by all 7 subsequent steps

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that
   aren't already part of the planning, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: test-minion

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

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-Awa7DQ/mvp-step-1-project-scaffold-cloudflare-worker/phase2-test-minion.md`
