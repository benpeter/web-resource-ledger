You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
Read the full task description from: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-BWG9Hx/per-tenant-api-keys-isolation/prompt.md

## Your Planning Question
The advisory specifies three admin endpoints (`POST/GET/DELETE /v1/admin/keys`). Design the request/response contracts for each endpoint:
1. What should `POST /v1/admin/keys` accept as input (tenantId, scopes, name) and return (including the one-time raw key display)?
2. What should `GET /v1/admin/keys` return and should it support filtering by tenant/scope?
3. What should `DELETE /v1/admin/keys/{keyHash}` return and how does soft-delete surface in subsequent GET responses?
4. How should the scope `capture implies read` be represented in the API contract?
5. How should 403 responses name the required scope per the advisory decision?
6. Should revoked keys appear in GET responses by default or require an explicit `?include=revoked` filter?

Consider consistency with the existing v1 API patterns (RFC 9457 problem responses, `application/json` content type, existing auth flow, existing pagination pattern in `GET /v1/captures`).

## Context
Read these files: `openapi.yaml`, `src/responses.js`, `src/index.js`

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: api-design-minion

### Recommendations
### Proposed Tasks
### Risks and Concerns
### Additional Agents Needed

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-BWG9Hx/per-tenant-api-keys-isolation/phase2-api-design-minion.md`
