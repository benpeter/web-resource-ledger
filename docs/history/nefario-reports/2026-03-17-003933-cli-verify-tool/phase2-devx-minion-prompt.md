You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task

Build a standalone CLI npm package (`@wrl/verify`) that provides independent, offline-capable cryptographic verification of WRL WACZ captures. The package must be npx-runnable with zero install, accept both local `.wacz` files and remote capture URLs, and produce human-readable or JSON output.

## Your Planning Question

How should we structure the `@wrl/verify` CLI package to maximize reuse of the existing Worker verification logic (`src/verify.js`, `src/signing.js`, `src/rfc3161.js`, `src/canonical-json.js`) while keeping the CLI package independently publishable via npx? Specific concerns:

- The Worker code uses `fflate` for ZIP and `node:crypto` for Ed25519 -- both work in Node.js. But `sha256` is imported from `src/warc.js` which uses `crypto.subtle` (Web Crypto). Should we shim or re-implement for Node?
- Should shared code live in a shared package (monorepo workspace) or should the CLI copy/vendor the needed modules?
- The CLI needs `fflate` (ZIP extraction) and something for CMS/X.509 verification. What's the minimal dependency footprint for npx zero-install?
- How should the CLI handle the `bin` entry, shebang, and ESM modules for npx execution?

## Context

Read these files for context:
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario/cli-verify-tool/package.json
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario/cli-verify-tool/src/verify.js
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario/cli-verify-tool/src/signing.js
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario/cli-verify-tool/src/rfc3161.js
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario/cli-verify-tool/src/canonical-json.js
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario/cli-verify-tool/src/warc.js (for the sha256 export)
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario/cli-verify-tool/CLAUDE.md

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that aren't already part of the planning, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: devx-minion

### Recommendations
<your expert recommendations for this aspect of the task>

### Proposed Tasks
<specific tasks that should be in the execution plan>
For each task: what to do, deliverables, dependencies

### Risks and Concerns
<things that could go wrong from your domain perspective>

### Additional Agents Needed
<any specialists not yet involved who should be, and why>
(or "None" if the current team is sufficient)

6. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-xlgLuD/cli-verify-tool/phase2-devx-minion.md
