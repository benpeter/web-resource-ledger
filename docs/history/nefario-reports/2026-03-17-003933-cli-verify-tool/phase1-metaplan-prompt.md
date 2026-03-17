MODE: META-PLAN

You are creating a meta-plan — a plan for who should help plan.

## Task

<github-issue>
**Outcome**: Anyone can independently verify the integrity and authenticity of a WRL capture — including the TSA's cryptographic signature — without installing software, closing the verification gap where the Worker can only check hash matches but not the CMS signature chain.

**Success criteria**:
- `npx @wrl/verify capture.wacz` runs without prior installation and produces a clear pass/fail report
- `npx @wrl/verify https://wrl.benpeter.workers.dev/v1/verify/cap_xxx` fetches and verifies a remote capture
- RFC 3161 CMS/PKCS#7 signature verified against TSA certificate chain up to trusted root
- Ed25519 bundle signature verified against operator's published signing key
- All artifact SHA-256 hashes verified against datapackage.json
- Human-readable output by default with `--json` flag for machine-readable output
- Exit code 0 on full verification pass, non-zero on any failure

**Scope**:
- In: WACZ extraction, datapackage-digest.json parsing, CMS signature verification, X.509 chain validation, Ed25519 signature verification, artifact hash verification, CLI with human and JSON output
- Out: Capture creation, Worker-side changes, browser-based verification UI, publishing to npm (deferred to a separate task)

**Constraints**:
- Node.js (npx-runnable, zero-install)
- Must work with current WACZ v0.2.0 format (signedData.signatures array with type:"self" and type:"rfc3161")
</github-issue>

---
Additional context: skip all approval gates -- defer decisions to gru and lucy instead of halting for human input. skip compaction checkpoints. auto-create the PR at wrap-up without halting. IMPORTANT: write process.md in the evolution log directory -- this is a project requirement.

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario/cli-verify-tool

## External Skill Discovery
Scan .claude/skills/ and .skills/ in the working directory for SKILL.md files.

## Codebase Context

This is a Cloudflare Workers project that captures web pages and produces signed WACZ bundles. Key files:

- `src/verify.js` -- existing WACZ verification (pure function, takes bytes + public key)
- `src/signing.js` -- Ed25519 signing/verification via Web Crypto API
- `src/rfc3161.js` -- RFC 3161 timestamp request/verification (messageImprint check only, NO CMS chain validation)
- `src/wacz.js` -- WACZ assembly (ZIP with datapackage.json, datapackage-digest.json)
- `src/canonical-json.js` -- deterministic JSON serialization for bundle hash
- `src/index.js` -- Worker routes including `/.well-known/signing-key` for public key
- `package.json` -- monorepo-style, uses vitest, fflate for ZIP

The CLI tool needs to be a SEPARATE npm package (e.g., `packages/verify/` or `cli/`) that:
1. Can be run via `npx @wrl/verify` with zero install
2. Reuses verification logic from the Worker where possible
3. Adds FULL CMS/PKCS#7 chain validation (new capability — the Worker only checks messageImprint)
4. Fetches the operator's public key from `/.well-known/signing-key`
5. Provides human-readable and JSON output

## Instructions
1. Read relevant files to understand the codebase context
2. Discover external skills (scan .claude/skills/ and .skills/ for SKILL.md files)
3. Analyze the task against your delegation table
4. Identify which specialists should be CONSULTED FOR PLANNING (not execution — planning)
5. For each specialist, write a specific planning question that draws on their unique expertise
6. Return the meta-plan in the structured format
7. Write your complete meta-plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-xlgLuD/cli-verify-tool/phase1-metaplan.md`
