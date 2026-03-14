You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise
to help build a comprehensive plan.

## Project Task
OpenAPI spec completion, security hardening, and signing-key endpoint for a Cloudflare Worker-based web resource ledger service. All API endpoints exist (Steps 3-7 complete). This step hardens the service for production.

Work items include:
- `GET /.well-known/signing-key` returns current Ed25519 public key (base64-encoded raw bytes) with appropriate caching headers
- Key rotation procedure documented in README

## Your Planning Question
`GET /.well-known/signing-key` returning Ed25519 public key. Design questions: (1) RFC 8615 compliance for `.well-known` registration? (2) Content-Type (text/plain? JWK JSON? application/octet-stream)? (3) Caching headers for a key that changes only on rotation? (4) Metadata (algorithm, key ID) or just raw bytes? Backlog mentions key versioning as [should] -- should the endpoint design anticipate that without implementing it?

## Context
Read these files for context:
- /Users/ben/github/benpeter/web-resource-ledger/src/signing.js
- /Users/ben/github/benpeter/web-resource-ledger/README.md (signing section)
- /Users/ben/github/benpeter/web-resource-ledger/docs/backlog.md (key versioning items)

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that
   aren't already part of the planning, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: api-design-minion

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

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-RcvJmc/openapi-spec-security-hardening/phase2-api-design-minion.md`
