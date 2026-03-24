You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
Phase 0062 added tenant auth to all capture GET endpoints, which broke the public verify page, CLI verifier, and the "anyone can verify" value proposition. The proposal is to simplify the access model by making individual capture access public (128-bit IDs as capability tokens), keeping list endpoint authed, and removing the share token system entirely.

## Your Planning Question
The `@w-r-l/verify` CLI package (packages/verify/) currently handles share tokens in its key-resolver.js (shareTokenFromUrl function, 401 error message suggesting share token usage). With the simplified model, the CLI no longer needs share token support because capture URLs become public. What changes are needed in the verify package?

Specifically:
(a) Should shareTokenFromUrl be removed or kept as dead-code defense?
(b) The 401 error message at line 106-110 of key-resolver.js suggests using share tokens — this needs updating.
(c) Are there any other references in the verify package that assume authed capture access?
(d) Should the package version be bumped?

## Context
Read these files:
- packages/verify/lib/key-resolver.js (share token handling)
- packages/verify/test/key-resolver.test.js (related tests)
- packages/verify/package.json

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. Return your contribution in this format:

## Domain Plan Contribution: devx-minion

### Recommendations
### Proposed Tasks
### Risks and Concerns
### Additional Agents Needed

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-jZS5XC/simplify-capture-access-model/phase2-devx-minion.md`
