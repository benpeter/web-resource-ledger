You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise
to help build a comprehensive plan.

## Project Task
OpenAPI spec completion, security hardening, and signing-key endpoint for a Cloudflare Worker-based web resource ledger service. All API endpoints exist (Steps 3-7 complete). This step hardens the service for production.

Work items include:
- Security headers added to all responses: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`
- DNS pinning enforcement verified: Worker refuses to proceed if pre-resolution returns a private IP (defense-in-depth check)
- `GET /.well-known/signing-key` returns current Ed25519 public key

## Your Planning Question
The Worker already sets `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer` globally. The verify-page independently sets `X-Frame-Options: DENY` and a strict CSP. Three questions: (1) What HSTS parameters for a Cloudflare Worker (max-age, includeSubDomains, preload)? The backlog deferred this from Step 7. (2) Should we consolidate the verify-page's independent headers into the global wrapper, or keep them separate given the CSP is page-specific? (3) The "DNS pinning enforcement verified" item -- `url-validation.js` already blocks private IPs pre-resolution but Cloudflare's Browser Rendering re-resolves DNS independently (TOCTOU). Is additional enforcement possible, or is this a test/documentation task?

## Context
Read these files for context:
- /Users/ben/github/benpeter/web-resource-ledger/src/index.js (lines 48-50 for global headers)
- /Users/ben/github/benpeter/web-resource-ledger/src/url-validation.js
- /Users/ben/github/benpeter/web-resource-ledger/src/verify-page.js (headers)
- /Users/ben/github/benpeter/web-resource-ledger/src/capture.js
- /Users/ben/github/benpeter/web-resource-ledger/docs/backlog.md

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that
   aren't already part of the planning, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: security-minion

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

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-RcvJmc/openapi-spec-security-hardening/phase2-security-minion.md`
