You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task

Build a standalone CLI npm package (`@wrl/verify`) that provides independent, offline-capable cryptographic verification of WRL WACZ captures. The tool is run via `npx @wrl/verify capture.wacz` or `npx @wrl/verify https://...`.

## Your Planning Question

What should the human-readable CLI output look like for verification results? The tool needs to serve two audiences:

- **Technical users** running `npx @wrl/verify capture.wacz` who want to understand exactly what was verified and what failed
- **Non-technical users** (lawyers, journalists, compliance officers) who need a clear "this capture is authentic" or "this capture failed verification" signal

Specific concerns:
- How should the 5 verification checks (artifact hashes, bundle hash, Ed25519 signature, CMS chain, messageImprint) be presented? All at once? Progressive disclosure?
- What should the error output look like when verification fails? How much detail is appropriate?
- Should there be a summary line that's copy-pasteable into a legal document or evidence report?
- What's the right exit code strategy? (0 = pass, 1 = fail, 2 = error/usage?)
- How should the `--json` structured output be designed?
- Should there be a `--verbose` flag for additional detail?

## Context

The existing Worker verification returns this structure:
```json
{
  "verified": true/false,
  "checks": [
    { "name": "artifactHashes", "status": "pass"|"fail"|"skip", "detail": "..." },
    { "name": "bundleHash", "status": "pass"|"fail"|"skip" },
    { "name": "signature", "status": "pass"|"fail"|"skip" },
    { "name": "timestamp", "status": "pass"|"fail"|"skip" }
  ],
  "capture": { "bundleHash": "sha256:...", "signature": "...", "publicKey": "...", "signedAt": "..." }
}
```

The CLI adds a 5th check: `timestampChain` (CMS/PKCS#7 certificate chain validation).

Read these files for context:
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario/cli-verify-tool/src/verify.js
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario/cli-verify-tool/src/verify-page.js (existing HTML output design)
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario/cli-verify-tool/CLAUDE.md

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. Return your contribution in the format below
5. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-xlgLuD/cli-verify-tool/phase2-ux-strategy-minion.md

## Domain Plan Contribution: ux-strategy-minion

### Recommendations
### Proposed Tasks
### Risks and Concerns
### Additional Agents Needed
