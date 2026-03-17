You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
Should we update the verify page with CLI instructions for cryptographic validation?

## Advisory Context
This is an advisory-only orchestration. Your contribution will feed into a team recommendation, not an execution plan. Focus on analysis, trade-offs, and recommendations rather than implementation tasks.

## Your Planning Question
Is it safe to publish the exact verification algorithm? How do we communicate the timestamp limitation (TSA cert chain is NOT verified, even server-side -- the server only checks messageImprint matches bundleHash)? Are there key-format pitfalls that could cause false negatives and erode trust?

## Context
Read the following files for full context:
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario-advisory-branch-envs/src/verify.js
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario-advisory-branch-envs/src/signing.js
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario-advisory-branch-envs/src/verify-page.js
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario-advisory-branch-envs/src/rfc3161.js

Key facts:
- Ed25519 signatures with base64-encoded signature values
- Bundle hash: SHA-256 of canonicalized (sorted keys) datapackage.json
- WACZ format: ZIP containing datapackage.json + datapackage-digest.json + WARC files
- Public key at /.well-known/signing-key (raw 32-byte Ed25519 key)
- RFC 3161 timestamps from DigiCert TSA (DER-encoded tokens)
- Server-side timestamp verification only checks messageImprint matches bundleHash -- does NOT verify TSA certificate chain
- The verify page check description says "Time was recorded by an independent authority (not verified cryptographically)"
- Solo developer, open source project (Apache-2.0)

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. Return your contribution in the format specified
5. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-BZ3vZv/verify-page-cli-validation-instructions/phase2-security-minion.md`
