You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
WRL metadata (captures, tenants, API keys) moves from KV to Cloudflare D1, enabling SQL-based queries for pagination, filtering, and sorting. Clean migration with no dual-write complexity since there are no external users yet. KV retained only for rate limit counters.

## Your Planning Question
The list captures API gains SQL-based filtering, sorting, and offset/limit pagination. From a user journey perspective, what query capabilities matter most for the two primary consumers (MCP tool callers and future web UI)? Should the API expose full SQL flexibility or constrained filter presets? Does the pagination model change (cursor -> offset/limit) create cognitive load for existing consumers?

## Context
Read these files to understand the current API and consumer patterns:
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/wobbly-toasting-rain/src/index.js (handleListCaptures)
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/wobbly-toasting-rain/src/mcp.js (MCP tool definitions)

## Advisory Context
This is part of a larger orchestration. Your contribution will feed into an execution plan. Focus on analysis, trade-offs, and recommendations for the user experience of the new query capabilities.

## Instructions
1. Read the files above to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: ux-strategy-minion

### Recommendations
### Proposed Tasks
### Risks and Concerns
### Additional Agents Needed

6. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-MPY0Rl/d1-migration-for-metadata/phase2-ux-strategy-minion.md
