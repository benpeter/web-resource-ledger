You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task

Build a standalone CLI npm package (`@wrl/verify`) that provides independent, offline-capable cryptographic verification of WRL WACZ captures, including FULL CMS/PKCS#7 certificate chain validation for RFC 3161 timestamps.

## Your Planning Question

What is the correct approach for full RFC 3161 CMS/PKCS#7 signature chain validation in a Node.js CLI tool? Specific concerns:

- The existing `rfc3161.js` only verifies messageImprint (hash match) -- the CMS SignedData envelope is parsed but its cryptographic signature is NOT verified, and the TSA certificate chain is NOT validated against a trusted root.
- Which Node.js library should handle CMS signature verification and X.509 chain validation? Options: `node-forge`, `pkijs`, `@peculiar/x509`, raw `node:crypto` X509Certificate API (Node 15+). Evaluate: maturity, bundle size (matters for npx), maintenance status, API quality.
- How should the trust anchor be handled? Bundle a root CA store? Use the system's trust store? Pin specific TSA root certs (currently DigiCert)?
- What is the verification chain: TSA response -> CMS SignedData -> signer certificate -> intermediate(s) -> trusted root? What checks are mandatory (signature, validity period, key usage, extended key usage for timestamping)?
- The existing DER parsing in `rfc3161.js` is purpose-built and minimal. Should the CLI extend this parser or use a full ASN.1 library?

The TSA currently in use is DigiCert (http://timestamp.digicert.com) -- note: project has recently switched TSAs, so the tool must not be hardcoded to any single TSA.

## Context

Read these files for context:
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario/cli-verify-tool/src/rfc3161.js (full DER parser and extractTSTInfo)
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario/cli-verify-tool/src/verify.js
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario/cli-verify-tool/src/signing.js
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario/cli-verify-tool/docs/backlog.md (search for CMS chain validation deferred)
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario/cli-verify-tool/CLAUDE.md

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that aren't already part of the planning, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: security-minion

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

6. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-xlgLuD/cli-verify-tool/phase2-security-minion.md
