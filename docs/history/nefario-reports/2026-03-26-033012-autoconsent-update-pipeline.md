---
task: "Automated autoconsent update pipeline (GitHub Action)"
source-issue: 152
date: 2026-03-26
status: complete
agents: [iac-minion, devx-minion, test-minion, security-minion, ux-strategy-minion, lucy, margo, code-review-minion]
task-count: 2
gate-count: 1
mode: execution
---

## Summary

Created a GitHub Actions workflow and vendoring script that automate the previously manual autoconsent update process. The workflow runs weekly (Monday 06:00 UTC) or on manual dispatch, checks for new `@duckduckgo/autoconsent` versions, regenerates vendor files, runs unit tests and a staging battery, and opens a PR with version diff and test results.

## Original Prompt

Automate the vendored autoconsent update process. Currently the update is manual (npm install → regenerate vendor script → test → PR). A GitHub Action should handle this periodically. Weekly cron + manual dispatch, skip if already on latest, PR includes version diff, test battery results in PR, no PR if tests fail.

## Key Design Decisions

1. **Node ESM over shell for vendoring** — `JSON.stringify()` handles all string escaping edge cases for the 170KB autoconsent bundle. Shell escaping at this scale is fragile. devx-minion proposed, iac-minion concurred after evaluation.

2. **3-job workflow structure** — `update-and-test` (blocking), `battery` (advisory), `open-pr` (writes). Separates failure semantics and permission scopes. Rejected single-job (forces unnecessary staging environment on unit tests) and 4-job (unnecessary granularity).

3. **Battery failures advisory, not blocking** — Deliberately relaxes "No PR if tests fail" criterion. 21 external sites introduce unavoidable flakiness. Unit test failures still block. Battery results included in PR body for human review.

4. **Per-job permission scoping** — `contents: read` at workflow level, `contents: write` only on `open-pr` job. Security-minion advisory, reduces blast radius if npm package is compromised during update step.

5. **Existing staging environment secret** — Reuses `WRL_STAGING_CAPTURE_API_KEY` from the `staging` GitHub environment rather than creating a duplicate repo-level secret. test-minion correctly identified the existing secret.

## Execution

### Task 1: Create vendoring script
- **Agent**: devx-minion (sonnet)
- **Outcome**: `scripts/vendor-autoconsent.js` — 64-line Node ESM script with zero dependencies
- **Files**: `scripts/vendor-autoconsent.js` (new), `package.json` (modified — `vendor:autoconsent` script)
- **Validation**: Script is idempotent — running against current version produces no git diff

### Task 2: Create GitHub Actions workflow
- **Agent**: iac-minion (sonnet)
- **Outcome**: `.github/workflows/autoconsent-update.yml` — 3-job workflow with SHA-pinned actions
- **Files**: `.github/workflows/autoconsent-update.yml` (new)
- **Gate**: Approved — workflow structure, permission scoping, and advisory battery semantics reviewed

## Verification

Verification: code review passed (2 findings auto-fixed), all tests pass (1574 passed, 2 skipped). Doc assessment: 0 items (pure CI automation).

### Code review findings addressed
1. Catch blocks missing error parameter (lucy) — fixed: added `err.message` to error output
2. Semver validation regex missing end anchor (security-minion, code-review-minion, margo) — fixed: anchored with `$`

## Agent Contributions

### Planning (Phase 2)
- **iac-minion**: Workflow architecture — `gh pr create` over third-party actions, SHA pinning convention, stale PR management, secret handling
- **devx-minion**: Vendoring script design — Node ESM with `JSON.stringify()`, idempotency approach, error handling patterns
- **test-minion**: Test strategy — runner sizing (ubuntu-latest sufficient), battery advisory semantics, timeout calibration (12m/15m)

### Review (Phase 3.5)
- **security-minion**: ADVISE — per-job permission scoping, semver validation
- **test-minion**: ADVISE — surface battery deviation from acceptance criteria
- **ux-strategy-minion**: APPROVE — PR body design solid
- **lucy**: ADVISE — correct releases URL, evolution log gap
- **margo**: ADVISE — consider collapsing jobs (rejected for permission scoping reasons)

### Code Review (Phase 5)
- **code-review-minion**: ADVISE — semver regex anchor, stale PR close placement (confirmed intentional)
- **lucy**: ADVISE — catch blocks, 3-job redundancy (noted, not changed)
- **margo**: ADVISE — semver regex, redundancy (accepted trade-off for weekly cadence)

## Working Files

Companion directory: `docs/history/nefario-reports/2026-03-26-033012-autoconsent-update-pipeline/`

## Session Resources

### Skills Invoked
- `/nefario` (this orchestration)

Compaction events: 0

Resolves #152
