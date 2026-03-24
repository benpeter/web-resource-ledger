You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
Phase 0062 added tenant auth to all capture GET endpoints, which broke the public verify page, CLI verifier, and the "anyone can verify" value proposition. The proposal is to simplify the access model by making individual capture access public (128-bit IDs as capability tokens), keeping list endpoint authed, and removing the share token system entirely.

## Your Planning Question
The OpenAPI spec (openapi.yaml) currently documents share token authentication (shareToken security scheme), the POST /v1/captures/{captureId}/share endpoint, and ?token= query parameters on capture GET endpoints. How should the spec be updated to reflect the simplified model where individual capture access is public?

Specifically:
(a) Should the shareToken security scheme be removed entirely or replaced with a note about ID-as-capability?
(b) How should the GET capture endpoints document that they are unauthenticated?
(c) The spec uses RFC 7807 problem responses for 401 on these endpoints — those would change to just 404 for not-found. What spec sections need updating?
(d) Are there SDK generation implications from removing the share endpoint?

## Context
Read these files:
- openapi.yaml (current spec, especially share-related sections)
- The target endpoint auth matrix (in task description above)

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that aren't already part of the planning, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: api-spec-minion

### Recommendations
### Proposed Tasks
### Risks and Concerns
### Additional Agents Needed

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-jZS5XC/simplify-capture-access-model/phase2-api-spec-minion.md`
