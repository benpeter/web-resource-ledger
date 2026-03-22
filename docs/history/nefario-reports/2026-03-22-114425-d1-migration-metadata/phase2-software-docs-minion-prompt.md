You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
WRL metadata (captures, tenants, API keys) moves from KV to Cloudflare D1, enabling SQL-based queries for pagination, filtering, and sorting. Clean migration with no dual-write complexity since there are no external users yet. KV retained only for rate limit counters.

## Your Planning Question
This migration changes the data architecture from KV to D1. What documentation artifacts need updating? Candidates:
1. ARCHITECTURE.md or equivalent if it exists
2. API documentation for new query params (offset/limit, filters, sorting)
3. OPERATIONS.md for D1 management commands
4. Migration runbook for the one-time data move
5. README updates if data architecture is mentioned
6. OpenAPI spec updates

## Context
Read these files to understand current documentation:
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/wobbly-toasting-rain/README.md
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/wobbly-toasting-rain/docs/ (scan directory)
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/wobbly-toasting-rain/CONTRIBUTING.md (if exists)

## Instructions
1. Read the files above to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: software-docs-minion

### Recommendations
### Proposed Tasks
### Risks and Concerns
### Additional Agents Needed

6. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-MPY0Rl/d1-migration-for-metadata/phase2-software-docs-minion.md
