# Task 1: Add MCP Dependencies

Add the MCP TypeScript SDK and Zod to the WRL Worker project.

## What to do

Add these production dependencies to `package.json`:
```
"@modelcontextprotocol/sdk": "^1.27.1"
"zod": "^3.25.67"
```

IMPORTANT: Check the MCP SDK's peerDependencies to confirm which Zod major version it requires (v3 vs v4). The SDK likely requires Zod v3. Install the correct version. Run `npm info @modelcontextprotocol/sdk peerDependencies` first.

Then run `npm install` and verify:
1. `npm install` completes without errors
2. `unset CLOUDFLARE_API_TOKEN && npx wrangler deploy --dry-run --outdir /tmp/wrl-dry-run` succeeds and the bundle is under 1MB gzipped

## Why these dependencies

- `@modelcontextprotocol/sdk` -- official MCP TypeScript SDK. We use `McpServer` and transport classes.
- `zod` -- required peer dependency of the MCP SDK for tool input schema validation.

## What NOT to do

- Do NOT use the Cloudflare `agents` package
- Do NOT add `@cfworker/json-schema` (YAGNI — ajv works under nodejs_compat)
- Do NOT add any bundler configuration changes
- Do NOT modify any existing source files

## Deliverables
- Updated `package.json` with two new production dependencies
- Updated `package-lock.json`
- Console output showing dry-run bundle size

## Context
- Working directory: /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/snappy-bouncing-sloth
- Current dependencies: `@cloudflare/playwright`, `@duckduckgo/autoconsent`, `fflate` (3 total)
- Current bundle: ~712KB gzipped. Target: under 1MB gzipped after adding MCP deps.
- `wrangler.toml` has `nodejs_compat` in compatibility_flags
- IMPORTANT: Always unset CLOUDFLARE_API_TOKEN before calling wrangler
