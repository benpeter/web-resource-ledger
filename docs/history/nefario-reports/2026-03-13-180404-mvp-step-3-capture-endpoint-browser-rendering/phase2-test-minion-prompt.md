You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise
to help build a comprehensive plan.

## Project Task

Build a capture endpoint with isolated browser rendering and KV-backed status tracking for a Cloudflare Worker ("wrl"). This includes:
- POST /v1/captures: validate URL, check API key, return 202 Accepted
- Browser Rendering: screenshot (PNG) and rendered HTML via env.BROWSER Puppeteer binding
- KV status tracking: pending -> complete/failed
- GET /v1/captures/{id}/status endpoint
- Platform rate limiting

## Your Planning Question

1. Does `@cloudflare/vitest-pool-workers` provide a mock browser binding, or must we make browser interactions injectable? The vitest config already has `miniflare: { browserRendering: { binding: 'BROWSER' } }`.
2. Right decomposition between unit and integration tests for this feature?
3. How to test async `ctx.waitUntil()` and KV status transitions (pending -> complete)?
4. Should tests follow existing patterns? (Existing tests use `SELF.fetch()` for integration, direct imports for unit.)

## Context

Existing test patterns:
- `test/health.test.js`: Uses `SELF.fetch('https://example.com/health')` for integration tests
- `test/responses.test.js`: Direct imports for unit tests
- `test/url-validation.test.js`: Exists (comprehensive SSRF tests)
- `vitest.config.js`: Uses `defineWorkersConfig` with `poolOptions.workers.wrangler` and `miniflare.browserRendering`
- `package.json`: `"test": "vitest run"`, devDeps: `@cloudflare/vitest-pool-workers`, `vitest`, `wrangler`

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

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-z2mJgp/mvp-step-3-capture-endpoint-browser-rendering/phase2-test-minion.md`
