MODE: META-PLAN

You are creating a meta-plan — a plan for who should help plan.

## Task
<github-issue>
Replace all functional references to `wrl.benpeter.workers.dev` with `api.webresourceledger.com` across code, config, and user-facing docs.

The custom domain is already configured and live (DNS + wrangler.toml route).

## Files to update

**Code/Config (must change):**
- `openapi.yaml` — API server URL
- `src/mcp.js` — MCP endpoint references
- `src/webhook-dispatch.js` — webhook callback URLs
- `server.json` — server config
- `packages/verify/lib/key-resolver.js` — public key fetch URL
- `packages/verify/test/key-resolver.test.js`
- `packages/verify/test/cli-args.test.js`
- `packages/verify/test/cms-chain.test.js`
- `landing/public/index.html` — Web UI link in footer
- `scripts/autonomous/lib/verify-phase.sh` — smoke test URLs
- `scripts/autonomous/setup-credentials.sh` — health check URLs

**User-facing docs (should change):**
- `docs/mcp.md` — MCP setup instructions

**Do NOT change:**
- `docs/history/` — historical records
- `docs/evolution/` — phase records
- `.claude/worktrees/` — worktree copies (will be cleaned up separately)
- Staging references (`wrl-staging.benpeter.workers.dev`) — keep until staging gets its own subdomain

## Success criteria

- `grep -r 'wrl\.benpeter\.workers\.dev' --include='*.js' --include='*.yaml' --include='*.json' --include='*.sh' --include='*.html' --include='*.md' . | grep -v '.claude/worktrees' | grep -v 'docs/history' | grep -v 'docs/evolution' | grep -v 'staging'` returns 0 matches
- All tests pass
- MCP server accessible at `api.webresourceledger.com/mcp`
- Smoke tests use the domain URL
</github-issue>

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/drifting-kindling-hennessy

## External Skill Discovery
No external skills discovered in .claude/skills/ or .skills/ directories.

## Instructions
1. Read relevant files to understand the codebase context
2. No external skills to discover
3. Analyze the task against your delegation table
4. Identify which specialists should be CONSULTED FOR PLANNING
   (not execution — planning). These are agents whose domain
   expertise is needed to create a good plan.
5. For each specialist, write a specific planning question that
   draws on their unique expertise.
6. Return the meta-plan in the structured format.
7. Write your complete meta-plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-lnjclo/replace-worker-url-with-custom-domain/phase1-metaplan.md`
