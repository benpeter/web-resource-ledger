---
task: "R31: Capture metering to Stripe pipeline"
date: 2026-03-23
source-issue: 108
slug: capture-metering-stripe-pipeline
mode: execution
task-count: 3
gate-count: 3
skills-used: []
---

## Summary

Implemented the capture metering to Stripe pipeline (Issue #108): a graduated
pricing module defines the 4-tier volume pricing that mirrors Stripe Dashboard
config, an hourly batch reporter queries D1 for unreported usage and submits
delta meter events to Stripe with idempotency keys, and the GET /v1/account/usage
endpoint now returns a `billing` sub-object with current charges, active tier,
tier table, and invoice threshold status. All 1125 tests pass (32 new tests
across 4 files). 811 lines added across 9 files.

## Original Prompt

GitHub Issue #108: R31: Capture metering to Stripe pipeline

Usage counters from WRL's metering system feed into Stripe's single capture
meter, producing accurate invoices at period end. Tenants see their consumption
and current charges on a dashboard. Volume discounts apply automatically at
higher usage levels. Invoices are only generated when the EUR 5 threshold is reached.

## Key Design Decisions

### Storage: Columns on existing table vs new table
**Chosen**: Add `reported_capture_count` and `last_reported_at` to `usage_counters`.
**Over**: New `meter_reporting_log` table (iac-minion).
**Why**: Same composite PK (tenant_id, period), no JOIN needed, KISS.

### Free-tier handling: Report all vs deduct 200
**Chosen**: Report ALL captures to Stripe; graduated pricing handles free tier.
**Over**: Deduct first 200 in WRL code (iac-minion).
**Why**: Single source of truth in Stripe. Reconciliation simplifies to
`capture_count == aggregated_value`. Free tier changes require only Stripe config.

### Idempotency key format
**Chosen**: `wrl-meter:{tenantId}:{period}:{captureCount}` (state-derived, prefixed).
**Over**: `wrl:{tenantId}:{period}:{hourTimestamp}:{fromCount}-{toCount}` (iac-minion).
**Why**: Deterministic, human-readable, naturally deduplicates across retries.

## Phases

### Phase 1-2: Planning
Consulted 4 specialists: data-minion (schema + pricing), iac-minion (cron + Stripe
integration), api-design-minion (dashboard response), test-minion (coverage strategy).
3 conflicts identified: storage approach, free-tier handling, idempotency format.

### Phase 3: Synthesis
Resolved all 3 conflicts favoring simplicity and single-source-of-truth principles.
Produced 3-task execution plan with 3 approval gates.

### Phase 3.5: Architecture Review
7 reviewers (5 mandatory + 2 discretionary): security-minion, test-minion,
ux-strategy-minion, lucy, margo, observability-minion, gru. All ADVISE, no BLOCK.
Incorporated: prefixed idempotency key, dropped projectedCharges/currentProgress,
simplified month-boundary query, fixed Stripe 200 vs 409 dedup behavior, added
HTTP status to failure logs.

### Phase 4: Execution
3 tasks executed sequentially (each depended on prior):
1. **data-minion**: pricing.js + migration 0008 + pricing tests (16 tests)
2. **api-design-minion**: billing sub-object on GET /v1/account/usage (6 tests)
3. **iac-minion**: meter-reporter.js + cron wiring + reporting tests (10 tests)

All 3 gates approved. All tests passed on first run for each task.

### Phase 5: Code Review
3 reviewers (code-review-minion, lucy, margo). All ADVISE, no BLOCK.
Common finding: `computeBillableDelta` is exported/tested but never imported
by production code. Accepted as-is (documented contract, zero cost).

### Phase 6: Tests
Full suite: 47 files, 1125 tests passed, 2 skipped (pre-existing). No regressions.

### Phase 8: Documentation
Assessment: 0 MUST, 2 SHOULD (API reference for billing response fields), 2 COULD.
Doc debt: 2 SHOULD items deferred (OpenAPI spec updates for billing response shape).

## Execution

### Task 1: Graduated pricing module and metering migration
**Agent**: data-minion
**Files**:
- `src/pricing.js` (new, +85 lines) — VOLUME_TIERS, INVOICE_THRESHOLD_EUR,
  calculateCharges(), computeBillableDelta()
- `migrations/0008_metering.sql` (new, +6 lines) — reported_capture_count,
  last_reported_at columns on usage_counters
- `test/pricing.test.js` (new, +53 lines) — 16 parameterized tests

### Task 2: Billing dashboard endpoint
**Agent**: api-design-minion
**Files**:
- `src/account.js` (modified, +17 lines) — billing sub-object with
  currentCharges, tier, tiers, invoiceThreshold
- `test/account-usage.test.js` (modified, +89 lines) — 6 new billing tests

### Task 3: Hourly meter event reporter
**Agent**: iac-minion
**Files**:
- `src/meter-reporter.js` (new, +119 lines) — reportPendingMeterEvents(),
  per-tenant error isolation, Coralogix logging
- `src/index.js` (modified, +4 lines) — hourly cron guard with ctx.waitUntil
- `test/meter-reporting.test.js` (new, +303 lines) — 8 unit tests
- `test/meter-batch.test.js` (new, +137 lines) — 2 integration tests

## Verification

Verification: code review passed (3 ADVISE, 0 BLOCK), all 1125 tests pass.
Doc debt: 2 SHOULD items deferred (API reference updates).

## Agent Contributions

### Planning Agents (Phase 2)
- **data-minion**: Designed graduated pricing model and D1 schema extension.
  Recommended columns on existing table over new table.
- **iac-minion**: Proposed Stripe meter event integration architecture.
  Recommended separate table and time-based idempotency (overridden in synthesis).
- **api-design-minion**: Designed billing response shape for dashboard endpoint.
  Recommended including tier table for client-side rendering.
- **test-minion**: Defined test coverage strategy with parameterized pricing tests
  and Stripe mock patterns.

### Review Agents (Phase 3.5)
- **security-minion**: ADVISE — prefix idempotency keys with `wrl-meter:`
- **test-minion**: ADVISE — Stripe returns 200 for duplicate identifier, not 409
- **ux-strategy-minion**: ADVISE — drop projectedCharges and currentProgress
- **lucy**: ADVISE — invoice threshold is Stripe-side config, document not code
- **margo**: ADVISE — simplify month-boundary to IN clause
- **observability-minion**: ADVISE — add httpStatus and stripeErrorType to failure logs
- **gru**: ADVISE — confirmed Stripe meter event 200 dedup behavior

### Code Review Agents (Phase 5)
- **code-review-minion**: ADVISE — computeBillableDelta dead code, test coverage gaps
- **lucy**: ADVISE — computeBillableDelta dead code, no meter failure alert
- **margo**: ADVISE — computeBillableDelta dead code, full tier table in responses

## Documentation Debt

| Item | Priority | Owner |
|------|----------|-------|
| OpenAPI spec update: billing response shape on GET /v1/account/usage | SHOULD | software-docs-minion |
| API reference: volume tier definitions and invoice threshold fields | SHOULD | software-docs-minion |

<details>
<summary>Session Resources</summary>

### Skills Invoked
- /nefario (this orchestration)

### Compaction Events
2 compaction events during session.

### Working Files
Companion directory: `docs/history/nefario-reports/2026-03-23-155423-capture-metering-stripe-pipeline/`

Files:
- prompt.md — original issue description
- phase1-metaplan-prompt.md, phase1-metaplan.md — meta-plan
- phase2-*-prompt.md, phase2-*.md — specialist planning (4 agents)
- phase3-synthesis-prompt.md, phase3-synthesis.md — execution plan
- phase3.5-*-prompt.md, phase3.5-*.md — architecture review (7 agents)
- phase4-*-prompt.md — execution agent prompts (3 tasks)
- phase5-*.md — code review verdicts (3 reviewers)
- phase6-test-results.md — full test suite results
- phase8-checklist.md — documentation assessment

</details>
