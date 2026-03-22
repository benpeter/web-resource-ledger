You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
WRL metadata (captures, tenants, API keys) moves from KV to Cloudflare D1, enabling SQL-based queries for pagination, filtering, and sorting. Clean migration with no dual-write complexity since there are no external users yet. KV retained only for rate limit counters.

## Your Planning Question
The list captures endpoint currently returns { data: [...], pagination: { cursor, hasMore, limit } }. Moving to D1 enables offset/limit pagination, filtering by multiple fields, and sorting.
1. Should the API add offset/limit query params alongside or replacing the current cursor? The task spec says offset/limit, but cursor is already shipped.
2. What new query params should be supported: status, url (prefix or contains?), created_after/created_before (date range), sort (field + direction)?
3. The admin keys list endpoint has no pagination -- should D1 migration add it?
4. Are there any API contract changes that would be breaking for existing consumers (the MCP server reuses listCaptures internally)?

## Context
Read these files:
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/wobbly-toasting-rain/src/index.js (handleListCaptures function)
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/wobbly-toasting-rain/src/mcp.js (list_captures tool)
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/wobbly-toasting-rain/src/kv.js (listCaptures function)

## Instructions
1. Read the files above to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: api-design-minion

### Recommendations
### Proposed Tasks
### Risks and Concerns
### Additional Agents Needed

6. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-MPY0Rl/d1-migration-for-metadata/phase2-api-design-minion.md
