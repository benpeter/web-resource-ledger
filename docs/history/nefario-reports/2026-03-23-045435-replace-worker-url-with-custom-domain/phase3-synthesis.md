# Delegation Plan

**Team name**: url-migration
**Description**: Replace all functional references to `wrl.benpeter.workers.dev` with `api.webresourceledger.com` across code, config, tests, and user-facing docs.

## Task 1: Replace production worker URL with custom domain

- **Agent**: frontend-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |
    Replace every occurrence of `wrl.benpeter.workers.dev` with
    `api.webresourceledger.com` in the files listed below. This is a mechanical
    text replacement -- the custom domain already routes to the same Cloudflare
    Worker. Do NOT touch staging URLs (`wrl-staging.benpeter.workers.dev`).

    ## Files and specific replacements

    For every file below, replace the string `wrl.benpeter.workers.dev` with
    `api.webresourceledger.com`. Use `replace_all: true` where a file has
    multiple occurrences.

    ### 1. `openapi.yaml` (line 16-17)
    The legacy server entry. Replace the URL string. Keep the entry as-is
    (description "Production (legacy Workers subdomain)" is fine to keep as
    documentation of the old URL).

    Actually -- on reflection, this legacy entry should be REMOVED entirely
    since we are migrating away from the workers.dev URL. The primary server
    entry on line 12 already uses `api.webresourceledger.com`. Delete lines
    16-17 (the third server entry with the old URL).

    ### 2. `src/mcp.js` (line 41)
    JSDoc comment: `@param {string} origin - Request origin (e.g. 'https://wrl.benpeter.workers.dev')`
    Replace the example URL in the JSDoc.

    ### 3. `src/webhook-dispatch.js` (line 103)
    Fallback URL: `'https://wrl.benpeter.workers.dev'`
    Replace the string literal.

    ### 4. `server.json` (line 16)
    MCP remote URL: `"url": "https://wrl.benpeter.workers.dev/mcp"`
    Replace the URL.

    ### 5. `packages/verify/lib/key-resolver.js` (line 410)
    Help text in error message: `--origin https://wrl.benpeter.workers.dev`
    Replace the example URL.

    ### 6. `packages/verify/test/key-resolver.test.js` (8 occurrences)
    Lines 46, 50, 64, 69, 81, 82. Replace all occurrences.

    ### 7. `packages/verify/test/cli-args.test.js` (2 occurrences)
    Lines 98, 99. Replace all occurrences.

    ### 8. `packages/verify/test/cms-chain.test.js` (1 occurrence)
    Line 16 -- this is in a JSDoc comment showing a curl command for refreshing
    the test fixture. Replace the URL.

    ### 9. `landing/public/index.html` (3 occurrences)
    Lines 93, 107, 236. Replace all occurrences. These are auth/login and
    UI links.

    ### 10. `scripts/autonomous/lib/verify-phase.sh` (1 occurrence)
    Line 249 -- production smoke test URL. Replace the URL.

    ### 11. `scripts/autonomous/setup-credentials.sh` (1 occurrence)
    Line 38 -- production health check URL. Replace the URL.

    ### 12. `docs/mcp.md` (18+ occurrences)
    Replace ALL occurrences of `wrl.benpeter.workers.dev` with
    `api.webresourceledger.com`. This includes:
    - Intro paragraph (line 5)
    - Claude Code CLI command (line 14)
    - Cursor config JSON (line 25)
    - Windsurf config JSON (line 42)
    - "Other MCP Clients" section (line 55)
    - All example output blocks throughout the file (lines 82, 119-124,
      216, 252-258)

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

- **Deliverables**: All 12 files updated with the new domain. Zero grep matches for the old production URL in functional code.
- **Success criteria**:
    1. The grep command above returns 0 matches
    2. `cd packages/verify && npm test` passes
    3. No staging URLs were modified

## Cross-Cutting Coverage

- **Testing**: Covered within Task 1 -- test files are updated as part of the replacement, and the verify test suite is run as verification. Phase 6 will run the full test suite post-execution.
- **Security**: Not applicable. Same Worker, same TLS, same auth. DNS is already live and verified. No new attack surface.
- **Usability -- Strategy**: Not applicable. No user journey changes. The custom domain is strictly more professional and memorable.
- **Usability -- Design**: Not applicable. No UI component changes beyond URL strings in href attributes.
- **Documentation**: Covered within Task 1 -- `docs/mcp.md` is updated as part of the replacement. Phase 8 will verify documentation coverage.
- **Observability**: Not applicable. No runtime component changes.

## Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**: none
- **Not selected**:
  - ux-design-minion: No UI components produced, only URL strings in href attributes
  - accessibility-minion: No HTML structure or interaction changes
  - sitespeed-minion: No web-facing runtime code changes
  - observability-minion: No runtime components produced
  - user-docs-minion: docs/mcp.md changes are mechanical URL replacements within Task 1

## Decisions

None. The task is fully specified with no contested choices. The only micro-decision (remove vs. keep the legacy openapi.yaml server entry) is resolved by the task instruction "replace all functional references" -- keeping a stale URL as a documented alias serves no purpose since the domain is already live.

## Risks and Mitigations

1. **Test assertions may rely on exact URL strings**: Mitigated by updating all test files in the same pass and running the test suite as verification.
2. **Other files not in the list may reference the old URL**: Mitigated by the grep verification step, which catches any missed references in functional code.

## Execution Order

```
Batch 1: Task 1 (all replacements + verification)
```

No gates, no dependencies, single batch.

## Verification Steps

1. Grep verification: zero matches for `wrl.benpeter.workers.dev` in functional files (excluding staging, history, evolution, worktrees)
2. Test suite: `cd packages/verify && npm test` passes
3. Spot-check: `openapi.yaml` has only 2 server entries (production custom domain + staging)
4. Spot-check: `server.json` remote URL uses `api.webresourceledger.com/mcp`
