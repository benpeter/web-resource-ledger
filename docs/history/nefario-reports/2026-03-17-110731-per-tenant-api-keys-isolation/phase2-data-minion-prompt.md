You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
Read the full task description from: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-BWG9Hx/per-tenant-api-keys-isolation/prompt.md

## Your Planning Question
The current KV model uses `capture:{captureId}` for primary records and `tenant:{tenantId}:ts:{ISO}:{captureId}` for the secondary index. The new auth model adds `apikey:{sha256hex}` records.
1. What is the correct KV schema for the key records (exact fields, TTLs)?
2. How should the existing capture records (which already have `tenantId: 'default'`) be treated -- do they need migration or are they already correctly tagged?
3. What consistency guarantees matter for key revocation (60s KV eventual consistency is accepted per advisory)?
4. Should key records have any expiration/TTL or persist indefinitely?
5. How should the `createdBy` field in key records work (admin key has no identity beyond "admin")?
6. What is the key count upper bound we should design for -- do we need a `tenant:{tenantId}:keys:` secondary index for listing keys, or is a full `apikey:` prefix scan acceptable?

## Context
Read these files: `src/kv.js`, `src/auth.js`

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: data-minion

### Recommendations
### Proposed Tasks
### Risks and Concerns
### Additional Agents Needed

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-BWG9Hx/per-tenant-api-keys-isolation/phase2-data-minion.md`
