You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
Read the full task description from: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-BWG9Hx/per-tenant-api-keys-isolation/prompt.md

## Your Planning Question
This change introduces a new auth model, new admin endpoints, new secrets, and a migration runbook.
1. Which documents need updating? Enumerate: `openapi.yaml` (new admin endpoints, new security scheme for admin), `OPERATIONS.md` (new secrets: ADMIN_KEY, migration runbook), `README.md` (onboarding flow changes -- new secrets), possibly `SECURITY.md` or `TERMS.md`.
2. What should the OpenAPI spec version bump be (currently 0.4.0)?
3. How should the migration runbook be structured within OPERATIONS.md -- as a new section or a standalone document?
4. Should the admin API security scheme in OpenAPI be a separate scheme from the existing bearerAuth, since admin uses a different credential?
5. Does the evolution log entry need anything beyond the standard structure (prompt.md, decisions.md, outcome.md)?

## Context
Read these files: `openapi.yaml`, `OPERATIONS.md`, `README.md`, `docs/evolution/README.md`, `docs/backlog.md`

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: software-docs-minion

### Recommendations
### Proposed Tasks
### Risks and Concerns
### Additional Agents Needed

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-BWG9Hx/per-tenant-api-keys-isolation/phase2-software-docs-minion.md`
