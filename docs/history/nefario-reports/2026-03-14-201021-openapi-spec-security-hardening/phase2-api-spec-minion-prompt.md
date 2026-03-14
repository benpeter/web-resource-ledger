You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise
to help build a comprehensive plan.

## Project Task
OpenAPI spec completion, security hardening, and signing-key endpoint for a Cloudflare Worker-based web resource ledger service. All API endpoints exist (Steps 3-7 complete). This step hardens the service for production.

Work items include:
- `openapi.yaml` documents all four endpoints (`POST /v1/captures`, `GET /v1/captures/{id}/status`, `GET /v1/captures/{id}`, `GET /v1/verify/{id}`) with request/response schemas, RFC 9457 error shapes, auth requirements, and rate limit annotations
- `GET /.well-known/signing-key` endpoint specification
- OpenAPI validation tooling

## Your Planning Question
The existing `openapi.yaml` (634 lines) covers the four main endpoints with shared components for RFC 9457 errors, security schemes, and reusable headers. Two additions are needed: (a) the verification endpoint `GET /v1/verify/{captureId}` which returns either JSON or HTML based on Accept header (content negotiation), and (b) the new `GET /.well-known/signing-key` endpoint. What is the right way to spec content-negotiated responses in OpenAPI 3.1? Should the verification response schema cover the HTML response or only the JSON contract? What validation tooling should be added (the issue mentions `openapi-validator` or equivalent CLI)?

## Context
Read these files for context:
- /Users/ben/github/benpeter/web-resource-ledger/openapi.yaml
- /Users/ben/github/benpeter/web-resource-ledger/src/index.js (routes and response shapes)
- /Users/ben/github/benpeter/web-resource-ledger/src/verify-page.js (HTML response)
- /Users/ben/github/benpeter/web-resource-ledger/src/signing.js (key derivation)

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that
   aren't already part of the planning, say so and explain why
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

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-RcvJmc/openapi-spec-security-hardening/phase2-api-spec-minion.md`
