You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise
to help build a comprehensive plan.

## Project Task

Build WACZ bundling and Ed25519 signing for a Cloudflare Worker that captures web pages. After existing R2 artifacts (screenshot.png, rendered.html, headers.json) are stored in R2, construct WARC records, build a CDXJ index, compute SHA-256 hashes per artifact, assemble a `datapackage.json` manifest, compute a `bundleHash` from canonical JSON, sign with Ed25519, write a `.wacz` ZIP to R2 at `captures/{sha256}.wacz`, and update KV with capture metadata.

Key constraints:
- Cloudflare Worker runtime (128MB memory default, no filesystem)
- ctx.waitUntil() has 30s hard limit (current pipeline uses ~25s for browser rendering timeout)
- nodejs_compat flag enabled
- Existing dependency: @cloudflare/puppeteer

## Your Planning Question

Evaluate the runtime feasibility of WACZ bundling inside the existing `ctx.waitUntil()` pipeline. Specifically:
1. The current `performCapture()` runs browser rendering + artifact storage within the 30s `ctx.waitUntil()` budget. Adding WARC construction, SHA-256 hashing of all artifacts, ZIP assembly, Ed25519 signing, and a second R2 write -- is this feasible within the remaining time budget after rendering completes? What is a realistic time estimate for these operations on typical artifact sizes (HTML ~50KB, screenshot ~200KB, headers ~2KB)?
2. Should WACZ bundling happen inline after artifact storage in `performCapture()`, or as a separate sequential step?
3. ZIP construction in Workers: what library options exist that work without filesystem access? Is there a lightweight ZIP library that operates on ArrayBuffers/Uint8Arrays?
4. Memory constraints: constructing a ZIP in memory with all artifacts -- is this within Worker memory limits for typical captures?
5. Should we read artifacts back from R2 for bundling, or pass the in-memory artifacts directly from the rendering step to avoid an extra R2 read?

## Context

Current performCapture() in src/capture.js:
- Runs browser rendering and header fetch concurrently via Promise.allSettled
- Stores screenshot, html, headers in R2 at captures/{captureId}/
- Updates KV status to complete/failed
- NAV_TIMEOUT_MS = 25000 (leaves 5s headroom in 30s budget)
- MAX_PAGE_BYTES = 50MB, MAX_PAGE_HEIGHT = 8000px

wrangler.toml: R2 bucket (BUCKET), KV namespace (KV), browser binding (BROWSER), rate limiter

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
6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-K21mi7/mvp-step-4-wacz-bundling-signing/phase2-edge-minion.md`
