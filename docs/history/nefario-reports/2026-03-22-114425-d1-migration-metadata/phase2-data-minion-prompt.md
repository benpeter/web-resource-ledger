You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
WRL metadata (captures, tenants, API keys) moves from KV to Cloudflare D1, enabling SQL-based queries for pagination, filtering, and sorting. Clean migration with no dual-write complexity since there are no external users yet. KV retained only for rate limit counters.

## Your Planning Question
Design the D1 schema for four tables (captures, api_keys, tenants, signing_keys) that replaces the current KV data model. Key considerations:
1. The captures table must support SQL-based pagination (offset/limit), filtering (by status, URL pattern, date range), and sorting (by created_at) with target <100ms at 10K rows.
2. The api_keys table is keyed by SHA-256 hex hash and needs efficient lookup by hash plus listing by tenant with revocation filter.
3. Foreign key relationships: captures.tenant_id -> tenants.id, api_keys.tenant_id -> tenants.id.
4. D1 is SQLite-based -- verify which SQLite features are available (e.g., JSON functions, partial indexes, UPSERT).
5. Design the migration file structure and idempotent migration script for moving existing KV data to D1.
6. The current KV listCaptures uses cursor-based pagination with overfetch-and-filter for status; the D1 version should use proper WHERE clauses. Index design for: captures(tenant_id, created_at), captures(tenant_id, status, created_at), api_keys(key_hash).

## Context
Read these files for the current data model and access patterns:
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/wobbly-toasting-rain/src/kv.js (full 503-line data layer)
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/wobbly-toasting-rain/wrangler.toml (current bindings)

## Instructions
1. Read the files above to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: data-minion

### Recommendations
<your expert recommendations for schema design>

### Proposed Tasks
<specific tasks for the execution plan>
For each task: what to do, deliverables, dependencies

### Risks and Concerns
<things that could go wrong from your domain perspective>

### Additional Agents Needed
<any specialists not yet involved who should be, and why>
(or "None" if the current team is sufficient)

6. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-MPY0Rl/d1-migration-for-metadata/phase2-data-minion.md
