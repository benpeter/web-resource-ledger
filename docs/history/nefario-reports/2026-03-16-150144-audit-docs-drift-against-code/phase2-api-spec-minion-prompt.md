You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet -- you are providing your domain expertise
to help build a comprehensive plan.

## Project Task
Audit documentation for drift against recent code changes

**Outcome**: All project documentation accurately reflects the current state of the codebase after recent issues and PRs, so that developers and users aren't misled by stale instructions, outdated API references, or missing coverage for new features.

**Scope**:
- In: All documentation in the repo (README, docs/, inline API docs, configuration references), recent closed issues and merged PRs as the change source
- Out: Evolution log history (those are historical records, not living docs), external documentation hosted outside this repo

## Your Planning Question
Given the 9 routes currently implemented in `src/index.js` and the response shapes visible in the route handlers, what specific discrepancies exist between `openapi.yaml` and the actual code behavior? Pay particular attention to: (a) response schemas for the list captures endpoint (does the spec include `failedAt`, `error`, `retryable` fields for failed captures?), (b) the `/.well-known/signing-key` response shape now including `keyId`, (c) CORS headers on POST responses, (d) the `Link` header on all responses, (e) the `X-RateLimit-Limit` header, (f) `Cache-Control` header values per endpoint. Produce a line-by-line discrepancy list referencing spec line numbers and code locations.

## Context
Key files to read: `openapi.yaml`, `src/index.js`, `src/rate-limits.js`, `src/signing.js`, `src/kv.js` (for list captures response shape)

The project is a Cloudflare Worker (Web Resource Ledger) that captures and preserves web pages as WACZ bundles. It has 9 routes total. Recent PRs (51-57) added features like key versioning, CORS preflight, HSTS preload, X-RateLimit-Limit headers, staging environment, hashed IP logging, and auth identity enrichment.

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that aren't already part of the planning, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: api-spec-minion

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

6. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-ieySxD/audit-docs-drift-against-code/phase2-api-spec-minion.md
