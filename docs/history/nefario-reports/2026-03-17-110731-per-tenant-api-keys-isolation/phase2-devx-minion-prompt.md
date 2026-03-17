You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
Read the full task description from: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-BWG9Hx/per-tenant-api-keys-isolation/prompt.md

## Your Planning Question
The admin API will initially be consumed via curl or a future thin CLI.
1. What curl examples should be included in the migration runbook and OpenAPI spec for each admin endpoint?
2. How should the one-time key display work in practice -- the POST response shows the raw key once, and the operator must capture it. What is the best UX for this pattern in a JSON API (specific response field naming, warning text in the response body)?
3. Should the admin API use a different auth header format (e.g., `X-Admin-Key` vs `Authorization: Bearer`) to prevent operators from accidentally using their admin key as a capture key?
4. Error messages for admin operations need to be actionable -- for each error case (missing required field, invalid scope, key not found, already revoked), what is the most developer-friendly error message pattern?
5. Should the admin API return the key hash in create/list responses to make DELETE easier (the operator needs the hash to delete, but they receive the raw key at creation time)?

## Context
Read these files: `openapi.yaml`, `OPERATIONS.md`, `src/responses.js`

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: devx-minion

### Recommendations
### Proposed Tasks
### Risks and Concerns
### Additional Agents Needed

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-BWG9Hx/per-tenant-api-keys-isolation/phase2-devx-minion.md`
