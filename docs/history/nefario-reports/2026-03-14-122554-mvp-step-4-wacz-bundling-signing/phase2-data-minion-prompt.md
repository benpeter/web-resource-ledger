You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise
to help build a comprehensive plan.

## Project Task

Build WACZ bundling and Ed25519 signing for a Cloudflare Worker that captures web pages. After existing R2 artifacts (screenshot.png, rendered.html, headers.json) are stored, construct WARC records, build a CDXJ index, compute SHA-256 hashes per artifact, assemble a `datapackage.json` manifest, compute a `bundleHash` from canonical JSON, sign with Ed25519, write a `.wacz` ZIP to R2 at `captures/{sha256}.wacz`, and update KV with capture metadata.

Key constraints:
- Cloudflare Worker runtime (no filesystem, streaming constraints)
- Existing artifacts in R2: captures/{captureId}/screenshot.png, rendered.html, headers.json
- nodejs_compat flag enabled
- Content-addressed storage: captures/{sha256}.wacz

## Your Planning Question

Plan the data structure and file layout for the WACZ bundle. Specifically:
1. What should the WARC records look like for our three artifact types (rendered HTML, screenshot PNG, headers JSON) -- which WARC record types (warcinfo, resource, response, metadata) map to each artifact?
2. How should the CDXJ index be generated from the WARC records -- what fields are mandatory for WACZ compliance?
3. What is the exact structure of `datapackage.json` for our use case -- which fields are required vs optional in the WACZ spec?
4. How should per-artifact SHA-256 hashes be structured in the manifest -- hash of the raw artifact bytes, or hash of the WARC record containing the artifact?
5. What is the correct ZIP structure for a WACZ file (directory layout, compression settings)?
6. Does `warcio.js` work in the Cloudflare Workers runtime, or will we need to handle WARC record construction manually? Assess compatibility with the Workers environment (no filesystem, streaming constraints).

## Context

This is a Cloudflare Worker project. Current capture flow stores screenshot.png (~200KB), rendered.html (~50KB), and headers.json (~2KB) in R2. Step 4 packages these into a WACZ bundle. The WACZ format is based on the Web Archive Collection Zipped format. The signatures array is designed to accommodate future RFC 3161 TSA timestamps.

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that
   aren't already part of the planning, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: data-minion

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
6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-K21mi7/mvp-step-4-wacz-bundling-signing/phase2-data-minion.md`
