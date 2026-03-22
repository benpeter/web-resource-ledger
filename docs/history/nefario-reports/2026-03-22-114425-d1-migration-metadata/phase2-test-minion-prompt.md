You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
WRL metadata (captures, tenants, API keys) moves from KV to Cloudflare D1, enabling SQL-based queries for pagination, filtering, and sorting. Clean migration with no dual-write complexity since there are no external users yet. KV retained only for rate limit counters.

## Your Planning Question
How should the test infrastructure adapt from KV mocks to D1 bindings? Specifically:
1. miniflare supports D1 -- what changes are needed in vitest.config.js and wrangler.test.toml to configure D1 for tests?
2. Current tests use env.KV.delete() / env.KV.list() for cleanup in beforeEach -- what's the D1 equivalent (DELETE FROM tables? PRAGMA reset?)?
3. The test/kv.test.js file tests the data layer directly -- it should become test/db.test.js testing D1 queries.
4. test/list-captures.test.js tests the HTTP endpoint including pagination/filtering -- tests should be expanded to cover SQL-based filtering/sorting.
5. test/admin-keys.test.js and test/auth.test.js test API key operations -- what changes for D1?
6. isolatedStorage: false is currently set due to R2 WAL issues -- does D1 change this?
7. Should we add SQL-specific tests (e.g., verifying index usage via EXPLAIN QUERY PLAN)?

## Context
Read these files:
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/wobbly-toasting-rain/vitest.config.js
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/wobbly-toasting-rain/wrangler.test.toml
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/wobbly-toasting-rain/test/kv.test.js
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/wobbly-toasting-rain/test/list-captures.test.js
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/wobbly-toasting-rain/test/auth.test.js

## Instructions
1. Read the files above to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: test-minion

### Recommendations
### Proposed Tasks
### Risks and Concerns
### Additional Agents Needed

6. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-MPY0Rl/d1-migration-for-metadata/phase2-test-minion.md
