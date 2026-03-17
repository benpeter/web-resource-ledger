---
task: "Admin key revocation safety guards"
date: 2026-03-17
mode: execution
task-count: 1
gate-count: 0
agents: security-minion
reviewers: security-minion, test-minion, ux-strategy-minion, lucy, margo
compaction-events: 0
---

## Summary

Added two safety guards to DELETE /v1/admin/keys/{keyHash}: a last-admin-key guard that returns 409 when revoking the only admin-scoped key for a tenant, and a self-revocation TODO for future KV-based admin keys. Restructured handleAdminRevokeKey with a pre-flight read pattern. 6 new tests, 581 total passing.

## Original Prompt

Implement two safety guards for DELETE /v1/admin/keys/{keyHash}: (1) self-revocation guard as TODO only (ADMIN_KEY has no keyHash), (2) last-admin-key guard returning 409 when revoking the last admin-scoped key for a tenant.

## Key Design Decisions

1. **Tenant-scoped guard, not global** -- admin keys for tenant-b do not satisfy tenant-a's guard. Maintains tenant isolation invariant.

2. **Skip guard for already-revoked keys** -- idempotent DELETE returns 200 without running the guard. The guard prevents state transitions, not re-affirmation of existing state.

3. **Race condition accepted** -- concurrent DELETEs could both pass the guard. Risk score 1/25: ADMIN_KEY env var prevents actual lockout. Documented in code comment.

4. **Severity 3 for guard rejection** -- info-level, not warn. The guard protects a future capability (admin-scoped KV keys are currently inert for auth).

## Phases

### Phase 1: Meta-Plan
Selected 2 specialists: api-design-minion (409 semantics) and security-minion (race condition, self-revocation assessment).

### Phase 2: Specialist Planning (2 agents)
api-design-minion resolved three edge cases: tenant-scoped, standard 409 via problemResponse, skip guard for already-revoked. security-minion calculated race condition risk at 1/25 and confirmed TODO is correct for self-revocation.

### Phase 3: Synthesis
Single task, no gates. Pre-flight read pattern with 6 tests.

### Phase 3.5: Architecture Review (5 reviewers)
5 mandatory, 0 discretionary. All 5 APPROVE, 0 ADVISE, 0 BLOCK.

### Phase 4: Execution
security-minion on sonnet. Restructured handleAdminRevokeKey, added 6 tests. 581/581 pass.

### Phase 5-8
Skipped (all approvals pre-given, 2-file change).

## Verification

Verification: all 581 tests pass.

## Agent Contributions

| Agent | Phase | Key Contribution |
|-------|-------|-----------------|
| api-design-minion | planning | Tenant-scoped guard, 409 semantics, idempotent short-circuit |
| security-minion | planning + execution | Race condition assessment (1/25), self-revocation TODO, implementation |

## Session Resources

<details>
<summary>Skills Invoked</summary>

- `/nefario` -- orchestration

</details>

## Working Files

[`docs/history/nefario-reports/2026-03-17-144012-admin-revoke-safety-guards/`](./2026-03-17-144012-admin-revoke-safety-guards/) (10 files)
