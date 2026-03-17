You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task

Eliminate silent catch blocks — fail loudly on unexpected errors (GitHub Issue #70)

All `catch` blocks in the codebase either log the error or handle a specific, named error type. Silent error swallowing is eliminated. Degraded features report distinct status values so operators can distinguish "service unavailable" from "misconfigured."

## Your Planning Question

Which error paths need new test coverage given the catch block changes? Specifically:

1. **wacz.js TSA error path** — verify that `timestampStatus: 'error'` is set and logged when TSA fails
2. **signing.js key validation failure** — verify logging when key import fails
3. **The `timestampStatus` rename** from `'absent'` to `'skipped'` — which existing tests assert on the old value and need updating?
4. **log.js fallback behavior** — is this testable? Should it be?
5. **consent.js top-level catch** — verify that `_error` field is populated
6. **Verification API response** — verify that `timestampStatus` field is surfaced
7. **cdxj.js toSurt catch** — does the URL parse fallback have test coverage?

Review the existing test files and identify gaps. For each gap, describe what a test should verify (not the full test code — just the test case description and assertion).

## Context

Working directory: /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario/fail-loudly-2

Test files to review:
- `test/wacz.test.js`
- `test/capture.test.js`
- `test/verify.test.js`
- `test/cdxj.test.js`
- `test/signing.test.js`
- `test/consent.test.js`
- Any other test files in `test/`

The project uses vitest. Check `package.json` for test configuration.

CLAUDE.md principle: "Test the real boundaries" — unit tests with mocked renderers are fine for orchestration logic, but integration tests must exercise real external boundaries.

## Instructions

1. Read all test files in `test/`
2. Read `package.json` for test config
3. Cross-reference each catch block fix with existing test coverage
4. Identify gaps and recommend test cases
5. Return your contribution

## Domain Plan Contribution format:

### Recommendations
### Proposed Tasks
### Risks and Concerns
### Additional Agents Needed

Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-XVBmSU/fail-loudly-2/phase2-test-minion.md
