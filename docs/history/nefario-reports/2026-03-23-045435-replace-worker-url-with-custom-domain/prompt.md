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
