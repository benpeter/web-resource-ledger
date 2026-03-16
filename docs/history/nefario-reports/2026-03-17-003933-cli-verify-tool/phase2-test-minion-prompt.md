You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task

Build a standalone CLI npm package (`@wrl/verify`) that provides independent, offline-capable cryptographic verification of WRL WACZ captures, including CMS/PKCS#7 certificate chain validation.

## Your Planning Question

What should the test strategy be for the `@wrl/verify` CLI package? The Worker's existing tests use vitest with @cloudflare/vitest-pool-workers (miniflare). The CLI is a separate Node.js package that doesn't run in Workers. Key questions:

- Test runner: use vitest (without workers pool) for consistency with the Worker tests? Or plain `node:test` for zero-dependency testing?
- How to create test fixtures: the CLI needs real WACZ files with known-good and known-bad signatures. Should we generate them in test setup from the Worker's existing `buildWacz()`? Or commit binary fixtures?
- CMS chain validation testing: should tests use real TSA responses (hit a real TSA in tests) or synthetic DER fixtures? Real TSA responses would be integration tests; synthetic fixtures would be unit tests.
- The Worker's test suite already has `test/verify.test.js` and `test/rfc3161.test.js`. How much test logic can be shared?
- What's the minimum test coverage for the CLI?

## Context

Read these files for context:
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario/cli-verify-tool/test/verify.test.js
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario/cli-verify-tool/test/rfc3161.test.js
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario/cli-verify-tool/package.json
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario/cli-verify-tool/CLAUDE.md (especially "Test the real boundaries")

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. Return your contribution in the format below
5. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-xlgLuD/cli-verify-tool/phase2-test-minion.md

## Domain Plan Contribution: test-minion

### Recommendations
### Proposed Tasks
### Risks and Concerns
### Additional Agents Needed
