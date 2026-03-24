---
task: Simplify capture access model — remove share tokens, auth-gate list only (Issue #169)
date: 2026-03-24
slug: simplify-capture-access-model
mode: execution
source-issue: 169
task-count: 4
gate-count: 0
compaction-events: 1
---

## Summary

Simplified the WRL capture access model by removing tenant auth from individual capture endpoints and eliminating the share token system entirely. The access model went from three paths (tenant auth, share token, public WACZ) to two (tenant auth for create/list, public for individual captures). Deleted ~500 lines of code and tests (share-tokens.js, share-token.test.js), added a D1 migration to drop the share_tokens table, updated the CLI verify package, and rewrote documentation across 6 files. Net result: fewer lines of code, simpler security model, unblocked public verify page and CLI verifier. 3 commits, 15+ files changed.

## Original Prompt

GitHub Issue #169: Simplify capture access model. Phase 0062 added tenant auth to all capture GET endpoints, which broke the public verify page and CLI verifier. Capture IDs have 128 bits of entropy (cap_ + 32 hex) — they are effectively capability tokens. Adding auth on top is redundant. Share tokens are also redundant. Changes: auth gate only on GET /v1/captures (list), remove auth from individual capture access, remove share token system, remove share token cron cleanup, update SECURITY.md, OpenAPI spec, fix verify-page E2E test. Subsumes #162 (WACZ public access) and partially addresses #167 (verify page rendering).

## Key Design Decisions

1. **Public access via null-check over synthetic auth objects** — If `env._captureAuth` is unset, serve publicly; if set, enforce tenant isolation. No synthetic "public" auth context needed. Simpler, clearer.
2. **Deploy code + migration together over staged deployment** — After code change, share_tokens table is unused. Old `?token=` URLs keep working because endpoints are now public. Simpler, fewer ops steps.
3. **Defer all security recommendations over including them** — Rate limiting, X-Robots-Tag, error field audit, ID generation change all deferred. This phase removes code; adding new defensive code contradicts the goal.
4. **Remove shareTokenFromUrl entirely over keeping dead code** — Dead code contradicts YAGNI. Trivially recoverable from git history.
5. **Cache-Control `no-store` over `private, no-store`** — Responses are no longer per-tenant. `private` is misleading for public endpoints.

## Phases

### Phase 1: Meta-Plan
Selected 6 specialists: security-minion (capability token model assessment), test-minion (test migration strategy), api-spec-minion (OpenAPI changes), devx-minion (CLI verify changes), software-docs-minion (documentation surfaces), ux-strategy-minion (user journey impact). Excluded: frontend-minion (no UI), data-minion (simple DROP TABLE), observability-minion (no logging changes).

### Phase 2: Specialist Planning
All 6 contributed in parallel. Full consensus that 128-bit IDs provide sufficient entropy against enumeration. Security-minion proposed four defensive additions (rate limiting, robots tag, error audit, CSPRNG IDs) — all deferred in synthesis as separate concerns.

### Phase 3: Synthesis
4-task plan with 0 approval gates. Task 1 (auth rewrite + tests, security-minion) blocks Task 2 (test updates, test-minion). Task 3 (CLI verify, devx-minion) and Task 4 (docs, software-docs-minion) are independent.

### Phase 3.5: Architecture Review
5 mandatory reviewers: security-minion (ADVISE — 4 deferred items), test-minion (APPROVE), ux-strategy-minion (APPROVE), lucy (ADVISE — evolution log reminder), margo (APPROVE — noted artifact rate limiter scope preservation).

### Phase 4: Execution
4 tasks across 2 execution batches:

| Task | Agent | Deliverable |
|------|-------|-------------|
| 1. Auth rewrite + share token removal | security-minion | src/index.js, migrations/0013, deleted share-tokens.js + tests |
| 2. Test updates | test-minion | No-op (Task 1 agent covered test changes) |
| 3. CLI verify cleanup | devx-minion | packages/verify/lib/key-resolver.js, tests, README |
| 4. Documentation | software-docs-minion | SECURITY.md, README, openapi.yaml, site content |

### Phase 5: Code Review
3 reviewers. 3 APPROVE, 0 BLOCK. Findings (all NIT/ADVISE, no auto-fixes needed):
- NIT: handleListCaptures destructures captureAuth without null guard (safe — auth gate precedes it)
- ADVISE: No test for bad-credentials-on-public-endpoint → 401 (deferred)
- ADVISE: Rate limiting not applied to metadata/status endpoints (deferred per YAGNI)

### Phase 6: Tests
Worker: 48 files, 1152 tests passed (net ~46 fewer tests — all removed tests covered deleted behavior). Verify CLI: 139 tests passed. Zero share token references remaining in src/, test/, packages/verify/.

### Phase 8: Documentation
Phase 8a assessment: all documentation surfaces covered by Task 4. No additional documentation needed.

## Verification

Verification: all checks passed. Code review 3 APPROVE, 1152 + 139 tests pass, docs updated by Task 4.

## Agent Contributions

### Planning (Phase 2)
- **security-minion**: 128-bit entropy assessment, capability token model validation, four deferred defensive recommendations
- **test-minion**: Test migration strategy (flip 401→200, delete share token blocks, remove cross-tenant tests)
- **api-spec-minion**: OpenAPI version bump, share scheme/endpoint removal, security requirement updates
- **devx-minion**: CLI verify shareTokenFromUrl removal, error message rewrite, README sharing section
- **software-docs-minion**: Documentation surface inventory (SECURITY.md, README, OpenAPI, site content)
- **ux-strategy-minion**: User journey simplification assessment — share URLs becoming direct capture URLs

### Review (Phase 3.5)
- **security-minion**: ADVISE — rate limiting, X-Robots-Tag, error field audit, ID generation (all deferred)
- **test-minion**: APPROVE
- **ux-strategy-minion**: APPROVE
- **lucy**: ADVISE — evolution log completeness, convention adherence
- **margo**: APPROVE — noted artifact rate limiter scope as acceptable existing behavior

## Session Resources

<details>
<summary>Skills Invoked</summary>

- `/nefario` — full orchestration workflow

</details>

<details>
<summary>Working Files</summary>

Companion directory: `docs/history/nefario-reports/2026-03-24-122534-simplify-capture-access-model/`

33 files including: phase 1 meta-plan, phase 2 specialist contributions (6), phase 3 synthesis, phase 3.5 reviews (5), phase 4 execution prompts (4), phase 5 code reviews (3), original prompt.

</details>

<details>
<summary>Compaction Signal</summary>

1 compaction event during session. Report generated from session context + scratch file recovery.

</details>
