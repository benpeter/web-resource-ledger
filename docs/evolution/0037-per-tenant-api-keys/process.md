# Process -- 0037 Per-Tenant API Keys

## TL;DR

Eight specialists planned the implementation, nefario synthesized a 6-task execution plan, 6 reviewers validated it, 4 execution agents built it in parallel, and 3 post-execution reviewers caught a field name mismatch and missing tests before PR. Total: 577 tests pass, 15 files changed, zero manual intervention (fully autonomous run triggered by cron poll on issue #70 closure).

## How the team worked

### Phase 1: Meta-plan

Nefario identified 8 specialists for implementation planning. The user had pre-specified that edge-minion, iac-minion, and security-minion must be included. The full team: security-minion (auth design), edge-minion (worker architecture), iac-minion (infrastructure/migration), api-spec-minion (OpenAPI), observability-minion (logging), test-minion (test strategy), ux-strategy-minion (operator journey), software-docs-minion (documentation).

The team was auto-approved per the user's directive to skip all approval gates.

### Phase 2: Specialist Planning (8 agents, parallel)

All 8 specialists ran in parallel. Key contributions:

- **security-minion** designed the 6-step auth flow with the critical revocation invariant: a revoked KV key must never fall through to env-var paths. Also specified KV-error-fail-closed (500, not fallthrough) and the scope enforcement boundary (requireScope in handlers, not in auth.js).

- **edge-minion** designed the admin module file structure (new src/admin.js), route integration pattern (tuples in routes array), and the rate-limit-before-auth ordering for admin endpoints (opposite of capture endpoints -- deliberately asymmetric).

- **iac-minion** designed the migration runbook with explicit separation of PR merge, deploy, and secret provisioning as three distinct events. Flagged premature CAPTURE_API_KEY removal as the highest-consequence operator error.

- **api-spec-minion** proposed 16-char keyId prefix (later rejected in synthesis) and flagged the keyId format as needing security-minion confirmation before spec authoring.

- **observability-minion** found 19+ existing log calls needing keyName enrichment, recommended folding scope_violation into auth_fail (later adopted), and identified a pre-existing gap: TSA failure events missing tenantId.

- **test-minion** produced an 83-test-case matrix and identified the critical dependency: auth.test.js assertions on the old return shape would break.

- **ux-strategy-minion** argued successfully for required `name` field and DELETE 200 with confirmation body. Both resolved in their favor during synthesis.

- **software-docs-minion** identified the cross-reference hazard: README step renumbering breaks OPERATIONS.md anchor links.

No specialists recommended additional agents.

### Phase 3: Synthesis

Nefario resolved 5 conflicts:

1. **DELETE 204 vs 200**: ux-strategy won (operator safety > REST purism). api-spec-minion's position was clean but a silent 204 on a fat-fingered hash is a security gap disguised as a UX gap.

2. **scope_violation event shape**: observability-minion won (fold into auth_fail with reason field). Simpler, cheaper, existing queries auto-capture.

3. **keyId format**: security-minion won (full 64-char hash everywhere). api-spec-minion's 16-char prefix had birthday-paradox collision risk. Name field handles human readability.

4. **name field**: ux-strategy won (required). Without it, the key list is anonymous hashes. The YAGNI argument was explicitly rejected -- a single string field preventing operational errors is below the YAGNI threshold.

5. **lastUsedAt**: YAGNI won (deferred). KV write per request is genuinely premature at 2-3 tenants.

### Phase 3.5: Architecture Review (6 reviewers)

5 mandatory + 1 discretionary (observability-minion). Results:

- **security-minion**: ADVISE. Caught that ADMIN_RATE_LIMITER null guard was missing from admin handler specs. Required fix: add `if (env.ADMIN_RATE_LIMITER)` guard matching capture endpoint pattern.

- **test-minion**: ADVISE. Flagged that Task 1 rewrites auth return shape but doesn't update auth.test.js. Recommended adding test update to Task 1 deliverables.

- **ux-strategy-minion**: APPROVE. Confirmed operator journey is coherent. Noted tenantId field's conditional behavior needs documentation.

- **lucy**: APPROVE. Plan matches issue #42 requirements. No scope creep. Noted evolution log is nefario's wrap-up responsibility.

- **margo**: APPROVE. Plan is proportional. YAGNI applied in 5 documented places. Zero new dependencies.

- **observability-minion**: ADVISE. Caught missing admin.key_list event (list endpoint had no success log) and missing auth fail logging in revoke handler.

All ADVISE notes incorporated into task prompts.

### Phase 4: Execution (2 batches, 6 tasks, 4 agents)

**Batch 1** (parallel, no dependencies):
- auth-agent → Task 1 (auth.js rewrite)
- infra-agent → Task 4 (wrangler.toml, vitest.config.js)
- spec-agent → Task 5 (openapi.yaml)
- docs-agent → Task 6 (OPERATIONS.md, README.md, CONTRIBUTING.md)

infra-agent finished first (~2 min), then auth-agent (~3 min), then docs-agent (~5 min), then spec-agent (~7 min).

**Batch 2** (parallel, blocked by Task 1):
- admin-agent → Task 2 (admin.js, routes, rate limits)
- scope-agent → Task 3 (scope enforcement, logging enrichment)

admin-agent finished first (~5 min), scope-agent finished last (~7 min) with all 510 pre-existing tests passing (scope-agent also fixed test call sites for the new keyName parameter).

### Phase 5: Code Review (3 reviewers)

Three BLOCK-level findings caught:

1. **code-review-minion (BLOCK)**: `src/auth.js` line 166 reads `record.keyName` but `src/admin.js` stores the field as `name`. Every KV-authenticated request would silently use a truncated hash instead of the human-readable key name. Fix: change to `record.name`.

2. **lucy (BLOCK)**: Zero test coverage for all new R12 code. No admin.test.js. auth.test.js only tests legacy path. 400 lines of security-critical code with no automated verification. Violates CLAUDE.md testing requirements.

3. **lucy (BLOCK)**: 5 silent catch blocks in admin.js. CLAUDE.md forbids silent catches.

Two fix agents spawned:
- Fix agent 1: corrected name/keyName mismatch + added console.warn to all 5 catch blocks
- Fix agent 2: rewrote auth.test.js (39 tests) + created admin.test.js (40 tests)

### Phase 6: Tests

577/577 pass across 24 test files. OpenAPI spec validates clean. No new failures, no regressions.

### What the human changed

Nothing. This was a fully autonomous run triggered by a cron poll. The user set up the orchestration with:
- `/nefario #42` with directives to skip all gates, defer to gru/lucy, auto-create PR
- Cron poll on issue #70 closure (dependency gate)
- After #70 closed, 5-minute delay, then automatic execution

### What the human chose NOT to intervene on

The user explicitly delegated all approval gates to the agent team. Gru and lucy auto-approved the plan. All conflict resolutions were made by nefario's synthesis without human input.

### Where to read more

- Advisory report: `docs/history/nefario-reports/2026-03-17-020022-per-tenant-api-keys-isolation.md`
- Specialist contributions: `docs/history/nefario-reports/2026-03-17-032044-r12-per-tenant-api-keys/`
- Issue #42: https://github.com/benpeter/web-resource-ledger/issues/42