You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task

Build a standalone CLI npm package (`@wrl/verify`) that provides independent, offline-capable cryptographic verification of WRL WACZ captures.

## Your Planning Question

How should the CLI resolve the operator's Ed25519 public key for signature verification? The Worker exposes `/.well-known/signing-key` (current key) and `/.well-known/signing-keys` (all historical keys with keyId). Specific concerns:

- For remote verification (`npx @wrl/verify https://.../v1/verify/cap_xxx`), the CLI fetches the WACZ from the Worker and can also fetch the signing key from the same origin. Should it always do this automatically?
- For local verification (`npx @wrl/verify capture.wacz`), the WACZ embeds a `publicKey` and `keyId` in `datapackage-digest.json`, but the Worker's security model explicitly says "NEVER trust the embedded key." How should the CLI handle this tension? Options:
  - Require `--key` flag for local verification
  - Require `--origin` flag to fetch from `/.well-known/signing-key`
  - Trust embedded key with a warning
  - Use keyId to fetch from `/.well-known/signing-keys/{keyId}`
- What's the right default behavior vs. opt-in flags?
- How should the CLI present the key trust model to users?

The key endpoint returns: `{ "algorithm": "Ed25519", "publicKey": "<base64>", "keyId": "<8-char-hex>" }`

## Context

Read these files for context:
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario/cli-verify-tool/src/index.js (handleGetSigningKey, handleGetSigningKeys)
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario/cli-verify-tool/src/verify.js (security comment about embedded publicKey)
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario/cli-verify-tool/src/wacz.js (datapackage-digest.json structure)
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario/cli-verify-tool/CLAUDE.md

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. Return your contribution in the format below
5. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-xlgLuD/cli-verify-tool/phase2-api-design-minion.md

## Domain Plan Contribution: api-design-minion

### Recommendations
### Proposed Tasks
### Risks and Concerns
### Additional Agents Needed
