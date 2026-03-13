You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise
to help build a comprehensive plan.

## Project Task

Build a capture endpoint with isolated browser rendering and KV-backed status tracking for a Cloudflare Worker ("wrl"). This includes:
- Capture ID: cap_ + crypto.randomUUID() (hyphens stripped)
- KV status tracking: pending on accept, updated to complete or failed on resolution
- GET /v1/captures/{id}/status reads KV and returns { "status": "pending"|"complete"|"failed" }
- RFC 9457 404 for unknown capture IDs
- Browser Rendering captures screenshot (PNG) and rendered HTML -- these go to R2 in Step 4

## Your Planning Question

1. KV key structure -- bare capture ID (e.g., `cap_abc123`) or namespaced (e.g., `status:cap_abc123`)?
2. Value shape -- minimal `{ status: "pending" }` or include metadata for Step 4 (e.g., url, createdAt, ip)?
3. TTL for stuck captures -- should pending captures expire?
4. KV eventual consistency vs "returns pending immediately" acceptance criterion -- is there a race?

## Context

- `wrangler.toml` has `[[kv_namespaces]] binding = "KV"` (single KV namespace).
- The same KV namespace may be used for other things later.
- Step 4 (WACZ bundling) and Step 5 (signing/verification) will read capture data.
- Capture ID is the access secret -- there is no list endpoint in MVP.
- R2 bucket (BUCKET binding) exists for binary storage (screenshots, HTML).

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

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-z2mJgp/mvp-step-3-capture-endpoint-browser-rendering/phase2-data-minion.md`
