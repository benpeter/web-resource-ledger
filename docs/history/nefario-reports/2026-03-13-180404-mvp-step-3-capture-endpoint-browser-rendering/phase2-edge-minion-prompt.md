You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise
to help build a comprehensive plan.

## Project Task

Build a capture endpoint with isolated browser rendering and KV-backed status tracking for a Cloudflare Worker ("wrl"). This includes:
- POST /v1/captures: validate URL via existing SSRF module, return 202 Accepted
- Browser Rendering: navigate to DNS-pinned IP from pre-resolution, capture full-page screenshot (PNG) and rendered HTML
- Browser isolation: fresh incognito context per capture, 30s timeout, 50MB page limit, 200 subresource cap, context destroyed after completion
- HTTP response headers captured via a separate Workers fetch call to the same DNS-pinned URL
- KV status tracking: pending -> complete/failed
- Platform rate limiting (~10 captures/min, ~3 concurrent per IP) via wrangler.toml or Cloudflare dashboard

## Your Planning Question

1. What is the correct Puppeteer API sequence for Cloudflare Browser Rendering binding? (The binding is `env.BROWSER`)
2. How to enforce 50MB page limit and 200 subresource cap via Puppeteer/Browser Rendering?
3. How to construct the separate `fetch` using the DNS-pinned IP from validateUrl() result? (The url-validation module returns `{ ok: true, url, ip }` with a pre-resolved IP.)
4. What wrangler.toml rate limiting config achieves ~10/min, ~3 concurrent per IP?
5. What are the `ctx.waitUntil()` execution time limits for Browser Rendering on Workers?

## Context

Existing codebase:
- `wrangler.toml` already has `[browser] binding = "BROWSER"`, plus R2 `BUCKET` and `KV` bindings.
- `src/url-validation.js` returns `{ ok: true, url: string, ip: string }` on success -- the `ip` is the pre-resolved DNS result.
- `vitest.config.js` already configures `miniflare: { browserRendering: { binding: 'BROWSER' } }`.
- Workers standard: `export default { async fetch(request, env, ctx) { ... } }`
- The capture processing (browser rendering) should happen asynchronously after the 202 response.

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

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-z2mJgp/mvp-step-3-capture-endpoint-browser-rendering/phase2-edge-minion.md`
