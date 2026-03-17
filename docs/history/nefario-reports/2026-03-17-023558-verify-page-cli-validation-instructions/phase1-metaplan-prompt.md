MODE: META-PLAN

You are creating a meta-plan — a plan for who should help plan.

## Task
Should we update the verify page with CLI instructions for cryptographic validation?

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario-advisory-branch-envs

## Current State (pre-gathered context)

### Verification System
- `src/verify.js`: Server-side WACZ verification with 4 checks: artifactHashes, bundleHash, Ed25519 signature, RFC 3161 timestamp
- `src/verify-page.js`: HTML page (~700 lines) that fetches `/v1/verify/{id}` JSON and renders results client-side
- `src/signing.js`: Ed25519 signing module using PKCS8 private key, derives public key, supports key rotation
- Public key available at `/.well-known/signing-key` (raw bytes) and `/.well-known/signing-keys` (historical keys)
- Verification checks: file integrity (SHA-256), bundle integrity, digital signature (Ed25519), independent timestamp (RFC 3161)

### Current Verify Page Content
- Status banner (verified/unverified)
- Capture metadata (URL, date)
- Verification checks list (pass/fail/skip for each check)
- Screenshot display (with before/after consent)
- Capture details disclosure
- Cryptographic details disclosure (bundle hash, signed at, public key URL, TSA name, TSA time)
- No CLI instructions or manual verification guidance

### Crypto Details
- Ed25519 signatures, base64-encoded
- Bundle hash: SHA-256 of canonicalized datapackage.json
- WACZ format: ZIP with datapackage.json + datapackage-digest.json
- RFC 3161 timestamps from DigiCert TSA

### Project Principles
- YAGNI, KISS, Lean and Mean
- Solo developer project
- Vanilla JS (no frameworks)
- The verify page is the primary user-facing trust artifact

## External Skill Discovery
Scan .claude/skills/ and .skills/ in the working directory for SKILL.md files.

## Instructions
1. Read relevant files to understand the codebase context (context already gathered above)
2. Discover external skills
3. Analyze the task against your delegation table
4. Identify which specialists should be CONSULTED FOR PLANNING (not execution — planning)
5. For each specialist, write a specific planning question that draws on their unique expertise
6. Return the meta-plan in the structured format
7. Write your complete meta-plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-BZ3vZv/verify-page-cli-validation-instructions/phase1-metaplan.md`
