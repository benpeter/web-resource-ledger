You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
WRL metadata (captures, tenants, API keys) moves from KV to Cloudflare D1, enabling SQL-based queries for pagination, filtering, and sorting. Clean migration with no dual-write complexity since there are no external users yet. KV retained only for rate limit counters.

## Your Planning Question
What is the wrangler.toml configuration needed for D1 bindings (production + staging + test), and what is the deployment sequence? Specifically:
1. D1 database creation commands for production and staging.
2. [[d1_databases]] binding configuration in wrangler.toml (production, env.staging, and wrangler.test.toml).
3. Migration file management -- D1 supports wrangler d1 migrations with a migrations/ directory.
4. The KV namespace binding must remain for rate limit counters -- what's the minimal KV config after migration?
5. The one-time KV-to-D1 data migration script: should it be a standalone script that reads KV via wrangler and writes to D1, or a Worker endpoint?
6. Deployment ordering: create D1 databases -> apply schema migrations -> run data migration -> deploy updated Worker code -> verify -> remove unused KV metadata.

## Context
Read these files:
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/wobbly-toasting-rain/wrangler.toml
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/wobbly-toasting-rain/wrangler.test.toml
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/wobbly-toasting-rain/vitest.config.js

## Instructions
1. Read the files above to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: iac-minion

### Recommendations
### Proposed Tasks
### Risks and Concerns
### Additional Agents Needed

6. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-MPY0Rl/d1-migration-for-metadata/phase2-iac-minion.md
