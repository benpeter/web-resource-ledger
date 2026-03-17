---
task: "R12: Per-tenant API keys and tenant isolation"
date: 2026-03-17
slug: r12-per-tenant-api-keys
mode: execution
source-issue: 42
task-count: 6
gate-count: 2
compaction-events: 0
---

## Summary

Implemented R12 per-tenant API keys: KV-based multi-path authentication (KV lookup → ADMIN_KEY → CAPTURE_API_KEY fallback), admin API for key provisioning (POST/GET/DELETE /v1/admin/keys), scope enforcement on capture/list endpoints, observability enrichment (keyName/reason on 19+ log events), and a migration runbook. 15 files changed (1 new), 577 tests pass. Code review caught a field name mismatch and missing tests before PR.

## Original Prompt

Issue #42: R12 Per-tenant API keys and tenant isolation. Design decisions settled by advisory 2026-03-17. Implementation with edge-minion, iac-minion, and security-minion on the planning team. Full post-execution phases. Autonomous execution with gates deferred to gru/lucy.

## Key Design Decisions

1. **6-step auth flow**: KV lookup → ADMIN_KEY → CAPTURE_API_KEY → reject. Revoked KV keys terminate immediately (never fall through). KV errors return 500 (fail closed).
2. **DELETE returns 200 with confirmation** (not 204). Operator safety over REST purism.
3. **scope_violation folded into auth_fail** with reason field. Simpler, cheaper, existing queries auto-capture.
4. **Full 64-char hash as identifier** everywhere. Name field for human readability.
5. **name field required** on key creation. Prevents anonymous-hash revocation guesswork.
6. **Rate-limit-before-auth on admin endpoints** (opposite of capture). Throttles brute-force.

## Phases

### Phase 1: Meta-Plan
8 specialists identified for implementation planning. Team auto-approved (user directive). Required agents: security-minion, edge-minion, iac-minion. Additional: api-spec-minion, observability-minion, test-minion, ux-strategy-minion, software-docs-minion.

### Phase 2: Specialist Planning
8 agents ran in parallel. Key outcomes: security-minion designed the 6-step auth flow with revocation invariant; edge-minion designed admin module structure; iac-minion designed migration runbook; ux-strategy-minion won required name field and DELETE 200.

### Phase 3: Synthesis
5 conflicts resolved. 6-task execution plan produced in 2 batches. 2 approval gates (auto-approved).

### Phase 3.5: Architecture Review
6 reviewers (5 mandatory + observability-minion). 3 APPROVE, 3 ADVISE. ADVISE notes: rate limiter null guard, auth.test.js update, admin.key_list event. All incorporated.

### Phase 4: Execution
Batch 1 (parallel): auth rewrite, infrastructure, OpenAPI, documentation. Batch 2 (after auth): admin module, scope enforcement. All 6 tasks completed successfully.

### Phase 5: Code Review
3 reviewers. 1 BLOCK finding (code-review-minion: name/keyName field mismatch), 1 BLOCK (lucy: zero test coverage + silent catch blocks), 1 ADVISE (margo: DRY opportunity). Fixes applied: field name corrected, catch blocks logged, 79 tests written.

### Phase 6: Tests
577/577 pass (24 files). OpenAPI validates clean.

### Phase 8: Documentation
Assessment: all items addressed by execution tasks. No documentation debt.

## Execution

| Task | Agent | Files | Status |
|------|-------|-------|--------|
| T1: Auth rewrite | auth-agent | src/auth.js | Complete |
| T2: Admin module | admin-agent | src/admin.js (new), src/index.js, src/rate-limits.js | Complete |
| T3: Scope enforcement | scope-agent | src/index.js, src/capture.js | Complete |
| T4: Infrastructure | infra-agent | wrangler.toml, vitest.config.js | Complete |
| T5: OpenAPI spec | spec-agent | openapi.yaml | Complete |
| T6: Documentation | docs-agent | OPERATIONS.md, README.md, CONTRIBUTING.md | Complete |

## Decisions

### Gate 1: Auth module rewrite (auto-approved)
Auth module with 6-step flow, scope enforcement helper, hash utility. Design settled by advisory, security-minion's exact ordering implemented. Confidence: HIGH.

### Gate 2: Admin module (auto-approved)
Three admin handlers with tenant isolation, rate-limit-before-auth, self-revocation guard, last-admin-key guard. Confidence: HIGH.

## Verification

Verification: 2 code review findings auto-fixed (name/keyName mismatch, silent catch blocks), 1 test gap filled (79 new tests), all 577 tests pass, docs complete.

## Agent Contributions

| Agent | Phase | Key Contribution |
|-------|-------|-----------------|
| security-minion | planning, review | Auth flow design, revocation invariant, timing-safe analysis |
| edge-minion | planning | Admin module architecture, route structure, rate limiter |
| iac-minion | planning | Migration runbook, wrangler.toml, deployment safety |
| api-spec-minion | planning | OpenAPI schemas, endpoint documentation, version bump |
| observability-minion | planning, review | Log enrichment strategy, admin subsystem, event coverage gaps |
| test-minion | planning, review | 83-case test matrix, auth.test.js update requirement |
| ux-strategy-minion | planning, review | Required name field, DELETE 200, error message clarity |
| software-docs-minion | planning | Migration runbook sections, README renumbering, cross-ref hazard |
| lucy | review (2x) | CLAUDE.md compliance, zero-test-coverage BLOCK, silent-catch BLOCK |
| margo | review (2x) | YAGNI validation, DRY advisory, proportionality check |
| code-review-minion | review | name/keyName field mismatch BLOCK |

## Session Resources

<details>
<summary>Skills Invoked</summary>

- `/nefario` (this orchestration)

</details>

<details>
<summary>Compaction</summary>

0 compaction events during this session.

</details>

## Working Files

[`docs/history/nefario-reports/2026-03-17-032044-r12-per-tenant-api-keys/`](./2026-03-17-032044-r12-per-tenant-api-keys/)

Resolves #42