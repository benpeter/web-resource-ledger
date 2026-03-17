MODE: META-PLAN

You are creating a meta-plan — a plan for who should help plan.

## Task
Should we add a collapsible "Verify independently" section to the verify page with a copy-to-clipboard npx command for the existing @w-r-l/verify CLI tool?

The user's specific UX idea: a collapsible link/section that, when expanded, shows a single npx command (pre-filled with the capture URL) with a copy-to-clipboard icon. Minimal, not a tutorial.

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario-advisory-branch-envs

## Current State

### @w-r-l/verify CLI tool (ALREADY EXISTS)
- Package at packages/verify/ with full 5-check verification
- Checks: artifactHashes, bundleHash, signature, timestamp imprint, timestampChain (full CMS/PKCS#7 chain validation)
- Zero-install: `npx @w-r-l/verify <capture-url>`
- Remote capture auto-resolves signing key from server
- Bundled DigiCert root certs for offline chain validation
- 136 tests, Node.js 20+
- Published as @w-r-l/verify on npm

### Current Verify Page (src/verify-page.js)
- ~700 lines, vanilla JS, server-rendered HTML
- Layout: status banner > capture metadata > checks list > screenshot > capture details disclosure > cryptographic details disclosure > footer
- Timestamp check description: "Time was recorded by an independent authority (not verified cryptographically)"
  - This wording softens the trust promise -- but the CLI tool CAN verify this
- Page uses textContent for user data (XSS-safe patterns throughout)
- CSP: script-src 'unsafe-inline', connect-src 'self'

### Key Observation
The verify page's timestamp wording ("not verified cryptographically") creates a gap that the CLI tool fills. Adding a "verify independently" section directly addresses this by giving users a path to full verification including the timestamp chain.

### Project Principles
- YAGNI, KISS, Lean and Mean
- Vanilla JS, no frameworks
- The verify page is the primary user-facing trust artifact

## External Skill Discovery
Scan .claude/skills/ and .skills/ in the working directory for SKILL.md files.

## Instructions
1. Read relevant files to understand the codebase context
2. Discover external skills
3. Analyze the task against your delegation table
4. Identify which specialists should be CONSULTED FOR PLANNING
5. For each specialist, write a specific planning question
6. Return the meta-plan in the structured format
7. Write your complete meta-plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-zdnDkL/verify-page-npx-copy-command/phase1-metaplan.md`
