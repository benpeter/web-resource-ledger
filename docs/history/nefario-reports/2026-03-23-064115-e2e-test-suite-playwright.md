---
task: "Playwright e2e test suite for WRL user journeys"
date: 2026-03-23
source-issue: 105
mode: execution
task-count: 9
gate-count: 1
agents: test-minion, iac-minion
reviewers: security-minion, test-minion, ux-strategy-minion, lucy, margo
compaction-events: 2
---

## Summary

Added a Playwright-based end-to-end test suite with 10 tests across 6 spec files, a CI workflow triggered after staging deploy, and full test infrastructure (global setup/teardown, authenticated fetch helpers, HMAC verification). Tests run sequentially against staging using dynamically provisioned test tenants. The suite validates the complete WRL user journey: capture through download, batch operations, quota enforcement, public verification pages, API key lifecycle, and webhook CRUD with delivery validation.

## Original Prompt

GitHub Issue #105: E2E Test Suite (Playwright)

A Playwright-based end-to-end test suite validates the complete WRL user journey against a running environment. The suite covers signup through verification, batch operations, scheduled captures, webhooks, quota enforcement, and public share links. It runs as a separate CI workflow, catching integration regressions that unit tests miss.

## Key Design Decisions

1. **Webhook receiver: ping-only, no dedicated Worker** -- api-design-minion proposed a dedicated Cloudflare Worker to capture signed payloads. test-minion proposed webhook.site. Margo argued both were over-engineering since the ping endpoint already validates signing and delivery synchronously. Ping-only won.

2. **OAuth skipped entirely** -- security-minion proposed `POST /v1/admin/sessions` for test auth. Margo flagged it as YAGNI (test-only production code). All tests use API key auth. OAuth is unit-tested via `_githubFetch` injection.

3. **Three tests replaced from original issue** -- Scheduled captures (feature doesn't exist), share link (no generation API; reframed as public verification), OAuth signup (session auth requirement). Key rotation via admin API added instead.

4. **Directory: `test/e2e/` not `tests/e2e/`** -- Lucy caught inconsistency with existing `test/` convention during architecture review.

5. **Sequential execution (`workers: 1`)** -- Shared staging with real D1/R2/KV state. Parallel risks rate limit contention (5 admin req/60s) and key rotation modifies auth state. Sequential adds ~1 minute.

6. **Admin key excluded from state file** -- security-minion advisory. Admin key has scope over all staging tenants. Tests read it from `process.env.E2E_ADMIN_KEY` directly.

7. **WACZ download in golden path** -- Lucy identified that issue criterion "download WACZ" wasn't tested. Added as step 7 of capture-verify test.

8. **Task 2/3 deduplication** -- Both originally tested `/v1/verify/`. Lucy and margo flagged overlap. Task 2 (golden path) stops at WACZ download; Task 3 owns all verify assertions.

## Phases

### Phase 1-2: Planning (5 specialists)

Meta-plan consulted test-minion, api-design-minion, security-minion, iac-minion, and devx-minion (added via ux-strategy-minion recommendation after initial plan proposed different team). Lucy adjusted team at gate.

- **test-minion**: Proposed 9-task breakdown with global setup/teardown, sequential execution, priority-based test ordering (P0-P3).
- **api-design-minion**: Identified webhook HMAC gap (ping doesn't echo signature), recommended testing error responses.
- **security-minion**: Flagged admin key state file risk, proposed separate low-quota tenant for quota isolation.
- **iac-minion**: Designed `workflow_run` CI trigger chained after staging deploy, SHA-pinned actions.
- **devx-minion**: Comprehensive README with env vars, troubleshooting, spec divergence documentation.

### Phase 3: Synthesis

9 tasks produced with 1 approval gate after Task 1 (infrastructure). Tasks grouped by priority: P0 golden path, P1 verification + key rotation, P2 batch + quota, P3 webhooks, then CI workflow and README.

### Phase 3.5: Architecture Review (5 mandatory reviewers)

No discretionary reviewers needed (no UI components, no web-facing runtime code).

- **security-minion**: ADVISE -- admin key handling in state file, CORS on verify endpoint.
- **test-minion**: ADVISE -- `pollUntilComplete` should throw on timeout, not return undefined.
- **ux-strategy-minion**: APPROVE -- test organization follows user journey mental model.
- **lucy**: REQUEST_CHANGES -- `tests/e2e/` should be `test/e2e/`, Task 2/3 verify overlap, WACZ download missing, scheduled capture exclusion undocumented. All fixed in revised synthesis.
- **margo**: APPROVE -- webhook receiver strategy correct, no over-engineering.

### Phase 4: Execution (9 tasks, 1 gate)

| Task | Agent | Deliverable |
|------|-------|-------------|
| 1. Playwright config + infrastructure | test-minion | Config, setup/teardown, helpers, hmac.js |
| 2. Golden path: capture -> verify -> WACZ | test-minion | capture-verify.spec.js |
| 3. Public verification page | test-minion | verify-page.spec.js (3 tests) |
| 4. Key rotation via admin API | test-minion | key-rotation.spec.js (2 tests) |
| 5. Batch capture | test-minion | batch-capture.spec.js |
| 6. Quota enforcement | test-minion | quota-enforcement.spec.js |
| 7. Webhook lifecycle | test-minion | webhook-lifecycle.spec.js (2 tests) |
| 8. CI workflow | iac-minion | .github/workflows/e2e-tests.yml |
| 9. README | test-minion | test/e2e/README.md |

Notable runtime discovery: Task 4 found `/v1/account/keys` requires session auth (cookie), not API key auth. Agent adapted by testing key lifecycle via admin API instead.

## Verification

Code review: 2 BLOCK findings auto-fixed (wrong field name in verify-page.spec.js, misused `test.skip()` in webhook-lifecycle.spec.js), 2 ADVISE noted.
Test listing: 10 tests in 6 files verified.
Documentation: 0 MUST items identified. Phase 8b not needed.

Verification: 2 code review findings auto-fixed, test listing passed.

## Agent Contributions

### Planning Agents

| Agent | Phase | Contribution |
|-------|-------|-------------|
| test-minion | planning | Test architecture, fixture strategy, 9-task breakdown, sequential execution rationale |
| api-design-minion | planning | API contract coverage, webhook HMAC verification gap identification |
| security-minion | planning | Auth model testing, admin key state file risk, tenant isolation strategy |
| iac-minion | planning | CI workflow design, `workflow_run` trigger, artifact strategy |
| devx-minion | planning | Developer experience: README structure, troubleshooting guide |

### Review Agents

| Agent | Phase | Verdict |
|-------|-------|---------|
| security-minion | review | ADVISE (admin key handling, CORS) |
| test-minion | review | ADVISE (poll timeout behavior) |
| ux-strategy-minion | review | APPROVE |
| lucy | review | REQUEST_CHANGES (directory naming, task overlap, missing WACZ download) |
| margo | review | APPROVE |

## Session Resources

<details>
<summary>Skills Invoked</summary>

- `/nefario` -- orchestration

</details>

<details>
<summary>Working Files</summary>

Companion directory: `docs/history/nefario-reports/2026-03-23-064115-e2e-test-suite-playwright/`

Files: 28 scratch files including prompts and outputs for all phases.

</details>

Compaction events: 2
