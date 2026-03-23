# Outcome: Replace Worker URL with Custom Domain

## What was built

Replaced all functional references to `wrl.benpeter.workers.dev` with `api.webresourceledger.com` across 12 files:

| File | Changes |
|------|---------|
| `openapi.yaml` | Removed legacy server entry + replaced 4 example URLs |
| `src/mcp.js` | 1 JSDoc comment |
| `src/webhook-dispatch.js` | 1 fallback URL literal |
| `server.json` | 1 MCP remote URL |
| `packages/verify/lib/key-resolver.js` | 1 help text URL |
| `packages/verify/test/key-resolver.test.js` | 3 test fixture URLs |
| `packages/verify/test/cli-args.test.js` | 2 test fixture URLs |
| `packages/verify/test/cms-chain.test.js` | 1 JSDoc curl example |
| `landing/public/index.html` | 3 auth/UI links |
| `scripts/autonomous/lib/verify-phase.sh` | 1 smoke test URL |
| `scripts/autonomous/setup-credentials.sh` | 1 health check URL |
| `docs/mcp.md` | 18 occurrences across all sections |

Total: ~37 string replacements + 1 server entry removal.

## Verification

- `grep -r 'wrl\.benpeter\.workers\.dev'` returns 0 matches in functional files
- 80/83 tests pass; 3 failures are pre-existing (missing `asn1js` in worktree)
- Staging URLs (`wrl-staging.benpeter.workers.dev`) untouched
- Excluded paths (`docs/history/`, `docs/evolution/`, `.claude/worktrees/`) untouched

## Out-of-band follow-up

Security advisory (from Phase 3.5): GitHub OAuth App callback URL list should include `https://api.webresourceledger.com/auth/callback`. This is an infrastructure setting, not a code change. The OAuth flow derives `redirect_uri` dynamically from `request.url.origin`, so once users arrive via the custom domain, GitHub must recognize the callback URL.

## Deviations from plan

None. Execution matched the plan exactly.

## Backlog changes

No backlog changes. This was a planned migration (custom domain was already configured in a prior phase). The out-of-band OAuth callback URL registration is operational, not a backlog item.
