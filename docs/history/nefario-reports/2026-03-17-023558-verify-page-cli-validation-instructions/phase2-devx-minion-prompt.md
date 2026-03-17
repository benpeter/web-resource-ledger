You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
Should we update the verify page with CLI instructions for cryptographic validation?

## Advisory Context
This is an advisory-only orchestration. Your contribution will feed into a team recommendation, not an execution plan. Focus on analysis, trade-offs, and recommendations rather than implementation tasks.

## Your Planning Question
What specific CLI commands actually work cross-platform for each verification step? The canonical JSON step and Ed25519 raw-key-to-PEM conversion are non-trivial in shell -- what's the simplest correct toolchain? Can this be done with just openssl, jq, and standard tools, or does it require specialized software?

## Context
Read these files for the verification algorithm:
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario-advisory-branch-envs/src/verify.js
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario-advisory-branch-envs/src/signing.js
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario-advisory-branch-envs/src/canonical-json.js
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario-advisory-branch-envs/src/rfc3161.js

The verification steps in order:
1. Download WACZ from `/v1/captures/{id}/artifacts/wacz`
2. Unzip to get `datapackage.json` and `datapackage-digest.json`
3. Check 1 (artifactHashes): SHA-256 each resource file, compare with datapackage.json hashes
4. Check 2 (bundleHash): SHA-256 of canonical JSON of datapackage.json, compare with signedData.hash
5. Check 3 (signature): Ed25519 verify using public key from `/.well-known/signing-key` (raw 32 bytes)
   - Signed payload is UTF-8 bytes of the hash string "sha256:{hex}"
   - Signature is base64-encoded in datapackage-digest.json
6. Check 4 (timestamp): RFC 3161 token verification (DER-encoded, stored base64 in digest)

Key challenges:
- Canonical JSON: sorted keys recursively, no trailing comma, no extra whitespace -- jq can do this
- Ed25519: openssl 3.x supports Ed25519 but needs PEM-formatted key, not raw 32 bytes
- The raw 32-byte key needs SPKI DER prefix (302a300506032b6570032100) + PEM wrapping
- RFC 3161 DER token verification requires openssl ts -verify

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question -- actually try to work out the commands
3. Identify which steps are easy vs. which require complex shell gymnastics
4. Return your contribution in the format specified
5. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-BZ3vZv/verify-page-cli-validation-instructions/phase2-devx-minion.md`
