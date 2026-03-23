You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task

Capture retrieval endpoints require tenant authentication, enforcing that tenants can only access their own captures. Share tokens allow tenants to grant access to specific captures without exposing their API key. Share tokens are stored in D1 and looked up by hash.

## Your Planning Question

Design the D1 migration for the share_tokens table. Consider:
(a) What columns are needed? At minimum: token_hash (SHA-256 of the raw token, like api_keys), capture_id (FK to captures), tenant_id (denormalized for audit), created_at, expires_at (nullable for permanent tokens).
(b) Should the lookup be by token_hash alone, or token_hash + capture_id?
(c) What indexes are needed for the query patterns: lookup by token_hash, cleanup of expired tokens, listing tokens per capture?
(d) Should there be a limit on tokens per capture?
(e) How does this interact with the existing captures table (tenant_id already there, used for ownership check)?

## Context
Read these files for full context:
- All migration files in migrations/ (0001-0009 for existing patterns)
- src/db.js (api_keys pattern as reference: hash-based lookup, similar structure)
- The captures table schema

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. Return your contribution in this format:

## Domain Plan Contribution: data-minion

### Recommendations
### Proposed Tasks
### Risks and Concerns
### Additional Agents Needed

5. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-a5gRQ7/capture-auth-gate-multi-tenant/phase2-data-minion.md
