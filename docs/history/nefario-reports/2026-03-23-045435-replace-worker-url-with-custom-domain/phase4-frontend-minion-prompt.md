Replace every occurrence of `wrl.benpeter.workers.dev` with
`api.webresourceledger.com` in the files listed below. This is a mechanical
text replacement -- the custom domain already routes to the same Cloudflare
Worker. Do NOT touch staging URLs (`wrl-staging.benpeter.workers.dev`).

## Files and specific replacements

For every file below, replace the string `wrl.benpeter.workers.dev` with
`api.webresourceledger.com`. Use `replace_all: true` where a file has
multiple occurrences.

### 1. `openapi.yaml`
- Remove the legacy server entry (lines 16-17) that references the old URL.
  The primary server entry already uses `api.webresourceledger.com`.
- ALSO replace all example URLs deeper in the file (lines ~1028-1031) where
  `wrl.benpeter.workers.dev` appears in webhook event example values
  (artifacts.screenshot, artifacts.html, artifacts.headers, verifyUrl).
  Use `replace_all: true` to catch all occurrences.

### 2. `src/mcp.js`
JSDoc comment example URL. Replace the example URL in the JSDoc.

### 3. `src/webhook-dispatch.js`
Fallback URL string literal. Replace the string literal.

### 4. `server.json`
MCP remote URL. Replace the URL.

### 5. `packages/verify/lib/key-resolver.js`
Help text in error message. Replace the example URL.

### 6. `packages/verify/test/key-resolver.test.js`
Multiple occurrences. Replace all occurrences.

### 7. `packages/verify/test/cli-args.test.js`
Multiple occurrences. Replace all occurrences.

### 8. `packages/verify/test/cms-chain.test.js`
JSDoc comment with curl command. Replace the URL.

### 9. `landing/public/index.html`
Auth/login and UI links. Replace all occurrences.

### 10. `scripts/autonomous/lib/verify-phase.sh`
Production smoke test URL. Replace the URL.

### 11. `scripts/autonomous/setup-credentials.sh`
Production health check URL. Replace the URL.

### 12. `docs/mcp.md`
Replace ALL occurrences (18+). This includes intro paragraph, CLI commands,
config JSON examples, and all example output blocks.

## What NOT to change

- Anything in `docs/history/`, `docs/evolution/`, `.claude/worktrees/`
- Staging URLs: `wrl-staging.benpeter.workers.dev` must stay as-is
- No other files beyond those listed above

## Verification

After making all replacements, run this grep to confirm zero remaining
production references (staging excluded):

```bash
grep -r 'wrl\.benpeter\.workers\.dev' --include='*.js' --include='*.yaml' --include='*.json' --include='*.sh' --include='*.html' --include='*.md' . | grep -v '.claude/worktrees' | grep -v 'docs/history' | grep -v 'docs/evolution' | grep -v 'staging'
```

This must return 0 matches.

Then run the test suite:

```bash
cd packages/verify && npm test
```

All tests must pass.
