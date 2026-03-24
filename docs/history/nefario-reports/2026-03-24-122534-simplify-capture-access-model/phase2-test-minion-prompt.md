You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
Phase 0062 added tenant auth to all capture GET endpoints, which broke the public verify page, CLI verifier, and the "anyone can verify" value proposition. The proposal is to simplify the access model by making individual capture access public (128-bit IDs as capability tokens), keeping list endpoint authed, and removing the share token system entirely.

## Your Planning Question
The test suite has extensive changes needed:
- capture-retrieval.test.js has tests asserting 401 on unauthenticated access that must flip to 200
- share-token.test.js (entire file) must be removed along with any share-token related test helpers
- verify-page.spec.js E2E test is currently failing because of the auth issue
- The test changes are substantial and mechanically complex

How should the test migration be approached? Specifically:
(a) For capture-retrieval.test.js: update tests in-place (flip 401→200) or restructure the test suite?
(b) For share-token.test.js: clean removal — are there shared test helpers or fixtures that other tests depend on?
(c) For verify-page.spec.js: what's the root cause of the E2E failure and what's the minimal fix?
(d) Are there any other test files that reference share tokens or assert auth on individual capture access?

## Context
Read these files:
- test/capture-retrieval.test.js
- test/share-token.test.js (if exists)
- test/e2e/verify-page.spec.js
- test/helpers/ (if exists, for shared test utilities)

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. Return your contribution in this format:

## Domain Plan Contribution: test-minion

### Recommendations
### Proposed Tasks
### Risks and Concerns
### Additional Agents Needed

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-jZS5XC/simplify-capture-access-model/phase2-test-minion.md`
